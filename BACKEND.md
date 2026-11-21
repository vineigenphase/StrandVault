# BACKEND.md: StrandVault

> Source of truth for env, database, catalogue, API routes, recs and RICO. Lane **BE** owns everything here unless marked otherwise.
> Read `CLAUDE.md` first. Types come from `src/lib/types.ts` (frozen after T0). Wire types for the routes below are appended to `types.ts` in T0 (§5.0) and freeze with it.

---

## 1. Principles

1. **The demo never needs the network for film data.** Films come from `public/catalogue.json`. Supabase and OpenAI only add social and AI layers on top, and both can die without breaking the demo.
2. **Never a red screen.** Every route catches everything and returns `200` with fallback data where one exists. Wrappers in `src/lib/api.ts` never throw: they time out, catch, and return a fallback.
3. **Secrets stay server-side.** Service-role and OpenAI clients live in `src/lib/server/*`, and every file there starts with `import 'server-only'`.
4. **Writes go through API routes.** The browser uses the anon key **only** for Realtime (presence and broadcast). All table reads and writes go through route handlers with the service-role client. RLS is on with no anon policies.
5. **Store code** defaults to `KCL` (`NEXT_PUBLIC_STORE_CODE`). Every route takes an optional `code`.

---

## 2. Environment

`.env.local` locally, mirrored in Vercel (Production + Preview). `.env.example` lists the names only.

| Var | Where | Used by | Required for demo? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | browser + server | `lib/supabase.ts`, `lib/server/supabase.ts` | yes (multiplayer) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser | Realtime presence + broadcast | yes (multiplayer) |
| `NEXT_PUBLIC_STORE_CODE` | browser + server | default store channel, default `KCL` | no |
| `NEXT_PUBLIC_SITE_URL` | browser | QR code target (`{url}/join?code=KCL`) on the host screen | yes (QR) |
| `SUPABASE_SERVICE_ROLE_KEY` | **server only** | API routes, `seed-personas.ts` | yes (profiles, faves) |
| `OPENAI_API_KEY` | **server only** | `/api/rico` | no, falls back to scripted RICO |
| `OPENAI_MODEL` | **server only** | `/api/rico`. Use a small, fast model with structured outputs. Set it explicitly | no |
| `TMDB_TOKEN` | **seed script only** | `scripts/seed-catalogue.ts` (v4 read token, Bearer) | no (catalogue is committed) |
| `WATCHMODE_KEY` | **seed script only** | `scripts/seed-catalogue.ts` for deep watch links | no |

Rules: nothing without `NEXT_PUBLIC_` may be imported by a client component. `TMDB_TOKEN` and `WATCHMODE_KEY` are never read at runtime. If a server var is missing, the route degrades to its fallback and logs one `console.warn`.

---

## 3. Supabase

### 3.1 Schema (`supabase/schema.sql`)

Run it in the Supabase SQL editor. It's idempotent.

```sql
create extension if not exists pgcrypto;

create table if not exists profiles (
  id          uuid primary key default gen_random_uuid(),
  store_code  text not null default 'KCL',
  name        text not null check (char_length(name) between 1 and 12),
  look        jsonb not null,                 -- Look
  fav_id      integer,                        -- #1 favourite (TMDB id), mirrors PresenceState.favId
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists profiles_store_idx on profiles (store_code, last_seen desc);

create table if not exists favourites (
  user_id    uuid not null references profiles(id) on delete cascade,
  film_id    integer not null,
  created_at timestamptz not null default now(),
  primary key (user_id, film_id)
);
create index if not exists favourites_film_idx on favourites (film_id);

create table if not exists events (
  id         bigserial primary key,
  store_code text not null default 'KCL',
  user_id    uuid references profiles(id) on delete cascade,
  kind       text not null check (kind in ('open','watch','rico')),
  film_id    integer,
  provider   text,                            -- ProviderId for 'watch'
  meta       jsonb,                           -- e.g. { source } for open, { mood, fallback } for rico
  created_at timestamptz not null default now()
);
create index if not exists events_user_idx on events (user_id, created_at desc);

alter table profiles   enable row level security;
alter table favourites enable row level security;
alter table events     enable row level security;
-- No anon policies on purpose: all table access goes through API routes with the service role.
```

### 3.2 Realtime (lane GAME implements, BE documents)

- Channel `store:{code}` created with `{ config: { presence: { key: userId }, broadcast: { self: false } } }`.
- Presence payload is `PresenceState`. Re-`track()` whenever `favId`, `look` or `scene` changes.
- Broadcast uses the single event name **`'b'`** with a `Broadcast` payload. Movement is `move` at 10 Hz while moving, plus one stop message.
- No Postgres-changes subscriptions. Realtime needs no tables.

### 3.3 Clients

- `src/lib/supabase.ts` (browser): `export const supabase = createClient(URL, ANON_KEY)`. If either var is missing, export `null`; callers treat `null` as "offline/solo mode".
- `src/lib/server/supabase.ts`: `import 'server-only'`, plus `export function db()` returning a service-role client (`auth: { persistSession: false }`), or `null` if the env is missing.

### 3.4 Demo personas (`scripts/seed-personas.ts`)

`npm run seed:personas` upserts 6 demo profiles into store `KCL` with `is_demo = true`, fixed UUIDs (so re-runs are idempotent), distinct looks, a `fav_id` each, and 4–8 favourites each spread across aisles. At least two personas share a favourite so Staff Picks shows stacking. Names: `MAYA, DEV, JONNO, PRIYA, SAM, LOU`. Film IDs must exist in `catalogue.json`. `npc.ts` (GAME) reuses these IDs and looks.

---

## 4. Catalogue

### 4.1 File: `public/catalogue.json`

```ts
interface CatalogueFile { generatedAt: string; region: 'GB'; films: Film[] }
```

Target size: **~340 films** (40 per aisle + ~20 trending extras), under 1.5 MB. It's committed.

### 4.2 Seed script (`scripts/seed-catalogue.ts`, `npm run seed`)

1. For each aisle, TMDB `discover/movie` (region GB, `vote_count.gte=500`, sorted by popularity), mapped by genre:

   | Aisle | TMDB genres | Notes |
   |---|---|---|
   | action | 28, 12, 53 | |
   | comedy | 35 | |
   | horror | 27 | |
   | scifi | 878, 14 | |
   | drama | 18, 80 | |
   | romance | 10749 | |
   | animated | 16 | |
   | cult | any | `primary_release_date.lte=1989-12-31`, sorted by vote count |

   **Aisle assignment** (one aisle per film, first match wins): year ≤ 1989 → `cult`, then `animated > horror > scifi > comedy > romance > action > drama`. Dedupe by id.
2. `trending/movie/week`: mark `trending: true` and add any missing films (aisle by the rule above).
3. Per film, `movie/{id}?append_to_response=credits,videos,watch/providers`: runtime, tagline, top-5 cast, director, first YouTube trailer key, and **GB** providers (flatrate → `stream`, free/ads → `free`, rent, buy).
4. Provider URLs: if `WATCHMODE_KEY` is set, look up Watchmode `title/{tmdb}/sources?regions=GB` and use `web_url` per provider. Otherwise leave `url` empty and let `watchUrl()` resolve it (§4.4).
5. Posters: `https://image.tmdb.org/t/p/w342{path}`, backdrop `w1280`. With `--images`, download to `public/posters/{id}.jpg` and `{id}-bd.jpg` and rewrite the paths to `/posters/...`.
6. Throttle to about 30 req/s. Retry 429s with backoff. Drop films with no poster.

Provider ID map (TMDB provider_id → `ProviderId`): 8 Netflix → `netflix`, 9/119 Prime → `prime`, 337 Disney+ → `disney`, 2/350 Apple → `apple`, 39/591 NOW → `now`, 38 BBC iPlayer → `iplayer`, 103 Channel 4 → `channel4`, 531/582 Paramount+ → `paramount`, everything else → `other` (keep the name). Store the logo as `https://image.tmdb.org/t/p/w92{logo_path}`.

### 4.3 `src/lib/catalogue.ts`

```ts
export interface Catalogue {
  films: Film[];
  byId: Map<number, Film>;
  byAisle: Record<Aisle, Film[]>;   // sorted by rating*log10(votes) desc
  trending: Film[];
  search(q: string, limit?: number): Film[];  // case-insensitive title prefix, then substring
}
export function loadCatalogue(): Promise<Catalogue>;   // client: fetch('/catalogue.json') once, memoised
export function getCatalogueSync(): Catalogue | null;  // after load
export function catalogueServer(): Catalogue;          // server: imports the JSON, memoised
```

If the fetch fails, fall back to `mocks.ts` films so nothing renders blank.

### 4.4 `src/lib/links.ts`: `watchUrl(film, provider): string`

1. If `provider.url` is a deep link (Watchmode `web_url`), return it.
2. Otherwise use a provider search URL with the title encoded:
   - netflix `https://www.netflix.com/search?q=`
   - prime `https://www.amazon.co.uk/s?i=instant-video&k=`
   - disney `https://www.disneyplus.com/search?q=`
   - apple `https://tv.apple.com/search?term=`
   - now `https://www.nowtv.com/search?q=`
   - iplayer `https://www.bbc.co.uk/iplayer/search?q=`
   - channel4 `https://www.channel4.com/search?q=`
   - paramount `https://www.paramountplus.com/search/?q=`
3. Otherwise (`other`, or nothing else applies): `https://www.themoviedb.org/movie/{id}/watch?locale=GB`.

Also export `sortProviders(providers)` (stream, free, rent, buy; then Netflix, Prime, Disney first) and `trailerUrl(film)` (`https://www.youtube.com/watch?v={key}` or `null`).

---

## 5. API routes

All routes live under `src/app/api/<name>/route.ts`, take and return JSON, and validate input by hand (no zod dependency needed). Cache Components is on in `next.config.ts`: POST handlers always run at request time, and the GET handlers read `request.url`, so they run at request time too. **Don't add `'use cache'`** to any of these. Next.js 16 conventions: see `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

### 5.0 Wire types (appended to `src/lib/types.ts` in T0, then frozen)

```ts
export type Mood = 'laugh' | 'scare' | 'date' | 'mind';

export interface Friend {                 // a profile in this store, as seen by others
  userId: string; name: string; look: Look; favId: number | null;
  favourites: number[]; isDemo: boolean;
}
export interface StaffPick { filmId: number; userIds: string[] }   // sorted by userIds.length desc

export interface JoinReq  { name: string; look: Look; favId: number | null; code?: string; userId?: string }
export interface JoinRes  { userId: string; presence: PresenceState; offline: boolean }

export interface FavReq   { userId: string; filmId: number; on: boolean; setTop?: boolean }
export interface FavRes   { ok: boolean; favourites: number[]; favId: number | null }

export interface OpenReq  { userId: string; filmId: number; source: OpenSource }
export interface WatchReq { userId: string; filmId: number; provider: ProviderId }
export interface OkRes    { ok: boolean }

export interface RecsRes  { items: RecItem[]; fallback: boolean }

export interface RicoReq  { userId: string | null; mood?: Mood; exclude?: number[] }
export interface RicoRes  extends RicoPick { fallback: boolean }

export interface StoreStateRes { friends: Friend[]; staffPicks: StaffPick[] }
```

### 5.1 Route table

| Route | Request | Response | Behaviour | Fallback |
|---|---|---|---|---|
| `POST /api/join` | `JoinReq` | `JoinRes` | Trim and uppercase `name`, strip anything outside `[A-Z0-9 ]`, max 12 chars (empty becomes `GUEST`). Validate `look` (hair in enum, colours `#RRGGBB`). If `userId` is given and exists, update that profile; otherwise insert. If `favId` is set, upsert it into `favourites` too. Bump `last_seen`. | DB down or env missing: return `crypto.randomUUID()`, `offline: true`. The client still plays solo or with Realtime. |
| `POST /api/favourite` | `FavReq` | `FavRes` | `on` upserts or deletes the row. `setTop` sets `profiles.fav_id = filmId` (and implies `on`). Unfaving the current #1 clears `fav_id`. | `{ ok:false, favourites:[], favId:null }`. The client keeps its optimistic state. |
| `POST /api/open` | `OpenReq` | `OkRes` | Insert `events(kind='open', meta:{source})`. Fire-and-forget from the client. | `{ ok:false }` |
| `POST /api/watch` | `WatchReq` | `OkRes` | Insert `events(kind='watch', provider)`. The client opens the link itself (it must open synchronously in the click handler to avoid popup blockers, then fire this). | `{ ok:false }` |
| `GET /api/recs?userId=&code=` | query | `RecsRes` | Load the user's favourites, the store's friends + favourites, and the user's watch events, then run `scoreRecs()` (§6). Top 18. | `trendingFallback()` and `fallback:true` |
| `POST /api/rico` | `RicoReq` | `RicoRes` | See §7. Always resolves within about 5.5s. | scripted pick, `fallback:true` |
| `GET /api/store-state?code=` | query | `StoreStateRes` | Profiles in the store with `last_seen` in the last 12h **or** `is_demo`, each with their favourites. `staffPicks` aggregates favourites across friends, sorted by count then rating, max 24. | `{ friends: [], staffPicks: [] }` |

### 5.2 `src/lib/api.ts` (typed client wrappers)

```ts
export const api = {
  join(req: JoinReq): Promise<JoinRes>,
  favourite(req: FavReq): Promise<FavRes>,
  open(req: OpenReq): void,                      // fire-and-forget, keepalive: true
  watch(req: WatchReq): void,                    // fire-and-forget, keepalive: true
  recs(userId: string | null, code?: string): Promise<RecsRes>,
  rico(req: RicoReq): Promise<RicoRes>,           // 6s client timeout → local fallback
  storeState(code?: string): Promise<StoreStateRes>,
};
```

Every wrapper uses `AbortSignal.timeout` (4s default, 6s for rico), catches everything, and returns a local fallback computed from the catalogue (`recs` → trending, `rico` → `localRicoFallback()` from `lib/rico-fallback.ts`, which is shared with the server). Until BE tasks merge, T0's version returns `mocks.ts` data with the same signatures.

---

## 6. Recommendations (`src/lib/recs.ts`, pure and isomorphic)

```ts
export interface RecsInput {
  catalogue: Catalogue;
  userFavs: number[];             // includes #1
  userTop: number | null;
  friends: Friend[];              // excludes the user
  watched?: number[];             // films the user hit PLAY on
  mood?: Mood;                    // used by RICO only
  exclude?: number[];
}
export function scoreRecs(i: RecsInput, limit = 18): RecItem[];
export function trendingFallback(c: Catalogue, limit = 18): RecItem[];
export function staffPicks(friends: Friend[], c: Catalogue, limit = 24): StaffPick[];
```

**Candidates:** every catalogue film not in `userFavs`, `watched` or `exclude`, filtered by mood when one is given (`laugh` → comedy/animated, `scare` → horror, `date` → romance/comedy/drama, `mind` → scifi/cult/drama with rating ≥ 7.2).

**Score** (sum):

| Signal | Points |
|---|---|
| Each friend who faves it | +3 (another +2 if it's their #1) |
| Aisle affinity | +2 × (share of the user's faves in this aisle) |
| Genre overlap with the user's faves | +0.5 per shared genre id, cap +2 |
| Quality | +(rating − 6.5) × 0.6 |
| Low confidence | −1 if votes < 300 |
| Trending | +0.5 |

Tie-break on votes desc. **Diversity:** at most 4 per aisle in the final list.

**`reason`** (uppercase, ≤ 32 chars, first match wins): `MAYA'S #1 PICK` · `MAYA + 2 OTHERS LOVE THIS` · `MAYA LOVES THIS` · `BECAUSE YOU LIKE SCI-FI` · `TRENDING THIS WEEK` · `CRITICS' CHOICE`. **`friends`** holds the names of friends who fave it.

**Fallback rules**
- No favourites and no friends: `trendingFallback()` (trending sorted by rating, reason `TRENDING THIS WEEK`), with `fallback:true`.
- Supabase unreachable: the same, with `fallback:true`.
- Fewer than 6 scored items: pad with trending, skipping duplicates.
- YOUR SHELF never renders empty. Even with a dead catalogue fetch, the client pads from `mocks.ts`.

---

## 7. RICO (`POST /api/rico`)

Files: `src/app/api/rico/route.ts`, `src/lib/server/openai.ts` (client, `import 'server-only'`), `src/lib/server/rico-prompt.ts`, and `src/lib/rico-fallback.ts` (isomorphic, no secrets).

**Flow**
1. Load the user's favourites and the store's friends (skip if `userId` is null or the DB is down).
2. `candidates = scoreRecs({ …, mood, exclude }, 30)`. If that's empty, use `trendingFallback(30)`.
3. Call OpenAI with **structured output** (JSON schema, strict) and a server-side `AbortSignal.timeout(5000)`. The prompt contains only: the user's name, their fav titles (max 5), the mood, and the candidate list as compact lines `id|title|year|aisle|rating|friends|overview≤100 chars`.
4. Response schema:
   ```json
   { "filmId": "integer", "line": "string ≤ 140 chars", "reason": "string ≤ 60 chars", "backups": "integer[3]" }
   ```
5. **Validate:** `filmId` must be in `candidates` or we fall back. Keep only `backups` that are in `candidates` and not the pick, then pad from the candidates. Trim `line` to 140 chars.
6. Log `events(kind='rico', film_id, meta:{ mood, fallback })` without awaiting it.
7. Return `RicoRes` with `fallback:false`.

**Persona (system prompt gist):** *You are RICO, the clerk at STRANDVAULT, a neon video store on a 1986 beach strip. Pastel suit, aviators, toothpick, unshakeable confidence. You recommend exactly one film from the list. Speak in one or two punchy sentences of retro-cool slang, PG-13. If a friend loves the film, name-drop them. Never mention AI, streaming algorithms, real celebrities' private lives, or films outside the list. Output JSON only.*

**Fallback (`localRicoFallback(candidates, mood, friendsMap)`)**, used when any of these happen: no `OPENAI_API_KEY`, timeout, API error, invalid JSON, or a `filmId` outside the candidates:
- Pick: a weighted random from the top 5 candidates (weights 5,4,3,2,1), so re-rolls vary.
- Line: from a scripted bank of 16 or more templates, keyed by mood plus a generic set, with `{title}`, `{year}` and `{friend}` slots. Examples: *"{title}. Trust me, kid, this one's got legs."* · *"{friend} wore out the tape on {title}. Your turn."* · *"You want scared? {title}. Lights off. No excuses."*
- `reason` comes from the `RecItem` reason, and `backups` are the next 3 candidates. Set `fallback:true`.
- The client wrapper applies the same fallback locally if the route itself is unreachable or takes longer than 6s.

**Abuse guard:** an in-memory per-`userId` limit of 1 request per 1.5s. A throttled request gets the fallback, never an error.

---

## 8. Security checklist

- [ ] `grep -r "SERVICE_ROLE\|OPENAI_API_KEY\|TMDB_TOKEN\|WATCHMODE_KEY" src/` only matches files under `src/lib/server/` and `src/app/api/`.
- [ ] Every file in `src/lib/server/` starts with `import 'server-only'`.
- [ ] RLS is enabled on all three tables, with no anon policies.
- [ ] Route inputs are length-capped (name 12, exclude ≤ 50 ids) and numeric ids are checked with `Number.isInteger`.
- [ ] No route returns a stack trace. Errors go through `console.error` server-side and the client gets the fallback body.

# BACKEND.md: StrandVault

> Source of truth for env, database, catalogue, API routes, recs and RICO. Lane **BE** owns everything here unless marked otherwise.
> **THE VAULT** (the movie + TV database, search, `build-db`) is documented in **`DATA.md`**. Read it for anything about titles or search.
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
| `OPENAI_API_KEY` | **server only** | optional: `/api/rico` lines from OpenAI. **Leave empty for £0** (scripted line bank) | no |
| `OPENAI_MODEL` | **server only** | optional, only with the key above | no |
| `DEMO_OFFLINE` | **server only** | set to `1` to make `/api/search` + `/api/title` skip DB/TMDB (client uses `/vault-index.json`) | no |
| `TMDB_TOKEN` | **server + scripts** | `scripts/build-db.ts`, and live search in `/api/search` + `/api/title` (v4 read token or v3 key) | no (catalogue is committed; search falls back to the vault/index) |
| `WATCHMODE_KEY` | **build script only** | `build-db --watchmode` for deep watch links | no |

Rules: nothing without `NEXT_PUBLIC_` may be imported by a client component. `WATCHMODE_KEY` is never read at runtime; `TMDB_TOKEN` only by the two vault routes (server). If a server var is missing, the route degrades to its fallback and logs one `console.warn`.

---

## 3. Supabase

### 3.1 Schema (`supabase/schema.sql`)

Run it in the Supabase SQL editor. It's idempotent. Then run **`supabase/titles.sql`** (THE VAULT: `titles` table + `search_titles()`, see DATA.md).

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

## 4. Catalogue (THE VAULT)

The catalogue is built by **`npm run db:build`** (`scripts/build-db.ts`), which replaces the old seed script. Full details, flags and setup are in **`DATA.md`**. In short:

- **Supabase `titles`:** the top ~5,000 movies + 2,000 TV shows with full detail (overview, cast, trailer, GB certification, GB providers), searchable with typo tolerance. Anything searched that isn't there is fetched from TMDB and stored on the fly.
- **`public/catalogue.json`:** the curated shelf set the store renders offline (16 per aisle, up to 25% TV box sets), shape `{ generatedAt, region, counts, films: Film[] }`.
- **`public/vault-index.json`:** a tiny index of every vault title for instant/offline search.
- **App id:** `Film.id` = TMDB id for movies and **-TMDB id for TV**. Use `toAppId()` / `fromAppId()` from `lib/server/titles.ts`; never strip the sign.
- **Aisle rules:** animation → ANIMATED; any 1980–1989 title → CULT '80s; otherwise horror → sci-fi → comedy → romance → action/thriller/war/western → drama.

### 4.1 Loaders
- `src/lib/catalogue.ts` (client): `loadCatalogue()` fetches `/catalogue.json` once and falls back to `mocks.ts`. Index: `byId`, `byAisle`, `trending`, `search()`.
- Server routes: `catalogueServer()` (same file) reads the committed `public/catalogue.json` at build, falls back to mocks.
- `src/lib/vault.ts` (client): `searchVault(q)` (API, then offline index) and `getTitle(id, byId)` (shelf first, then `/api/title`). **Every "open film" entry point uses `getTitle`**, so search results and friends' faves that aren't on a shelf still open.

### 4.2 `src/lib/links.ts`: `watchUrl(film, provider)`
1. Provider deep link (Watchmode `web_url`) if present.
2. Otherwise the provider's search page with the title encoded (netflix, prime, disney, apple, now, iplayer, channel4, paramount).
3. Otherwise `film.tmdbWatchLink` / `https://www.themoviedb.org/movie/{id}/watch?locale=GB`.

Also `sortProviders()` (stream, free, rent, buy; Netflix/Prime/Disney+ first) and `trailerUrl()`.

---

## 5. API routes

All routes live under `src/app/api/<name>/route.ts`, take and return JSON, and validate input by hand (no zod dependency needed). Cache Components is on in `next.config.ts`: POST handlers always run at request time, and the GET handlers read `request.url`, so they run at request time too. **Don't add `'use cache'`** to any of these. **Never export `dynamic`, `revalidate` or `fetchCache`** from a route: with Cache Components on they fail the build. Next.js 16 conventions: see `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`.

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
// RecItem.reasonType?: 'crew'|'taste'|'fresh'|'quality'|'mood'  ·  OpenSource adds 'search'  ·  GameEvent adds { type: 'open-search' }

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
| `GET /api/search?q=&type=&limit=` | query | `{ results: Film[]; source }` | Vault full-text + fuzzy search (`search_titles`); if < 6 hits, live TMDB search → fetch details → store → return. 4.5s cap on the live part. | `{ results: [], source: 'none' }`; client uses `/vault-index.json` |
| `GET /api/title/[appId]` | path | `Film` | Vault row by app id; else fetch from TMDB, store, return. | 404; client keeps what it had |
| `GET /api/store-state?code=` | query | `StoreStateRes` | Profiles in the store with `last_seen` in the last 12h **or** `is_demo`, each with their favourites. `staffPicks` aggregates favourites across friends, sorted by count then rating, max 24. | `{ friends: [], staffPicks: [] }` |

### 5.2 `src/lib/api.ts` (typed client wrappers)

```ts
export const api = {
  join(req: JoinReq): Promise<JoinRes>,
  favourite(req: FavReq): Promise<FavRes>,
  open(req: OpenReq): void,                      // fire-and-forget, keepalive: true
  watch(req: WatchReq): void,                    // fire-and-forget, keepalive: true
  recs(userId: string | null, code?: string, myFavs?: number[], myTop?: number | null): Promise<RecsRes>,
  rico(req: RicoReq): Promise<RicoRes>,           // 6s client timeout → local fallback
  storeState(code?: string): Promise<StoreStateRes>,
};
```

Every wrapper uses `AbortSignal.timeout` (4s default, 6s for rico), catches everything, and returns a local fallback computed from the catalogue (`recs` → trending, `rico` → `localRicoFallback()` from `lib/rico-fallback.ts`, which is shared with the server). Until BE tasks merge, T0's version returns `mocks.ts` data with the same signatures.

---

## 6. Recommendations (`src/lib/recs.ts`, pure and isomorphic) ✅ built

Modelled on how large streaming recommenders work, scaled to a store-sized catalogue. Verified by a test script covering cold start, taste, crew, diversity, mood, exclusions, rows, determinism, and **7,000 titles × 40 users in about 0.4s**.

```ts
recommend(films, signals, { k, mood, exclude, lambda, aisleCap, exploreEvery, now, seed }): RecItem[]
moreLikeThis(films, seedId, signals?, k): RecItem[]          // "Because you loved X"
personalRows(films, signals, name): { id, title, items }[]   // TOP PICKS FOR ALEX · BECAUSE YOU LOVED … · YOUR CREW IS INTO · TRENDING NOW
rankShelf(shelf, allFilms, signals): Film[]                  // personalise any aisle's order
trendingFallback(catalogue, k) · staffPicks(friends, catalogue) · signalsFrom(me, friends, myFavs, myTop)
```

**Pipeline**
1. **Signals:** implicit feedback with strengths and time decay (half-life 14 days): #1 fave 1.5 · fave 1.0 · watch 0.9 · open 0.25.
2. **Candidate scores** (each normalised to 0..1):
   - **taste:** cosine between the film's feature vector and the user's taste profile. Features: genres, decade, aisle, director, top-3 cast, movie/TV.
   - **cf:** item-item collaborative filtering over everyone's positives, `co(i,j) / sqrt(n_i * n_j)` shrunk by `co/(co+2)` so tiny counts can't dominate.
   - **crew:** friends' positives weighted by user-user affinity (0.35 floor + Jaccard overlap + taste closeness).
   - **prior:** Bayesian-average rating (m = 400 votes, C = 6.6) plus a trending bump.
3. **Blend:** taste .36 · cf .24 · crew .22 · prior .18, re-weighted when data is missing (cold start leans on crew + prior).
4. **Re-rank:** MMR (lambda 0.72) for diversity, a per-aisle cap (ceil(k/4)), and every 6th slot an **exploration** pick from outside the user's usual aisles. Opened twice but never faved gets a small fatigue penalty.
5. **Explain:** `reasonType` (`crew` · `taste` · `fresh` · `quality` · `mood`) plus a reason: `MAYA'S #1 PICK` · `MAYA + 2 OTHERS LOVE THIS` · `BECAUSE YOU LOVED INCEPTION` · `FANS OF ALIEN LOVE THIS` · `TRENDING THIS WEEK` · `CRITICS' CHOICE` · `OUTSIDE YOUR USUAL · CRITICS LOVE IT`. Strong social proof (a friend's #1 or 2+ friends) always leads.

**Fallbacks:** no data → `trendingFallback()` with `fallback:true`; Supabase down → the same. `/api/recs` and `/api/rico` (BE2–BE4, merged) call `scoreRecs()` / `padWithTrending()`, compatibility adapters at the bottom of `recs.ts` that run this engine. Offline, `api.recs(userId, code, myFavs, myTop)` runs the same engine locally.

---

## 7. RICO (`POST /api/rico`): £0 by default ✅ built

RICO **feels** like AI but by default it's the recommendation engine plus a scripted line bank: no credits, no keys, nothing that can fail on stage. If `OPENAI_API_KEY` is set, the route asks OpenAI for the line (structured output, 5s timeout) and still falls back to the line bank on any problem. **For the demo, leave the key empty.**

Files (merged from BE): `src/app/api/rico/route.ts`, `src/lib/rico-fallback.ts` (isomorphic line bank + `localRicoFallback()`, also used client-side by `api.rico()`), `src/lib/server/openai.ts`, `src/lib/server/rico-prompt.ts`.

**Flow**
1. Candidates: `scoreRecs()` (the engine, §6) with the mood filter, minus `exclude` (films already tossed this session). Empty → `trendingFallback()`.
2. Pick + line: line bank by default (OpenAI only if configured), validated so the pick is always one of the candidates.
3. Always 200; the client wrapper applies `localRicoFallback()` if the route is unreachable or slower than 6s.

---

## 8. Security checklist

- [ ] `grep -r "SERVICE_ROLE\|OPENAI_API_KEY\|TMDB_TOKEN\|WATCHMODE_KEY" src/` only matches files under `src/lib/server/` and `src/app/api/`.
- [ ] Every file in `src/lib/server/` starts with `import 'server-only'`.
- [ ] RLS is enabled on all three tables, with no anon policies.
- [ ] Route inputs are length-capped (name 12, exclude ≤ 50 ids) and numeric ids are checked with `Number.isInteger`.
- [ ] No route returns a stack trace. Errors go through `console.error` server-side and the client gets the fallback body.

# CLAUDE.md — REWIND CITY

> A multiplayer, Vice-City-flavoured 1986 neon video store that's actually a live streaming guide.
> Walk the store, pull a tape, rent it → it opens on Netflix / Prime / Disney+. Your crew's picks fill the shelves.
> Built in 4.5 hours at the KCL Tech first-year hackathon (tracks: Retro Remix + Creative Tech).

**Read this whole file before writing code. The build is time-boxed: ship > perfect.**

> Next.js here is newer than most training data — also read `AGENTS.md` and check `node_modules/next/dist/docs/` before using a Next API.

---

## 1. Golden rules (non-negotiable)

1. **Stay in your lane.** Only edit files in the folders your owner owns (see §4). If you need a change elsewhere, write a `// TODO(owner): …` note and tell the human.
2. **`src/lib/types.ts` is FROZEN after T+0:20.** Never change a shared type without the team agreeing in chat.
3. **Never block on the network during the demo.** All film data comes from `public/catalogue.json` (precached). Never call TMDB/Watchmode from the browser.
4. **Secrets live only in `.env.local` / Vercel env.** Never commit keys. Never use a secret key in a client component. `NEXT_PUBLIC_*` vars are for the Supabase URL and anon key only.
5. **No Rockstar / Blockbuster IP.** No GTA or Vice City logos, names, screenshots, characters, ripped game fonts or game music. No Blockbuster name or ticket logo. The *vibe* (sunset neon, palms, synthwave, deco signage, GTA-style HUD conventions) is fine; assets must be original.
6. **No copyrighted music.** Royalty-free or self-made synthwave only.
7. **The game loop never touches React state per frame.** The canvas runs its own `requestAnimationFrame` loop with refs. React only renders overlays and responds to events.
8. **Mobile matters.** Judges join on phones. Every interaction needs a tap equivalent (tap-to-walk, tap an aisle, big hit targets of at least 44px).
9. **Small commits, push often.** Vercel deploys on push to `main`. Use feature branches for agent work and merge after review.
10. **When unsure, pick the simpler option and leave a `// HACK:` comment.**

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript (strict) |
| Styling | Tailwind CSS + CSS variables (tokens in `src/styles/tokens.css`) |
| Store map | Hand-written HTML canvas game loop in `src/game/` (no engine) |
| Realtime | Supabase Realtime: **Presence** (who's here, avatar, x/y) + **Broadcast** (moves at 10 Hz, chat, booth events) |
| DB | Supabase Postgres |
| Film data | TMDB → precached into `public/catalogue.json` by `scripts/seed-catalogue.ts` |
| Watch links | Watchmode free tier (web URLs per source), with provider search URL templates as fallback |
| AI clerk | Claude API via `src/app/api/clerk/route.ts` (server only) |
| Hosting | Vercel |
| IDE | IntelliJ IDEA + JetBrains Air (parallel agent tasks on branches) — see §14 |

---

## 3. Commands

```bash
npm install
npm run dev                 # http://localhost:3000
npm run seed                # tsx scripts/seed-catalogue.ts → public/catalogue.json (needs TMDB_TOKEN, WATCHMODE_KEY)
npm run typecheck           # tsc --noEmit
npm run lint
npm run build
npm run preflight           # typecheck + lint + build — run before asking for a merge
npm run worktree:setup      # in a fresh Air worktree: copy .env.local from main checkout + npm install
```

All of these also exist as shared IntelliJ run configurations in `.run/` (Run widget, top toolbar).

### Env (`.env.local`, mirrored in Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=      # server only, seed personas
TMDB_TOKEN=                     # seed script only (v4 read token)
WATCHMODE_KEY=                  # seed script only
ANTHROPIC_API_KEY=              # /api/clerk only
NEXT_PUBLIC_REGION=GB
```

---

## 4. Folder map and ownership

```
rewind-city/
├─ CLAUDE.md
├─ scripts/                      [BACKEND] seed-catalogue.ts, seed-personas.ts  (worktree-setup.mjs = shared tooling)
├─ supabase/                     [BACKEND] schema.sql
├─ public/
│  ├─ catalogue.json             [BACKEND] generated, committed
│  ├─ sprites/                   [UI] 16x16 characters, 32px tiles, PNG, pixelated
│  ├─ audio/                     [UI] royalty-free synthwave + UI blips
│  └─ fonts/                     [UI] (if self-hosting)
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                [UI] boot/loading + join screen
│  │  ├─ store/page.tsx          [VINU] mounts <StoreCanvas/> + overlays
│  │  ├─ join/[code]/page.tsx    [UI] QR landing → join
│  │  └─ api/                    [BACKEND]
│  │     ├─ recs/route.ts        POST {userId, storeCode} → RecItem[]
│  │     ├─ clerk/route.ts       POST {userId, storeCode, message} → ClerkReply
│  │     └─ booth/route.ts       POST {boothId} → BoothResult (seeded weighted pick)
│  ├─ game/                      [VINU]
│  │  ├─ StoreCanvas.tsx         canvas mount + rAF loop
│  │  ├─ map.ts                  tile grid, walls, zone definitions
│  │  ├─ input.ts                keyboard (WASD/arrows/E) + tap-to-walk
│  │  ├─ entities.ts             player + remote players, interpolation
│  │  ├─ render.ts               draw floor, shelves, neon signs, sprites, name tags
│  │  └─ zones.ts                interaction zones → emits GameEvent
│  ├─ components/                [UI]
│  │  ├─ hud/                    Minimap, RespectCounter, LateFeeStars, RadioTicker
│  │  ├─ aisle/                  AisleView, VhsSpine, TapeBackCover, AvailableOnChips
│  │  ├─ counter/                CounterView, RicoChat, MissionBanner ("TAPE RENTED")
│  │  ├─ bbs/                    BbsTerminal, WhosRenting
│  │  ├─ booth/                  RentalBooth (slot machine)
│  │  ├─ card/                   MembershipCard
│  │  └─ fx/                     CrtOverlay, VhsGlitch, NeonText
│  ├─ lib/
│  │  ├─ types.ts                [SHARED, FROZEN] all cross-team types
│  │  ├─ catalogue.ts            [BACKEND] load + index catalogue.json (client-safe)
│  │  ├─ links.ts                [BACKEND] watchUrl(film, provider) incl. fallbacks
│  │  ├─ recs.ts                 [BACKEND] scoring (pure functions, unit-testable)
│  │  ├─ realtime.ts             [VINU] useStoreChannel(): presence + broadcast
│  │  ├─ supabase.ts             [BACKEND] browser + server clients
│  │  └─ server/                 [BACKEND] server-only helpers (Claude, service role)
│  └─ styles/                    [UI] tokens.css, globals.css, fx.css
```

---

## 5. Shared contracts (`src/lib/types.ts`)

```ts
export type ProviderId = 'netflix' | 'prime' | 'disney' | 'apple' | 'now' | 'iplayer' | 'channel4' | 'paramount' | 'other';
export type Aisle = 'action' | 'comedy' | 'horror' | 'scifi' | 'drama' | 'romance' | 'animated' | 'cult';

export interface Film {
  id: number;                 // TMDB id
  title: string;
  year: number;
  runtime: number;            // minutes
  overview: string;
  poster: string;             // full TMDB image URL (w342)
  backdrop?: string;
  genres: number[];           // TMDB genre ids
  aisle: Aisle;               // primary shelf
  rating: number;             // TMDB vote_average 0–10
  votes: number;
  trending: boolean;
  providers: { id: ProviderId; name: string; url: string; kind: 'stream' | 'rent' | 'buy' }[];
}

export interface Player {
  userId: string;
  name: string;
  jacket: string;             // hex, from the jacket palette
  x: number; y: number;       // tile coords (float)
  facing: 'up' | 'down' | 'left' | 'right';
  zone?: string;
  isDemo?: boolean;
}

export interface Favourite { userId: string; filmId: number; storeCode: string; createdAt: string; }
export interface Rental    { userId: string; filmId: number; storeCode: string; provider: ProviderId; createdAt: string; }
export interface ChatMsg   { id: string; userId: string; name: string; text: string; storeCode: string; createdAt: string; }

export interface RecItem {
  filmId: number;
  score: number;
  reason: string;             // "Because Ali & Sam rented it" | "More 80s sci-fi" | "Trending this week" | "Critics' darling"
  friends: string[];          // userIds who favourited/rented
}

export interface ClerkReply { line: string; picks: number[]; }  // RICO: one line + 3 TMDB ids from catalogue

export interface BoothResult { boothId: string; winnerFilmId: number; seed: number; entries: { userId: string; filmId: number; weight: number }[]; }

export type GameEvent =
  | { type: 'enter-aisle'; aisle: Aisle }
  | { type: 'open-counter' }
  | { type: 'open-bbs' }
  | { type: 'open-booth' }
  | { type: 'open-staff-picks' }
  | { type: 'close' };

// Realtime broadcast payloads on channel `store:{code}`
export type Broadcast =
  | { kind: 'move'; userId: string; x: number; y: number; facing: Player['facing'] }
  | { kind: 'chat'; msg: ChatMsg }
  | { kind: 'fav'; userId: string; filmId: number }
  | { kind: 'rent'; userId: string; filmId: number }
  | { kind: 'booth-drop'; boothId: string; userId: string; filmId: number }
  | { kind: 'booth-spin'; result: BoothResult };
```

---

## 6. Database (`supabase/schema.sql`)

```sql
create table profiles  (user_id text primary key, name text not null, jacket text not null, store_code text not null,
                        respect int default 0, is_demo boolean default false, created_at timestamptz default now());
create table favourites(user_id text, film_id int, store_code text, created_at timestamptz default now(), primary key (user_id, film_id));
create table rentals   (id bigserial primary key, user_id text, film_id int, store_code text, provider text, created_at timestamptz default now());
create table messages  (id uuid primary key default gen_random_uuid(), user_id text, name text, text text, store_code text, created_at timestamptz default now());
-- Hackathon: RLS off or permissive anon policies. Note it in the README as a known shortcut.
```

Identity is a `crypto.randomUUID()` stored in `localStorage` (wrapped in try/catch) plus a name and jacket. No passwords.

---

## 7. Game spec (store floor)

- **Grid:** 32px tiles, map about 28 × 18 tiles. Camera follows the player and clamps to map bounds. Scale 2x on desktop and fit-to-width on mobile.
- **Zones** (rectangles in `map.ts`): 8 aisles (2 rows of 4), Staff Picks wall (by the entrance), New Releases end-cap, Counter + RICO, BBS terminal (corner), Rental Booth (by the counter), Door/spawn.
- **Controls:** WASD/arrows to move, E/Enter to interact, Esc to close. Mobile: tap a floor tile to path there (straight-line steps with wall sliding is fine; no A* needed), tap a zone to walk to it and auto-interact.
- **Interaction prompt:** a floating `[E] BROWSE SCI-FI` label in Press Start 2P when inside a zone.
- **Multiplayer:** broadcast own position at 10 Hz only when it changes. Remote players lerp toward their latest position. Name tag above each sprite in their jacket colour.
- **Minimap (HUD, bottom-left, GTA-style round):** store outline, aisles in their neon colours, self = cyan arrow, friends = jacket-colour dots.
- **Rendering order:** floor → shelves → neon sign glow (`shadowBlur`) → players (y-sorted) → name tags. Draw neon glow to an offscreen canvas once, not per frame.

---

## 8. Recommendation spec (`src/lib/recs.ts`, pure)

```
score(f) = 0.45·taste + 0.35·crew + 0.10·fresh + 0.10·quality − seenPenalty
taste   = cosine(filmVec(f), mean(filmVec(favs)))          // genre one-hot ∪ decade one-hot
crew    = Σ friends who fav/rented f × closeness(friend)   // closeness = (sharedFavs+1)/max ; rentals ×1.5 ; normalise 0..1
fresh   = trending ? 1 : 0
quality = votes ≥ 200 ? rating/10 : 0.5
reason  = label of the largest weighted term
```
Return the top 12, excluding rented films. Cold start uses the 3 "first rentals" picked on join.
**Booth:** weight = 1 + 0.5 × (number of booth members with crew score > 0.3). Seeded RNG (`mulberry32(seed)`) so every client shows the same spin.

---

## 9. RICO (AI clerk) spec

- `POST /api/clerk` builds a compact context: the user's favourites (titles), the crew's top 10, and a candidate list of 40 catalogue films (id + title + year + aisle) pre-filtered by recs.
- System prompt essentials: RICO is an original character, a 1986 video-store clerk on an ocean drive. Pastel suit, palm-print shirt, aviators. Warm, punchy, a little over the top. **Max 25 words.** Only recommend films from the candidate list. Return **JSON only**: `{"line": string, "picks": [id, id, id]}`.
- Validate: every id must exist in the catalogue. On any failure, fall back to the top 3 recs plus a random line from `SCRIPTED_LINES` (10 lines). **The demo must never show an error.**
- Use a fast model, `max_tokens` about 200, timeout 6s.

---

## 10. Design tokens (`src/styles/tokens.css`)

```css
:root{
  --night:#0B0620; --dusk:#2A0B45;
  --neon-pink:#FF2E88; --neon-cyan:#00E5FF; --sunset:#FF8A3D; --palm:#1DE9B6; --hazard:#FFD300; --vhs-cream:#F4E8C1;
  --aisle-action:#FF8A3D; --aisle-comedy:#FFD300; --aisle-horror:#FF3B3B; --aisle-scifi:#00E5FF;
  --aisle-drama:#B388FF; --aisle-romance:#FF2E88; --aisle-animated:#1DE9B6; --aisle-cult:#C6FF00;
  --sunset-grad:linear-gradient(180deg,#FF8A3D 0%,#FF2E88 35%,#7B2CBF 65%,#0B0620 100%);
  --font-neon:'Monoton'; --font-script:'Yellowtail'; --font-banner:'Bungee';
  --font-hud:'Press Start 2P'; --font-term:'VT323'; --font-body:'Inter';
}
```

**Effects:** `CrtOverlay` (scanlines + vignette, toggleable), `NeonText` (flicker keyframes on text-shadow; signs only), `VhsGlitch` (300ms RGB split on route/view change), spine hover chromatic aberration, tape pull (CSS 3D: slide out on Z, rotateY 90°, becomes the back cover, 450ms), `MissionBanner` ("TAPE RENTED" / "+50 RESPECT", Bungee in the sunset gradient on a black band, 1.6s). Respect `prefers-reduced-motion`.

**Copy voice:** short, punchy, 80s. Use VHS OSD style for system text: `PLAY ▶`, `REW ◀◀`, `TRACKING…`, `00:14:32`.

---

## 11. Watch links (`src/lib/links.ts`)

Priority: Watchmode web URL from the catalogue → fallback template → TMDB watch page.
```ts
const FALLBACK: Record<ProviderId, (t: string) => string> = {
  netflix:  t => `https://www.netflix.com/search?q=${encodeURIComponent(t)}`,
  prime:    t => `https://www.primevideo.com/search?phrase=${encodeURIComponent(t)}`,
  disney:   t => `https://www.disneyplus.com/search?q=${encodeURIComponent(t)}`,
  apple:    t => `https://tv.apple.com/search?term=${encodeURIComponent(t)}`,
  /* …others → TMDB watch page */
};
```
Always open with `target="_blank" rel="noopener"`. Footer attribution: **"Film data from TMDB. Streaming availability by JustWatch."**

---

## 12. Definition of done (per feature)

- Works on desktop Chrome **and** a phone over the deployed Vercel URL.
- No console errors, and `npm run typecheck` passes.
- Has a loading state and a failure fallback (never a blank screen during the demo).
- Looks on-brand: tokens only, no default Tailwind greys or blue links.

## 13. Priorities (cut from the bottom)

- **P0:** join, store walk, aisle shelf with real films, tape back cover + working watch link, favourites, live Staff Picks, other players visible.
- **P1:** rent flow + mission banner + Respect, recs with reasons, BBS chat, minimap, loading screen.
- **P2:** Rental Booth (protect this if P0/P1 are done by T+2:45), RICO AI, radio/SFX, membership card, Late Fee stars.

---

## 14. IntelliJ IDEA + JetBrains Air workflow

Air is bundled in IntelliJ IDEA 2026.3 (Settings → Plugins → Bundled → **Air**). One Air session = one task = one lane.

**Starting a task (human):**
1. Check out `main` and pull. Air worktrees branch from whatever is checked out.
2. Agent widget (main toolbar) → **New Session** → run mode **New Local Worktree** → Custom Worktree Settings → branch `agent/<lane>/<feature>` (e.g. `agent/vinu/tap-to-walk`, `agent/ui/aisle-view`, `agent/backend/recs`).
3. Open the session with the lane line first (prompt template below).
4. Review the diff in IntelliJ, then merge into `main` and push. Delete the worktree only after the merge, because deleting it throws away uncommitted work.

**Prompt template:**
```
LANE: [VINU | UI | BACKEND]. You may only edit files that §4 of CLAUDE.md assigns to this lane.
TASK: <one feature, from §13>
DONE WHEN: §12 holds and `npm run preflight` passes.
```

**Rules for agents running in Air:**
- Your first command in a new worktree is `npm run worktree:setup`. It copies `.env.local` from the main checkout and installs `node_modules`, because worktrees don't get git-ignored files.
- Don't run `npm run dev` on port 3000 if the main checkout is already using it. Use `npx next dev -p 3001` (or 3002, …) instead.
- Never edit `src/lib/types.ts` from an agent branch. Stop and tell the human.
- Commit on your `agent/*` branch only. Never push to `main` and never merge yourself.
- If two sessions need the same file, they are in the wrong lanes. Stop and say so.

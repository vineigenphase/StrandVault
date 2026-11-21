<!-- GENERATED from CLAUDE.md by `npm run agents:sync`. Edit CLAUDE.md, not this file. -->

# AGENTS.md: StrandVault

> **A 2D side-scrolling, multiplayer neon video store that is secretly a streaming guide.**
> You pull up outside a 1986 Ocean-Drive rental store at sunset, walk in, and side-scroll past glowing shelves. Pull a disc and the case opens, the disc spins, and the movie page blooms out of it with "PLAY ON NETFLIX / PRIME / DISNEY+". Your friends walk the same store live; hover over one to see their favourite film floating above their head. Stuck? Hit **I DON'T KNOW WHAT TO WATCH** and RICO the clerk tosses you a disc.
>
> KCL Tech first-year hackathon · 4.5 hours · tracks: Retro Remix + Creative Tech · built agentically with **JetBrains Air in IntelliJ IDEA**.

> **Current main experience: THE VAULT UI** (`src/vault/`, routes `/` and `/play`): a teammate's canvas game (intro → vault door → corridor → **top-down store**) wired to real data. See §6.0. The original side-scrolling DOM game (§6.1–6.6) lives on at `/classic`.

**Every agent: read this whole file, then `BACKEND.md` if you touch the backend (and `DATA.md` for anything about titles, search or THE VAULT), then take a task from `TASKS.md`. Ship over perfect.**

> Next.js here is newer than most training data. Check `node_modules/next/dist/docs/` before using a Next API (see the note at the bottom of `AGENTS.md`).

---

## 0. The demo (everything serves this 90 seconds)

1. Projector shows the **street at sunset**: parallax sky, striped sun, palms, the STRANDVAULT neon sign flickering on. A neon **"SCAN TO PULL UP"** sign with a QR code sits in the corner.
2. A judge scans it, types a name, picks a look (jacket, hair, shades) and their **#1 favourite film**. Their sprite **glitches in at the curb** on the projector, and a GTA-style toast reads *"ALEX just pulled up"*.
3. We walk right. The door slides open and the camera pushes through a bloom of neon light into the store.
4. We side-scroll past the **Staff Picks wall** (friends' favourites, each case tagged with that friend's mini sprite), NEW RELEASES, and 8 genre shelves.
5. We **hover over the judge's sprite**. A bubble pops above them with their favourite film's case art and title. Click it and that disc opens.
6. At SCI-FI we press ↑. The camera pushes into the shelf, which becomes a **side-scrolling library** of disc cases. Pull one: the **case opens, the disc spins up, and the movie page blooms out from the disc's centre** (circle reveal).
7. Close it, hit **I DON'T KNOW WHAT TO WATCH**, and RICO slides in from the counter, spins a disc on his finger, says his line and **tosses it to you**. Same open animation, and the movie page shows "RICO'S PICK".
8. Hit **PLAY ▶ ON NETFLIX**. A "NOW PLAYING" banner sweeps the screen and the real Netflix page opens in a new tab.

If a feature doesn't make this better, it waits.

---

## 1. Golden rules (non-negotiable)

1. **Stay in your lane.** Only edit files your lane owns (§4). Need something elsewhere? Add `// TODO(<lane>): …` and say so in your summary.
2. **`src/lib/types.ts` is FROZEN** after task T0. Changing it needs a human OK.
3. **The demo never needs the network for film data.** Shelves come from `public/catalogue.json` and search falls back to `public/vault-index.json` (both written by `npm run db:build`, see DATA.md). Posters can be downloaded locally too (`npm run db:build -- --images`).
4. **Secrets are server-only.** `TMDB_TOKEN`, `WATCHMODE_KEY`, `OPENAI_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` never appear in client code. Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` go to the browser.
5. **Original IP only.** No Rockstar, GTA or Vice City logos, names, screenshots, characters, ripped fonts or music. No Blockbuster name or logo. The *vibe* is ours to take: sunset neon, palms, synthwave, deco type, GTA-style HUD conventions, "mission passed" banners.
6. **No copyrighted music.** Royalty-free synthwave or silence plus UI blips.
7. **No React state per frame.** Movement runs in a `requestAnimationFrame` loop that writes `transform` straight onto DOM refs. React renders structure and responds to events only.
8. **Every interaction works on a phone.** Judges join on phones in portrait. Tap targets are at least 44px and there are on-screen controls (§6.6).
9. **Never show an error on screen.** Every async call has a loading state and a fallback (RICO falls back to scripted lines plus top recs; recs fall back to trending).
10. **Small commits on `agent/<task-id>` branches**, then merge to `main` after a human glance. Vercel deploys `main`.
11. Respect `prefers-reduced-motion`: swap big motion for fades. The CRT overlay can be toggled.
12. Unsure? Take the simpler path and leave `// HACK:` with a one-line reason.

---

## 2. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript strict |
| Styling | Tailwind + CSS variables (`src/styles/tokens.css`) |
| Motion | `motion` (Framer Motion for React) for UI and sequences, CSS keyframes for sprite cycles and ambient loops |
| Game | **THE VAULT (main):** canvas engine `src/vault/engine.js` (384×216 pixel scenes + glow layers, A* click-to-walk, DOM glass panels) mounted by `VaultGame.tsx` with `adapter.ts` feeding real data. **Classic (`/classic`):** DOM side-scroller: a world `div` translated by the camera, sprites as `div`s with sprite-sheet backgrounds, and one rAF loop (`src/game/loop.ts`). No canvas engine, so hover and bubbles are native DOM. |
| Sprites | **Procedural pixel art**: ASCII pixel maps in TS, composed and recoloured at runtime onto an offscreen canvas, then turned into sprite-sheet data URLs (`src/game/sprites/`) |
| Realtime | Supabase Realtime: Presence (who's here plus their look and #1 fav) and Broadcast (movement at 10 Hz, events) |
| DB | Supabase Postgres (see `BACKEND.md`) |
| Film data | **THE VAULT** (DATA.md): TMDB → Supabase `titles` (~7,000 movies + shows, fuzzy search, grows on demand) + `public/catalogue.json` shelves + `public/vault-index.json` offline index |
| Watch links | Watchmode web URLs, then provider search URL fallbacks, then the TMDB watch page |
| RICO clerk | **£0 by default.** Picks come from the recs engine plus mood filters; lines from a scripted bank. Optional OpenAI lines if `OPENAI_API_KEY` is set (`POST /api/rico`, BACKEND.md §7) |
| Recs | `src/lib/recs.ts`: streaming-style engine (content taste + item-item CF + crew + quality prior, MMR diversity, exploration, explanations), BACKEND.md §6 |
| Hosting | Vercel |
| Agents | JetBrains Air: parallel tasks from `TASKS.md`, one branch each |

> `AGENTS.md` is generated from this file (`npm run agents:sync`) so non-Claude agents in Air (Codex, Junie, etc.) read the same rules. Edit CLAUDE.md, never AGENTS.md.

---

## 3. Commands

```bash
npm install
npm run dev            # localhost:3000
npm run db:build       # THE VAULT: TMDB → Supabase titles + catalogue.json + vault-index.json (DATA.md). Flags: --images --watchmode
npm run db:build:quick # 600 movies + 200 shows, to check the wiring (~30s)
npm run seed           # legacy shelf-only seeder (scripts/seed-catalogue.ts); db:build supersedes it
npm run seed:personas  # scripts/seed-personas.ts → demo friends in Supabase
npm run typecheck
npm run lint
npm run build
npm run preflight      # typecheck + lint + build
npm run worktree:setup # first command in a fresh Air worktree (copies .env.local, installs deps)
npm run agents:sync    # regenerate AGENTS.md from CLAUDE.md
```

Env lives in `.env.local` (mirrored in Vercel). The full list is in `BACKEND.md` §2. Every command above is also a shared IntelliJ run configuration in `.run/`.

---

## 4. Folder map and lanes

Lanes: **BE** = backend · **GAME** = Vinu (game engine, multiplayer, integration, Air orchestration) · **UI** = visual, motion, overlays.

```
strandvault/
├─ CLAUDE.md  BACKEND.md  DATA.md  TASKS.md  AGENTS.md(copy)
├─ scripts/                       BE   build-db.ts (THE VAULT), seed-personas.ts   (worktree-setup.mjs, sync-agents.mjs = GAME tooling)
├─ supabase/schema.sql, titles.sql BE
├─ public/
│  ├─ catalogue.json              BE   generated by db:build, committed (shelf titles, movies + TV box sets)
│  ├─ vault-index.json            BE   generated: tiny index of every vault title (offline search)
│  ├─ posters/                    BE   optional local images
│  └─ audio/                      UI   royalty-free loops + blips
├─ src/
│  ├─ app/
│  │  ├─ page.tsx                 GAME host/projector: <Game scene="street"/>
│  │  ├─ join/page.tsx            UI   QR landing → name, look, #1 fav → spawn
│  │  ├─ play/page.tsx            GAME phone/player view (same game + on-screen controls)
│  │  └─ api/                     BE   join, favourite, open, watch, recs, rico, store-state, search, title/[appId]
│  ├─ vault/                      GAME THE VAULT UI: engine.js (ported canvas engine) + engine.d.ts, adapter.ts (real data → engine), VaultGame.tsx (mount, identity, realtime)
│  ├─ game/                       GAME (classic side-scroller at /classic)
│  │  ├─ Game.tsx                 mounts scenes, camera, loop, input
│  │  ├─ loop.ts                  rAF: input → physics → camera → write transforms
│  │  ├─ camera.ts                follow player, lerp, clamp, push-in/zoom tweens
│  │  ├─ input.ts                 keyboard (←→ / A D, ↑ / W / E = interact, Esc) + touch controls
│  │  ├─ world/street.ts          street layout + parallax layers
│  │  ├─ world/interior.ts        interior layout: sections, x ranges, interact zones
│  │  ├─ entities/Player.tsx      local player sprite (ref-driven)
│  │  ├─ entities/RemotePlayer.tsx  interpolated friend sprite + name tag + hover fav bubble
│  │  ├─ entities/Rico.tsx        RICO at the counter (idle, wave, spin-disc, toss)
│  │  ├─ sprites/pixel.ts         ASCII maps, palettes, composer → sprite sheets
│  │  ├─ sprites/characters.ts    body, hair, jacket, shades layers; walk(4)/idle(2) frames
│  │  ├─ npc.ts                   host-only demo friends that wander + broadcast (isDemo)
│  │  └─ zones.ts                 which zone the player stands in → GameEvent
│  ├─ components/                 UI
│  │  ├─ scene/                   SunsetSky, Skyline, Palms, Storefront, NeonSign, ShelfUnit, Counter, LightBeams
│  │  ├─ library/                 LibraryView (side-scrolling shelf), DiscCase, CaseSpine
│  │  ├─ disc/                    DiscOpenSequence (case open → spin → circle-reveal)
│  │  ├─ movie/                   MoviePage, WatchButtons, FriendsWhoLove, TrailerButton
│  │  ├─ rico/                    IdkButton, RicoPanel (portrait + line + mood chips), RicoToss
│  │  ├─ hud/                     Toasts ("X just pulled up"), OSD ("PLAY ▶ 00:14:32"), MiniStrip, NowPlayingBanner
│  │  ├─ join/                    LookPicker, FavPicker (disc carousel)
│  │  ├─ vault/                   VaultTerminal (CRT search kiosk), VaultResults (disc-case grid)
│  │  └─ fx/                      CrtOverlay, VhsGlitch, NeonText, ScanlineWipe, Bloom
│  ├─ lib/
│  │  ├─ types.ts                 SHARED · FROZEN
│  │  ├─ catalogue.ts             BE   load + index (byId, byAisle, search)
│  │  ├─ links.ts                 BE   watchUrl(film, provider)
│  │  ├─ recs.ts                  BE   recommendation engine (pure)
│  │  ├─ vault.ts                 BE   client: searchVault(q), getTitle(id)
│  │  ├─ api.ts                   BE   typed fetch wrappers for every route
│  │  ├─ supabase.ts              BE   browser client (anon)
│  │  ├─ server/                  BE   supabase + db (service clients), tmdb, titles, openai (optional), rico-prompt
│  │  ├─ realtime.ts              GAME useStore(code): presence + broadcast hook
│  │  └─ events.ts                GAME tiny event bus (game ↔ overlays)
│  └─ styles/                     UI   tokens.css, globals.css, fx.css, vault.css (artifact CSS scoped to .vault-root)
```

---

## 5. Shared contracts (`src/lib/types.ts`, frozen after T0)

```ts
export type ProviderId = 'netflix'|'prime'|'disney'|'apple'|'now'|'iplayer'|'channel4'|'paramount'|'other';
export type Aisle = 'action'|'comedy'|'horror'|'scifi'|'drama'|'romance'|'animated'|'cult';
export type Section = 'staffpicks'|'new'|Aisle|'yourshelf'|'counter';

export interface Provider { id: ProviderId; name: string; url: string; kind: 'stream'|'rent'|'buy'|'free'; logo?: string }
export interface Film {
  id: number; title: string; year: number; runtime: number; overview: string; tagline?: string;
  poster: string; backdrop?: string; genres: number[]; aisle: Aisle;
  rating: number; votes: number; trending: boolean;
  cast: string[]; director?: string; trailerKey?: string;   // YouTube key
  providers: Provider[];                                    // GB
  // THE VAULT additions (optional): mediaType?: 'movie'|'tv'; imdbId?; seasons?; episodes?; certification?; tmdbWatchLink?
}
// Film.id is the APP ID: movie = TMDB id, TV show = -TMDB id.

export interface Look { jacket: string; hair: 'flat'|'mullet'|'curls'|'buzz'|'long'; hairColor: string; skin: string; shades: boolean }
export interface PresenceState { userId: string; name: string; look: Look; favId: number|null; scene: 'street'|'interior'; isDemo?: boolean }
export interface MoveMsg { userId: string; x: number; dir: 1|-1; moving: boolean; scene: 'street'|'interior'; t: number }

export type ReasonType = 'crew'|'taste'|'fresh'|'quality'|'mood';
export interface RecItem { filmId: number; score: number; reason: string; friends: string[]; reasonType?: ReasonType }
export interface RicoPick { filmId: number; line: string; reason: string; backups: number[] }

export type OpenSource = 'shelf'|'rico'|'friend'|'staffpicks'|'yourshelf'|'search';
export type GameEvent =
  | { type: 'zone'; section: Section | 'door' | null }
  | { type: 'open-library'; section: Section }
  | { type: 'open-film'; filmId: number; source: OpenSource; ricoLine?: string; from?: { x: number; y: number } }
  | { type: 'rico' }
  | { type: 'open-search' }
  | { type: 'close' };

export type Broadcast =
  | { kind: 'move'; m: MoveMsg }
  | { kind: 'fav'; userId: string; filmId: number; on: boolean }
  | { kind: 'open'; userId: string; filmId: number }
  | { kind: 'watch'; userId: string; filmId: number; provider: ProviderId }
  | { kind: 'emote'; userId: string; emote: 'wave'|'dance'|'thumbs' };
```

---

## 6. Game spec

### 6.0 THE VAULT UI (main experience)
- **Flow:** title ("Press ▶ to enter") → art-deco vault door unlocks → short side-scrolling corridor → **top-down store** (click/tap to walk, A* pathfinding; arrows/WASD also walk).
- **Store:** 4 shelves × 7 titles: *Your Recommendations* (recs engine, refined by `/api/recs`), *Friends' Must-Watches* (friends' faves), *Trending in the Vault*, *Vault Classics*. Plus *Your Watchlist* shelf, the **search computer** (THE VAULT: any movie/show), the **Must-Watches pinboard**, and **Reko** at the counter (mood chips → `/api/rico`).
- **Open a film:** walk to the case → DVD slides out, opens, disc spins → **frosted-glass showcase** (backdrop behind glass, real poster on case + disc, TMDB rating, real GB providers as "▶ Watch now · Netflix", + Watchlist, friends who love it, cast, TMDB/JustWatch attribution). Films not on a shelf (search, Reko, friends) open straight from the centre.
- **Multiplayer:** joins `store:{code}` presence; hero position goes out at 10 Hz as `MoveMsg` with `y` + `face` (scene `interior`). Live players are drawn in the store with their look; demo wanderers hide as soon as a real player is in.
- **Identity:** `localStorage['sv-profile']` (`{ userId, name, look }`, `POST /api/join` on load). `?fresh` joins as a new guest without saving. Watchlist: `localStorage['sv-watchlist']` mirrored to `/api/favourite` + realtime `fav`.
- **Rules that still apply:** never an error on screen (every call has a fallback), secrets server-only, original art only. The engine keeps its own rAF loop and writes to canvas (React only mounts it), which satisfies rule 7.
- Dev hook: `window.__SV` (skipTo, openSearch, openReko, remotes, hero).


### 6.1 Stage and scaling
- Logical stage **640 × 360 px** of pixel art, scaled by the **largest integer** that fits (projector usually ×3) with `image-rendering: pixelated`. Letterbox the remainder with the sunset gradient.
- **Overlays (library, movie page, RICO, HUD) are full-resolution DOM**, not pixel-scaled, so the text stays crisp.
- Phone portrait: the stage scales to the screen width at the top, with **Game-Boy-style controls** below (◀ ▶, a big round **A** = interact, **B** = back) and the IDK button.

### 6.2 Scenes
**Street (exterior), world width 1280.** Parallax layers, back to front:
- Sky gradient (factor 0) with a **striped sun** (bands scroll slowly) and stars fading in.
- Skyline silhouettes with blinking windows (0.2).
- Palms that sway via CSS keyframes (0.5).
- Sidewalk, the **storefront** at x 900–1180 with a STRANDVAULT neon sign that flickers on, window posters and a sliding glass door (1.0).
- Foreground: a parked neon-trim car and a palm silhouette (1.3).

The QR sign sits on the host screen only. Spawn point is x 120. Reaching the door (x 1020–1080) slides it open; walking through triggers the **enter transition** into the interior.

**Interior, world width 3000.** Sections along x:

| x range | Section | Notes |
|---|---|---|
| 0–380 | Entrance + **Staff Picks** wall | friends' favourites; each case has that friend's mini sprite clipped to it |
| 380–680 | **New Releases** end-cap | TMDB trending |
| 680–2280 | 8 genre shelves, 200 each | ACTION, COMEDY, HORROR, SCI-FI, DRAMA, ROMANCE, ANIMATED, CULT '80s, each with its own neon sign colour |
| 2280–2520 | **YOUR SHELF** | personal recs, your name in neon above |
| 2520–3000 | **Counter + RICO** | the IDK arcade button sits physically on the counter too |

Interior layers: back wall with shelves (0.85), player layer (1.0), foreground rack and plant silhouettes (1.2, blurred), and volumetric **light beams** with drifting dust particles.

### 6.3 Movement and camera
- Walk speed 90 logical px/s with ease-in/out (accelerate over 120ms). The sprite faces its direction of travel.
- Camera: `x = lerp(x, player.x - 320 + dir*60, 0.08)`, clamped to the world. There's a slight look-ahead in the walk direction.
- Interact prompt: when standing in a section, a floating **`▲ BROWSE SCI-FI`** chip appears above the player (Press Start 2P, bobbing).

### 6.4 Sprites (original characters, `src/game/sprites/`)
- Characters are **16 × 24 px**, drawn as ASCII maps with one char per pixel and a palette key per char. Layers are body/skin, trousers, jacket (recoloured to `look.jacket`), hair style plus colour, and optional shades.
- Frames: **idle ×2** (1px breathing bob, 2 fps) and **walk ×4** (8 fps). Compose once per look into a horizontal sprite sheet on an offscreen canvas, then `toDataURL()` and cache by look hash. Animate with CSS `steps()`.
- **RICO: 24 × 32**, pastel suit over a palm shirt, aviators, slicked hair, gold chain, toothpick. Animations: idle (toothpick wiggle), wave, disc-spin on finger (4 frames), toss (3 frames).
- Name tag above each sprite in the jacket colour (Press Start 2P, 8px logical). Friends get a soft palm-green online dot.

### 6.5 Multiplayer
- **One channel per store:** `store:{code}` (default code `KCL`). Presence carries `PresenceState`, and movement goes over Broadcast `move` at **10 Hz, only while moving**, plus a final stop message.
- Remote sprites **interpolate**: render 100ms behind and lerp between the last two messages.
- **Hover (desktop) or tap (phone) a friend** and a speech-bubble card springs up above their head with their **#1 favourite's** mini case art, title and year, and "♥ ALEX'S FAVE". Clicking the bubble fires `open-film` with source `friend`.
- **Spawn:** a new presence join plays a **glitch-in** at the curb (RGB split, scanline wipe, 400ms) plus a toast: *"{NAME} just pulled up"*.
- **Leave:** the sprite walks off screen left if visible, otherwise it fades.
- **Demo NPCs** (`npc.ts`, host only, `?npcs=1`): 3 labelled demo friends wander between sections, pause at shelves, and occasionally "open" a film. They're broadcast with `isDemo: true` and their name tags read `DEMO`.

### 6.6 Input
- Desktop: ←/→ or A/D to move · ↑, W, E or Enter to interact · Esc or Backspace to go back · **R** for RICO.
- Phone: on-screen ◀ ▶ (hold), **A** interact, **B** back, plus tap-to-walk on the stage.

---

## 7. Overlays and the "disc" flow

All overlays live in a top-level `<OverlayRoot>` and talk to the game through `src/lib/events.ts`. The game pauses input while an overlay is open.

### 7.1 Library (side-scrolling shelf)
- Triggered by interacting at a section. The camera pushes in over 500ms (scale 1 to 2.2 toward the shelf, slight blur), then cuts to `<LibraryView section>`.
- It's a **horizontal row of disc-case spines** standing on a lit shelf, about 18 visible, with scroll via ← →, trackpad, drag or swipe (snap per case).
- Hovering a spine lifts it 6px, adds a neon edge glow in the aisle colour, a 1px chromatic-aberration title, and a tiny tick sound. Friend avatars sit on any case a friend loves.
- Selecting a spine plays the **Disc Open Sequence** (7.2).

### 7.2 Disc Open Sequence (`components/disc/DiscOpenSequence.tsx`), the signature animation
One component used for **every** entry point: shelf, friend bubble, Staff Picks, Your Shelf and RICO.
1. **Pull** (250ms): the case slides out toward camera (translateZ plus scale 1.15) and rotates to face front.
2. **Open** (350ms): the clamshell opens like a book (rotateY −160° on the front cover, perspective 1200px) to reveal the disc.
3. **Spin up** (500ms): the disc lifts, spins 2 turns (ease-out), with an iridescent conic-gradient sheen and the poster as a centre label.
4. **Bloom** (450ms): the movie page reveals from the disc centre with `clip-path: circle(0 → 150%)`, while the disc scales up and fades behind it. Add a short scanline sweep.

Closing plays it in reverse, fast (500ms total). Under reduced motion: crossfade only.

### 7.3 Movie page (`components/movie/MoviePage.tsx`)
The page is styled like a **disc sleeve crossed with a streaming detail page**:
- A full-bleed backdrop (darkened, scanlines, a slow Ken Burns drift) with the poster as case art at left and a 3D tilt that follows the cursor.
- Title in a big neon treatment, then `YEAR · RUNTIME · ★ RATING · GENRES` in VT323, the tagline in Yellowtail, the overview and top-5 cast.
- **WHERE TO WATCH:** a big button per provider: logo plus **"PLAY ▶ ON NETFLIX"**, stream first, then rent and buy. Clicking it plays the NOW PLAYING banner (900ms), opens `watchUrl()` in a new tab and calls `POST /api/watch`.
- **Friends who love this:** mini sprites in a row; hover shows their names.
- **♥ FAVE** toggle (a pixel heart that bursts into pixels) and **SET AS #1**, which updates the presence `favId` so it shows over your head.
- Trailer button opens the YouTube link in a new tab (no embed needed).
- When the source is `rico`, a header strip reads **"RICO'S PICK"** with his portrait and line, typed out.
- The footer carries the attribution: *Film data from TMDB · Streaming availability by JustWatch.*

### 7.4 RICO and "I DON'T KNOW WHAT TO WATCH"
- **IdkButton:** an always-visible arcade push-button in the HUD (bottom-right). It's a chunky domed red/pink button with a bezel and an "INSERT COIN" micro-label, and it presses down 4px with a click sound. The same design appears as a physical object on the counter.
- On press: call `POST /api/rico`. While it loads, **RicoPanel** slides in from the right like a GTA phone call: a pixel portrait of RICO, an animated "RICO IS THINKING…" in VT323, and a spinning disc on his finger.
- On response, RICO's line types out (25ms per char) and RICO **tosses the disc**: it flies along an arc from his hand to screen centre (Motion keyframes, 600ms, with a spin), then runs straight into the **Disc Open Sequence** with source `rico`.
- RicoPanel offers 4 **mood chips** to re-roll: *Make me laugh · Scare me · Date night · Mind-bender*.
- If the API is slow (over 6s) or fails, fall back to a scripted line plus the top recommendation. The user never sees an error.

### 7.5 HUD
- Top-left: the VHS OSD (`PLAY ▶` with a running timestamp; on scene change it flashes `◀◀ REW` then `PLAY ▶`).
- Top-right: an online strip of mini sprite heads plus a count ("4 IN STORE").
- Toasts top-left under the OSD: GTA-style bold boxes ("ALEX just pulled up", "SAM is watching *Alien*").
- Bottom-right: the IDK button.

---

## 8. Motion and visual language

**Art direction:** *Ocean Drive, 9pm, 1986, through a CRT.* The street is a sunset gradient with neon. Inside, the store is dark and lit by neon signs and glowing disc spines, with light beams and drifting dust. Everything sits under a thin scanline and vignette layer.

**Tokens (`src/styles/tokens.css`):**
```css
:root{
  --night:#0B0620; --dusk:#2A0B45; --neon-pink:#FF2E88; --neon-cyan:#00E5FF; --sunset:#FF8A3D;
  --palm:#1DE9B6; --hazard:#FFD300; --cream:#F4E8C1;
  --a-action:#FF8A3D; --a-comedy:#FFD300; --a-horror:#FF3B3B; --a-scifi:#00E5FF;
  --a-drama:#B388FF; --a-romance:#FF2E88; --a-animated:#1DE9B6; --a-cult:#C6FF00;
  --sunset-grad:linear-gradient(180deg,#FFB86B 0%,#FF8A3D 22%,#FF2E88 48%,#7B2CBF 72%,#0B0620 100%);
  --font-neon:'Monoton'; --font-script:'Yellowtail'; --font-banner:'Bungee';
  --font-hud:'Press Start 2P'; --font-term:'VT323'; --font-body:'Inter';
  --ease-out:cubic-bezier(.16,1,.3,1); --ease-snap:cubic-bezier(.68,-0.6,.32,1.6);
}
```
Load the fonts with `next/font/google`.

**Motion catalogue** (each gets a named variant in `src/styles/motion.ts`):

| Moment | Spec |
|---|---|
| Boot | black → white noise 200ms → VHS tracking bars → `PLAY ▶` → sunset fades in → neon sign flickers on (3 stutters) |
| Neon sign | text-shadow flicker, 2 random dips every 6–9s; buzz-on at boot |
| Sun | horizontal bands slide down slowly (8s loop) |
| Palms | 3° sway, 4s, each offset |
| Walk | sprite `steps(4)` at 8 fps; 1px dust puff at each footstep |
| Spawn | glitch-in: 3 offset RGB copies + scanline wipe, 400ms; toast slides in with overshoot |
| Door → interior | door slides 300ms → camera dolly in + white-pink bloom 350ms → cut → interior fades from bloom |
| Shelf push-in | camera scale 1→2.2 + blur 0→4px, 500ms `--ease-out` |
| Spine hover | lift 6px, glow, chromatic title, 120ms |
| Disc open | see §7.2 (1.55s total, interruptible) |
| Friend bubble | spring pop (stiffness 500, damping 22) + title typewriter |
| RICO toss | arc keyframes 600ms + 2 spins, lands into Disc Open |
| PLAY / NOW PLAYING | black band sweeps L→R, Bungee text in sunset gradient, 900ms, then opens the link |
| Scene change | `◀◀ REW` OSD + 250ms VHS glitch |
| Ambient | light beams pulse 6s, dust particles drift (CSS, about 40 particles), CRT flicker 0.5% opacity |

Rules: animate only `transform`, `opacity`, `filter` and `clip-path`. Never animate layout. Aim for 60 fps on a mid laptop. Test with 5 sprites plus NPCs.

---

## 9. Data flow (summary; `BACKEND.md` is the source of truth)

- Boot loads `catalogue.json` once into memory (`lib/catalogue.ts`). Search uses `searchVault(q)`; opening anything uses `getTitle(id)` (`lib/vault.ts`).
- Join calls `POST /api/join`, which returns `userId` (stored in `localStorage`, wrapped in try/catch). Then it subscribes to `store:{code}` with presence.
- On load: `GET /api/store-state?code=` returns profiles plus favourites, which hydrate Staff Picks and the friends map.
- Fave calls `POST /api/favourite` and also broadcasts `fav`. Every client updates Staff Picks instantly.
- Open calls `POST /api/open` (fire-and-forget) and broadcasts `open` (drives "SAM is browsing…" toasts).
- Play calls `POST /api/watch` and broadcasts `watch`.
- `GET /api/recs?userId=` returns `RecItem[]` for YOUR SHELF.
- `POST /api/rico` returns `RicoPick`.

---

## 10. Agent workflow in JetBrains Air

- Every task in `TASKS.md` is self-contained: **goal, files, depends-on, acceptance criteria.** Run independent tasks in parallel, one agent per task, each on its own branch `agent/<task-id>`.
- Before coding: read CLAUDE.md, the relevant part of BACKEND.md, and `src/lib/types.ts`.
- While coding: stay inside the task's file list. Use mock data from `src/lib/mocks.ts` if a dependency isn't merged yet.
- Before finishing: `npm run typecheck && npm run lint` must pass. Write a 5-line summary covering what you built, how to test it, the files touched, any TODOs for other lanes, and screenshots if it's UI.
- The human (Vinu) reviews diffs in IntelliJ, merges, and deploys. Screenshot Air running 3 agents at once for the pitch.

### 10.1 Air mechanics (IntelliJ IDEA 2026.3, Air plugin is bundled)

**Human, per task:** check out `main` and pull (Air worktrees branch from whatever is checked out). Then in the agent widget (main toolbar), choose **New Session**, then run mode **New Local Worktree**, then Custom Worktree Settings, and name the branch `agent/<task-id>`. Paste this prompt:
```
TASK: <task-id> from TASKS.md. Lane: <BE|GAME|UI>.
Read CLAUDE.md (and BACKEND.md if BE). Only touch the task's file list.
Done = acceptance criteria met + `npm run typecheck && npm run lint` pass + 5-line summary.
```
Review the diff in IntelliJ, merge to `main` and push. Delete the worktree only after merging, because deleting it discards uncommitted work.

**Agent, in a worktree:**
- The first command is `npm run worktree:setup`. Worktrees don't get `.env.local` or `node_modules`, and this copies or installs them.
- If port 3000 is taken by the main checkout, run dev on 3001+: `npx next dev -p 3001`.
- Commit only to your `agent/<task-id>` branch. Never push to `main`, never merge, and never edit `src/lib/types.ts` after T0.
- Don't edit `AGENTS.md`, because it's generated from this file.

---

## 11. Definition of done
- Works on the deployed Vercel URL on desktop Chrome **and** an iPhone/Android in portrait.
- No console errors, and typecheck plus lint pass.
- Loading and fallback states exist. Nothing blank, nothing red.
- Uses tokens only: no default Tailwind greys, no blue links, no system fonts.

## 12. Priorities (cut from the bottom)
- **P0:** street → door → interior side-scroll, procedural sprites, shelves → library → Disc Open → movie page with working watch links, QR join + spawn, live friends with name tags.
- **P1:** hover a friend to see their fav bubble, Staff Picks live, IDK button + RICO + toss, YOUR SHELF recs, toasts, NOW PLAYING banner, boot sequence.
- **P2:** demo NPCs, mood chips, emotes, sound, light beams/dust, trailer button, BBS chat terminal.

---

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

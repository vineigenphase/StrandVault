# TASKS.md: StrandVault

> One task = one Air session = one branch `agent/<task-id>`. Read `CLAUDE.md` (plus `BACKEND.md` for BE) first. Only touch the files listed for your task. Done = acceptance criteria met, `npm run typecheck && npm run lint` pass, and a 5-line summary.
> Priorities follow CLAUDE.md §12. **P0 tasks first.** If time runs short, cut from the bottom of each wave.

## Waves at a glance

| Wave | Runs | Tasks (✅ = safe to run at the same time) |
|---|---|---|
| **0** | solo, ~25 min | **T0** contracts, mocks, event bus, stubs. Blocks everything. |
| **1** | parallel | ✅ BE1 · ✅ BE2 · ✅ G1 · ✅ G2 · ✅ U1 · ✅ U2 · ✅ U3 |
| **2** | parallel | ✅ BE3 → BE4 (BE4 after BE3) · ✅ G3 · ✅ G4 · ✅ U4 · ✅ U5 · ✅ U6 |
| **3** | parallel | ✅ G5 (integration, demo path) · ✅ G6 · ✅ U7 · ✅ U8 · ✅ BE5 |
| **4** | everyone | **F1** demo hardening, deploy, rehearsal |

**Why the waves don't conflict:** T0 creates every shared file (types, events bus, `api.ts` signatures, `OverlayRoot`, and component stubs with their final props). Later tasks only fill in files they own. Nobody else edits `OverlayRoot.tsx` or `Game.tsx` after T0, except G5 (integration), which runs last.

**Package deps:** only these tasks may touch `package.json`: G5 (QR library) and U7 (none expected). Anyone else who needs a dep leaves a `// TODO(GAME): add dep X` and asks.

**Suggested Air layout (3 agents live, for the pitch screenshot):** Wave 1 = BE1 + G1 + U2 first, then BE2 + G2 + U1 + U3 as slots free up.

---

## T0: Contracts, mocks, event bus, page shells *(GAME · P0 · solo · ~25 min)*

**Goal:** lock every shared interface so 3+ agents can build in parallel against stable imports and mock data.

**Files (create or edit):**
- `src/lib/types.ts`: append the wire types from BACKEND.md §5.0 (`Mood`, `Friend`, `StaffPick`, `*Req`/`*Res`). Then **freeze it.**
- `src/lib/mocks.ts`: 24 mock films (3 per aisle, with real-looking fields, TMDB poster URLs, ≥1 provider each including netflix/prime/disney), 4 mock `Friend`s, `mockRecs: RecItem[]`, `mockRicoPick: RicoRes`, and `mockLook: Look`.
- `src/lib/events.ts`: a typed bus with `emit(e: GameEvent)`, `on(type, fn) → unsubscribe`, and a React hook `useGameEvent(type, fn)`. Plus a second channel for app events that aren't `GameEvent`s: `toast(text)`, `presence-join(PresenceState)`, `now-playing(filmId, provider)`.
- `src/lib/api.ts`: final signatures from BACKEND.md §5.2, returning mocks after a 200–600ms fake delay.
- `src/lib/catalogue.ts`: final signatures from BACKEND.md §4.3, backed by mocks.
- `src/lib/links.ts`: final signatures, with the search-URL fallback already working (it's tiny).
- `src/game/Game.tsx`: `export default function Game({ scene, host }: { scene: 'street'|'interior'; host?: boolean })`, rendering a placeholder 640×360 stage.
- `src/components/OverlayRoot.tsx`: listens to the bus and mounts `LibraryView`, `DiscOpenSequence` → `MoviePage`, `RicoPanel` and `Hud`. Keeps the overlay state machine: `none | library(section) | disc(filmId, source, from, ricoLine) | rico`.
- Stubs with **final props** (each renders a labelled placeholder box):
  - `components/library/LibraryView.tsx` `{ section: Section; onPick(filmId, from: {x,y}): void; onClose(): void }`
  - `components/disc/DiscOpenSequence.tsx` `{ film: Film; from?: {x,y}; onDone(): void; closing?: boolean; children: ReactNode }` (children = the movie page revealed by the bloom)
  - `components/movie/MoviePage.tsx` `{ film: Film; source: OpenSource; ricoLine?: string; friends: Friend[]; onClose(): void }`
  - `components/rico/RicoPanel.tsx` `{ onPick(res: RicoRes): void; onClose(): void }`
  - `components/rico/IdkButton.tsx` `{ onPress(): void; variant?: 'hud'|'counter' }`
  - `components/hud/Hud.tsx` `{ online: PresenceState[] }` (composes OSD, Toasts, MiniStrip, IdkButton)
- Page shells: `src/app/page.tsx` (`<Game scene="street" host/>` + `<OverlayRoot/>`), `src/app/join/page.tsx` (UI fills it in), `src/app/play/page.tsx` (`<Game scene="street"/>` + controls placeholder + `<OverlayRoot/>`). Wrap anything that reads `searchParams` in `<Suspense>` (Cache Components is on).
- `src/styles/motion.ts`: an empty named-variant skeleton (`export const boot = {}`, etc.) for UI to fill in.

**Depends on:** nothing.

**Acceptance:**
- `npm run preflight` passes. `/`, `/join` and `/play` render without console errors.
- A dev-only button (or `window.__emit`) can fire `open-film` and the stub chain disc → movie page appears.
- `types.ts` has the header `// FROZEN after T0`.

---

## Wave 1 (all parallel after T0)

### BE1: THE VAULT build + loaders *(BE · P0 · ~20 min)* ✅ code merged (agent/vault)
**Goal:** a real `public/catalogue.json` + `vault-index.json` + Supabase `titles`, and working watch links.
**Files:** `public/catalogue.json`, `public/vault-index.json`, `public/posters/*` (generated). Code already in: `scripts/build-db.ts`, `supabase/titles.sql`, `src/lib/server/{db,tmdb,titles,catalogue}.ts`, `src/lib/{catalogue,vault,links}.ts`, `/api/search`, `/api/title/[appId]`.
**Depends on:** a TMDB token + Supabase project in `.env.local` (DATA.md §3).
**Steps:** run `supabase/titles.sql` → `npm run db:build:quick` (wiring check, ~30s) → `npm run db:build -- --images` → commit the generated JSON (+ posters).
**Acceptance:**
- `catalogue.json` has 16 per aisle (≤ 25% TV), every film has a poster, overview and a stream/free provider.
- `/api/search?q=interstelar` finds Interstellar; `?q=keanu` finds John Wick; with `DEMO_OFFLINE=1` the client still finds titles via `vault-index.json`.
- `/api/title/-1399` returns Game of Thrones (TV app ids are negative).
- The store renders the real catalogue (no mock titles) and falls back to mocks if the file is removed.

### BE2: Supabase schema, clients, core routes, personas *(BE · P0 · ~50 min)* ✅ merged (PR #1)
**Goal:** persistence for profiles, favourites and events, plus the store-state route.
**Files:** `supabase/schema.sql`, `.env.example`, `src/lib/supabase.ts`, `src/lib/server/supabase.ts`, `src/app/api/join/route.ts`, `src/app/api/favourite/route.ts`, `src/app/api/open/route.ts`, `src/app/api/watch/route.ts`, `src/app/api/store-state/route.ts`, `src/lib/api.ts` (swap mocks for real fetches for these five), `scripts/seed-personas.ts`.
**Depends on:** T0. Uses catalogue IDs from `mocks.ts` until BE1 merges, then re-points the persona favourites at real IDs.
**Acceptance:**
- The schema from BACKEND.md §3.1 is applied in Supabase with RLS on.
- `curl -X POST /api/join` returns a `userId`. With the env removed it still returns 200 with `offline:true`.
- Fave on, then set-top, shows up in `/api/store-state` with the right `staffPicks` ordering.
- `npm run seed:personas` is idempotent (running it twice still gives 6 demo profiles).
- The §8 security grep is clean.

### G1: Engine core: stage, loop, camera, input, layouts, zones *(GAME · P0 · ~60 min)*
**Goal:** walk a placeholder rectangle along the street, through the door into the interior, with zone events firing.
**Files:** `src/game/Game.tsx`, `loop.ts`, `camera.ts`, `input.ts`, `world/street.ts`, `world/interior.ts`, `zones.ts`, `entities/Player.tsx`.
**Depends on:** T0.
**Acceptance:**
- 640×360 stage at the largest integer scale, pixelated, with sunset letterbox. Phone portrait puts the stage at the top.
- A single rAF loop with **no React state per frame** (check with React DevTools: no re-renders while walking).
- Walk speed 90 px/s with a 120ms ease. Camera lerp 0.08 with look-ahead, clamped to the world.
- Street (1280) → door zone at x 1020–1080 → enter transition (placeholder fade OK) → interior (3000) with the section x-ranges from CLAUDE.md §6.2.
- Zones emit `{type:'zone'}` on change. Interact emits `open-library` and a `▲ BROWSE SCI-FI` chip shows. `R` emits `rico`, and Esc emits `close`.
- Input pauses while an overlay is open (listens for bus open/close).
- Holds 60 fps with 8 dummy sprites.

### G2: Procedural pixel sprites *(GAME · P0 · ~50 min, fully independent)*
**Goal:** original 16×24 characters and the 24×32 RICO, composed from ASCII maps into cached sprite sheets.
**Files:** `src/game/sprites/pixel.ts`, `src/game/sprites/characters.ts`, `src/game/sprites/rico.ts`, `src/app/dev/sprites/page.tsx` (a dev gallery, deleted in F1).
**Depends on:** T0 (`Look` type only).
**Acceptance:**
- `sheetFor(look): { url: string; frameW: 16; frameH: 24; idle: [0,1]; walk: [2,3,4,5] }`, cached by look hash. Composition takes under 5ms per look.
- All 5 hair styles, shades on/off and arbitrary jacket and skin colours render correctly in `/dev/sprites`.
- RICO sheet: idle (toothpick wiggle) ×2, wave ×2, spin-disc ×4, toss ×3.
- `miniHead(look)` returns a 12×12 head data URL (for the HUD strip, Staff Picks tags and FriendsWhoLove).
- Original art only.

### U1: Scene art components *(UI · P0 · ~60 min, fully independent)*
**Goal:** the street and interior look gorgeous as pure presentational components in logical px.
**Files:** `src/components/scene/*` (SunsetSky, Skyline, Palms, Storefront, NeonSign, ShelfUnit, Counter, LightBeams, Car), `src/styles/fx.css`, `src/styles/globals.css` (keyframes only).
**Depends on:** T0.
**Acceptance:**
- Each component takes `{ width?, x?, … }` in logical px and renders crisply at ×3 with no blurry scaling of pixel parts.
- Striped sun bands scroll (8s), windows blink, palms sway 3° with offsets, the neon sign flickers on (3 stutters) with random dips every 6–9s, and the door has an `open` prop (300ms slide).
- `ShelfUnit` takes `aisle` and uses its `--a-*` neon colour plus the sign label.
- `LightBeams` pulse with about 40 dust particles, CSS only.
- Only tokens from `tokens.css`. `prefers-reduced-motion` stops the ambient loops.
- Exports a `SceneGallery` (rendered on `/dev/scene`) for review.

### U2: Library view + Disc Open Sequence *(UI · P0 · ~70 min)*
**Goal:** the signature moment: a shelf of spines, then pull, open, spin, bloom.
**Files:** `src/components/library/LibraryView.tsx`, `DiscCase.tsx`, `CaseSpine.tsx`, `src/components/disc/DiscOpenSequence.tsx`.
**Depends on:** T0 (mocks + catalogue signatures).
**Acceptance:**
- About 18 spines visible. Scrolls with ← →, wheel/trackpad, drag and swipe, snapping per case. Hover lifts 6px with glow and a chromatic title (120ms).
- Friend mini-avatars render on cases a friend loves (using `miniHead` if G2 has merged, otherwise coloured dots).
- Disc Open runs pull 250 → open 350 → spin 500 → bloom 450 (`clip-path: circle()` from the disc centre), with a scanline sweep. Reverse close takes 500ms. It's interruptible.
- `from` coordinates make the sequence start from the clicked spine or bubble.
- Reduced motion swaps it for a crossfade. Works on a phone in portrait with 44px+ targets.

### U3: Movie page + watch flow *(UI · P0 · ~60 min)*
**Goal:** a sleeve-meets-streaming detail page with working PLAY buttons.
**Files:** `src/components/movie/MoviePage.tsx`, `WatchButtons.tsx`, `FriendsWhoLove.tsx`, `TrailerButton.tsx`, `src/components/hud/NowPlayingBanner.tsx`.
**Depends on:** T0.
**Acceptance:**
- Backdrop with Ken Burns drift and scanlines. Poster case art with cursor tilt. Neon title, a VT323 meta row, a Yellowtail tagline, the overview, and the top-5 cast.
- One button per provider via `sortProviders()`, reading **"PLAY ▶ ON NETFLIX"**. Clicking it opens `watchUrl()` in a new tab **synchronously**, then plays the NOW PLAYING banner (900ms), calls `api.watch()` and emits `now-playing`.
- No providers: one "FIND IT ON TMDB" button (never empty).
- ♥ FAVE pixel-burst toggle and SET AS #1 (call `api.favourite`, emit on the app bus for G3 to broadcast and re-track).
- The `rico` source shows the "RICO'S PICK" strip with the line typed out at 25ms per char.
- TMDB/JustWatch attribution in the footer. Scrolls on a phone. Esc or B closes.

---

## Wave 2 (parallel; start each as soon as its deps merge)

### BE3: `/api/recs` route *(BE · P1 · ~20 min)* ✅ merged (PR #1, runs the engine via scoreRecs)
**The engine is built** (`src/lib/recs.ts`, BACKEND.md §6, verified). This task is only the route.
**Files:** `src/app/api/recs/route.ts`, `src/lib/api.ts` (the `recs` wrapper only: fetch the route first, keep the local engine as fallback).
**Depends on:** BE2 (DB helpers). Uses `serverCatalogue()` from `lib/server/catalogue.ts`.
**Acceptance:** builds `Signals` from `favourites` + `events` (watch/open, with `created_at` as `at`) + store friends' names, calls `recommend(films, signals, { k: 18 })`, returns `RecsRes`. A user with 0 faves gets `trendingFallback()` with `fallback:true`. DB down → same fallback, never a 500. Also expose `GET /api/recs?userId=&rows=1` → `personalRows()` for YOUR SHELF rows.

### BE4: RICO route, £0 *(BE · P1 · ~30 min)* ✅ merged (PR #1, £0 unless OPENAI_API_KEY is set)
**Files:** `src/app/api/rico/route.ts`, `src/lib/rico-lines.ts` (isomorphic line bank + `localRicoPick()`), `src/lib/api.ts` (the `rico` wrapper only).
**Depends on:** BE3 (or call `recommend()` directly; it's merged).
**Acceptance:** exactly BACKEND.md §7: no LLM, no key. Mood re-rolls stay within their mood; 5 re-rolls give ≥ 3 distinct films (weighted top-5 + `exclude`); ≥ 4 lines per reason bucket; always 200 in under 50ms; the client wrapper runs `localRicoPick()` if the route is unreachable.

### G3: Multiplayer *(GAME · P0 · ~60 min)*
**Goal:** friends walk the same store live, with spawn glitch, toasts, and hover/tap fav bubbles.
**Files:** `src/lib/realtime.ts`, `src/game/entities/RemotePlayer.tsx`, `src/game/Game.tsx` (mounting remotes only).
**Depends on:** G1, BE2 (or a mock `userId` with Realtime on).
**Acceptance:**
- `useStore(code)` returns `{ online, me, sendMove, sendBroadcast, setFav }`. Presence tracks `PresenceState`. Movement goes out at 10 Hz only while moving, plus one stop message.
- Remotes render 100ms behind and lerp between the last two messages. Name tag in the jacket colour plus an online dot.
- A join triggers `presence-join` → glitch-in at the curb plus the toast *"ALEX just pulled up"*. A leave walks off left (or fades).
- Hover (desktop) or tap (phone) springs a bubble (stiffness 500, damping 22) showing their #1's case, title, year and "♥ ALEX'S FAVE". Clicking it emits `open-film` with source `friend` and `from`.
- `fav`/`open`/`watch` broadcasts produce toasts ("SAM is watching *Alien*") and update Staff Picks live.
- Tested with 2 browsers plus 1 phone. Works with Supabase down (solo mode, no errors).

### G4: RICO entity + counter + interior hookups *(GAME · P1 · ~35 min)*
**Files:** `src/game/entities/Rico.tsx`, `src/game/world/interior.ts` (counter zone, IDK-on-counter hotspot).
**Depends on:** G1, G2.
**Acceptance:** RICO idles at the counter, waves when the player is within 120px, and plays the spin-disc animation while a `rico` request is pending (bus). Interacting at the counter or the physical IDK button emits `rico`.

### U4: Join flow *(UI · P0 · ~50 min)*
**Files:** `src/app/join/page.tsx`, `src/components/join/LookPicker.tsx`, `src/components/join/FavPicker.tsx`.
**Depends on:** T0. Uses `sheetFor()` from G2 if merged, otherwise a coloured block (`// HACK`).
**Acceptance:** portrait-first, three steps (NAME → LOOK → #1 FAVE), with a live sprite preview. FavPicker is a swipeable disc carousel plus search (`catalogue.search`). Submit calls `api.join`, stores `userId` in `localStorage` (try/catch), then goes to `/play?code=`. Works offline (`offline:true`). 44px targets. No system fonts or blue links.

### U5: IDK button + RICO panel + toss *(UI · P1 · ~50 min)*
**Files:** `src/components/rico/IdkButton.tsx`, `RicoPanel.tsx`, `RicoToss.tsx`, `RicoPortrait.tsx`.
**Depends on:** T0 (mock `api.rico`).
**Acceptance:** a domed arcade button with bezel and "INSERT COIN", pressing down 4px. The panel slides in like a phone call with "RICO IS THINKING…" and a spinning disc. The line types out, then the toss arc (600ms, 2 spins) lands at centre and calls `onPick` → OverlayRoot runs Disc Open with source `rico`. 4 mood chips re-roll. Never shows an error (the mock throwing is still handled).

### U6: HUD + FX + boot *(UI · P1 · ~50 min)*
**Files:** `src/components/hud/Hud.tsx`, `Osd.tsx`, `Toasts.tsx`, `MiniStrip.tsx`, `src/components/fx/*` (CrtOverlay, VhsGlitch, NeonText, ScanlineWipe, Bloom, BootSequence), `src/styles/motion.ts`.
**Depends on:** T0.
**Acceptance:** OSD `PLAY ▶ 00:14:32` ticking, flashing `◀◀ REW` on scene change. GTA-style toasts slide in with overshoot, stack to 3 and auto-dismiss at 4s. MiniStrip shows heads plus "4 IN STORE". Boot runs noise → tracking bars → PLAY → fade (skippable on click). CRT overlay toggle with `C`. Every motion catalogue entry (CLAUDE.md §8) has a named variant in `motion.ts`. Reduced motion respected.

---

## Wave 3

### G5: Integration: host + phone + full demo path *(GAME · P0 · ~60 min, starts once G1, G3, U1, U2, U3 have merged)*
**Goal:** the 90-second demo works end to end on the deployed URL.
**Files:** `src/app/page.tsx`, `src/app/play/page.tsx`, `src/game/Game.tsx`, `src/game/world/*`, `src/components/OverlayRoot.tsx`, `src/components/hud/TouchControls.tsx`, `src/components/hud/QrSign.tsx`, `package.json` (a QR lib such as `qrcode`).
**Acceptance:**
- Host `/`: street with U1 art layered at the right parallax factors (0 / 0.2 / 0.5 / 1.0 / 1.3), plus a neon "SCAN TO PULL UP" QR pointing to `${NEXT_PUBLIC_SITE_URL}/join?code=KCL`.
- Door → bloom → interior with shelves per section, YOUR SHELF fed by `api.recs`, and Staff Picks fed by `api.storeState` plus live broadcasts.
- Phone `/play`: Game-Boy controls (◀ ▶ hold, A, B), tap-to-walk, and the IDK button.
- Every entry point (shelf, friend bubble, Staff Picks, Your Shelf, RICO) runs through the same `DiscOpenSequence`.
- Scene change triggers OSD REW plus a VHS glitch.
- The whole CLAUDE.md §0 script works on the Vercel URL on desktop Chrome and a phone.

### G6: Demo NPCs *(GAME · P2 · ~30 min)*
**Files:** `src/game/npc.ts`.
**Depends on:** G3, BE2 (persona IDs).
**Acceptance:** with `?npcs=1` on the host only, 3 personas (`isDemo:true`, tag `DEMO`) wander between sections, pause at shelves, occasionally broadcast `open`, and stop when the tab is hidden.

### U8: Vault search kiosk *(UI · P1 · ~40 min)*
**Goal:** search ANY movie or show (THE VAULT) from inside the store.
**Files:** `src/components/vault/VaultTerminal.tsx`, `src/components/vault/VaultResults.tsx`.
**Depends on:** vault code (merged). Mounted by G5 on `{ type: 'open-search' }` (a CRT kiosk near the entrance, or the HUD).
**Acceptance:** a CRT-styled input with debounced `searchVault(q)` (250ms), results as a disc-case grid (TV shows as box sets with seasons), keyboard + touch friendly, loading shimmer and an empty state ("NO TAPE FOUND. TRY ANOTHER TITLE"). Picking a result calls `getTitle(id)` then emits `open-film` with source `search`. Never shows an error.

### U7: Polish pack *(UI · P2 · ~40 min)*
**Files:** `public/audio/*` (royalty-free only, with licences noted in the summary), `src/components/fx/Sound.tsx`, emote UI in `src/components/hud/Emotes.tsx`.
**Depends on:** U6.
**Acceptance:** UI blips (tick, press, whoosh, PLAY), muted by default with a toggle, plus optional synthwave loop. Emotes (wave/dance/thumbs) emit to the bus for G3 to broadcast. No copyrighted music.

### BE5: Hardening *(BE · P1 · ~20 min)*
**Files:** `src/app/api/**`, `src/lib/server/**`.
**Depends on:** BE2–BE4.
**Acceptance:** BACKEND.md §8 checklist all ticked. Every route returns its fallback with each env var removed one at a time (log the matrix in the summary). Vercel env vars are set for Production and Preview.

---

## F1: Demo hardening *(everyone · last 30 min)*
- `npm run preflight` is green on `main`. Deploy and test on the Vercel URL with desktop Chrome, an iPhone and an Android.
- Delete the `/dev/*` pages. Check for no console errors, nothing blank and nothing red.
- Pre-seed personas. Do one dry run of the CLAUDE.md §0 script with a stopwatch.
- Backup plan: if Supabase is down, solo mode plus `?npcs=1` still tells the story.
- Take the screenshot of Air running 3 agents for the pitch deck.

## Dependency graph

```
T0 ─┬─ BE1 ─┬─ BE3 ── BE4 ─┐
    ├─ BE2 ─┘     │        ├─ BE5
    │             └────────┘
    ├─ G1 ──┬─ G3 ── G6
    │       ├─ G4 (needs G2)
    ├─ G2 ──┘
    ├─ U1 ─────────┐
    ├─ U2 ─────────┼─ G5 (integration) ── F1
    ├─ U3 ─────────┤
    ├─ U4  U5  U6 ─┘── U7
```

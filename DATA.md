# DATA.md: THE VAULT (StrandVault's movie and TV database)

> Every movie and TV show people actually watch, with descriptions, cast, trailers, GB certification and **where to stream it in the UK**, all searchable in our own Supabase database. And anything that *isn't* in it yet gets fetched and stored the first time someone searches for it.
>
> **Cost: £0.** It uses the free TMDB API and the free Supabase tier.

---

## 1. Where the data comes from (and why not Google or IMDb)

| Source | Verdict |
|---|---|
| **TMDB** (themoviedb.org) | ✅ **Used.** A free API key. It covers about 1M movies and about 200k shows, with descriptions ("overview"), taglines, cast, trailers, posters and UK streaming providers (via JustWatch). It's the same kind of short description Google shows. |
| Google's description panels | ❌ There's no public API for them, and scraping Google breaks their terms. TMDB's overview is the legit equivalent. |
| IMDb | ⚠️ IMDb's free datasets have titles, years and ratings but **no plot descriptions**, and they're licensed for non-commercial use only. Scraping IMDb breaks their terms. We still **store every title's `imdb_id`**, so we can link to IMDb pages. |

We have to show this attribution in the footer: *"Film data from TMDB · Streaming availability by JustWatch."* We use the TMDB API but aren't endorsed by them.

---

## 2. How "every movie and show" works

1. **The preload:** `npm run db:build` pulls the **top 5,000 movies + 2,000 shows** in full detail into Supabase. The selection is half all-time classics (by vote count) and half what's popular right now. That covers essentially everything anyone types at a demo. You can go bigger with `--movies=10000 --tv=4000`.
2. **The long tail:** `/api/search` searches the vault first. If it finds fewer than 6 results, it asks TMDB live, fetches the details, **stores them in the vault** and returns them. So the database grows to cover anything anyone searches for. That's every title on TMDB, about 1.2M of them, without downloading them all up front.
3. **Offline safety:** the build also writes `public/vault-index.json`, a tiny index of every preloaded title. If the network or database dies mid-demo, search still works from that file.

---

## 3. Setup (≈10 minutes, BE lane)

1. **TMDB key:** sign up at themoviedb.org → Settings → API, then copy the **API Read Access Token** (the long one). A v3 API key also works.
2. **`.env.local`:**
   ```
   TMDB_TOKEN=...                # server + scripts only, never NEXT_PUBLIC_
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   WATCHMODE_KEY=...             # optional: direct "play" links for shelf titles
   ```
   Add `TMDB_TOKEN` to Vercel env as well (live search needs it).
3. **Supabase:** in the SQL editor, run `supabase/titles.sql` (after `schema.sql`). It's safe to re-run.
4. **Install + scripts:**
   ```bash
   npm i @supabase/supabase-js dotenv && npm i -D tsx
   ```
   ```json
   "db:build": "tsx scripts/build-db.ts",
   "db:build:quick": "tsx scripts/build-db.ts --movies=600 --tv=200"
   ```
   Add `scripts/.cache/` to `.gitignore`.
5. **Run:** `npm run db:build:quick` first (about 30s, to check everything's wired), then `npm run db:build` (about 4–6 min first time; reruns take seconds thanks to the cache). For demo day, add `--images` (local posters for shelf titles) and optionally `--watchmode`.

**This replaces `scripts/seed-catalogue.ts`** (BACKEND.md §4). `build-db` writes `public/catalogue.json` too, in the same `Film[]` shape, so nothing in the UI changes.

---

## 4. What's in the box

| File | What it does |
|---|---|
| `supabase/titles.sql` | `titles` table, full-text + fuzzy search indexes, and the `search_titles(q, media, lim)` function. Tested on Postgres 16. |
| `scripts/build-db.ts` | Builds the vault: Supabase, `catalogue.json` (16 per aisle, up to 25% TV box sets), `vault-index.json`, optional posters and Watchmode links. Rate-limited, retrying, resumable. |
| `src/lib/server/tmdb.ts` | TMDB client (rate limit 35 req/s, retries on 429/5xx, v3 or v4 auth) |
| `src/lib/server/titles.ts` | TMDB → `TitleRow` → `Film` mapping, aisle rules, provider mapping, upsert |
| `src/lib/server/db.ts` | Service-role Supabase client (scripts + routes) |
| `src/app/api/search/route.ts` | `GET /api/search?q=&type=movie\|tv&limit=` returns `{ results: Film[], source }` |
| `src/app/api/title/[appId]/route.ts` | `GET /api/title/603` or `/api/title/-1399` returns `Film` (vault first, then TMDB, then stored) |
| `src/lib/vault.ts` | **Client** helpers: `searchVault(q)` (API, then offline index fallback) and `getTitle(id)` (shelf catalogue, then API) |
| `src/lib/types.ts` | The shared types with **additive, optional** vault fields (§5) |

**Verified:** strict TypeScript passes. The schema applies and re-runs cleanly on Postgres 16. Search handles typos ("interstelar" finds Interstellar), cast ("keanu" finds The Matrix and John Wick) and plot words ("heist"). A full dry run against a mocked TMDB produced the right catalogue, box sets and index. The routes fall back to live TMDB when the database is down. **Not yet run against the real TMDB API.** The first `db:build:quick` is that test.

---

## 5. App integration rules

- **App id:** `Film.id` = TMDB id for movies and **−TMDB id for TV shows**. Movie 1399 and Game of Thrones (TV 1399 → −1399) never collide, and `favourites.film_id` stays an `int`. Use `fromAppId()` / `toAppId()` from `titles.ts`. Never strip the sign.
- **New optional `Film` fields:** `mediaType`, `imdbId`, `seasons`, `episodes`, `certification`, `tmdbWatchLink`. Existing code keeps working.
- **TV genres** are normalised to movie genre ids (Action & Adventure → Action + Adventure, Sci-Fi & Fantasy → Sci-Fi + Fantasy), so aisles and recs treat shows like films.
- **Aisle rules:** animation → ANIMATED; any 1980–1989 title → CULT '80s; otherwise horror → sci-fi → comedy → romance → action/thriller/war/western → drama.
- **Opening anything:** call `getTitle(id, catalogue.byId)` and pass it to the Disc Open Sequence. It works for shelf titles (instant), search results and friends' favourites that aren't on any shelf.
- **Watch links:** `watchUrl()` in `links.ts` stays the single source. Provider `url` is empty unless Watchmode filled it, then falls back to the provider's search page, then the TMDB watch page (`tmdbWatchLink`).

---

## 6. Size and limits

- About 7,000 titles ≈ 25–40 MB in Postgres including indexes, well inside Supabase Free (500 MB). 10k + 4k is still comfortable.
- The live-search fallback makes at most 7 TMDB calls per search and stores the results, so repeat searches hit the database only.
- `vault-index.json` ≈ 0.6 MB for 7k titles. It's loaded only when search opens.

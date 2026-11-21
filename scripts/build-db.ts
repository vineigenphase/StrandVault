/**
 * StrandVault · build THE VAULT
 *
 *   npm run db:build                      # 5,000 movies + 2,000 TV shows (≈4–6 min first run, seconds after)
 *   npm run db:build -- --movies=10000 --tv=4000
 *   npm run db:build:quick                # 600 movies + 200 shows, for testing
 *
 * Flags: --movies=N --tv=N --min-votes=N --region=GB --shelf=16 --images --watchmode --no-db --fresh
 *
 * Outputs:
 *   Supabase  `titles` table          every title, full detail, searchable (run supabase/titles.sql first)
 *   public/catalogue.json             the curated shelf set (16 per aisle, movies + shows) the store renders offline
 *   public/vault-index.json           tiny index of EVERY title for instant/offline search
 *   public/posters/*                  (--images) local poster copies for shelf titles
 *
 * Cache: scripts/.cache/  so re-runs and crashes resume instantly. Add it to .gitignore.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- TMDB/Watchmode responses are untyped JSON */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createTmdb, getDetail, TmdbNotFound, type Media } from '../src/lib/server/tmdb';
import { mapDetail, rowToFilm, upsertRows, mapProvider, type TitleRow } from '../src/lib/server/titles';
import { getServiceClient } from '../src/lib/server/db';
import type { Aisle, Film } from '../src/lib/types';

// Node's built-in env loader (no dotenv dependency). Missing files are fine.
for (const f of ['.env.local', '.env']) {
  try { process.loadEnvFile(f); } catch { /* not present */ }
}

// ---------- args ----------
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  }),
);
const N_MOVIES = Number(args.movies ?? 5000);
const N_TV = Number(args.tv ?? 2000);
const MIN_VOTES = Number(args['min-votes'] ?? 50);
const REGION = String(args.region ?? process.env.NEXT_PUBLIC_REGION ?? 'GB');
const SHELF = Number(args.shelf ?? 16);
const WANT_IMAGES = args.images === 'true';
const WANT_WATCHMODE = args.watchmode === 'true';
const NO_DB = args['no-db'] === 'true';
const FRESH = args.fresh === 'true';

const CACHE = path.join('scripts', '.cache');
const DETAIL_CACHE = path.join(CACHE, 'tmdb');
const AISLES: Aisle[] = ['action', 'comedy', 'horror', 'scifi', 'drama', 'romance', 'animated', 'cult'];

const tmdb = createTmdb({ rps: 35, concurrency: 8 });

// ---------- helpers ----------
async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}
const readJson = async <T>(p: string): Promise<T | null> => {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; } catch { return null; }
};
const log = (...a: unknown[]) => console.log('[vault]', ...a);

// ---------- 1. collect ids ----------
async function collectIds(media: Media, target: number): Promise<number[]> {
  const ids = new Set<number>();
  // half from all-time most-voted (classics), half from current popularity (what people watch now)
  const passes: [string, number][] = [
    ['vote_count.desc', Math.ceil(target / 2)],
    ['popularity.desc', target],
  ];
  for (const [sort, goal] of passes) {
    for (let page = 1; page <= 500 && ids.size < goal; page++) {
      const j = await tmdb.get(`/discover/${media}`, {
        sort_by: sort,
        'vote_count.gte': MIN_VOTES,
        include_adult: false,
        language: 'en-US',
        page,
      });
      (j.results ?? []).forEach((r: any) => ids.add(r.id));
      if (page >= (j.total_pages ?? 1)) break;
    }
  }
  return [...ids].slice(0, target);
}

async function trendingIds(media: Media): Promise<Set<number>> {
  const s = new Set<number>();
  for (const page of [1, 2]) {
    const j = await tmdb.get(`/trending/${media}/week`, { page });
    (j.results ?? []).forEach((r: any) => s.add(r.id));
  }
  return s;
}

// ---------- 2. details (cached) ----------
async function detailCached(media: Media, id: number): Promise<any | null> {
  const file = path.join(DETAIL_CACHE, `${media}-${id}.json`);
  if (!FRESH) {
    const hit = await readJson<any>(file);
    if (hit) return hit;
  }
  try {
    const d = await getDetail(tmdb, media, id);
    await fs.writeFile(file, JSON.stringify(d));
    return d;
  } catch (e) {
    if (e instanceof TmdbNotFound) return null;
    console.warn(`  ! ${media} ${id}: ${(e as Error).message}`);
    return null;
  }
}

// ---------- 3. shelf selection ----------
function shelfScore(r: TitleRow) {
  return (r.rating ?? 0) * Math.log((r.votes ?? 0) + 1) * (r.trending ? 1.15 : 1);
}
function pickShelf(rows: TitleRow[]): TitleRow[] {
  const ok = rows.filter((r) => r.poster && r.overview && r.providers.some((p) => p.kind === 'stream' || p.kind === 'free'));
  const picked: TitleRow[] = [];
  for (const aisle of AISLES) {
    const inAisle = ok.filter((r) => r.aisle === aisle).sort((a, b) => shelfScore(b) - shelfScore(a));
    const tv = inAisle.filter((r) => r.media_type === 'tv').slice(0, Math.floor(SHELF / 4)); // up to 25% box sets
    const movies = inAisle.filter((r) => r.media_type === 'movie').slice(0, SHELF - tv.length);
    picked.push(...[...movies, ...tv].sort((a, b) => shelfScore(b) - shelfScore(a)));
  }
  return picked;
}

// ---------- 4. optional enrichments ----------
async function watchmodeEnrich(films: Film[]) {
  const key = process.env.WATCHMODE_KEY;
  if (!key) return log('watchmode: WATCHMODE_KEY missing, skipping (fallback links will be used)');
  const cacheFile = path.join(CACHE, 'watchmode.json');
  const cache = (await readJson<Record<string, any[]>>(cacheFile)) ?? {};
  let calls = 0;
  await pool(films, 3, async (f) => {
    const k = `${f.mediaType}-${Math.abs(f.id)}`;
    if (!cache[k]) {
      try {
        const field = f.mediaType === 'tv' ? 'tmdb_tv_id' : 'tmdb_movie_id';
        const s = await (await fetch(`https://api.watchmode.com/v1/search/?apiKey=${key}&search_field=${field}&search_value=${Math.abs(f.id)}`)).json();
        calls++;
        const wm = s?.title_results?.[0]?.id;
        cache[k] = wm ? await (await fetch(`https://api.watchmode.com/v1/title/${wm}/sources/?apiKey=${key}&regions=${REGION}`)).json() : [];
        calls++;
        if (!Array.isArray(cache[k])) cache[k] = [];
      } catch { cache[k] = []; }
    }
    for (const src of cache[k]) {
      if (!src?.web_url) continue;
      const pid = mapProvider(String(src.name ?? ''));
      const p = f.providers.find((x) => x.id === pid && !x.url);
      if (p) p.url = src.web_url;
    }
  });
  await fs.writeFile(cacheFile, JSON.stringify(cache));
  log(`watchmode: ${calls} API calls (cached for next time)`);
}

async function downloadPosters(films: Film[]) {
  await fs.mkdir(path.join('public', 'posters'), { recursive: true });
  let n = 0;
  await pool(films, 6, async (f) => {
    if (!f.poster.startsWith('http')) return;
    const name = `${f.mediaType === 'tv' ? 'tv' : 'm'}-${Math.abs(f.id)}.jpg`;
    const dest = path.join('public', 'posters', name);
    try {
      await fs.access(dest);
    } catch {
      try {
        const r = await fetch(f.poster);
        if (!r.ok) return;
        await fs.writeFile(dest, Buffer.from(await r.arrayBuffer()));
        n++;
      } catch { return; }
    }
    f.poster = `/posters/${name}`;
  });
  log(`posters: ${n} downloaded → public/posters/`);
}

// ---------- main ----------
async function main() {
  await fs.mkdir(DETAIL_CACHE, { recursive: true });
  const t0 = Date.now();

  log(`collecting ids: ${N_MOVIES} movies + ${N_TV} shows (min ${MIN_VOTES} votes)…`);
  const [movieIds, tvIds, trendM, trendT] = await Promise.all([
    collectIds('movie', N_MOVIES),
    collectIds('tv', N_TV),
    trendingIds('movie'),
    trendingIds('tv'),
  ]);
  log(`ids: ${movieIds.length} movies, ${tvIds.length} shows`);

  const jobs: { media: Media; id: number }[] = [
    ...movieIds.map((id) => ({ media: 'movie' as Media, id })),
    ...tvIds.map((id) => ({ media: 'tv' as Media, id })),
  ];
  let done = 0;
  const details = await pool(jobs, 8, async (j) => {
    const d = await detailCached(j.media, j.id);
    if (++done % 250 === 0) log(`  details ${done}/${jobs.length}`);
    return d ? { ...j, d } : null;
  });

  const rows: TitleRow[] = details
    .filter((x): x is { media: Media; id: number; d: any } => !!x)
    .map(({ media, id, d }) => mapDetail(media, d, REGION, (media === 'movie' ? trendM : trendT).has(id)))
    .filter((r) => r.title && r.title !== 'Untitled');
  log(`mapped ${rows.length} titles`);

  if (!NO_DB) {
    log('upserting into Supabase `titles`…');
    await upsertRows(getServiceClient(), rows);
    log('supabase: done');
  } else log('--no-db: skipping Supabase');

  // shelf catalogue (what the store renders, works offline)
  const shelf = pickShelf(rows).map(rowToFilm);
  if (WANT_WATCHMODE) await watchmodeEnrich(shelf);
  if (WANT_IMAGES) await downloadPosters(shelf);
  const perAisle = Object.fromEntries(AISLES.map((a) => [a, shelf.filter((f) => f.aisle === a).length]));
  await fs.writeFile(
    path.join('public', 'catalogue.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), region: REGION, counts: perAisle, films: shelf }),
  );

  // vault index: every title, tiny, for instant + offline search
  const index = rows
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((r) => ({
      i: r.app_id,
      t: r.title,
      y: r.year ?? 0,
      m: r.media_type === 'tv' ? 't' : 'm',
      p: r.poster ? r.poster.replace(/^https:\/\/image\.tmdb\.org\/t\/p\/w\d+/, '') : '',
      a: r.aisle,
    }));
  await fs.writeFile(path.join('public', 'vault-index.json'), JSON.stringify(index));

  const providerSpread: Record<string, number> = {};
  rows.forEach((r) => r.providers.forEach((p) => (providerSpread[p.id] = (providerSpread[p.id] ?? 0) + 1)));
  log('shelf per aisle:', perAisle);
  log('provider spread (GB):', providerSpread);
  log(`catalogue.json: ${shelf.length} shelf titles · vault-index.json: ${index.length} titles`);
  log(`finished in ${Math.round((Date.now() - t0) / 1000)}s`);
}

main().catch((e) => {
  console.error('[vault] FAILED:', e);
  process.exit(1);
});

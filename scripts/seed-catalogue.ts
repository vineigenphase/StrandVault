// Seed public/catalogue.json from TMDB (BACKEND.md §4.1–4.2). Lane BE1.
// Usage: npm run seed [-- --images]   (TMDB_TOKEN required; WATCHMODE_KEY optional)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { Aisle, Film, Provider, ProviderId } from '../src/lib/types';

// tsx does not load .env.local for us; read the few vars we need.
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env.local — env may be supplied by the shell */ }

const TOKEN = process.env.TMDB_TOKEN;
if (!TOKEN) {
  console.error('Missing TMDB_TOKEN (v4 read token). Copy .env.example → .env.local and set it.');
  process.exit(1);
}

const API = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';
const WITH_IMAGES = process.argv.includes('--images');
const AISLES: Aisle[] = ['action', 'comedy', 'horror', 'scifi', 'drama', 'romance', 'animated', 'cult'];

const AISLE_GENRES: Record<Exclude<Aisle, 'cult'>, number[]> = {
  action: [28, 12, 53],
  comedy: [35],
  horror: [27],
  scifi: [878, 14],
  drama: [18, 80],
  romance: [10749],
  animated: [16],
};

const PROVIDER_IDS: Record<number, ProviderId> = {
  8: 'netflix', 9: 'prime', 119: 'prime', 337: 'disney',
  2: 'apple', 350: 'apple', 39: 'now', 591: 'now',
  38: 'iplayer', 103: 'channel4', 531: 'paramount', 582: 'paramount',
};

interface TmdbMovie {
  id: number;
  title: string;
  release_date?: string;
  vote_average?: number;
  vote_count?: number;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
}

interface TmdbDetails extends TmdbMovie {
  runtime?: number | null;
  tagline?: string;
  credits?: { cast?: { name: string }[]; crew?: { job?: string; name: string }[] };
  videos?: { results?: { site?: string; type?: string; key?: string }[] };
  'watch/providers'?: {
    results?: Record<string, Record<string, { provider_id: number; provider_name: string; logo_path?: string | null }[] | undefined>>;
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
let lastCall = 0;
async function throttle(): Promise<void> {
  const wait = Math.max(0, lastCall + 34 - Date.now()); // ~30 req/s
  if (wait) await sleep(wait);
  lastCall = Date.now();
}

async function getJson<T>(url: string, headers: Record<string, string>): Promise<T> {
  for (let attempt = 0; attempt < 5; attempt++) {
    await throttle();
    const res = await fetch(url, { headers });
    if (res.status === 429 || res.status >= 500) {
      await sleep(400 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} — ${url}`);
    return await res.json() as T;
  }
  throw new Error(`Too many retries — ${url}`);
}

const tmdb = <T>(path: string, params: Record<string, string | number> = {}) => {
  const url = new URL(API + path);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return getJson<T>(url.toString(), { Authorization: `Bearer ${TOKEN}`, accept: 'application/json' });
};

const wm = <T>(path: string, params: Record<string, string> = {}) => {
  const url = new URL(`https://api.watchmode.com/v1/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return getJson<T>(url.toString(), { accept: 'application/json' });
};

function aisleFor(movie: TmdbMovie): Aisle {
  const year = Number((movie.release_date ?? '').slice(0, 4)) || 9999;
  if (year <= 1989) return 'cult';
  const genres = new Set([
    ...(movie.genre_ids ?? []),
    ...(movie.genres ?? []).map((g) => g.id),
  ]);
  if (genres.has(16)) return 'animated';
  if (genres.has(27)) return 'horror';
  if (genres.has(878) || genres.has(14)) return 'scifi';
  if (genres.has(35)) return 'comedy';
  if (genres.has(10749)) return 'romance';
  if (genres.has(28) || genres.has(12) || genres.has(53)) return 'action';
  return 'drama';
}

async function download(url: string, file: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    mkdirSync('public/posters', { recursive: true });
    writeFileSync(`public/posters/${file}`, Buffer.from(await res.arrayBuffer()));
    return `/posters/${file}`;
  } catch {
    return null;
  }
}

function providersFrom(details: TmdbDetails): Provider[] {
  const gb = details['watch/providers']?.results?.GB;
  if (!gb) return [];
  const kinds: { key: string; kind: Provider['kind'] }[] = [
    { key: 'flatrate', kind: 'stream' },
    { key: 'free', kind: 'free' },
    { key: 'ads', kind: 'free' },
    { key: 'rent', kind: 'rent' },
    { key: 'buy', kind: 'buy' },
  ];
  const out: Provider[] = [];
  const seen = new Set<string>();
  for (const { key, kind } of kinds) {
    for (const row of gb[key] ?? []) {
      const id = PROVIDER_IDS[row.provider_id] ?? 'other';
      const k = `${id}:${kind}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({
        id,
        name: row.provider_name,
        url: '',
        kind,
        logo: row.logo_path ? `${IMG}/w92${row.logo_path}` : undefined,
      });
    }
  }
  return out;
}

async function watchmodeUrls(id: number, providers: Provider[]): Promise<void> {
  const key = process.env.WATCHMODE_KEY;
  if (!key || !providers.length) return;
  try {
    const sources = await wm<{ name?: string; web_url?: string }[]>(`title/tmdb-${id}/sources`, {
      apiKey: key, regions: 'GB',
    });
    for (const source of sources) {
      if (!source.web_url || !source.name) continue;
      const name = source.name.toLowerCase();
      const provider = providers.find((p) => name.includes(p.name.toLowerCase())
        || p.name.toLowerCase().includes(name));
      if (provider && !provider.url) provider.url = source.web_url;
    }
  } catch (err) {
    console.warn(`! Watchmode skipped for ${id}: ${String(err)}`);
  }
}

async function main() {
  const discovered = new Map<number, TmdbMovie>();
  let trendingIds = new Set<number>();

  console.log('TRACKING… discovering films');
  for (const aisle of AISLES) {
    for (let page = 1; page <= 2; page++) {
      const params: Record<string, string | number> = {
        region: 'GB', page, 'vote_count.gte': 500,
      };
      if (aisle === 'cult') {
        params.sort_by = 'vote_count.desc';
        params['primary_release_date.lte'] = '1989-12-31';
      } else {
        params.sort_by = 'popularity.desc';
        params.with_genres = AISLE_GENRES[aisle].join(',');
      }
      const data = await tmdb<{ results?: TmdbMovie[] }>('/discover/movie', params);
      for (const movie of data.results ?? []) if (movie.poster_path) discovered.set(movie.id, movie);
    }
    console.log(`  ${aisle}: ${discovered.size} total`);
  }

  const weekly = await tmdb<{ results?: TmdbMovie[] }>('/trending/movie/week');
  trendingIds = new Set((weekly.results ?? []).map((m) => m.id));
  for (const movie of weekly.results ?? []) {
    if (movie.poster_path && !discovered.has(movie.id)) discovered.set(movie.id, movie);
  }

  console.log(`TRACKING… fetching details for ${discovered.size} films`);
  const films: Film[] = [];
  let index = 0;
  for (const movie of discovered.values()) {
    index++;
    if (index % 50 === 0) console.log(`  ${index}/${discovered.size}`);
    try {
      const details = await tmdb<TmdbDetails>(`/movie/${movie.id}`, {
        append_to_response: 'credits,videos,watch/providers',
      });
      const merged: TmdbMovie = { ...movie, ...details, genre_ids: movie.genre_ids ?? details.genres?.map((g) => g.id) };
      const providers = providersFrom(details);
      await watchmodeUrls(movie.id, providers);

      let poster = movie.poster_path ? `${IMG}/w342${movie.poster_path}` : '';
      let backdrop = movie.backdrop_path ? `${IMG}/w1280${movie.backdrop_path}` : undefined;
      if (WITH_IMAGES) {
        if (movie.poster_path) poster = await download(`${IMG}/w342${movie.poster_path}`, `${movie.id}.jpg`) ?? poster;
        if (movie.backdrop_path) backdrop = await download(`${IMG}/w1280${movie.backdrop_path}`, `${movie.id}-bd.jpg`) ?? backdrop;
      }

      films.push({
        id: movie.id,
        title: movie.title,
        year: Number((movie.release_date ?? '').slice(0, 4)) || 0,
        runtime: details.runtime ?? 0,
        overview: movie.overview ?? '',
        tagline: details.tagline || undefined,
        poster,
        backdrop,
        genres: merged.genre_ids ?? [],
        aisle: aisleFor(merged),
        rating: movie.vote_average ?? 0,
        votes: movie.vote_count ?? 0,
        trending: trendingIds.has(movie.id),
        cast: (details.credits?.cast ?? []).slice(0, 5).map((c) => c.name),
        director: details.credits?.crew?.find((c) => c.job === 'Director')?.name,
        trailerKey: details.videos?.results?.find((v) => v.site === 'YouTube' && v.type === 'Trailer')?.key,
        providers,
      });
    } catch (err) {
      console.warn(`! skipped ${movie.id} (${movie.title}): ${String(err)}`);
    }
  }

  let output = JSON.stringify({ generatedAt: new Date().toISOString(), region: 'GB', films });
  if (Buffer.byteLength(output, 'utf8') > 1_500_000) {
    films.length = Math.floor(films.length * 0.9);
    output = JSON.stringify({ generatedAt: new Date().toISOString(), region: 'GB', films });
    console.warn('! catalogue exceeded 1.5 MB — trimmed 10%');
  }
  writeFileSync('public/catalogue.json', output);

  const counts = Object.fromEntries(AISLES.map((a) => [a, films.filter((f) => f.aisle === a).length])) as Record<Aisle, number>;
  console.log('MISSION PASSED ▶', films.length, 'films /', films.filter((f) => f.trending).length, 'trending');
  console.log('  aisles:', JSON.stringify(counts));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// TMDB client: rate-limited, retrying, works in Next.js route handlers AND tsx scripts.
// SERVER/SCRIPT ONLY. Never import from a client component (TMDB_TOKEN must stay server-side).
/* eslint-disable @typescript-eslint/no-explicit-any -- TMDB responses are untyped JSON */
// Accepts either a v4 "API Read Access Token" (Bearer) or a 32-char v3 API key.

const BASE = 'https://api.themoviedb.org/3';
export const IMG = 'https://image.tmdb.org/t/p';

export type Media = 'movie' | 'tv';
export type Params = Record<string, string | number | boolean | undefined>;

export class TmdbNotFound extends Error {}

export interface TmdbClient {
  get<T = any>(path: string, params?: Params, signal?: AbortSignal): Promise<T>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createTmdb(opts: { token?: string; rps?: number; concurrency?: number } = {}): TmdbClient {
  const token = opts.token ?? process.env.TMDB_TOKEN;
  if (!token) throw new Error('TMDB_TOKEN missing (get a free one at themoviedb.org → Settings → API)');
  const isV3Key = /^[a-f0-9]{32}$/i.test(token);
  const rps = opts.rps ?? 35;
  const maxConc = opts.concurrency ?? 8;

  // concurrency semaphore
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = () =>
    new Promise<void>((resolve) => {
      const go = () => { active++; resolve(); };
      if (active < maxConc) go(); else waiting.push(go);
    });
  const release = () => { active--; const next = waiting.shift(); if (next) next(); };

  // token-bucket rate limit
  let tokens = rps;
  let last = Date.now();
  const rateGate = async () => {
    for (;;) {
      const now = Date.now();
      tokens = Math.min(rps, tokens + ((now - last) / 1000) * rps);
      last = now;
      if (tokens >= 1) { tokens -= 1; return; }
      await sleep(Math.ceil(1000 / rps));
    }
  };

  async function get<T = any>(path: string, params: Params = {}, signal?: AbortSignal): Promise<T> {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
    if (isV3Key) url.searchParams.set('api_key', token!);
    const headers: Record<string, string> = { accept: 'application/json' };
    if (!isV3Key) headers.Authorization = `Bearer ${token}`;

    await acquire();
    try {
      for (let attempt = 0; ; attempt++) {
        await rateGate();
        let res: Response;
        try {
          res = await fetch(url, { headers, signal });
        } catch (e) {
          if (signal?.aborted || attempt >= 3) throw e;
          await sleep(500 * 2 ** attempt);
          continue;
        }
        if (res.ok) return (await res.json()) as T;
        if (res.status === 404) throw new TmdbNotFound(path);
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          const ra = Number(res.headers.get('retry-after'));
          await sleep(ra > 0 ? ra * 1000 : 600 * 2 ** attempt);
          continue;
        }
        throw new Error(`TMDB ${res.status} on ${path}`);
      }
    } finally {
      release();
    }
  }

  return { get };
}

export const APPEND: Record<Media, string> = {
  movie: 'watch/providers,credits,videos,external_ids,release_dates',
  tv: 'watch/providers,aggregate_credits,videos,external_ids,content_ratings',
};

export function getDetail(tmdb: TmdbClient, media: Media, id: number, signal?: AbortSignal) {
  return tmdb.get(`/${media}/${id}`, { append_to_response: APPEND[media], language: 'en-US' }, signal);
}

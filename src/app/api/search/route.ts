// GET /api/search?q=alien&type=movie|tv&limit=24 → { results: Film[], source }
// 1) Search the vault (Postgres full-text + fuzzy).  2) If thin, ask TMDB live, fetch details,
// upsert into the vault, and return them, so ANY movie or show anyone searches ends up in the database.
/* eslint-disable @typescript-eslint/no-explicit-any -- TMDB search results are untyped JSON */
import { getServiceClient } from '@/lib/server/db';
import { createTmdb, type Media } from '@/lib/server/tmdb';
import { cacheRows, fetchTitleRow, rowToFilm, toAppId, type TitleRow } from '@/lib/server/titles';

// No `dynamic`/`runtime` exports: Cache Components is on (they'd error), and reading req.url already
// makes this run per request.

const withTimeout = <T,>(p: Promise<T>, ms: number) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

async function liveSearch(q: string, media: Media | null, have: Set<number>): Promise<TitleRow[]> {
  const tmdb = createTmdb({ rps: 20, concurrency: 6 });
  const j = await tmdb.get('/search/multi', { query: q, include_adult: false, language: 'en-US', page: 1 });
  const hits: { media: Media; id: number }[] = (j.results ?? [])
    .filter((r: any) => (r.media_type === 'movie' || r.media_type === 'tv') && (!media || r.media_type === media))
    .map((r: any) => ({ media: r.media_type as Media, id: r.id as number }))
    .filter((h: { media: Media; id: number }) => !have.has(toAppId(h.media, h.id)))
    .slice(0, 6);
  const settled = await Promise.allSettled(hits.map((h) => fetchTitleRow(tmdb, h.media, h.id)));
  const rows = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
  if (rows.length) cacheRows(rows); // cache for next time, don't block
  return rows;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').trim().slice(0, 80);
  const t = u.searchParams.get('type');
  const media: Media | null = t === 'movie' || t === 'tv' ? t : null;
  const limit = Math.min(Math.max(Number(u.searchParams.get('limit') ?? 24) || 24, 1), 48);

  if (q.length < 2 || process.env.DEMO_OFFLINE === '1') {
    return Response.json({ results: [], source: 'none' }); // client falls back to /vault-index.json
  }

  let rows: TitleRow[] = [];
  let source = 'db';
  try {
    const { data, error } = await getServiceClient().rpc('search_titles', { q, media, lim: limit });
    if (!error && Array.isArray(data)) rows = data as TitleRow[];
  } catch {
    /* db down → try live */
  }

  if (rows.length < 6 && process.env.TMDB_TOKEN) {
    try {
      const extra = await withTimeout(liveSearch(q, media, new Set(rows.map((r) => r.app_id))), 4500);
      if (extra.length) source = rows.length ? 'db+tmdb' : 'tmdb';
      rows = rows.concat(extra);
    } catch {
      /* keep db results */
    }
  }

  return Response.json(
    { results: rows.slice(0, limit).map(rowToFilm), source },
    { headers: { 'cache-control': 'public, s-maxage=60, stale-while-revalidate=300' } },
  );
}

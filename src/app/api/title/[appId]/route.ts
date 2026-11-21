// GET /api/title/603 (movie) or /api/title/-1399 (TV) → Film
// Vault first; if missing, fetch from TMDB, store it, return it. Used when someone opens a search
// result or a friend's favourite that isn't on the shelves.
import { getServiceClient } from '@/lib/server/db';
import { createTmdb } from '@/lib/server/tmdb';
import { cacheRows, fetchTitleRow, fromAppId, getRow, rowToFilm } from '@/lib/server/titles';

// No `dynamic`/`runtime` exports: Cache Components is on (they'd error), and reading req.url already
// makes this run per request.

export async function GET(_req: Request, ctx: { params: Promise<{ appId: string }> }) {
  const { appId: raw } = await ctx.params;
  const appId = Number(raw);
  if (!Number.isInteger(appId) || appId === 0) return Response.json({ error: 'bad id' }, { status: 400 });

  try {
    const row = await getRow(getServiceClient(), appId);
    if (row) return Response.json(rowToFilm(row), { headers: { 'cache-control': 'public, s-maxage=3600' } });
  } catch {
    /* fall through to TMDB */
  }

  if (!process.env.TMDB_TOKEN || process.env.DEMO_OFFLINE === '1') {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
  try {
    const { media, tmdbId } = fromAppId(appId);
    const row = await fetchTitleRow(createTmdb({ rps: 20 }), media, tmdbId);
    cacheRows([row]);
    return Response.json(rowToFilm(row), { headers: { 'cache-control': 'public, s-maxage=3600' } });
  } catch {
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}

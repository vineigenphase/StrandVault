// GET /api/recs?userId=&code= — BACKEND.md §5.1 / §6. Lane BE3.
// Reads request.url so Cache Components keeps this at request time. No 'use cache'.
import { NextResponse } from 'next/server';
import type { Friend, Look, RecsRes } from '@/lib/types';
import { catalogueServer } from '@/lib/catalogue';
import { padWithTrending, scoreRecs, trendingFallback } from '@/lib/recs';
import { db } from '@/lib/server/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(value: string | null, fallback: string): string {
  const s = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.slice(0, 12) || fallback;
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const catalogue = catalogueServer();
  const userId = params.get('userId');
  const validUserId = userId && UUID.test(userId) ? userId : null;
  const code = clean(params.get('code'), process.env.NEXT_PUBLIC_STORE_CODE || 'KCL');
  const fallback = (): NextResponse => NextResponse.json({
    items: trendingFallback(catalogue),
    fallback: true,
  } satisfies RecsRes);

  const client = db();
  if (!client || !validUserId) return fallback();

  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const [{ data: profile, error: profileError }, { data: favs, error: favError }] = await Promise.all([
      client.from('profiles').select('fav_id').eq('id', validUserId).maybeSingle(),
      client.from('favourites').select('film_id').eq('user_id', validUserId),
    ]);
    if (profileError) throw profileError;
    if (favError) throw favError;

    const userFavs = (favs ?? [])
      .map((f) => f.film_id)
      .filter((n): n is number => Number.isInteger(n) && catalogue.byId.has(n));
    const top = Number.isInteger(profile?.fav_id) ? profile!.fav_id : null;
    if (top !== null && catalogue.byId.has(top) && !userFavs.includes(top)) userFavs.unshift(top);

    // No favourites → no affinity signal: hand back trending (§6 fallback rules).
    if (userFavs.length === 0) return fallback();

    const { data: profiles, error: storeError } = await client
      .from('profiles')
      .select('id, name, look, fav_id, is_demo')
      .eq('store_code', code)
      .neq('id', validUserId)
      .or(`last_seen.gt.${since},is_demo.eq.true`)
      .limit(200);
    if (storeError) throw storeError;

    const friendIds = (profiles ?? []).map((p) => p.id);
    let friendFavs: { user_id: string; film_id: number }[] = [];
    if (friendIds.length) {
      const { data, error } = await client
        .from('favourites').select('user_id, film_id').in('user_id', friendIds);
      if (error) throw error;
      friendFavs = data ?? [];
    }

    const { data: watchedRows, error: watchedError } = await client
      .from('events').select('film_id').eq('user_id', validUserId).eq('kind', 'watch');
    if (watchedError) throw watchedError;

    const byUser = new Map<string, number[]>();
    for (const f of friendFavs) byUser.set(f.user_id, [...(byUser.get(f.user_id) ?? []), f.film_id]);

    const friends: Friend[] = (profiles ?? []).map((p) => ({
      userId: p.id,
      name: p.name,
      look: p.look as Look,
      favId: Number.isInteger(p.fav_id) ? p.fav_id : null,
      favourites: byUser.get(p.id) ?? [],
      isDemo: p.is_demo === true,
    }));

    const watched = (watchedRows ?? [])
      .map((e) => e.film_id)
      .filter((n): n is number => Number.isInteger(n));

    const scored = scoreRecs({ catalogue, userFavs, userTop: top, friends, watched });
    const items = scored.length < 6 ? padWithTrending(scored, catalogue) : scored;
    return NextResponse.json({ items: items.slice(0, 18), fallback: false } satisfies RecsRes);
  } catch (err) {
    console.error('[api/recs]', err);
    return fallback();
  }
}

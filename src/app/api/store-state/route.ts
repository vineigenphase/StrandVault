// GET /api/store-state?code= — BACKEND.md §5.1. Lane BE2.
// Reads request.url so Cache Components keeps this at request time. No 'use cache'.
import { NextResponse } from 'next/server';
import type { Friend, Look, StaffPick, StoreStateRes } from '@/lib/types';
import { catalogueServer } from '@/lib/catalogue';
import { db } from '@/lib/server/supabase';

const EMPTY: StoreStateRes = { friends: [], staffPicks: [] };

function cleanCode(value: string | null): string {
  const code = (value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.slice(0, 12) || process.env.NEXT_PUBLIC_STORE_CODE || 'KCL';
}

export async function GET(request: Request) {
  const code = cleanCode(new URL(request.url).searchParams.get('code'));
  const client = db();
  if (!client) return NextResponse.json(EMPTY);

  try {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data: profiles, error: profileError } = await client
      .from('profiles')
      .select('id, name, look, fav_id, is_demo')
      .eq('store_code', code)
      .or(`last_seen.gt.${since},is_demo.eq.true`)
      .limit(200);
    if (profileError) throw profileError;

    if (!profiles?.length) return NextResponse.json(EMPTY);
    const ids = profiles.map((p) => p.id);

    const { data: favs, error: favError } = await client
      .from('favourites').select('user_id, film_id').in('user_id', ids);
    if (favError) throw favError;

    const byUser = new Map<string, number[]>();
    for (const f of favs ?? []) {
      byUser.set(f.user_id, [...(byUser.get(f.user_id) ?? []), f.film_id]);
    }

    const friends: Friend[] = profiles.map((p) => ({
      userId: p.id,
      name: p.name,
      look: p.look as Look,
      favId: Number.isInteger(p.fav_id) ? p.fav_id : null,
      favourites: byUser.get(p.id) ?? [],
      isDemo: p.is_demo === true,
    }));

    // Staff Picks: aggregate across friends, count desc then film rating desc, max 24.
    const counts = new Map<number, Set<string>>();
    for (const f of favs ?? []) {
      const set = counts.get(f.film_id) ?? new Set<string>();
      set.add(f.user_id);
      counts.set(f.film_id, set);
    }
    const catalogue = catalogueServer();
    const staffPicks: StaffPick[] = [...counts.entries()]
      .map(([filmId, userIds]) => ({ filmId, userIds: [...userIds] }))
      .sort((a, b) =>
        b.userIds.length - a.userIds.length
        || (catalogue.byId.get(b.filmId)?.rating ?? 0) - (catalogue.byId.get(a.filmId)?.rating ?? 0))
      .slice(0, 24);

    return NextResponse.json({ friends, staffPicks } satisfies StoreStateRes);
  } catch (err) {
    console.error('[api/store-state]', err);
    return NextResponse.json(EMPTY);
  }
}

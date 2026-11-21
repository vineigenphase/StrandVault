// POST /api/favourite — BACKEND.md §5.1. Lane BE2.
import { NextResponse } from 'next/server';
import type { FavRes } from '@/lib/types';
import { db } from '@/lib/server/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FAIL: FavRes = { ok: false, favourites: [], favId: null };

export async function POST(request: Request) {
  let raw: Record<string, unknown> = {};
  try { raw = await request.json(); } catch { /* invalid body */ }

  const userId = typeof raw.userId === 'string' && UUID.test(raw.userId) ? raw.userId : null;
  const filmId = Number.isInteger(raw.filmId) && (raw.filmId as number) > 0 ? raw.filmId as number : null;
  const on = raw.on === true;
  const setTop = raw.setTop === true;
  const client = db();
  if (!client || !userId || !filmId) return NextResponse.json(FAIL);

  try {
    if (on || setTop) {
      const { error } = await client
        .from('favourites').upsert({ user_id: userId, film_id: filmId }, { onConflict: 'user_id,film_id' });
      if (error) throw error;
    } else {
      const { error } = await client
        .from('favourites').delete().eq('user_id', userId).eq('film_id', filmId);
      if (error) throw error;
    }

    if (setTop) {
      const { error } = await client.from('profiles').update({ fav_id: filmId }).eq('id', userId);
      if (error) throw error;
    } else if (!on) {
      // Unfaving the current #1 clears it.
      const { data: profile } = await client
        .from('profiles').select('fav_id').eq('id', userId).maybeSingle();
      if (profile?.fav_id === filmId) {
        const { error } = await client.from('profiles').update({ fav_id: null }).eq('id', userId);
        if (error) throw error;
      }
    }

    const [{ data: favs, error: favError }, { data: profile, error: profileError }] = await Promise.all([
      client.from('favourites').select('film_id').eq('user_id', userId),
      client.from('profiles').select('fav_id').eq('id', userId).maybeSingle(),
    ]);
    if (favError) throw favError;
    if (profileError) throw profileError;

    const res: FavRes = {
      ok: true,
      favourites: (favs ?? []).map((f) => f.film_id).filter((n): n is number => Number.isInteger(n)),
      favId: Number.isInteger(profile?.fav_id) ? profile!.fav_id : null,
    };
    return NextResponse.json(res);
  } catch (err) {
    console.error('[api/favourite]', err);
    return NextResponse.json(FAIL);
  }
}

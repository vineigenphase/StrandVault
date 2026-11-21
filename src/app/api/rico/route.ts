// POST /api/rico — BACKEND.md §7. Lane BE4.
// Always 200 with a RicoRes; every failure path resolves to the scripted fallback.
import { NextResponse } from 'next/server';
import type { Friend, Look, Mood, RecItem, RicoRes } from '@/lib/types';
import { catalogueServer } from '@/lib/catalogue';
import { scoreRecs, trendingFallback } from '@/lib/recs';
import { localRicoFallback } from '@/lib/rico-fallback';
import { askRico, hasOpenAIKey } from '@/lib/server/openai';
import { buildRicoUserPrompt, validateRicoResponse } from '@/lib/server/rico-prompt';
import { db } from '@/lib/server/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOODS: Mood[] = ['laugh', 'scare', 'date', 'mind'];
const lastAsk = new Map<string, number>();

type Client = NonNullable<ReturnType<typeof db>>;

function logEvent(client: Client | null, userId: string | null, filmId: number, mood?: Mood, fallback = false) {
  if (!client || !userId) return;
  void client.from('events').insert({
    store_code: process.env.NEXT_PUBLIC_STORE_CODE || 'KCL',
    user_id: userId,
    kind: 'rico',
    film_id: filmId,
    meta: { mood: mood ?? null, fallback },
  }).then(() => {}, (err: unknown) => console.error('[api/rico] event log', err));
}

function throttled(userId: string | null): boolean {
  if (!userId) return false;
  const now = Date.now();
  const prev = lastAsk.get(userId) ?? 0;
  if (now - prev < 1500) return true;
  lastAsk.set(userId, now);
  return false;
}

export async function POST(request: Request) {
  let raw: Record<string, unknown> = {};
  try { raw = await request.json(); } catch { /* invalid body → defaults */ }

  const userId = typeof raw.userId === 'string' && UUID.test(raw.userId) ? raw.userId : null;
  const mood = MOODS.includes(raw.mood as Mood) ? raw.mood as Mood : undefined;
  const exclude = Array.isArray(raw.exclude)
    ? raw.exclude.filter((id): id is number => Number.isInteger(id) && id > 0).slice(0, 50)
    : [];

  const catalogue = catalogueServer();
  const client = db();
  const isThrottled = throttled(userId);
  let candidates: RecItem[] = [];
  const friendsMap = new Map<number, string[]>();
  let name = 'GUEST';
  let favTitles: string[] = [];

  if (client && userId && !isThrottled) {
    try {
      const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
      const [{ data: profile }, { data: favs }] = await Promise.all([
        client.from('profiles').select('name, fav_id').eq('id', userId).maybeSingle(),
        client.from('favourites').select('film_id').eq('user_id', userId),
      ]);
      name = profile?.name ?? 'GUEST';

      const userFavs = (favs ?? [])
        .map((f) => f.film_id)
        .filter((id): id is number => Number.isInteger(id) && catalogue.byId.has(id));
      if (Number.isInteger(profile?.fav_id) && !userFavs.includes(profile!.fav_id)) {
        userFavs.unshift(profile!.fav_id);
      }
      favTitles = userFavs.slice(0, 5)
        .map((id) => catalogue.byId.get(id)?.title)
        .filter((t): t is string => Boolean(t));

      const { data: profiles } = await client
        .from('profiles')
        .select('id, name, look, fav_id, is_demo')
        .eq('store_code', process.env.NEXT_PUBLIC_STORE_CODE || 'KCL')
        .neq('id', userId)
        .or(`last_seen.gt.${since},is_demo.eq.true`)
        .limit(200);

      const friendIds = (profiles ?? []).map((p) => p.id);
      let friendFavs: { user_id: string; film_id: number }[] = [];
      if (friendIds.length) {
        const { data } = await client
          .from('favourites').select('user_id, film_id').in('user_id', friendIds);
        friendFavs = data ?? [];
      }
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

      for (const f of friends) {
        for (const filmId of f.favourites) {
          friendsMap.set(filmId, [...(friendsMap.get(filmId) ?? []), f.name]);
        }
      }

      candidates = scoreRecs({
        catalogue, userFavs, userTop: profile?.fav_id ?? null, friends, mood, exclude,
      }, 30);
    } catch (err) {
      console.error('[api/rico] candidate load', err);
      candidates = [];
    }
  } else if (isThrottled) {
    // Abuse guard: skip the OpenAI call but still return a fresh scripted pick.
    candidates = scoreRecs({ catalogue, userFavs: [], userTop: null, friends: [], mood, exclude }, 30);
  }

  if (!candidates.length) candidates = trendingFallback(catalogue, 30);

  const respondFallback = (): NextResponse => {
    const res = localRicoFallback(candidates, mood, friendsMap, catalogue);
    logEvent(client, userId, res.filmId, mood, true);
    return NextResponse.json(res satisfies RicoRes);
  };

  if (!hasOpenAIKey()) return respondFallback();

  try {
    const prompt = buildRicoUserPrompt({ name, favTitles, mood, candidates, catalogue });
    const rawPick = await askRico(prompt);
    const validated = validateRicoResponse(rawPick, candidates);
    if (!validated) return respondFallback();

    logEvent(client, userId, validated.filmId, mood, false);
    return NextResponse.json(validated satisfies RicoRes);
  } catch (err) {
    console.error('[api/rico]', err);
    return respondFallback();
  }
}


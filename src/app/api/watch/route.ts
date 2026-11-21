// POST /api/watch — BACKEND.md §5.1. Lane BE2. Fire-and-forget from the client.
import { NextResponse } from 'next/server';
import type { OkRes, ProviderId } from '@/lib/types';
import { db } from '@/lib/server/supabase';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDERS: ProviderId[] = [
  'netflix', 'prime', 'disney', 'apple', 'now', 'iplayer', 'channel4', 'paramount', 'other',
];
const FAIL: OkRes = { ok: false };

export async function POST(request: Request) {
  let raw: Record<string, unknown> = {};
  try { raw = await request.json(); } catch { /* invalid body */ }

  const userId = typeof raw.userId === 'string' && UUID.test(raw.userId) ? raw.userId : null;
  const filmId = Number.isInteger(raw.filmId) && (raw.filmId as number) > 0 ? raw.filmId as number : null;
  const provider = typeof raw.provider === 'string' && PROVIDERS.includes(raw.provider as ProviderId)
    ? raw.provider as ProviderId : null;
  const client = db();
  if (!client || !userId || !filmId || !provider) return NextResponse.json(FAIL);

  try {
    const { error } = await client.from('events').insert({
      store_code: process.env.NEXT_PUBLIC_STORE_CODE || 'KCL',
      user_id: userId,
      kind: 'watch',
      film_id: filmId,
      provider,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true } satisfies OkRes);
  } catch (err) {
    console.error('[api/watch]', err);
    return NextResponse.json(FAIL);
  }
}

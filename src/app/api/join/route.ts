// POST /api/join — BACKEND.md §5.1. Lane BE2.
// Always 200. Fallback keeps the demo playable with no DB / no env.
import { NextResponse } from 'next/server';
import type { JoinReq, JoinRes, Look } from '@/lib/types';
import { db } from '@/lib/server/supabase';

const HAIRS = new Set(['flat', 'mullet', 'curls', 'buzz', 'long']);
const HEX = /^#[0-9a-fA-F]{6}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanName(value: unknown): string {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, '')
    .trim()
    .slice(0, 12) || 'GUEST';
}

function validLook(value: unknown): value is Look {
  const l = asObject(value);
  return typeof l.jacket === 'string' && HEX.test(l.jacket)
    && typeof l.hair === 'string' && HAIRS.has(l.hair)
    && typeof l.hairColor === 'string' && HEX.test(l.hairColor)
    && typeof l.skin === 'string' && HEX.test(l.skin)
    && typeof l.shades === 'boolean';
}

function cleanCode(value: unknown): string {
  const code = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.slice(0, 12) || 'KCL';
}

function fallback(req: Partial<JoinReq> | null, name: string): JoinRes {
  const userId = req?.userId && UUID.test(req.userId)
    ? req.userId
    : (globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}`);
  return {
    userId,
    presence: {
      userId,
      name,
      look: validLook(req?.look) ? req!.look! : {
        jacket: '#FF2E88', hair: 'mullet', hairColor: '#3B1F0E', skin: '#E0AC69', shades: true,
      },
      favId: Number.isInteger(req?.favId) ? req!.favId! : null,
      scene: 'street',
    },
    offline: true,
  };
}

export async function POST(request: Request) {
  let raw: Record<string, unknown> = {};
  try { raw = await request.json(); } catch { /* invalid body → defaults */ }

  const name = cleanName(raw.name);
  const code = cleanCode(raw.code);
  const look = validLook(raw.look) ? raw.look : null;
  const favId = Number.isInteger(raw.favId) && (raw.favId as number) > 0 ? raw.favId as number : null;
  const givenId = typeof raw.userId === 'string' && UUID.test(raw.userId) ? raw.userId : null;
  const req = { name, look: look ?? undefined, favId, code, userId: givenId ?? undefined };

  const client = db();
  if (!client || !look) return NextResponse.json(fallback(req, name));

  const userId = givenId ?? globalThis.crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    const { data: existing, error: findError } = await client
      .from('profiles').select('id').eq('id', userId).maybeSingle();
    if (findError) throw findError;

    const fields = { store_code: code, name, look, fav_id: favId, last_seen: now };
    if (existing) {
      const { error } = await client.from('profiles').update(fields).eq('id', userId);
      if (error) throw error;
    } else {
      const { error } = await client.from('profiles').insert({ id: userId, is_demo: false, ...fields });
      if (error) throw error;
    }

    if (favId !== null) {
      const { error } = await client
        .from('favourites').upsert({ user_id: userId, film_id: favId }, { onConflict: 'user_id,film_id' });
      if (error) throw error;
    }

    const res: JoinRes = {
      userId,
      presence: { userId, name, look, favId, scene: 'street', isDemo: false },
      offline: false,
    };
    return NextResponse.json(res);
  } catch (err) {
    console.error('[api/join]', err);
    return NextResponse.json(fallback(req, name));
  }
}

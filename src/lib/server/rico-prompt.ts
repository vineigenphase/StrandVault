import 'server-only';
// RICO prompt + structured-output validation (BACKEND.md §7). Lane BE4.
import type { Mood, RecItem, RicoRes } from '../types';
import type { Catalogue } from '../catalogue';

export const RICO_SYSTEM_PROMPT = `You are RICO, the clerk at STRANDVAULT, a neon video store on a 1986 beach strip.
Pastel suit, aviators, toothpick, unshakeable confidence. You recommend exactly one film
from the given list. Speak in one or two punchy sentences of retro-cool slang, PG-13.
If a friend loves the film, name-drop them. Never mention AI, streaming algorithms,
real celebrities' private lives, or films outside the list. Output JSON only.`;

export const RICO_JSON_SCHEMA = {
  type: 'object',
  properties: {
    filmId: { type: 'integer' },
    line: { type: 'string', maxLength: 140 },
    reason: { type: 'string', maxLength: 60 },
    backups: { type: 'array', items: { type: 'integer' }, minItems: 3, maxItems: 3 },
  },
  required: ['filmId', 'line', 'reason', 'backups'],
  additionalProperties: false,
} as const;

const MOOD_LABEL: Record<Mood, string> = {
  laugh: 'MAKE ME LAUGH',
  scare: 'SCARE ME',
  date: 'DATE NIGHT',
  mind: 'MIND-BENDER',
};

export function buildRicoUserPrompt(args: {
  name: string;
  favTitles: string[];
  mood?: Mood;
  candidates: RecItem[];
  catalogue: Catalogue;
}): string {
  const { name, favTitles, mood, candidates, catalogue } = args;
  const lines = candidates.slice(0, 30).map((c) => {
    const f = catalogue.byId.get(c.filmId);
    if (!f) return null;
    const friends = c.friends.length ? c.friends.join('+') : '-';
    return [f.id, f.title, f.year, f.aisle, f.rating, friends, f.overview.slice(0, 100)].join('|');
  }).filter((line): line is string => line !== null);

  return [
    `CUSTOMER: ${name || 'GUEST'}`,
    `THEIR #1 FAVES: ${favTitles.slice(0, 5).join(', ') || 'none yet'}`,
    `MOOD: ${mood ? MOOD_LABEL[mood] : 'SURPRISE THEM'}`,
    'CANDIDATES (id|title|year|aisle|rating|friends|overview):',
    ...lines,
    'Pick one filmId from that list. Return JSON only.',
  ].join('\n');
}

/** Validate structured output against the candidate set (BACKEND.md §7 step 5). */
export function validateRicoResponse(value: unknown, candidates: RecItem[]): RicoRes | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const filmId = v.filmId;
  if (!Number.isInteger(filmId) || !candidates.some((c) => c.filmId === filmId)) return null;
  if (typeof v.line !== 'string' || !v.line.trim()) return null;

  const allowed = new Set(candidates.map((c) => c.filmId));
  const rawBackups = Array.isArray(v.backups) ? v.backups : [];
  const backups = rawBackups
    .filter((id): id is number => Number.isInteger(id) && allowed.has(id) && id !== filmId)
    .slice(0, 3);
  for (const c of candidates) {
    if (backups.length >= 3) break;
    if (c.filmId !== filmId && !backups.includes(c.filmId)) backups.push(c.filmId);
  }

  const picked = candidates.find((c) => c.filmId === filmId)!;
  return {
    filmId: filmId as number,
    line: v.line.trim().slice(0, 140),
    reason: (typeof v.reason === 'string' ? v.reason : picked.reason).trim().slice(0, 60),
    backups,
    fallback: false,
  };
}

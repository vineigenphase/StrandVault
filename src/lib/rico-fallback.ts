// RICO scripted fallback (BACKEND.md §7). Isomorphic, no secrets, no I/O.
// Shared by /api/rico and the browser wrapper so a slow/failed route never errors.
import type { Mood, RecItem, RicoRes } from './types';
import { getCatalogueSync, catalogueServer, type Catalogue } from './catalogue';

type Bank = Record<'laugh' | 'scare' | 'date' | 'mind' | 'generic', string[]>;

/** 24 lines: ≥ 4 per mood + 8 generic. Slots: {title} {year} {friend}. */
export const RICO_LINES: Bank = {
  laugh: [
    "{title}. Trust me, kid, this one's got legs.",
    'You want a laugh? {title}. Bring snacks.',
    '{title}. I laughed. I rewound. I laughed again.',
    'Comedy gold, {title}. Even your nan will snort.',
  ],
  scare: [
    'You want scared? {title}. Lights off. No excuses.',
    '{title}. Check under the bed. Twice.',
    'Sleep? Not after {title}. Youre welcome.',
    '{title} will make that hallway feel very long.',
  ],
  date: [
    '{title}. Dim the lights, kid. Youre welcome.',
    'Date night? {title}. Snacks are your problem.',
    '{title}. If this dont work, its not the films fault.',
    'Put on {title} and see what happens. Smooth.',
  ],
  mind: [
    '{title}. Your brain will thank me. Later.',
    'Mind-bender alert: {title}. Take notes.',
    '{title}. Watch it twice, trust the clerk.',
    'Reality is overrated. Try {title}.',
  ],
  generic: [
    '{title}. Trust me, kid, this ones got legs.',
    '{friend} wore out the tape on {title}. Your turn.',
    '{title} from {year}. A proper good one.',
    'I aint saying {title} is perfect. Im saying its perfect.',
    'Take {title}. Tell em RICO sent you.',
    '{title}. No refunds. No regrets.',
    'Counter says {title}. Counter is never wrong.',
    'You look like a {title} kind of person.',
  ],
};

function pickWeightedTopFive(candidates: RecItem[]): RecItem {
  const top = candidates.slice(0, 5);
  const weights = [5, 4, 3, 2, 1].slice(0, top.length);
  const total = weights.reduce((n, w) => n + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < top.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return top[i];
  }
  return top[0];
}

/**
 * Scripted pick from the scored candidates. `friendsMap` is optional because
 * RecItem.friends already carries the names; it lets callers override them.
 */
export function localRicoFallback(
  candidates: RecItem[],
  mood?: Mood,
  friendsMap?: Map<number, string[]>,
  catalogue?: Catalogue,
): RicoRes {
  const cat = catalogue ?? getCatalogueSync() ?? catalogueServer();
  if (!candidates.length) {
    return {
      filmId: 105,
      line: 'Back to the Future. Trust me, kid, this ones got legs.',
      reason: "CRITICS' CHOICE",
      backups: [],
      fallback: true,
    };
  }

  const pick = pickWeightedTopFive(candidates);
  const film = cat.byId.get(pick.filmId);
  const friend = (friendsMap?.get(pick.filmId) ?? pick.friends)[0] ?? 'SOMEBODY';
  const title = film?.title ?? `FILM ${pick.filmId}`;
  const year = film?.year ?? 1986;

  const bank = [...(mood ? RICO_LINES[mood] : []), ...RICO_LINES.generic];
  const template = bank[Math.floor(Math.random() * bank.length)];
  const line = template
    .replace(/\{title\}\./g, title.replace(/[.!?]+$/, '') + '.') // "Your Name." + "." → one stop
    .replace(/\{title\}/g, title)
    .replace(/\{year\}/g, String(year))
    .replace(/\{friend\}/g, friend)
    .slice(0, 140);

  const backups = candidates
    .filter((c) => c.filmId !== pick.filmId)
    .slice(0, 3)
    .map((c) => c.filmId);

  return { filmId: pick.filmId, line, reason: pick.reason.slice(0, 60), backups, fallback: true };
}

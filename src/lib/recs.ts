// Pure recommendation scoring (BACKEND.md §6). Lane BE3.
// No I/O in this file — safe on server and client.
import type { Aisle, Film, Friend, Mood, RecItem, StaffPick } from './types';
import type { Catalogue } from './catalogue';

export interface RecsInput {
  catalogue: Catalogue;
  userFavs: number[];             // includes #1
  userTop: number | null;
  friends: Friend[];              // excludes the user
  watched?: number[];             // films the user hit PLAY on
  mood?: Mood;                    // used by RICO only
  exclude?: number[];
}

const MOOD_AISLES: Record<Mood, Aisle[]> = {
  laugh: ['comedy', 'animated'],
  scare: ['horror'],
  date: ['romance', 'comedy', 'drama'],
  mind: ['scifi', 'cult', 'drama'],
};

const AISLE_LABEL: Record<Aisle, string> = {
  action: 'ACTION', comedy: 'COMEDY', horror: 'HORROR', scifi: 'SCI-FI',
  drama: 'DRAMA', romance: 'ROMANCE', animated: 'ANIMATED', cult: 'CULT',
};

function inMood(aisle: Aisle, mood?: Mood, rating = 0): boolean {
  if (!mood) return true;
  if (mood === 'mind' && aisle === 'drama') return rating >= 7.2;
  return MOOD_AISLES[mood].includes(aisle);
}

function reasonFor(
  film: { id: number; aisle: Aisle; rating: number; trending: boolean },
  fans: Friend[],
  affinity: number,
): { reason: string; friends: string[] } {
  const names = fans.map((f) => f.name);
  const topFan = fans.find((f) => f.favId === film.id);
  let reason: string;
  if (topFan) reason = `${topFan.name}'S #1 PICK`;
  else if (fans.length > 1) reason = `${fans[0].name} + ${fans.length - 1} OTHERS LOVE THIS`;
  else if (fans.length === 1) reason = `${fans[0].name} LOVES THIS`;
  else if (affinity > 0) reason = `BECAUSE YOU LIKE ${AISLE_LABEL[film.aisle]}`;
  else if (film.trending) reason = 'TRENDING THIS WEEK';
  else reason = "CRITICS' CHOICE";
  return { reason: reason.toUpperCase().slice(0, 32), friends: names };
}

export function scoreRecs(input: RecsInput, limit = 18): RecItem[] {
  const {
    catalogue, userFavs, friends, watched = [], mood, exclude = [],
  } = input;
  const skipped = new Set([...userFavs, ...watched, ...exclude]);
  const favFilms: Film[] = userFavs
    .map((id) => catalogue.byId.get(id))
    .filter((f): f is Film => f !== undefined);

  const aisleCounts = new Map<Aisle, number>();
  const genreCounts = new Map<number, number>();
  for (const f of favFilms) {
    aisleCounts.set(f.aisle, (aisleCounts.get(f.aisle) ?? 0) + 1);
    for (const g of f.genres) genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
  }
  const totalFaves = favFilms.length || 1;

  const scored: (RecItem & { aisle: Aisle; votes: number })[] = [];
  for (const film of catalogue.films) {
    if (skipped.has(film.id)) continue;
    if (!inMood(film.aisle, mood, film.rating)) continue;

    const fans = friends.filter((f) => f.favourites.includes(film.id));
    const friendScore = fans.reduce((n, f) => n + 3 + (f.favId === film.id ? 2 : 0), 0);
    const affinity = (aisleCounts.get(film.aisle) ?? 0) / totalFaves;
    const overlap = Math.min(2, film.genres.reduce((n, g) => n + (genreCounts.has(g) ? 0.5 : 0), 0));
    const quality = (film.rating - 6.5) * 0.6;
    const confidence = film.votes < 300 ? -1 : 0;
    const trend = film.trending ? 0.5 : 0;
    const score = friendScore + 2 * affinity + overlap + quality + confidence + trend;

    const { reason, friends: fanNames } = reasonFor(film, fans, affinity);
    scored.push({
      filmId: film.id, score, reason, friends: fanNames, aisle: film.aisle, votes: film.votes,
    });
  }

  scored.sort((a, b) => b.score - a.score || b.votes - a.votes);

  const used = new Map<Aisle, number>();
  const out: RecItem[] = [];
  for (const item of scored) {
    if ((used.get(item.aisle) ?? 0) >= 4) continue;
    used.set(item.aisle, (used.get(item.aisle) ?? 0) + 1);
    out.push({
      filmId: item.filmId,
      score: Math.round(item.score * 10) / 10,
      reason: item.reason,
      friends: item.friends,
    });
    if (out.length >= limit) break;
  }
  return out;
}

/** Trending-only fallback (BACKEND.md §6). */
export function trendingFallback(catalogue: Catalogue, limit = 18): RecItem[] {
  return catalogue.trending.slice(0, limit).map((f) => ({
    filmId: f.id,
    score: f.rating,
    reason: 'TRENDING THIS WEEK',
    friends: [],
  }));
}

/** Staff Picks aggregate (BACKEND.md §6), sorted by count then rating. */
export function staffPicks(friends: Friend[], catalogue: Catalogue, limit = 24): StaffPick[] {
  const counts = new Map<number, Set<string>>();
  for (const friend of friends) {
    for (const filmId of friend.favourites) {
      const set = counts.get(filmId) ?? new Set<string>();
      set.add(friend.userId);
      counts.set(filmId, set);
    }
  }
  return [...counts.entries()]
    .map(([filmId, userIds]) => ({ filmId, userIds: [...userIds] }))
    .sort((a, b) =>
      b.userIds.length - a.userIds.length
      || (catalogue.byId.get(b.filmId)?.rating ?? 0) - (catalogue.byId.get(a.filmId)?.rating ?? 0))
    .slice(0, limit);
}

/** Pad a short scored list with trending films, skipping duplicates (BACKEND.md §6). */
export function padWithTrending(items: RecItem[], catalogue: Catalogue, limit = 18): RecItem[] {
  if (items.length >= limit) return items.slice(0, limit);
  const have = new Set(items.map((i) => i.filmId));
  const padded = [...items];
  for (const f of catalogue.trending) {
    if (have.has(f.id)) continue;
    padded.push({ filmId: f.id, score: f.rating, reason: 'TRENDING THIS WEEK', friends: [] });
    have.add(f.id);
    if (padded.length >= limit) break;
  }
  return padded;
}

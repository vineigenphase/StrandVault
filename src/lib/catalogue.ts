// Catalogue loader + index (BACKEND.md §4.3). Lane BE.
// Client: fetches /catalogue.json once (written by `npm run db:build`, DATA.md), falls back to mocks.ts
// if it's missing or broken so nothing ever renders blank. Server routes use lib/server/catalogue.ts.
import type { Aisle, Film } from './types';
import { mockFilms } from './mocks';

export interface Catalogue {
  films: Film[];
  byId: Map<number, Film>;
  byAisle: Record<Aisle, Film[]>;   // sorted by rating*log10(votes) desc
  trending: Film[];
  search(q: string, limit?: number): Film[];  // case-insensitive title prefix, then substring
}

const AISLES: Aisle[] = ['action', 'comedy', 'horror', 'scifi', 'drama', 'romance', 'animated', 'cult'];
const weight = (f: Film) => f.rating * Math.log10(Math.max(10, f.votes));

export function buildCatalogue(films: Film[]): Catalogue {
  const byId = new Map(films.map((f) => [f.id, f]));
  const byAisle = Object.fromEntries(AISLES.map((a) => [a, [] as Film[]])) as Record<Aisle, Film[]>;
  for (const f of films) byAisle[f.aisle]?.push(f);
  for (const a of AISLES) byAisle[a].sort((x, y) => weight(y) - weight(x));
  const trending = films.filter((f) => f.trending).sort((x, y) => y.rating - x.rating);
  return {
    films, byId, byAisle, trending,
    search(q, limit = 20) {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const prefix = films.filter((f) => f.title.toLowerCase().startsWith(s));
      const sub = films.filter((f) => !prefix.includes(f) && f.title.toLowerCase().includes(s));
      return [...prefix, ...sub].slice(0, limit);
    },
  };
}

let cached: Catalogue | null = null;
let pending: Promise<Catalogue> | null = null;

/** Resolves once, memoised. Real catalogue when available, mocks otherwise. */
export function loadCatalogue(): Promise<Catalogue> {
  if (cached) return Promise.resolve(cached);
  pending ??= fetchFilms().then((films) => (cached = buildCatalogue(films.length ? films : mockFilms)));
  return pending;
}

async function fetchFilms(): Promise<Film[]> {
  if (typeof window === 'undefined') return [];
  try {
    const res = await fetch('/catalogue.json', { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { films?: Film[] };
    return Array.isArray(json.films) ? json.films.filter((f) => f && typeof f.id === 'number' && f.title) : [];
  } catch {
    return [];
  }
}

/** Synchronous access after loadCatalogue() has resolved. */
export function getCatalogueSync(): Catalogue | null {
  return cached;
}

/** Mock-backed catalogue (tests, or before the real one has loaded). Server routes: lib/server/catalogue.ts. */
export function catalogueServer(): Catalogue {
  return buildCatalogue(mockFilms);
}

// Catalogue loader + index (BACKEND.md §4.3). Lane BE.
// Browser fetches /catalogue.json once; server reads the committed file at build.
// Both fall back to mocks.ts so the demo never renders blank.
import type { Aisle, Film } from './types';
import { mockFilms } from './mocks';
import committedCatalogue from '../../public/catalogue.json';

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

const committed = (committedCatalogue as { films?: unknown }).films;
const committedFilms: Film[] = Array.isArray(committed) && committed.length
  ? committed as Film[]
  : mockFilms;

let cached: Catalogue | null = null;
let pending: Promise<Catalogue> | null = null;

/** Client + server: resolves once, memoised (BACKEND.md §4.3). */
export function loadCatalogue(): Promise<Catalogue> {
  if (cached) return Promise.resolve(cached);
  if (typeof window === 'undefined') {
    cached = buildCatalogue(committedFilms);
    return Promise.resolve(cached);
  }
  pending ??= fetch('/catalogue.json')
    .then((res) => {
      if (!res.ok) throw new Error(`catalogue ${res.status}`);
      return res.json();
    })
    .then((file: { films?: unknown }) => {
      if (!Array.isArray(file.films) || !file.films.length) throw new Error('empty catalogue');
      return buildCatalogue(file.films as Film[]);
    })
    .catch(() => buildCatalogue(mockFilms))
    .then((catalogue) => (cached = catalogue));
  return pending;
}

/** Synchronous access after loadCatalogue() has resolved. */
export function getCatalogueSync(): Catalogue | null {
  return cached;
}

/** Server-side, synchronous: reads the committed catalogue.json. */
export function catalogueServer(): Catalogue {
  return (cached ??= buildCatalogue(committedFilms));
}

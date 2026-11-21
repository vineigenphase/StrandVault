// Server-side catalogue: reads public/catalogue.json once per server instance, falls back to mocks.
// Use from route handlers (recs, rico). Never import from client components.
import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { buildCatalogue, type Catalogue } from '../catalogue';
import { mockFilms } from '../mocks';
import type { Film } from '../types';

let cached: Catalogue | null = null;

export function serverCatalogue(): Catalogue {
  if (cached) return cached;
  let films: Film[] = [];
  try {
    const json = JSON.parse(readFileSync(path.join(process.cwd(), 'public', 'catalogue.json'), 'utf8')) as { films?: Film[] };
    films = Array.isArray(json.films) ? json.films : [];
  } catch {
    /* not built yet: npm run db:build */
  }
  return (cached = buildCatalogue(films.length ? films : mockFilms));
}

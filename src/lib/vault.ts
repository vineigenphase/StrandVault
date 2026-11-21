// Client-safe vault helpers for the UI: search anything, open anything.
// Online: /api/search (DB + live TMDB). Offline/DEMO_OFFLINE: /vault-index.json (every title, tiny).
import type { Aisle, Film } from './types';

export interface VaultHit {
  id: number;            // app id (TV is negative)
  title: string;
  year: number;
  mediaType: 'movie' | 'tv';
  poster: string;        // ready-to-use URL ('' if none)
  aisle?: Aisle;
  film?: Film;           // present when the server returned full detail
}

type IndexRow = { i: number; t: string; y: number; m: 'm' | 't'; p: string; a: Aisle };
let indexPromise: Promise<IndexRow[]> | null = null;
const loadIndex = () =>
  (indexPromise ??= fetch('/vault-index.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []));

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\w\s]/g, '').trim();

async function localSearch(q: string, limit: number): Promise<VaultHit[]> {
  const idx = await loadIndex();
  const nq = norm(q);
  const words = nq.split(/\s+/).filter(Boolean);
  const scored: { r: IndexRow; s: number }[] = [];
  for (let k = 0; k < idx.length; k++) {
    const r = idx[k];
    const nt = norm(r.t);
    let s = 0;
    if (nt === nq) s = 100;
    else if (nt.startsWith(nq)) s = 60;
    else if (words.every((w) => nt.includes(w))) s = 30;
    if (s) scored.push({ r, s: s - k / idx.length }); // index is popularity-sorted: earlier = better
  }
  return scored
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map(({ r }) => ({
      id: r.i, title: r.t, year: r.y, mediaType: r.m === 't' ? 'tv' : 'movie', aisle: r.a,
      poster: r.p ? `https://image.tmdb.org/t/p/w185${r.p}` : '',
    }));
}

export async function searchVault(q: string, opts: { type?: 'movie' | 'tv'; limit?: number; signal?: AbortSignal } = {}): Promise<VaultHit[]> {
  const limit = opts.limit ?? 24;
  if (q.trim().length < 2) return [];
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    opts.signal?.addEventListener('abort', () => ctrl.abort());
    const params = new URLSearchParams({ q, limit: String(limit), ...(opts.type ? { type: opts.type } : {}) });
    const res = await fetch(`/api/search?${params}`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const { results } = (await res.json()) as { results: Film[] };
      if (results?.length) {
        return results.map((f) => ({
          id: f.id, title: f.title, year: f.year, mediaType: f.mediaType ?? (f.id < 0 ? 'tv' : 'movie'),
          poster: f.poster, aisle: f.aisle, film: f,
        }));
      }
    }
  } catch {
    /* fall back to local index */
  }
  return localSearch(q, limit);
}

/** Full Film for any app id: shelf catalogue first (instant, offline), then the vault API. */
export async function getTitle(id: number, catalogueById?: (id: number) => Film | undefined): Promise<Film | null> {
  const local = catalogueById?.(id);
  if (local) return local;
  try {
    const res = await fetch(`/api/title/${id}`);
    return res.ok ? ((await res.json()) as Film) : null;
  } catch {
    return null;
  }
}

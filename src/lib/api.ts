// Typed client wrappers for every /api route (BACKEND.md §5.2). Lane BE.
// Wrappers never throw: timeouts/errors become local fallbacks computed from
// the cached catalogue (or mocks.ts before BE1 lands).
import type {
  FavReq, FavRes, JoinReq, JoinRes, Look, OpenReq, RecsRes, RicoReq, RicoRes, StoreStateRes, WatchReq,
} from './types';
import { mockFilms, mockFriends, mockStaffPicks } from './mocks';
import { buildCatalogue, getCatalogueSync } from './catalogue';
import { scoreRecs, trendingFallback } from './recs';
import { localRicoFallback } from './rico-fallback';

const DEFAULT_CODE = process.env.NEXT_PUBLIC_STORE_CODE || 'KCL';

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const cleanName = (value: string) =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').trim().slice(0, 12) || 'GUEST';

const catalogueNow = () => getCatalogueSync() ?? buildCatalogue(mockFilms);

async function post<T>(path: string, payload: unknown, fallback: T, timeout = 4000): Promise<T> {
  try {
    const res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeout),
    });
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    return fallback;
  }
}

async function get<T>(path: string, fallback: T, timeout = 4000): Promise<T> {
  try {
    const res = await fetch(`/api/${path}`, { signal: AbortSignal.timeout(timeout) });
    if (!res.ok) return fallback;
    return await res.json() as T;
  } catch {
    return fallback;
  }
}

function fireAndForget(path: string, payload: unknown): void {
  void fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}

export const api = {
  join(req: JoinReq): Promise<JoinRes> {
    const name = cleanName(req.name);
    const userId = req.userId ?? uuid();
    const look: Look = req.look ?? {
      jacket: '#FF2E88', hair: 'mullet', hairColor: '#3B1F0E', skin: '#E0AC69', shades: true,
    };
    const fallback: JoinRes = {
      userId,
      presence: { userId, name, look, favId: req.favId, scene: 'street' },
      offline: true,
    };
    return post('join', { ...req, name }, fallback);
  },

  favourite(req: FavReq): Promise<FavRes> {
    return post('favourite', req, { ok: false, favourites: [], favId: null });
  },

  open(req: OpenReq): void {
    fireAndForget('open', req);
  },

  watch(req: WatchReq): void {
    fireAndForget('watch', req);
  },

  /** Server recs first; offline, the same engine runs locally over the catalogue + my faves. */
  recs(userId: string | null, code: string = DEFAULT_CODE, myFavs: number[] = [], myTop: number | null = null): Promise<RecsRes> {
    const catalogue = catalogueNow();
    const local = myFavs.length || myTop !== null
      ? scoreRecs({ catalogue, userFavs: myFavs, userTop: myTop, friends: [] }, 18)
      : [];
    const fallback: RecsRes = { items: local.length ? local : trendingFallback(catalogue), fallback: true };
    const query = new URLSearchParams({ code });
    if (userId) query.set('userId', userId);
    return get(`recs?${query.toString()}`, fallback);
  },

  rico(req: RicoReq): Promise<RicoRes> {
    const catalogue = catalogueNow();
    const exclude = req.exclude?.slice(0, 50);
    const candidates = scoreRecs({
      catalogue, userFavs: [], userTop: null, friends: [], mood: req.mood, exclude,
    }, 30);
    const pool = candidates.length ? candidates : trendingFallback(catalogue, 30);
    const fallback = localRicoFallback(pool, req.mood, undefined, catalogue);
    return post('rico', req, fallback, 6000);
  },

  storeState(code: string = DEFAULT_CODE): Promise<StoreStateRes> {
    return get(`store-state?code=${encodeURIComponent(code)}`, {
      friends: mockFriends,
      staffPicks: mockStaffPicks,
    });
  },
};

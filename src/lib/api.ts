// Typed client wrappers for every /api route (BACKEND.md §5.2). Lane BE.
// T0 version: final signatures, returning mocks after a fake delay. Wrappers never throw.
// TODO(BE2): join / favourite / open / watch / storeState → real fetches.
// TODO(BE3): recs → GET /api/recs first; the local engine below stays as the offline fallback.
// TODO(BE4): rico → real fetch + localRicoFallback.
import type {
  FavReq, FavRes, JoinReq, JoinRes, OpenReq, RecsRes, RicoReq, RicoRes, StoreStateRes, WatchReq,
} from './types';
import { loadCatalogue } from './catalogue';
import { mockFilms, mockFriends, mockRecs, mockRicoPick, mockStaffPicks } from './mocks';
import { recommend, signalsFrom, trendingFallback } from './recs';

const delay = <T>(value: T, min = 200, max = 600): Promise<T> =>
  new Promise((r) => setTimeout(() => r(value), min + Math.random() * (max - min)));

const MOOD_AISLES = {
  laugh: ['comedy', 'animated'],
  scare: ['horror'],
  date: ['romance', 'comedy', 'drama'],
  mind: ['scifi', 'cult', 'drama'],
} as const;

const DEFAULT_CODE = process.env.NEXT_PUBLIC_STORE_CODE || 'KCL';

const uuid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const api = {
  join(req: JoinReq): Promise<JoinRes> {
    const userId = req.userId ?? uuid();
    return delay({
      userId,
      presence: { userId, name: req.name.toUpperCase().slice(0, 12) || 'GUEST', look: req.look, favId: req.favId, scene: 'street' },
      offline: true,
    });
  },

  favourite(req: FavReq): Promise<FavRes> {
    return delay({
      ok: true,
      favourites: req.on || req.setTop ? [req.filmId] : [],
      favId: req.setTop ? req.filmId : null,
    });
  },

  open(req: OpenReq): void {
    void req;
  },

  watch(req: WatchReq): void {
    void req;
  },

  /** Offline: the real engine (lib/recs.ts) over the loaded catalogue + demo friends. */
  async recs(userId: string | null, code: string = DEFAULT_CODE, myFavs: number[] = [], myTop: number | null = null): Promise<RecsRes> {
    void code;
    try {
      const c = await loadCatalogue();
      const items = recommend(c.films, signalsFrom(userId, mockFriends, myFavs, myTop), { k: 18 });
      return delay({ items: items.length ? items : trendingFallback(c, 18), fallback: true });
    } catch {
      return delay({ items: mockRecs, fallback: true });
    }
  },

  rico(req: RicoReq): Promise<RicoRes> {
    const pool = req.mood
      ? mockFilms.filter((f) => (MOOD_AISLES[req.mood!] as readonly string[]).includes(f.aisle))
      : mockFilms;
    const candidates = pool.filter((f) => !req.exclude?.includes(f.id));
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return delay(mockRicoPick, 800, 1600);
    return delay(
      {
        filmId: pick.id,
        line: `${pick.title}. Trust me, kid, this one's got legs.`,
        reason: 'RICO SAYS SO',
        backups: candidates.filter((f) => f.id !== pick.id).slice(0, 3).map((f) => f.id),
        fallback: true,
      },
      800,
      1600,
    );
  },

  storeState(code: string = DEFAULT_CODE): Promise<StoreStateRes> {
    void code;
    return delay({ friends: mockFriends, staffPicks: mockStaffPicks });
  },
};

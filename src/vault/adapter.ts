// THE VAULT UI ↔ app data. Builds the ported engine's adapter from the real catalogue, the recs engine,
// THE VAULT search, RICO, friends (store-state + realtime) and the watch/favourite APIs.
import { api } from '@/lib/api';
import type { Catalogue } from '@/lib/catalogue';
import { emit, emitApp } from '@/lib/events';
import { sortProviders, tmdbWatchUrl, watchUrl } from '@/lib/links';
import { scoreRecs, staffPicks } from '@/lib/recs';
import type { Aisle, Film, Friend, Look, Mood, Provider } from '@/lib/types';
import { getTitle, searchVault, type VaultHit } from '@/lib/vault';
import { shade } from '@/game/sprites/pixel';
import type { PersonPalette, RekoVibe, VaultAdapter, VaultMovie, VaultPerson } from './engine';
import { mockFriends } from '@/lib/mocks';
import { mustWatches } from './mustWatch';

/** The three demo regulars who wander the store until real people join. */
export const DEMO_FRIENDS: Friend[] = (['JATHU', 'VINU', 'AKIRA'] as const).map((name, i) => ({
  ...mockFriends[i % mockFriends.length],
  userId: `demo-${name.toLowerCase()}`,
  name,
  isDemo: true,
}));

// ── Film → artifact movie ─────────────────────────────────────────────────────────────

const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama',
  10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Sci-Fi', 53: 'Thriller', 10752: 'War', 37: 'Western',
};

// Generated-art fallback (only used when a title has no poster): a motif + palette per aisle.
const LOOKS: Record<Aisle, { motifs: string[]; palettes: [string, string, string][] }> = {
  scifi: { motifs: ['planet', 'spiral', 'cityhaze', 'code', 'rings'], palettes: [['#060d24', '#2a5a8f', '#f2d29b'], ['#0b131d', '#45678a', '#d9b26a'], ['#010a04', '#1aff6a', '#a0ffc0']] },
  action: { motifs: ['dust', 'jets', 'fire', 'cityfire'], palettes: [['#1a0b05', '#ff7a1a', '#5ad0ff'], ['#081830', '#ff8a3a', '#ffe0a0'], ['#0a0604', '#ff6a1a', '#ffe0a0']] },
  horror: { motifs: ['cityfire', 'split', 'fire'], palettes: [['#0c0404', '#8a1a1a', '#ff5a3a'], ['#0c0c0c', '#3a5a3a', '#e8e8d8']] },
  comedy: { motifs: ['pinkgeo', 'clouds', 'halftone', 'sling'], palettes: [['#ff6ab8', '#ffd0e8', '#2ad0ff'], ['#0a3a7a', '#ff3a2a', '#ffd23f']] },
  drama: { motifs: ['split', 'sea', 'lanterns', 'stars'], palettes: [['#050f1c', '#1f6a8a', '#e8d3a0'], ['#120826', '#b388ff', '#ffd08a']] },
  romance: { motifs: ['stars', 'emerald', 'lanterns'], palettes: [['#08082e', '#6a3aff', '#ffd23f'], ['#1c0414', '#ff2e88', '#ffd0e8']] },
  animated: { motifs: ['orbs', 'halftone', 'clouds', 'lanterns'], palettes: [['#140c38', '#ffd23f', '#3a8aff'], ['#1f78ff', '#bfe8ff', '#ffd23f']] },
  cult: { motifs: ['flames', 'code', 'cityhaze', 'web'], palettes: [['#120604', '#ff7a1a', '#2ad0ff'], ['#08081a', '#e8233a', '#3a5aff']] },
};

const TAGS: Record<Aisle, string[]> = {
  action: ['epic'], scifi: ['epic', 'mind'], horror: ['mind'], comedy: ['funny', 'feel'], drama: ['mind', 'feel'],
  romance: ['feel'], animated: ['feel', 'funny'], cult: ['mind', 'epic'],
};

const hashN = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export function toMovie(f: Film): VaultMovie {
  const look = LOOKS[f.aisle] ?? LOOKS.drama;
  const h = hashN(f.id);
  return {
    id: String(f.id),
    t: f.title,
    y: f.year,
    rt: f.runtime || null,
    g: f.genres.map((g) => GENRES[g]).filter(Boolean).slice(0, 3),
    d: f.director ?? '',
    m: look.motifs[Math.floor(h * look.motifs.length)],
    c: look.palettes[Math.floor(hashN(f.id + 7) * look.palettes.length)],
    sc: Math.round((f.rating / 2) * 10) / 10,
    tags: TAGS[f.aisle] ?? ['epic'],
    desc: f.overview,
    img: f.poster || undefined,
    bd: f.backdrop || undefined,
    film: f,
    full: true,
  };
}

/** A thin search hit (offline index) until ensure() fetches details. */
function hitToMovie(h: VaultHit): VaultMovie {
  if (h.film) return toMovie(h.film);
  const aisle: Aisle = h.aisle ?? 'drama';
  const look = LOOKS[aisle];
  return {
    id: String(h.id), t: h.title, y: h.year, rt: null, g: [], d: '', m: look.motifs[0], c: look.palettes[0],
    sc: 0, tags: TAGS[aisle], desc: '', img: h.poster || undefined, full: false,
  };
}

// ── People ────────────────────────────────────────────────────────────────────────────

export function paletteFor(look: Look): PersonPalette {
  return {
    skin: look.skin,
    hair: look.hairColor,
    top: look.jacket,
    top2: shade(look.jacket, -0.32),
    pants: '#2a2a3a',
    shoe: '#eef0ff',
    long: look.hair === 'long' || look.hair === 'mullet' || look.hair === 'curls' ? 1 : 0,
    ...(look.shades ? { glasses: 1 as const } : {}),
  };
}

// Wander routes from the artifact (store floor coordinates).
const ROUTES: { x: number; y: number; spots: [number, number][] }[] = [
  { x: 104, y: 126, spots: [[104, 126], [60, 72], [150, 182], [104, 126]] },
  { x: 300, y: 182, spots: [[300, 182], [240, 126], [360, 120], [300, 182]] },
  { x: 126, y: 56, spots: [[126, 56], [70, 182], [200, 124], [126, 56]] },
];

const pretty = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

// ── Watchlist (local, mirrored to /api/favourite + realtime) ──────────────────────────

const WL_KEY = 'sv-watchlist';
function readWatchlist(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(WL_KEY) ?? '[]');
    return Array.isArray(v) ? v.map(String) : [];
  } catch {
    return [];
  }
}
function writeWatchlist(ids: string[]) {
  try {
    localStorage.setItem(WL_KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    /* private mode: keep in memory only */
  }
}

// ── Build ─────────────────────────────────────────────────────────────────────────────

export interface AdapterInput {
  catalogue: Catalogue;
  friends: Friend[];
  userId: string;
  myLook?: Look;
  fonts: { display: string; body: string };
  /** Live favourites (realtime store `favs`) for "friends who love this". */
  liveFavs: () => Readonly<Record<string, readonly number[]>>;
  /** userId → display name for live players. */
  liveNames: () => Record<string, string>;
}

const MOOD: Record<RekoVibe, Mood | undefined> = { funny: 'laugh', mind: 'mind', feel: 'date', epic: undefined, any: undefined };

export function buildAdapter(input: AdapterInput): VaultAdapter {
  const { catalogue, friends, userId } = input;
  const byId = new Map(catalogue.films.map((f) => [f.id, f]));
  const movies = catalogue.films.map(toMovie);
  const others = friends.filter((f) => f.userId !== userId);

  // Shelves (distinct across shelves, 7 each)
  const used = new Set<number>();
  const take = (ids: number[], n = 7) => {
    const out: string[] = [];
    for (const id of ids) {
      if (out.length >= n) break;
      if (used.has(id) || !byId.has(id)) continue;
      used.add(id);
      out.push(String(id));
    }
    return out;
  };
  const myFavs = readWatchlist().map(Number).filter((n) => byId.has(n));
  const picks = staffPicks(others, catalogue, 24);
  const B = take(picks.map((p) => p.filmId));
  const A = take(scoreRecs({ catalogue, userFavs: myFavs, userTop: null, friends: others }, 30).map((r) => r.filmId));
  const C = take([...catalogue.trending].sort((a, b) => b.rating - a.rating).map((f) => f.id));
  const D = take(catalogue.byAisle.cult.map((f) => f.id).concat(catalogue.films.filter((f) => f.year && f.year < 2000).sort((a, b) => b.rating - a.rating).map((f) => f.id)));
  for (const shelf of [A, B, C, D]) {
    if (shelf.length < 7) shelf.push(...take(catalogue.films.map((f) => f.id), 7 - shelf.length));
  }

  // Must-watches board: the big 2026 releases with UK dates (src/vault/mustWatch.ts)
  const pins = mustWatches();
  for (const m of pins.movies) if (!movies.some((x) => x.id === m.id)) movies.push(m);
  const must = pins.movies.map((m) => m.id);
  const mustWho = pins.who;

  // Demo wanderers (hidden as soon as real players are in the store)
  const people: VaultPerson[] = DEMO_FRIENDS.map((f, i) => ({
    id: `demo-${f.userId}`,
    name: pretty(f.name),
    fav: f.favId !== null ? String(f.favId) : undefined,
    recent: f.favourites.find((id) => id !== f.favId) !== undefined ? String(f.favourites.find((id) => id !== f.favId)) : undefined,
    ...ROUTES[i % ROUTES.length],
    dir: 1,
    P: paletteFor(f.look),
  }));

  const ensureFilm = async (id: string): Promise<Film | null> => getTitle(Number(id), (n) => byId.get(n));

  return {
    movies,
    shelves: { A, B, C, D },
    must,
    mustWho,
    people,
    heroPalette: input.myLook ? paletteFor(input.myLook) : undefined,
    fonts: input.fonts,
    vaultLabel: '5,000 films · 2,000 shows in THE VAULT',
    dev: process.env.NODE_ENV !== 'production',

    watchlist: readWatchlist,
    isSaved: (id) => readWatchlist().includes(id),
    toggleSaved(m) {
      const list = readWatchlist();
      const on = !list.includes(m.id);
      writeWatchlist(on ? [m.id, ...list] : list.filter((x) => x !== m.id));
      const filmId = Number(m.id);
      void api.favourite({ userId, filmId, on });
      emitApp({ type: 'fav', filmId, on }); // realtime broadcast + live Staff Picks
      return on;
    },

    lovers(id) {
      const filmId = Number(id);
      const names = new Set<string>();
      for (const f of others) if (f.favourites.includes(filmId) || f.favId === filmId) names.add(pretty(f.name));
      const live = input.liveFavs();
      const liveNames = input.liveNames();
      for (const [u, ids] of Object.entries(live)) if (u !== userId && ids.includes(filmId) && liveNames[u]) names.add(pretty(liveNames[u]));
      return [...names].slice(0, 6);
    },

    providers(m) {
      const seen = new Set<string>();
      return sortProviders(m.film?.providers ?? []).filter((p) => {
        if (seen.has(p.id + p.name)) return false;
        seen.add(p.id + p.name);
        return true;
      });
    },

    watch(m, provider: Provider | null) {
      const f = m.film;
      if (!f) return;
      // Must open synchronously inside the click so popup blockers allow it.
      const url = provider ? watchUrl(f, provider) : f.tmdbWatchLink || tmdbWatchUrl(f);
      window.open(url, '_blank', 'noopener,noreferrer');
      api.watch({ userId, filmId: f.id, provider: provider?.id ?? 'other' });
      emitApp({ type: 'now-playing', filmId: f.id, provider: provider?.id ?? 'other' });
    },

    async search(q) {
      const hits = await searchVault(q, { limit: 24 });
      return hits.map(hitToMovie);
    },

    async ensure(id) {
      const f = await ensureFilm(id);
      if (f) byId.set(f.id, f);
      return f ? toMovie(f) : null;
    },

    async rico(vibe, exclude) {
      const res = await api.rico({ userId, mood: MOOD[vibe], exclude: exclude.map(Number).filter(Number.isFinite) });
      const f = byId.get(res.filmId) ?? (await ensureFilm(String(res.filmId)));
      return f ? { movie: toMovie(f), line: res.line || null } : null;
    },

    onOpen(m) {
      const filmId = Number(m.id);
      api.open({ userId, filmId, source: 'shelf' });
      emit({ type: 'open-film', filmId, source: 'shelf' }); // realtime "X is browsing…" toast for others
    },
  };
}

// Recommendation engine (BACKEND.md §6). Lane BE. Pure, isomorphic, no I/O: unit-testable.
//
// Modelled on how large streaming recommenders work, scaled to a store-sized catalogue:
//
//   1. SIGNALS     implicit feedback with strengths + time decay
//                  (#1 fave 1.5 · fave 1.0 · watch 0.9 · open 0.25; half-life 14 days)
//   2. CANDIDATES  four independent sources, each scored 0..1
//                  - taste:  cosine(film features, user taste profile)  [content-based]
//                            features = genres, decade, aisle, director, top cast, media type
//                  - cf:     item-item collaborative filtering over everyone's positives
//                            sim(i,j) = co(i,j) / sqrt(n_i·n_j), shrunk by co/(co+λ)
//                  - crew:   friends' positives weighted by user-user similarity (taste + overlap)
//                  - prior:  Bayesian-average quality (+ trending), so thin vote counts don't win
//   3. BLEND       weights adapt to how much we know (cold start leans on crew/prior)
//   4. RE-RANK     MMR for diversity (λ = 0.72) + per-aisle cap + exploration slots
//   5. EXPLAIN     every item gets a reasonType + a short human reason ("BECAUSE YOU LOVED ALIEN")
//
// Main entry points: recommend(), moreLikeThis(), personalRows(), rankShelf(), trendingFallback().
import type { Catalogue } from './catalogue';
import type { Film, Friend, Mood, ReasonType, RecItem, StaffPick } from './types';

// ── Inputs ──────────────────────────────────────────────────────────────────────────────

export interface Interaction { userId: string; filmId: number; at?: number }
export interface FavInteraction extends Interaction { top?: boolean }

export interface Signals {
  me: string | null;
  favs: FavInteraction[];
  watches?: Interaction[];
  opens?: Interaction[];
  /** userId → display name (for "MAYA LOVES THIS"). */
  names?: Record<string, string>;
}

export interface RecOptions {
  k?: number;
  mood?: Mood;
  exclude?: number[];
  /** Diversity trade-off for MMR: 1 = pure relevance, 0 = pure diversity. */
  lambda?: number;
  /** Max items from one aisle (default ceil(k/4)). */
  aisleCap?: number;
  /** Every Nth slot is an exploration pick from outside your usual aisles (0 = off). */
  exploreEvery?: number;
  /** Clock for time decay (ms). */
  now?: number;
  /** Seed for the deterministic exploration shuffle. */
  seed?: number;
}

const WEIGHT = { top: 1.5, fav: 1.0, watch: 0.9, open: 0.25 } as const;
const HALF_LIFE_MS = 14 * 24 * 3600 * 1000;
const CF_SHRINK = 2;               // λ in co/(co+λ): tiny co-occurrence counts can't dominate
const PRIOR_M = 400;               // Bayesian average: votes needed to trust a rating
const PRIOR_C = 6.6;               // catalogue-wide mean rating
const MOOD_AISLES: Record<Mood, readonly string[]> = {
  laugh: ['comedy', 'animated'],
  scare: ['horror'],
  date: ['romance', 'comedy', 'drama'],
  mind: ['scifi', 'cult', 'drama'],
};

// ── Content features (sparse vectors, cached per catalogue) ─────────────────────────────

type Vec = Map<string, number>;

function features(f: Film): Vec {
  const v: Vec = new Map();
  for (const g of f.genres) v.set(`g:${g}`, 1);
  if (f.year) v.set(`d:${Math.floor(f.year / 10) * 10}`, 0.5);
  v.set(`a:${f.aisle}`, 0.6);
  if (f.director) v.set(`p:${f.director.toLowerCase()}`, 1.2);
  f.cast.slice(0, 3).forEach((c) => v.set(`c:${c.toLowerCase()}`, 0.7));
  v.set(`m:${f.mediaType ?? 'movie'}`, 0.3);
  return v;
}

function norm(v: Vec): number {
  let s = 0;
  for (const x of v.values()) s += x * x;
  return Math.sqrt(s);
}

function cosine(a: Vec, b: Vec, na = norm(a), nb = norm(b)): number {
  if (!na || !nb) return 0;
  const [small, big] = a.size < b.size ? [a, b] : [b, a];
  let d = 0;
  for (const [k, x] of small) {
    const y = big.get(k);
    if (y) d += x * y;
  }
  return d / (na * nb);
}

interface Indexed { film: Film; vec: Vec; n: number }
const indexCache = new WeakMap<Film[], Map<number, Indexed>>();

function indexFilms(films: Film[]): Map<number, Indexed> {
  let idx = indexCache.get(films);
  if (!idx) {
    idx = new Map(films.map((film) => {
      const vec = features(film);
      return [film.id, { film, vec, n: norm(vec) }];
    }));
    indexCache.set(films, idx);
  }
  return idx;
}

/** Content similarity between two films (0..1). */
export function similarity(a: Film, b: Film): number {
  return cosine(features(a), features(b));
}

// ── Signals → per-user positive weights ─────────────────────────────────────────────────

function decay(at: number | undefined, now: number): number {
  if (!at) return 1;
  return Math.pow(0.5, Math.max(0, now - at) / HALF_LIFE_MS);
}

/** userId → filmId → weight (max over interaction types, decayed). */
function userWeights(s: Signals, now: number): Map<string, Map<number, number>> {
  const out = new Map<string, Map<number, number>>();
  const add = (u: string, id: number, w: number) => {
    let m = out.get(u);
    if (!m) out.set(u, (m = new Map()));
    m.set(id, Math.max(m.get(id) ?? 0, w));
  };
  for (const f of s.favs) add(f.userId, f.filmId, (f.top ? WEIGHT.top : WEIGHT.fav) * decay(f.at, now));
  for (const w of s.watches ?? []) add(w.userId, w.filmId, WEIGHT.watch * decay(w.at, now));
  for (const o of s.opens ?? []) add(o.userId, o.filmId, WEIGHT.open * decay(o.at, now));
  return out;
}

// ── Scoring components ──────────────────────────────────────────────────────────────────

function prior(f: Film): number {
  const v = Math.max(0, f.votes);
  const bayes = (v / (v + PRIOR_M)) * f.rating + (PRIOR_M / (v + PRIOR_M)) * PRIOR_C; // ~ 5..9
  return Math.max(0, Math.min(1, (bayes - 5) / 4)) * 0.85 + (f.trending ? 0.15 : 0);
}

/** Item-item co-occurrence over all users' positives (binary, strength ≥ fav-ish). */
function itemItem(weights: Map<string, Map<number, number>>) {
  const users = [...weights.values()].map((m) => [...m.entries()].filter(([, w]) => w >= 0.5).map(([id]) => id));
  const count = new Map<number, number>();
  const co = new Map<string, number>();
  for (const items of users) {
    for (const i of items) count.set(i, (count.get(i) ?? 0) + 1);
    for (let a = 0; a < items.length; a++) {
      for (let b = a + 1; b < items.length; b++) {
        const [i, j] = items[a] < items[b] ? [items[a], items[b]] : [items[b], items[a]];
        const k = `${i}:${j}`;
        co.set(k, (co.get(k) ?? 0) + 1);
      }
    }
  }
  return (i: number, j: number): number => {
    if (i === j) return 0;
    const c = co.get(i < j ? `${i}:${j}` : `${j}:${i}`) ?? 0;
    if (!c) return 0;
    return (c / Math.sqrt((count.get(i) ?? 1) * (count.get(j) ?? 1))) * (c / (c + CF_SHRINK));
  };
}

function tasteProfile(mine: Map<number, number>, idx: Map<number, Indexed>): Vec | null {
  const v: Vec = new Map();
  let total = 0;
  for (const [id, w] of mine) {
    const it = idx.get(id);
    if (!it) continue;
    total += w;
    for (const [k, x] of it.vec) v.set(k, (v.get(k) ?? 0) + (x * w));
  }
  return total ? v : null;
}

const short = (t: string, n = 16) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t).toUpperCase();
const AISLE_LABEL: Record<string, string> = {
  action: 'ACTION', comedy: 'COMEDY', horror: 'HORROR', scifi: 'SCI-FI', drama: 'DRAMA',
  romance: 'ROMANCE', animated: 'ANIMATION', cult: "'80s CULT",
};

interface Scored {
  film: Film;
  score: number;
  parts: { taste: number; cf: number; crew: number; prior: number };
  seed: number | null;          // the user's film that best explains taste/cf
  friends: string[];            // userIds of friends who love it
  friendTop: string | null;     // a friend whose #1 it is
}

// ── recommend() ─────────────────────────────────────────────────────────────────────────

export function recommend(films: Film[], s: Signals, o: RecOptions = {}): RecItem[] {
  const k = o.k ?? 18;
  const now = o.now ?? Date.now();
  const idx = indexFilms(films);
  const weights = userWeights(s, now);
  const mine = (s.me && weights.get(s.me)) || new Map<number, number>();
  const myStrong = new Set([...mine.entries()].filter(([, w]) => w >= 0.5).map(([id]) => id));
  const watched = new Set((s.watches ?? []).filter((w) => w.userId === s.me).map((w) => w.filmId));
  const opened = new Map<number, number>();
  for (const x of s.opens ?? []) if (x.userId === s.me) opened.set(x.filmId, (opened.get(x.filmId) ?? 0) + 1);
  const exclude = new Set(o.exclude ?? []);
  const names = s.names ?? {};
  const topOf = new Map(s.favs.filter((f) => f.top).map((f) => [f.userId, f.filmId]));

  // Taste profile + its norm
  const taste = tasteProfile(mine, idx);
  const tasteN = taste ? norm(taste) : 0;

  // Collaborative filtering
  const sim = itemItem(weights);

  // Friend affinity: overlap with me (Jaccard) + taste closeness; everyone gets a floor.
  const affinity = new Map<string, number>();
  for (const [u, m] of weights) {
    if (u === s.me) continue;
    const theirs = new Set([...m.entries()].filter(([, w]) => w >= 0.5).map(([id]) => id));
    let inter = 0;
    for (const id of theirs) if (myStrong.has(id)) inter++;
    const union = theirs.size + myStrong.size - inter;
    const jac = union ? inter / union : 0;
    const tp = taste ? tasteProfile(m, idx) : null;
    const tc = taste && tp ? cosine(taste, tp, tasteN) : 0;
    affinity.set(u, 0.35 + 0.4 * jac + 0.25 * tc);
  }

  const moodAisles = o.mood ? MOOD_AISLES[o.mood] : null;
  const pool = films.filter(
    (f) =>
      !myStrong.has(f.id) && !watched.has(f.id) && !exclude.has(f.id) &&
      (!moodAisles || (moodAisles.includes(f.aisle) && (o.mood !== 'mind' || f.rating >= 7.2 || f.aisle !== 'drama'))),
  );

  // Raw component scores
  const raw = pool.map((film): Scored => {
    const it = idx.get(film.id)!;
    let tasteS = 0;
    let cfS = 0;
    let seed: number | null = null;
    let seedBest = 0;
    if (taste) tasteS = cosine(it.vec, taste, it.n, tasteN);
    for (const [id, w] of mine) {
      const c = sim(id, film.id) * w;
      cfS += c;
      // Seed = my film most like this one (content first, CF as tie-break)
      const mineIt = idx.get(id);
      const contentSim = mineIt ? cosine(it.vec, mineIt.vec, it.n, mineIt.n) : 0;
      const expl = contentSim + c;
      if (expl > seedBest && w >= 0.5) {
        seedBest = expl;
        seed = id;
      }
    }
    let crewS = 0;
    const friends: string[] = [];
    let friendTop: string | null = null;
    for (const [u, m] of weights) {
      if (u === s.me) continue;
      const w = m.get(film.id);
      if (!w) continue;
      crewS += w * (affinity.get(u) ?? 0.35);
      if (w >= 0.5) friends.push(u);
      if (topOf.get(u) === film.id) friendTop ??= u;
    }
    // Soft "not interested": opened twice or more but never faved
    const fatigue = (opened.get(film.id) ?? 0) >= 2 ? 0.08 : 0;
    return { film, score: -fatigue, parts: { taste: tasteS, cf: cfS, crew: crewS, prior: prior(film) }, seed, friends, friendTop };
  });

  // Normalise each component to 0..1 across the pool, then blend with data-aware weights
  const maxOf = (key: keyof Scored['parts']) => Math.max(1e-9, ...raw.map((r) => r.parts[key]));
  const mx = { taste: maxOf('taste'), cf: maxOf('cf'), crew: maxOf('crew'), prior: maxOf('prior') };
  const hasTaste = mine.size > 0;
  const hasCf = raw.some((r) => r.parts.cf > 0);
  const hasCrew = raw.some((r) => r.parts.crew > 0);
  const w = {
    taste: hasTaste ? 0.36 : 0,
    cf: hasCf ? 0.24 : 0,
    crew: hasCrew ? (hasTaste ? 0.22 : 0.45) : 0,
    prior: 0.18 + (hasTaste ? 0 : 0.2) + (hasCrew ? 0 : 0.12),
  };
  for (const r of raw) {
    r.parts = {
      taste: r.parts.taste / mx.taste,
      cf: r.parts.cf / mx.cf,
      crew: r.parts.crew / mx.crew,
      prior: r.parts.prior / mx.prior,
    };
    r.score += w.taste * r.parts.taste + w.cf * r.parts.cf + w.crew * r.parts.crew + w.prior * r.parts.prior;
  }
  raw.sort((a, b) => b.score - a.score || b.film.votes - a.film.votes);

  const picked = rerank(raw, idx, mine, {
    k,
    lambda: o.lambda ?? 0.72,
    aisleCap: o.aisleCap ?? Math.max(2, Math.ceil(k / 4)),
    exploreEvery: o.exploreEvery ?? (hasTaste ? 6 : 0),
    seed: o.seed ?? 7,
  });

  return picked.map(({ item, explore }) => explain(item, w, explore, names, idx, !!o.mood));
}

// ── Re-ranking: MMR + aisle cap + exploration ───────────────────────────────────────────

function rerank(
  ranked: Scored[],
  idx: Map<number, Indexed>,
  mine: Map<number, number>,
  o: { k: number; lambda: number; aisleCap: number; exploreEvery: number; seed: number },
): { item: Scored; explore: boolean }[] {
  const out: { item: Scored; explore: boolean }[] = [];
  const perAisle = new Map<string, number>();
  const usualAisles = new Set([...mine.keys()].map((id) => idx.get(id)?.film.aisle).filter(Boolean) as string[]);
  const head = ranked.slice(0, Math.max(o.k * 5, 60)); // MMR over the head only (cheap, still diverse)
  const used = new Set<number>();
  let rng = o.seed >>> 0 || 1;
  const rand = () => ((rng = (rng * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  while (out.length < o.k && used.size < head.length) {
    const slot = out.length + 1;
    const exploring = o.exploreEvery > 0 && slot % o.exploreEvery === 0 && usualAisles.size > 0;
    let best: Scored | null = null;
    let bestVal = -Infinity;
    for (const r of head) {
      if (used.has(r.film.id)) continue;
      if ((perAisle.get(r.film.aisle) ?? 0) >= o.aisleCap) continue;
      if (exploring && usualAisles.has(r.film.aisle)) continue;
      const it = idx.get(r.film.id)!;
      let maxSim = 0;
      for (const p of out) {
        const pi = idx.get(p.item.film.id)!;
        maxSim = Math.max(maxSim, cosine(it.vec, pi.vec, it.n, pi.n));
      }
      // Exploration slots favour quality + a little randomness instead of taste match
      const rel = exploring ? r.parts.prior + 0.15 * rand() : r.score;
      const val = o.lambda * rel - (1 - o.lambda) * maxSim;
      if (val > bestVal) {
        bestVal = val;
        best = r;
      }
    }
    if (!best) {
      if (exploring) {
        // nothing outside usual aisles left: fill normally next iteration
        o = { ...o, exploreEvery: 0 };
        continue;
      }
      break;
    }
    used.add(best.film.id);
    perAisle.set(best.film.aisle, (perAisle.get(best.film.aisle) ?? 0) + 1);
    out.push({ item: best, explore: exploring });
  }
  return out;
}

// ── Explanations ────────────────────────────────────────────────────────────────────────

function explain(
  r: Scored,
  w: { taste: number; cf: number; crew: number; prior: number },
  explore: boolean,
  names: Record<string, string>,
  idx: Map<number, Indexed>,
  mood: boolean,
): RecItem {
  const friendNames = r.friends.map((u) => names[u] ?? 'A FRIEND');
  const contrib = {
    taste: w.taste * r.parts.taste + w.cf * r.parts.cf,
    crew: w.crew * r.parts.crew,
    fresh: r.film.trending ? w.prior * r.parts.prior : 0,
    quality: r.film.trending ? 0 : w.prior * r.parts.prior,
  };
  let type: ReasonType = (Object.entries(contrib) as [ReasonType, number][]).sort((a, b) => b[1] - a[1])[0][0];
  // Social proof is the most persuasive explanation: lead with it when it's strong.
  if (r.friendTop || friendNames.length >= 2) type = 'crew';
  if (explore) type = r.film.trending ? 'fresh' : 'quality';
  if (type === 'crew' && !friendNames.length) type = 'quality';

  let reason: string;
  const seedTitle = r.seed !== null ? idx.get(r.seed)?.film.title : undefined;
  if (type === 'crew') {
    const topName = r.friendTop ? names[r.friendTop] : undefined;
    reason = topName
      ? `${topName}'S #1 PICK`
      : friendNames.length > 1
        ? `${friendNames[0]} + ${friendNames.length - 1} OTHER${friendNames.length > 2 ? 'S' : ''} LOVE THIS`
        : `${friendNames[0]} LOVES THIS`;
  } else if (type === 'taste') {
    reason = seedTitle
      ? (w.cf * r.parts.cf > w.taste * r.parts.taste ? `FANS OF ${short(seedTitle)} LOVE THIS` : `BECAUSE YOU LOVED ${short(seedTitle)}`)
      : `MORE ${AISLE_LABEL[r.film.aisle] ?? r.film.aisle.toUpperCase()} FOR YOU`;
  } else if (type === 'fresh') {
    reason = explore ? 'SOMETHING NEW · TRENDING' : 'TRENDING THIS WEEK';
  } else {
    reason = explore ? 'OUTSIDE YOUR USUAL · CRITICS LOVE IT' : "CRITICS' CHOICE";
  }

  return {
    filmId: r.film.id,
    score: Math.round(r.score * 1000) / 1000,
    reason,
    reasonType: mood && type !== 'crew' ? 'mood' : type,
    friends: friendNames,
  };
}

// ── Other entry points ──────────────────────────────────────────────────────────────────

/** "More like this": content + co-occurrence neighbours of one film (Netflix "Because you watched"). */
export function moreLikeThis(films: Film[], seedId: number, s?: Signals, k = 12): RecItem[] {
  const idx = indexFilms(films);
  const seed = idx.get(seedId);
  if (!seed) return [];
  const sim = s ? itemItem(userWeights(s, Date.now())) : () => 0;
  const scored = films
    .filter((f) => f.id !== seedId)
    .map((f) => {
      const it = idx.get(f.id)!;
      const score = 0.7 * cosine(seed.vec, it.vec, seed.n, it.n) + 0.2 * sim(seedId, f.id) + 0.1 * prior(f);
      return { f, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored.map(({ f, score }) => ({
    filmId: f.id,
    score: Math.round(score * 1000) / 1000,
    reason: `BECAUSE YOU LOVED ${short(seed.film.title)}`,
    reasonType: 'taste',
    friends: [],
  }));
}

export interface RecRow { id: string; title: string; items: RecItem[] }

/** Netflix-style named rows for a home/"YOUR SHELF" screen. Rows never repeat a film. */
export function personalRows(films: Film[], s: Signals, name = 'YOU', o: RecOptions = {}): RecRow[] {
  const seen = new Set<number>(o.exclude ?? []);
  const take = (items: RecItem[], n: number) => {
    const out: RecItem[] = [];
    for (const it of items) {
      if (out.length >= n) break;
      if (seen.has(it.filmId)) continue;
      seen.add(it.filmId);
      out.push(it);
    }
    return out;
  };
  const rows: RecRow[] = [];
  const top = take(recommend(films, s, { ...o, k: 24 }), 12);
  if (top.length) rows.push({ id: 'top', title: `TOP PICKS FOR ${name.toUpperCase()}`, items: top });

  const byId = new Map(films.map((f) => [f.id, f]));
  const myFavs = s.favs.filter((f) => f.userId === s.me).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  for (const fav of myFavs.slice(0, 2)) {
    const f = byId.get(fav.filmId);
    if (!f) continue;
    const items = take(moreLikeThis(films, f.id, s, 20), 10);
    if (items.length >= 4) rows.push({ id: `because-${f.id}`, title: `BECAUSE YOU LOVED ${short(f.title, 22)}`, items });
  }

  const crew = take(
    recommend(films, s, { ...o, k: 30, lambda: 1, exploreEvery: 0 }).filter((r) => r.reasonType === 'crew'),
    10,
  );
  if (crew.length >= 3) rows.push({ id: 'crew', title: 'YOUR CREW IS INTO', items: crew });

  const trending = take(trendingFallback({ films, trending: films.filter((f) => f.trending) } as Pick<Catalogue, 'films' | 'trending'>, 30), 10);
  if (trending.length) rows.push({ id: 'trending', title: 'TRENDING NOW', items: trending });
  return rows;
}

/** Personalise the order of one shelf (e.g. an aisle): best-for-you first, everything kept. */
export function rankShelf(shelf: Film[], allFilms: Film[], s: Signals): Film[] {
  const recs = recommend(allFilms, s, { k: allFilms.length, lambda: 1, aisleCap: allFilms.length, exploreEvery: 0 });
  const rank = new Map(recs.map((r, i) => [r.filmId, i]));
  return [...shelf].sort((a, b) => (rank.get(a.id) ?? 1e9) - (rank.get(b.id) ?? 1e9) || prior(b) - prior(a));
}

/** Cold start / fallback: trending sorted by quality, padded with best-rated. */
export function trendingFallback(c: Pick<Catalogue, 'films' | 'trending'>, limit = 18): RecItem[] {
  const trending = [...c.trending].sort((a, b) => prior(b) - prior(a));
  const rest = c.films.filter((f) => !f.trending).sort((a, b) => prior(b) - prior(a));
  return [...trending, ...rest].slice(0, limit).map((f) => ({
    filmId: f.id,
    score: Math.round(prior(f) * 1000) / 1000,
    reason: f.trending ? 'TRENDING THIS WEEK' : "CRITICS' CHOICE",
    reasonType: f.trending ? 'fresh' : 'quality',
    friends: [],
  }));
}

/** Staff Picks: films sorted by how many friends love them, then quality. */
export function staffPicks(friends: Friend[], c: Pick<Catalogue, 'byId'>, limit = 24): StaffPick[] {
  const m = new Map<number, string[]>();
  for (const f of friends) for (const id of new Set([...f.favourites, ...(f.favId !== null ? [f.favId] : [])])) m.set(id, [...(m.get(id) ?? []), f.userId]);
  return [...m.entries()]
    .filter(([id]) => c.byId.has(id))
    .map(([filmId, userIds]) => ({ filmId, userIds }))
    .sort((a, b) => b.userIds.length - a.userIds.length || prior(c.byId.get(b.filmId)!) - prior(c.byId.get(a.filmId)!))
    .slice(0, limit);
}

/** Build Signals from store-state friends + my own favourites (client or server). */
export function signalsFrom(me: string | null, friends: Friend[], myFavs: number[] = [], myTop: number | null = null): Signals {
  const favs: FavInteraction[] = [];
  const names: Record<string, string> = {};
  for (const f of friends) {
    names[f.userId] = f.name;
    for (const id of new Set([...f.favourites, ...(f.favId !== null ? [f.favId] : [])])) favs.push({ userId: f.userId, filmId: id, top: id === f.favId });
  }
  if (me) for (const id of new Set([...myFavs, ...(myTop !== null ? [myTop] : [])])) favs.push({ userId: me, filmId: id, top: id === myTop });
  return { me, favs, names };
}

// ── Compatibility layer for the BE routes (/api/recs, /api/rico) and api.ts ─────────────
// They were written against the first BACKEND.md §6 API; these adapters run the engine above.

export interface RecsInput {
  catalogue: Pick<Catalogue, 'films' | 'trending' | 'byId'>;
  userFavs: number[];             // includes #1
  userTop: number | null;
  friends: Friend[];              // excludes the user
  watched?: number[];             // films the user hit PLAY on
  mood?: Mood;                    // used by RICO
  exclude?: number[];
}

const ME = '__me__';

/** Engine-backed replacement for the original scoreRecs(). */
export function scoreRecs(input: RecsInput, limit = 18): RecItem[] {
  const s = signalsFrom(ME, input.friends.filter((f) => f.userId !== ME), input.userFavs, input.userTop);
  s.watches = (input.watched ?? []).map((filmId) => ({ userId: ME, filmId }));
  return recommend(input.catalogue.films, s, { k: limit, mood: input.mood, exclude: input.exclude });
}

/** Pad a short list with trending titles (no duplicates). */
export function padWithTrending(items: RecItem[], catalogue: Pick<Catalogue, 'films' | 'trending'>, limit = 18): RecItem[] {
  if (items.length >= limit) return items.slice(0, limit);
  const seen = new Set(items.map((i) => i.filmId));
  return [...items, ...trendingFallback(catalogue, limit * 2).filter((t) => !seen.has(t.filmId))].slice(0, limit);
}

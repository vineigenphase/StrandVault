// Realtime store channel: presence + broadcast (CLAUDE.md §6.5, BACKEND.md §3.2). Lane GAME.
//
//   const { online, me, remotes, favs, sendMove, sendBroadcast, setFav, store } = useStore('KCL');
//   store.join(presence) / store.leave() / store.setScene('interior') / store.onMove(fn)
//
// One shared connection per store code (Game, HUD and overlays all read the same snapshot).
// Transport: Supabase Realtime channel `store:{code}` when NEXT_PUBLIC_SUPABASE_* is set; otherwise
// (or if the channel fails) a BroadcastChannel between tabs on this device, so solo/offline mode never errors.
//
// Side effects it owns while joined:
//   - presence join after the initial sync → AppEvent 'presence-join' + toast "ALEX just pulled up"
//   - presence leave → AppEvent 'presence-leave'; the entry lingers as `leaving` for LEAVE_MS (walk-off)
//   - broadcasts fav/open/watch → toasts + live `favs` (Staff Picks)
//   - local AppEvent 'fav' / GameEvent 'open-film' / AppEvent 'now-playing' → broadcast to the store
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import { getCatalogueSync } from './catalogue';
import { emitApp, on, onApp, toast } from './events';
import type { Broadcast, Friend, MoveMsg, PresenceState, StaffPick } from './types';

export const DEFAULT_STORE_CODE = process.env.NEXT_PUBLIC_STORE_CODE || 'KCL';

const INITIAL_SYNC_MS = 1500;   // joins seen this soon after connecting are "already here": no toast/glitch
export const LEAVE_MS = 1500;   // how long a departed player lingers for the walk-off
const OPEN_TOAST_COOLDOWN_MS = 4000;
const LOCAL_HEARTBEAT_MS = 2000;
const LOCAL_EXPIRY_MS = 6000;

export interface RemoteEntry { p: PresenceState; leaving: boolean }

export interface StoreSnapshot {
  transport: 'supabase' | 'local' | null;
  me: PresenceState | null;
  /** Everyone in the store, me included (HUD "4 IN STORE"). */
  online: PresenceState[];
  /** Everyone except me, plus players who just left (leaving: true) for the walk-off. */
  remotes: RemoteEntry[];
  /** Live favourites per userId: seeded from store-state, presence favIds and fav broadcasts. */
  favs: Readonly<Record<string, readonly number[]>>;
}

const EMPTY: StoreSnapshot = { transport: null, me: null, online: [], remotes: [], favs: {} };

// ── Transports ──────────────────────────────────────────────────────────────────────────

interface TransportCallbacks {
  presence(list: unknown[]): void;
  broadcast(b: unknown): void;
  error(): void;
}
interface Transport {
  kind: 'supabase' | 'local';
  track(p: PresenceState): void;
  send(b: Broadcast): void;
  close(): void;
}

// TODO(BE2): switch to the shared browser client in src/lib/supabase.ts once it lands.
let client: SupabaseClient | null | undefined;
function supabaseClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    client = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  } catch {
    client = null;
  }
  return client;
}

function supabaseTransport(sb: SupabaseClient, code: string, me: PresenceState, cb: TransportCallbacks): Transport {
  let current = me;
  let subscribed = false;
  let failed = false;
  const ch = sb.channel(`store:${code}`, { config: { presence: { key: me.userId }, broadcast: { self: false } } });
  ch.on('presence', { event: 'sync' }, () => {
    cb.presence(Object.values(ch.presenceState()).map((metas) => metas[0]));
  })
    .on('broadcast', { event: 'b' }, (msg) => cb.broadcast(msg.payload))
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        subscribed = true;
        void ch.track({ ...current });
      } else if ((status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') && !failed) {
        failed = true;
        cb.error();
      }
    });
  return {
    kind: 'supabase',
    track(p) {
      current = p;
      if (subscribed) void ch.track({ ...p });
    },
    send(b) {
      if (subscribed) void ch.send({ type: 'broadcast', event: 'b', payload: b });
    },
    close() {
      void ch.untrack().catch(() => {});
      void sb.removeChannel(ch);
    },
  };
}

type LocalMsg =
  | { t: 'hello'; from: string }
  | { t: 'state'; from: string; p: PresenceState }
  | { t: 'bye'; from: string }
  | { t: 'b'; from: string; b: Broadcast };

/** Same-device fallback: tabs in one browser see each other. Presence via hello/state/bye + heartbeat. */
function localTransport(code: string, cb: TransportCallbacks): Transport {
  if (typeof BroadcastChannel === 'undefined') {
    return { kind: 'local', track: (p) => cb.presence([p]), send: () => {}, close: () => {} };
  }
  const bc = new BroadcastChannel(`sv-store:${code}`);
  let me: PresenceState | null = null;
  const peers = new Map<string, { p: PresenceState; seen: number; sig: string }>();
  const post = (m: LocalMsg) => {
    try { bc.postMessage(m); } catch { /* channel closed */ }
  };
  const list = () => [...(me ? [me] : []), ...[...peers.values()].map((v) => v.p)];

  bc.onmessage = (e: MessageEvent<LocalMsg>) => {
    const m = e.data;
    if (!m || typeof m !== 'object' || typeof m.from !== 'string' || m.from === me?.userId) return;
    if (m.t === 'hello') {
      if (me) post({ t: 'state', from: me.userId, p: me });
    } else if (m.t === 'state' && m.p) {
      const sig = JSON.stringify(m.p);
      const had = peers.get(m.from);
      peers.set(m.from, { p: m.p, seen: Date.now(), sig });
      if (!had || had.sig !== sig) cb.presence(list());
    } else if (m.t === 'bye') {
      if (peers.delete(m.from)) cb.presence(list());
    } else if (m.t === 'b') {
      cb.broadcast(m.b);
    }
  };

  const hb = window.setInterval(() => {
    if (me) post({ t: 'state', from: me.userId, p: me });
    const now = Date.now();
    let changed = false;
    for (const [id, v] of peers) {
      if (now - v.seen > LOCAL_EXPIRY_MS) {
        peers.delete(id);
        changed = true;
      }
    }
    if (changed) cb.presence(list());
  }, LOCAL_HEARTBEAT_MS);

  return {
    kind: 'local',
    track(p) {
      const first = !me;
      me = p;
      post({ t: 'state', from: p.userId, p });
      if (first) post({ t: 'hello', from: p.userId });
      cb.presence(list());
    },
    send(b) {
      if (me) post({ t: 'b', from: me.userId, b });
    },
    close() {
      if (me) post({ t: 'bye', from: me.userId });
      clearInterval(hb);
      bc.close();
      me = null;
      peers.clear();
    },
  };
}

// ── Validation ──────────────────────────────────────────────────────────────────────────

function toPresence(raw: unknown): PresenceState | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.userId !== 'string' || typeof o.name !== 'string' || !o.look || typeof o.look !== 'object') return null;
  return {
    userId: o.userId,
    name: o.name.slice(0, 12),
    look: o.look as PresenceState['look'],
    favId: typeof o.favId === 'number' ? o.favId : null,
    scene: o.scene === 'interior' ? 'interior' : 'street',
    ...(o.isDemo ? { isDemo: true } : {}),
  };
}

const isBroadcast = (b: unknown): b is Broadcast =>
  !!b && typeof b === 'object' && typeof (b as { kind?: unknown }).kind === 'string';

const filmTitle = (id: number) => getCatalogueSync()?.byId.get(id)?.title ?? 'a film';

// ── Store connection ────────────────────────────────────────────────────────────────────

export class StoreConn {
  private snap: StoreSnapshot = EMPTY;
  private listeners = new Set<() => void>();
  private transport: Transport | null = null;
  private me: PresenceState | null = null;
  private present = new Map<string, PresenceState>();
  private presentSig = '';
  private departing = new Map<string, { p: PresenceState; timer: number }>();
  private joinedAt = new Map<string, number>();
  private favs = new Map<string, Set<number>>();
  private moveFns = new Set<(m: MoveMsg) => void>();
  private broadcastFns = new Set<(b: Broadcast) => void>();
  private lastMoves = new Map<string, MoveMsg>();
  private myLastMove: MoveMsg | null = null;
  private connectedAt = 0;
  private openToastAt = new Map<string, number>();
  private offs: (() => void)[] = [];
  private leaveTimer = 0;

  constructor(readonly code: string) {}

  // useSyncExternalStore plumbing
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  getSnapshot = () => this.snap;
  getServerSnapshot = () => EMPTY;

  /** Enter the store (or update my presence if already joined with the same userId). */
  join = (me: PresenceState) => {
    if (this.leaveTimer) {
      clearTimeout(this.leaveTimer); // StrictMode / quick remount: keep the connection
      this.leaveTimer = 0;
    }
    if (this.me && this.transport && this.me.userId === me.userId) {
      this.me = me;
      this.present.set(me.userId, me);
      this.transport.track(me);
      this.publish();
      return;
    }
    this.leaveNow();
    this.me = me;
    this.connectedAt = Date.now();
    this.present = new Map([[me.userId, me]]);
    this.presentSig = '';
    this.addFav(me.userId, me.favId);
    this.connect(supabaseClient() ? 'supabase' : 'local');
    this.offs.push(
      onApp('fav', (e) => this.onLocalFav(e.filmId, e.on, e.setTop)),
      on('open-film', (e) => this.me && this.sendBroadcast({ kind: 'open', userId: this.me.userId, filmId: e.filmId })),
      onApp('now-playing', (e) => this.me && this.sendBroadcast({ kind: 'watch', userId: this.me.userId, filmId: e.filmId, provider: e.provider })),
    );
    window.addEventListener('pagehide', this.leaveNow);
    this.publish();
  };

  /** Leave soon (debounced so a StrictMode remount doesn't flash a leave/join to everyone). */
  leave = () => {
    if (!this.me || this.leaveTimer) return;
    this.leaveTimer = window.setTimeout(this.leaveNow, 100);
  };

  leaveNow = () => {
    if (this.leaveTimer) clearTimeout(this.leaveTimer);
    this.leaveTimer = 0;
    this.offs.forEach((off) => off());
    this.offs = [];
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', this.leaveNow);
    this.transport?.close();
    this.transport = null;
    this.departing.forEach((d) => clearTimeout(d.timer));
    this.departing.clear();
    this.present.clear();
    this.lastMoves.clear();
    this.myLastMove = null;
    if (this.me) {
      this.me = null;
      this.publish();
    }
  };

  setScene = (scene: PresenceState['scene']) => {
    if (this.me && this.me.scene !== scene) this.updateMe({ ...this.me, scene });
  };

  /** Set my #1 favourite (shows over my head for everyone). */
  setFav = (filmId: number | null) => {
    if (!this.me || this.me.favId === filmId) return;
    this.addFav(this.me.userId, filmId);
    this.updateMe({ ...this.me, favId: filmId });
  };

  /** 10 Hz while moving, plus one stop message (moving: false). */
  sendMove = (m: MoveMsg) => {
    this.myLastMove = m;
    this.transport?.send({ kind: 'move', m });
  };

  sendBroadcast = (b: Broadcast) => {
    this.transport?.send(b);
  };

  onMove = (fn: (m: MoveMsg) => void) => {
    this.moveFns.add(fn);
    return () => { this.moveFns.delete(fn); };
  };

  onBroadcast = (fn: (b: Broadcast) => void) => {
    this.broadcastFns.add(fn);
    return () => { this.broadcastFns.delete(fn); };
  };

  /** Latest movement message from a user (for sprites mounting after the message arrived). */
  lastMove = (userId: string) => this.lastMoves.get(userId);

  /** True if this user joined (after the initial sync) within the last `ms`: play the glitch-in. */
  joinedRecently = (userId: string, ms = 1500) => {
    const t = this.joinedAt.get(userId);
    return t !== undefined && performance.now() - t < ms;
  };

  /** Seed live favourites from GET /api/store-state so Staff Picks start full. */
  seedFavourites = (friends: Friend[]) => {
    for (const f of friends) for (const id of [...f.favourites, f.favId]) this.addFav(f.userId, id);
    this.publish(true);
  };

  // ── internals ──

  private connect(kind: 'supabase' | 'local') {
    const me = this.me;
    if (!me) return;
    const cb: TransportCallbacks = {
      presence: (list) => this.onPresence(list),
      broadcast: (b) => this.onBroadcastMsg(b),
      error: () => {
        if (this.transport?.kind !== 'supabase') return;
        console.warn('[realtime] Supabase channel unavailable; using same-device mode');
        this.transport.close();
        this.transport = null;
        this.connect('local');
      },
    };
    const sb = kind === 'supabase' ? supabaseClient() : null;
    this.transport = sb ? supabaseTransport(sb, this.code, me, cb) : localTransport(this.code, cb);
    this.transport.track(me);
    this.publish(true);
  }

  private updateMe(me: PresenceState) {
    this.me = me;
    this.present.set(me.userId, me);
    this.transport?.track(me);
    this.publish(true);
  }

  private addFav(userId: string, filmId: number | null | undefined) {
    if (filmId === null || filmId === undefined) return;
    let set = this.favs.get(userId);
    if (!set) this.favs.set(userId, (set = new Set()));
    set.add(filmId);
  }

  private onLocalFav(filmId: number, isOn: boolean, setTop?: boolean) {
    const me = this.me;
    if (!me) return;
    if (isOn || setTop) this.addFav(me.userId, filmId);
    else this.favs.get(me.userId)?.delete(filmId);
    this.sendBroadcast({ kind: 'fav', userId: me.userId, filmId, on: isOn || !!setTop });
    if (setTop) this.setFav(filmId);
    else if (!isOn && me.favId === filmId) this.setFav(null);
    else this.publish(true);
  }

  private onPresence(rawList: unknown[]) {
    const me = this.me;
    if (!me) return;
    const next = new Map<string, PresenceState>();
    for (const raw of rawList) {
      const p = toPresence(raw);
      if (p) next.set(p.userId, p);
    }
    next.set(me.userId, me); // my local copy is always the freshest

    const initial = Date.now() - this.connectedAt < INITIAL_SYNC_MS;
    let someoneJoined = false;
    for (const [id, p] of next) {
      if (id === me.userId || this.present.has(id)) continue;
      someoneJoined = true;
      const back = this.departing.get(id);
      if (back) {
        clearTimeout(back.timer);
        this.departing.delete(id);
      } else if (!initial) {
        this.joinedAt.set(id, performance.now());
        emitApp({ type: 'presence-join', p });
        toast(`${p.name} just pulled up`);
      }
    }
    for (const [id, p] of this.present) {
      if (id === me.userId || next.has(id)) continue;
      emitApp({ type: 'presence-leave', userId: id });
      const timer = window.setTimeout(() => {
        this.departing.delete(id);
        this.lastMoves.delete(id);
        this.publish(true);
      }, LEAVE_MS);
      this.departing.set(id, { p, timer });
    }
    for (const p of next.values()) this.addFav(p.userId, p.favId);
    this.present = next;

    // Newcomers need to know where idle players are standing.
    if (someoneJoined && this.myLastMove) this.transport?.send({ kind: 'move', m: { ...this.myLastMove, t: Date.now() } });
    this.publish();
  }

  private onBroadcastMsg(raw: unknown) {
    if (!isBroadcast(raw)) return;
    const b = raw;
    const name = (id: string) => this.present.get(id)?.name ?? 'SOMEONE';
    switch (b.kind) {
      case 'move':
        if (!b.m || typeof b.m.userId !== 'string' || typeof b.m.x !== 'number') return;
        this.lastMoves.set(b.m.userId, b.m);
        this.moveFns.forEach((fn) => fn(b.m));
        break;
      case 'fav':
        if (b.on) {
          this.addFav(b.userId, b.filmId);
          toast(`${name(b.userId)} ♥ ${filmTitle(b.filmId)}`);
        } else {
          this.favs.get(b.userId)?.delete(b.filmId);
        }
        this.publish(true);
        break;
      case 'open': {
        const now = Date.now();
        if (now - (this.openToastAt.get(b.userId) ?? 0) > OPEN_TOAST_COOLDOWN_MS) {
          this.openToastAt.set(b.userId, now);
          toast(`${name(b.userId)} is browsing ${filmTitle(b.filmId)}`);
        }
        break;
      }
      case 'watch':
        toast(`${name(b.userId)} is watching ${filmTitle(b.filmId)}`);
        break;
      case 'emote':
        break; // TODO(U7): emote bubbles
    }
    this.broadcastFns.forEach((fn) => fn(b));
  }

  /** Rebuild the immutable snapshot. Skips no-op presence updates unless forced. */
  private publish(force = false) {
    const online = [...this.present.values()];
    const sig = JSON.stringify(online) + '|' + [...this.departing.keys()].join(',');
    if (!force && sig === this.presentSig && this.snap.me === this.me) return;
    this.presentSig = sig;
    const meId = this.me?.userId;
    const favs: Record<string, number[]> = {};
    for (const [id, set] of this.favs) if (set.size) favs[id] = [...set];
    this.snap = {
      transport: this.transport?.kind ?? null,
      me: this.me,
      online,
      remotes: [
        ...online.filter((p) => p.userId !== meId).map((p) => ({ p, leaving: false })),
        ...[...this.departing.values()].map((d) => ({ p: d.p, leaving: true })),
      ],
      favs,
    };
    this.listeners.forEach((fn) => fn());
  }
}

const stores = new Map<string, StoreConn>();

export function getStore(code: string = DEFAULT_STORE_CODE): StoreConn {
  let s = stores.get(code);
  if (!s) stores.set(code, (s = new StoreConn(code)));
  return s;
}

/** React hook: live snapshot of the store + bound actions. */
export function useStore(code: string = DEFAULT_STORE_CODE) {
  const store = getStore(code);
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return { ...snap, store, sendMove: store.sendMove, sendBroadcast: store.sendBroadcast, setFav: store.setFav };
}

/** Staff Picks from live favourites: films sorted by how many people love them. */
export function staffPicksFrom(favs: StoreSnapshot['favs'], limit = 24): StaffPick[] {
  const m = new Map<number, string[]>();
  for (const [userId, ids] of Object.entries(favs)) for (const id of ids) m.set(id, [...(m.get(id) ?? []), userId]);
  return [...m.entries()]
    .map(([filmId, userIds]) => ({ filmId, userIds }))
    .sort((a, b) => b.userIds.length - a.userIds.length)
    .slice(0, limit);
}

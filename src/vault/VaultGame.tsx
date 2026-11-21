// THE VAULT: the teammate's canvas UI (intro → vault door → corridor → top-down store), mounted with real data.
// Lane GAME (integration). The engine owns its own rAF loop; React only mounts it and feeds live data.
'use client';

import '@/styles/vault.css';
import { useEffect, useRef } from 'react';
import { api } from '@/lib/api';
import { loadCatalogue } from '@/lib/catalogue';
import { mockFriends, mockLook, mockStaffPicks } from '@/lib/mocks';
import { DEFAULT_STORE_CODE, getStore } from '@/lib/realtime';
import type { Look, MoveMsg, StoreStateRes } from '@/lib/types';
import { buildAdapter, paletteFor } from './adapter';
import { mountVault, type VaultApi, type VaultRemote } from './engine';

// Static markup from the artifact. The engine finds these by id inside the root.
const MARKUP = `
<div id="stage">
  <div id="world">
    <canvas id="c" width="384" height="216" aria-label="The Strand Vault"></canvas>
    <canvas id="gA" width="384" height="216"></canvas>
    <canvas id="gB" width="384" height="216"></canvas>
  </div>
  <div id="vig"></div>
  <canvas id="ir" width="384" height="216"></canvas>
  <div id="labels"></div>
  <div id="press" class="px">Press ▶ to enter</div>
  <div id="hint" class="glass"></div>
  <div id="npc" class="glass"></div>
  <div id="list" class="glass"><div class="ph"><div><div class="tt" id="lT"></div><div class="st" id="lS"></div></div><button class="x" id="lX" aria-label="Close">×</button></div><div class="rows" id="lR"></div></div>
  <div id="search"><div class="sc-in">
    <div class="sc-hd px"><span>◉ VAULT SEARCH TERMINAL</span><button class="x" id="sX" aria-label="Close">×</button></div>
    <label class="sc-box"><svg viewBox="0 0 24 24" fill="none" stroke="#7ffff0" stroke-width="2.2" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>
      <input id="q" type="text" autocomplete="off" spellcheck="false" placeholder="Search any movie or show, director, genre, year…"></label>
    <div class="sc-meta" id="sM"></div>
    <div class="res" id="sR"></div>
    <div class="sc-ft">↑ ↓ browse · Enter opens it · Esc closes</div>
  </div></div>
  <div id="board"><div class="bd-hd"><h2>Must-Watches</h2><p id="bS"></p><button class="x" id="bX" aria-label="Close" style="margin-left:auto">×</button></div><div class="cards" id="bC"></div></div>
  <div id="reko" class="glass"><canvas id="rkC" width="16" height="20"></canvas><div class="bd"><div class="who">Reko <span>Your film concierge</span><button class="x" id="rX" aria-label="Close">×</button></div><div id="rkT"></div><div id="rkB"></div></div></div>
  <div id="dvdLayer"><div class="dim"></div></div>
  <div id="info"></div>
  <div id="toast" class="glass"></div>
</div>`;

const MOVE_MS = 100; // 10 Hz while moving

function readProfile(): { name?: string; look?: Look; userId?: string } {
  try {
    return JSON.parse(localStorage.getItem('sv-profile') ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveUserId(userId: string) {
  try {
    localStorage.setItem('sv-profile', JSON.stringify({ ...readProfile(), userId }));
  } catch {
    /* private mode */
  }
}
const withTimeout = <T,>(p: Promise<T>, ms: number, fallback: T) =>
  Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export default function VaultGame({ code = DEFAULT_STORE_CODE }: { code?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    root.innerHTML = MARKUP;
    const store = getStore(code);
    let engine: VaultApi | null = null;
    let cancelled = false;
    const offs: (() => void)[] = [];

    void (async () => {
      // ?fresh → join as a brand-new guest without touching the saved identity (shared devices, tests)
      const fresh = new URLSearchParams(window.location.search).has('fresh');
      const profile = fresh ? {} : readProfile();
      const look = profile.look ?? mockLook;
      const [catalogue, state, joined] = await Promise.all([
        loadCatalogue(),
        withTimeout<StoreStateRes>(api.storeState(code), 2500, { friends: mockFriends, staffPicks: mockStaffPicks }),
        withTimeout(api.join({ name: profile.name ?? 'GUEST', look, favId: null, code, userId: profile.userId }), 2500, null),
      ]);
      if (cancelled) return;
      const userId = joined?.userId ?? profile.userId ?? `guest-${Math.random().toString(36).slice(2, 10)}`;
      if (!fresh) saveUserId(userId);
      const myName = joined?.presence.name ?? (profile.name || `GUEST ${userId.slice(-2).toUpperCase()}`);
      const friends = state.friends.length ? state.friends : mockFriends;

      // Realtime: presence + live faves
      store.join({ userId, name: myName, look, favId: null, scene: 'interior' });
      store.seedFavourites(friends);

      const css = getComputedStyle(document.documentElement);
      const adapter = buildAdapter({
        catalogue,
        friends,
        userId,
        myLook: profile.look,
        fonts: {
          display: css.getPropertyValue('--ff-space').trim() || 'sans-serif',
          body: css.getPropertyValue('--ff-body').trim() || 'sans-serif',
        },
        liveFavs: () => store.getSnapshot().favs,
        liveNames: () => Object.fromEntries(store.getSnapshot().online.map((p) => [p.userId, p.name])),
      });

      // Hero → realtime at 10 Hz while moving, plus one stop message
      let lastSend = 0;
      let sentMoving = false;
      adapter.onHero = (x, y, dir, moving) => {
        const now = performance.now();
        if (moving ? now - lastSend < MOVE_MS : !sentMoving) return;
        store.sendMove({
          userId, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, dir: dir === 2 ? -1 : 1,
          face: (dir as 0 | 1 | 2 | 3), moving, scene: 'interior', t: Date.now(),
        });
        lastSend = now;
        sentMoving = moving;
      };

      engine = mountVault(root, adapter);

      // Live players → engine (positions from move messages; looks/faves from presence)
      const moves = new Map<string, MoveMsg>();
      const pushRemotes = () => {
        if (!engine) return;
        const snap = store.getSnapshot();
        const list: VaultRemote[] = [];
        for (const { p, leaving } of snap.remotes) {
          const m = moves.get(p.userId);
          if (leaving || !m || m.y === undefined || m.scene !== 'interior') continue;
          const favs = snap.favs[p.userId] ?? [];
          list.push({
            id: p.userId, name: p.name.charAt(0) + p.name.slice(1).toLowerCase(), x: m.x, y: m.y,
            dir: m.face ?? (m.dir < 0 ? 2 : 3), moving: m.moving, P: paletteFor(p.look),
            fav: p.favId !== null ? String(p.favId) : undefined,
            recent: favs.find((id) => id !== p.favId) !== undefined ? String(favs.find((id) => id !== p.favId)) : undefined,
          });
        }
        engine.setRemotes(list);
        engine.setDemoVisible(list.length === 0);
      };
      offs.push(store.onMove((m) => { moves.set(m.userId, m); pushRemotes(); }));
      offs.push(store.subscribe(pushRemotes));

      // Server-side recommendations refine shelf A when they arrive
      const recs = await api.recs(userId, code, adapter.watchlist().map(Number), null);
      const taken = new Set([...adapter.shelves.B, ...adapter.shelves.C, ...adapter.shelves.D]);
      const ids = recs.items.map((r) => String(r.filmId)).filter((id) => !taken.has(id));
      if (!cancelled && ids.length >= 4) engine?.setShelf('A', ids);
    })();

    return () => {
      cancelled = true;
      offs.forEach((off) => off());
      engine?.destroy();
      store.leave();
      root.innerHTML = '';
    };
  }, [code]);

  return <div ref={rootRef} className="vault-root" />;
}

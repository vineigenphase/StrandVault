// A friend's sprite: interpolated movement, name tag, hover/tap fav bubble (CLAUDE.md §6.5). Lane GAME.
//
// Ref-driven: the game loop calls handle.update() every frame; React only renders structure and the bubble.
// Movement renders INTERP_DELAY_MS behind real time and lerps between buffered move messages.
'use client';

/* eslint-disable @next/next/no-img-element -- posters may be data URLs / local files */
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { getCatalogueSync, loadCatalogue } from '@/lib/catalogue';
import { emit } from '@/lib/events';
import { LEAVE_MS, type RemoteEntry, type StoreConn } from '@/lib/realtime';
import type { Film, MoveMsg } from '@/lib/types';
import { bubbleSpring } from '@/styles/motion';
import { IDLE_FPS, sheetFor, WALK_FPS } from '../sprites/characters';
import { SHEET_KEYFRAMES, sheetAnim } from '../sprites/pixel';
import { VIEW_W } from '../camera';
import { INTERIOR } from '../world/interior';
import { STREET } from '../world/street';
import type { SceneId } from '../zones';
import { PLAYER_H, PLAYER_W, WALK_SPEED } from './Player';

const INTERP_DELAY_MS = 100;
const WALK_OFF_MS = LEAVE_MS - 300;

export interface RemoteHandle {
  push(m: MoveMsg): void;
  /** camX = camera x in world px; snap = round to device pixels. */
  update(now: number, camX: number, snap: (v: number) => number): void;
}

interface Sample { x: number; dir: 1 | -1; moving: boolean; scene: SceneId; at: number }

export interface RemotePlayerProps {
  entry: RemoteEntry;
  scene: SceneId;
  groundY: number;
  store: StoreConn;
  register(userId: string, handle: RemoteHandle): () => void;
}

const STYLES = `
${SHEET_KEYFRAMES}
@keyframes sv-glitch-in {
  0%   { clip-path: inset(100% 0 0 0); filter: drop-shadow(-3px 0 #FF2E88) drop-shadow(3px 0 #00E5FF); opacity: .6; }
  40%  { clip-path: inset(40% 0 0 0);  filter: drop-shadow(2px 0 #FF2E88) drop-shadow(-2px 0 #00E5FF); }
  70%  { clip-path: inset(0 0 0 0);    filter: drop-shadow(-1px 0 #FF2E88) drop-shadow(1px 0 #00E5FF); opacity: 1; }
  100% { clip-path: inset(0 0 0 0);    filter: none; }
}
.sv-spawn { animation: sv-glitch-in .4s steps(6) both; }
@media (prefers-reduced-motion: reduce) { .sv-spawn { animation: none; } }
`;

function applyStyle(el: HTMLElement, style: object) {
  for (const [k, v] of Object.entries(style as Record<string, unknown>)) {
    const value = v === undefined ? '' : typeof v === 'number' ? `${v}px` : String(v);
    if (k.startsWith('--')) el.style.setProperty(k, value);
    else (el.style as unknown as Record<string, string>)[k] = value;
  }
}

export default function RemotePlayer({ entry, scene, groundY, store, register }: RemotePlayerProps) {
  const { p, leaving } = entry;
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const spriteRef = useRef<HTMLDivElement>(null);
  const leavingRef = useRef<{ since: number; fromX: number; visible: boolean | null } | null>(null);
  const [bubble, setBubble] = useState(false);
  const [film, setFilm] = useState<Film | null>(null);

  // Track the leaving flag for the loop without re-registering the handle.
  useEffect(() => {
    leavingRef.current = leaving ? (leavingRef.current ?? { since: performance.now(), fromX: NaN, visible: null }) : null;
  }, [leaving]);

  useEffect(() => {
    const root = rootRef.current;
    const body = bodyRef.current;
    const sprite = spriteRef.current;
    if (!root || !body || !sprite) return;

    const sheet = sheetFor(p.look);
    let walking: boolean | null = null;
    const setWalking = (w: boolean) => {
      if (w === walking) return;
      walking = w;
      applyStyle(sprite, w ? sheetAnim(sheet, sheet.walk, WALK_FPS) : sheetAnim(sheet, sheet.idle, IDLE_FPS));
    };
    setWalking(false);

    const samples: Sample[] = [];
    const spawnX = p.scene === 'street' ? STREET.spawnX : INTERIOR.spawnX;
    const pending = store.lastMove(p.userId);
    if (pending) samples.push({ x: pending.x, dir: pending.dir, moving: false, scene: pending.scene, at: performance.now() - INTERP_DELAY_MS });

    // Glitch in at the curb if they just pulled up.
    if (store.joinedRecently(p.userId) && scene === 'street') {
      body.classList.add('sv-spawn');
      window.setTimeout(() => body.classList.remove('sv-spawn'), 450);
    }

    let lastX = pending?.x ?? spawnX;

    const handle: RemoteHandle = {
      push(m) {
        samples.push({ x: m.x, dir: m.dir, moving: m.moving, scene: m.scene, at: performance.now() });
        if (samples.length > 8) samples.shift();
      },
      update(now, camX, snap) {
        let x = lastX;
        let dir: 1 | -1 = samples.at(-1)?.dir ?? 1;
        const sc: SceneId = samples.at(-1)?.scene ?? p.scene;
        let moving = false;

        if (samples.length) {
          const t = now - INTERP_DELAY_MS;
          const last = samples[samples.length - 1];
          if (t >= last.at) {
            x = last.x;
            moving = last.moving;
          } else if (t <= samples[0].at) {
            x = samples[0].x;
          } else {
            for (let i = 0; i < samples.length - 1; i++) {
              const a = samples[i];
              const b = samples[i + 1];
              if (t >= a.at && t < b.at) {
                const k = (t - a.at) / Math.max(1, b.at - a.at);
                x = a.x + (b.x - a.x) * k;
                dir = b.dir;
                moving = a.moving || b.moving;
                break;
              }
            }
          }
        }

        // Leaving: walk off to the left if on screen, otherwise just fade.
        let opacity = 1;
        const lv = leavingRef.current;
        if (lv) {
          if (lv.visible === null) {
            lv.fromX = x;
            lv.visible = sc === scene && x > camX - 20 && x < camX + VIEW_W + 20;
          }
          const elapsed = now - lv.since;
          if (lv.visible) {
            x = lv.fromX - (WALK_SPEED * Math.min(elapsed, WALK_OFF_MS)) / 1000;
            dir = -1;
            moving = elapsed < WALK_OFF_MS;
            opacity = elapsed < WALK_OFF_MS ? 1 : Math.max(0, 1 - (elapsed - WALK_OFF_MS) / 300);
          } else {
            opacity = Math.max(0, 1 - elapsed / 300);
          }
        }

        if (Math.abs(x - lastX) > 0.05) moving = true;
        lastX = x;
        root.style.display = sc === scene ? '' : 'none';
        root.style.opacity = opacity === 1 ? '' : String(opacity);
        root.style.transform = `translate3d(${snap(x - PLAYER_W / 2)}px,0,0)`;
        body.style.transform = `scaleX(${dir})`;
        setWalking(moving);
      },
    };
    return register(p.userId, handle);
    // Re-register only when the identity or look changes; presence updates (favId, scene) don't need it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.userId, JSON.stringify(p.look), scene, store, register]);

  const openBubble = () => {
    setBubble(true);
    const id = p.favId;
    if (id === null) return setFilm(null);
    const c = getCatalogueSync();
    if (c) setFilm(c.byId.get(id) ?? null);
    else void loadCatalogue().then((cat) => setFilm(cat.byId.get(id) ?? null));
  };

  const onPointerDown = (e: PointerEvent) => {
    e.stopPropagation(); // don't tap-to-walk
    if (e.pointerType !== 'mouse') {
      if (bubble) setBubble(false);
      else openBubble();
    }
  };

  const openFave = (e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (p.favId === null) return;
    const r = e.currentTarget.getBoundingClientRect();
    emit({ type: 'open-film', filmId: p.favId, source: 'friend', from: { x: r.left + r.width / 2, y: r.top + r.height / 2 } });
    setBubble(false);
  };

  return (
    <div
      ref={rootRef}
      className="absolute left-0"
      style={{ top: groundY - PLAYER_H, width: PLAYER_W, height: PLAYER_H, willChange: 'transform', pointerEvents: 'auto' }}
      onPointerEnter={(e) => e.pointerType === 'mouse' && !leaving && openBubble()}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setBubble(false)}
      onPointerDown={onPointerDown}
      data-remote={p.userId}
    >
      <style>{STYLES}</style>
      {/* Bigger hit area than the 16×24 sprite */}
      <div className="absolute" style={{ inset: '-10px -6px -2px -6px', cursor: 'pointer' }} />

      <AnimatePresence>
        {bubble && !leaving && (
          <motion.button
            key="bubble"
            type="button"
            className="absolute left-1/2 flex items-center gap-1 border border-neon-pink bg-night text-left"
            style={{ bottom: PLAYER_H + 14, x: '-50%', padding: 2, width: 78, transformOrigin: '50% 100%', boxShadow: '0 0 4px var(--neon-pink)' }}
            initial={{ scale: 0, opacity: 0, y: 6 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0, opacity: 0, y: 6 }}
            transition={bubbleSpring}
            onPointerDown={openFave}
          >
            {film ? (
              <>
                <img src={film.poster} alt="" className="shrink-0 object-cover" style={{ width: 16, height: 24 }} />
                <span className="flex min-w-0 flex-col" style={{ gap: 1 }}>
                  <span className="truncate font-term text-cream" style={{ fontSize: 8, lineHeight: 1 }}>{film.title}</span>
                  <span className="font-term text-cream/70" style={{ fontSize: 7, lineHeight: 1 }}>{film.year}</span>
                  <span className="font-hud text-neon-pink" style={{ fontSize: 4, lineHeight: 1.2 }}>♥ {p.name}&apos;S FAVE</span>
                </span>
              </>
            ) : (
              <span className="font-hud text-cream" style={{ fontSize: 4, lineHeight: 1.4 }}>{p.name} HAS NO FAVE YET</span>
            )}
            {/* tail */}
            <span className="absolute left-1/2 -translate-x-1/2 border-x-4 border-t-4 border-x-transparent border-t-neon-pink" style={{ bottom: -5, width: 0, height: 0 }} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Name tag in the jacket colour + online dot */}
      <div
        className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center whitespace-nowrap font-hud"
        style={{ bottom: PLAYER_H + 3, fontSize: 6, lineHeight: 1, color: p.look.jacket, textShadow: '1px 1px 0 var(--night)', gap: 2 }}
      >
        <span className="inline-block rounded-full bg-palm" style={{ width: 3, height: 3, boxShadow: '0 0 2px var(--palm)' }} />
        {p.name}
        {p.isDemo && <span className="text-cream/70" style={{ fontSize: 4 }}>DEMO</span>}
      </div>

      <div ref={bodyRef} className="pointer-events-none absolute inset-0" style={{ willChange: 'transform' }}>
        <div ref={spriteRef} style={{ width: PLAYER_W, height: PLAYER_H }} />
      </div>
    </div>
  );
}

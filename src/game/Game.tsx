// Game root: stage scaling, scenes, camera, rAF loop, input (CLAUDE.md §6). Lane GAME.
//
// React renders structure (layers, sections, player) once per scene. Everything that moves is
// written straight onto DOM refs by the loop (CLAUDE.md §1.7). Scene changes are the only state.
//
// Dev: ?dummies=8 spawns 8 walking test sprites plus an FPS meter (?fps=1 for the meter alone).
'use client';

import { useEffect, useRef, useState, type PointerEvent, type RefObject } from 'react';
import { emit, emitApp, onApp } from '@/lib/events';
import { mockLook } from '@/lib/mocks';
import type { Look } from '@/lib/types';
import { createCamera, VIEW_H, VIEW_W, type Camera } from './camera';
import Player, { ACCEL, createPlayerState, PLAYER_H, PLAYER_W, WALK_SPEED, type PlayerState } from './entities/Player';
import Rico, { type RicoHandle } from './entities/Rico';
import { input } from './input';
import { createLoop } from './loop';
import { INTERIOR, SECTIONS, sectionById } from './world/interior';
import { STREET } from './world/street';
import { createZoneTracker, zoneLabel, type SceneId, type Zone } from './zones';

export const STAGE_W = VIEW_W;
export const STAGE_H = VIEW_H;

export interface GameProps {
  /** Initial scene. After mount the game owns scene changes (door → interior and back). */
  scene: SceneId;
  /** Host/projector screen: shows the QR sign, may run demo NPCs. */
  host?: boolean;
  name?: string;
  look?: Look;
}

const WORLDS = { street: STREET, interior: INTERIOR } as const;
const FADE_MS = 350;
const PUSH_MS = 500;

interface Sim {
  player: PlayerState;
  camera: Camera;
  tracker: ReturnType<typeof createZoneTracker>;
  busy: boolean;            // transition or push-in running: ignore movement + interact
  scale: number;            // CSS px per logical px
  spawnX: number | null;    // where to place the player after the next scene change
  timers: number[];
  reduced: boolean;
}

function createSim(scene: SceneId): Sim {
  return {
    player: createPlayerState(WORLDS[scene].spawnX),
    camera: createCamera(WORLDS[scene].width),
    tracker: createZoneTracker(),
    busy: false,
    scale: 1,
    spawnX: null,
    timers: [],
    reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

const layerWidth = (worldW: number, factor: number) => VIEW_W + Math.max(0, (worldW - VIEW_W) * factor);

export default function Game({ scene: initialScene, host = false, name = 'YOU', look = mockLook }: GameProps) {
  const [scene, setScene] = useState<SceneId>(initialScene);

  const simRef = useRef<Sim | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef<HTMLDivElement>(null);
  const fadeRef = useRef<HTMLDivElement>(null);
  const doorRef = useRef<HTMLDivElement>(null);
  const playerRootRef = useRef<HTMLDivElement>(null);
  const playerBodyRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLDivElement>(null);
  const ricoRef = useRef<RicoHandle | null>(null); // G4
  const layerRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── Stage scaling: largest integer that fits; fractional below ×1 (phones) ──
  useEffect(() => {
    const s = (simRef.current ??= createSim(initialScene));
    const container = containerRef.current;
    const frame = frameRef.current;
    const stage = stageRef.current;
    if (!container || !frame || !stage) return;
    const fit = () => {
      const fitScale = Math.min(container.clientWidth / VIEW_W, container.clientHeight / VIEW_H);
      const scale = fitScale >= 1 ? Math.floor(fitScale) : Math.max(0.25, fitScale);
      s.scale = scale;
      frame.style.width = `${VIEW_W * scale}px`;
      frame.style.height = `${VIEW_H * scale}px`;
      stage.style.transform = `scale(${scale})`;
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(container);
    return () => ro.disconnect();
  }, [initialScene]);

  // ── Input + overlay pause ──
  useEffect(() => {
    const s = (simRef.current ??= createSim(initialScene));
    const detach = input.attach();
    // Dev hook for debugging/tests: window.__game.sim.player.x = 1050; window.__game.input.press('interact')
    if (process.env.NODE_ENV !== 'production') (window as unknown as { __game?: unknown }).__game = { sim: s, input };
    const off = onApp('overlay', (e) => {
      input.setPaused(e.open);
      if (!e.open && s.camera.zoom !== 1) void s.camera.zoomTo(1, 0, s.camera.originX, s.reduced ? 0 : 250);
    });
    return () => {
      detach();
      off();
      s.timers.forEach(clearTimeout);
      s.timers = [];
    };
  }, [initialScene]);

  // ── Per-scene setup + the loop ──
  useEffect(() => {
    const s = (simRef.current ??= createSim(initialScene));
    const world = WORLDS[scene];
    const p = s.player;
    const cam = s.camera;

    cam.setWorld(world.width);
    p.x = s.spawnX ?? world.spawnX;
    p.vx = 0;
    p.moving = false;
    s.spawnX = null;
    cam.snap(p.x, p.dir);
    void cam.zoomTo(1, 0, 0, 0);
    s.tracker.reset();
    input.tapTarget = null;
    emitApp({ type: 'scene', scene });

    // Fade back in from the door bloom, if we arrived through one.
    const fade = fadeRef.current;
    if (fade && fade.style.opacity === '1') {
      requestAnimationFrame(() => { fade.style.opacity = '0'; });
      s.timers.push(window.setTimeout(() => { s.busy = false; }, s.reduced ? 150 : FADE_MS));
    } else {
      s.busy = false;
    }

    const transition = (to: SceneId) => {
      s.busy = true;
      if (fade) {
        fade.style.transitionDuration = `${s.reduced ? 150 : FADE_MS}ms`;
        fade.style.opacity = '1';
      }
      s.timers.push(window.setTimeout(() => {
        s.spawnX = to === 'interior' ? INTERIOR.spawnX : STREET.exitX;
        setScene(to);
      }, s.reduced ? 150 : FADE_MS));
    };

    const interact = (zone: Zone) => {
      if (zone === null) return;
      if (zone === 'door') return transition(scene === 'street' ? 'interior' : 'street');
      if (zone === 'counter') return emit({ type: 'rico' });
      const sec = sectionById(zone);
      if (!sec || s.reduced) return emit({ type: 'open-library', section: zone });
      // Shelf push-in: scale 1 → 2.2 + blur 0 → 4px toward the shelf, then hand off to the library.
      s.busy = true;
      void cam.zoomTo(2.2, 4, (sec.x0 + sec.x1) / 2, PUSH_MS).then(() => {
        s.busy = false;
        emit({ type: 'open-library', section: zone });
      });
    };

    const onZone = (zone: Zone) => {
      const chip = chipRef.current;
      const label = zoneLabel(scene, zone);
      if (chip) {
        chip.textContent = label ?? '';
        chip.style.visibility = label ? 'visible' : 'hidden';
      }
      if (scene === 'street' && doorRef.current) {
        doorRef.current.style.transform = zone === 'door' ? 'translateX(-26px)' : '';
      }
    };

    // Dev: dummy walkers + FPS meter.
    const params = new URLSearchParams(window.location.search);
    const nDummies = Math.min(32, Number(params.get('dummies')) || 0);
    const actorsLayer = layerRefs.current[world.layers.findIndex((l) => l.id === 'actors')];
    const dummies = Array.from({ length: nDummies }, (_, i) => {
      const el = document.createElement('div');
      el.style.cssText = `position:absolute;left:0;top:${world.groundY - PLAYER_H}px;width:${PLAYER_W}px;height:${PLAYER_H}px;` +
        `background:var(--a-${['action', 'comedy', 'horror', 'scifi', 'drama', 'romance', 'animated', 'cult'][i % 8]});will-change:transform`;
      actorsLayer?.appendChild(el);
      return { el, x: 60 + ((i * 137) % (world.width - 120)), dir: i % 2 ? 1 : -1, speed: 40 + ((i * 23) % 50) };
    });
    let fpsEl: HTMLDivElement | null = null;
    if (nDummies || params.has('fps')) {
      fpsEl = document.createElement('div');
      fpsEl.style.cssText = 'position:absolute;right:4px;top:4px;font:12px monospace;color:var(--palm);background:var(--night);padding:2px 4px;z-index:5';
      frameRef.current?.appendChild(fpsEl);
    }
    let fpsFrames = 0;
    let fpsSince = performance.now();

    const loop = createLoop((dt, now) => {
      // Input → intent
      let axis = 0;
      if (!s.busy && !input.paused) {
        axis = input.axis();
        if (axis === 0 && input.tapTarget !== null) {
          const d = input.tapTarget - p.x;
          if (Math.abs(d) < 2) input.tapTarget = null;
          else axis = Math.sign(d);
        }
      }

      // Physics: accelerate toward target speed over ~120ms
      const target = axis * WALK_SPEED;
      const dv = ACCEL * dt;
      p.vx = p.vx < target ? Math.min(target, p.vx + dv) : Math.max(target, p.vx - dv);
      const min = PLAYER_W / 2;
      const max = world.width - PLAYER_W / 2;
      p.x += p.vx * dt;
      if (p.x < min || p.x > max) {
        p.x = Math.max(min, Math.min(max, p.x));
        p.vx = 0;
      }
      if (axis !== 0) p.dir = axis > 0 ? 1 : -1;
      const moving = Math.abs(p.vx) > 1;
      if (moving !== p.moving) {
        p.moving = moving;
        playerBodyRef.current?.firstElementChild?.classList.toggle('sv-moving', moving);
      }

      // Camera
      cam.follow(p.x, p.dir, dt);
      cam.update(now);

      // Write transforms (snap to device pixels so pixel art stays crisp)
      const sc = s.scale;
      const snap = (v: number) => Math.round(v * sc) / sc;
      for (let i = 0; i < world.layers.length; i++) {
        const el = layerRefs.current[i];
        if (el) el.style.transform = `translate3d(${-snap(cam.x * world.layers[i].factor)}px,0,0)`;
      }
      const root = playerRootRef.current;
      if (root) root.style.transform = `translate3d(${snap(p.x - PLAYER_W / 2)}px,0,0)`;
      const body = playerBodyRef.current;
      if (body) body.style.transform = `scaleX(${p.dir})`;
      const zoomEl = zoomRef.current;
      if (zoomEl) {
        zoomEl.style.transformOrigin = `${cam.originX - cam.x}px ${cam.originY}px`;
        zoomEl.style.transform = cam.zoom === 1 ? '' : `scale(${cam.zoom})`;
        zoomEl.style.filter = cam.blur > 0.05 ? `blur(${cam.blur.toFixed(2)}px)` : '';
      }

      // Zones
      const { zone, changed } = s.tracker.update(scene, p.x);
      if (changed) onZone(zone);
      if (scene === 'interior') ricoRef.current?.update(p.x); // G4: RICO waves when you get close

      // Pulses (always consumed so nothing queues up while busy)
      const wantInteract = input.consume('interact');
      const wantRico = input.consume('rico');
      const wantBack = input.consume('back');
      if (!s.busy) {
        if (wantInteract) interact(zone);
        if (wantRico) emit({ type: 'rico' });
        if (wantBack) emit({ type: 'close' });
      }

      // Dev dummies
      for (const d of dummies) {
        d.x += d.dir * d.speed * dt;
        if (d.x < 20 || d.x > world.width - 20) d.dir *= -1;
        d.el.style.transform = `translate3d(${snap(d.x - PLAYER_W / 2)}px,0,0) scaleX(${d.dir})`;
      }
      if (fpsEl) {
        fpsFrames++;
        if (now - fpsSince > 500) {
          fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsSince))} FPS · ${dummies.length + 1} SPRITES`;
          fpsFrames = 0;
          fpsSince = now;
        }
      }
    });
    loop.start();

    return () => {
      loop.stop();
      dummies.forEach((d) => d.el.remove());
      fpsEl?.remove();
    };
  }, [scene, initialScene]);

  // Tap/click-to-walk on the stage.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const s = simRef.current;
    const frame = frameRef.current;
    if (!s || !frame || s.busy || input.paused || e.button !== 0) return;
    const rect = frame.getBoundingClientRect();
    input.tapTarget = s.camera.x + (e.clientX - rect.left) / s.scale;
  };

  const world = WORLDS[scene];

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-0 w-full flex-1 items-start justify-center overflow-hidden sm:items-center"
      style={{ background: 'var(--sunset-grad)' }}
      data-host={host || undefined}
    >
      <div
        ref={frameRef}
        className="relative shrink-0 overflow-hidden"
        style={{ width: VIEW_W, height: VIEW_H, touchAction: 'manipulation', background: 'var(--night)' }}
        onPointerDown={onPointerDown}
      >
        <div
          ref={stageRef}
          className="absolute left-0 top-0 select-none"
          style={{ width: VIEW_W, height: VIEW_H, transformOrigin: '0 0', imageRendering: 'pixelated' }}
        >
          <div ref={zoomRef} className="absolute inset-0 overflow-hidden">
            {world.layers.map((l, i) => (
              <div
                key={`${scene}-${l.id}`}
                ref={(el) => { layerRefs.current[i] = el; }}
                className="absolute left-0 top-0 h-full"
                style={{
                  width: layerWidth(world.width, l.factor),
                  willChange: 'transform',
                  pointerEvents: 'none', // clicks fall through to the stage (tap-to-walk); interactive bits opt back in with 'auto'
                  filter: scene === 'interior' && l.id === 'foreground' ? 'blur(1.5px)' : undefined,
                }}
              >
                {l.id === 'actors' ? (
                  <>
                    {scene === 'interior' && <Rico groundY={world.groundY} handleRef={ricoRef} />}
                    <Player name={name} look={look} groundY={world.groundY} rootRef={playerRootRef} bodyRef={playerBodyRef} chipRef={chipRef} />
                  </>
                ) : scene === 'street' ? (
                  <StreetLayer id={l.id} doorRef={doorRef} />
                ) : (
                  <InteriorLayer id={l.id} />
                )}
              </div>
            ))}
          </div>
          {/* Door bloom / scene fade */}
          <div
            ref={fadeRef}
            className="pointer-events-none absolute inset-0"
            style={{
              opacity: 0,
              transitionProperty: 'opacity',
              transitionDuration: `${FADE_MS}ms`,
              background: 'radial-gradient(circle at 50% 60%, var(--cream) 0%, var(--neon-pink) 55%, var(--dusk) 100%)',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Placeholder scenery. TODO(G5): swap for U1's components/scene/* at the same parallax factors. ──

const SKYLINE: [x: number, w: number, h: number][] = [
  [0, 60, 90], [70, 40, 130], [120, 70, 70], [200, 50, 150], [260, 80, 100], [350, 45, 120],
  [400, 70, 80], [480, 55, 160], [545, 60, 95], [615, 40, 125], [665, 75, 85], [745, 30, 110],
];

function StreetLayer({ id, doorRef }: { id: string; doorRef: RefObject<HTMLDivElement | null> }) {
  const g = STREET.groundY;
  switch (id) {
    case 'sky':
      return (
        <div className="absolute inset-0" style={{ background: 'var(--sunset-grad)' }}>
          <div
            className="absolute rounded-full"
            style={{
              left: 260, top: 150, width: 120, height: 120,
              background: 'linear-gradient(180deg, var(--hazard), var(--sunset) 50%, var(--neon-pink))',
              maskImage: 'linear-gradient(180deg, #000 55%, transparent 55%, transparent 60%, #000 60%, #000 68%, transparent 68%, transparent 74%, #000 74%, #000 82%, transparent 82%, transparent 89%, #000 89%)',
            }}
          />
        </div>
      );
    case 'skyline':
      return (
        <>
          {SKYLINE.map(([x, w, h]) => (
            <div key={x} className="absolute" style={{ left: x, top: g - h, width: w, height: h, background: 'var(--dusk)' }} />
          ))}
        </>
      );
    case 'palms':
      return (
        <>
          {[40, 230, 420, 610, 800].map((x) => (
            <div key={x} className="absolute" style={{ left: x, top: g - 120, width: 40, height: 120 }}>
              <div className="absolute" style={{ left: 18, top: 16, width: 4, height: 104, background: 'var(--night)' }} />
              <div className="absolute rounded-full" style={{ left: 2, top: 0, width: 36, height: 22, background: 'var(--night)' }} />
            </div>
          ))}
        </>
      );
    case 'ground':
      return (
        <>
          <div className="absolute left-0 w-full" style={{ top: g, height: VIEW_H - g, background: 'var(--dusk)', borderTop: '1px solid var(--neon-pink)' }} />
          <div
            className="absolute"
            style={{ left: STREET.storefront.x0, top: 140, width: STREET.storefront.x1 - STREET.storefront.x0, height: g - 140, background: 'var(--night)', border: '2px solid var(--neon-cyan)' }}
          >
            <p className="absolute inset-x-0 top-2 text-center font-neon text-neon-pink" style={{ fontSize: 18, textShadow: '0 0 6px var(--neon-pink)' }}>
              STRANDVAULT
            </p>
            <div className="absolute" style={{ left: 16, top: 70, width: 90, height: 60, border: '1px solid var(--neon-pink)' }} />
            <div className="absolute" style={{ right: 16, top: 70, width: 70, height: 60, border: '1px solid var(--neon-pink)' }} />
            {/* Door frame + sliding glass panel */}
            <div
              className="absolute overflow-hidden"
              style={{ left: STREET.door.x0 - STREET.storefront.x0 - 2, top: 80, width: STREET.door.x1 - STREET.door.x0, height: g - 140 - 80 - 2, background: 'var(--neon-pink)', borderLeft: '1px solid var(--neon-cyan)', borderRight: '1px solid var(--neon-cyan)' }}
            >
              <div ref={doorRef} className="absolute inset-y-0 right-0" style={{ width: '100%', background: 'var(--neon-cyan)', opacity: 0.85, transition: 'transform 300ms var(--ease-out)' }} />
            </div>
          </div>
        </>
      );
    case 'foreground':
      return (
        <>
          <div className="absolute" style={{ left: 300, top: VIEW_H - 26, width: 96, height: 26, background: 'var(--night)', borderTop: '2px solid var(--neon-cyan)', borderRadius: '10px 14px 0 0' }} />
          <div className="absolute" style={{ left: 1250, top: 60, width: 10, height: VIEW_H - 60, background: 'var(--night)' }} />
          <div className="absolute rounded-full" style={{ left: 1215, top: 40, width: 80, height: 40, background: 'var(--night)' }} />
        </>
      );
    default:
      return null;
  }
}

function InteriorLayer({ id }: { id: string }) {
  const g = INTERIOR.groundY;
  switch (id) {
    case 'wall':
      return (
        <div
          className="absolute inset-0"
          style={{ background: 'repeating-linear-gradient(90deg, var(--night) 0 38px, var(--dusk) 38px 40px)' }}
        />
      );
    case 'shelves':
      return (
        <>
          <div className="absolute left-0 w-full" style={{ top: g, height: VIEW_H - g, background: 'var(--dusk)', borderTop: '1px solid var(--neon-pink)' }} />
          {/* Exit door */}
          <div className="absolute" style={{ left: 6, top: g - 88, width: 38, height: 88, border: '2px solid var(--neon-cyan)' }}>
            <p className="absolute inset-x-0 top-1 text-center font-hud text-neon-cyan" style={{ fontSize: 6 }}>EXIT</p>
          </div>
          {SECTIONS.map((s) => {
            const x0 = s.id === 'staffpicks' ? INTERIOR.exitDoor.x1 + 8 : s.x0 + 8;
            const w = s.x1 - x0 - 8;
            const glow = `0 0 6px ${s.color}`;
            return (
              <div key={s.id} className="absolute" style={{ left: x0, top: 0, width: w, height: g }}>
                <p className="absolute inset-x-0 text-center font-hud" style={{ top: 92, fontSize: 9, color: s.color, textShadow: glow }}>
                  {s.label}
                </p>
                {s.id === 'counter' ? null /* G4: the counter is drawn by entities/Rico.tsx */ : (
                  <div className="absolute inset-x-0" style={{ top: 112, bottom: 26, border: `1px solid ${s.color}`, boxShadow: glow }}>
                    {[0.33, 0.66].map((t) => (
                      <div key={t} className="absolute inset-x-0" style={{ top: `${t * 100}%`, height: 1, background: s.color }} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </>
      );
    case 'foreground':
      return (
        <>
          {[300, 900, 1500, 2100, 2700, 3200].map((x) => (
            <div key={x} className="absolute" style={{ left: x, top: VIEW_H - 70, width: 34, height: 70, background: 'var(--night)', borderRadius: '16px 16px 0 0', opacity: 0.9 }} />
          ))}
        </>
      );
    default:
      return null;
  }
}

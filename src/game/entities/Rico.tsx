// RICO at the counter (CLAUDE.md §6.4, §7.4). Lane GAME.
//
// Ref-driven like the player: React renders structure once, then
//   - the game loop calls handle.update(playerX) every frame (cheap; only writes on change)
//   - AppEvent 'rico-pending' switches him to spin-disc, then a one-shot toss when it resolves
// Priority: toss > spin > wave > idle.
'use client';

import { useEffect, useRef, type RefObject } from 'react';
import IdkButton from '@/components/rico/IdkButton';
import { emit, onApp } from '@/lib/events';
import { SHEET_KEYFRAMES, sheetAnim } from '../sprites/pixel';
import { RICO_FPS, RICO_H, RICO_W, ricoSheet } from '../sprites/rico';
import { COUNTER } from '../world/interior';

export type RicoAnim = 'idle' | 'wave' | 'spin' | 'toss';

export interface RicoHandle {
  /** Call once per frame with the player's world x. */
  update(playerX: number): void;
  readonly anim: RicoAnim;
}

const WAVE_MS = 1500;
const SPIN_TIMEOUT_MS = 8000; // never spin forever if a request gets lost
const TOSS_MS = (3 / RICO_FPS.toss) * 1000 - 15; // 3 frames, switch just before the last ends

/** Write a sheetAnim() style object onto an element (custom properties included). */
function applyStyle(el: HTMLElement, style: Record<string, unknown>) {
  for (const [k, v] of Object.entries(style)) {
    const value = v === undefined ? '' : typeof v === 'number' ? `${v}px` : String(v);
    if (k.startsWith('--')) el.style.setProperty(k, value);
    else (el.style as unknown as Record<string, string>)[k] = value;
  }
}

export interface RicoProps {
  groundY: number;
  handleRef: RefObject<RicoHandle | null>;
}

export default function Rico({ groundY, handleRef }: RicoProps) {
  const spriteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = spriteRef.current;
    if (!el) return;
    const sheet = ricoSheet();
    if (!sheet.url) return;

    let anim: RicoAnim | null = null;
    let pending = false;
    let tossing = false;
    let waveUntil = 0;
    let inRange = false;
    const timers: number[] = [];

    const play = (next: RicoAnim) => {
      if (next === anim) return;
      anim = next;
      const once = next === 'toss';
      applyStyle(el, { ...sheetAnim(sheet, sheet[next], RICO_FPS[next]), animation: 'none' });
      void el.offsetWidth; // restart the CSS animation from frame 0
      el.style.animation = `sv-sheet ${sheet[next].length / RICO_FPS[next]}s steps(${sheet[next].length}) ${once ? '1 forwards' : 'infinite'}`;
    };

    const resolve = (now = performance.now()) => {
      if (tossing) play('toss');
      else if (pending) play('spin');
      else if (now < waveUntil) play('wave');
      else play('idle');
    };

    const offPending = onApp('rico-pending', (e) => {
      if (e.pending) {
        pending = true;
        tossing = false;
        timers.push(window.setTimeout(() => { pending = false; resolve(); }, SPIN_TIMEOUT_MS));
      } else if (pending) {
        pending = false;
        tossing = true;
        timers.push(window.setTimeout(() => { tossing = false; resolve(); }, TOSS_MS));
      }
      resolve();
    });

    handleRef.current = {
      update(playerX: number) {
        const d = Math.abs(playerX - COUNTER.ricoX);
        const now = performance.now();
        if (!inRange && d < COUNTER.waveRange) {
          inRange = true;
          waveUntil = now + WAVE_MS;
        } else if (inRange && d > COUNTER.waveRange + 20) {
          inRange = false; // hysteresis so hovering at the edge doesn't re-trigger
        }
        resolve(now);
      },
      get anim() {
        return anim ?? 'idle';
      },
    };
    resolve();

    return () => {
      offPending();
      timers.forEach(clearTimeout);
      handleRef.current = null;
    };
  }, [handleRef]);

  const counterTop = groundY - COUNTER.height;
  const ricoTop = groundY - COUNTER.ricoDepth - RICO_H;

  return (
    <>
      <style>{SHEET_KEYFRAMES}</style>

      {/* RICO, behind the counter */}
      <div className="absolute" style={{ left: COUNTER.ricoX - RICO_W / 2, top: ricoTop, width: RICO_W, height: RICO_H }}>
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-hud text-sunset"
          style={{ bottom: RICO_H + 3, fontSize: 6, lineHeight: 1, textShadow: '1px 1px 0 var(--night)' }}
        >
          RICO
        </div>
        <div ref={spriteRef} style={{ width: RICO_W, height: RICO_H, imageRendering: 'pixelated' }} />
      </div>

      {/* Counter front (covers RICO's legs) */}
      <div
        className="absolute"
        style={{
          left: COUNTER.x0,
          top: counterTop,
          width: COUNTER.x1 - COUNTER.x0,
          height: COUNTER.height,
          background: 'linear-gradient(180deg, var(--dusk), var(--night))',
          borderTop: '2px solid var(--sunset)',
          boxShadow: '0 -2px 6px var(--sunset)',
        }}
      >
        <div className="absolute inset-x-2" style={{ top: 8, height: 1, background: 'var(--neon-pink)', opacity: 0.7 }} />
      </div>

      {/* Physical IDK arcade button on the counter top. HACK: the HUD-sized button scaled down into stage px. */}
      <div
        className="absolute"
        style={{ left: COUNTER.idkX, top: counterTop - 1, width: 0, height: 0, pointerEvents: 'auto' }}
        onPointerDown={(e) => e.stopPropagation()} // don't trigger tap-to-walk
      >
        <div className="absolute bottom-0 left-0 w-max" style={{ transform: 'translateX(-50%) scale(0.22)', transformOrigin: 'bottom center' }}>
          <IdkButton variant="counter" onPress={() => emit({ type: 'rico' })} />
        </div>
      </div>
    </>
  );
}

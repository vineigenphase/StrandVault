// Local player sprite (CLAUDE.md §6.3–6.4). Lane GAME.
// Ref-driven: the loop writes transforms and classes directly; React renders structure once.
// TODO(G2 → G5): swap the placeholder body for sheetFor(look) + CSS steps() walk/idle cycles.
'use client';

import type { RefObject } from 'react';
import type { Look } from '@/lib/types';

export const PLAYER_W = 16;
export const PLAYER_H = 24;
export const WALK_SPEED = 90;          // logical px/s
export const ACCEL = WALK_SPEED / 0.12; // reach full speed in 120ms

/** Plain mutable state. Lives outside React so per-frame updates never re-render. */
export interface PlayerState { x: number; vx: number; dir: 1 | -1; moving: boolean }
export const createPlayerState = (x: number): PlayerState => ({ x, vx: 0, dir: 1, moving: false });

export interface PlayerProps {
  name: string;
  look: Look;
  groundY: number;
  rootRef: RefObject<HTMLDivElement | null>;
  bodyRef: RefObject<HTMLDivElement | null>;
  chipRef: RefObject<HTMLDivElement | null>;
}

const KEYFRAMES = `
@keyframes sv-bob { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-3px) } }
@keyframes sv-walk { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-1px) } }
@keyframes sv-breathe { 0%,100% { transform: translateY(0) } 50% { transform: translateY(1px) } }
.sv-sprite { animation: sv-breathe 1s steps(2) infinite; }
.sv-sprite.sv-moving { animation: sv-walk .25s steps(2) infinite; }
.sv-chip { animation: sv-bob 1s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) { .sv-sprite, .sv-sprite.sv-moving, .sv-chip { animation: none; } }
`;

export default function Player({ name, look, groundY, rootRef, bodyRef, chipRef }: PlayerProps) {
  return (
    <div
      ref={rootRef}
      className="absolute left-0"
      style={{ top: groundY - PLAYER_H, width: PLAYER_W, height: PLAYER_H, willChange: 'transform' }}
    >
      <style>{KEYFRAMES}</style>

      {/* Interact chip, e.g. ▲ BROWSE SCI-FI. Text + visibility written by the loop on zone change. */}
      <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: PLAYER_H + 16 }}>
        <div
          ref={chipRef}
          className="sv-chip whitespace-nowrap border border-neon-cyan bg-night px-1 py-[2px] font-hud text-neon-cyan"
          style={{ fontSize: 6, lineHeight: 1, visibility: 'hidden', boxShadow: '0 0 4px var(--neon-cyan)' }}
        />
      </div>

      {/* Name tag in the jacket colour. */}
      <div
        className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap font-hud"
        style={{ bottom: PLAYER_H + 3, fontSize: 6, lineHeight: 1, color: look.jacket, textShadow: '1px 1px 0 var(--night)' }}
      >
        {name}
      </div>

      {/* Body: flipped by the loop via scaleX. Placeholder pixel figure until G2 sprites land. */}
      <div ref={bodyRef} className="absolute inset-0" style={{ willChange: 'transform' }}>
        <div className="sv-sprite absolute inset-0">
          {/* hair */}
          <div className="absolute" style={{ left: 4, top: 0, width: 8, height: 3, background: look.hairColor }} />
          {/* face */}
          <div className="absolute" style={{ left: 4, top: 3, width: 8, height: 6, background: look.skin }} />
          {look.shades && <div className="absolute" style={{ left: 6, top: 5, width: 6, height: 2, background: 'var(--night)' }} />}
          {/* jacket */}
          <div className="absolute" style={{ left: 3, top: 9, width: 10, height: 8, background: look.jacket }} />
          {/* legs */}
          <div className="absolute" style={{ left: 4, top: 17, width: 3, height: 7, background: 'var(--dusk)' }} />
          <div className="absolute" style={{ left: 9, top: 17, width: 3, height: 7, background: 'var(--dusk)' }} />
        </div>
      </div>
    </div>
  );
}

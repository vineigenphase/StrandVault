// Dev-only sprite gallery for review (TASKS.md G2). Lane GAME. Delete in F1.
'use client';

/* eslint-disable @next/next/no-img-element -- sprite sheets are generated data URLs */
import { useMemo, useSyncExternalStore } from 'react';
import { CHAR_H, CHAR_W, HAIR_STYLES, IDLE_FPS, LOOK_OPTIONS, WALK_FPS, lookHash, miniHead, sheetFor } from '@/game/sprites/characters';
import { SHEET_KEYFRAMES, sheetAnim } from '@/game/sprites/pixel';
import { RICO_FPS, ricoSheet } from '@/game/sprites/rico';
import type { Look } from '@/lib/types';

const SCALE = 4;
const noop = () => () => {};

function useIsClient() {
  return useSyncExternalStore(noop, () => true, () => false);
}

const LOOKS: Look[] = HAIR_STYLES.flatMap((hair, i) =>
  [false, true].map((shades, j) => ({
    hair,
    shades,
    jacket: LOOK_OPTIONS.jackets[(i * 2 + j) % LOOK_OPTIONS.jackets.length],
    hairColor: LOOK_OPTIONS.hairColors[(i + j * 3) % LOOK_OPTIONS.hairColors.length],
    skin: LOOK_OPTIONS.skins[(i * 2 + j) % LOOK_OPTIONS.skins.length],
  })),
);

type Gallery = ReturnType<typeof compose>;
let gallery: Gallery | null = null;

/** Compose every sheet once and time it (runs client-side only). */
function buildGallery(): Gallery {
  return (gallery ??= compose());
}

function compose() {
  const timings: number[] = [];
  const chars = LOOKS.map((look) => {
    const t0 = performance.now();
    const sheet = sheetFor(look);
    timings.push(performance.now() - t0);
    return { look, sheet, head: miniHead(look) };
  });
  const t0 = performance.now();
  const rico = ricoSheet();
  const ricoMs = performance.now() - t0;
  const t1 = performance.now();
  sheetFor(LOOKS[0]);
  const cachedMs = performance.now() - t1;
  // Warm timings: 20 never-seen looks after the canvas/encoder have warmed up.
  const warm: number[] = [];
  for (let i = 0; i < 20; i++) {
    const look: Look = { ...LOOKS[i % LOOKS.length], jacket: `#${(0x100000 + i * 0x0a1b2c).toString(16).slice(-6)}` };
    const t = performance.now();
    sheetFor(look);
    warm.push(performance.now() - t);
  }
  warm.sort((a, b) => a - b);
  return { chars, rico, ricoMs, cachedMs, timings, warm };
}

export default function SpriteGallery() {
  const client = useIsClient();

  const data = useMemo(() => (client ? buildGallery() : null), [client]);

  return (
    <main className="flex flex-1 flex-col gap-8 bg-night p-6 text-cream">
      <style>{SHEET_KEYFRAMES}</style>
      <header className="flex flex-col gap-2">
        <h1 className="font-hud text-sm text-neon-pink">/DEV/SPRITES</h1>
        {data && (
          <p className="font-term text-xl text-palm">
            COMPOSE: max {Math.max(...data.timings).toFixed(2)}ms · avg{' '}
            {(data.timings.reduce((a, b) => a + b, 0) / data.timings.length).toFixed(2)}ms per look (target &lt; 5ms) · cached{' '}
            {data.cachedMs.toFixed(3)}ms · RICO {data.ricoMs.toFixed(2)}ms
            <br />
            WARM (20 new looks): median {data.warm[10].toFixed(2)}ms · p95 {data.warm[18].toFixed(2)}ms · max {data.warm[19].toFixed(2)}ms
          </p>
        )}
      </header>

      {!data ? (
        <p className="font-term text-2xl">TRACKING…</p>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="font-hud text-xs text-neon-cyan">CHARACTERS · 5 HAIR × SHADES</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.chars.map(({ look, sheet, head }) => (
                <div key={lookHash(look)} className="flex items-end gap-4 border border-dusk p-3">
                  <img src={sheet.url} alt="" width={CHAR_W * 6 * SCALE} height={CHAR_H * SCALE} style={{ imageRendering: 'pixelated' }} />
                  <div style={sheetAnim(sheet, sheet.idle, IDLE_FPS, SCALE)} title="idle" />
                  <div style={sheetAnim(sheet, sheet.walk, WALK_FPS, SCALE)} title="walk" />
                  <img src={head} alt="" width={12 * SCALE} height={12 * SCALE} style={{ imageRendering: 'pixelated' }} />
                  <span className="font-term text-lg leading-tight">
                    {look.hair.toUpperCase()}
                    <br />
                    {look.shades ? 'SHADES' : 'NO SHADES'}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-hud text-xs text-neon-cyan">RICO · IDLE · WAVE · SPIN · TOSS</h2>
            <img src={data.rico.url} alt="" width={24 * 11 * SCALE} height={32 * SCALE} style={{ imageRendering: 'pixelated', maxWidth: '100%', height: 'auto' }} />
            <div className="flex flex-wrap items-end gap-8">
              {(['idle', 'wave', 'spin', 'toss'] as const).map((anim) => (
                <div key={anim} className="flex flex-col items-center gap-2">
                  <div style={sheetAnim(data.rico, data.rico[anim], RICO_FPS[anim], SCALE)} />
                  <span className="font-hud text-[10px]">{anim.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <h2 className="font-hud text-xs text-neon-cyan">IN-STAGE SIZE (×3 PROJECTOR)</h2>
            <div className="flex items-end gap-4">
              {data.chars.slice(0, 6).map(({ look, sheet }) => (
                <div key={lookHash(look)} style={sheetAnim(sheet, sheet.walk, WALK_FPS, 3)} />
              ))}
              <div style={sheetAnim(data.rico, data.rico.idle, RICO_FPS.idle, 3)} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}

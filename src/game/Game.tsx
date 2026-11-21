// Game root: mounts scenes, camera, loop, input (CLAUDE.md §6). Lane GAME.
// T0 placeholder: a 640×360 stage. TODO(G1): integer scaling, rAF loop, street/interior, zones.
'use client';

export const STAGE_W = 640;
export const STAGE_H = 360;

export interface GameProps {
  scene: 'street' | 'interior';
  /** Host/projector screen: shows the QR sign, may run demo NPCs. */
  host?: boolean;
}

export default function Game({ scene, host = false }: GameProps) {
  return (
    <div className="relative flex w-full flex-1 items-start justify-center sm:items-center" style={{ background: 'var(--sunset-grad)' }}>
      <div
        data-stage
        className="relative w-full max-w-[1920px] overflow-hidden"
        style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}`, background: 'linear-gradient(180deg, var(--dusk), var(--night))' }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          <p className="font-neon text-4xl text-neon-pink sm:text-6xl">STRANDVAULT</p>
          <p className="font-hud text-[10px] text-neon-cyan sm:text-xs">
            STAGE {STAGE_W}×{STAGE_H} · SCENE: {scene.toUpperCase()}
            {host ? ' · HOST' : ''}
          </p>
        </div>
      </div>
    </div>
  );
}

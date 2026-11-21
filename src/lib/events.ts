// Tiny typed event bus: game ↔ overlays (CLAUDE.md §7). Lane GAME.
//
//   emit({ type: 'open-film', filmId, source: 'shelf' })
//   const off = on('open-film', (e) => …); off();
//   useGameEvent('zone', (e) => …)            // inside a component
//
// Two channels share one implementation:
//   - GameEvent (frozen in types.ts): zone / open-library / open-film / rico / close
//   - AppEvent  (here, extendable):   toasts, presence, overlay state, faves, now-playing …

import { useEffect, useEffectEvent } from 'react';
import type { GameEvent, PresenceState, ProviderId } from './types';

export type AppEvent =
  | { type: 'toast'; text: string }
  | { type: 'presence-join'; p: PresenceState }
  | { type: 'presence-leave'; userId: string }
  | { type: 'now-playing'; filmId: number; provider: ProviderId }
  | { type: 'fav'; filmId: number; on: boolean; setTop?: boolean }  // MoviePage → realtime (broadcast + re-track)
  | { type: 'overlay'; open: boolean }                              // OverlayRoot → input (pause/resume)
  | { type: 'scene'; scene: 'street' | 'interior' }                 // Game → HUD (◀◀ REW)
  | { type: 'rico-pending'; pending: boolean };                     // RicoPanel → Rico entity (spin-disc)

type Of<E extends { type: string }, T extends E['type']> = Extract<E, { type: T }>;

function createBus<E extends { type: string }>() {
  const handlers = new Map<string, Set<(e: E) => void>>();
  return {
    emit(e: E) {
      handlers.get(e.type)?.forEach((h) => {
        try { h(e); } catch (err) { console.error('[events]', e.type, err); }
      });
    },
    on<T extends E['type']>(type: T, fn: (e: Of<E, T>) => void): () => void {
      let set = handlers.get(type);
      if (!set) handlers.set(type, (set = new Set()));
      const h = fn as unknown as (e: E) => void;
      set.add(h);
      return () => { set.delete(h); };
    },
  };
}

const game = createBus<GameEvent>();
const app = createBus<AppEvent>();

export const emit = game.emit;
export const on = game.on;
export const emitApp = app.emit;
export const onApp = app.on;

/** Convenience: show a GTA-style toast. */
export const toast = (text: string) => app.emit({ type: 'toast', text });

/** Subscribe to a GameEvent for the component's lifetime. `fn` may change every render. */
export function useGameEvent<T extends GameEvent['type']>(type: T, fn: (e: Of<GameEvent, T>) => void) {
  const handler = useEffectEvent(fn);
  useEffect(() => game.on(type, (e) => handler(e)), [type]);
}

/** Subscribe to an AppEvent for the component's lifetime. */
export function useAppEvent<T extends AppEvent['type']>(type: T, fn: (e: Of<AppEvent, T>) => void) {
  const handler = useEffectEvent(fn);
  useEffect(() => app.on(type, (e) => handler(e)), [type]);
}

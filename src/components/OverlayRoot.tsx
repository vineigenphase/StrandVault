// Top-level overlay host (CLAUDE.md §7). Lane UI; owned by T0 then G5 (integration) — nobody else edits.
// State machine: none | library(section) | disc(filmId, source, from, ricoLine) | rico
// Listens on the event bus; tells the game to pause input via AppEvent 'overlay'.
'use client';

import { useCallback, useEffect, useState } from 'react';
import DiscOpenSequence from '@/components/disc/DiscOpenSequence';
import Hud from '@/components/hud/Hud';
import LibraryView from '@/components/library/LibraryView';
import MoviePage from '@/components/movie/MoviePage';
import RicoPanel from '@/components/rico/RicoPanel';
import { api } from '@/lib/api';
import { getCatalogueSync, loadCatalogue } from '@/lib/catalogue';
import { emit, emitApp, useGameEvent } from '@/lib/events';
import type { Film, Friend, GameEvent, OpenSource, PresenceState, RicoRes, Section } from '@/lib/types';

type Overlay =
  | { kind: 'none' }
  | { kind: 'library'; section: Section }
  | { kind: 'disc'; film: Film; source: OpenSource; from?: { x: number; y: number }; ricoLine?: string; closing: boolean }
  | { kind: 'rico' };

const sourceFor = (s: Section): OpenSource => (s === 'staffpicks' ? 'staffpicks' : s === 'yourshelf' ? 'yourshelf' : 'shelf');

export interface OverlayRootProps {
  /** Presence list for the HUD. TODO(G3/G5): feed from useStore(). */
  online?: PresenceState[];
}

export default function OverlayRoot({ online = [] }: OverlayRootProps) {
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [friends, setFriends] = useState<Friend[]>([]);

  useEffect(() => {
    void loadCatalogue();
    let live = true;
    api.storeState().then((s) => { if (live) setFriends(s.friends); });
    return () => { live = false; };
  }, []);

  const isOpen = overlay.kind !== 'none';
  useEffect(() => {
    emitApp({ type: 'overlay', open: isOpen });
  }, [isOpen]);

  const openFilm = useCallback(async (e: Extract<GameEvent, { type: 'open-film' }>) => {
    const film = (getCatalogueSync() ?? (await loadCatalogue())).byId.get(e.filmId);
    if (!film) return;
    setOverlay({ kind: 'disc', film, source: e.source, from: e.from, ricoLine: e.ricoLine, closing: false });
    api.open({ userId: '', filmId: film.id, source: e.source }); // TODO(G5): real userId
  }, []);

  const close = useCallback(() => {
    setOverlay((o) => (o.kind === 'disc' ? { ...o, closing: true } : { kind: 'none' }));
  }, []);

  useGameEvent('open-library', (e) => setOverlay({ kind: 'library', section: e.section }));
  useGameEvent('open-film', (e) => void openFilm(e));
  useGameEvent('rico', () => setOverlay({ kind: 'rico' }));
  useGameEvent('close', close);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Backspace') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, close]);

  // Dev hook: window.__emit({ type: 'open-film', filmId: 105, source: 'shelf' })
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    (window as unknown as { __emit?: typeof emit }).__emit = emit;
  }, []);

  const onRicoPick = useCallback((res: RicoRes) => {
    emit({ type: 'open-film', filmId: res.filmId, source: 'rico', ricoLine: res.line });
  }, []);
  const onDiscDone = useCallback(() => setOverlay({ kind: 'none' }), []);
  const onLibraryPick = useCallback(
    (filmId: number, from: { x: number; y: number }) => {
      if (overlay.kind !== 'library') return;
      emit({ type: 'open-film', filmId, source: sourceFor(overlay.section), from });
    },
    [overlay],
  );

  return (
    <>
      <Hud online={online} />
      {overlay.kind === 'library' && <LibraryView section={overlay.section} onPick={onLibraryPick} onClose={close} />}
      {overlay.kind === 'rico' && <RicoPanel onPick={onRicoPick} onClose={close} />}
      {overlay.kind === 'disc' && (
        <DiscOpenSequence film={overlay.film} from={overlay.from} closing={overlay.closing} onDone={onDiscDone}>
          <MoviePage film={overlay.film} source={overlay.source} ricoLine={overlay.ricoLine} friends={friends} onClose={close} />
        </DiscOpenSequence>
      )}
      {process.env.NODE_ENV !== 'production' && overlay.kind === 'none' && (
        <div className="fixed bottom-4 left-4 z-30 flex flex-wrap gap-2 font-hud text-[10px]">
          <button className="min-h-11 border-2 border-neon-cyan bg-night px-3 text-neon-cyan" onClick={() => emit({ type: 'open-library', section: 'scifi' })}>
            DEV: SCI-FI
          </button>
          <button className="min-h-11 border-2 border-neon-cyan bg-night px-3 text-neon-cyan" onClick={() => emit({ type: 'open-film', filmId: 105, source: 'shelf' })}>
            DEV: OPEN DISC
          </button>
        </div>
      )}
    </>
  );
}

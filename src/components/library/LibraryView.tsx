// Side-scrolling shelf of disc-case spines (CLAUDE.md §7.1). Lane UI.
// T0 stub with final props. TODO(U2): spines, scroll/drag/swipe/snap, hover glow, friend avatars.
'use client';

import { useEffect, useState } from 'react';
import { loadCatalogue } from '@/lib/catalogue';
import type { Film, Section } from '@/lib/types';

export interface LibraryViewProps {
  section: Section;
  /** `from` = viewport centre of the picked spine, so Disc Open starts there. */
  onPick(filmId: number, from: { x: number; y: number }): void;
  onClose(): void;
}

const AISLES = new Set(['action', 'comedy', 'horror', 'scifi', 'drama', 'romance', 'animated', 'cult']);

export default function LibraryView({ section, onPick, onClose }: LibraryViewProps) {
  const [films, setFilms] = useState<Film[]>([]);

  useEffect(() => {
    let live = true;
    loadCatalogue().then((c) => {
      if (live) setFilms(AISLES.has(section) ? c.byAisle[section as Film['aisle']] : c.trending.length ? c.trending : c.films.slice(0, 18));
    });
    return () => { live = false; };
  }, [section]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col gap-4 bg-night/90 p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-hud text-sm text-neon-cyan">[STUB] LIBRARY · {section.toUpperCase()}</h2>
        <button className="min-h-11 min-w-11 font-hud text-xs text-cream" onClick={onClose}>✕ BACK</button>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {films.map((f) => (
          <button
            key={f.id}
            className="flex h-64 w-12 shrink-0 items-center justify-center border-2 border-neon-pink bg-dusk font-term text-lg text-cream [writing-mode:vertical-rl]"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onPick(f.id, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
            }}
          >
            {f.title}
          </button>
        ))}
      </div>
    </div>
  );
}

// Disc Open Sequence: pull → open → spin → bloom (CLAUDE.md §7.2). Lane UI.
// T0 stub with final props. TODO(U2): the real 1.55s sequence + 500ms reverse close.
'use client';

import { useEffect, type ReactNode } from 'react';
import type { Film } from '@/lib/types';

export interface DiscOpenSequenceProps {
  film: Film;
  /** Viewport point the case flies out from (spine, bubble, RICO's hand). Defaults to screen centre. */
  from?: { x: number; y: number };
  /** When true, play the reverse close; call onDone() once it has finished. */
  closing?: boolean;
  /** Called after the close animation completes. The parent then unmounts this. */
  onDone(): void;
  /** The movie page revealed by the bloom. */
  children: ReactNode;
}

export default function DiscOpenSequence({ film, closing = false, onDone, children }: DiscOpenSequenceProps) {
  useEffect(() => {
    if (closing) onDone();
  }, [closing, onDone]);

  return (
    <div className="fixed inset-0 z-50" data-disc={film.id}>
      {children}
    </div>
  );
}

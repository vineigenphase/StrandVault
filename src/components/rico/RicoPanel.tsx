// RICO "phone call" panel (CLAUDE.md §7.4). Lane UI.
// T0 stub with final props. TODO(U5): portrait, typed line, toss arc, mood chips, 6s fallback.
'use client';

import { useEffect } from 'react';
import { api } from '@/lib/api';
import { emitApp } from '@/lib/events';
import type { RicoRes } from '@/lib/types';

export interface RicoPanelProps {
  /** Called after RICO's toss lands; the parent then runs Disc Open with source 'rico'. */
  onPick(res: RicoRes): void;
  onClose(): void;
}

export default function RicoPanel({ onPick, onClose }: RicoPanelProps) {
  useEffect(() => {
    let live = true;
    emitApp({ type: 'rico-pending', pending: true });
    api.rico({ userId: null }).then((res) => {
      emitApp({ type: 'rico-pending', pending: false });
      if (live) onPick(res);
    });
    return () => { live = false; };
  }, [onPick]);

  return (
    <div className="fixed right-4 top-1/4 z-40 flex w-72 flex-col gap-3 border-2 border-neon-pink bg-night p-4">
      <span className="font-hud text-xs text-neon-cyan">[STUB] RICO</span>
      <p className="font-term text-2xl text-cream">RICO IS THINKING…</p>
      <button className="min-h-11 font-hud text-xs text-cream" onClick={onClose}>✕ HANG UP</button>
    </div>
  );
}

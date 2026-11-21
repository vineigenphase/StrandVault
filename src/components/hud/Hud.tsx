// HUD: OSD, toasts, online strip, IDK button (CLAUDE.md §7.5). Lane UI.
// T0 stub with final props. TODO(U6): Osd, Toasts, MiniStrip components + motion.
'use client';

import IdkButton from '@/components/rico/IdkButton';
import { emit } from '@/lib/events';
import type { PresenceState } from '@/lib/types';

export interface HudProps {
  /** Everyone currently in the store (from realtime presence). */
  online: PresenceState[];
}

export default function Hud({ online }: HudProps) {
  return (
    <div className="pointer-events-none fixed inset-0 z-30">
      <p className="absolute left-4 top-4 font-term text-2xl text-cream">PLAY ▶</p>
      <p className="absolute right-4 top-4 font-hud text-[10px] text-palm">{online.length} IN STORE</p>
      <div className="pointer-events-auto absolute bottom-4 right-4">
        <IdkButton onPress={() => emit({ type: 'rico' })} />
      </div>
    </div>
  );
}

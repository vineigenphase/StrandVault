// Interior layout: sections, x ranges, interact zones (CLAUDE.md §6.2). Lane GAME. Logical px.
import type { Section } from '@/lib/types';
import type { LayerDef } from './street';

export interface SectionDef {
  id: Section;
  x0: number;
  x1: number;
  label: string;   // neon sign text
  color: string;   // CSS colour (token var)
}

const AISLES: [Section, string][] = [
  ['action', 'ACTION'], ['comedy', 'COMEDY'], ['horror', 'HORROR'], ['scifi', 'SCI-FI'],
  ['drama', 'DRAMA'], ['romance', 'ROMANCE'], ['animated', 'ANIMATED'], ['cult', "CULT '80s"],
];

export const SECTIONS: SectionDef[] = [
  { id: 'staffpicks', x0: 0, x1: 380, label: 'STAFF PICKS', color: 'var(--neon-pink)' },
  { id: 'new', x0: 380, x1: 680, label: 'NEW RELEASES', color: 'var(--hazard)' },
  ...AISLES.map(([id, label], i): SectionDef => ({ id, x0: 680 + i * 200, x1: 880 + i * 200, label, color: `var(--a-${id})` })),
  { id: 'yourshelf', x0: 2280, x1: 2520, label: 'YOUR SHELF', color: 'var(--palm)' },
  { id: 'counter', x0: 2520, x1: 3000, label: 'COUNTER', color: 'var(--sunset)' },
];

export const sectionById = (id: Section) => SECTIONS.find((s) => s.id === id);

/**
 * The counter inside the 'counter' section (2520–3000). RICO stands behind it; the physical
 * IDK arcade button sits on top. Standing anywhere in the section + interact also calls RICO.
 */
export const COUNTER = {
  x0: 2640,
  x1: 2900,
  height: 22,          // waist height for 24px people
  ricoX: 2790,         // RICO's centre
  ricoDepth: 6,        // RICO's feet sit this far above the floor line (behind the counter)
  waveRange: 120,      // RICO waves when the player gets this close
  idkX: 2690,          // centre of the IDK hotspot on the counter top
} as const;

export const INTERIOR = {
  width: 3000,
  groundY: 318,
  spawnX: 90,
  /** Way back out to the street; takes priority over Staff Picks. */
  exitDoor: { x0: 0, x1: 50 },
  layers: [
    { id: 'wall', factor: 0.85 },
    // HACK: shelves sit at 1.0 (spec says the back wall is 0.85) so the shelf you see lines up with its interact zone.
    { id: 'shelves', factor: 1 },
    { id: 'actors', factor: 1 },
    { id: 'foreground', factor: 1.2 },
  ] satisfies LayerDef[],
} as const;

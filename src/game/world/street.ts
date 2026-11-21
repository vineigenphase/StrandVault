// Street (exterior) layout, CLAUDE.md §6.2. Lane GAME. All units are logical px.

export interface LayerDef {
  id: string;
  /** Parallax factor: 0 = fixed to screen, 1 = moves with the world, >1 = foreground. */
  factor: number;
}

export const STREET = {
  width: 1280,
  groundY: 300,                       // feet line
  spawnX: 120,
  storefront: { x0: 900, x1: 1180 },
  door: { x0: 1020, x1: 1080 },
  /** Where you reappear when leaving the store. */
  exitX: 1050,
  layers: [
    { id: 'sky', factor: 0 },
    { id: 'skyline', factor: 0.2 },
    { id: 'palms', factor: 0.5 },
    { id: 'ground', factor: 1 },
    { id: 'actors', factor: 1 },
    { id: 'foreground', factor: 1.3 },
  ] satisfies LayerDef[],
} as const;

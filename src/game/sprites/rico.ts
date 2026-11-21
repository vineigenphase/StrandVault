// RICO the clerk: 24×32, original character (CLAUDE.md §6.4). Lane GAME.
// Pastel suit with big shoulders over a palm-print shirt, aviators, slicked hair, gold chain, toothpick.
//
// Sheet frames: 0–1 idle (toothpick wiggle) · 2–3 wave · 4–7 spin disc on finger · 8–10 toss.
// Front-facing, so no flip needed.
//
// Palette: k outline · s/S skin · h/H hair · g/G lenses · j/J suit · m/M shirt + palms · c chain
//          t toothpick · p trousers · o shoes · d/D/e/n disc (silver, cyan + pink sheen, hole)
import { renderSheet, type FrameSpec, type Palette, type Piece, type PixelMap, type SheetInfo } from './pixel';

export const RICO_W = 24;
export const RICO_H = 32;

const BASE: PixelMap = [
  '........kkkkkkkk........', // 0  hair
  '.......khhhhhhhhk.......',
  '......khhHHhhhhhhk......',
  '......khhhhhhhhhhk......',
  '......kssssssssssk......', // 4  forehead
  '......kggggkkggggk......', // 5  aviators
  '......kgGggssgGggk......',
  '......kssssssssssk......',
  '......kssskkkksssk......', // 8  mouth
  '.......kssssssssk.......',
  '........kssssssk........', // 10 neck
  '....kkkkjjmmmmjjkkkk....', // 11 shoulders
  '...kjJjjjmccccmjjjJjk...',
  '...kjJjjjmmccmmjjjJjk...',
  '...kjJjjjmMmmMmjjjJjk...',
  '...kjJjjjMmmmmMjjjJjk...',
  '...kjJjjjmmMMmmjjjJjk...',
  '...kjJjjjjmmmmjjjjJjk...',
  '...kjJjjjjjkjjjjjjJjk...',
  '...ksSjjjjjjjjjjjjSsk...', // 19 hands
  '....kk..kppppppk..kk....',
  '........kppppppk........', // 21 waist
  '........kppkkppk........',
  '........kppkkppk........',
  '........kppkkppk........',
  '........kppkkppk........',
  '........kppkkppk........',
  '........kppkkppk........',
  '........kppkkppk........',
  '.......kook..kook.......', // 29 shoes
  '.......kkkk..kkkk.......',
  '........................',
];

const TOOTH_A: Piece = { map: ['tttt'], x: 14, y: 8 };
const TOOTH_B: Piece[] = [{ map: ['tt'], x: 14, y: 8 }, { map: ['ttt'], x: 16, y: 7 }];

/** Remove the hanging right arm (viewer's right) and close the body outline. */
const ERASE_R: Piece = { map: ['kxx', 'kxx', 'kxx', 'kxx', 'kxx', 'kxx', 'kxx', '.xx'], x: 18, y: 13 };
/** Remove the hanging left arm (viewer's left). */
const ERASE_L: Piece = { map: ['xxk', 'xxk', 'xxk', 'xxk', 'xxk', 'xxk', 'xxk', '.xx'], x: 3, y: 13 };

const ARM_UP: PixelMap = [
  '.kk.',
  'kssk',
  'kssk',
  'kssk',
  '.kk.',
  'kjjk',
  'kjJk',
  'kjJk',
  'kjJk',
  'kjJk',
  'kjJk',
  'kjjk',
];
const ARM_UP_R: Piece = { map: ARM_UP, x: 18, y: 1 };
const ARM_TILT_R: Piece[] = [
  { map: ARM_UP.slice(0, 7), x: 20, y: 1 },
  { map: ['kjJk', 'kjJk'], x: 19, y: 8 },
  { map: ARM_UP.slice(9), x: 18, y: 10 },
];
/** Shorter raised arm for the toss wind-up, leaving room for the disc above the hand. */
const ARM_UP_SHORT_R: Piece = { map: [...ARM_UP.slice(0, 5), ...ARM_UP.slice(8)], x: 18, y: 4 };

/** Left arm raised with one finger up; the disc spins on top. */
const SPIN_ARM_L: Piece[] = [
  { map: ['ss'], x: 3, y: 4 },
  { map: ['kssk', 'kssk', 'kjjk', 'kjJk', 'kjJk', 'kjJk', 'kjJk', 'kjjk'], x: 2, y: 5 },
];

function disc(phase: number): PixelMap {
  // Sheen sweeps around the rim: D (cyan) and e (pink) on opposite sides.
  const inner = ['d', 'd', 'n', 'n', 'd', 'd'];
  const pos: [number, number][] = [[0, 5], [1, 4], [4, 1], [5, 0]];
  const [a, b] = pos[phase % 4];
  inner[a] = 'D';
  inner[b] = 'e';
  return ['.kkkkkk.', `k${inner.join('')}k`, '.kkkkkk.'];
}

export const RICO_MAPS = { BASE, ARM_UP, disc: [0, 1, 2, 3].map(disc) };

const FRAMES: FrameSpec[] = [
  // idle ×2
  [{ map: BASE }, TOOTH_A],
  [{ map: BASE }, ...TOOTH_B],
  // wave ×2
  [{ map: BASE }, TOOTH_A, ERASE_R, ARM_UP_R],
  [{ map: BASE }, TOOTH_A, ERASE_R, ...ARM_TILT_R],
  // spin disc ×4
  ...[0, 1, 2, 3].map((i): FrameSpec => [{ map: BASE }, i % 2 ? TOOTH_B[0] : TOOTH_A, ...(i % 2 ? [TOOTH_B[1]] : []), ERASE_L, ...SPIN_ARM_L, { map: disc(i), x: 0, y: 1 }]),
  // toss ×3: disc at the hip, wind up overhead, release
  [{ map: BASE }, TOOTH_A, { map: disc(0), x: 16, y: 18 }],
  [{ map: BASE }, TOOTH_A, ERASE_R, ARM_UP_SHORT_R, { map: disc(2), x: 16, y: 1 }],
  [{ map: BASE }, ...TOOTH_B, ERASE_R, ...ARM_TILT_R],
];

const PALETTE: Palette = {
  k: '#0B0620',
  s: '#C68642', S: '#9E6A34',
  h: '#120A05', H: '#4A3A6B',
  g: '#0B0620', G: '#00E5FF',
  j: '#A8F0DC', J: '#6CC7B0',       // mint pastel suit
  m: '#FF8A3D', M: '#1DE9B6',       // sunset shirt with palm-green print
  c: '#FFD300',
  t: '#F4E8C1',
  p: '#A8F0DC',
  o: '#F4E8C1',
  d: '#D8D4F0', D: '#00E5FF', e: '#FF2E88', n: '#0B0620',
};

export interface RicoSheet extends SheetInfo {
  frameW: 24;
  frameH: 32;
  frames: 11;
  idle: readonly [0, 1];
  wave: readonly [2, 3];
  spin: readonly [4, 5, 6, 7];
  toss: readonly [8, 9, 10];
}

let cached: RicoSheet | null = null;

/** RICO's sprite sheet (cached). url is '' during SSR. */
export function ricoSheet(): RicoSheet {
  if (cached) return cached;
  const url = renderSheet(FRAMES, RICO_W, RICO_H, PALETTE)?.toDataURL('image/png') ?? '';
  const sheet: RicoSheet = { url, frameW: 24, frameH: 32, frames: 11, idle: [0, 1], wave: [2, 3], spin: [4, 5, 6, 7], toss: [8, 9, 10] };
  if (url) cached = sheet;
  return sheet;
}

/** Suggested playback rates (frames per second). */
export const RICO_FPS = { idle: 2, wave: 4, spin: 10, toss: 8 } as const;

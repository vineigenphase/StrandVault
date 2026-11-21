// Player characters: 16×24, original art (CLAUDE.md §6.4). Lane GAME.
//
// Layers (back → front): legs/shoes, torso + jacket + hands, head, hair, shades.
// Sheet frames: 0–1 idle (1px breathing bob, 2 fps) · 2–5 walk (8 fps). Drawn facing right;
// flip with scaleX(-1) for left.
//
// Palette keys: k outline · s/S skin · h/H hair · j/J jacket · t shirt · p/P trousers · o shoes · g/G shades · e eye
import type { Look } from '@/lib/types';
import { cropDataUrl, renderSheet, shade, swapChars, type FrameSpec, type Palette, type Piece, type PixelMap, type SheetInfo } from './pixel';

export const CHAR_W = 16;
export const CHAR_H = 24;

export const HAIR_STYLES: Look['hair'][] = ['flat', 'mullet', 'curls', 'buzz', 'long'];

/** Presets for the join LookPicker (U4). Any #RRGGBB works. */
export const LOOK_OPTIONS = {
  jackets: ['#FF2E88', '#00E5FF', '#FFD300', '#1DE9B6', '#B388FF', '#FF8A3D', '#C6FF00', '#F4E8C1'],
  hairColors: ['#120A05', '#3B1F0E', '#7A4A1E', '#D9A441', '#F4E8C1', '#FF2E88', '#00E5FF', '#B388FF'],
  skins: ['#FFDBAC', '#F1C27D', '#E0AC69', '#C68642', '#A86B3C', '#8D5524', '#5C3A1E'],
} as const;

// ── Maps (all rows 16 chars wide; rows are y from the top of the frame) ──

const HEAD: PixelMap = [
  '................',
  '....kkkkkkk.....',
  '...ksssssssk....',
  '...ksssssssk....',
  '...ksssssesk....',
  '...kssssssssk...',
  '...ksssssssk....',
  '....kSsssskk....',
  '.....kkssk......',
  '......kssk......',
];

const HAIR: Record<Look['hair'], PixelMap> = {
  flat: [
    '...kkkkkkkkk....',
    '...khhhhhhhhk...',
    '...khHHhhhhhk...',
    '...khh..........',
    '...khh..........',
    '...kh...........',
  ],
  buzz: [
    '................',
    '....khhhhhk.....',
    '...khHhhhhhk....',
    '...kh...........',
  ],
  mullet: [
    '....kkkkkkk.....',
    '...khhhhhhhk....',
    '..khHhhhhhhhk...',
    '..khhh..........',
    '..khhh..........',
    '..khh...........',
    '..khh...........',
    '..khh...........',
    '..khh...........',
    '...kh...........',
    '...kk...........',
  ],
  curls: [
    '...khkhkhkhk....',
    '..khhhhhhhhhk...',
    '.khhHhhHhhhhhk..',
    '.khhhh.....hhk..',
    '.khhh.......hk..',
    '..khh...........',
    '..kh............',
  ],
  long: [
    '....kkkkkkk.....',
    '...khhhhhhhk....',
    '..khHhhhhhhhk...',
    '..khhhhh........',
    '..khhh..........',
    '..khhh..........',
    '..khhh..........',
    '..khhh..........',
    '..khhh..........',
    '..khhh..........',
    '..khhh..........',
    '..khhk..........',
    '...kk...........',
  ],
};

const SHADES: PixelMap = [
  '....kkkkgGgk....',
  '........ggk.....',
];

/** Torso rows 10–16. Last row = hands. */
const TORSO_BODY: PixelMap = [
  '....kjjttjjk....',
  '...kjjjttjjjk...',
  '...kjJjttjJjk...',
  '...kjJjjtjJjk...',
  '...kjJjjjjJjk...',
  '...kjJjjjjJjk...',
];
const HANDS_SIDE: PixelMap = ['...kssk..kssk...'];
const HANDS_SWING: PixelMap = ['..kssk....kssk..'];

/** Legs rows 16–23. */
const LEGS_IDLE: PixelMap = [
  '.....kppppk.....',
  '.....kppPpk.....',
  '.....kppPpk.....',
  '.....kppPpk.....',
  '.....kppPpk.....',
  '.....kppPpk.....',
  '.....kooooook...',
  '.....kkkkkkkk...',
];
const LEGS_CONTACT: PixelMap = [
  '.....kppppk.....',
  '....kppkpppk....',
  '....kppkkppk....',
  '...kppk..kppk...',
  '...kPPk..kppk...',
  '..kppk....kppk..',
  '..kook....koook.',
  '..kkkk....kkkkk.',
];
const LEGS_PASSING: PixelMap = [
  '.....kppppk.....',
  '.....kppppk.....',
  '.....kppPpk.....',
  '....kppkppk.....',
  '...kook.kppk....',
  '...kkk..kppk....',
  '........kooook..',
  '........kkkkkk..',
];
const OTHER_LEG = { p: 'P', P: 'p' };

export const CHAR_MAPS = { HEAD, HAIR, SHADES, TORSO_BODY, HANDS_SIDE, HANDS_SWING, LEGS_IDLE, LEGS_CONTACT, LEGS_PASSING };

// ── Composition ──

const FRAME_DEFS: { legs: PixelMap; hands: PixelMap; bob: number }[] = [
  { legs: LEGS_IDLE, hands: HANDS_SIDE, bob: 0 },                                // idle 0
  { legs: LEGS_IDLE, hands: HANDS_SIDE, bob: 1 },                                // idle 1 (breathe)
  { legs: LEGS_CONTACT, hands: HANDS_SWING, bob: 0 },                            // walk 0
  { legs: LEGS_PASSING, hands: HANDS_SIDE, bob: -1 },                            // walk 1
  { legs: swapChars(LEGS_CONTACT, OTHER_LEG), hands: HANDS_SWING, bob: 0 },      // walk 2
  { legs: swapChars(LEGS_PASSING, OTHER_LEG), hands: HANDS_SIDE, bob: -1 },      // walk 3
];

function headPieces(look: Look, bob: number): Piece[] {
  const pieces: Piece[] = [{ map: HEAD, y: bob }, { map: HAIR[look.hair] ?? HAIR.flat, y: bob }];
  if (look.shades) pieces.push({ map: SHADES, y: 4 + bob });
  return pieces;
}

function frames(look: Look): FrameSpec[] {
  return FRAME_DEFS.map(({ legs, hands, bob }) => [
    { map: legs, y: 16 },
    { map: TORSO_BODY, y: 10 + bob },
    { map: hands, y: 16 + bob },
    ...headPieces(look, bob),
  ]);
}

function palette(look: Look): Palette {
  return {
    k: '#0B0620',
    s: look.skin, S: shade(look.skin, -0.18),
    e: '#0B0620',
    h: look.hairColor, H: shade(look.hairColor, 0.3),
    j: look.jacket, J: shade(look.jacket, -0.32),
    t: '#F4E8C1',
    p: '#26306B', P: '#1A1F4A',
    o: '#F4E8C1',
    g: '#0B0620', G: '#00E5FF',
  };
}

// ── Public API ──

export interface CharacterSheet extends SheetInfo {
  frameW: 16;
  frameH: 24;
  frames: 6;
  idle: readonly [0, 1];
  walk: readonly [2, 3, 4, 5];
}

export const lookHash = (l: Look) => `${l.jacket}|${l.hair}|${l.hairColor}|${l.skin}|${l.shades ? 1 : 0}`.toLowerCase();

const sheets = new Map<string, CharacterSheet>();
const heads = new Map<string, string>();
const canvases = new Map<string, HTMLCanvasElement | null>();

function canvasFor(look: Look): HTMLCanvasElement | null {
  const key = lookHash(look);
  if (!canvases.has(key)) canvases.set(key, renderSheet(frames(look), CHAR_W, CHAR_H, palette(look)));
  return canvases.get(key) ?? null;
}

/** Sprite sheet for a look, cached by look hash. url is '' during SSR. */
export function sheetFor(look: Look): CharacterSheet {
  const key = lookHash(look);
  let s = sheets.get(key);
  if (!s) {
    const url = canvasFor(look)?.toDataURL('image/png') ?? '';
    s = { url, frameW: 16, frameH: 24, frames: 6, idle: [0, 1], walk: [2, 3, 4, 5] };
    if (url) sheets.set(key, s);
  }
  return s;
}

/** 12×12 head (hair + face + shades) for the HUD strip, Staff Picks tags and FriendsWhoLove. */
export function miniHead(look: Look): string {
  const key = lookHash(look);
  let url = heads.get(key);
  if (!url) {
    url = cropDataUrl(canvasFor(look), 2, 0, 12, 12);
    if (url) heads.set(key, url);
  }
  return url;
}

export const IDLE_FPS = 2;
export const WALK_FPS = 8;

// Procedural pixel-art core (CLAUDE.md §6.4). Lane GAME.
//
// Art is ASCII: one char per pixel, looked up in a palette. Pieces are stamped onto frames,
// frames are laid out left→right in one sheet, and the sheet becomes a PNG data URL.
//   '.' or ' ' = leave as is (transparent)     'x' = erase (punch a transparent hole)
import type { CSSProperties } from 'react';

export type PixelMap = readonly string[];
export type Palette = Readonly<Record<string, string>>;
/** A map stamped at (x, y) inside a frame. Pixels outside the frame are clipped. */
export interface Piece { map: PixelMap; x?: number; y?: number }
export type FrameSpec = readonly Piece[];

type RGBA = readonly [number, number, number, number];

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = /^[0-9a-f]{6}$/i.test(h) ? parseInt(h, 16) : 0xff2e88; // bad input → neon pink
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/** amt < 0 darkens toward black, amt > 0 lightens toward white (−1..1). */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  const t = amt < 0 ? 0 : 255;
  const k = Math.abs(amt);
  return toHex(r + (t - r) * k, g + (t - g) * k, b + (t - b) * k);
}

/** Flip a map horizontally (for mirrored poses). */
export const flipX = (map: PixelMap): PixelMap => map.map((row) => [...row].reverse().join(''));

/** Swap characters in a map, e.g. swapChars(legs, { p: 'P', P: 'p' }). */
export const swapChars = (map: PixelMap, swap: Record<string, string>): PixelMap =>
  map.map((row) => [...row].map((c) => swap[c] ?? c).join(''));

/** Render frames into a horizontal sheet. Returns null outside the browser. */
export function renderSheet(frames: readonly FrameSpec[], w: number, h: number, palette: Palette): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w * frames.length;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(canvas.width, h);
  const data = img.data;
  const stride = canvas.width * 4;

  const colours = new Map<string, RGBA>();
  for (const [ch, hex] of Object.entries(palette)) colours.set(ch, [...hexToRgb(hex), 255] as const);

  frames.forEach((pieces, f) => {
    const ox = f * w;
    for (const { map, x = 0, y = 0 } of pieces) {
      for (let r = 0; r < map.length; r++) {
        const py = y + r;
        if (py < 0 || py >= h) continue;
        const row = map[r];
        for (let c = 0; c < row.length; c++) {
          const ch = row[c];
          if (ch === '.' || ch === ' ') continue;
          const px = x + c;
          if (px < 0 || px >= w) continue;
          const i = py * stride + (ox + px) * 4;
          if (ch === 'x') {
            data[i + 3] = 0;
            continue;
          }
          const col = colours.get(ch);
          if (!col) continue;
          data[i] = col[0];
          data[i + 1] = col[1];
          data[i + 2] = col[2];
          data[i + 3] = col[3];
        }
      }
    }
  });
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export function sheetDataUrl(frames: readonly FrameSpec[], w: number, h: number, palette: Palette): string {
  return renderSheet(frames, w, h, palette)?.toDataURL('image/png') ?? '';
}

/** Copy a w×h region out of a rendered sheet (e.g. a head crop for the HUD strip). */
export function cropDataUrl(src: HTMLCanvasElement | null, sx: number, sy: number, w: number, h: number): string {
  if (!src) return '';
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  c.getContext('2d')?.drawImage(src, sx, sy, w, h, 0, 0, w, h);
  return c.toDataURL('image/png');
}

// ── Sprite-sheet animation via CSS steps() ──────────────────────────────────────────────
// Put SHEET_KEYFRAMES in a <style> once, then spread sheetAnim(...) onto a div.

export const SHEET_KEYFRAMES =
  '@keyframes sv-sheet{from{background-position-x:var(--sv-from)}to{background-position-x:var(--sv-to)}}';

export interface SheetInfo { url: string; frameW: number; frameH: number; frames: number }

/**
 * Inline style that plays `frames` (consecutive indices) of a sheet at `fps`.
 * `scale` = CSS px per sprite px (1 inside the 640×360 stage, which is already scaled).
 */
export function sheetAnim(sheet: SheetInfo, frames: readonly number[], fps: number, scale = 1): CSSProperties {
  const start = frames[0] ?? 0;
  const n = Math.max(1, frames.length);
  const fw = sheet.frameW * scale;
  return {
    width: fw,
    height: sheet.frameH * scale,
    backgroundImage: sheet.url ? `url(${sheet.url})` : undefined,
    backgroundRepeat: 'no-repeat',
    backgroundSize: `${sheet.frames * fw}px ${sheet.frameH * scale}px`,
    backgroundPositionX: -start * fw,
    imageRendering: 'pixelated',
    ['--sv-from' as string]: `${-start * fw}px`,
    ['--sv-to' as string]: `${-(start + n) * fw}px`,
    animation: n > 1 ? `sv-sheet ${n / fps}s steps(${n}) infinite` : undefined,
  };
}

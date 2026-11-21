// Camera: follow with look-ahead, clamp, push-in/zoom tweens (CLAUDE.md §6.3, §7.1). Lane GAME.

export const VIEW_W = 640;
export const VIEW_H = 360;
const LERP = 0.08;        // per 60fps frame
const LOOK_AHEAD = 60;

interface Tween {
  fromZoom: number; toZoom: number;
  fromBlur: number; toBlur: number;
  start: number; dur: number;
  resolve(): void;
}

// Close to --ease-out (cubic-bezier(.16,1,.3,1)).
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);

export function createCamera(worldW: number) {
  let tween: Tween | null = null;

  const cam = {
    x: 0,
    worldW,
    zoom: 1,
    blur: 0,
    /** Zoom origin in world px (x) and stage px (y). */
    originX: 0,
    originY: VIEW_H * 0.55,

    clampX(x: number) {
      return Math.max(0, Math.min(cam.worldW - VIEW_W, x));
    },

    /** Frame-rate independent version of x = lerp(x, px - 320 + dir*60, 0.08). */
    follow(px: number, dir: number, dt: number) {
      const target = cam.clampX(px - VIEW_W / 2 + dir * LOOK_AHEAD);
      const k = 1 - Math.pow(1 - LERP, dt * 60);
      cam.x += (target - cam.x) * k;
    },

    snap(px: number, dir = 1) {
      cam.x = cam.clampX(px - VIEW_W / 2 + dir * LOOK_AHEAD);
    },

    setWorld(w: number) {
      cam.worldW = w;
      cam.x = cam.clampX(cam.x);
    },

    /** Tween zoom + blur toward a world-x origin. Resolves when finished. */
    zoomTo(zoom: number, blur: number, originX: number, ms: number): Promise<void> {
      tween?.resolve();
      cam.originX = originX;
      if (ms <= 0) {
        cam.zoom = zoom;
        cam.blur = blur;
        tween = null;
        return Promise.resolve();
      }
      return new Promise((resolve) => {
        tween = { fromZoom: cam.zoom, toZoom: zoom, fromBlur: cam.blur, toBlur: blur, start: performance.now(), dur: ms, resolve };
      });
    },

    update(now: number) {
      if (!tween) return;
      const t = Math.min(1, (now - tween.start) / tween.dur);
      const e = easeOut(t);
      cam.zoom = tween.fromZoom + (tween.toZoom - tween.fromZoom) * e;
      cam.blur = tween.fromBlur + (tween.toBlur - tween.fromBlur) * e;
      if (t >= 1) {
        const done = tween.resolve;
        tween = null;
        done();
      }
    },
  };
  return cam;
}

export type Camera = ReturnType<typeof createCamera>;

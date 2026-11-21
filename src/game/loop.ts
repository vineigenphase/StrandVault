// The one requestAnimationFrame loop (CLAUDE.md §1.7, §6). Lane GAME.
// step() reads input, runs physics + camera, and writes transforms straight onto DOM refs.
// Never set React state from inside step().

export type Step = (dt: number, now: number) => void;

export function createLoop(step: Step) {
  let raf = 0;
  let last = 0;
  let running = false;

  const frame = (now: number) => {
    if (!running) return;
    // Clamp dt so a backgrounded tab doesn't teleport the player.
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    step(dt, now);
    raf = requestAnimationFrame(frame);
  };

  return {
    start() {
      if (running) return;
      running = true;
      last = 0;
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
  };
}

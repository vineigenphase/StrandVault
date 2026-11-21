// Keyboard + touch input (CLAUDE.md §6.6). Lane GAME.
//
// Desktop: ←/→ or A/D move · ↑ W E Enter interact · Esc Backspace back · R RICO
// Touch:   on-screen controls call input.setVirtual('left'|'right', down) and input.press('interact'|'back'|'rico');
//          tap-to-walk sets input.tapTarget (world x).
//
// `input` is a module singleton so TouchControls (G5) can drive it without prop drilling.
// It holds state only; call input.attach() in an effect to bind window listeners.

export type Pulse = 'interact' | 'back' | 'rico';

const KEYMAP: Record<string, 'left' | 'right' | Pulse> = {
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
  ArrowUp: 'interact', w: 'interact', W: 'interact', e: 'interact', E: 'interact', Enter: 'interact',
  Escape: 'back', Backspace: 'back',
  r: 'rico', R: 'rico',
};

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

class InputState {
  private keys = { left: false, right: false };
  private virtual = { left: false, right: false };
  private pulses = new Set<Pulse>();
  /** World-x the player should walk to (tap-to-walk). Cleared by keyboard movement or on arrival. */
  tapTarget: number | null = null;
  paused = false;

  /** -1 left, 1 right, 0 none. */
  axis(): -1 | 0 | 1 {
    if (this.paused) return 0;
    const l = this.keys.left || this.virtual.left;
    const r = this.keys.right || this.virtual.right;
    return l === r ? 0 : l ? -1 : 1;
  }

  /** Edge-triggered: true once per press. */
  consume(p: Pulse): boolean {
    const had = this.pulses.has(p);
    this.pulses.delete(p);
    return had && !this.paused;
  }

  press(p: Pulse) {
    if (!this.paused) this.pulses.add(p);
  }

  setVirtual(dir: 'left' | 'right', down: boolean) {
    this.virtual[dir] = down;
    if (down) this.tapTarget = null;
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.clear();
  }

  clear() {
    this.keys.left = this.keys.right = false;
    this.virtual.left = this.virtual.right = false;
    this.pulses.clear();
    this.tapTarget = null;
  }

  attach(): () => void {
    const down = (e: KeyboardEvent) => {
      const a = KEYMAP[e.key];
      if (!a || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (this.paused) return; // OverlayRoot owns Esc/Backspace while an overlay is open
      e.preventDefault();
      if (a === 'left' || a === 'right') {
        this.keys[a] = true;
        this.tapTarget = null;
      } else if (!e.repeat) {
        this.pulses.add(a);
      }
    };
    const up = (e: KeyboardEvent) => {
      const a = KEYMAP[e.key];
      if (a === 'left' || a === 'right') this.keys[a] = false;
    };
    const blur = () => this.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      this.clear();
    };
  }
}

export const input = new InputState();
export type Input = InputState;

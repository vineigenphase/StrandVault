// Named motion variants, one per moment in the CLAUDE.md §8 motion catalogue. Lane UI.
// T0 skeleton. TODO(U6): fill these in (and add more as needed). Keep to transform/opacity/filter/clip-path.
import type { Transition, Variants } from 'motion/react';

export const easeOut = [0.16, 1, 0.3, 1] as const;      // --ease-out
export const easeSnap = [0.68, -0.6, 0.32, 1.6] as const; // --ease-snap

export const boot: Variants = {};
export const neonFlicker: Variants = {};
export const spawnGlitch: Variants = {};
export const toast: Variants = {};
export const doorBloom: Variants = {};
export const shelfPushIn: Variants = {};
export const spineHover: Variants = {};
export const discOpen: Variants = {};
export const friendBubble: Variants = {};
export const ricoPanel: Variants = {};
export const ricoToss: Variants = {};
export const nowPlaying: Variants = {};
export const sceneChange: Variants = {};

export const bubbleSpring: Transition = { type: 'spring', stiffness: 500, damping: 22 };

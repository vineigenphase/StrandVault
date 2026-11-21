// "I DON'T KNOW WHAT TO WATCH" arcade button (CLAUDE.md §7.4). Lane UI.
// T0 stub with final props. TODO(U5): domed button, bezel, INSERT COIN, 4px press, click sound.
'use client';

export interface IdkButtonProps {
  onPress(): void;
  /** 'hud' = fixed bottom-right overlay; 'counter' = the physical button on RICO's counter. */
  variant?: 'hud' | 'counter';
}

export default function IdkButton({ onPress, variant = 'hud' }: IdkButtonProps) {
  return (
    <button
      onClick={onPress}
      data-variant={variant}
      className="min-h-11 min-w-11 rounded-full border-4 border-hazard bg-neon-pink px-4 py-3 font-hud text-[10px] leading-tight text-night"
    >
      I DON&apos;T KNOW
      <br />
      WHAT TO WATCH
    </button>
  );
}

// Phone / player view: same game + on-screen controls (CLAUDE.md §6.1, §6.6). Lane GAME.
// TODO(G5): TouchControls (◀ ▶ hold, A, B), tap-to-walk, ?code= store (wrap searchParams readers in <Suspense>).
import OverlayRoot from '@/components/OverlayRoot';
import Game from '@/game/Game';

export default function Play() {
  return (
    <main className="flex flex-1 flex-col">
      <Game scene="street" />
      <div className="flex h-40 items-center justify-center gap-6 bg-night font-hud text-xs text-cream sm:hidden">
        <span>◀ ▶</span>
        <span className="rounded-full border-2 border-neon-pink px-4 py-3">A</span>
        <span className="rounded-full border-2 border-neon-cyan px-4 py-3">B</span>
      </div>
      <OverlayRoot />
    </main>
  );
}

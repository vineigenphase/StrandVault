// Host / projector view (CLAUDE.md §0, §4). Lane GAME.
// TODO(G5): QR "SCAN TO PULL UP" sign, ?npcs=1, realtime presence → OverlayRoot online.
import OverlayRoot from '@/components/OverlayRoot';
import Game from '@/game/Game';

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <Game scene="street" host />
      <OverlayRoot />
    </main>
  );
}

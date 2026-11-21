// CLASSIC: the original side-scrolling DOM game (G1–G4). The main experience is now THE VAULT at /.
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

// Host / projector view: THE VAULT (teammate's canvas UI wired to real data). Lane GAME.
// The original side-scrolling DOM game lives on at /classic.
import VaultGame from '@/vault/VaultGame';

export default function Home() {
  return <VaultGame host />;
}

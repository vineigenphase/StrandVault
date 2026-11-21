// QR landing: name → look → #1 fave → spawn (CLAUDE.md §0 step 2). Lane UI.
// T0 shell. TODO(U4): LookPicker, FavPicker, api.join, localStorage userId, → /play?code=
// Reading ?code= needs a <Suspense> boundary (Cache Components is on).
import Link from 'next/link';

export default function Join() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center" style={{ background: 'var(--sunset-grad)' }}>
      <h1 className="font-neon text-4xl text-neon-pink">PULL UP</h1>
      <p className="font-term text-2xl text-cream">[STUB] NAME → LOOK → #1 FAVE</p>
      <Link href="/play" className="flex min-h-11 items-center border-2 border-cream px-6 font-hud text-xs text-cream">
        ENTER ▶
      </Link>
    </main>
  );
}

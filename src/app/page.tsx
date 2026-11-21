// TODO(GAME): replace with <Game scene="street"/> (CLAUDE.md §4). Placeholder so the deploy is on-brand.
export default function Home() {
  return (
    <main
      className="flex flex-1 flex-col items-center justify-center gap-6 p-6 text-center"
      style={{ background: "var(--sunset-grad)" }}
    >
      <h1 className="font-neon text-5xl sm:text-7xl text-neon-pink">STRANDVAULT</h1>
      <p className="font-term text-2xl text-cream">TRACKING… PLAY ▶</p>
    </main>
  );
}

// Movie page: disc sleeve × streaming detail page (CLAUDE.md §7.3). Lane UI.
// T0 stub with final props. TODO(U3): backdrop, tilt, neon title, WatchButtons, FAVE, RICO strip…
'use client';

/* eslint-disable @next/next/no-img-element -- posters may be data URLs / local files */
import { sortProviders, watchUrl } from '@/lib/links';
import type { Film, Friend, OpenSource } from '@/lib/types';

export interface MoviePageProps {
  film: Film;
  source: OpenSource;
  /** RICO's line, when source === 'rico'. */
  ricoLine?: string;
  /** Friends in the store (filter to those who fave this film). */
  friends: Friend[];
  onClose(): void;
}

export default function MoviePage({ film, source, ricoLine, friends, onClose }: MoviePageProps) {
  const lovers = friends.filter((f) => f.favourites.includes(film.id));
  return (
    <div className="absolute inset-0 overflow-y-auto bg-night p-6 text-cream">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <span className="font-hud text-xs text-neon-cyan">[STUB] MOVIE PAGE · {source.toUpperCase()}</span>
          <button className="min-h-11 min-w-11 font-hud text-xs" onClick={onClose}>✕ CLOSE</button>
        </div>
        {source === 'rico' && ricoLine && <p className="font-term text-2xl text-hazard">RICO&apos;S PICK: {ricoLine}</p>}
        <div className="flex gap-4">
          <img src={film.poster} alt="" className="h-48 w-32 shrink-0 object-cover" />
          <div className="flex flex-col gap-2">
            <h1 className="font-neon text-3xl text-neon-pink">{film.title}</h1>
            <p className="font-term text-xl">{film.year} · {film.runtime} MIN · ★ {film.rating.toFixed(1)}</p>
            <p className="font-body text-sm">{film.overview}</p>
            {lovers.length > 0 && <p className="font-hud text-[10px] text-palm">♥ {lovers.map((l) => l.name).join(', ')}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {sortProviders(film.providers).map((p) => (
            <a
              key={`${p.id}:${p.kind}`}
              href={watchUrl(film, p)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-11 items-center border-2 border-neon-cyan px-4 font-hud text-xs text-neon-cyan"
            >
              PLAY ▶ ON {p.name.toUpperCase()}
            </a>
          ))}
        </div>
        <p className="font-body text-xs opacity-60">Film data from TMDB · Streaming availability by JustWatch.</p>
      </div>
    </div>
  );
}

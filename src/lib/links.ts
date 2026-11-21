// Watch + trailer links (BACKEND.md §4.4). Lane BE.
import type { Film, Provider, ProviderId } from './types';

const SEARCH: Partial<Record<ProviderId, string>> = {
  netflix: 'https://www.netflix.com/search?q=',
  prime: 'https://www.amazon.co.uk/s?i=instant-video&k=',
  disney: 'https://www.disneyplus.com/search?q=',
  apple: 'https://tv.apple.com/search?term=',
  now: 'https://www.nowtv.com/search?q=',
  iplayer: 'https://www.bbc.co.uk/iplayer/search?q=',
  channel4: 'https://www.channel4.com/search?q=',
  paramount: 'https://www.paramountplus.com/search/?q=',
};

export const tmdbWatchUrl = (film: Pick<Film, 'id'>) =>
  `https://www.themoviedb.org/movie/${film.id}/watch?locale=GB`;

/** Deep link → provider search → TMDB watch page. */
export function watchUrl(film: Pick<Film, 'id' | 'title'>, provider: Provider): string {
  if (provider.url && /^https?:\/\//.test(provider.url)) return provider.url;
  const base = SEARCH[provider.id];
  if (base) return base + encodeURIComponent(film.title);
  return tmdbWatchUrl(film);
}

const KIND_ORDER: Record<Provider['kind'], number> = { stream: 0, free: 1, rent: 2, buy: 3 };
const PROVIDER_ORDER: ProviderId[] = ['netflix', 'prime', 'disney'];
const pRank = (id: ProviderId) => {
  const i = PROVIDER_ORDER.indexOf(id);
  return i === -1 ? PROVIDER_ORDER.length : i;
};

/** stream, free, rent, buy; then Netflix, Prime, Disney+ first. Dedupes by id+kind. */
export function sortProviders(providers: Provider[]): Provider[] {
  const seen = new Set<string>();
  return providers
    .filter((p) => {
      const k = `${p.id}:${p.kind}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || pRank(a.id) - pRank(b.id));
}

export function trailerUrl(film: Pick<Film, 'trailerKey'>): string | null {
  return film.trailerKey ? `https://www.youtube.com/watch?v=${film.trailerKey}` : null;
}

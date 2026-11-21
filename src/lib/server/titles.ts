// Title mapping + persistence. Shared by scripts/build-db.ts and the /api/search + /api/title routes.
// No 'server-only' import so tsx scripts can use it. Never import from client components.
/* eslint-disable @typescript-eslint/no-explicit-any -- raw TMDB JSON is loosely shaped; mapDetail() is the typed boundary */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getServiceClient } from './db';
import type { Aisle, Film, Provider, ProviderId } from '../types';
import { IMG, getDetail, type Media, type TmdbClient } from './tmdb';

export type { Media };

export const toAppId = (media: Media, tmdbId: number) => (media === 'tv' ? -tmdbId : tmdbId);
export const fromAppId = (appId: number): { media: Media; tmdbId: number } =>
  appId < 0 ? { media: 'tv', tmdbId: -appId } : { media: 'movie', tmdbId: appId };

export interface TitleRow {
  app_id: number; tmdb_id: number; media_type: Media; imdb_id: string | null;
  title: string; original_title: string | null; year: number | null;
  overview: string | null; tagline: string | null; genres: number[]; aisle: Aisle;
  runtime: number | null; seasons: number | null; episodes: number | null; certification: string | null;
  rating: number | null; votes: number | null; popularity: number | null; trending: boolean;
  poster: string | null; backdrop: string | null; cast_names: string[]; cast_text?: string;
  director: string | null; trailer_key: string | null; providers: Provider[]; tmdb_watch_link: string | null;
}

// TV genre ids → movie genre ids so aisles + recs treat films and shows the same.
const TV_TO_MOVIE: Record<number, number[]> = { 10759: [28, 12], 10765: [878, 14], 10768: [10752] };
export function normaliseGenres(ids: number[]): number[] {
  const out = new Set<number>();
  for (const id of ids) (TV_TO_MOVIE[id] ?? [id]).forEach((g) => out.add(g));
  return [...out];
}

export function pickAisle(genres: number[], year: number | null): Aisle {
  const g = new Set(genres);
  if (g.has(16)) return 'animated';
  if (year && year >= 1980 && year <= 1989) return 'cult';
  if (g.has(27)) return 'horror';
  if (g.has(878)) return 'scifi';
  if (g.has(35)) return 'comedy';
  if (g.has(10749)) return 'romance';
  if (g.has(28) || g.has(12) || g.has(53) || g.has(10752) || g.has(37)) return 'action';
  return 'drama';
}

export function mapProvider(name: string): ProviderId {
  const n = name.toLowerCase();
  if (n.includes('netflix')) return 'netflix';
  if (n.includes('amazon') || n.includes('prime')) return 'prime';
  if (n.includes('disney')) return 'disney';
  if (n.includes('apple')) return 'apple';
  if (n === 'now' || n.includes('now tv') || n.startsWith('now ')) return 'now';
  if (n.includes('iplayer') || n.includes('bbc')) return 'iplayer';
  if (n.includes('channel 4') || n.includes('channel4')) return 'channel4';
  if (n.includes('paramount')) return 'paramount';
  return 'other';
}

function providersFrom(wp: any): { providers: Provider[]; link: string | null } {
  if (!wp) return { providers: [], link: null };
  const out: Provider[] = [];
  const seen = new Set<string>();
  const add = (arr: any[] | undefined, kind: Provider['kind']) =>
    (arr ?? []).forEach((p: any) => {
      if (!p?.provider_name || seen.has(p.provider_name)) return;
      seen.add(p.provider_name);
      out.push({
        id: mapProvider(p.provider_name),
        name: p.provider_name,
        url: '', // filled by Watchmode (optional); otherwise links.ts falls back to provider search URLs
        kind,
        logo: p.logo_path ? `${IMG}/w92${p.logo_path}` : undefined,
      });
    });
  add(wp.flatrate, 'stream');
  add(wp.free, 'free');
  add(wp.ads, 'free');
  add(wp.rent, 'rent');
  add(wp.buy, 'buy');
  return { providers: out, link: wp.link ?? null };
}

export function mapDetail(media: Media, d: any, region = 'GB', trending = false): TitleRow {
  const isTv = media === 'tv';
  const date: string | undefined = isTv ? d.first_air_date : d.release_date;
  const year = date ? Number(date.slice(0, 4)) || null : null;
  const genres = normaliseGenres((d.genres ?? []).map((g: any) => g.id));
  const credits = isTv ? d.aggregate_credits : d.credits;
  const cast: string[] = (credits?.cast ?? []).slice(0, 8).map((c: any) => c.name).filter(Boolean);
  const director: string | null = isTv
    ? (d.created_by ?? []).map((c: any) => c.name).join(', ') || null
    : (d.credits?.crew ?? []).find((c: any) => c.job === 'Director')?.name ?? null;
  const vids: any[] = d.videos?.results ?? [];
  const yt = vids.filter((v) => v.site === 'YouTube');
  const trailer = yt.find((v) => v.type === 'Trailer' && v.official) ?? yt.find((v) => v.type === 'Trailer') ?? yt[0];
  const runtime: number | null = isTv
    ? d.episode_run_time?.[0] ?? d.last_episode_to_air?.runtime ?? null
    : d.runtime || null;
  const certification: string | null = isTv
    ? (d.content_ratings?.results ?? []).find((r: any) => r.iso_3166_1 === region)?.rating || null
    : ((d.release_dates?.results ?? []).find((r: any) => r.iso_3166_1 === region)?.release_dates ?? [])
        .map((x: any) => x.certification)
        .find((c: string) => !!c) || null;
  const { providers, link } = providersFrom(d['watch/providers']?.results?.[region]);

  return {
    app_id: toAppId(media, d.id),
    tmdb_id: d.id,
    media_type: media,
    imdb_id: (isTv ? d.external_ids?.imdb_id : d.imdb_id ?? d.external_ids?.imdb_id) || null,
    title: (isTv ? d.name : d.title) || d.original_name || d.original_title || 'Untitled',
    original_title: (isTv ? d.original_name : d.original_title) || null,
    year,
    overview: d.overview || null,
    tagline: d.tagline || null,
    genres,
    aisle: pickAisle(genres, year),
    runtime,
    seasons: isTv ? d.number_of_seasons ?? null : null,
    episodes: isTv ? d.number_of_episodes ?? null : null,
    certification,
    rating: typeof d.vote_average === 'number' ? Math.round(d.vote_average * 10) / 10 : null,
    votes: d.vote_count ?? null,
    popularity: d.popularity ?? null,
    trending,
    poster: d.poster_path ? `${IMG}/w342${d.poster_path}` : null,
    backdrop: d.backdrop_path ? `${IMG}/w1280${d.backdrop_path}` : null,
    cast_names: cast,
    cast_text: cast.join(' '),
    director,
    trailer_key: trailer?.key ?? null,
    providers,
    tmdb_watch_link: link,
  };
}

/** Row → the Film shape every UI component already uses. */
export function rowToFilm(r: TitleRow): Film {
  return {
    id: r.app_id,
    title: r.title,
    year: r.year ?? 0,
    runtime: r.runtime ?? 0,
    overview: r.overview ?? '',
    tagline: r.tagline ?? undefined,
    poster: r.poster ?? '',
    backdrop: r.backdrop ?? undefined,
    genres: r.genres ?? [],
    aisle: r.aisle,
    rating: r.rating ?? 0,
    votes: r.votes ?? 0,
    trending: !!r.trending,
    cast: r.cast_names ?? [],
    director: r.director ?? undefined,
    trailerKey: r.trailer_key ?? undefined,
    providers: r.providers ?? [],
    mediaType: r.media_type,
    imdbId: r.imdb_id ?? undefined,
    seasons: r.seasons ?? undefined,
    episodes: r.episodes ?? undefined,
    certification: r.certification ?? undefined,
    tmdbWatchLink: r.tmdb_watch_link ?? undefined,
  };
}

export async function fetchTitleRow(tmdb: TmdbClient, media: Media, tmdbId: number, region = 'GB', signal?: AbortSignal) {
  return mapDetail(media, await getDetail(tmdb, media, tmdbId, signal), region);
}

export async function upsertRows(db: SupabaseClient, rows: TitleRow[], batch = 500) {
  for (let i = 0; i < rows.length; i += batch) {
    const chunk = rows.slice(i, i + batch).map((r) => ({ ...r, cast_text: r.cast_names.join(' '), updated_at: new Date().toISOString() }));
    const { error } = await db.from('titles').upsert(chunk, { onConflict: 'app_id' });
    if (error) throw new Error(`titles upsert failed at ${i}: ${error.message}`);
  }
}

export async function getRow(db: SupabaseClient, appId: number): Promise<TitleRow | null> {
  const { data, error } = await db.from('titles').select('*').eq('app_id', appId).maybeSingle();
  if (error) throw error;
  return (data as TitleRow) ?? null;
}

/** Fire-and-forget: store rows in the vault for next time. Never throws (no DB env → skip). */
export function cacheRows(rows: TitleRow[]) {
  try {
    upsertRows(getServiceClient(), rows).catch(() => {});
  } catch {
    /* Supabase not configured */
  }
}

// The Must-Watches pinboard: hand-picked 2026 releases (TMDB ids + UK cinema dates from TMDB, checked
// 21 Nov 2026). Opening one fetches full details from THE VAULT (/api/title), so this only needs the basics.
import type { VaultMovie } from './engine';

const IMG = 'https://image.tmdb.org/t/p';

interface Pin { id: number; t: string; date: string; d: string; g: string[]; poster: string; backdrop: string; c: [string, string, string] }

const PINS: Pin[] = [
  { id: 1003596, t: 'Avengers: Doomsday', date: '2026-12-16', d: 'Anthony & Joe Russo', g: ['Action', 'Sci-Fi'], poster: '/zHTxblqPcqRpA93ex2Hj0RdpVBs.jpg', backdrop: '/rObL4of4eFA8yWaN9pRFo9aOVNi.jpg', c: ['#030a06', '#2aff7a', '#9a6aff'] },
  { id: 1170608, t: 'Dune: Part Three', date: '2026-12-18', d: 'Denis Villeneuve', g: ['Sci-Fi', 'Adventure'], poster: '/d43fvHQsIMa4kpyhKXw0haEJIvI.jpg', backdrop: '/i5E9H7Ik0u61ylDDTbmUpTL3Yw.jpg', c: ['#1a0a04', '#e0782a', '#ffd9a0'] },
  { id: 1300926, t: 'The Angry Birds Movie 3', date: '2026-12-23', d: 'John Rice', g: ['Animation', 'Comedy'], poster: '/xyml31x5gu23tOMIFJ43XO4aTD6.jpg', backdrop: '/ieAytQ8YcWEZGQpbBy7vHVddwd.jpg', c: ['#0a3a7a', '#ff3a2a', '#ffd23f'] },
  { id: 1368337, t: 'The Odyssey', date: '2026-07-17', d: 'Christopher Nolan', g: ['Adventure', 'Fantasy'], poster: '/5rhTDKUhPYvpdQIijFIs5VoWsON.jpg', backdrop: '/dZI4Ek4qc2Fib2G1zFkGhKKuc6j.jpg', c: ['#050f1c', '#1f6a8a', '#e8d3a0'] },
  { id: 969681, t: 'Spider-Man: Brand New Day', date: '2026-07-29', d: 'Destin Daniel Cretton', g: ['Action', 'Adventure'], poster: '/bjiS5ipwxb9JFy3XRRN4OAilSeX.jpg', backdrop: '/r08LxMJCbf1SiJIWeyH9aJmdqwC.jpg', c: ['#08081a', '#e8233a', '#3a5aff'] },
  { id: 1400940, t: 'Clayface', date: '2026-10-23', d: 'James Watkins', g: ['Horror', 'Crime'], poster: '/9l1NuFjel2j89hiuiJbsxfblqjy.jpg', backdrop: '/f1TVhqJJdxMvUsUDuKHS0ekgYkk.jpg', c: ['#0c0a06', '#8a6a3a', '#e0c890'] },
  { id: 1300968, t: 'The Hunger Games: Sunrise on the Reaping', date: '2026-11-18', d: 'Francis Lawrence', g: ['Action', 'Adventure'], poster: '/jNcZH8yplxttRlf0wwqfGGMKHxX.jpg', backdrop: '/aqFZcr2dxSZ2UwWSo1WC6C0rwDf.jpg', c: ['#140804', '#ff6a1a', '#ffd23f'] },
];

const fmt = (iso: string) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Board movies (thin until opened) + the line under each card. */
export function mustWatches(today = new Date()): { movies: VaultMovie[]; who: Record<string, string> } {
  const now = today.toISOString().slice(0, 10);
  const movies: VaultMovie[] = [];
  const who: Record<string, string> = {};
  for (const p of PINS) {
    const out = p.date <= now;
    const id = String(p.id);
    movies.push({
      id, t: p.t, y: Number(p.date.slice(0, 4)), rt: null, g: p.g, d: p.d, m: 'stars', c: p.c, sc: 0,
      tags: ['epic'], desc: '', img: `${IMG}/w342${p.poster}`, bd: `${IMG}/w1280${p.backdrop}`, full: false,
      rel: out ? undefined : fmt(p.date),
    });
    who[id] = out ? `Out now · in cinemas since ${fmt(p.date)}` : `In cinemas ${fmt(p.date)}`;
  }
  return { movies, who };
}

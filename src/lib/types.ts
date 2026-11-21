// SHARED · FROZEN after T0 (CLAUDE.md §1.2, §5). Changes need a human OK.

export type ProviderId = 'netflix'|'prime'|'disney'|'apple'|'now'|'iplayer'|'channel4'|'paramount'|'other';
export type Aisle = 'action'|'comedy'|'horror'|'scifi'|'drama'|'romance'|'animated'|'cult';
export type Section = 'staffpicks'|'new'|Aisle|'yourshelf'|'counter';

export interface Provider { id: ProviderId; name: string; url: string; kind: 'stream'|'rent'|'buy'|'free'; logo?: string }
export interface Film {
  id: number; title: string; year: number; runtime: number; overview: string; tagline?: string;
  poster: string; backdrop?: string; genres: number[]; aisle: Aisle;
  rating: number; votes: number; trending: boolean;
  cast: string[]; director?: string; trailerKey?: string;   // YouTube key
  providers: Provider[];                                    // GB
}

export interface Look { jacket: string; hair: 'flat'|'mullet'|'curls'|'buzz'|'long'; hairColor: string; skin: string; shades: boolean }
export interface PresenceState { userId: string; name: string; look: Look; favId: number|null; scene: 'street'|'interior'; isDemo?: boolean }
export interface MoveMsg { userId: string; x: number; dir: 1|-1; moving: boolean; scene: 'street'|'interior'; t: number }

export interface RecItem { filmId: number; score: number; reason: string; friends: string[] }
export interface RicoPick { filmId: number; line: string; reason: string; backups: number[] }

export type OpenSource = 'shelf'|'rico'|'friend'|'staffpicks'|'yourshelf';
export type GameEvent =
  | { type: 'zone'; section: Section | 'door' | null }
  | { type: 'open-library'; section: Section }
  | { type: 'open-film'; filmId: number; source: OpenSource; ricoLine?: string; from?: { x: number; y: number } }
  | { type: 'rico' }
  | { type: 'close' };

export type Broadcast =
  | { kind: 'move'; m: MoveMsg }
  | { kind: 'fav'; userId: string; filmId: number; on: boolean }
  | { kind: 'open'; userId: string; filmId: number }
  | { kind: 'watch'; userId: string; filmId: number; provider: ProviderId }
  | { kind: 'emote'; userId: string; emote: 'wave'|'dance'|'thumbs' };

// ── API wire types (BACKEND.md §5.0) — added in T0, frozen with the rest of this file ──
export type Mood = 'laugh' | 'scare' | 'date' | 'mind';

export interface Friend {                 // a profile in this store, as seen by others
  userId: string; name: string; look: Look; favId: number | null;
  favourites: number[]; isDemo: boolean;
}
export interface StaffPick { filmId: number; userIds: string[] }   // sorted by userIds.length desc

export interface JoinReq  { name: string; look: Look; favId: number | null; code?: string; userId?: string }
export interface JoinRes  { userId: string; presence: PresenceState; offline: boolean }

export interface FavReq   { userId: string; filmId: number; on: boolean; setTop?: boolean }
export interface FavRes   { ok: boolean; favourites: number[]; favId: number | null }

export interface OpenReq  { userId: string; filmId: number; source: OpenSource }
export interface WatchReq { userId: string; filmId: number; provider: ProviderId }
export interface OkRes    { ok: boolean }

export interface RecsRes  { items: RecItem[]; fallback: boolean }

export interface RicoReq  { userId: string | null; mood?: Mood; exclude?: number[] }
export interface RicoRes  extends RicoPick { fallback: boolean }

export interface StoreStateRes { friends: Friend[]; staffPicks: StaffPick[] }

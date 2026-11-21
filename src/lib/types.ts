// FROZEN after T+0:20 — see CLAUDE.md §1.2 / §5. Change only with team agreement.

export type ProviderId = 'netflix' | 'prime' | 'disney' | 'apple' | 'now' | 'iplayer' | 'channel4' | 'paramount' | 'other';
export type Aisle = 'action' | 'comedy' | 'horror' | 'scifi' | 'drama' | 'romance' | 'animated' | 'cult';

export interface Film {
  id: number;                 // TMDB id
  title: string;
  year: number;
  runtime: number;            // minutes
  overview: string;
  poster: string;             // full TMDB image URL (w342)
  backdrop?: string;
  genres: number[];           // TMDB genre ids
  aisle: Aisle;               // primary shelf
  rating: number;             // TMDB vote_average 0–10
  votes: number;
  trending: boolean;
  providers: { id: ProviderId; name: string; url: string; kind: 'stream' | 'rent' | 'buy' }[];
}

export interface Player {
  userId: string;
  name: string;
  jacket: string;             // hex, from the jacket palette
  x: number; y: number;       // tile coords (float)
  facing: 'up' | 'down' | 'left' | 'right';
  zone?: string;
  isDemo?: boolean;
}

export interface Favourite { userId: string; filmId: number; storeCode: string; createdAt: string; }
export interface Rental    { userId: string; filmId: number; storeCode: string; provider: ProviderId; createdAt: string; }
export interface ChatMsg   { id: string; userId: string; name: string; text: string; storeCode: string; createdAt: string; }

export interface RecItem {
  filmId: number;
  score: number;
  reason: string;             // "Because Ali & Sam rented it" | "More 80s sci-fi" | "Trending this week" | "Critics' darling"
  friends: string[];          // userIds who favourited/rented
}

export interface ClerkReply { line: string; picks: number[]; }  // RICO: one line + 3 TMDB ids from catalogue

export interface BoothResult { boothId: string; winnerFilmId: number; seed: number; entries: { userId: string; filmId: number; weight: number }[]; }

export type GameEvent =
  | { type: 'enter-aisle'; aisle: Aisle }
  | { type: 'open-counter' }
  | { type: 'open-bbs' }
  | { type: 'open-booth' }
  | { type: 'open-staff-picks' }
  | { type: 'close' };

// Realtime broadcast payloads on channel `store:{code}`
export type Broadcast =
  | { kind: 'move'; userId: string; x: number; y: number; facing: Player['facing'] }
  | { kind: 'chat'; msg: ChatMsg }
  | { kind: 'fav'; userId: string; filmId: number }
  | { kind: 'rent'; userId: string; filmId: number }
  | { kind: 'booth-drop'; boothId: string; userId: string; filmId: number }
  | { kind: 'booth-spin'; result: BoothResult };

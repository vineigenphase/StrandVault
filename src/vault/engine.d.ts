// Types for the ported canvas engine (engine.js). The adapter (adapter.ts) builds `VaultAdapter`.
import type { Film, Provider } from '@/lib/types';

/** A person palette for the top-down sprite. */
export interface PersonPalette {
  skin: string; hair: string; top: string; top2: string; pants: string; shoe: string;
  long?: 0 | 1; glasses?: 0 | 1; cap?: string; bow?: string;
}

/** The artifact's movie shape (ids are strings of the app id; TV ids are negative). */
export interface VaultMovie {
  id: string;
  t: string;              // title
  y: number;              // year
  rt: number | null;      // runtime (min)
  g: string[];            // genre names
  d: string;              // director / creators
  m: string;              // poster motif (generated art fallback)
  c: [string, string, string]; // palette for generated art + shelf spines
  sc: number;             // 0–5 stars
  tags: string[];         // epic | funny | mind | feel
  desc: string;
  img?: string;           // real poster
  bd?: string;            // backdrop
  film?: Film;
  full: boolean;          // false for thin search hits until ensure() loads details
  rel?: string;
}

export interface VaultPerson {
  id: string; name: string; recent?: string; fav?: string;
  x: number; y: number; dir: number; spots: [number, number][]; P?: PersonPalette;
}

export interface VaultRemote {
  id: string; name: string; x: number; y: number; dir: number; moving: boolean;
  P: PersonPalette; fav?: string; recent?: string;
}

export type RekoVibe = 'epic' | 'funny' | 'mind' | 'feel' | 'any';

export interface VaultAdapter {
  movies: VaultMovie[];
  shelves: { A: string[]; B: string[]; C: string[]; D: string[] };
  must: string[];
  mustWho: Record<string, string>;
  people: VaultPerson[];
  heroPalette?: PersonPalette;
  fonts: { display: string; body: string };
  /** Shown in the search terminal when the query is empty, e.g. "5,000 films · 2,000 shows". */
  vaultLabel?: string;
  dev?: boolean;
  watchlist(): string[];
  isSaved(id: string): boolean;
  toggleSaved(m: VaultMovie): boolean;
  lovers(id: string): string[];
  providers(m: VaultMovie): Provider[];
  watch(m: VaultMovie, provider: Provider | null): void;
  search(q: string): Promise<VaultMovie[]>;
  ensure(id: string): Promise<VaultMovie | null>;
  rico(vibe: RekoVibe, exclude: string[]): Promise<{ movie: VaultMovie; line: string | null } | null>;
  onOpen?(m: VaultMovie): void;
  onHero?(x: number, y: number, dir: number, moving: boolean): void;
}

export interface VaultApi {
  destroy(): void;
  setRemotes(list: VaultRemote[]): void;
  setDemoVisible(visible: boolean): void;
  setShelf(id: 'A' | 'B' | 'C' | 'D', ids: string[]): void;
  addMovies(list: VaultMovie[]): void;
  syncWatchlist(): void;
  toast(html: string, ms?: number): void;
  readonly state: string;
  readonly ui: string | null;
  readonly remotes: { id: string; name: string; x: number; y: number }[];
  readonly hero: { x: number; y: number };
  skipTo(): void;
  openSearch(): void;
  openBoard(): void;
  openReko(): void;
  openDirect(id: string): void;
  pingAndWalk(id: string): void;
}

export function mountVault(root: HTMLElement, adapter: VaultAdapter): VaultApi;

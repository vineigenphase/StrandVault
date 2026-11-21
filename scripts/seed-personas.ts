// Seed 6 demo personas into store KCL (BACKEND.md §3.4). Lane BE2.
// Idempotent: fixed UUIDs + replace favourites on every run.
// Run with: npm run seed:personas
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import type { Look } from '../src/lib/types';
import { mockFilms } from '../src/lib/mocks';

// tsx does not load .env.local for us; read the few vars we need.
try {
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
} catch { /* no .env.local — env may be supplied by the shell */ }

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const code = process.env.NEXT_PUBLIC_STORE_CODE || 'KCL';
const validIds = new Set(mockFilms.map((f) => f.id));

/** Keep only IDs present in the current catalogue; pad to 4–8 from the mock set. */
function favourites(...wanted: number[]): number[] {
  const out = wanted.filter((id) => validIds.has(id));
  for (const f of mockFilms) {
    if (out.length >= 4) break;
    if (!out.includes(f.id)) out.push(f.id);
  }
  return out.slice(0, 8);
}

const personas: { name: string; look: Look; favId: number; favs: number[] }[] = [
  { name: 'MAYA', favId: 27205, favs: favourites(27205, 329865, 313369, 129),
    look: { jacket: '#00E5FF', hair: 'long', hairColor: '#1A1A1A', skin: '#8D5524', shades: false } },
  { name: 'DEV', favId: 105, favs: favourites(105, 78, 245891, 27205),
    look: { jacket: '#FFD300', hair: 'buzz', hairColor: '#2B1B0E', skin: '#C68642', shades: true } },
  { name: 'JONNO', favId: 76341, favs: favourites(76341, 361743, 245891, 27205),
    look: { jacket: '#FF8A3D', hair: 'mullet', hairColor: '#6B3F1D', skin: '#F1C27D', shades: true } },
  { name: 'PRIYA', favId: 419430, favs: favourites(419430, 493922, 496243, 157336),
    look: { jacket: '#B388FF', hair: 'curls', hairColor: '#120A05', skin: '#A86B3C', shades: false } },
  { name: 'SAM', favId: 346648, favs: favourites(346648, 137, 862, 27205),
    look: { jacket: '#1DE9B6', hair: 'flat', hairColor: '#D9A441', skin: '#F1C27D', shades: false } },
  { name: 'LOU', favId: 313369, favs: favourites(313369, 76, 4348, 346648),
    look: { jacket: '#FF2E88', hair: 'buzz', hairColor: '#3B1F0E', skin: '#E0AC69', shades: true } },
];

const idFor = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

async function main() {
  const ids = personas.map((_, i) => idFor(i + 1));

  const rows = personas.map((p, i) => ({
    id: ids[i],
    store_code: code,
    name: p.name,
    look: p.look,
    fav_id: p.favId,
    is_demo: true,
    last_seen: new Date().toISOString(),
  }));

  const { error: profileError } = await supabase.from('profiles').upsert(rows, { onConflict: 'id' });
  if (profileError) throw profileError;

  const { error: deleteError } = await supabase.from('favourites').delete().in('user_id', ids);
  if (deleteError) throw deleteError;

  const favRows = personas.flatMap((p, i) =>
    p.favs.map((filmId) => ({ user_id: ids[i], film_id: filmId })));
  const { error: favError } = await supabase.from('favourites').upsert(favRows, {
    onConflict: 'user_id,film_id',
  });
  if (favError) throw favError;

  console.log(`TRACKING… OK ▶ seeded ${personas.length} personas into store ${code}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

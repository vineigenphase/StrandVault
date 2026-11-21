import 'server-only';
// Service-role Supabase client — BACKEND.md §3.3. Lane BE.
// NEVER import this from a client component.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null | undefined;

/** Returns the service-role client, or null when env is missing (callers use fallbacks). */
export function db(): SupabaseClient | null {
  if (cached !== undefined) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.warn('[BE] Supabase env missing — routes will return fallback data.');
    cached = null;
  } else {
    cached = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

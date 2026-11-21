// Service-role Supabase client for route handlers + scripts. Never import from client components.
// (If BE-1 already created src/lib/server/supabase.ts, either works; this one has no 'server-only'
// import so scripts can share it.)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getServiceClient(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

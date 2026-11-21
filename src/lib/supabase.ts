// Browser Supabase client (anon key) — BACKEND.md §3.3. Lane BE.
// Used for Realtime presence + broadcast only. All table access goes through API routes.
// If either env var is missing we export null and callers run in solo/offline mode.
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Vite 환경(`import.meta.env`)에서는 환경변수, Node tsx에서는 undefined → null client
const env = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isSupabaseConfigured = (): boolean => supabase !== null;

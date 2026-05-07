import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Vite 환경(`import.meta.env`)에서는 환경변수, Node tsx에서는 undefined → null client
const env = ((import.meta as unknown as { env?: Record<string, string> }).env) ?? {};
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;

/**
 * 메인 프로세스(IPC 핸들러)에서 사용자 세션을 주입할 때 사용.
 * RLS 정책이 auth.uid() 검사를 하는 row를 보려면 access_token 필요.
 */
export async function setSupabaseSession(
  access_token: string,
  refresh_token: string,
): Promise<void> {
  if (!supabase) return;
  await supabase.auth.setSession({ access_token, refresh_token });
}

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    : null;

export const isSupabaseConfigured = (): boolean => supabase !== null;

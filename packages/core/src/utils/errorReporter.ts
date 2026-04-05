import { supabase } from '../config/supabase';

export async function reportError(error: Error, component?: string): Promise<void> {
  if (!supabase) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const appConfig = typeof __APP_CONFIG__ !== 'undefined' ? __APP_CONFIG__ : null;

    await supabase.from('error_logs').insert({
      user_id: session.user.id,
      organization_id: null, // RLS에서 org 접근 어려우므로 null
      app_version: appConfig?.version || 'unknown',
      app_name: appConfig?.appName || 'unknown',
      error_message: error.message,
      error_stack: error.stack?.slice(0, 2000),
      component: component || null,
      page_url: typeof window !== 'undefined' ? window.location.hash : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // 에러 리포팅 자체가 실패해도 무시
  }
}

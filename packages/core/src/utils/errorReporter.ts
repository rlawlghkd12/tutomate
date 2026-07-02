import { supabase } from '../config/supabase';
import { getOrgId } from '../stores/authStore';

export async function reportError(error: Error, component?: string): Promise<void> {
  if (!supabase) return;

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const appConfig = typeof globalThis !== 'undefined' && (globalThis as any).__APP_CONFIG__ ? (globalThis as any).__APP_CONFIG__ : null;

    const message = typeof error?.message === 'string' && error.message
      ? error.message
      : String(error);

    await supabase.from('error_logs').insert({
      user_id: session.user.id,
      organization_id: getOrgId(),
      app_version: appConfig?.version || 'unknown',
      app_name: appConfig?.appName || 'unknown',
      error_message: message,
      error_stack: (error?.stack || `Error: ${message}`).slice(0, 2000),
      component: component || null,
      page_url: typeof window !== 'undefined' ? window.location.hash : null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    });
  } catch {
    // 에러 리포팅 자체가 실패해도 무시
  }
}

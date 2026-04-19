// admin 전용 이벤트 로그 조회 Edge Function.
// RLS에서 event_logs SELECT는 전면 차단되어 있으므로 service role로만 조회 가능.
// admin 판별은 기존 admin-users 패턴과 동일 (ADMIN_EMAILS 또는 org plan='admin').

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Filters {
  organizationId?: string;
  entityType?: string;
  entityId?: string;
  eventTypes?: string[];
  actorUserId?: string;
  since?: string;
  until?: string;
  limit?: number;
  offset?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // admin 권한 확인 (admin-users 함수와 동일 로직)
    const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '4uphwang@gmail.com').split(',').map((e) => e.trim());
    const isAdminEmail = ADMIN_EMAILS.includes(user.email ?? '');

    if (!isAdminEmail) {
      const { data: orgLink } = await userClient
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();
      if (!orgLink) {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
      }
      const { data: org } = await userClient
        .from('organizations')
        .select('plan')
        .eq('id', orgLink.organization_id)
        .single();
      if (org?.plan !== 'admin') {
        return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: corsHeaders });
      }
    }

    // service role로 event_logs 조회 (RLS 우회)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const filters: Filters = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 500);
    const offset = Math.max(filters.offset ?? 0, 0);

    let query = adminClient
      .from('event_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId);
    if (filters.entityType) query = query.eq('entity_type', filters.entityType);
    if (filters.entityId) query = query.eq('entity_id', filters.entityId);
    if (filters.actorUserId) query = query.eq('actor_user_id', filters.actorUserId);
    if (filters.eventTypes && filters.eventTypes.length > 0) query = query.in('event_type', filters.eventTypes);
    if (filters.since) query = query.gte('created_at', filters.since);
    if (filters.until) query = query.lte('created_at', filters.until);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
    }

    // camelCase 변환
    const logs = (data ?? []).map((row: any) => ({
      id: row.id,
      organizationId: row.organization_id,
      actorUserId: row.actor_user_id,
      actorLabel: row.actor_label,
      eventType: row.event_type,
      entityType: row.entity_type,
      entityId: row.entity_id,
      entityLabel: row.entity_label,
      payload: row.payload ?? {},
      createdAt: row.created_at,
    }));

    return new Response(
      JSON.stringify({ logs, total: count ?? 0 }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: corsHeaders });
  }
});

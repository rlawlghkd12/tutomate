import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // 요청자 인증 확인
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: corsHeaders });
    }

    // admin 플랜 확인
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

    // Admin client (service role)
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // 유저 목록
    if (action === 'list') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const perPage = parseInt(url.searchParams.get('perPage') || '50');

      const { data: usersData, error: listError } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (listError) {
        return new Response(JSON.stringify({ error: 'list_failed' }), { status: 500, headers: corsHeaders });
      }

      // 각 유저의 org 연결 정보 조회
      const userIds = usersData.users.map((u: any) => u.id);
      const { data: orgLinks } = await adminClient
        .from('user_organizations')
        .select('user_id, organization_id')
        .in('user_id', userIds);

      const orgIds = [...new Set((orgLinks || []).map((l: any) => l.organization_id))];
      const { data: orgs } = orgIds.length > 0
        ? await adminClient.from('organizations').select('id, name, plan').in('id', orgIds)
        : { data: [] };

      const orgMap = new Map((orgs || []).map((o: any) => [o.id, o]));
      const linkMap = new Map((orgLinks || []).map((l: any) => [l.user_id, l.organization_id]));

      // org별 강좌/수강생 수 조회
      const counts = new Map<string, { courses: number; students: number }>();
      if (orgIds.length > 0) {
        const { data: courseCounts } = await adminClient
          .from('courses')
          .select('organization_id')
          .in('organization_id', orgIds);
        const { data: studentCounts } = await adminClient
          .from('students')
          .select('organization_id')
          .in('organization_id', orgIds);

        for (const id of orgIds) {
          counts.set(id, {
            courses: (courseCounts || []).filter((c: any) => c.organization_id === id).length,
            students: (studentCounts || []).filter((s: any) => s.organization_id === id).length,
          });
        }
      }

      const users = usersData.users.map((u: any) => {
        const orgId = linkMap.get(u.id);
        const orgInfo = orgId ? orgMap.get(orgId) : null;
        const orgCounts = orgId ? counts.get(orgId) : null;
        return {
          id: u.id,
          email: u.email,
          provider: u.user_metadata?.auth_provider || u.app_metadata?.provider || 'unknown',
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          is_anonymous: u.is_anonymous,
          organization: orgInfo ? { id: orgInfo.id, name: orgInfo.name, plan: orgInfo.plan } : null,
          course_count: orgCounts?.courses || 0,
          student_count: orgCounts?.students || 0,
        };
      });

      return new Response(JSON.stringify({ users, total: usersData.users.length }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 유저 삭제
    if (action === 'delete') {
      const body = await req.json();
      const { userId } = body;
      if (!userId) {
        return new Response(JSON.stringify({ error: 'missing_user_id' }), { status: 400, headers: corsHeaders });
      }

      // org 연결 해제
      await adminClient.from('user_organizations').delete().eq('user_id', userId);
      // 유저 삭제
      const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
      if (deleteError) {
        return new Response(JSON.stringify({ error: 'delete_failed' }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 유저 org 이전
    if (action === 'transfer-org') {
      const body = await req.json();
      const { userId, newOrgId } = body;
      if (!userId || !newOrgId) {
        return new Response(JSON.stringify({ error: 'missing_params' }), { status: 400, headers: corsHeaders });
      }

      // 기존 연결 삭제
      await adminClient.from('user_organizations').delete().eq('user_id', userId);
      // 새 연결 생성
      const { error: insertError } = await adminClient
        .from('user_organizations')
        .insert({ user_id: userId, organization_id: newOrgId });

      if (insertError) {
        return new Response(JSON.stringify({ error: 'transfer_failed' }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // org 플랜 변경
    if (action === 'change-plan') {
      const body = await req.json();
      const { organizationId, plan } = body;
      if (!organizationId || !['trial', 'basic', 'admin'].includes(plan)) {
        return new Response(JSON.stringify({ error: 'invalid_params' }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await adminClient
        .from('organizations')
        .update({ plan })
        .eq('id', organizationId);

      if (updateError) {
        return new Response(JSON.stringify({ error: 'update_failed' }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 조직 상세 (강좌/수강생)
    if (action === 'org-detail') {
      const body = await req.json();
      const { organizationId } = body;
      if (!organizationId) {
        return new Response(JSON.stringify({ error: 'missing_org_id' }), { status: 400, headers: corsHeaders });
      }

      const { data: courses } = await adminClient
        .from('courses')
        .select('id, name')
        .eq('organization_id', organizationId)
        .order('name');

      const { data: students } = await adminClient
        .from('students')
        .select('id, name, phone')
        .eq('organization_id', organizationId)
        .order('name');

      const { data: enrollments } = await adminClient
        .from('enrollments')
        .select('course_id')
        .eq('organization_id', organizationId);

      const courseList = (courses || []).map((c: any) => ({
        ...c,
        student_count: (enrollments || []).filter((e: any) => e.course_id === c.id).length,
      }));

      return new Response(JSON.stringify({ courses: courseList, students: students || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 라이선스 이메일 할당
    if (action === 'assign-license-email') {
      const body = await req.json();
      const { licenseKey, email } = body;
      if (!licenseKey) {
        return new Response(JSON.stringify({ error: 'missing_license_key' }), { status: 400, headers: corsHeaders });
      }

      const { error: updateError } = await adminClient
        .from('license_keys')
        .update({ assigned_email: email || null })
        .eq('key', licenseKey);

      if (updateError) {
        return new Response(JSON.stringify({ error: 'update_failed' }), { status: 500, headers: corsHeaders });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'unknown_action' }), { status: 400, headers: corsHeaders });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'internal_error' }), { status: 500, headers: corsHeaders });
  }
});

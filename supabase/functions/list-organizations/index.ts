import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // JWT에서 유저 확인
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.slice(7),
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // admin 권한 확인: 이메일 화이트리스트 또는 org plan=admin
    const ADMIN_EMAILS = (Deno.env.get('ADMIN_EMAILS') || '4uphwang@gmail.com').split(',').map((e: string) => e.trim());
    const isAdminEmail = ADMIN_EMAILS.includes(user.email ?? '');

    if (!isAdminEmail) {
      const { data: userOrg } = await supabaseAdmin
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', user.id)
        .single();

      if (!userOrg) {
        return new Response(
          JSON.stringify({ error: 'forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('plan')
        .eq('id', userOrg.organization_id)
        .single();

      if (!org || org.plan !== 'admin') {
        return new Response(
          JSON.stringify({ error: 'forbidden' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // 조직 목록 조회
    const { data: organizations, error: listError } = await supabaseAdmin
      .from('organizations')
      .select('id, name, license_key, plan, max_seats, created_at')
      .order('created_at', { ascending: false });

    if (listError) {
      return new Response(
        JSON.stringify({ error: 'query_failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 각 조직별 멤버·강좌·수강생·등록 수 조회
    const orgIds = (organizations || []).map((o: any) => o.id);

    const [
      { data: memberRows },
      { data: courseRows },
      { data: studentRows },
      { data: enrollmentRows },
    ] = await Promise.all([
      supabaseAdmin.from('user_organizations').select('organization_id').in('organization_id', orgIds),
      supabaseAdmin.from('courses').select('organization_id').in('organization_id', orgIds),
      supabaseAdmin.from('students').select('organization_id').in('organization_id', orgIds),
      supabaseAdmin.from('enrollments').select('organization_id').in('organization_id', orgIds),
    ]);

    const count = (rows: any[] | null) => {
      const map: Record<string, number> = {};
      (rows || []).forEach((r: any) => {
        map[r.organization_id] = (map[r.organization_id] || 0) + 1;
      });
      return map;
    };

    const memberMap = count(memberRows);
    const courseMap = count(courseRows);
    const studentMap = count(studentRows);
    const enrollmentMap = count(enrollmentRows);

    const result = (organizations || []).map((org: any) => ({
      ...org,
      member_count: memberMap[org.id] || 0,
      course_count: courseMap[org.id] || 0,
      student_count: studentMap[org.id] || 0,
      enrollment_count: enrollmentMap[org.id] || 0,
    }));

    return new Response(
      JSON.stringify({ organizations: result }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

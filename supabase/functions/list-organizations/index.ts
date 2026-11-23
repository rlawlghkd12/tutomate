import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

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
        JSON.stringify({ error: 'unauthorized', detail: userError?.message, token_prefix: authHeader.slice(7, 20) }),
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

    // 서버 최대 행 수(Max rows)를 넘으면 행이 잘려 개수가 줄어들므로 페이지 단위로 끝까지 읽는다.
    const PAGE = 1000;
    // 페이지 순서가 흔들리지 않도록 각 테이블의 고유 키로 정렬 (user_organizations는 id 없이 복합 키)
    const fetchOrgIds = async (
      table: string,
      keyCol: string = 'id',
    ): Promise<{ organization_id: string }[]> => {
      const all: { organization_id: string }[] = [];
      for (let from = 0; from < 500 * PAGE; ) {
        const { data, error } = await supabaseAdmin
          .from(table)
          .select('organization_id')
          .in('organization_id', orgIds)
          .order('organization_id')
          .order(keyCol)
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...data);
        from += data.length;
      }
      return all;
    };

    const [memberRows, courseRows, studentRows, enrollmentRows] = await Promise.all([
      fetchOrgIds('user_organizations', 'user_id'),
      fetchOrgIds('courses'),
      fetchOrgIds('students'),
      fetchOrgIds('enrollments'),
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

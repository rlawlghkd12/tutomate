import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { license_key } = await req.json();

    // 1. 형식 검증 (TMKH: 일반, TMKA: 어드민)
    if (!/^TMK[HA]-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(license_key)) {
      return new Response(
        JSON.stringify({ error: 'invalid_format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Supabase admin 클라이언트 (service_role 키 사용)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // 3. SHA-256 해시 → license_keys 테이블에서 유효성 검증
    const keyHash = await sha256(license_key);
    const { data: licenseRow } = await supabaseAdmin
      .from('license_keys')
      .select('key_hash, plan')
      .eq('key_hash', keyHash)
      .single();

    if (!licenseRow) {
      return new Response(
        JSON.stringify({ error: 'invalid_key' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // JWT에서 유저 ID 추출
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 4. organizations에서 license_key로 조회
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id, max_seats, plan')
      .eq('license_key', license_key)
      .single();

    let organizationId: string;

    if (existingOrg) {
      // 기존 조직 → 좌석 수 확인
      const { count } = await supabaseAdmin
        .from('user_organizations')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', existingOrg.id);

      if ((count ?? 0) >= existingOrg.max_seats) {
        return new Response(
          JSON.stringify({ error: 'max_seats_reached' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      organizationId = existingOrg.id;

      // 이미 연결되어 있는지 확인
      const { data: existingLink } = await supabaseAdmin
        .from('user_organizations')
        .select('user_id')
        .eq('user_id', user.id)
        .single();

      if (!existingLink) {
        // member로 추가
        const { error: linkError } = await supabaseAdmin
          .from('user_organizations')
          .insert({ user_id: user.id, organization_id: organizationId, role: 'member' });

        if (linkError) {
          return new Response(
            JSON.stringify({ error: 'link_failed', detail: linkError.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    } else {
      // 새 조직 생성 (license_keys 테이블의 plan 사용)
      const { data: newOrg, error: orgError } = await supabaseAdmin
        .from('organizations')
        .insert({
          license_key,
          name: '수강생 관리 프로그램',
          plan: licenseRow.plan,
          max_seats: 5,
        })
        .select('id')
        .single();

      if (orgError || !newOrg) {
        return new Response(
          JSON.stringify({ error: 'org_creation_failed', detail: orgError?.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      organizationId = newOrg.id;

      // owner로 연결
      const { error: linkError } = await supabaseAdmin
        .from('user_organizations')
        .insert({ user_id: user.id, organization_id: organizationId, role: 'owner' });

      if (linkError) {
        return new Response(
          JSON.stringify({ error: 'link_failed', detail: linkError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const isNewOrg = !existingOrg;
    const plan = existingOrg ? existingOrg.plan : licenseRow.plan;

    return new Response(
      JSON.stringify({ organization_id: organizationId, is_new_org: isNewOrg, plan }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error', detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

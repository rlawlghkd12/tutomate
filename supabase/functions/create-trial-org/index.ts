import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { device_id } = await req.json();

    if (!device_id || typeof device_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'device_id_required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // JWT에서 유저 ID 추출
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(
      authHeader.slice(7),
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 1. 이미 조직에 속해있는지 확인
    const { data: existingLink } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id, device_id')
      .eq('user_id', user.id)
      .single();

    if (existingLink) {
      // device_id가 바뀌었으면 업데이트 (앱별 device_id 마이그레이션)
      if (existingLink.device_id !== device_id) {
        await supabaseAdmin
          .from('user_organizations')
          .update({ device_id })
          .eq('user_id', user.id);
      }

      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('plan')
        .eq('id', existingLink.organization_id)
        .single();

      return new Response(
        JSON.stringify({
          organization_id: existingLink.organization_id,
          is_new_org: false,
          plan: orgData?.plan || 'trial',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. 새 trial 조직 생성
    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: '체험판',
        plan: 'trial',
        max_seats: 1,
      })
      .select('id')
      .single();

    if (orgError || !newOrg) {
      return new Response(
        JSON.stringify({ error: 'org_creation_failed', details: orgError?.message || 'unknown' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // owner로 연결
    const { error: linkError } = await supabaseAdmin
      .from('user_organizations')
      .insert({
        user_id: user.id,
        organization_id: newOrg.id,
        role: 'owner',
        device_id,
      });

    if (linkError) {
      // 고아 org 방지: 연결 실패 시 방금 만든 org 삭제
      await supabaseAdmin.from('organizations').delete().eq('id', newOrg.id);
      return new Response(
        JSON.stringify({ error: 'link_failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        organization_id: newOrg.id,
        is_new_org: true,
        plan: 'trial',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

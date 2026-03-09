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
      .select('organization_id')
      .eq('user_id', user.id)
      .single();

    if (existingLink) {
      // 이미 조직 있으면 해당 정보 반환
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

    // 2. 같은 device_id로 등록된 기존 trial org 찾기
    const { data: existingDevice } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id, user_id')
      .eq('device_id', device_id)
      .single();

    if (existingDevice) {
      // 같은 기기의 이전 trial org 발견 → user_id 교체
      const oldUserId = existingDevice.user_id;

      const { error: deleteError } = await supabaseAdmin
        .from('user_organizations')
        .delete()
        .eq('user_id', oldUserId)
        .eq('organization_id', existingDevice.organization_id);

      if (deleteError) {
        return new Response(
          JSON.stringify({ error: 'link_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      const { error: insertError } = await supabaseAdmin
        .from('user_organizations')
        .insert({
          user_id: user.id,
          organization_id: existingDevice.organization_id,
          role: 'owner',
          device_id,
        });

      if (insertError) {
        // insert 실패 → 이전 레코드 복원
        await supabaseAdmin
          .from('user_organizations')
          .insert({
            user_id: oldUserId,
            organization_id: existingDevice.organization_id,
            role: 'owner',
            device_id,
          });
        return new Response(
          JSON.stringify({ error: 'link_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // 이전 익명 유저 삭제
      if (oldUserId !== user.id) {
        await supabaseAdmin.auth.admin.deleteUser(oldUserId);
      }

      const { data: orgData } = await supabaseAdmin
        .from('organizations')
        .select('plan')
        .eq('id', existingDevice.organization_id)
        .single();

      return new Response(
        JSON.stringify({
          organization_id: existingDevice.organization_id,
          is_new_org: false,
          plan: orgData?.plan || 'trial',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 3. 새 trial 조직 생성 (license_key: TRAL-XXXX-XXXX-XXXX 형식)
    const hex = device_id.replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const trialKey = `TRAL-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}`;
    const { data: newOrg, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        license_key: trialKey,
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

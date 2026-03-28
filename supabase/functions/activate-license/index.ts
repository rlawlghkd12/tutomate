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
    const { license_key, device_id } = await req.json();

    // 입력 길이 검증
    if (typeof license_key !== 'string' || license_key.length > 19) {
      return new Response(
        JSON.stringify({ error: 'invalid_format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

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

    // 4-a. 유저가 이미 trial org에 속해있는지 확인
    const { data: userOrgLink } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    // 4-b. organizations에서 license_key로 조회 (이미 이 키로 만든 org가 있는지)
    const { data: existingOrg } = await supabaseAdmin
      .from('organizations')
      .select('id, max_seats, plan')
      .eq('license_key', license_key)
      .single();

    let organizationId: string;

    if (existingOrg) {
      organizationId = existingOrg.id;

      // device_id가 있는 경우: 같은 기기 레코드 검색
      if (device_id) {
        const { data: existingDevice } = await supabaseAdmin
          .from('user_organizations')
          .select('user_id, role')
          .eq('organization_id', existingOrg.id)
          .eq('device_id', device_id)
          .single();

        if (existingDevice) {
          // 같은 기기 → user_id만 교체 (좌석 불변)
          const oldUserId = existingDevice.user_id;

          const { error: deleteError } = await supabaseAdmin
            .from('user_organizations')
            .delete()
            .eq('user_id', oldUserId)
            .eq('organization_id', existingOrg.id);

          if (deleteError) {
            return new Response(
              JSON.stringify({ error: 'link_failed' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }

          // 새 유저의 기존 org 링크 정리 (trial org 등)
          await supabaseAdmin
            .from('user_organizations')
            .delete()
            .eq('user_id', user.id)
            .neq('organization_id', organizationId);

          const { error: insertError } = await supabaseAdmin
            .from('user_organizations')
            .insert({
              user_id: user.id,
              organization_id: organizationId,
              role: existingDevice.role,
              device_id,
            });

          if (insertError) {
            // insert 실패 → 이전 레코드 복원
            await supabaseAdmin
              .from('user_organizations')
              .insert({
                user_id: oldUserId,
                organization_id: existingOrg.id,
                role: existingDevice.role,
                device_id,
              });
            return new Response(
              JSON.stringify({ error: 'link_failed' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }

          // 이전 익명 유저 삭제 (새 유저와 다른 경우만)
          if (oldUserId !== user.id) {
            await supabaseAdmin.auth.admin.deleteUser(oldUserId);
          }
        } else {
          // 다른 기기 → 좌석 수 확인 후 추가
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

          // 기존 org 링크 정리 (trial org 등 다른 org에 연결된 행 삭제)
          await supabaseAdmin
            .from('user_organizations')
            .delete()
            .eq('user_id', user.id)
            .neq('organization_id', organizationId);

          const { error: linkError } = await supabaseAdmin
            .from('user_organizations')
            .insert({
              user_id: user.id,
              organization_id: organizationId,
              role: 'member',
              device_id,
            });

          if (linkError) {
            return new Response(
              JSON.stringify({ error: 'link_failed' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }
      } else {
        // device_id 없음 (이전 버전 클라이언트) → 기존 로직
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

        const { data: existingLink } = await supabaseAdmin
          .from('user_organizations')
          .select('user_id')
          .eq('user_id', user.id)
          .eq('organization_id', organizationId)
          .single();

        if (!existingLink) {
          // 기존 org 링크 정리 (trial org 등 다른 org에 연결된 행 삭제)
          await supabaseAdmin
            .from('user_organizations')
            .delete()
            .eq('user_id', user.id)
            .neq('organization_id', organizationId);

          const { error: linkError } = await supabaseAdmin
            .from('user_organizations')
            .insert({ user_id: user.id, organization_id: organizationId, role: 'member' });

          if (linkError) {
            return new Response(
              JSON.stringify({ error: 'link_failed' }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }
      }
    } else if (userOrgLink) {
      // 유저가 이미 trial org에 속해 있음 → 기존 org를 업그레이드
      organizationId = userOrgLink.organization_id;

      const { error: upgradeError } = await supabaseAdmin
        .from('organizations')
        .update({
          license_key,
          plan: licenseRow.plan,
          max_seats: 5,
          name: '수강생 관리 프로그램',
        })
        .eq('id', organizationId);

      if (upgradeError) {
        return new Response(
          JSON.stringify({ error: 'org_upgrade_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // device_id 업데이트 (없으면 추가)
      if (device_id) {
        await supabaseAdmin
          .from('user_organizations')
          .update({ device_id })
          .eq('user_id', user.id)
          .eq('organization_id', organizationId);
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
          JSON.stringify({ error: 'org_creation_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      organizationId = newOrg.id;

      // owner로 연결 (device_id 포함)
      const { error: linkError } = await supabaseAdmin
        .from('user_organizations')
        .insert({
          user_id: user.id,
          organization_id: organizationId,
          role: 'owner',
          ...(device_id ? { device_id } : {}),
        });

      if (linkError) {
        return new Response(
          JSON.stringify({ error: 'link_failed' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // existingOrg: 이 license_key로 이미 생성된 org
    // userOrgLink + !existingOrg: trial org를 업그레이드한 경우
    const isNewOrg = !existingOrg && !userOrgLink;
    const plan = existingOrg ? existingOrg.plan : licenseRow.plan;

    return new Response(
      JSON.stringify({ organization_id: organizationId, is_new_org: isNewOrg, plan }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

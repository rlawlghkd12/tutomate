import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function generateGroup(): string {
  let group = '';
  const arr = new Uint8Array(4);
  crypto.getRandomValues(arr);
  for (let i = 0; i < 4; i++) {
    group += CHARSET[arr[i] % CHARSET.length];
  }
  return group;
}

function generateKey(plan?: string): string {
  const prefix = plan === 'admin' ? 'TMKA' : 'TMKH';
  return `${prefix}-${generateGroup()}-${generateGroup()}-${generateGroup()}`;
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { plan, memo } = await req.json();

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

    // admin 권한 확인
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

    // 입력 검증
    if (memo && (typeof memo !== 'string' || memo.length > 200)) {
      return new Response(
        JSON.stringify({ error: 'invalid_input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (plan && !['basic', 'admin'].includes(plan)) {
      return new Response(
        JSON.stringify({ error: 'invalid_input' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const key = generateKey(plan);
    const keyHash = await sha256(key);

    const { error } = await supabaseAdmin
      .from('license_keys')
      .insert({
        key_hash: keyHash,
        key,
        plan: plan || 'basic',
        memo: memo || null,
      });

    if (error) {
      return new Response(
        JSON.stringify({ error: 'insert_failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ key, plan: plan || 'basic', memo: memo || null }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'internal_error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});

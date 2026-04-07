import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: corsHeaders,
      });
    }

    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { data: callerLinks } = await userClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .limit(1);

    const callerLink = callerLinks?.[0];
    if (!callerLink) {
      return new Response(JSON.stringify({ error: 'owner_only' }), {
        status: 403, headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const expiresInDays = body.expires_in_days || 7;
    const maxUses = body.max_uses || 0;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const code = generateCode();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const { error: insertError } = await adminClient
      .from('org_invites')
      .insert({
        organization_id: callerLink.organization_id,
        code,
        created_by: user.id,
        expires_at: expiresAt.toISOString(),
        max_uses: maxUses,
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: 'create_failed' }), {
        status: 500, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({
      code,
      expires_at: expiresAt.toISOString(),
      max_uses: maxUses,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

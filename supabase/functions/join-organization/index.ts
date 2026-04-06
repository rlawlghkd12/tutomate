import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: corsHeaders,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: { user }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', ''),
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: corsHeaders,
      });
    }

    const { code } = await req.json();
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ error: 'missing_code' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const { data: invite } = await adminClient
      .from('org_invites')
      .select('*')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (!invite) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 404, headers: corsHeaders,
      });
    }

    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 410, headers: corsHeaders,
      });
    }

    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return new Response(JSON.stringify({ error: 'max_uses_reached' }), {
        status: 410, headers: corsHeaders,
      });
    }

    const orgId = invite.organization_id;

    const { data: existingLink } = await adminClient
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .single();

    if (existingLink) {
      return new Response(JSON.stringify({ error: 'already_member' }), {
        status: 409, headers: corsHeaders,
      });
    }

    const { data: org } = await adminClient
      .from('organizations')
      .select('max_seats, plan')
      .eq('id', orgId)
      .single();

    const { count } = await adminClient
      .from('user_organizations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId);

    if (org && org.max_seats > 0 && (count || 0) >= org.max_seats) {
      return new Response(JSON.stringify({ error: 'max_seats_reached' }), {
        status: 403, headers: corsHeaders,
      });
    }

    await adminClient
      .from('user_organizations')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    const { error: insertError } = await adminClient
      .from('user_organizations')
      .insert({
        user_id: user.id,
        organization_id: orgId,
        role: 'member',
        is_active: true,
      });

    if (insertError) {
      return new Response(JSON.stringify({ error: 'join_failed' }), {
        status: 500, headers: corsHeaders,
      });
    }

    await adminClient
      .from('org_invites')
      .update({ used_count: invite.used_count + 1 })
      .eq('id', invite.id);

    return new Response(JSON.stringify({
      organization_id: orgId,
      plan: org?.plan || 'trial',
      role: 'member',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

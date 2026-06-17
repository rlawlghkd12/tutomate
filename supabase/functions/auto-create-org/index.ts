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

    const { data: existingLinks } = await adminClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id);

    if (existingLinks && existingLinks.length > 0) {
      const activeLink = existingLinks[0];
      const { data: orgData } = await adminClient
        .from('organizations')
        .select('plan')
        .eq('id', activeLink.organization_id)
        .single();

      return new Response(JSON.stringify({
        organization_id: activeLink.organization_id,
        plan: orgData?.plan || 'trial',
        role: activeLink.role || 'owner',
        is_new_org: false,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: newOrg, error: orgError } = await adminClient
      .from('organizations')
      .insert({ name: '내 학원', plan: 'trial', max_seats: 5 })
      .select('id')
      .single();

    if (orgError || !newOrg) {
      return new Response(JSON.stringify({ error: 'org_creation_failed' }), {
        status: 500, headers: corsHeaders,
      });
    }

    const { error: linkError } = await adminClient
      .from('user_organizations')
      .insert({
        user_id: user.id,
        organization_id: newOrg.id,
        role: 'owner',
      });

    if (linkError) {
      await adminClient.from('organizations').delete().eq('id', newOrg.id);
      return new Response(JSON.stringify({ error: 'link_failed' }), {
        status: 500, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({
      organization_id: newOrg.id,
      plan: 'trial',
      role: 'owner',
      is_new_org: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

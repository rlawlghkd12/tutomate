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

    const { data: links } = await adminClient
      .from('user_organizations')
      .select('organization_id, role, is_active')
      .eq('user_id', user.id);

    if (!links || links.length === 0) {
      return new Response(JSON.stringify({ organizations: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const orgIds = links.map((l: any) => l.organization_id);
    const { data: orgs } = await adminClient
      .from('organizations')
      .select('id, name, plan')
      .in('id', orgIds);

    const orgMap = new Map((orgs || []).map((o: any) => [o.id, o]));

    const organizations = links.map((link: any) => {
      const org = orgMap.get(link.organization_id);
      return {
        id: link.organization_id,
        name: org?.name || '알 수 없는 조직',
        plan: org?.plan || 'trial',
        role: link.role,
        isActive: link.is_active,
      };
    });

    return new Response(JSON.stringify({ organizations }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

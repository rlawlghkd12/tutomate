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

    const { code } = await req.json();
    if (!code) {
      return new Response(JSON.stringify({ error: 'missing_code' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: invite } = await adminClient
      .from('org_invites')
      .select('organization_id')
      .eq('code', code.toUpperCase().trim())
      .single();

    if (!invite) {
      return new Response(JSON.stringify({ error: 'invalid_code' }), {
        status: 404, headers: corsHeaders,
      });
    }

    const { data: org } = await adminClient
      .from('organizations')
      .select('name')
      .eq('id', invite.organization_id)
      .single();

    return new Response(JSON.stringify({ name: org?.name || '' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (_e) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

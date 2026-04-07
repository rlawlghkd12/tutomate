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

    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'missing_user_id' }), {
        status: 400, headers: corsHeaders,
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

    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'cannot_remove_self' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const orgId = callerLink.organization_id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: targetLink } = await adminClient
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userId)
      .eq('organization_id', orgId)
      .single();

    if (!targetLink) {
      return new Response(JSON.stringify({ error: 'member_not_found' }), {
        status: 404, headers: corsHeaders,
      });
    }

    const { error: deleteError } = await adminClient
      .from('user_organizations')
      .delete()
      .eq('user_id', userId)
      .eq('organization_id', orgId);

    if (deleteError) {
      return new Response(JSON.stringify({ error: 'delete_failed' }), {
        status: 500, headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

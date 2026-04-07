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

    const { data: callerLinks } = await userClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id);

    if (!callerLinks || callerLinks.length === 0) {
      return new Response(JSON.stringify({ error: 'no_organization' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // owner인 조직 우선, 없으면 첫 번째
    const ownerLink = callerLinks.find((l: any) => l.role === 'owner');
    if (!ownerLink) {
      return new Response(JSON.stringify({ error: 'owner_only' }), {
        status: 403, headers: corsHeaders,
      });
    }

    const orgId = ownerLink.organization_id;

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: org } = await adminClient
      .from('organizations')
      .select('max_seats')
      .eq('id', orgId)
      .single();

    const { data: memberLinks } = await adminClient
      .from('user_organizations')
      .select('user_id, role, created_at')
      .eq('organization_id', orgId);

    if (!memberLinks || memberLinks.length === 0) {
      return new Response(JSON.stringify({
        members: [],
        maxSeats: org?.max_seats || 5,
        currentCount: 0,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const memberDetails = [];
    for (const link of memberLinks) {
      const { data: { user: memberUser } } = await adminClient.auth.admin.getUserById(link.user_id);
      memberDetails.push({
        userId: link.user_id,
        email: memberUser?.email || 'unknown',
        role: link.role || 'member',
        createdAt: link.created_at,
      });
    }

    return new Response(JSON.stringify({
      members: memberDetails,
      maxSeats: org?.max_seats || 5,
      currentCount: memberDetails.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});

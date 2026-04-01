import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NAVER_CLIENT_ID = Deno.env.get('NAVER_CLIENT_ID')!;
const NAVER_CLIENT_SECRET = Deno.env.get('NAVER_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Supabase Redirect URLs에 등록된 URL
const REDIRECT_URL = `${SUPABASE_URL}/functions/v1/auth-redirect`;

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) {
    return new Response('Missing code parameter', { status: 400 });
  }

  try {
    // 1. 네이버 토큰 교환
    const tokenRes = await fetch('https://nid.naver.com/oauth2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: NAVER_CLIENT_ID,
        client_secret: NAVER_CLIENT_SECRET,
        code,
        state: state || '',
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      return new Response(`Naver token error: ${tokenData.error_description}`, { status: 400 });
    }

    // 2. 네이버 프로필 조회
    const profileRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profileData = await profileRes.json();

    if (profileData.resultcode !== '00') {
      return new Response(`Naver profile error: ${profileData.message}`, { status: 400 });
    }

    const profile = profileData.response;
    const email = profile.email;
    const name = profile.name || profile.nickname || '';

    if (!email) {
      return new Response('Naver account has no email', { status: 400 });
    }

    // 3. Supabase admin으로 유저 생성/조회
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 유저 생성 시도 (이미 존재하면 에러 → generateLink로 진행)
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        full_name: name,
        avatar_url: profile.profile_image || '',
        provider_id: profile.id,
        auth_provider: 'naver',
      },
      app_metadata: {
        provider: 'naver',
        providers: ['naver'],
      },
    });

    if (newUser?.user) {
      // 신규 유저
    } else if (createError && createError.message?.includes('already been registered')) {
      // 기존 유저 → user_metadata만 업데이트 (generateLink에서 email로 찾음)
      // generateLink가 email 기반이라 user 객체 불필요
    } else if (createError) {
      return new Response(`Failed to create user: ${createError.message}`, { status: 500 });
    }

    // 4. Magic link 생성 → verify URL로 리다이렉트
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: {
        redirectTo: REDIRECT_URL,
      },
    });

    if (linkError || !linkData) {
      return new Response(`Failed to generate link: ${linkError?.message}`, { status: 500 });
    }

    // generateLink가 반환하는 action_link를 따라가면 세션이 생성됨
    const verifyUrl = linkData.properties?.action_link;

    if (!verifyUrl) {
      return new Response('Failed to get verify URL', { status: 500 });
    }

    // 브라우저를 verify URL로 리다이렉트 → Supabase가 세션 생성 → redirect_to로 이동
    return new Response(null, {
      status: 302,
      headers: { Location: verifyUrl },
    });

  } catch (error) {
    return new Response(`Internal error: ${(error as Error).message}`, { status: 500 });
  }
});

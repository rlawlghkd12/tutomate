# 라이선스 → 조직 기반 SaaS 전환 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 라이선스 키 기반 시스템을 제거하고, OAuth 로그인 시 자동 조직 생성 + 초대 코드 기반 멀티 조직 구조로 전환

**Architecture:** DB 마이그레이션 (PK 변경 + is_active + org_invites) → 신규 Edge Functions 5개 → authStore 리팩터 (licenseStore 삭제) → reloadStores 분리 → App.tsx 온보딩 삭제 → SettingsPage 계정 섹션 → MemberManagementPage 초대 코드

**Tech Stack:** TypeScript, Zustand, Supabase Edge Functions (Deno), React, shadcn/ui, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-license-to-org-design.md`

---

### Task 1: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/20260407000000_multi_org_invites.sql`

- [ ] **Step 1: 마이그레이션 SQL 작성**

```sql
-- supabase/migrations/20260407000000_multi_org_invites.sql

-- 1. organizations.license_key nullable 변경
ALTER TABLE organizations ALTER COLUMN license_key DROP NOT NULL;

-- 2. user_organizations PK를 복합키로 변경 + is_active 추가
ALTER TABLE user_organizations DROP CONSTRAINT user_organizations_pkey;
ALTER TABLE user_organizations ADD PRIMARY KEY (user_id, organization_id);
ALTER TABLE user_organizations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- 유저당 active 조직 1개만 허용
CREATE UNIQUE INDEX idx_user_active_org ON user_organizations (user_id) WHERE is_active = true;

-- 3. get_user_org_id() 함수 수정 (RLS 정책 자동 반영)
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_organizations
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 4. user_organizations SELECT 정책 확장 (다른 org 행도 본인 것은 조회 가능)
-- 기존 정책은 이미 user_id = auth.uid()로 되어있어 변경 불필요

-- 5. org_invites 테이블 신규
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 0,
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
-- Edge Function(service_role)만 접근 — RLS policy 없음
```

- [ ] **Step 2: 로컬 Supabase에 마이그레이션 적용**

Run: `supabase db reset` (로컬 테스트 환경)
Expected: 에러 없이 완료

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/20260407000000_multi_org_invites.sql
git commit -m "feat: 멀티 조직 + 초대 코드 DB 마이그레이션"
```

---

### Task 2: 신규 Edge Functions (5개)

**Files:**
- Create: `supabase/functions/auto-create-org/index.ts`
- Create: `supabase/functions/join-organization/index.ts`
- Create: `supabase/functions/create-invite/index.ts`
- Create: `supabase/functions/switch-organization/index.ts`
- Create: `supabase/functions/list-my-organizations/index.ts`

- [ ] **Step 1: auto-create-org**

```ts
// supabase/functions/auto-create-org/index.ts
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

    // 이미 조직에 속해있으면 활성 조직 반환
    const { data: existingLinks } = await adminClient
      .from('user_organizations')
      .select('organization_id, role, is_active')
      .eq('user_id', user.id);

    if (existingLinks && existingLinks.length > 0) {
      const activeLink = existingLinks.find((l: any) => l.is_active) || existingLinks[0];
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

    // 새 trial 조직 생성
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
        is_active: true,
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
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
```

- [ ] **Step 2: join-organization**

```ts
// supabase/functions/join-organization/index.ts
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

    // 초대 코드 조회
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

    // 만료 체크
    if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'expired' }), {
        status: 410, headers: corsHeaders,
      });
    }

    // 사용량 체크
    if (invite.max_uses > 0 && invite.used_count >= invite.max_uses) {
      return new Response(JSON.stringify({ error: 'max_uses_reached' }), {
        status: 410, headers: corsHeaders,
      });
    }

    const orgId = invite.organization_id;

    // 이미 이 조직에 속해있는지 확인
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

    // max_seats 체크
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

    // 기존 활성 조직 비활성화
    await adminClient
      .from('user_organizations')
      .update({ is_active: false })
      .eq('user_id', user.id)
      .eq('is_active', true);

    // 새 조직 연결
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

    // 초대 사용량 증가
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
```

- [ ] **Step 3: create-invite**

```ts
// supabase/functions/create-invite/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0,O,1,I 제외 (혼동 방지)
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

    // owner 확인
    const { data: callerLink } = await userClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single();

    if (!callerLink || callerLink.role !== 'owner') {
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
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
```

- [ ] **Step 4: switch-organization**

```ts
// supabase/functions/switch-organization/index.ts
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

    const { organization_id } = await req.json();
    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'missing_organization_id' }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 해당 조직에 소속되어 있는지 확인
    const { data: targetLink } = await adminClient
      .from('user_organizations')
      .select('role')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .single();

    if (!targetLink) {
      return new Response(JSON.stringify({ error: 'not_member' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // 전체 비활성화 → 대상만 활성화
    await adminClient
      .from('user_organizations')
      .update({ is_active: false })
      .eq('user_id', user.id);

    await adminClient
      .from('user_organizations')
      .update({ is_active: true })
      .eq('user_id', user.id)
      .eq('organization_id', organization_id);

    const { data: org } = await adminClient
      .from('organizations')
      .select('plan')
      .eq('id', organization_id)
      .single();

    return new Response(JSON.stringify({
      organization_id,
      plan: org?.plan || 'trial',
      role: targetLink.role,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: corsHeaders,
    });
  }
});
```

- [ ] **Step 5: list-my-organizations**

```ts
// supabase/functions/list-my-organizations/index.ts
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
```

- [ ] **Step 6: 커밋**

```bash
git add supabase/functions/auto-create-org/ supabase/functions/join-organization/ supabase/functions/create-invite/ supabase/functions/switch-organization/ supabase/functions/list-my-organizations/
git commit -m "feat: 신규 Edge Functions 5개 — auto-create-org, join, invite, switch, list"
```

---

### Task 3: reloadAllStores 분리

**Files:**
- Create: `packages/core/src/stores/reloadStores.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: reloadStores.ts 생성**

`licenseStore.ts`에서 `reloadAllStores()` + `invalidateAllStores()`를 분리:

```ts
// packages/core/src/stores/reloadStores.ts
import { clearAllCache } from '../utils/dataHelper';
import { useCourseStore } from './courseStore';
import { useStudentStore } from './studentStore';
import { useEnrollmentStore } from './enrollmentStore';
import { useMonthlyPaymentStore } from './monthlyPaymentStore';
import { usePaymentRecordStore } from './paymentRecordStore';

function invalidateAllStores(): void {
  useCourseStore.getState().invalidate();
  useStudentStore.getState().invalidate();
  useEnrollmentStore.getState().invalidate();
  useMonthlyPaymentStore.getState().invalidate();
  usePaymentRecordStore.getState().invalidate();
}

export async function reloadAllStores(): Promise<void> {
  await clearAllCache();
  invalidateAllStores();
  useCourseStore.setState({ courses: [] });
  useStudentStore.setState({ students: [] });
  useEnrollmentStore.setState({ enrollments: [] });
  useMonthlyPaymentStore.setState({ payments: [] });
  usePaymentRecordStore.setState({ records: [] });
  await Promise.all([
    useCourseStore.getState().loadCourses(),
    useStudentStore.getState().loadStudents(),
    useEnrollmentStore.getState().loadEnrollments(),
    useMonthlyPaymentStore.getState().loadPayments(),
    usePaymentRecordStore.getState().loadRecords(),
  ]);
}
```

- [ ] **Step 2: index.ts에서 export 변경**

```ts
// 기존:
export { useLicenseStore, reloadAllStores } from './stores/licenseStore';
// 변경:
export { reloadAllStores } from './stores/reloadStores';
```

`useLicenseStore` export은 아직 유지 (Task 5에서 제거).

- [ ] **Step 3: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`

- [ ] **Step 4: 커밋**

```bash
git add packages/core/src/stores/reloadStores.ts packages/core/src/index.ts
git commit -m "refactor: reloadAllStores를 독립 모듈로 분리"
```

---

### Task 4: authStore 리팩터

**Files:**
- Modify: `packages/core/src/stores/authStore.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/stores/__tests__/authStore.test.ts`

- [ ] **Step 1: AuthStore 인터페이스 변경**

```ts
interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  plan: PlanType | null;
  role: 'owner' | 'member' | null;
  isCloud: boolean;
  loading: boolean;
  // needsSetup 삭제
  initialize: () => Promise<void>;
  joinOrganization: (code: string) => Promise<
    | { status: 'success'; organizationId: string; plan: PlanType; role: string }
    | { status: 'invalid_code' | 'expired' | 'already_member' | 'max_seats_reached' | 'error' }
  >;
  switchOrganization: (orgId: string) => Promise<boolean>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: (callbackUrl: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

제거: `needsSetup`, `activateCloud`, `startTrial`, `deactivateCloud`

- [ ] **Step 2: initialize() 재작성**

```ts
initialize: async () => {
  if (_initializing || _initialized) return;
  _initializing = true;
  set({ loading: true });

  if (!supabase) {
    logWarn('Supabase not configured');
    set({ loading: false });
    _initializing = false;
    return;
  }

  try {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session || session.user.is_anonymous) {
      if (session?.user.is_anonymous) await supabase.auth.signOut();
      set({ session: null, loading: false });
      return;
    }

    // 활성 조직 조회
    const { data: orgLink } = await supabase
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', session.user.id)
      .eq('is_active', true)
      .single();

    if (orgLink) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('plan')
        .eq('id', orgLink.organization_id)
        .single();

      set({
        session,
        organizationId: orgLink.organization_id,
        plan: (orgData?.plan as PlanType) || PlanTypeEnum.TRIAL,
        role: (orgLink.role as 'owner' | 'member') || 'member',
        isCloud: true,
        loading: false,
      });
      _initialized = true;
      return;
    }

    // 조직 없음 → 자동 생성
    const { data: autoResult, error: autoError } = await supabase.functions.invoke('auto-create-org');

    if (autoError || autoResult?.error) {
      logError('Auto-create org failed', { error: autoError || autoResult?.error });
      set({ session, loading: false });
      return;
    }

    set({
      session,
      organizationId: autoResult.organization_id,
      plan: (autoResult.plan as PlanType) || PlanTypeEnum.TRIAL,
      role: (autoResult.role as 'owner' | 'member') || 'owner',
      isCloud: true,
      loading: false,
    });
    _initialized = true;
  } catch (error) {
    logError('Failed to initialize auth', { error });
    set({ loading: false });
  } finally {
    _initializing = false;
  }
},
```

- [ ] **Step 3: joinOrganization 추가**

```ts
joinOrganization: async (code: string) => {
  if (!supabase) return { status: 'error' as const };

  try {
    const { data, error } = await supabase.functions.invoke('join-organization', {
      body: { code },
    });

    if (error) return { status: 'error' as const };

    if (data?.error) {
      const errorMap: Record<string, any> = {
        invalid_code: { status: 'invalid_code' },
        expired: { status: 'expired' },
        already_member: { status: 'already_member' },
        max_seats_reached: { status: 'max_seats_reached' },
      };
      return errorMap[data.error] || { status: 'error' };
    }

    set({
      organizationId: data.organization_id,
      plan: (data.plan as PlanType) || PlanTypeEnum.TRIAL,
      role: data.role as 'owner' | 'member',
    });

    return {
      status: 'success' as const,
      organizationId: data.organization_id,
      plan: (data.plan as PlanType) || PlanTypeEnum.TRIAL,
      role: data.role,
    };
  } catch {
    return { status: 'error' as const };
  }
},
```

- [ ] **Step 4: switchOrganization 추가**

```ts
switchOrganization: async (orgId: string) => {
  if (!supabase) return false;

  try {
    const { data, error } = await supabase.functions.invoke('switch-organization', {
      body: { organization_id: orgId },
    });

    if (error || data?.error) return false;

    set({
      organizationId: data.organization_id,
      plan: (data.plan as PlanType) || PlanTypeEnum.TRIAL,
      role: data.role as 'owner' | 'member',
    });

    return true;
  } catch {
    return false;
  }
},
```

- [ ] **Step 5: signOut 추가 (deactivateCloud 대체)**

```ts
signOut: async () => {
  if (!supabase) return;
  try {
    await supabase.auth.signOut();
  } catch (error) {
    logError('Sign out error', { error });
  }
  set({
    session: null,
    organizationId: null,
    plan: null,
    role: null,
    isCloud: false,
  });
  _initialized = false;
},
```

- [ ] **Step 6: 기존 메서드 삭제**

`activateCloud`, `startTrial`, `deactivateCloud`, `needsSetup` 관련 코드 모두 삭제.
`getDeviceId()` 함수 삭제 (사용처 없어짐).
초기값에서 `needsSetup: false` 삭제.

- [ ] **Step 7: index.ts export 업데이트**

```ts
// 기존에서 제거: migrateOrgData (사용처 없어짐)
// signOut은 store 메서드라 별도 export 불필요
export { useAuthStore, isCloud, getOrgId, getPlan, isOwner, getAuthProvider, getAuthProviderLabel, getAuthProviderColor } from './stores/authStore';
```

- [ ] **Step 8: authStore.test.ts 업데이트**

- `activateCloud`, `startTrial`, `deactivateCloud`, `needsSetup` 관련 테스트 삭제
- `initialize` 테스트: `is_active: true` 필터 추가, auto-create-org 호출 테스트
- 신규: `joinOrganization`, `switchOrganization`, `signOut` 테스트

- [ ] **Step 9: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`

- [ ] **Step 10: 커밋**

```bash
git add packages/core/src/stores/authStore.ts packages/core/src/stores/__tests__/authStore.test.ts packages/core/src/index.ts
git commit -m "refactor: authStore 라이선스 제거 + auto-create-org + joinOrganization + switchOrganization"
```

---

### Task 5: licenseStore 삭제

**Files:**
- Delete: `packages/core/src/stores/licenseStore.ts`
- Delete: `packages/core/src/stores/__tests__/licenseStore.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/types/index.ts`

- [ ] **Step 1: index.ts에서 licenseStore export 제거**

```ts
// 제거:
export { useLicenseStore, reloadAllStores } from './stores/licenseStore';
export type { ActivateResult } from './stores/licenseStore';

// reloadAllStores는 이미 Task 3에서 reloadStores.ts로 이전됨
```

- [ ] **Step 2: types/index.ts에서 LicenseInfo 제거**

```ts
// 제거:
export interface LicenseInfo {
  licenseKey: string;
  activatedAt: string;
}
```

- [ ] **Step 3: licenseStore.ts + licenseStore.test.ts 파일 삭제**

```bash
rm packages/core/src/stores/licenseStore.ts packages/core/src/stores/__tests__/licenseStore.test.ts
```

- [ ] **Step 4: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
일부 테스트 실패 가능 (다른 파일에서 licenseStore import) — Task 6에서 수정

- [ ] **Step 5: 커밋**

```bash
git add -A
git commit -m "refactor: licenseStore 삭제 + LicenseInfo 타입 제거"
```

---

### Task 6: App.tsx 온보딩 삭제 (tutomate + Q)

**Files:**
- Modify: `apps/tutomate/src/App.tsx`
- Modify: `apps/tutomate-q/src/App.tsx`

- [ ] **Step 1: tutomate App.tsx 정리**

제거할 것:
- `licenseStore` import (`loadLicense`, `activateLicense`)
- `LicenseKeyInput` import
- `needsSetup` state 참조
- `startTrial` 참조
- `licenseInput`, `activating`, `showMigrateDialog`, `migrateResolve` state
- `handleActivateLicense` 함수
- `handleStartTrial` 함수
- `migrateOrgData` import
- `needsSetup` Dialog (라이선스 키 입력 UI 전체)
- `showMigrateDialog` AlertDialog (데이터 이전 다이얼로그)
- `loadLicense()` useEffect 호출

`deactivateCloud`를 사용하는 곳이 있으면 `signOut`으로 교체.

- [ ] **Step 2: tutomate-q App.tsx 동일 정리**

동일한 변경 적용.

- [ ] **Step 3: TypeScript 빌드 확인**

Run: `npx tsc -b apps/tutomate --noEmit && npx tsc -b apps/tutomate-q --noEmit`

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/src/App.tsx apps/tutomate-q/src/App.tsx
git commit -m "refactor: App.tsx 라이선스 온보딩 다이얼로그 삭제"
```

---

### Task 7: SettingsPage 계정 섹션 전환

**Files:**
- Modify: `apps/tutomate/src/pages/SettingsPage.tsx`
- Modify: `apps/tutomate-q/src/pages/SettingsPage.tsx`

- [ ] **Step 1: tutomate SettingsPage 정리**

라이선스 관련 코드 삭제:
- `useLicenseStore` import 및 모든 참조 (`getPlan`, `activateLicense`, `licenseKey`)
- `LicenseKeyInput` import
- 라이선스 키 표시/복사 UI
- 라이선스 활성화 모달
- 라이선스 데이터 이전 AlertDialog

대체 UI (계정 섹션):
- 현재 플랜 배지 (`useAuthStore.plan`)
- 초대 코드 입력 (Input + Button → `joinOrganization()` 호출)
- 조직 전환 (소속 조직 목록 → `switchOrganization()` + `reloadAllStores()`)
- 로그아웃 (`signOut()`)

`getPlan()` 호출은 `useAuthStore.plan || 'trial'`로 대체.

- [ ] **Step 2: tutomate-q SettingsPage 동일 정리**

- [ ] **Step 3: TypeScript 빌드 + 테스트 확인**

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/src/pages/SettingsPage.tsx apps/tutomate-q/src/pages/SettingsPage.tsx
git commit -m "refactor: SettingsPage 라이선스 → 계정 섹션 전환"
```

---

### Task 8: MemberManagementPage에 초대 코드 생성 추가

**Files:**
- Modify: `packages/ui/src/components/members/MemberManagementPage.tsx`

- [ ] **Step 1: 초대 코드 생성 기능 추가**

헤더 영역에 "초대 코드 생성" 버튼 추가:

```tsx
const [inviteCode, setInviteCode] = useState<string | null>(null);
const [creatingInvite, setCreatingInvite] = useState(false);

const handleCreateInvite = async () => {
  if (!supabase) return;
  setCreatingInvite(true);
  try {
    const { data, error } = await supabase.functions.invoke('create-invite', {
      body: { expires_in_days: 7, max_uses: 0 },
    });
    if (error || data?.error) {
      toast.error('초대 코드 생성에 실패했습니다.');
      return;
    }
    setInviteCode(data.code);
    toast.success('초대 코드가 생성되었습니다.');
  } catch {
    toast.error('초대 코드 생성에 실패했습니다.');
  } finally {
    setCreatingInvite(false);
  }
};
```

초대 코드 표시 + 복사:
```tsx
{inviteCode && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', background: 'hsl(var(--muted))', borderRadius: 8, marginBottom: '1rem' }}>
    <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 600 }}>{inviteCode}</span>
    <Button variant="outline" size="sm" onClick={() => {
      navigator.clipboard.writeText(inviteCode);
      toast.success('복사되었습니다.');
    }}>
      복사
    </Button>
  </div>
)}
```

- [ ] **Step 2: 커밋**

```bash
git add packages/ui/src/components/members/MemberManagementPage.tsx
git commit -m "feat: MemberManagementPage 초대 코드 생성 기능"
```

---

### Task 9: LicenseKeyInput 삭제 + UI exports 정리

**Files:**
- Delete: `packages/ui/src/components/common/LicenseKeyInput.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: LicenseKeyInput 파일 삭제**

```bash
rm packages/ui/src/components/common/LicenseKeyInput.tsx
```

- [ ] **Step 2: index.ts에서 export 제거**

```ts
// 제거:
export { default as LicenseKeyInput } from './components/common/LicenseKeyInput';
```

- [ ] **Step 3: TypeScript 빌드 확인**

Run: `npx tsc -b apps/tutomate --noEmit && npx tsc -b apps/tutomate-q --noEmit`

- [ ] **Step 4: 커밋**

```bash
git add -A
git commit -m "refactor: LicenseKeyInput 삭제 + UI exports 정리"
```

---

### Task 10: 전체 테스트 + 정리

**Files:**
- All modified files

- [ ] **Step 1: 전체 테스트**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`

- [ ] **Step 2: TypeScript 빌드**

Run: `npx tsc -b apps/tutomate --noEmit && npx tsc -b apps/tutomate-q --noEmit`

- [ ] **Step 3: 남은 licenseStore 참조 검색**

Run: `grep -r "licenseStore\|useLicenseStore\|LicenseKeyInput\|activateCloud\|startTrial\|deactivateCloud\|needsSetup\|LICENSE_KEY\|app-license" packages/ apps/ --include="*.ts" --include="*.tsx" -l`

발견된 참조가 있으면 제거/수정.

- [ ] **Step 4: Edge Function 로컬 테스트 메모**

```bash
supabase functions serve auto-create-org --no-verify-jwt
supabase functions serve join-organization --no-verify-jwt
supabase functions serve create-invite --no-verify-jwt
supabase functions serve switch-organization --no-verify-jwt
supabase functions serve list-my-organizations --no-verify-jwt
```

- [ ] **Step 5: 최종 커밋**

```bash
git commit -m "chore: 라이선스→조직 전환 최종 정리"
```

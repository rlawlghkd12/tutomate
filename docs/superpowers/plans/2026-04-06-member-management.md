# Member Management 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Owner가 자신의 조직 멤버를 조회/강퇴할 수 있는 멤버 관리 기능 구현

**Architecture:** authStore에 `role` 필드 추가 → Edge Function 2개 (멤버 조회, 강퇴) → 공통 UI 컴포넌트 (packages/ui) → 앱 라우트/네비게이션 연결

**Tech Stack:** TypeScript, Zustand, Supabase Edge Functions (Deno), React, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-03-member-management-design.md`

---

### Task 1: authStore에 role 필드 추가

**Files:**
- Modify: `packages/core/src/stores/authStore.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/stores/__tests__/authStore.test.ts`

- [ ] **Step 1: AuthStore 인터페이스에 role 필드 추가**

`packages/core/src/stores/authStore.ts`의 `AuthStore` 인터페이스 (line 46)에 `role` 추가:

```ts
interface AuthStore {
  session: Session | null;
  organizationId: string | null;
  plan: PlanType | null;
  role: 'owner' | 'member' | null; // 현재 조직에서의 역할
  isCloud: boolean;
  loading: boolean;
  needsSetup: boolean;
  initialize: () => Promise<void>;
  // ... 나머지 기존 메서드
}
```

초기값에 `role: null` 추가 (line 64-70):

```ts
export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  organizationId: null,
  plan: null,
  role: null,
  isCloud: false,
  loading: true,
  needsSetup: false,
  // ...
```

- [ ] **Step 2: initialize()에서 role 조회**

`initialize()` 내 `user_organizations` 쿼리를 변경 (line 98-102):

```ts
// 변경 전:
const { data: orgLink, error: orgLinkError } = await supabase
  .from('user_organizations')
  .select('organization_id')
  .eq('user_id', session.user.id)
  .single();

// 변경 후:
const { data: orgLink, error: orgLinkError } = await supabase
  .from('user_organizations')
  .select('organization_id, role')
  .eq('user_id', session.user.id)
  .single();
```

`set()` 호출에 `role` 추가 (line 117-123):

```ts
set({
  session,
  organizationId: orgLink.organization_id,
  plan: (orgData?.plan as PlanType) || PlanTypeEnum.TRIAL,
  role: (orgLink.role as 'owner' | 'member') || 'member',
  isCloud: true,
  loading: false,
});
```

- [ ] **Step 3: activateCloud에서도 role 설정**

`activateCloud()` 내 `set()` 호출 (line 238-244)에 `role` 추가. 라이선스 활성화 시 owner가 되므로:

```ts
set({
  session,
  organizationId,
  plan,
  role: 'owner',
  isCloud: true,
  needsSetup: false,
});
```

- [ ] **Step 4: startTrial에서도 role 설정**

`startTrial()` 내 `set()` (line 289-296)에 `role` 추가:

```ts
set({
  session,
  organizationId,
  plan,
  role: 'owner',
  isCloud: true,
  loading: false,
  needsSetup: false,
});
```

- [ ] **Step 5: deactivateCloud에서 role 초기화**

`deactivateCloud()` 내 `set()` (line 326-332)에 `role: null` 추가:

```ts
set({
  session: null,
  organizationId: null,
  plan: null,
  role: null,
  isCloud: false,
  needsSetup: false,
});
```

- [ ] **Step 6: isOwner 헬퍼 추가**

파일 하단 (line 401 근처, 기존 헬퍼 함수들 옆)에 추가:

```ts
export const isOwner = (): boolean => useAuthStore.getState().role === 'owner';
```

- [ ] **Step 7: index.ts에서 isOwner export**

`packages/core/src/index.ts` line 23의 authStore export에 `isOwner` 추가:

```ts
export { useAuthStore, isCloud, getOrgId, getPlan, isOwner, migrateOrgData, getAuthProvider, getAuthProviderLabel, getAuthProviderColor } from './stores/authStore';
```

- [ ] **Step 8: authStore.test.ts 업데이트**

기존 `initialize` 테스트의 mock에서 `role` 반환 추가. `packages/core/src/stores/__tests__/authStore.test.ts`에서 `user_organizations` 쿼리 mock의 `createQueryBuilder` 반환값에 `role: 'owner'` 포함:

```ts
// 기존 initialize 성공 테스트에서:
mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-123', role: 'owner' });

// 새 테스트 추가:
it('initialize — role이 member이면 state에 member 저장', async () => {
  mockGetSession.mockResolvedValue({ data: { session: mockSession } });
  mockFromHandlers['user_organizations'] = createQueryBuilder({ organization_id: 'org-123', role: 'member' });
  mockFromHandlers['organizations'] = createQueryBuilder({ plan: 'basic' });

  await useAuthStore.getState().initialize();

  expect(useAuthStore.getState().role).toBe('member');
});

it('isOwner — role=owner이면 true', () => {
  useAuthStore.setState({ role: 'owner' });
  expect(isOwner()).toBe(true);
});

it('isOwner — role=member이면 false', () => {
  useAuthStore.setState({ role: 'member' });
  expect(isOwner()).toBe(false);
});

it('isOwner — role=null이면 false', () => {
  useAuthStore.setState({ role: null });
  expect(isOwner()).toBe(false);
});
```

- [ ] **Step 9: 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과

- [ ] **Step 10: 커밋**

```bash
git add packages/core/src/stores/authStore.ts packages/core/src/stores/__tests__/authStore.test.ts packages/core/src/index.ts
git commit -m "feat: authStore에 role 필드 + isOwner 헬퍼 추가"
```

---

### Task 2: get-org-members Edge Function

**Files:**
- Create: `supabase/functions/get-org-members/index.ts`

- [ ] **Step 1: Edge Function 작성**

```ts
// supabase/functions/get-org-members/index.ts
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

    // 요청자 인증
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

    // 요청자의 org + role 확인
    const { data: callerLink } = await userClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!callerLink) {
      return new Response(JSON.stringify({ error: 'no_organization' }), {
        status: 403, headers: corsHeaders,
      });
    }

    if (callerLink.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'owner_only' }), {
        status: 403, headers: corsHeaders,
      });
    }

    const orgId = callerLink.organization_id;

    // service role client로 멤버 목록 조회
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // org 정보 (max_seats)
    const { data: org } = await adminClient
      .from('organizations')
      .select('max_seats')
      .eq('id', orgId)
      .single();

    // 멤버 목록 (user_organizations)
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

    // auth.users에서 이메일 조회
    const userIds = memberLinks.map((m: any) => m.user_id);
    const memberDetails = [];

    for (const uid of userIds) {
      const { data: { user: memberUser } } = await adminClient.auth.admin.getUserById(uid);
      const link = memberLinks.find((m: any) => m.user_id === uid);
      memberDetails.push({
        userId: uid,
        email: memberUser?.email || 'unknown',
        role: link?.role || 'member',
        createdAt: link?.created_at,
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
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/get-org-members/index.ts
git commit -m "feat: get-org-members Edge Function — 멤버 목록 조회"
```

---

### Task 3: remove-org-member Edge Function

**Files:**
- Create: `supabase/functions/remove-org-member/index.ts`

- [ ] **Step 1: Edge Function 작성**

```ts
// supabase/functions/remove-org-member/index.ts
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

    // 요청자 인증
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

    // 요청 본문
    const body = await req.json();
    const { userId } = body;
    if (!userId) {
      return new Response(JSON.stringify({ error: 'missing_user_id' }), {
        status: 400, headers: corsHeaders,
      });
    }

    // 요청자의 org + role 확인
    const { data: callerLink } = await userClient
      .from('user_organizations')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single();

    if (!callerLink || callerLink.role !== 'owner') {
      return new Response(JSON.stringify({ error: 'owner_only' }), {
        status: 403, headers: corsHeaders,
      });
    }

    // 본인 제거 불가
    if (userId === user.id) {
      return new Response(JSON.stringify({ error: 'cannot_remove_self' }), {
        status: 400, headers: corsHeaders,
      });
    }

    const orgId = callerLink.organization_id;

    // 대상이 같은 org 소속인지 확인
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

    // 멤버 제거
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
```

- [ ] **Step 2: 커밋**

```bash
git add supabase/functions/remove-org-member/index.ts
git commit -m "feat: remove-org-member Edge Function — 멤버 강퇴"
```

---

### Task 4: MemberManagementPage 공통 컴포넌트

**Files:**
- Create: `packages/ui/src/components/members/MemberManagementPage.tsx`
- Modify: `packages/ui/src/index.ts`

- [ ] **Step 1: MemberManagementPage 컴포넌트 작성**

```tsx
// packages/ui/src/components/members/MemberManagementPage.tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Badge, Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '../../index';
import { supabase, useAuthStore } from '@tutomate/core';
import { Users, Trash2, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface Member {
  userId: string;
  email: string;
  role: 'owner' | 'member';
  createdAt: string;
}

interface MembersData {
  members: Member[];
  maxSeats: number;
  currentCount: number;
}

export function MemberManagementPage() {
  const [data, setData] = useState<MembersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null);
  const [removing, setRemoving] = useState(false);
  const currentUserId = useAuthStore((s) => s.session?.user?.id);

  const loadMembers = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('get-org-members');
      if (error) {
        toast.error('멤버 목록을 불러오지 못했습니다.');
        return;
      }
      setData(result as MembersData);
    } catch {
      toast.error('멤버 목록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleRemove = async () => {
    if (!supabase || !removeTarget) return;
    setRemoving(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('remove-org-member', {
        body: { userId: removeTarget.userId },
      });
      if (error || result?.error) {
        const msg = result?.error === 'cannot_remove_self'
          ? '본인은 제거할 수 없습니다.'
          : '멤버 제거에 실패했습니다.';
        toast.error(msg);
        return;
      }
      toast.success(`${removeTarget.email} 멤버를 제거했습니다.`);
      setRemoveTarget(null);
      await loadMembers();
    } catch {
      toast.error('멤버 제거에 실패했습니다.');
    } finally {
      setRemoving(false);
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch {
      return '-';
    }
  };

  return (
    <div className="page-enter" style={{ padding: '2rem', maxWidth: 800 }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Users style={{ width: 24, height: 24 }} />
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>멤버 관리</h1>
          {data && (
            <Badge variant="secondary">
              {data.currentCount}/{data.maxSeats}명 사용 중
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={loadMembers} disabled={loading}>
          <RefreshCw style={{ width: 16, height: 16, marginRight: 4 }} />
          새로고침
        </Button>
      </div>

      {/* 테이블 */}
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <Loader2 style={{ width: 24, height: 24, animation: 'spin 1s linear infinite' }} />
        </div>
      ) : !data || data.members.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'hsl(var(--muted-foreground))' }}>
          멤버가 없습니다.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead style={{ width: 100 }}>역할</TableHead>
              <TableHead style={{ width: 150 }}>가입일</TableHead>
              <TableHead style={{ width: 80 }}>작업</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((member) => {
              const isMe = member.userId === currentUserId;
              return (
                <TableRow key={member.userId}>
                  <TableCell>
                    <span>{member.email}</span>
                    {isMe && (
                      <Badge variant="outline" style={{ marginLeft: 8 }}>나</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                      {member.role === 'owner' ? '관리자' : '멤버'}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatDate(member.createdAt)}</TableCell>
                  <TableCell>
                    {member.role !== 'owner' && !isMe && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveTarget(member)}
                        style={{ color: 'hsl(var(--destructive))' }}
                      >
                        <Trash2 style={{ width: 16, height: 16 }} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* 제거 확인 다이얼로그 */}
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>멤버 제거</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{removeTarget?.email}</strong> 멤버를 조직에서 제거하시겠습니까?
              제거된 멤버는 더 이상 이 조직의 데이터에 접근할 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={removing}
              style={{ background: 'hsl(var(--destructive))', color: 'white' }}
            >
              {removing ? '제거 중...' : '제거'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

- [ ] **Step 2: packages/ui/src/index.ts에 export 추가**

```ts
// Member components 섹션 추가 (Student components 아래)
export { MemberManagementPage } from './components/members/MemberManagementPage';
```

- [ ] **Step 3: 커밋**

```bash
git add packages/ui/src/components/members/MemberManagementPage.tsx packages/ui/src/index.ts
git commit -m "feat: MemberManagementPage 공통 컴포넌트"
```

---

### Task 5: Navigation에 멤버 관리 메뉴 추가

**Files:**
- Modify: `packages/ui/src/components/common/Navigation.tsx`

- [ ] **Step 1: Navigation에 owner 조건부 메뉴 추가**

```tsx
// packages/ui/src/components/common/Navigation.tsx
import { useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, BookOpen, Users, Calendar, DollarSign, Settings, UserCog } from 'lucide-react';
import { isOwner } from '@tutomate/core';

const mainItems = [
  { key: '/', icon: LayoutDashboard, label: '대시보드' },
  { key: '/courses', icon: BookOpen, label: '강좌 관리' },
  { key: '/students', icon: Users, label: '수강생 관리' },
  { key: '/calendar', icon: Calendar, label: '캘린더' },
  { key: '/revenue', icon: DollarSign, label: '수익 관리' },
];

const bottomItems = [
  { key: '/settings', icon: Settings, label: '설정' },
];

// ... 기존 navItemBase, navItemActive 스타일 유지 ...

const Navigation: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path === '/') return '/';
    return '/' + path.split('/').filter(Boolean)[0];
  };

  const selectedKey = getSelectedKey();

  // owner일 때만 멤버 관리 메뉴 포함
  const ownerItems = isOwner()
    ? [{ key: '/members', icon: UserCog, label: '멤버 관리' }]
    : [];

  const renderItem = (item: typeof mainItems[0]) => {
    // ... 기존 renderItem 그대로 유지 ...
  };

  return (
    <nav style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {mainItems.map(renderItem)}
      </div>
      <div style={{ marginTop: 'auto', borderTop: '1px solid hsl(var(--border))', paddingTop: 8, paddingBottom: 12 }}>
        {ownerItems.map(renderItem)}
        {bottomItems.map(renderItem)}
      </div>
    </nav>
  );
};

export default Navigation;
```

핵심 변경만 정리:
1. `UserCog` 아이콘 import 추가
2. `isOwner` import 추가
3. `ownerItems` 배열을 `isOwner()` 조건부로 생성
4. `bottomItems` 렌더링 앞에 `ownerItems` 렌더링 추가

- [ ] **Step 2: 커밋**

```bash
git add packages/ui/src/components/common/Navigation.tsx
git commit -m "feat: Navigation에 멤버 관리 메뉴 추가 (owner만 표시)"
```

---

### Task 6: 앱 라우트 추가 (tutomate + tutomate-q)

**Files:**
- Modify: `apps/tutomate/src/App.tsx`
- Modify: `apps/tutomate-q/src/App.tsx`

- [ ] **Step 1: tutomate App.tsx에 라우트 추가**

`apps/tutomate/src/App.tsx`:

1. import 추가 (line 2의 기존 import에 `MemberManagementPage` 추가):

```ts
import { Layout, ErrorBoundary, UpdateChecker, LockScreen, LicenseKeyInput, Button, Dialog, DialogContent, DialogHeader, DialogTitle, AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel, MemberManagementPage } from '@tutomate/ui';
```

2. Route 추가 (line 264, `/settings` Route 앞에):

```tsx
<Route path="/members" element={<MemberManagementPage />} />
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 2: tutomate-q App.tsx에 동일한 라우트 추가**

`apps/tutomate-q/src/App.tsx`:

1. import에 `MemberManagementPage` 추가
2. Route 추가 (동일 위치)

```tsx
<Route path="/members" element={<MemberManagementPage />} />
<Route path="/settings" element={<SettingsPage />} />
```

- [ ] **Step 3: TypeScript 빌드 확인**

Run: `npx tsc -b apps/tutomate --noEmit && npx tsc -b apps/tutomate-q --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add apps/tutomate/src/App.tsx apps/tutomate-q/src/App.tsx
git commit -m "feat: 멤버 관리 라우트 추가 (tutomate + Q)"
```

---

### Task 7: 전체 테스트 + 정리

**Files:**
- All modified files

- [ ] **Step 1: 전체 테스트 실행**

Run: `pnpm --filter @tutomate/core run test -- --reporter=default`
Expected: 모든 테스트 통과

- [ ] **Step 2: TypeScript 빌드 확인**

Run: `npx tsc -b apps/tutomate --noEmit && npx tsc -b apps/tutomate-q --noEmit`
Expected: 에러 없음

- [ ] **Step 3: Edge Function 배포 메모**

배포 시 `--no-verify-jwt` 플래그 필요:
```bash
supabase functions deploy get-org-members --no-verify-jwt
supabase functions deploy remove-org-member --no-verify-jwt
```

- [ ] **Step 4: 최종 커밋 (필요 시)**

```bash
git commit -m "chore: 멤버 관리 기능 최종 정리"
```

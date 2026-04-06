# 라이선스 키 제거 + 조직 기반 SaaS 구조 전환

## 배경

현재 라이선스 키 기반 시스템:
- 유저가 OAuth 로그인 후 라이선스 키를 입력해야 조직 연결
- `license_keys` 테이블로 키 생성/관리
- `needsSetup` 다이얼로그에서 키 입력 또는 체험판 선택

목표: 일반 SaaS 구조로 전환
- 로그인하면 자동 조직 생성, 바로 사용
- 초대 코드로 다른 조직 가입
- 멀티 조직 소속 + 전환 가능
- 플랜은 admin이 직접 부여

## 설계

### 1. DB 변경

#### 1-1. `user_organizations` PK 변경 + `is_active` 추가

```sql
-- user_organizations PK를 복합키로 변경
ALTER TABLE user_organizations DROP CONSTRAINT user_organizations_pkey;
ALTER TABLE user_organizations ADD PRIMARY KEY (user_id, organization_id);

-- 활성 조직 표시 (한 유저당 1개만 active)
ALTER TABLE user_organizations ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true;

-- 유저당 active 조직 1개만 허용 (데이터 무결성)
CREATE UNIQUE INDEX idx_user_active_org ON user_organizations (user_id) WHERE is_active = true;
```

#### 1-2. `get_user_org_id()` 함수 수정

```sql
CREATE OR REPLACE FUNCTION get_user_org_id()
RETURNS UUID AS $$
  SELECT organization_id FROM user_organizations
  WHERE user_id = auth.uid() AND is_active = true
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;
```

기존 RLS 정책은 이 함수를 참조하므로 변경 불필요.

#### 1-3. `org_invites` 테이블 신규

```sql
CREATE TABLE org_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  max_uses INTEGER DEFAULT 0, -- 0 = 무제한
  used_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
-- service_role only (Edge Function에서만 접근)
```

초대 코드 형식: 8자 영숫자 (예: `A3K9M2X7`). 라이선스 키와 구분됨.

#### 1-4. `organizations.license_key` nullable 처리

```sql
ALTER TABLE organizations ALTER COLUMN license_key DROP NOT NULL;
```

기존 데이터는 유지. 신규 조직은 `license_key = null`.

### 2. Edge Functions (신규, 기존 미수정)

기존 함수(`activate-license`, `create-trial-org`, `generate-license`)는 프로덕션에서 그대로 유지. 신규 함수만 추가.

#### 2-1. `auto-create-org`

로그인 시 조직이 없는 유저에게 자동 조직 생성.

- 인증: JWT 필수
- 조건: `user_organizations`에 해당 user_id 행이 0개일 때만
- 처리:
  1. `organizations` INSERT: name = '내 학원', plan = 'trial', max_seats = 1, license_key = null
  2. `user_organizations` INSERT: user_id, organization_id, role = 'owner', is_active = true
- 반환: `{ organization_id, plan, role, is_new_org }`
- 이미 조직 있으면: 첫 번째 조직 정보 반환 (생성 안 함)

#### 2-2. `join-organization`

초대 코드로 조직 가입.

- 인증: JWT 필수
- 입력: `{ code }`
- 처리:
  1. `org_invites`에서 code 조회
  2. 만료/사용량 체크
  3. `user_organizations` INSERT: user_id, organization_id, role = 'member', is_active = true
  4. 기존 활성 조직들 is_active = false로 변경 (새 조직이 active)
  5. `org_invites.used_count` += 1
- 반환: `{ organization_id, plan, role }`
- 에러: `invalid_code`, `expired`, `max_uses_reached`, `already_member`

#### 2-3. `create-invite`

Owner가 초대 코드 생성.

- 인증: JWT 필수, owner만
- 입력: `{ expires_in_days?, max_uses? }` (선택)
- 처리:
  1. 요청자의 org + role 확인 (owner만)
  2. 8자 랜덤 코드 생성
  3. `org_invites` INSERT
- 반환: `{ code, expires_at, max_uses }`

#### 2-4. `switch-organization`

활성 조직 전환.

- 인증: JWT 필수
- 입력: `{ organization_id }`
- 처리:
  1. 해당 user_id + organization_id 조합이 `user_organizations`에 있는지 확인
  2. 유저의 모든 `user_organizations` 행 is_active = false
  3. 대상 행만 is_active = true
- 반환: `{ organization_id, plan, role }`

#### 2-5. `list-my-organizations`

내 소속 조직 목록.

- 인증: JWT 필수
- 처리: `user_organizations` JOIN `organizations` WHERE user_id = auth.uid()
- 반환: `{ organizations: [{ id, name, plan, role, is_active }] }`

### 3. authStore 변경

#### 3-1. 상태 변경

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
    | { status: 'invalid_code' | 'expired' | 'already_member' | 'error' }
  >;
  switchOrganization: (orgId: string) => Promise<boolean>;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  handleOAuthCallback: (callbackUrl: string) => Promise<void>;
  signOut: () => Promise<void>;
}
```

#### 3-2. initialize() 흐름 변경

```
1. getSession()
2. 세션 없으면 → 로그인 화면
3. user_organizations 조회 (is_active = true)
4. 있으면 → 기존처럼 org/plan/role 설정
5. 없으면 → auto-create-org Edge Function 호출 → 자동 조직 생성
6. set({ organizationId, plan, role, isCloud: true, loading: false })
```

needsSetup 분기 완전 제거. 자동 복구 로직(라이선스 키 재활성화) 제거.

#### 3-3. 제거 대상

- `activateCloud(licenseKey)` → `joinOrganization(code)`로 대체
- `startTrial()` → 삭제 (auto-create-org가 대체)
- `deactivateCloud()` → `signOut()`으로 단순화 (조직 떠나기 ≠ 로그아웃)
- 라이선스 키 자동 복구 로직 삭제

### 4. licenseStore 처리

**삭제**. 역할이 없어짐:
- 라이선스 키 저장/검증 → 불필요
- 플랜 조회 → authStore에서 직접
- 플랜 리밋 → `planLimits.ts` 그대로 유지, authStore.plan으로 조회

`reloadAllStores()` 함수는 현재 licenseStore에 있지만 여러 곳에서 사용 중 — `packages/core/src/stores/licenseStore.ts`에서 독립 유틸로 분리하여 `packages/core/src/stores/reloadStores.ts`로 이동. 기존 export 경로 유지.

`licenseStore` import/export 모두 제거. `PLAN_LIMITS`와 `PlanTypeEnum`은 `planLimits.ts`에서 직접 사용.

### 5. UI 변경

#### 5-1. App.tsx (tutomate + Q)

- `needsSetup` 분기 삭제 → 라이선스/체험판 다이얼로그 삭제
- `LicenseKeyInput` import 삭제
- `licenseStore` import 삭제
- OAuth 로그인 → 바로 앱 진입

#### 5-2. SettingsPage

라이선스 섹션 → "계정" 섹션:
- 현재 조직 이름 + 플랜 배지
- 조직 전환 (소속 조직 목록 + 전환 버튼)
- 초대 코드 입력 (다른 조직 가입)
- 로그아웃 버튼

#### 5-3. MemberManagementPage

기존 멤버 목록 + 강퇴에 추가:
- "초대 코드 생성" 버튼 → `create-invite` 호출 → 코드 표시 + 복사
- 활성 초대 코드 목록 (선택사항, V2로 미룰 수 있음)

#### 5-4. Navigation

- 변경 없음 (이미 `isOwner()` 조건으로 멤버 관리 표시)

#### 5-5. 삭제 대상 컴포넌트

- `LicenseKeyInput.tsx` → 삭제
- `AdminTab.tsx` 내 라이선스 생성 UI → 삭제 or 초대 코드 생성으로 전환
- 데이터 마이그레이션 다이얼로그 (App.tsx) → 삭제 (초대 코드 가입은 다른 조직의 member로 들어가는 것이므로 데이터 이전 의미 없음)

#### 5-6. device_id 처리

`user_organizations.device_id` 컬럼은 OAuth 전환 후 불필요. 신규 Edge Function에서 무시. 기존 컬럼은 nullable로 유지, 추후 마이그레이션으로 정리.

#### 5-7. max_seats 유지

`organizations.max_seats` 유지 — 조직당 멤버 수 제한 용도. `auto-create-org`에서 기본값 5 설정. `join-organization`에서 max_seats 초과 시 `max_seats_reached` 에러 반환.

### 6. Admin 앱 영향

- `LicensesPage` → deprecated (초대 코드 기반으로 전환하거나 삭제)
- `OrganizationsPage` → 유지 (플랜 변경 기능 그대로)
- `admin-users` Edge Function → 유지 (plan 변경, 유저 관리)
- `generate-license` → 호출 안 함 (삭제 안 해도 됨)

### 7. 마이그레이션 전략

기존 유저 영향:
- `user_organizations`에 이미 행이 있으므로 `auto-create-org` 호출 안 됨
- PK 변경 + `is_active` 추가 마이그레이션 필요
- 기존 행에 `is_active = true` 기본값

기존 라이선스 키:
- DB에 유지 (삭제 안 함)
- 앱에서 더 이상 사용 안 함
- 추후 정리 시 별도 마이그레이션

### 8. 영향 범위 요약

| 카테고리 | 신규 | 수정 | 삭제 |
|---------|------|------|------|
| DB 마이그레이션 | `org_invites` 테이블, `is_active` 컬럼 | `user_organizations` PK, `get_user_org_id()` 함수, `organizations.license_key` nullable | - |
| Edge Functions | `auto-create-org`, `join-organization`, `create-invite`, `switch-organization`, `list-my-organizations` | - | - (기존 유지) |
| Stores | - | `authStore.ts` (대폭) | `licenseStore.ts` |
| UI | 조직 전환 UI (SettingsPage), 초대 코드 생성 (MemberManagementPage) | `App.tsx` (2개), `SettingsPage` (2개) | `LicenseKeyInput.tsx`, needsSetup 다이얼로그 |
| Core exports | - | `index.ts` (licenseStore 제거, 신규 함수 추가) | licenseStore exports |
| Tests | authStore 테스트 대폭 변경 | licenseStore 테스트 삭제 | - |

### 9. 변경하지 않는 것

- DB 데이터 테이블 (courses, students, enrollments 등)
- RLS 정책 (get_user_org_id 함수만 수정, 정책 자체는 유지)
- 기존 Edge Functions (프로덕션 영향 없음)
- `planLimits.ts` (PLAN_LIMITS 구조 유지)
- `packages/ui` 컴포넌트 (MemberManagementPage 외)

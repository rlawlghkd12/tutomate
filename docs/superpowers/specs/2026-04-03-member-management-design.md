# Member Management (멤버 관리)

## Summary

Owner가 자신의 조직에 소속된 멤버를 조회하고 강퇴할 수 있는 페이지. 사이드바에 "멤버 관리" 메뉴 추가 (owner만 표시). 초대는 기존 라이선스 키 공유 방식 유지.

## Requirements

- Owner만 접근 가능 (사이드바에서 owner가 아닌 경우 숨김)
- 같은 조직의 멤버 목록 조회: 이메일, 역할(owner/member), 가입일
- 멤버 강퇴 기능 (owner 본인 제거 불가)
- max_seats 대비 현재 인원 표시 ("2/5명 사용 중")

## Architecture

### authStore 변경

`user_organizations` 조회 시 `role` 필드를 함께 가져와서 authStore에 저장.

현재: `.select('organization_id')`
변경: `.select('organization_id, role')`

```ts
// authStore 추가 필드
interface AuthStore {
  // ... 기존 필드
  role: 'owner' | 'member' | null; // 현재 조직에서의 역할
}

// initialize()에서:
const { data: orgLink } = await supabase
  .from('user_organizations')
  .select('organization_id, role')
  .eq('user_id', session.user.id)
  .single();

set({
  // ... 기존 필드
  role: orgLink.role as 'owner' | 'member',
});
```

`isOwner()` 헬퍼 export:
```ts
export const isOwner = () => useAuthStore.getState().role === 'owner';
```

### Edge Functions (신규)

`--no-verify-jwt` 플래그 사용 (기존 admin Edge Function과 동일 패턴).

**`get-org-members`**
- 인증된 유저의 organization_id로 `user_organizations` + `auth.users` 조인
- owner만 호출 가능 (role 체크)
- 반환: `{ members: [{ userId, email, role, createdAt }], maxSeats, currentCount }`

**`remove-org-member`**
- owner만 호출 가능
- 본인 제거 불가
- `user_organizations` 레코드 삭제
- 반환: `{ success: true }`

### Frontend

**MemberManagementPage** (`packages/ui/src/components/members/MemberManagementPage.tsx`)
- 공통 컴포넌트로 `packages/ui`에 배치 (tutomate, tutomate-q 공유)
- 각 앱에서는 라우트만 추가하고 이 컴포넌트 import
- 라우트: `/members`
- 상단: "멤버 관리" 제목 + "2/5명 사용 중" 배지
- 테이블: 이메일 | 역할 | 가입일 | 작업(제거)
- owner 행은 제거 버튼 없음 + "나" 배지
- 제거 시 AlertDialog 확인

### Navigation

- `packages/ui/src/components/common/Navigation.tsx` 수정
- `isOwner()`로 owner 여부 판단
- owner일 때만 "멤버 관리" 메뉴 아이템 추가 (Users 아이콘)

## Data Flow

```
MemberManagementPage
  → supabase.functions.invoke('get-org-members')
  → Edge Function: user_organizations JOIN auth.users WHERE org_id = X
  → 반환: members[], maxSeats, currentCount
  → 테이블 렌더링

제거 버튼 클릭
  → AlertDialog 확인
  → supabase.functions.invoke('remove-org-member', { userId })
  → Edge Function: DELETE user_organizations WHERE user_id = Y AND org_id = X
  → 목록 새로고침
```

## Files to Create/Modify

| 파일 | 변경 |
|------|------|
| `supabase/functions/get-org-members/index.ts` | 신규 - 멤버 목록 조회 |
| `supabase/functions/remove-org-member/index.ts` | 신규 - 멤버 제거 |
| `packages/ui/src/components/members/MemberManagementPage.tsx` | 신규 - 멤버 관리 공통 컴포넌트 |
| `packages/ui/src/index.ts` | export 추가 |
| `apps/tutomate/src/App.tsx` | 라우트 추가 |
| `apps/tutomate-q/src/App.tsx` | 라우트 추가 |
| `packages/ui/src/components/common/Navigation.tsx` | 메뉴 아이템 추가 (owner 조건) |
| `packages/core/src/stores/authStore.ts` | `role` 필드 추가, `isOwner()` export |
| `packages/core/src/index.ts` | `isOwner` export 추가 |

## Out of Scope

- 초대 시스템 (라이선스 키 공유로 대체)
- 역할 변경 (owner → member, member → owner)
- 조직 설정 (이름 변경, 플랜 변경)
- deviceId 표시 (OAuth 전환으로 불필요)

# Member Management (멤버 관리)

## Summary

Owner가 자신의 조직에 소속된 멤버를 조회하고 강퇴할 수 있는 페이지. 사이드바에 "멤버 관리" 메뉴 추가 (owner만 표시). 초대는 기존 라이선스 키 공유 방식 유지.

## Requirements

- Owner만 접근 가능 (사이드바에서 owner가 아닌 경우 숨김)
- 같은 조직의 멤버 목록 조회: 이메일, 역할(owner/member), 기기 정보
- 멤버 강퇴 기능 (owner 본인 제거 불가)
- max_seats 대비 현재 인원 표시 ("2/5명 사용 중")

## Architecture

### Edge Functions (신규)

**`get-org-members`**
- 인증된 유저의 organization_id로 `user_organizations` + `auth.users` 조인
- owner만 호출 가능 (role 체크)
- 반환: `{ members: [{ userId, email, role, deviceId }], maxSeats, currentCount }`

**`remove-org-member`**
- owner만 호출 가능
- 본인 제거 불가
- `user_organizations` 레코드 삭제
- 반환: `{ success: true }`

### Frontend

**MemberManagementPage** (`apps/tutomate/src/pages/MemberManagementPage.tsx`, 동일하게 Q 버전)
- 라우트: `/members`
- 사이드바 메뉴 추가 (owner일 때만 표시)
- 상단: "멤버 관리" 제목 + "2/5명 사용 중" 배지
- 테이블: 이메일 | 역할 | 기기 | 작업(제거)
- owner 행은 제거 버튼 없음
- 제거 시 Popconfirm 확인

### Navigation

- `packages/ui/src/components/common/Navigation.tsx` 수정
- owner 여부를 `user_organizations.role`로 판단
- owner일 때만 "멤버 관리" 메뉴 아이템 추가

## Data Flow

```
MemberManagementPage
  → supabase.functions.invoke('get-org-members')
  → Edge Function: user_organizations JOIN auth.users WHERE org_id = X
  → 반환: members[], maxSeats, currentCount
  → 테이블 렌더링

제거 버튼 클릭
  → supabase.functions.invoke('remove-org-member', { userId })
  → Edge Function: DELETE user_organizations WHERE user_id = Y AND org_id = X
  → 목록 새로고침
```

## Files to Create/Modify

| 파일 | 변경 |
|------|------|
| `supabase/functions/get-org-members/index.ts` | 신규 - 멤버 목록 조회 |
| `supabase/functions/remove-org-member/index.ts` | 신규 - 멤버 제거 |
| `apps/tutomate/src/pages/MemberManagementPage.tsx` | 신규 - 멤버 관리 페이지 |
| `apps/tutomate-q/src/pages/MemberManagementPage.tsx` | 신규 - Q 버전 동일 |
| `apps/tutomate/src/App.tsx` | 라우트 추가 |
| `apps/tutomate-q/src/App.tsx` | 라우트 추가 |
| `packages/ui/src/components/common/Navigation.tsx` | 메뉴 아이템 추가 (owner 조건) |
| `packages/core/src/stores/authStore.ts` | owner 여부 조회 함수 추가 (또는 기존 활용) |

## Out of Scope

- 초대 시스템 (라이선스 키 공유로 대체)
- 역할 변경 (owner → member, member → owner)
- 조직 설정 (이름 변경, 플랜 변경)

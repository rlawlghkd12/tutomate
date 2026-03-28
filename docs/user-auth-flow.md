# 신규 유저 인증 플로우

앱 최초 실행부터 라이선스 활성화까지의 전체 흐름을 정리한다.

---

## 1. 앱 초기화 (authStore.initialize)

```
앱 실행
  │
  ▼
supabase.auth.getSession()
  │
  ├─ 세션 있음 → user_organizations 조회 → org 복원
  │
  └─ 세션 없음
      │
      ▼
    signInAnonymously() → 익명 세션 생성
      │
      ▼
    user_organizations 조회 (user_id)
      │
      ├─ 연결된 org 있음 → org 복원 (재방문 기기)
      │
      └─ 연결된 org 없음
          │
          ▼
        Edge Function: create-trial-org(device_id)
          │
          ▼
        trial org 생성 + user_organizations 연결
          │
          ▼
        체험판 모드로 시작 (plan: 'trial')
```

### 주요 상태값

| 필드 | 값 |
|------|------|
| `session` | 익명 세션 |
| `organizationId` | trial org UUID (A) |
| `plan` | `'trial'` |
| `isCloud` | `true` |

### 기기 식별자 (device_id)

- Electron: `window.electronAPI.getMachineId()` → SHA-256 해시
- 브라우저: `localStorage`에 저장된 `crypto.randomUUID()` → SHA-256 해시
- 대문자로 통일 후 해시 처리
- **체험판 org 생성/복원에만 사용** (라이선스와 무관)

---

## 2. 체험판 사용

```
사용자 → 강좌/수강생/수강등록/월별납부 데이터 입력
                  │
                  ▼
          모든 데이터는 organization_id = A 로 저장
          (courses, students, enrollments, monthly_payments)
```

### 체험판 제한 (planLimits)

| 항목 | trial | basic |
|------|-------|-------|
| 강좌 수 | 3 | 무제한 |
| 수강생 수 | 15 | 무제한 |

---

## 3. 라이선스 활성화

진입점: 설정 페이지 또는 웰컴 모달의 라이선스 키 입력

```
라이선스 키 입력 (TMK[HA]-XXXX-XXXX-XXXX)
  │
  ▼
licenseStore.activateLicense(key)
  │
  ▼
키 형식 검증 ──실패──→ 'invalid_format' → "유효하지 않은 형식"
  │
  ▼ (통과)
authStore.activateCloud(key)
  │
  ▼
Edge Function: activate-license(license_key, device_id)
  │
  ├─ invalid_key → "유효하지 않은 키"
  ├─ max_seats_reached → "최대 사용자 수 도달"
  ├─ error → "서버 오류"
  │
  └─ success
      │
      ▼
    previousOrgId = A (현재 trial org)
    newOrgId = B (라이선스 org)
    orgChanged = (A ≠ B)
      │
      ▼
    state 전환: organizationId → B, plan → 'basic'
      │
      ▼
    orgChanged 여부 분기
```

---

## 4. 데이터 이전 선택 (orgChanged = true)

체험판 org(A)와 라이선스 org(B)가 다를 때 사용자에게 선택지를 제공한다.

```
┌──────────────────────────────────┐
│   Modal: "체험판 데이터 이전"      │
│                                   │
│   체험판에서 입력한 데이터를        │
│   라이선스 계정으로 이전하시겠습니까?│
│                                   │
│   [이전]          [새로 시작]      │
└───────┬──────────────┬────────────┘
        │              │
        ▼              ▼
    "이전" 선택     "새로 시작" 선택
```

### "이전" 선택

```
migrateOrgData(oldOrgId=A, newOrgId=B)
  │
  ▼
supabase.rpc('migrate_org_data')  ← SECURITY DEFINER (RLS 우회)
  │
  ▼
UPDATE courses           SET organization_id = B WHERE organization_id = A
UPDATE students          SET organization_id = B WHERE organization_id = A
UPDATE enrollments       SET organization_id = B WHERE organization_id = A
UPDATE monthly_payments  SET organization_id = B WHERE organization_id = A
  │
  ▼
기존 체험판 데이터가 라이선스 org(B)으로 이동
→ "라이선스가 활성화되었습니다! 기존 데이터가 이전되었습니다."
```

### "새로 시작" 선택

```
마이그레이션 없음
  │
  ▼
org A 데이터는 DB에 그대로 남음 (접근 불가)
org B는 빈 상태
→ "라이선스가 활성화되었습니다! 새로 시작합니다."
```

### orgChanged = false (동일 org 업그레이드)

trial → basic으로 plan만 변경되는 경우. 데이터 이전 불필요.

```
→ "라이선스가 활성화되었습니다! 플랜이 업그레이드되었습니다."
```

---

## 5. 로그아웃 (라이선스 비활성화)

```
licenseStore.deactivateLicense()
  │
  ├─ authStore.deactivateCloud()
  │    ├─ user_organizations 행 삭제 (org 연결 해제)
  │    └─ supabase.auth.signOut()
  │
  ├─ clearAllCache() (Electron 캐시 파일 초기화)
  │
  ├─ 스토어 초기화 (courses, students, enrollments, payments → [])
  │
  └─ localStorage에서 라이선스 키 삭제
       │
       ▼
     앱 재시작 시 → 새 익명 세션 → 새 trial org 생성
     (이전 라이선스 org 데이터에 접근 불가)
```

---

## 전체 흐름 요약

```
┌────────┐   signInAnonymously   ┌───────────┐   create-trial-org   ┌───────────┐
│ 앱 실행 │ ──────────────────→  │ 익명 세션  │ ─────────────────→  │ trial org  │
└────────┘                       └───────────┘    (device_id)       │ (A, trial) │
                                                                     └─────┬─────┘
                                                                           │
                                                                      체험판 사용
                                                                           │
                                                                           ▼
┌──────────────┐   activate-license   ┌──────────────────┐   migrateOrgData?
│ 라이선스 입력  │ ─────────────────→  │ 라이선스 org (B)  │ ←─── 이전 / 새로시작
└──────────────┘    (license_key)      │ plan: 'basic'    │
                                       └────────┬─────────┘
                                                 │
                                            라이선스 사용
                                                 │
                                                 ▼
                                  ┌───────────────────────────┐
                                  │ 로그아웃                    │
                                  │ → user_organizations 삭제  │
                                  │ → 캐시 초기화               │
                                  │ → 재시작 시 새 trial org    │
                                  └───────────────────────────┘
```

---

## 관련 코드

| 파일 | 역할 |
|------|------|
| `packages/core/src/stores/authStore.ts` | 세션/org 관리, `activateCloud`, `deactivateCloud`, `migrateOrgData` |
| `packages/core/src/stores/licenseStore.ts` | 라이선스 키 검증, `activateLicense`, `deactivateLicense` |
| `packages/core/src/utils/dataHelper.ts` | `clearAllCache` (Electron 캐시 초기화) |
| `supabase/functions/create-trial-org/` | 체험판 org 생성 Edge Function |
| `supabase/functions/activate-license/` | 라이선스 검증 + org 연결 Edge Function |
| `supabase/migrations/20260327000001_add_migrate_org_data.sql` | `migrate_org_data` DB 함수 |
| `supabase/migrations/20260327000000_add_uo_delete_policy.sql` | `user_organizations` 삭제 RLS 정책 |

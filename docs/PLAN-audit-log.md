# PLAN — 이벤트 로그(감사 로그) 시스템

> **Why this doc**: 오늘 통도예술마을 정산 정리 과정에서 데이터 변경 이력이 없어 원인 추적이 불가능했다. 모든 쓰기 작업에 대한 **불변 감사 로그**를 도입해 같은 사고 재발 시 즉시 추적/복구 근거를 확보한다.

- **Intent**: feature (신규)
- **Slug**: `audit-log`
- **Target complexity**: **COMPLEX** (3 phases, 13 tasks, 신규 파일 7개 이상, system_keywords: auditability/RLS/immutable log)
- **Doc sync**: local (`docs/`)
- **Template Foundation**: none (제로베이스 — DB 1 테이블 + core stores 로거 주입)

---

## 1. C4 Level 1 — Context

```
┌───────────────────────────────────────┐   ┌────────────────────────────┐
│  일반 앱 (tutomate / tutomate-q)       │   │  admin 앱 (apps/admin)     │
│  사용자: 학원 운영자 / 강사            │   │  사용자: 플랫폼 관리자       │
│                                        │   │                             │
│  ┌────────────────────────────────┐   │   │  ┌──────────────────────┐  │
│  │ Zustand Stores (write ops)     │   │   │  │ ActivityLogPage ★    │  │
│  │ enrollment/paymentRecord/...   │   │   │  │ (전역 이벤트 조회 UI) │  │
│  └────────┬───────────────────────┘   │   │  └──────────┬───────────┘  │
│           │ (자동 로깅)                │   │             │               │
│     ★ NEW │                            │   │             │ (읽기 전용)    │
│  ┌────────▼───────────────────────┐   │   │             │               │
│  │ eventLogger (utils)             │   │   │   ┌─────────▼──────────┐   │
│  │ logEvent(type, entity, before,  │   │   │   │ eventLogStore ★    │   │
│  │          after, meta)           │   │   │   │ loadRecent, filter  │   │
│  │ best-effort, try/catch          │   │   │   └─────────┬──────────┘   │
│  └────────┬───────────────────────┘   │   └─────────────┼───────────────┘
│           │                            │                 │
└───────────┼────────────────────────────┘                 │
            │ INSERT (org-scoped)                           │ SELECT (admin-only)
            │                                                │
            ▼                                                ▼
         ┌────────────────────────────────────────────────────┐
         │  Supabase  —  event_logs 테이블                     │
         │  INSERT-only, RLS (조직 격리 INSERT + admin SELECT)  │
         └────────────────────────────────────────────────────┘
```

---

## 2. Architecture (C4 Level 2 요약)

### 2.1 데이터 계층

**신규 테이블**: `event_logs`

```sql
create table event_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid,                        -- auth.users 참조 (soft link)
  actor_label text not null,                 -- 행위자 snapshot 이름
  event_type text not null,                  -- 'payment.add' 등
  entity_type text not null,                 -- 'payment_record' | 'enrollment' | ...
  entity_id uuid,                            -- nullable (bulk일 때)
  entity_label text,                         -- "김남희 — 숟가락난타" 등
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index idx_event_logs_org_time on event_logs(organization_id, created_at desc);
create index idx_event_logs_entity on event_logs(entity_type, entity_id, created_at desc);

alter table event_logs enable row level security;

-- INSERT: 자기 조직 이벤트만 (일반 앱에서 자동 로깅)
create policy event_logs_insert_by_org on event_logs
  for insert with check (organization_id = current_setting('app.organization_id')::uuid);

-- SELECT: admin 유저만 (apps/admin 에서만 조회). 일반 앱에서는 조회 불가.
-- admin 판별 기준: admin_users 테이블에 user_id 존재 여부 (기존 admin 앱 auth 로직과 일치)
create policy event_logs_select_by_admin on event_logs
  for select using (
    exists (select 1 from admin_users au where au.user_id = auth.uid())
  );

-- UPDATE/DELETE 정책 없음 → 불변성 강제
```

> ⚠️ `admin_users` 테이블/판별 로직은 기존 admin 앱의 auth 방식과 정렬 필요. 없다면 Phase 1에서 함께 도입하거나 service role 기반 접근으로 대체.

### 2.2 애플리케이션 계층

**`packages/core/src/utils/eventLogger.ts`** (신규) — 공통 로깅 헬퍼
```ts
export async function logEvent(args: {
  eventType: string;
  entityType: 'payment_record' | 'enrollment' | 'student' | 'course' | 'organization';
  entityId?: string;
  entityLabel?: string;
  before?: any;
  after?: any;
  meta?: Record<string, any>;
}): Promise<void> {
  try {
    const orgId = useAuthStore.getState().organizationId;
    const user = useAuthStore.getState().currentUser;
    await supabase.from('event_logs').insert({
      organization_id: orgId,
      actor_user_id: user?.id ?? null,
      actor_label: user?.name ?? 'system',
      event_type: args.eventType,
      entity_type: args.entityType,
      entity_id: args.entityId,
      entity_label: args.entityLabel,
      payload: { before: args.before, after: args.after, meta: args.meta },
    });
  } catch (e) {
    // best-effort: 로깅 실패해도 원 action은 성공
    logWarn('event log failed', { e, args });
  }
}
```

**핵심 설계 결정**:
- **fire-and-forget 아님** — INSERT 실패 시 조용히 warn log만 (원 action의 성공/실패와 분리)
- **동기 await** — 비동기 로깅 경합 없고 순서 보장. 성능 영향 ≤ 50ms (동일 Supabase connection)
- **싱글턴 패턴 없음** — 그냥 함수 export, import해서 사용

**`packages/core/src/stores/eventLogStore.ts`** (신규) — 조회용
```ts
interface EventLogStore {
  logs: EventLog[];
  loadRecentLogs: (filters?: { entityType?; entityId?; eventTypes?: string[]; since?: string }) => Promise<void>;
  getLogsByEntity: (type: string, id: string) => EventLog[];
}
```

### 2.3 Store 훅 예시 (paymentRecordStore)

```ts
addPayment: async (enrollmentId, amount, ...) => {
  const newRecord: PaymentRecord = { ... };
  const error = await helper.add(newRecord);
  if (error) { handleError(error); return null; }

  set({ records: [...get().records, newRecord] });
  await syncEnrollmentTotal(enrollmentId, courseFee, get().records);

  // ★ NEW: 로깅
  const enrollment = useEnrollmentStore.getState().getEnrollmentById(enrollmentId);
  const student = useStudentStore.getState().getStudentById(enrollment?.studentId ?? '');
  const course = useCourseStore.getState().getCourseById(enrollment?.courseId ?? '');
  await logEvent({
    eventType: amount < 0 ? 'payment.refund' : 'payment.add',
    entityType: 'payment_record',
    entityId: newRecord.id,
    entityLabel: `${student?.name ?? '?'} — ${course?.name ?? '?'}`,
    after: { amount, paidAt: newRecord.paidAt, paymentMethod, notes },
    meta: { enrollmentId },
  });

  return newRecord;
},
```

### 2.4 UI — **admin 앱 전용**

- **신규 페이지**: `apps/admin/src/pages/ActivityLogPage.tsx`
  - 전 조직의 이벤트를 조직 필터로 드릴다운 (admin은 모든 조직 조회 가능)
  - 필터: 기간 / 조직 / 이벤트 타입 / 행위자 / 엔티티
  - URL 파라미터로 초기 필터 설정 가능 (`/activity?entity_id=xxx`)
- **admin 사이드바**: "활동" 메뉴 추가 (`/activity`)
- **일반 앱**: UI 추가 없음. 학생/강좌 상세에 이력 섹션 없음. 쓰기 로깅만 동작.

---

## 3. Implementation Roadmap

### Phase 1 — Core Audit (결제·수강 로깅)

> **목표**: 데이터 이슈의 진원지인 결제/수강 변경을 100% 로깅.

| # | Task | 파일 | 비고 |
|---|------|------|------|
| 1.1 | DB 마이그레이션 — event_logs 테이블 + RLS 정책 | `supabase/migrations/20260420000000_add_event_logs.sql` | 신규 |
| 1.2 | eventLogger 유틸 + 타입 정의 | `packages/core/src/utils/eventLogger.ts`, `types/index.ts` | 신규 |
| 1.3 | paymentRecordStore에 로깅 훅 — add/update/delete/bulk_full/refund | `packages/core/src/stores/paymentRecordStore.ts` | 수정 |
| 1.4 | enrollmentStore에 로깅 훅 — add/updatePayment/withdraw/delete | `packages/core/src/stores/enrollmentStore.ts` | 수정 |
| 1.5 | 단위 테스트 — 각 action이 logEvent 호출 검증 | `packages/core/src/stores/__tests__/` | 추가 |

**Complexity**: MODERATE

### Phase 2 — Coverage Extension

> **목표**: 학생/강좌 CRUD + 일괄 작업 + 면제 처리 커버리지.

| # | Task | 파일 | 비고 |
|---|------|------|------|
| 2.1 | studentStore / courseStore에 로깅 훅 | `packages/core/src/stores/studentStore.ts`, `courseStore.ts` | 수정 |
| 2.2 | BulkPaymentForm / handleBulkFullPayment 로깅 (meta.bulk_count 포함) | `packages/ui/.../BulkPaymentForm.tsx`, `PaymentManagementTable.tsx` | 수정 |
| 2.3 | 면제 처리(exempt/unexempt) 이벤트 분리 | `enrollmentStore.ts` | 수정 |
| 2.4 | eventLogStore — 조회·필터 로직 | `packages/core/src/stores/eventLogStore.ts` | 신규 |

**Complexity**: MODERATE

### Phase 3 — Activity UI (admin 앱 전용)

> **목표**: 플랫폼 관리자가 admin 앱에서 전 조직의 이벤트를 조회. 일반 앱(tutomate/tutomate-q)에는 UI 전무.

| # | Task | 파일 | 비고 |
|---|------|------|------|
| 3.1 | eventLogStore — admin 전역 조회 (조직 무관 전체) + 필터 | `packages/core/src/stores/eventLogStore.ts` | 신규(Phase 2 task 2.4와 통합) |
| 3.2 | `ActivityLogPage` — 페이지네이션, 기간·조직·이벤트타입·행위자·엔티티 필터 | `apps/admin/src/pages/ActivityLogPage.tsx` | 신규 |
| 3.3 | 이벤트 카드 UI (before/after diff 뷰) | `packages/ui/src/components/audit/EventCard.tsx` | 신규 (공통 컴포넌트) |
| 3.4 | admin App.tsx — 사이드바 메뉴에 "활동" 추가 + `/activity` 라우트 | `apps/admin/src/App.tsx` | 수정 |
| 3.5 | 엔티티별 drill-down — `/activity?entity_type=enrollment&entity_id=xxx` 필터 자동 적용 | `apps/admin/src/pages/ActivityLogPage.tsx` | 동일 파일 |

**일반 앱 영향**: 없음 (쓰기 훅만 Phase 1·2에서 적용, UI 수정 없음)

**Complexity**: MODERATE

### Total

- **Phases**: 3
- **Tasks**: 14 (Phase 1: 5, Phase 2: 4, Phase 3: 5)
- **신규 파일**: 6 (migration, eventLogger, eventLogStore, ActivityLogPage, EventCard, test)
- **수정 파일**: 5 (4 core stores, admin App.tsx)
- **일반 앱(tutomate/tutomate-q) UI 수정**: **0** (쓰기 훅만, UI 무영향)
- **Complexity estimate**: **COMPLEX**

---

## 4. 이벤트 타입 카탈로그

| event_type | entity_type | 발생 위치 | payload.after 예시 |
|------------|-------------|-----------|---------------------|
| `payment.add` | payment_record | paymentRecordStore.addPayment | `{amount: 60000, paidAt, paymentMethod, notes}` |
| `payment.refund` | payment_record | addPayment (amount<0) | `{amount: -60000, notes: '수강 철회 환불'}` |
| `payment.update` | payment_record | updateRecord | `{before: {amount: 50k}, after: {amount: 60k}}` |
| `payment.delete` | payment_record | deletePayment | `{before: {amount, paidAt, paymentMethod}}` |
| `payment.bulk_full` | enrollment | handleBulkFullPayment | `{meta: {bulk_count: 11, course_id, total_amount}}` |
| `enrollment.add` | enrollment | addEnrollment | `{after: {studentId, courseId, quarter}}` |
| `enrollment.update_payment` | enrollment | updatePayment | `{before: {paid: 0, status: 'pending'}, after: {paid: 60k, status: 'completed'}}` |
| `enrollment.withdraw` | enrollment | withdrawEnrollment | `{meta: {refund_amount?}}` |
| `enrollment.delete` | enrollment | deleteEnrollment | `{before}` |
| `enrollment.exempt` | enrollment | updatePayment (isExempt=true) | — |
| `enrollment.unexempt` | enrollment | handleCancelExempt | — |
| `enrollment.import_from_quarter` | enrollment | handleImportFromQuarter | `{meta: {from_quarter, count}}` |
| `student.add/update/delete` | student | studentStore | — |
| `student.merge` | student | (신규 기능) | `{meta: {merged_from, merged_into}}` |
| `course.add/update/delete` | course | courseStore | — |

---

## 5. 리스크 및 완화

(detail in `RISKS-audit-log.md`)

- **R1**: 로깅 실패가 원 action 실패로 이어짐 → **try/catch + best-effort** 설계로 방지
- **R2**: payload 크기 폭증 → **변경된 필드만** before/after 기록, 대용량 fields (긴 notes 등) 자르기
- **R3**: 과거 데이터 소급 불가 → **시스템 도입 시점부터만** 기록. 과거 이슈는 현재 DB state로만
- **R4**: 성능 저하 (매 action +1 INSERT) → Phase 1 배포 후 실측. 문제 시 batch INSERT 또는 queue 도입
- **R5**: 로그 조회 시 RLS 성능 → `(organization_id, created_at desc)` 복합 인덱스로 100ms 이내 보장

---

## 6. Acceptance Checklist

- [ ] Phase 1 배포 후 "전체 완납" 버튼 한 번 눌렀을 때 `payment.bulk_full` 1건 + `payment.add` N건이 event_logs에 기록됨
- [ ] 의도적으로 supabase 연결 끊고 action 실행 시 원 action은 여전히 성공 (로깅만 실패)
- [ ] **일반 앱에서 supabase REST로 `event_logs` SELECT 시도 시 RLS로 차단** (빈 배열)
- [ ] **admin 앱에서 `/activity` 접속 시 전 조직 이벤트 조회 가능** (조직 필터로 특정 조직 drill-down)
- [ ] admin이 아닌 유저(일반 앱 사용자)의 auth token으로 SELECT 시도 → 결과 0건
- [ ] 기존 685 core 단위 테스트 100% 통과

---

## 7. Complexity Estimate

- **Classification**: **COMPLEX** (3 phases, 13 tasks, 7 신규 파일, system keyword: auditability·RLS·immutable log)
- **Phases needing design**: Phase 3 (Activity UI — 레이아웃 시안 필요)
- **Auto style / font**: modern / Bebas Neue (기존 앱 톤 유지)

---

## 8. Handoff

```json
{
  "skill": "da:plan",
  "status": "completed",
  "plan_file": "docs/PLAN-audit-log.md",
  "requirements_file": "docs/REQUIREMENTS-audit-log.md",
  "approval_status": "pending",
  "complexity_estimate": "COMPLEX",
  "template_foundation": {
    "frontend_template": "none",
    "backend_template": "none",
    "strategy": "zero-base"
  },
  "phase_count": 3,
  "total_tasks": 14,
  "design_needed_phases": [3],
  "auto_style": "modern",
  "auto_font": "Bebas Neue",
  "target_apps": {
    "write_logging": ["apps/tutomate", "apps/tutomate-q"],
    "read_ui": ["apps/admin"]
  }
}
```

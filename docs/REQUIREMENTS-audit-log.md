# REQUIREMENTS — 이벤트 로그(감사 로그) 시스템

## 1. 배경 (Why)

오늘 통도예술마을협동조합 정산 정리 과정에서 다음 문제가 드러났다:

| 발견된 이상 | 원인 추적 불가 사유 |
|------------|---------------------|
| Q1 중복 record 33쌍 (1,980,000원 초과 입력) | 누가 언제 "전체 완납" 버튼을 한 번 더 눌렀는지 기록 없음 |
| 정순지 천아트 4건 중복 record | 같은 날짜에 4번 결제 입력 — 의도/실수 구분 불가 |
| 박희숙 당구중급 90,000원 허위 입력 | 받은 적 없는데 시스템에 등록된 경위 불명 |
| withdrawn 학생 paid_amount drift | 환불 처리가 record 없이 paid만 0으로 수정된 흔적 |
| enrollment.paid_amount = 120k (분기 fee의 2배) | 누군가 수동 조정했지만 근거 없음 |

**모든 원인 공통**: 데이터 변경 이력이 남지 않아 사후 추적이 불가능.

## 2. 목표 (Goal)

**모든 데이터 변경에 대한 감사 가능성(auditability)을 확보한다.** 운영자 실수 / 시스템 버그 / 악의적 조작 어느 경우든 "언제, 누가, 무엇을, 어떻게 바꿨는가"를 1초 내에 조회할 수 있어야 한다.

### 2.1 SMART 목표

- **S**: 결제/수강/학생/강좌의 모든 변경 이벤트를 `event_logs` 테이블에 기록
- **M**: 변경 전후 값 diff + 행위자 + 타임스탬프 100% 커버
- **A**: 기존 Zustand store 함수에 logger 훅만 추가 (UI 로직 영향 0)
- **R**: 정산 이상 피드백 발생 시 원인 추적 시간 수 분 → 즉시
- **T**: 1차(핵심 결제/수강) 1주, 2차(학생/강좌+UI) 추가 1주

## 3. 접근 권한 (Access Control)

| 주체 | 쓰기(INSERT) | 읽기(SELECT) |
|------|--------------|-------------|
| **학원 운영자 / 강사** (tutomate / tutomate-q 앱) | ✅ 자기 조직 이벤트 자동 로깅 | ❌ 조회 UI 없음 |
| **플랫폼 관리자** (admin 앱) | (로깅 대상 아님) | ✅ 모든 조직 이벤트 조회 가능 |

- 일반 앱 사용자는 자기 활동이 로그로 남는지 **인지만 가능, 조회는 불가** (투명성 + 무결성)
- `/activity` 라우트는 **`apps/admin`에만** 존재. 일반 앱에는 UI 전무
- RLS: INSERT는 자기 조직만 / SELECT는 admin 유저만 (서비스 역할 또는 admin 메타데이터 확인)

## 4. 범위 (Scope)

### 4.1 In Scope — 로깅 대상 이벤트

#### A. 결제 관련 (최우선)
- `payment.add` — payment_records INSERT
- `payment.update` — amount/paid_at/payment_method/notes 변경
- `payment.delete` — payment_records DELETE
- `payment.bulk_full` — "전체 완납" 일괄 처리
- `payment.refund` — 음수 amount record 추가 (환불)

#### B. 수강(enrollment) 관련
- `enrollment.add` — 신규 수강 등록
- `enrollment.update_payment` — paid_amount/status/discount 변경 (PaymentForm)
- `enrollment.withdraw` — 철회
- `enrollment.delete` — 하드 삭제
- `enrollment.exempt` / `enrollment.unexempt` — 면제 / 면제 취소
- `enrollment.import_from_quarter` — 이전 분기 수강생 가져오기

#### C. 학생(student) 관련
- `student.add / update / delete`
- `student.merge` — 중복 계정 통합 (이향희 케이스)

#### D. 강좌(course) 관련
- `course.add / update / delete`

#### E. 조직/권한 (보조)
- `organization.member.add / remove / role_change`
- `auth.login / logout` (보조 — Supabase Auth 로그로 대체 가능)

### 3.2 Out of Scope
- 읽기 전용 조회 로그 (GET) — 개인정보 수위 높아지면 별도 정책
- 파일 업로드/내보내기 상세 (Excel/CSV export)
- 실시간 알림 (event → notification) — 별도 feature
- 장기 보관 / 외부 SIEM 연동

## 4. 이벤트 스키마

```typescript
interface EventLog {
  id: string;                    // uuid
  organization_id: string;        // 조직별 격리
  actor_user_id: string | null;   // auth.users.id (system이면 null)
  actor_label: string;            // "홍길동" or "system" (UI 표시용, 사용자 이름 바뀌어도 과거 보존)
  event_type: string;             // "payment.add" 등 (namespace.action)
  entity_type: 'payment_record'|'enrollment'|'student'|'course'|'organization';
  entity_id: string;              // 대상 레코드 id
  entity_label: string;           // "김남희 — 숟가락난타" 등 (표시용 snapshot)
  payload: {
    before?: any;                 // 변경 전 상태 (update/delete에서)
    after?: any;                  // 변경 후 상태 (add/update에서)
    meta?: Record<string, any>;   // 추가 컨텍스트 (bulk_count, source 등)
  };
  created_at: string;             // ISO8601
}
```

### 4.1 스키마 설계 원칙

- **불변**: event_logs는 INSERT-only. UPDATE/DELETE 금지 (RLS로 강제)
- **조직 격리**: RLS 정책 — 자기 조직의 로그만 조회
- **컴팩트**: before/after는 diff 최소화 (변경 필드만 포함)
- **표시 snapshot**: actor_label / entity_label을 저장해 이후 이름 바뀌어도 로그 가독성 유지

## 5. 비기능 요구 (NFR)

| 항목 | 요구 |
|------|------|
| **성능** | 로깅이 기존 action latency에 +50ms 이상 추가하지 않음 (비동기 INSERT) |
| **신뢰성** | 로깅 실패해도 원 action은 성공해야 함 (try/catch 격리) |
| **용량** | 평균 조직당 월 5,000건 예상. payload 평균 500바이트 → 월 2.5MB. 연 30MB 수준 — Supabase 여유 충분 |
| **보안** | RLS로 조직 격리. 로그 수정/삭제 불가 |
| **UX 영향** | UI 로직 무수정. store action 내부에만 logger 호출 |

## 6. 마이그레이션 전략

기존 데이터는 **소급 로깅 없음**. event_logs 도입 시점부터 기록. 이전 데이터는 DB state로만 존재(오늘 정리한 것 포함).

## 7. 성공 기준 (Acceptance)

- [ ] Q1 중복 입력 33건 같은 사건이 재발해도 "2026-04-20 14:35:22, 홍길동, payment.add 33회 연속, 동일 enrollment 33개" 같은 로그로 1분 내 특정 가능
- [ ] 개별 enrollment 상세에서 해당 학생의 모든 변경 이력 타임라인 표시
- [ ] 활동 기록 페이지에서 조직 전체 이벤트 기간/타입/행위자 필터 조회
- [ ] 기존 685개 단위 테스트 그대로 통과 (로깅이 기존 로직 영향 0)

## 8. 의존성

- Supabase 테이블 1개 추가
- RLS 정책 1개 추가
- Zustand stores 4개(enrollment/paymentRecord/student/course) 헬퍼 주입
- 신규 `eventLogStore.ts` + `utils/eventLogger.ts`
- UI 페이지 1개 신규 (`ActivityLogPage.tsx`) + 엔티티 상세 내 이력 섹션

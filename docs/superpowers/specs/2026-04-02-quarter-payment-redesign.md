# Quarter Payment Redesign

## Summary

월별 납부 시스템을 분기별 납부 시스템으로 전환한다. `monthly_payments` 테이블을 `payment_records` 테이블로 대체하여 납부 이력을 추적하고, UI를 분기 단위로 단순화한다.

## Requirements

- 분기 단위 납부 관리 (월별 쪼개기 제거)
- 부분 납부 지원: 여러 번에 나눠 납부 가능
- 납부 이력 추적: 언제 얼마 냈는지 기록
- 강좌는 영구 유지, 수강등록이 분기 단위
- 기존 데이터 마이그레이션 (완료)
- `monthly_payments` 테이블은 삭제하지 않고 유지

## Data Model

### payment_records 테이블 (신규, 마이그레이션 완료)

```sql
CREATE TABLE payment_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  paid_at DATE NOT NULL,
  payment_method TEXT,  -- 'cash', 'card', 'transfer'
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

하나의 enrollment에 여러 payment_records가 가능 (부분 납부).

### enrollments 테이블 변경

- `quarter`: 필수 필드로 승격 (enableQuarterSystem이 true인 경우)
- `enrolled_months`: 제거 (분기 단위이므로 월별 선택 불필요)
- `paid_amount`, `remaining_amount`, `payment_status`: 유지 (payment_records 합산 캐시)
- `paid_at`, `payment_method`: 유지 (마지막 납부 정보 캐시)
- `discount_amount`, `notes`: 유지

### PaymentRecord 타입 (신규)

```typescript
interface PaymentRecord {
  id: string;
  enrollmentId: string;
  amount: number;
  paidAt: string;       // YYYY-MM-DD
  paymentMethod?: PaymentMethod;
  notes?: string;
  createdAt: string;
}
```

## Architecture

### Store 변경

**paymentRecordStore (신규)** — `monthlyPaymentStore` 대체

```
addPayment(enrollmentId, amount, paymentMethod, paidAt, notes)
  → payment_records INSERT
  → enrollment paidAmount/status 재계산

deletePayment(id)
  → payment_records DELETE
  → enrollment paidAmount/status 재계산

loadPayments()
  → payment_records SELECT all for org

getPaymentsByEnrollmentId(enrollmentId)
  → 필터링된 이력 반환
```

핵심 로직: payment_records 변경 후 항상 enrollment 합산 갱신
```
totalPaid = SUM(payment_records.amount WHERE enrollmentId = X)
remainingAmount = (courseFee - discountAmount) - totalPaid
paymentStatus = totalPaid === 0 ? 'pending'
              : totalPaid < effectiveFee ? 'partial'
              : 'completed'
```

**enrollmentStore 변경**
- `updatePayment()`: paymentRecordStore에서 호출 (직접 호출 제거)
- `addEnrollment()`: 초기 납부금 있으면 paymentRecordStore.addPayment() 호출

### fieldMapper 추가

```typescript
interface PaymentRecordRow {
  id: string;
  organization_id: string;
  enrollment_id: string;
  amount: number;
  paid_at: string;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
}

mapPaymentRecordFromDb(row) → PaymentRecord
mapPaymentRecordToDb(record, orgId) → PaymentRecordRow
```

### quarterUtils 변경

- 제거: `quarterMonthToYYYYMM()`, `getQuarterMonths()`
- 유지: `getCurrentQuarter()`, `getQuarterOptions()`, `getQuarterLabel()`

## UI Changes

### EnrollmentForm

- `enrolledMonths` 체크박스 UI 제거
- 분기 선택 유지
- 초기 납부금 입력 시 paymentRecordStore.addPayment() 호출
- 월별 금액 분배 로직 제거

### PaymentManagementTable (신규, MonthlyPaymentTable 대체)

분기별 납부 현황 + expandable 납부 이력 테이블.

**메인 테이블 컬럼:**
| 이름 | 납부상태 | 납부액/수강료 | 잔액 | 액션 |

**expandable 행 (납부 이력):**
| 납부일 | 금액 | 방법 | 메모 | 삭제 |

**기능:**
- 분기 선택 드롭다운 (수강생 관리 탭과 연동)
- "납부" 버튼 → 모달: 금액, 방법, 날짜, 메모 입력
- "완납" 버튼 → 잔액 전액 납부 기록 자동 생성
- "전체 완납" 버튼 → 미납 수강생 전체 완납 처리
- 면제/면제취소 버튼 (기존과 동일)
- 할인 금액 인라인 편집 (기존과 동일)
- 납부 이력 행에서 개별 삭제 가능

### CourseDetailPage (양쪽 버전)

- "월별 납부" 탭 → "납부 관리" 탭으로 이름 변경
- MonthlyPaymentTable → PaymentManagementTable 교체
- quarterMonths prop 제거 (분기 선택은 PaymentManagementTable 내부에서 처리)

## Migration

DB 마이그레이션은 완료됨 (`20260402000000_add_payment_records.sql`):
- `payment_records` 테이블 생성
- `monthly_payments`에서 `amount > 0 AND status = 'paid' AND paid_at IS NOT NULL` 레코드 이관
- `monthly_payments` 테이블은 삭제하지 않고 유지

enrollments 테이블의 `enrolled_months` 컬럼도 삭제하지 않음 (하위 호환).

## Files to Change

| 파일 | 변경 |
|------|------|
| `packages/core/src/types/index.ts` | `PaymentRecord` 타입 추가 |
| `packages/core/src/utils/fieldMapper.ts` | PaymentRecord 매핑 추가 |
| `packages/core/src/stores/paymentRecordStore.ts` | 신규 생성 |
| `packages/core/src/stores/monthlyPaymentStore.ts` | 미사용 (삭제하지 않음) |
| `packages/core/src/utils/quarterUtils.ts` | 불필요 함수 제거 |
| `packages/core/src/index.ts` | export 변경 |
| `packages/ui/src/components/students/EnrollmentForm.tsx` | enrolledMonths 제거, paymentRecord 연동 |
| `packages/ui/src/components/payment/PaymentManagementTable.tsx` | 신규 생성 |
| `packages/ui/src/components/payment/MonthlyPaymentTable.tsx` | 미사용 (삭제하지 않음) |
| `packages/ui/src/index.ts` | export 변경 |
| `apps/tutomate/src/pages/CourseDetailPage.tsx` | 탭 이름 + 컴포넌트 교체 |
| `apps/tutomate-q/src/pages/CourseDetailPage.tsx` | 동일 |

## Out of Scope

- monthly_payments 테이블 삭제
- enrolled_months 컬럼 삭제
- 수익 관리 페이지(RevenueManagementPage) 변경 — 별도 작업
- 영수증/정산 기능

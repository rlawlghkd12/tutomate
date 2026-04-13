# 납부 일자 편집 + 할인 UI + Q분기별 운영 설계

## 목표

1. 납부 일자를 수강 등록 시점과 납부 이력에서 편집 가능하게
2. 납부 모달에서 할인 금액 UI를 "할인 적용" 토글 패턴으로 변경
3. Q버전 강좌를 분기 단위로 운영 — 강좌 목록 분기 셀렉터 + 이전 분기 수강생 가져오기

---

## 1. 납부 일자 편집

### 1-1. 수강 등록 시 (EnrollmentForm)

현재: `paidAt`는 `dayjs().format('YYYY-MM-DD')`로 자동 설정 (사용자 변경 불가)

변경: Step 2 납부 섹션에 `<Input type="date">` 추가. 기본값은 오늘. 면제 시 비활성화.

위치: `packages/ui/src/components/students/EnrollmentForm.tsx` — 납부 방법 셀렉트 아래에 배치

### 1-2. 납부 이력 모달 (PaymentManagementTable)

현재: `<TableCell>{r.paidAt}</TableCell>` — 텍스트만 표시

변경: 메모와 동일한 인라인 편집 패턴 적용. `<Input type="date">` + `onBlur`로 변경 감지 → `updateRecord(r.id, { paidAt: newValue })` 호출.

위치: `packages/ui/src/components/payment/PaymentManagementTable.tsx` — 납부 이력 모달 테이블

### 데이터 흐름

- `PaymentRecord.paidAt`를 직접 수정 (이미 `updateRecord` 메서드 존재)
- enrollment의 `paidAt`는 가장 최근 payment record 날짜에 의해 결정되므로 별도 동기화 불필요

---

## 2. 할인 금액 UI (납부 모달)

현재: "할인 금액" 입력 필드가 항상 노출

변경: EnrollmentForm과 동일한 토글 패턴 적용

- 기본 상태: 할인 필드 숨김
- "할인 적용" 버튼 클릭 → 할인 금액 입력 필드 슬라이드 표시
- 이미 할인이 적용된 enrollment 열 때는 자동으로 토글 ON + 기존 금액 표시
- 토글 OFF 시 할인 금액 0으로 리셋

위치: `packages/ui/src/components/payment/PaymentManagementTable.tsx` — 납부 추가 모달 내부

수강료 요약 박스: 할인 적용 시에만 할인 행 표시 (현재도 `modalDiscount > 0`일 때만 표시하므로 변경 없음)

---

## 3. Q버전 분기별 운영

### 핵심 개념

Q버전에서 강좌는 **종료일 없이 계속 이어지지만 분기 단위로 운영**된다. "수학반"이라는 강좌 하나가 1분기, 2분기, 3분기... 계속 가고, 매 분기가 하나의 수업 단위다. 따라서:

- 분기마다 수강생 등록(enrollment)이 새로 필요 (= 납부 리셋)
- 대부분의 수강생은 다음 분기에도 이어서 다니므로 "가져오기" 기능 필요
- 강좌 자체는 변하지 않음 — 같은 강좌의 분기별 enrollment만 달라짐
- 지난 분기 = 해당 강좌의 그 분기 수강생/납부 이력을 조회할 수 있어야 함

### 3-1. 강좌 목록 — 분기 셀렉터 (Q버전만)

현재 (Q버전): "현재 강좌" / "종료된 강좌" 탭으로 구분

변경: Q버전에서는 탭 대신 **분기 셀렉터**로 교체

- `[2026년 2분기 ▼]` 선택 → 강좌 목록 + 각 강좌의 2분기 수강생 수 표시
- `[2026년 1분기 ▼]` 선택 → 같은 강좌들 + 1분기 수강생/납부 이력 조회
- 기본 선택: 현재 분기
- 강좌 자체는 계속 이어지므로 "종료" 탭 불필요

위치: `packages/ui/src/components/courses/CourseList.tsx` — `appConfig.enableQuarterSystem`이면 탭 대신 셀렉터 렌더링

강좌 카드의 수강생 수: 선택된 분기의 enrollment 수를 표시해야 함.

### 3-2. 강좌 상세 — 이전 분기 수강생 가져오기

**트리거**: 강좌 상세 페이지에서 분기 셀렉터로 새 분기를 선택했을 때, 해당 분기의 enrollment이 0개인 경우.

**UI 흐름**:

1. 분기 셀렉터에서 새 분기 선택 (예: 2026-Q2)
2. 해당 분기에 enrollment이 없으면 → 빈 테이블 대신 CTA 표시
3. CTA: `"1분기 수강생 N명 가져오기"` 버튼
4. 클릭 → 다이얼로그: 이전 분기 수강생 체크리스트 (전체 선택 기본)
   - 체크리스트에 이름 + 전화번호 표시
   - 철회(withdrawn) 상태 수강생은 기본 체크 해제
5. "가져오기" 클릭 → 선택된 수강생마다 새 enrollment 생성:
   - `quarter`: 새 분기 (예: "2026-Q2")
   - `paymentStatus`: "pending"
   - `paidAmount`: 0
   - `remainingAmount`: courseFee
   - `discountAmount`: 0
   - `enrolledAt`: 현재 시점
   - 기존 할인/납부 정보는 복사하지 않음 (새 분기 = 새 납부)

**이전 분기 결정 로직**: `quarterUtils.ts`에 `getPreviousQuarter(quarter: string): string` 함수 추가.
- 2026-Q2 → 2026-Q1
- 2026-Q1 → 2025-Q4

**가져오기 버튼 노출 조건**:
1. `appConfig.enableQuarterSystem === true` (Q버전만)
2. 선택된 분기의 해당 강좌 enrollment 수 === 0
3. 이전 분기에 해당 강좌 enrollment이 1개 이상 존재

**엣지 케이스**:
- 이전 분기에도 enrollment 없음 → CTA 미표시 (일반 빈 상태 메시지)
- 이미 일부 수강생만 가져온 후 다시 시도 → enrollment > 0이므로 CTA 미표시
- 가져오기 후 추가 수강생 등록 → 일반 등록 플로우 사용

---

## 변경 파일 요약

| 파일 | 변경 내용 |
|------|----------|
| `packages/ui/src/components/students/EnrollmentForm.tsx` | 납부일 date picker 추가 |
| `packages/ui/src/components/payment/PaymentManagementTable.tsx` | 할인 토글, 납부이력 날짜 편집, 분기 가져오기 CTA + 다이얼로그 |
| `packages/ui/src/components/courses/CourseList.tsx` | Q버전: 탭 → 분기 셀렉터 교체, 분기별 수강생 수 표시 |
| `packages/core/src/utils/quarterUtils.ts` | `getPreviousQuarter()` 함수 추가 |
| `packages/core/src/index.ts` | `getPreviousQuarter` export 추가 |
| `apps/tutomate-q/src/pages/CoursesPage.tsx` | 분기 셀렉터 prop 전달 |

---

## 범위 외

- 분기 자동 전환 알림 (수동 셀렉터로 충분)
- 이전 분기 할인/납부 정보 복사 (새 분기 = 깨끗한 상태)
- 일반 버전(tutomate) 변경 — 일반 버전은 "현재/종료" 탭 유지

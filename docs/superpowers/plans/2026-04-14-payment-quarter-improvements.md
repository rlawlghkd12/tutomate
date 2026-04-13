# 납부 일자 편집 + 할인 UI + Q분기별 운영 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 납부 일자 편집, 할인 토글 UI 개선, Q버전 강좌 목록 분기 셀렉터 + 이전 분기 수강생 가져오기

**Architecture:** quarterUtils에 `getPreviousQuarter` 추가 → EnrollmentForm에 납부일 date picker → PaymentManagementTable에 할인 토글 + 납부이력 날짜 편집 + 분기 가져오기 CTA → CourseList에 Q버전 분기 셀렉터

**Tech Stack:** React, Zustand, Vitest, dayjs, @tanstack/react-table, shadcn/ui

---

### Task 1: `getPreviousQuarter` 유틸 함수

**Files:**
- Modify: `packages/core/src/utils/quarterUtils.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/src/utils/__tests__/quarterUtils.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// packages/core/src/utils/__tests__/quarterUtils.test.ts
import { describe, it, expect } from 'vitest';
import { getPreviousQuarter } from '../quarterUtils';

describe('getPreviousQuarter', () => {
  it('Q2 → Q1 (같은 해)', () => {
    expect(getPreviousQuarter('2026-Q2')).toBe('2026-Q1');
  });

  it('Q1 → Q4 (이전 해)', () => {
    expect(getPreviousQuarter('2026-Q1')).toBe('2025-Q4');
  });

  it('Q4 → Q3', () => {
    expect(getPreviousQuarter('2026-Q4')).toBe('2026-Q3');
  });

  it('Q3 → Q2', () => {
    expect(getPreviousQuarter('2026-Q3')).toBe('2026-Q2');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `pnpm --filter @tutomate/core exec vitest run src/utils/__tests__/quarterUtils.test.ts`
Expected: FAIL — `getPreviousQuarter is not a function`

- [ ] **Step 3: 구현**

`packages/core/src/utils/quarterUtils.ts` 파일 끝에 추가:

```typescript
/** 이전 분기 반환 — "2026-Q2" → "2026-Q1", "2026-Q1" → "2025-Q4" */
export function getPreviousQuarter(quarter: string): string {
  const [yearStr, qStr] = quarter.split('-Q');
  let y = Number(yearStr);
  let q = Number(qStr) - 1;
  if (q < 1) { q = 4; y -= 1; }
  return `${y}-Q${q}`;
}
```

- [ ] **Step 4: index.ts export 추가**

`packages/core/src/index.ts` — 기존 quarterUtils export 블록에 `getPreviousQuarter` 추가:

```typescript
export {
  getCurrentQuarter,
  getQuarterLabel,
  getQuarterOptions,
  getQuarterMonths,
  quarterMonthToYYYYMM,
  getPreviousQuarter,
} from './utils/quarterUtils';
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `pnpm --filter @tutomate/core exec vitest run src/utils/__tests__/quarterUtils.test.ts`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/core/src/utils/quarterUtils.ts packages/core/src/utils/__tests__/quarterUtils.test.ts packages/core/src/index.ts
git commit -m "feat: getPreviousQuarter 유틸 함수 추가"
```

---

### Task 2: EnrollmentForm — 납부일 date picker 추가

**Files:**
- Modify: `packages/ui/src/components/students/EnrollmentForm.tsx`

- [ ] **Step 1: 납부일 state 추가**

`EnrollmentForm.tsx`에서 기존 state 선언부 근처에 추가:

```typescript
const [formPaidAt, setFormPaidAt] = useState(dayjs().format('YYYY-MM-DD'));
```

- [ ] **Step 2: Step 2 납부 섹션에 date picker UI 추가**

납부 방법 셀렉트(`paymentMethod` Controller) 아래, 메모 필드 위에 추가:

```tsx
{/* 납부일 */}
{!isExempt && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
    <Label htmlFor="paidAt">납부일</Label>
    <Input
      id="paidAt"
      type="date"
      value={formPaidAt}
      onChange={(e) => setFormPaidAt(e.target.value)}
      style={{ fontSize: '1.07rem' }}
    />
  </div>
)}
```

- [ ] **Step 3: submit 로직에서 `paidAt`에 `formPaidAt` 사용**

기존 (두 곳 — withdrawnEnrollment 업데이트와 새 enrollment 생성):

```typescript
paidAt: paidAmount > 0 || isExempt ? dayjs().format("YYYY-MM-DD") : undefined,
```

변경:

```typescript
paidAt: paidAmount > 0 || isExempt ? formPaidAt : undefined,
```

- [ ] **Step 4: 빌드 확인**

Run: `pnpm --filter @tutomate/app build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/components/students/EnrollmentForm.tsx
git commit -m "feat: 수강 등록 시 납부일 선택 가능 (기본값 오늘)"
```

---

### Task 3: 납부 이력 모달 — 납부일 인라인 편집

**Files:**
- Modify: `packages/ui/src/components/payment/PaymentManagementTable.tsx`

- [ ] **Step 1: 납부 이력 테이블에서 텍스트 → date input 변경**

납부 이력 모달 내 `<TableBody>` 영역에서 기존:

```tsx
<TableCell>{r.paidAt}</TableCell>
```

변경:

```tsx
<TableCell>
  <Input
    type="date"
    className="h-7 text-sm w-[130px]"
    defaultValue={r.paidAt || ''}
    onBlur={(e) => {
      const val = e.target.value;
      if (val && val !== (r.paidAt || '')) {
        updateRecord(r.id, { paidAt: val });
      }
    }}
  />
</TableCell>
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm --filter @tutomate/app build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add packages/ui/src/components/payment/PaymentManagementTable.tsx
git commit -m "feat: 납부 이력 모달에서 납부일 인라인 편집"
```

---

### Task 4: 납부 모달 — 할인 토글 UI

**Files:**
- Modify: `packages/ui/src/components/payment/PaymentManagementTable.tsx`

- [ ] **Step 1: 할인 토글 state 추가**

기존 state 선언부에 추가:

```typescript
const [showDiscountToggle, setShowDiscountToggle] = useState(false);
```

- [ ] **Step 2: 납부 버튼 클릭 시 토글 초기화**

납부 버튼 `onClick` 핸들러(기존 `setIsPaymentModalVisible(true)` 앞)에 추가:

```typescript
setShowDiscountToggle(discount > 0);
```

- [ ] **Step 3: 납부 모달에서 할인 금액 필드를 토글 패턴으로 변경**

기존 할인 금액 섹션:

```tsx
<div className="space-y-2">
  <Label>할인 금액</Label>
  <Input
    type="number"
    min={0}
    max={courseFee}
    value={formDiscountAmount}
    onChange={(e) => {
      const newDiscount = Number(e.target.value) || 0;
      setFormDiscountAmount(newDiscount);
      setModalDiscount(newDiscount);
      if (selectedData) {
        const newRemaining = Math.max(0, courseFee - newDiscount - selectedData.totalPaid);
        setFormAmount(newRemaining);
      }
    }}
  />
</div>
```

변경:

```tsx
{/* 할인 토글 */}
<div className="space-y-2">
  <Button
    type="button"
    variant={showDiscountToggle ? "default" : "outline"}
    size="sm"
    onClick={() => {
      const next = !showDiscountToggle;
      setShowDiscountToggle(next);
      if (!next) {
        setFormDiscountAmount(0);
        setModalDiscount(0);
        if (selectedData) {
          setFormAmount(Math.max(0, courseFee - selectedData.totalPaid));
        }
      }
    }}
  >
    할인 적용
  </Button>
  {showDiscountToggle && (
    <div className="slide-enter">
      <Label>할인 금액 (원)</Label>
      <Input
        type="number"
        min={0}
        max={courseFee}
        value={formDiscountAmount}
        onChange={(e) => {
          const newDiscount = Number(e.target.value) || 0;
          setFormDiscountAmount(newDiscount);
          setModalDiscount(newDiscount);
          if (selectedData) {
            const newRemaining = Math.max(0, courseFee - newDiscount - selectedData.totalPaid);
            setFormAmount(newRemaining);
          }
        }}
      />
      {formDiscountAmount > 0 && (
        <p style={{ fontSize: '0.93rem', color: 'hsl(var(--success))', margin: 0 }}>
          할인 적용 수강료: ₩{(courseFee - formDiscountAmount).toLocaleString()}
        </p>
      )}
    </div>
  )}
</div>
```

- [ ] **Step 4: 빌드 확인**

Run: `pnpm --filter @tutomate/app build`
Expected: 빌드 성공

- [ ] **Step 5: 커밋**

```bash
git add packages/ui/src/components/payment/PaymentManagementTable.tsx
git commit -m "feat: 납부 모달 할인 금액 토글 UI"
```

---

### Task 5: CourseList — Q버전 분기 셀렉터

**Files:**
- Modify: `packages/ui/src/components/courses/CourseList.tsx`
- Modify: `apps/tutomate-q/src/pages/CoursesPage.tsx`

- [ ] **Step 1: CourseList에 `quarterSelector` prop 추가**

`CourseList.tsx` — props 인터페이스에 추가:

```typescript
interface CourseListProps {
  actions?: React.ReactNode;
  quarterSelector?: React.ReactNode;
  selectedQuarter?: string;
}
```

컴포넌트 함수 시그니처도 업데이트:

```typescript
const CourseList: React.FC<CourseListProps> = ({ actions, quarterSelector, selectedQuarter }) => {
```

- [ ] **Step 2: Q버전일 때 탭 대신 분기 셀렉터 렌더링**

기존 탭 영역:

```tsx
<Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 16 }}>
  <TabsList>
    <TabsTrigger value="active">
      현재 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{activeCourses.length}</span>
    </TabsTrigger>
    <TabsTrigger value="ended">
      종료된 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{endedCourses.length}</span>
    </TabsTrigger>
  </TabsList>
</Tabs>
```

변경:

```tsx
{quarterSelector ? (
  <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
    {quarterSelector}
    <span style={{ fontSize: '0.93rem', color: 'hsl(var(--muted-foreground))' }}>
      {displayedCourses.length}개 강좌
    </span>
  </div>
) : (
  <Tabs value={activeTab} onValueChange={setActiveTab} style={{ marginBottom: 16 }}>
    <TabsList>
      <TabsTrigger value="active">
        현재 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{activeCourses.length}</span>
      </TabsTrigger>
      <TabsTrigger value="ended">
        종료된 강좌 <span style={{ marginLeft: 6, fontSize: '0.86rem', opacity: 0.7 }}>{endedCourses.length}</span>
      </TabsTrigger>
    </TabsList>
  </Tabs>
)}
```

- [ ] **Step 3: `displayedCourses` 로직 분기**

`quarterSelector`가 있으면 탭 필터 대신 전체 강좌 표시 (분기별 enrollment 수는 카드에서 처리):

```typescript
const displayedCourses = quarterSelector
  ? filteredCourses
  : (activeTab === 'active' ? activeCourses : endedCourses);
```

- [ ] **Step 4: 강좌 카드의 수강생 수를 분기별로 필터링**

`CourseList.tsx`에서 강좌 카드에 수강생 수를 표시하는 부분을 찾아서, `selectedQuarter`가 있으면 해당 분기의 enrollment만 카운트:

```typescript
const { enrollments } = useEnrollmentStore();

// 강좌 카드에 표시할 수강생 수 계산
const getEnrollmentCount = useCallback((courseId: string) => {
  if (!selectedQuarter) return undefined; // undefined면 course.currentStudents 사용
  return enrollments.filter(
    (e) => e.courseId === courseId && isActiveEnrollment(e) && e.quarter === selectedQuarter
  ).length;
}, [enrollments, selectedQuarter]);
```

강좌 카드 렌더링에서 `currentStudents` 대신 `getEnrollmentCount(course.id) ?? course.currentStudents` 사용.

- [ ] **Step 5: CoursesPage.tsx (Q버전) — 분기 셀렉터 전달**

`apps/tutomate-q/src/pages/CoursesPage.tsx`:

```typescript
import { useState } from 'react';
import { getCurrentQuarter, getQuarterOptions } from '@tutomate/core';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@tutomate/ui';

// 컴포넌트 내부:
const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());

// CourseList에 전달:
<CourseList
  selectedQuarter={selectedQuarter}
  quarterSelector={
    <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
      <SelectTrigger className="w-[180px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {getQuarterOptions().map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  }
  actions={
    <Button onClick={() => setIsModalVisible(true)}>
      <Plus className="h-4 w-4" />
      강좌 개설
    </Button>
  }
/>
```

- [ ] **Step 6: 빌드 확인**

Run: `pnpm --filter @tutomate/app-q build`
Expected: 빌드 성공

- [ ] **Step 7: 커밋**

```bash
git add packages/ui/src/components/courses/CourseList.tsx apps/tutomate-q/src/pages/CoursesPage.tsx
git commit -m "feat: Q버전 강좌 목록 — 현재/종료 탭 → 분기 셀렉터"
```

---

### Task 6: 이전 분기 수강생 가져오기

**Files:**
- Modify: `packages/ui/src/components/payment/PaymentManagementTable.tsx`

- [ ] **Step 1: props에 분기 가져오기 관련 추가**

```typescript
interface PaymentManagementTableProps {
  courseId: string;
  courseFee: number;
  enrollments: Enrollment[];
  onStudentClick?: (studentId: string) => void;
  onRemoveEnrollments?: (enrollmentIds: string[], refundAmount?: number) => void;
  showMemberColumn?: boolean;
  quarterSelector?: React.ReactNode;
  rowSelection?: { selectedRowKeys: React.Key[]; onChange: (keys: React.Key[]) => void; };
  // 분기 가져오기 관련
  selectedQuarter?: string;
  allEnrollments?: Enrollment[];  // 전체 enrollment (분기 필터 안 된)
  onImportFromQuarter?: (studentIds: string[], quarter: string) => Promise<void>;
}
```

- [ ] **Step 2: 가져오기 state + 로직**

컴포넌트 내부에 추가:

```typescript
const [importDialogOpen, setImportDialogOpen] = useState(false);
const [importChecked, setImportChecked] = useState<Record<string, boolean>>({});

// 이전 분기 enrollment 계산
const prevQuarterData = useMemo(() => {
  if (!selectedQuarter || !allEnrollments || !onImportFromQuarter) return null;
  const prevQ = getPreviousQuarter(selectedQuarter);
  const prevEnrollments = allEnrollments.filter(
    (e) => e.courseId === _courseId && e.quarter === prevQ && isActiveEnrollment(e)
  );
  return { quarter: prevQ, enrollments: prevEnrollments };
}, [selectedQuarter, allEnrollments, _courseId, onImportFromQuarter]);

const showImportCTA = enrollments.length === 0
  && prevQuarterData
  && prevQuarterData.enrollments.length > 0;
```

import 추가 필요: `getPreviousQuarter`, `getQuarterLabel`, `isActiveEnrollment` from `@tutomate/core`.

- [ ] **Step 3: 빈 테이블 영역에 가져오기 CTA 추가**

테이블 `<TableBody>` 내 빈 상태 영역을 변경:

기존:

```tsx
<TableRow>
  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
    수강생이 없습니다
  </TableCell>
</TableRow>
```

변경:

```tsx
<TableRow>
  <TableCell colSpan={columns.length} className="h-24 text-center">
    {showImportCTA ? (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <p className="text-muted-foreground">이 분기에 등록된 수강생이 없습니다</p>
        <Button
          variant="outline"
          onClick={() => {
            const checked: Record<string, boolean> = {};
            prevQuarterData!.enrollments.forEach((e) => {
              checked[e.studentId] = e.paymentStatus !== 'withdrawn';
            });
            setImportChecked(checked);
            setImportDialogOpen(true);
          }}
        >
          {getQuarterLabel(prevQuarterData!.quarter)} 수강생 {prevQuarterData!.enrollments.length}명 가져오기
        </Button>
      </div>
    ) : (
      <span className="text-muted-foreground">수강생이 없습니다</span>
    )}
  </TableCell>
</TableRow>
```

- [ ] **Step 4: 가져오기 다이얼로그**

컴포넌트 return 끝, 마지막 `</div>` 바로 앞에 추가:

```tsx
{/* 이전 분기 가져오기 다이얼로그 */}
<Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
  <DialogContent className="max-w-md">
    <DialogHeader>
      <DialogTitle>{prevQuarterData ? getQuarterLabel(prevQuarterData.quarter) : ''} 수강생 가져오기</DialogTitle>
      <DialogDescription className="sr-only">이전 분기 수강생을 가져옵니다</DialogDescription>
    </DialogHeader>
    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
      {prevQuarterData?.enrollments.map((e) => {
        const student = getStudentById(e.studentId);
        return (
          <label
            key={e.studentId}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 4px', borderBottom: '1px solid hsl(var(--border))',
              cursor: 'pointer',
            }}
          >
            <Checkbox
              checked={importChecked[e.studentId] ?? false}
              onCheckedChange={(v) => setImportChecked((prev) => ({ ...prev, [e.studentId]: !!v }))}
            />
            <span style={{ flex: 1 }}>{student?.name || '-'}</span>
            <span style={{ fontSize: '0.86rem', color: 'hsl(var(--muted-foreground))' }}>
              {student?.phone || ''}
            </span>
          </label>
        );
      })}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => setImportDialogOpen(false)}>
        취소
      </Button>
      <Button
        onClick={async () => {
          const studentIds = Object.entries(importChecked)
            .filter(([, v]) => v)
            .map(([id]) => id);
          if (studentIds.length > 0 && onImportFromQuarter && selectedQuarter) {
            await onImportFromQuarter(studentIds, selectedQuarter);
          }
          setImportDialogOpen(false);
        }}
        disabled={Object.values(importChecked).filter(Boolean).length === 0}
      >
        {Object.values(importChecked).filter(Boolean).length}명 가져오기
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: 빌드 확인**

Run: `pnpm --filter @tutomate/app-q build`
Expected: 빌드 성공

- [ ] **Step 6: 커밋**

```bash
git add packages/ui/src/components/payment/PaymentManagementTable.tsx
git commit -m "feat: 이전 분기 수강생 가져오기 CTA + 다이얼로그"
```

---

### Task 7: CourseDetailPage (Q) — 가져오기 연결

**Files:**
- Modify: `apps/tutomate-q/src/pages/CourseDetailPage.tsx`

- [ ] **Step 1: 전체 enrollment과 import 핸들러 전달**

`CourseDetailPage.tsx`에서 `PaymentManagementTable`에 props 추가:

```typescript
const allCourseEnrollments = enrollments.filter((e) => e.courseId === id);
```

```typescript
const handleImportFromQuarter = async (studentIds: string[], quarter: string) => {
  for (const studentId of studentIds) {
    await addEnrollment({
      courseId: id!,
      studentId,
      paymentStatus: 'pending',
      paidAmount: 0,
      discountAmount: 0,
      quarter,
    } as EnrollmentFormData);
  }
  toast.success(`${studentIds.length}명의 수강생을 가져왔습니다.`);
};
```

import 추가: `toast` from `sonner`, `EnrollmentFormData` from `@tutomate/core`.

`PaymentManagementTable` 호출부에 props 추가:

```tsx
<PaymentManagementTable
  courseId={id!}
  courseFee={course.fee}
  enrollments={courseEnrollments}
  selectedQuarter={selectedQuarter}
  allEnrollments={allCourseEnrollments}
  onImportFromQuarter={handleImportFromQuarter}
  // ... 기존 props
/>
```

- [ ] **Step 2: 빌드 확인**

Run: `pnpm --filter @tutomate/app-q build`
Expected: 빌드 성공

- [ ] **Step 3: 커밋**

```bash
git add apps/tutomate-q/src/pages/CourseDetailPage.tsx
git commit -m "feat: Q버전 강좌 상세 — 이전 분기 수강생 가져오기 연결"
```

---

### Task 8: 전체 빌드 + 테스트 검증

**Files:** 없음 (검증만)

- [ ] **Step 1: core 전체 테스트**

Run: `pnpm --filter @tutomate/core test`
Expected: 전체 PASS

- [ ] **Step 2: 양쪽 앱 빌드**

Run: `pnpm --filter @tutomate/app build && pnpm --filter @tutomate/app-q build`
Expected: 빌드 성공

- [ ] **Step 3: 최종 커밋 (필요 시)**

빌드/테스트 과정에서 발견된 문제가 있으면 수정 후 커밋.

# 챗봇 골든 Q&A (수동 회귀용)

각 항목: 사용자 질문 + 호출되어야 할 도구 시퀀스 + 답변 형식.
실 모델로 검증. 실패 사례는 도구 description 또는 시스템 프롬프트 보강 후 재시험.

## 결제 조회

1. **"민준이 결제 언제 했더라?"**
   - tools: `searchStudent({name:"민준"})` → `getPaymentHistory({studentId})`
   - answer: "○○○ 학생은 YYYY-MM-DD에 X원 결제하셨어요."

2. **"전화번호 010-1234-5678 결제 내역"**
   - tools: `searchStudent({phone:"010-1234-5678"})` → `getPaymentHistory({studentId})`

3. **"○○○ 최근 3개월 결제"**
   - tools: `searchStudent({name})` → `getPaymentHistory({studentId, period:"quarter"})`

## 미납 조회

4. **"이번 달 미납 누구야?"**
   - tools: `getUnpaidStudents()`
   - answer: "이번 달 미납자는 N명입니다: …"

5. **"4월 미납자 알려줘"**
   - tools: `getUnpaidStudents({month:"2025-04"})`

## 출석

6. **"지난달 ○○ 학생 출석 어땠어?"**
   - tools: `searchStudent` → `getAttendance({period:"YYYY-MM"})`

7. **"○○ 출석률 알려줘"**
   - tools: `searchStudent` → `getAttendance` → 자체 계산

## 수강생 종합

8. **"○○ 학생 정보 요약해줘"**
   - tools: `searchStudent` → `getStudentSummary`

9. **"○○ 등록 강좌"**
   - tools: `searchStudent` → `getEnrollment`

## 강좌·반

10. **"수학반 학생 명단"**
    - tools: `listClasses({})` → 반 ID 식별 → `getClassRoster`

11. **"이번달 매출 얼마?"**
    - tools: `getMonthlySummary({month})`

## 임포트 시나리오

12. **(파일 첨부) "이거 결제 내역 추가해줘"**
    - tools: `parseExcelHeaders` → `mapColumns` → `previewImport({kind:"payments"})` → (확정 클릭) → `confirmImport`
    - cards: `importPreview` → `importResult`

13. **(파일 첨부, 비표준 헤더 포함) "이거 추가"**
    - tools: `parseExcelHeaders` → `mapColumns` (mismatch)
    - cards: `mappingError` (표준 양식 다운로드 안내)

14. **(파일 첨부) "수강생 명단 등록"**
    - tools: `parseExcelHeaders` → `mapColumns` → `previewImport({kind:"students"})` → `confirmImport`

(... 50쌍까지 점진 확장)

## 환각 방지 체크

- 도구 호출 결과 외 정보를 답변에 포함하면 안 됨 (특히 결제 금액·날짜)
- 학생 미발견 시 "찾을 수 없어요" 명시
- 도구 호출 5라운드 초과 시 자동 종료 + "복잡한 질문" 안내

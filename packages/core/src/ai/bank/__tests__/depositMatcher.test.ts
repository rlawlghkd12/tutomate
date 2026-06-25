import { describe, it, expect } from 'vitest';
import { matchDeposit, type MatchInput } from '../depositMatcher';
import type { BankTransaction } from '../parseBankExcel';

const courses = [
  { id: 'c_건강', name: '건강증진소', fee: 40000 },
  { id: 'c_합창', name: '합창', fee: 60000 },
  { id: 'c_시니어', name: '시니어모델반', fee: 90000 },
  { id: 'c_태극', name: '태극권', fee: 60000 },
  { id: 'c_필라', name: '필라테스', fee: 60000 },
  { id: 'c_드럼', name: '드럼', fee: 60000 },
  { id: 'c_탁구', name: '탁구', fee: 60000 },
];

const students = [
  { id: 's_최남기', name: '최남기' },
  { id: 's_곽청옥', name: '곽청옥' },
  { id: 's_김숙영', name: '김숙영' },
  { id: 's_정순지', name: '정순지' },
  { id: 's_유경숙', name: '유경숙' },
  { id: 's_이경숙', name: '이경숙' },
  { id: 's_최진선', name: '최진선' },
  { id: 's_오한기', name: '오한기' },
  { id: 's_향희A', name: '이향희' },
  { id: 's_향희B', name: '이향희' },
];

// 김양숙: 같은 이름의 필라테스 두 반(목/화)에 모두 등록 → 합산 입금 테스트용
const splitCourses = [
  { id: 'c_필라목', name: '필라테스(목요반)', fee: 60000 },
  { id: 'c_필라화', name: '필라테스(화요일)', fee: 60000 },
];
const splitStudent = { id: 's_김양숙', name: '김양숙' };

const enrollments = [
  { id: 'e1', studentId: 's_최남기', courseId: 'c_합창' },
  { id: 'e2', studentId: 's_곽청옥', courseId: 'c_합창' },
  { id: 'e3', studentId: 's_김숙영', courseId: 'c_태극' },
  { id: 'e4', studentId: 's_정순지', courseId: 'c_태극' },
  { id: 'e5', studentId: 's_유경숙', courseId: 'c_필라' },
  { id: 'e6', studentId: 's_이경숙', courseId: 'c_건강' },
  { id: 'e7', studentId: 's_최진선', courseId: 'c_건강' },
  { id: 'e8', studentId: 's_오한기', courseId: 'c_시니어' },
  { id: 'e9', studentId: 's_향희A', courseId: 'c_드럼' },
  { id: 'e10', studentId: 's_향희B', courseId: 'c_탁구' },
];

const input: MatchInput = {
  courses: [...courses, ...splitCourses],
  students: [...students, splitStudent],
  enrollments: [
    ...enrollments,
    { id: 'e_김양숙목', studentId: 's_김양숙', courseId: 'c_필라목' },
    { id: 'e_김양숙화', studentId: 's_김양숙', courseId: 'c_필라화' },
  ],
};

function tx(payerName: string, amount: number): BankTransaction {
  return { rowIndex: 0, dateTime: '2026.05.04', paidAt: '2026-05-04', payerName, amount, method: '인터넷', memo: '' };
}

describe('matchDeposit', () => {
  it('강좌+이름 붙임 + 금액 일치 → auto', () => {
    const r = matchDeposit(tx('합창최남기', 60000), input);
    expect(r.status).toBe('auto');
    expect(r.studentName).toBe('최남기');
    expect(r.courseName).toBe('합창');
    expect(r.candidates[0].enrollmentId).toBe('e1');
  });

  it('이름 + 공백 + 강좌 → auto', () => {
    const r = matchDeposit(tx('곽청옥 합창', 60000), input);
    expect(r.status).toBe('auto');
    expect(r.studentName).toBe('곽청옥');
  });

  it('이름 + (강좌) 괄호 → auto', () => {
    const r = matchDeposit(tx('김숙영(태극권)', 60000), input);
    expect(r.status).toBe('auto');
    expect(r.courseName).toBe('태극권');
  });

  it('강좌명 오타(태극퀀→태극권) → 편집거리 보정으로 auto', () => {
    const r = matchDeposit(tx('정순지태극퀀', 60000), input);
    expect(r.status).toBe('auto');
    expect(r.courseName).toBe('태극권');
  });

  it('강좌 약어(필라→필라테스) prefix 매칭 → auto', () => {
    const r = matchDeposit(tx('필라유경숙', 60000), input);
    expect(r.status).toBe('auto');
    expect(r.studentName).toBe('유경숙');
    expect(r.courseName).toBe('필라테스');
  });

  it('강좌+이름 맞지만 금액 불일치 → needsConfirm', () => {
    const r = matchDeposit(tx('건강증진이경숙', 20000), input);
    expect(r.status).toBe('needsConfirm');
    expect(r.studentName).toBe('이경숙');
    expect(r.reason).toContain('금액');
  });

  it('이름만 + 금액 맞는 강좌 1개 → needsConfirm(1순위 제안)', () => {
    const r = matchDeposit(tx('오한기', 90000), input);
    expect(r.status).toBe('needsConfirm');
    expect(r.studentName).toBe('오한기');
    expect(r.courseName).toBe('시니어모델반');
    expect(r.candidates[0].amountMatches).toBe(true);
  });

  it('동명이인 → needsConfirm + 후보 여러', () => {
    const r = matchDeposit(tx('이향희', 60000), input);
    expect(r.status).toBe('needsConfirm');
    expect(r.candidates.length).toBe(2);
  });

  it('그룹 입금(N명) → unmatched', () => {
    expect(matchDeposit(tx('사군자9명', 540000), input).status).toBe('unmatched');
    expect(matchDeposit(tx('윤영진외4명', 300000), input).status).toBe('unmatched');
  });

  it('코드/번호 → unmatched', () => {
    expect(matchDeposit(tx('740704535B', 29880), input).status).toBe('unmatched');
  });

  it('미등록 이름 → unmatched', () => {
    expect(matchDeposit(tx('홍길동', 60000), input).status).toBe('unmatched');
  });

  it('강의+이름 + 금액 일치하지만 미등록 → needsEnrollment(신규 등록 제안)', () => {
    // 최남기는 합창(e1)만 등록, 태극권 미등록. "태극권최남기" 60000 → 태극권 신규 등록 제안
    const r = matchDeposit(tx('태극권최남기', 60000), input);
    expect(r.status).toBe('needsEnrollment');
    expect(r.studentName).toBe('최남기');
    expect(r.courseName).toBe('태극권');
    const c = r.candidates[0];
    expect(c.isNewEnrollment).toBe(true);
    expect(c.enrollmentId).toBe('');
    expect(c.studentId).toBe('s_최남기');
    expect(c.courseId).toBe('c_태극');
  });

  it('미등록 강의지만 금액 불일치 → 신규 등록 제안 안 함(이름만 흐름 폴백)', () => {
    const r = matchDeposit(tx('태극권최남기', 50000), input);
    expect(r.status).not.toBe('needsEnrollment');
  });

  it('이름만 + 금액이 여러 등록 수강료 합과 일치 → needsSplit', () => {
    const r = matchDeposit(tx('김양숙', 120000), input);
    expect(r.status).toBe('needsSplit');
    expect(r.studentName).toBe('김양숙');
    expect(r.candidates.length).toBe(2);
    expect(r.candidates.reduce((a, c) => a + c.fee, 0)).toBe(120000);
  });

  it('합산 입금이라도 금액이 합과 다르면 needsSplit 아님', () => {
    const r = matchDeposit(tx('김양숙', 60000), input);
    expect(r.status).not.toBe('needsSplit');
  });

  it('auto 후보에는 저장용 enrollmentId가 채워진다', () => {
    const r = matchDeposit(tx('최진선건강증진소', 40000), input);
    expect(r.status).toBe('auto');
    const picked = r.candidates.find((c) => c.studentId === r.studentId && c.courseId === r.courseId);
    expect(picked?.enrollmentId).toBe('e7');
  });
});

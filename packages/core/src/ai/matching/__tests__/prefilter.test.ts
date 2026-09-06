import { describe, it, expect } from 'vitest';
import { prefilter, monthsFromMemo, type PrefilterInput } from '../prefilter';
import { norm, editDistance, findCourseInName, amountNoteOf } from '../normalize';

const base: PrefilterInput = {
  students: [
    { id: 's1', name: '김영희', phone: '010-1111-2222' },
    { id: 's2', name: '박철수', phone: '010-3333-4444' },
    { id: 's3', name: '김영희', phone: '010-5555-6666' }, // 동명이인
  ],
  courses: [
    { id: 'c1', name: '중3수학', fee: 150000 },
    { id: 'c2', name: '중3영어', fee: 120000 },
  ],
  enrollments: [
    { id: 'e1', studentId: 's1', courseId: 'c1' }, // 김영희(s1) 수학
    { id: 'e2', studentId: 's2', courseId: 'c2' }, // 박철수 영어
    { id: 'e4', studentId: 's2', courseId: 'c1' }, // 박철수 수학 (다강좌)
    { id: 'e3', studentId: 's3', courseId: 'c2' }, // 김영희(s3) 영어
  ],
};

describe('prefilter', () => {
  it('전화 완전일치 + 금액으로 강좌 유일화 → auto', () => {
    const r = prefilter({ name: '박철수', phone: '01033334444', amount: 120000 }, base);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].enrollmentId).toBe('e2');
  });

  it('단일 인물 + 다강좌, 금액이 한 강좌와 일치 → auto', () => {
    const r = prefilter({ name: '박철수', amount: 150000 }, base);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].courseId).toBe('c1'); // 수학 15만
  });

  it('단일 인물 + 다강좌, 금액이 어느 강좌와도 불일치 → ambiguous', () => {
    const r = prefilter({ name: '박철수', amount: 99000 }, base);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.length).toBe(2);
  });

  it('동명이인 → 금액이 한 명을 좁혀도 ambiguous (사람 특정 불가)', () => {
    const r = prefilter({ name: '김영희', amount: 150000 }, base);
    expect(r.status).toBe('ambiguous');
    expect(r.reason).toContain('이름이 같은');
  });

  it('후보 없음 → unmatched', () => {
    const r = prefilter({ name: '홍길동', amount: 100000 }, base);
    expect(r.status).toBe('unmatched');
  });

  it('전화 우선순위: 동명이인이라도 전화로 사람 확정 → auto', () => {
    const r = prefilter({ name: '김영희', phone: '01011112222', amount: 150000 }, base);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].studentId).toBe('s1');
  });

  it('금액일치 후보가 맨 앞으로 정렬된다', () => {
    const r = prefilter({ name: '박철수', amount: 120000 }, base);
    expect(r.candidates[0].amountMatches).toBe(true);
  });

  it('className으로 강좌 유일화 → auto (금액 불일치여도)', () => {
    // 박철수는 c1(수학)·c2(영어) 다강좌, 금액 99000은 어느 것과도 불일치지만 강좌명으로 특정
    const r = prefilter({ name: '박철수', amount: 99000, className: '중3영어' }, base);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].courseId).toBe('c2');
  });

  it('className 부분 일치(약칭)로도 강좌 좁힘', () => {
    const r = prefilter({ name: '박철수', amount: 99000, className: '수학' }, base);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].courseId).toBe('c1');
  });

  it('className이 어느 강좌와도 안 맞으면 기존 로직 유지(ambiguous)', () => {
    const r = prefilter({ name: '박철수', amount: 99000, className: '국어' }, base);
    expect(r.status).toBe('ambiguous');
  });

  it('이름 오타(편집거리 1) → 후보로 제시(ambiguous), 자동 저장 안 함', () => {
    const input: PrefilterInput = {
      students: [{ id: 's1', name: '김영희', phone: '010-1111-2222' }],
      courses: [{ id: 'c1', name: '중3수학', fee: 150000 }],
      enrollments: [{ id: 'e1', studentId: 's1', courseId: 'c1', fee: 150000 }],
    };
    // "김영히"(오타) → editDistance 1 → 근접 매칭이지만 확실치 않아 ambiguous
    const r = prefilter({ name: '김영히', amount: 150000 }, input);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates[0].enrollmentId).toBe('e1');
    expect(r.reason).toContain('비슷');
  });

  it('전혀 다른 이름은 근접 매칭 안 함 → unmatched', () => {
    const input: PrefilterInput = {
      students: [{ id: 's1', name: '김영희', phone: '010-1111-2222' }],
      courses: [{ id: 'c1', name: '중3수학', fee: 150000 }],
      enrollments: [{ id: 'e1', studentId: 's1', courseId: 'c1' }],
    };
    const r = prefilter({ name: '박철수', amount: 150000 }, input);
    expect(r.status).toBe('unmatched');
  });

  it('할인 등록: 실효 수강료로 매칭 — 할인 없는 다른 강좌로 오토매칭하지 않음', () => {
    // s1이 두 강좌: c1(30만, 할인0) / c2(33만, 할인3만→실효30만). 30만 납부.
    const input: PrefilterInput = {
      students: [{ id: 's1', name: '홍길동', phone: '010-0000-0000' }],
      courses: [
        { id: 'c1', name: '발레', fee: 300000 },
        { id: 'c2', name: '필라테스', fee: 330000 },
      ],
      enrollments: [
        { id: 'e1', studentId: 's1', courseId: 'c1', fee: 300000 }, // 실효 30만
        { id: 'e2', studentId: 's1', courseId: 'c2', fee: 300000 }, // 33만 - 3만 할인 = 실효 30만
      ],
    };
    const r = prefilter({ name: '홍길동', amount: 300000 }, input);
    // 둘 다 실효 30만과 일치 → 어느 강좌인지 불확실 → ambiguous(사용자 확인). (버그: e1로 오토매칭)
    expect(r.status).toBe('ambiguous');
    expect(r.candidates.length).toBe(2);
  });

  it('메모의 "N월"로 다분기 후보를 좁혀 선납 대상 분기 선택(김미영 시나리오)', () => {
    // 김미영이 같은 강좌를 Q2·Q3에 등록. 6월에 낸 "7월분"(→Q3)을 Q3 등록으로 매칭.
    const input: PrefilterInput = {
      students: [{ id: 'm1', name: '김미영', phone: '010-9999-0000' }],
      courses: [{ id: 'cc', name: '중3수학', fee: 150000 }],
      enrollments: [
        { id: 'q2', studentId: 'm1', courseId: 'cc', quarter: '2026-Q2' },
        { id: 'q3', studentId: 'm1', courseId: 'cc', quarter: '2026-Q3' },
      ],
    };
    const r = prefilter({ name: '김미영', amount: 150000, paidAt: '2026-06-28', memo: '7월분' }, input);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].enrollmentId).toBe('q3'); // 7월 = Q3
  });

  it('연도 불일치: 작년 분기 등록만 있는데 올해 결제 → auto 금지(ambiguous)', () => {
    // 김미영은 작년 2025-Q3 등록(미완납)만 있고, 올해 2026-07 결제가 들어옴.
    // 월(7월)은 겹치지만 연도가 달라 그 등록에 자동으로 붙이면 안 됨 → 사용자 확인.
    const input: PrefilterInput = {
      students: [{ id: 'm1', name: '김미영', phone: '010-9999-0000' }],
      courses: [{ id: 'cc', name: '중3영어', fee: 300000 }],
      enrollments: [{ id: 'e1', studentId: 'm1', courseId: 'cc', quarter: '2025-Q3', fee: 300000 }],
    };
    const r = prefilter({ name: '김미영', amount: 100000, paidAt: '2026-07-05', memo: '7월분' }, input);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates[0].enrollmentId).toBe('e1'); // 후보로는 보여주되 자동 저장은 안 함
  });

  it('연도 일치: 같은 해 분기 등록 → 정상 auto', () => {
    const input: PrefilterInput = {
      students: [{ id: 'm1', name: '김미영', phone: '010-9999-0000' }],
      courses: [{ id: 'cc', name: '중3영어', fee: 300000 }],
      enrollments: [{ id: 'e1', studentId: 'm1', courseId: 'cc', quarter: '2026-Q3', fee: 300000 }],
    };
    const r = prefilter({ name: '김미영', amount: 300000, paidAt: '2026-07-05', memo: '7월분' }, input);
    expect(r.status).toBe('auto');
    expect(r.candidates[0].enrollmentId).toBe('e1');
  });

  it('메모에 월이 없으면 다분기 후보는 그대로 ambiguous(금액도 동일)', () => {
    const input: PrefilterInput = {
      students: [{ id: 'm1', name: '김미영', phone: '010-9999-0000' }],
      courses: [{ id: 'cc', name: '중3수학', fee: 150000 }],
      enrollments: [
        { id: 'q2', studentId: 'm1', courseId: 'cc', quarter: '2026-Q2' },
        { id: 'q3', studentId: 'm1', courseId: 'cc', quarter: '2026-Q3' },
      ],
    };
    const r = prefilter({ name: '김미영', amount: 150000, paidAt: '2026-06-28' }, input);
    expect(r.status).toBe('ambiguous');
  });
});

describe('monthsFromMemo', () => {
  it('"N월" 추출', () => {
    expect(monthsFromMemo('7월분')).toEqual([7]);
    expect(monthsFromMemo('3월,4월 수강료')).toEqual([3, 4]);
    expect(monthsFromMemo('12월치')).toEqual([12]);
  });
  it('월 표기 없으면 빈 배열', () => {
    expect(monthsFromMemo('입금')).toEqual([]);
    expect(monthsFromMemo(undefined)).toEqual([]);
    expect(monthsFromMemo('13월')).toEqual([]); // 유효 월 아님
  });
  it('"N분기" → 해당 분기 3개월', () => {
    expect(monthsFromMemo('2분기')).toEqual([4, 5, 6]);
    expect(monthsFromMemo('3분기 수강료')).toEqual([7, 8, 9]);
  });
  it('계절어 → 대표 월', () => {
    expect(monthsFromMemo('여름학기')).toEqual([7, 8]);
    expect(monthsFromMemo('봄')).toEqual([3, 4]);
    expect(monthsFromMemo('겨울방학')).toEqual([1, 12]);
  });
  it('혼합·중복 제거·정렬', () => {
    expect(monthsFromMemo('7월 여름')).toEqual([7, 8]);
  });
});

describe('normalize 유틸', () => {
  it('norm: 공백·구두점 제거', () => {
    expect(norm('김 영희(중3)')).toBe('김영희중3');
  });
  it('editDistance: 오타 1', () => {
    expect(editDistance('태극권', '태극퀀')).toBe(1);
  });
  it('findCourseInName: 약칭 매칭', () => {
    expect(findCourseInName(norm('곽가온 필라'), { name: '필라테스' })).not.toBeNull();
  });
  it('amountNoteOf: 관계 라벨', () => {
    expect(amountNoteOf(150000, 149500)).toBe('feeDeducted');
    expect(amountNoteOf(150000, 150000)).toBe('exact');
    expect(amountNoteOf(150000, 100000)).toBe('partial');
    expect(amountNoteOf(150000, 160000)).toBe('over');
  });
});

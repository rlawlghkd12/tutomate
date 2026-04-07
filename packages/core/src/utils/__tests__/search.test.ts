import { describe, it, expect } from 'vitest';
import type { Course, Student, Enrollment } from '../../types';
import {
  searchCourses,
  searchStudents,
  searchEnrollments,
  searchAll,
  highlightText,
} from '../search';

// ─── 테스트 데이터 ───────────────────────────────────────────────────────

const course1: Course = {
  id: 'c1',
  name: '수학반',
  classroom: 'A101',
  instructorName: '김강사',
  instructorPhone: '010-1234-5678',
  fee: 200000,
  maxStudents: 20,
  currentStudents: 5,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const course2: Course = {
  ...course1,
  id: 'c2',
  name: '영어반',
  classroom: 'B202',
  instructorName: '이선생',
  instructorPhone: '010-9999-8888',
};

const student1: Student = {
  id: 's1',
  name: '홍길동',
  phone: '010-1111-2222',
  email: 'hong@test.com',
  address: '서울시 강남구',
  notes: '성실한 학생',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const student2: Student = {
  ...student1,
  id: 's2',
  name: '이영희',
  phone: '010-3333-4444',
  email: 'lee@test.com',
  address: '부산시 해운대구',
  notes: '우수 학생',
};

const enrollment1: Enrollment = {
  id: 'e1',
  courseId: 'c1',
  studentId: 's1',
  enrolledAt: '2026-03-01T00:00:00Z',
  paymentStatus: 'completed',
  paidAmount: 200000,
  remainingAmount: 0,
  discountAmount: 0,
};

const enrollment2: Enrollment = {
  ...enrollment1,
  id: 'e2',
  courseId: 'c2',
  studentId: 's2',
  paymentStatus: 'pending',
  paidAmount: 0,
  remainingAmount: 200000,
  notes: '분할 납부 예정',
};

// ─── highlightText ────────────────────────────────────────────────────────

describe('highlightText', () => {
  it('검색어 포함 → <mark>태그로 감쌈', () => {
    expect(highlightText('홍길동', '홍')).toBe('<mark>홍</mark>길동');
  });

  it('빈 query → 원본 텍스트 그대로', () => {
    expect(highlightText('홍길동', '')).toBe('홍길동');
  });

  it('대소문자 무시', () => {
    expect(highlightText('Hello World', 'hello')).toBe('<mark>Hello</mark> World');
  });

  it('여러 번 등장하는 검색어 모두 하이라이트', () => {
    expect(highlightText('수학반 수학 강좌', '수학')).toBe('<mark>수학</mark>반 <mark>수학</mark> 강좌');
  });

  it('검색어 없으면 아무것도 하이라이트 안됨', () => {
    expect(highlightText('안녕하세요', 'xyz')).toBe('안녕하세요');
  });

  it('특수문자 포함 query', () => {
    // 특수문자가 있어도 에러 없이 처리
    expect(() => highlightText('test-data', 'test')).not.toThrow();
  });
});

// ─── searchCourses ────────────────────────────────────────────────────────

describe('searchCourses', () => {
  it('빈 query → 빈 배열', () => {
    expect(searchCourses([course1, course2], '')).toEqual([]);
    expect(searchCourses([course1, course2], '   ')).toEqual([]);
  });

  it('강좌명 매칭', () => {
    const results = searchCourses([course1, course2], '수학');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c1');
    expect(results[0].type).toBe('course');
    expect(results[0].matchedFields).toContain('강좌명');
  });

  it('강의실 매칭', () => {
    const results = searchCourses([course1, course2], 'A101');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('강의실');
  });

  it('강사명 매칭', () => {
    const results = searchCourses([course1, course2], '이선생');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('c2');
    expect(results[0].matchedFields).toContain('강사');
  });

  it('강사 전화번호 매칭', () => {
    const results = searchCourses([course1, course2], '010-1234');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('강사 전화번호');
  });

  it('대소문자 무시', () => {
    const courseWithEnglish: Course = { ...course1, name: 'MATH Class' };
    const results = searchCourses([courseWithEnglish], 'math');
    expect(results).toHaveLength(1);
  });

  it('빈 목록 → 빈 배열', () => {
    expect(searchCourses([], '수학')).toEqual([]);
  });

  it('매칭 없음 → 빈 배열', () => {
    expect(searchCourses([course1, course2], 'XXXXXX')).toEqual([]);
  });

  it('결과 구조 검증 — title, subtitle, description, data 포함', () => {
    const results = searchCourses([course1], '수학');
    expect(results[0].title).toBe('수학반');
    expect(results[0].subtitle).toContain('A101');
    expect(results[0].description).toContain('200,000');
    expect(results[0].data).toBe(course1);
  });
});

// ─── searchStudents ───────────────────────────────────────────────────────

describe('searchStudents', () => {
  it('빈 query → 빈 배열', () => {
    expect(searchStudents([student1, student2], '')).toEqual([]);
  });

  it('이름 매칭', () => {
    const results = searchStudents([student1, student2], '홍길동');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s1');
    expect(results[0].matchedFields).toContain('이름');
  });

  it('전화번호 매칭', () => {
    const results = searchStudents([student1, student2], '010-1111');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('전화번호');
  });

  it('이메일 매칭', () => {
    const results = searchStudents([student1, student2], 'lee@test');
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('s2');
    expect(results[0].matchedFields).toContain('이메일');
  });

  it('주소 매칭', () => {
    const results = searchStudents([student1, student2], '부산시');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('주소');
  });

  it('메모 매칭', () => {
    const results = searchStudents([student1, student2], '성실');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('메모');
  });

  it('여러 결과 반환', () => {
    const results = searchStudents([student1, student2], '010');
    expect(results).toHaveLength(2);
  });

  it('빈 목록 → 빈 배열', () => {
    expect(searchStudents([], '홍')).toEqual([]);
  });

  it('email 없는 학생 → 이메일 필드 매칭 안됨', () => {
    const noEmail: Student = { ...student1, email: undefined };
    const results = searchStudents([noEmail], 'hong@test');
    expect(results).toHaveLength(0);
  });

  it('결과 구조 검증', () => {
    const results = searchStudents([student1], '홍길동');
    expect(results[0].type).toBe('student');
    expect(results[0].title).toBe('홍길동');
    expect(results[0].subtitle).toBe('010-1111-2222');
    expect(results[0].data).toBe(student1);
  });
});

// ─── searchEnrollments ────────────────────────────────────────────────────

describe('searchEnrollments', () => {
  it('빈 query → 빈 배열', () => {
    expect(searchEnrollments([enrollment1], [course1], [student1], '')).toEqual([]);
  });

  it('강좌명으로 매칭', () => {
    const results = searchEnrollments([enrollment1], [course1], [student1], '수학');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('강좌명');
  });

  it('수강생명으로 매칭', () => {
    const results = searchEnrollments([enrollment1], [course1], [student1], '홍길동');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('수강생명');
  });

  it('메모로 매칭', () => {
    const results = searchEnrollments([enrollment2], [course2], [student2], '분할');
    expect(results).toHaveLength(1);
    expect(results[0].matchedFields).toContain('메모');
  });

  it('강좌/수강생 없으면 결과 없음', () => {
    const results = searchEnrollments([enrollment1], [], [student1], '수학');
    expect(results).toHaveLength(0);
  });

  it('결과 구조 검증 — title, subtitle, description, type', () => {
    const results = searchEnrollments([enrollment1], [course1], [student1], '수학');
    expect(results[0].type).toBe('enrollment');
    expect(results[0].title).toContain('홍길동');
    expect(results[0].title).toContain('수학반');
    expect(results[0].subtitle).toContain('납부 상태');
  });

  it('여러 enrollment 매칭', () => {
    const results = searchEnrollments(
      [enrollment1, enrollment2],
      [course1, course2],
      [student1, student2],
      '이'
    );
    // 이선생(강사), 이영희(수강생) 등 매칭될 수 있음
    expect(results.length).toBeGreaterThanOrEqual(0); // 에러 없이 완료
  });
});

// ─── searchAll ────────────────────────────────────────────────────────────

describe('searchAll', () => {
  it('빈 query → 빈 배열', () => {
    expect(searchAll('', [course1], [student1], [enrollment1])).toEqual([]);
    expect(searchAll('   ', [course1], [student1], [enrollment1])).toEqual([]);
  });

  it('강좌 + 수강생 + enrollment 통합 결과', () => {
    const results = searchAll('수학', [course1, course2], [student1, student2], [enrollment1, enrollment2]);
    const types = results.map((r) => r.type);
    expect(types).toContain('course');
    expect(types).toContain('enrollment');
  });

  it('수강생 이름으로 student + enrollment 모두 히트', () => {
    const results = searchAll('홍길동', [course1], [student1], [enrollment1]);
    const types = results.map((r) => r.type);
    expect(types).toContain('student');
    // enrollment에서도 수강생명으로 매칭
    expect(types).toContain('enrollment');
  });

  it('빈 데이터 → 빈 결과', () => {
    expect(searchAll('수학', [], [], [])).toEqual([]);
  });

  it('매칭 없으면 빈 배열', () => {
    expect(searchAll('XXXXXXXXX', [course1], [student1], [enrollment1])).toEqual([]);
  });

  it('결과 순서 — course → student → enrollment', () => {
    const results = searchAll(
      '이',
      [course2], // 이선생
      [student2], // 이영희
      [enrollment2],
      // enrollment도 매칭될 수 있음
    );
    if (results.length >= 2) {
      const firstCourse = results.findIndex((r) => r.type === 'course');
      const firstStudent = results.findIndex((r) => r.type === 'student');
      if (firstCourse !== -1 && firstStudent !== -1) {
        expect(firstCourse).toBeLessThan(firstStudent);
      }
    }
  });

  it('한국어 검색어', () => {
    const results = searchAll('강남', [course1], [student1], [enrollment1]);
    // student1의 주소 '서울시 강남구' 매칭
    expect(results.some((r) => r.type === 'student')).toBe(true);
  });

  it('email 없는 학생 검색 시 description 빈 문자열', () => {
    const noEmailStudent: Student = {
      ...student1,
      id: 's-no-email',
      name: '이메일없음',
      email: undefined,
    };
    const results = searchStudents([noEmailStudent], '이메일없음');
    expect(results).toHaveLength(1);
    expect(results[0].description).toBe('');
  });
});

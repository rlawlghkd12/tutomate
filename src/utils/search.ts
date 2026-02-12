// 검색 유틸리티
import type { Course, Student, Enrollment } from '../types';

export interface SearchResult {
  type: 'course' | 'student' | 'enrollment';
  id: string;
  title: string;
  subtitle: string;
  description: string;
  data: Course | Student | Enrollment;
  matchedFields: string[];
}

// 문자열에 검색어가 포함되어 있는지 확인 (대소문자 무시)
const matchesQuery = (text: string | undefined, query: string): boolean => {
  if (!text) return false;
  return text.toLowerCase().includes(query.toLowerCase());
};

// 하이라이트용: 검색어를 포함하는 부분을 찾아 반환
export const highlightText = (text: string, query: string): string => {
  if (!query) return text;

  const regex = new RegExp(`(${query})`, 'gi');
  return text.replace(regex, '<mark>$1</mark>');
};

// 강좌 검색
export const searchCourses = (courses: Course[], query: string): SearchResult[] => {
  if (!query.trim()) return [];

  return courses.flatMap((course) => {
    const matchedFields: string[] = [];

    if (matchesQuery(course.name, query)) matchedFields.push('강좌명');
    if (matchesQuery(course.classroom, query)) matchedFields.push('강의실');
    if (matchesQuery(course.instructorName, query)) matchedFields.push('강사');
    if (matchesQuery(course.instructorPhone, query)) matchedFields.push('강사 전화번호');

    if (matchedFields.length === 0) return [];

    return [{
      type: 'course' as const,
      id: course.id,
      title: course.name,
      subtitle: `${course.classroom} | ${course.instructorName}`,
      description: `수강료: ₩${course.fee.toLocaleString()} | 정원: ${course.currentStudents}/${course.maxStudents}`,
      data: course,
      matchedFields,
    }];
  });
};

// 수강생 검색
export const searchStudents = (students: Student[], query: string): SearchResult[] => {
  if (!query.trim()) return [];

  return students.flatMap((student) => {
    const matchedFields: string[] = [];

    if (matchesQuery(student.name, query)) matchedFields.push('이름');
    if (matchesQuery(student.phone, query)) matchedFields.push('전화번호');
    if (matchesQuery(student.email, query)) matchedFields.push('이메일');
    if (matchesQuery(student.address, query)) matchedFields.push('주소');
    if (matchesQuery(student.notes, query)) matchedFields.push('메모');

    if (matchedFields.length === 0) return [];

    return [{
      type: 'student' as const,
      id: student.id,
      title: student.name,
      subtitle: student.phone,
      description: student.email,
      data: student,
      matchedFields,
    }];
  });
};

// 수강 신청 검색 (강좌명 + 수강생명으로 검색)
export const searchEnrollments = (
  enrollments: Enrollment[],
  courses: Course[],
  students: Student[],
  query: string
): SearchResult[] => {
  if (!query.trim()) return [];

  return enrollments.flatMap((enrollment) => {
    const course = courses.find((c) => c.id === enrollment.courseId);
    const student = students.find((s) => s.id === enrollment.studentId);

    if (!course || !student) return [];

    const matchedFields: string[] = [];

    if (matchesQuery(course.name, query)) matchedFields.push('강좌명');
    if (matchesQuery(student.name, query)) matchedFields.push('수강생명');
    if (matchesQuery(enrollment.notes, query)) matchedFields.push('메모');

    if (matchedFields.length === 0) return [];

    const statusMap = {
      pending: '미납',
      partial: '부분납부',
      completed: '완납',
      exempt: '면제',
    };

    return [{
      type: 'enrollment' as const,
      id: enrollment.id,
      title: `${student.name} - ${course.name}`,
      subtitle: `납부 상태: ${statusMap[enrollment.paymentStatus]}`,
      description: `납부: ₩${enrollment.paidAmount.toLocaleString()} / 잔여: ₩${enrollment.remainingAmount.toLocaleString()}`,
      data: enrollment,
      matchedFields,
    }];
  });
};

// 통합 검색
export const searchAll = (
  query: string,
  courses: Course[],
  students: Student[],
  enrollments: Enrollment[]
): SearchResult[] => {
  if (!query.trim()) return [];

  const courseResults = searchCourses(courses, query);
  const studentResults = searchStudents(students, query);
  const enrollmentResults = searchEnrollments(enrollments, courses, students, query);

  return [...courseResults, ...studentResults, ...enrollmentResults];
};

// Excel 및 CSV 내보내기 유틸리티
import * as XLSX from 'xlsx';
import type { Course, Student, Enrollment } from '../types';
import dayjs from 'dayjs';

const ORG_NAME = '통도예술마을협동조합';

// Excel 파일 다운로드 헬퍼
const downloadExcel = (workbook: XLSX.WorkBook, filename: string) => {
  const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${dayjs().format('YYYYMMDD_HHmmss')}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
};

// CSV 파일 다운로드 헬퍼
const downloadCSV = (csv: string, filename: string, encoding: 'utf-8' | 'euc-kr' = 'utf-8') => {
  let blob: Blob;

  if (encoding === 'euc-kr') {
    // EUC-KR 인코딩은 브라우저에서 직접 지원하지 않으므로 UTF-8 BOM 사용
    const BOM = '\uFEFF';
    blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  } else {
    blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
  link.click();
  URL.revokeObjectURL(url);
};

// Excel 시트에 헤더 행 추가 후 데이터 삽입하는 헬퍼
const createSheetWithHeader = (
  headerLines: string[],
  data: Record<string, string | number>[],
  colWidths?: { wch: number }[]
): XLSX.WorkSheet => {
  // 헤더 행 생성 (각 줄을 한 셀에)
  const headerRows: (string | number)[][] = headerLines.map((line) => [line]);
  headerRows.push([]); // 빈 줄

  const ws = XLSX.utils.aoa_to_sheet(headerRows);
  // 데이터 행 삽입 (헤더 + 빈줄 다음부터)
  XLSX.utils.sheet_add_json(ws, data, { origin: headerRows.length });

  if (colWidths) {
    ws['!cols'] = colWidths;
  }

  return ws;
};

// CSV에 헤더 행 추가하는 헬퍼
const buildCSVWithHeader = (headerLines: string[], csvHeaders: string[], rows: string[][]): string => {
  const header = headerLines.map((line) => `"${line}"`).join('\n');
  const dataCSV = [csvHeaders.join(','), ...rows.map((row) => row.join(','))].join('\n');
  return `${header}\n\n${dataCSV}`;
};

// 수강생 명단 Excel 내보내기
export const exportStudentsToExcel = (
  students: Student[],
  enrollments: Enrollment[],
  courses: Course[]
) => {
  const data = students.map((student) => {
    const studentEnrollments = enrollments.filter((e) => e.studentId === student.id);
    const enrolledCourses = studentEnrollments
      .map((e) => courses.find((c) => c.id === e.courseId)?.name)
      .filter(Boolean)
      .join(', ');

    const totalPaid = studentEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const totalRemaining = studentEnrollments.reduce((sum, e) => sum + e.remainingAmount, 0);

    return {
      이름: student.name,
      전화번호: student.phone,
      이메일: student.email || '',
      주소: student.address || '',
      생년월일: student.birthDate || '',
      수강강좌: enrolledCourses,
      납부금액: totalPaid,
      잔여금액: totalRemaining,
      메모: student.notes || '',
      등록일: dayjs(student.createdAt).format('YYYY-MM-DD'),
    };
  });

  const colWidths = [
    { wch: 10 }, { wch: 15 }, { wch: 25 }, { wch: 30 }, { wch: 12 },
    { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 },
  ];

  const headerLines = [ORG_NAME, `수강생 명단 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const worksheet = createSheetWithHeader(headerLines, data, colWidths);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수강생 명단');

  downloadExcel(workbook, '수강생_명단');
};

// 수익 현황 Excel 내보내기
export const exportRevenueToExcel = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[]
) => {
  const localPaymentStatusMap: Record<string, string> = {
    pending: '미납',
    partial: '부분납부',
    completed: '완납',
    exempt: '면제',
  };

  const data = enrollments.map((enrollment) => {
    const student = students.find((s) => s.id === enrollment.studentId);
    const course = courses.find((c) => c.id === enrollment.courseId);

    return {
      강좌명: course?.name || '',
      수강생: student?.name || '',
      전화번호: student?.phone || '',
      수강료: course?.fee || 0,
      납부금액: enrollment.paidAmount,
      잔여금액: enrollment.remainingAmount,
      납부상태: localPaymentStatusMap[enrollment.paymentStatus],
      등록일: dayjs(enrollment.enrolledAt).format('YYYY-MM-DD'),
      메모: enrollment.notes || '',
    };
  });

  // 합계 행 추가
  const totalFee = data.reduce((sum, row) => sum + row.수강료, 0);
  const totalPaid = data.reduce((sum, row) => sum + row.납부금액, 0);
  const totalRemaining = data.reduce((sum, row) => sum + row.잔여금액, 0);

  data.push({
    강좌명: '합계',
    수강생: '',
    전화번호: '',
    수강료: totalFee,
    납부금액: totalPaid,
    잔여금액: totalRemaining,
    납부상태: '',
    등록일: '',
    메모: '',
  });

  const colWidths = [
    { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
  ];

  const headerLines = [ORG_NAME, `수익 현황 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const worksheet = createSheetWithHeader(headerLines, data, colWidths);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수익 현황');

  downloadExcel(workbook, '수익_현황');
};

// CSV 내보내기 - 수강생 명단
export const exportStudentsToCSV = (
  students: Student[],
  enrollments: Enrollment[],
  courses: Course[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8'
) => {
  const headers = ['이름', '전화번호', '이메일', '주소', '생년월일', '수강강좌', '납부금액', '잔여금액', '메모', '등록일'];

  const rows = students.map((student) => {
    const studentEnrollments = enrollments.filter((e) => e.studentId === student.id);
    const enrolledCourses = studentEnrollments
      .map((e) => courses.find((c) => c.id === e.courseId)?.name)
      .filter(Boolean)
      .join('; ');

    const totalPaid = studentEnrollments.reduce((sum, e) => sum + e.paidAmount, 0);
    const totalRemaining = studentEnrollments.reduce((sum, e) => sum + e.remainingAmount, 0);

    return [
      student.name,
      student.phone,
      student.email,
      student.address || '',
      student.birthDate || '',
      enrolledCourses,
      totalPaid,
      totalRemaining,
      student.notes || '',
      dayjs(student.createdAt).format('YYYY-MM-DD'),
    ].map((cell) => `"${cell}"`);
  });

  const headerLines = [ORG_NAME, `수강생 명단 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const csv = buildCSVWithHeader(headerLines, headers, rows);
  downloadCSV(csv, '수강생_명단', encoding);
};

// CSV 내보내기 - 수익 현황
export const exportRevenueToCSV = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8'
) => {
  const headers = ['강좌명', '수강생', '전화번호', '수강료', '납부금액', '잔여금액', '납부상태', '등록일', '메모'];

  const localPaymentStatusMap: Record<string, string> = {
    pending: '미납',
    partial: '부분납부',
    completed: '완납',
    exempt: '면제',
  };

  const rows = enrollments.map((enrollment) => {
    const student = students.find((s) => s.id === enrollment.studentId);
    const course = courses.find((c) => c.id === enrollment.courseId);

    return [
      course?.name || '',
      student?.name || '',
      student?.phone || '',
      course?.fee || 0,
      enrollment.paidAmount,
      enrollment.remainingAmount,
      localPaymentStatusMap[enrollment.paymentStatus],
      dayjs(enrollment.enrolledAt).format('YYYY-MM-DD'),
      enrollment.notes || '',
    ].map((cell) => `"${cell}"`);
  });

  const headerLines = [ORG_NAME, `수익 현황 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const csv = buildCSVWithHeader(headerLines, headers, rows);
  downloadCSV(csv, '수익_현황', encoding);
};

// 합계 대상 필드
const SUMMABLE_FIELDS = new Set(['paidAmount', 'remainingAmount']);

// 강좌별 수강생 필드 정의
export interface CourseStudentExportField {
  key: string;
  label: string;
  getValue: (student: Student, enrollment: Enrollment) => string | number;
}

const paymentStatusMap: Record<string, string> = {
  pending: '미납',
  partial: '부분납부',
  completed: '완납',
  exempt: '면제',
};

export const COURSE_STUDENT_EXPORT_FIELDS: CourseStudentExportField[] = [
  { key: 'name', label: '이름', getValue: (s) => s.name },
  { key: 'phone', label: '전화번호', getValue: (s) => s.phone },
  { key: 'email', label: '이메일', getValue: (s) => s.email || '' },
  { key: 'address', label: '주소', getValue: (s) => s.address || '' },
  { key: 'birthDate', label: '생년월일', getValue: (s) => s.birthDate || '' },
  { key: 'paymentStatus', label: '납부 현황', getValue: (_, e) => paymentStatusMap[e.paymentStatus] },
  { key: 'paidAmount', label: '납부 금액', getValue: (_, e) => e.paidAmount },
  { key: 'remainingAmount', label: '잔여 금액', getValue: (_, e) => e.remainingAmount },
  { key: 'paidAt', label: '납부일자', getValue: (_, e) => e.paidAt ? dayjs(e.paidAt).format('YYYY-MM-DD') : '' },
  { key: 'enrolledAt', label: '등록일', getValue: (_, e) => dayjs(e.enrolledAt).format('YYYY-MM-DD') },
  { key: 'notes', label: '메모', getValue: (_, e) => e.notes || '' },
];

// 강좌별 수강생 Excel 내보내기
export const exportCourseStudentsToExcel = (
  course: Course,
  data: { student: Student; enrollment: Enrollment }[],
  selectedFields: string[]
) => {
  const fields = COURSE_STUDENT_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key));

  const rows = data.map(({ student, enrollment }) => {
    const row: Record<string, string | number> = {};
    fields.forEach((field) => {
      row[field.label] = field.getValue(student, enrollment);
    });
    return row;
  });

  // 합계 행 추가
  const hasSummable = fields.some((f) => SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow: Record<string, string | number> = {};
    fields.forEach((field, idx) => {
      if (SUMMABLE_FIELDS.has(field.key)) {
        totalRow[field.label] = data.reduce(
          (sum, { student, enrollment }) => sum + (Number(field.getValue(student, enrollment)) || 0),
          0,
        );
      } else if (idx === 0) {
        totalRow[field.label] = '합계';
      } else {
        totalRow[field.label] = '';
      }
    });
    rows.push(totalRow);
  }

  const headerLines = [
    ORG_NAME,
    `${course.name} — 수강생 명단`,
    `강사: ${course.instructorName} | 강의실: ${course.classroom} | 수강료: ₩${course.fee.toLocaleString()} | 출력일: ${dayjs().format('YYYY-MM-DD')}`,
  ];

  const colWidths = fields.map((f) => ({ wch: Math.max(f.label.length * 2, 12) }));
  const worksheet = createSheetWithHeader(headerLines, rows, colWidths);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수강생');

  downloadExcel(workbook, `${course.name}_수강생`);
};

// 강좌별 수강생 CSV 내보내기
export const exportCourseStudentsToCSV = (
  course: Course,
  data: { student: Student; enrollment: Enrollment }[],
  selectedFields: string[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8'
) => {
  const fields = COURSE_STUDENT_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key));
  const csvHeaders = fields.map((f) => f.label);

  const rows = data.map(({ student, enrollment }) =>
    fields.map((field) => `"${field.getValue(student, enrollment)}"`),
  );

  // 합계 행 추가
  const hasSummable = fields.some((f) => SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow = fields.map((field, idx) => {
      if (SUMMABLE_FIELDS.has(field.key)) {
        const sum = data.reduce(
          (s, { student, enrollment }) => s + (Number(field.getValue(student, enrollment)) || 0),
          0,
        );
        return `"${sum}"`;
      }
      return idx === 0 ? '"합계"' : '""';
    });
    rows.push(totalRow);
  }

  const headerLines = [
    ORG_NAME,
    `${course.name} — 수강생 명단`,
    `강사: ${course.instructorName} | 강의실: ${course.classroom} | 수강료: ₩${course.fee.toLocaleString()} | 출력일: ${dayjs().format('YYYY-MM-DD')}`,
  ];
  const csv = buildCSVWithHeader(headerLines, csvHeaders, rows);
  downloadCSV(csv, `${course.name}_수강생`, encoding);
};

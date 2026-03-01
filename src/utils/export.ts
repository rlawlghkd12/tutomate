// Excel 및 CSV 내보내기 유틸리티
import * as XLSX from 'xlsx';
import type { Course, Student, Enrollment } from '../types';
import { PAYMENT_METHOD_LABELS } from '../types';
import dayjs from 'dayjs';

import { useSettingsStore } from '../stores/settingsStore';

const getOrgName = () => useSettingsStore.getState().organizationName;

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
  courses: Course[],
  selectedFields?: string[]
) => {
  const fields = selectedFields
    ? STUDENT_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key))
    : STUDENT_EXPORT_FIELDS;

  const rows = students.map((student) => {
    const row: Record<string, string | number> = {};
    fields.forEach((field) => {
      row[field.label] = field.getValue(student, enrollments, courses);
    });
    return row;
  });

  // 합계 행 추가
  const hasSummable = fields.some((f) => STUDENT_SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow: Record<string, string | number> = {};
    fields.forEach((field, idx) => {
      if (STUDENT_SUMMABLE_FIELDS.has(field.key)) {
        totalRow[field.label] = students.reduce(
          (sum, student) => sum + (Number(field.getValue(student, enrollments, courses)) || 0),
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

  const colWidths = fields.map((f) => ({ wch: f.wch }));
  const headerLines = [getOrgName(), `수강생 명단 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const worksheet = createSheetWithHeader(headerLines, rows, colWidths);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수강생 명단');

  downloadExcel(workbook, '수강생_명단');
};

// 수익 현황 필드 정의
export interface RevenueExportField {
  key: string;
  label: string;
  wch: number;
  getValue: (enrollment: Enrollment, students: Student[], courses: Course[]) => string | number;
}

const revenuePaymentStatusMap: Record<string, string> = {
  pending: '미납',
  partial: '부분납부',
  completed: '완납',
  exempt: '면제',
};

export const REVENUE_EXPORT_FIELDS: RevenueExportField[] = [
  { key: 'courseName', label: '강좌명', wch: 20, getValue: (e, _, crs) => crs.find((c) => c.id === e.courseId)?.name || '' },
  { key: 'studentName', label: '수강생', wch: 10, getValue: (e, sts) => sts.find((s) => s.id === e.studentId)?.name || '' },
  { key: 'phone', label: '전화번호', wch: 15, getValue: (e, sts) => sts.find((s) => s.id === e.studentId)?.phone || '' },
  { key: 'fee', label: '수강료', wch: 12, getValue: (e, _, crs) => crs.find((c) => c.id === e.courseId)?.fee || 0 },
  { key: 'discountAmount', label: '할인금액', wch: 12, getValue: (e) => e.discountAmount ?? 0 },
  { key: 'paidAmount', label: '납부금액', wch: 12, getValue: (e) => e.paidAmount },
  { key: 'remainingAmount', label: '잔여금액', wch: 12, getValue: (e) => e.remainingAmount },
  { key: 'paymentStatus', label: '납부상태', wch: 12, getValue: (e) => revenuePaymentStatusMap[e.paymentStatus] },
  { key: 'paymentMethod', label: '납부방법', wch: 12, getValue: (e) => e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : '' },
  { key: 'enrolledAt', label: '등록일', wch: 12, getValue: (e) => dayjs(e.enrolledAt).format('YYYY-MM-DD') },
  { key: 'notes', label: '메모', wch: 30, getValue: (e) => e.notes || '' },
];

const REVENUE_SUMMABLE_FIELDS = new Set(['fee', 'paidAmount', 'remainingAmount']);

// 수익 현황 Excel 내보내기
export const exportRevenueToExcel = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[],
  selectedFields?: string[]
) => {
  const fields = selectedFields
    ? REVENUE_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key))
    : REVENUE_EXPORT_FIELDS;

  const rows = enrollments.map((enrollment) => {
    const row: Record<string, string | number> = {};
    fields.forEach((field) => {
      row[field.label] = field.getValue(enrollment, students, courses);
    });
    return row;
  });

  // 합계 행 추가
  const hasSummable = fields.some((f) => REVENUE_SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow: Record<string, string | number> = {};
    fields.forEach((field, idx) => {
      if (REVENUE_SUMMABLE_FIELDS.has(field.key)) {
        totalRow[field.label] = enrollments.reduce(
          (sum, enrollment) => sum + (Number(field.getValue(enrollment, students, courses)) || 0),
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

  const colWidths = fields.map((f) => ({ wch: f.wch }));
  const headerLines = [getOrgName(), `수익 현황 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const worksheet = createSheetWithHeader(headerLines, rows, colWidths);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수익 현황');

  downloadExcel(workbook, '수익_현황');
};

// CSV 내보내기 - 수강생 명단
export const exportStudentsToCSV = (
  students: Student[],
  enrollments: Enrollment[],
  courses: Course[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8',
  selectedFields?: string[]
) => {
  const fields = selectedFields
    ? STUDENT_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key))
    : STUDENT_EXPORT_FIELDS;

  const csvHeaders = fields.map((f) => f.label);

  const rows = students.map((student) =>
    fields.map((field) => `"${field.getValue(student, enrollments, courses)}"`),
  );

  // 합계 행 추가
  const hasSummable = fields.some((f) => STUDENT_SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow = fields.map((field, idx) => {
      if (STUDENT_SUMMABLE_FIELDS.has(field.key)) {
        const sum = students.reduce(
          (s, student) => s + (Number(field.getValue(student, enrollments, courses)) || 0),
          0,
        );
        return `"${sum}"`;
      }
      return idx === 0 ? '"합계"' : '""';
    });
    rows.push(totalRow);
  }

  const headerLines = [getOrgName(), `수강생 명단 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const csv = buildCSVWithHeader(headerLines, csvHeaders, rows);
  downloadCSV(csv, '수강생_명단', encoding);
};

// CSV 내보내기 - 수익 현황
export const exportRevenueToCSV = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[],
  encoding: 'utf-8' | 'euc-kr' = 'utf-8',
  selectedFields?: string[]
) => {
  const fields = selectedFields
    ? REVENUE_EXPORT_FIELDS.filter((f) => selectedFields.includes(f.key))
    : REVENUE_EXPORT_FIELDS;

  const csvHeaders = fields.map((f) => f.label);

  const rows = enrollments.map((enrollment) =>
    fields.map((field) => `"${field.getValue(enrollment, students, courses)}"`),
  );

  // 합계 행 추가
  const hasSummable = fields.some((f) => REVENUE_SUMMABLE_FIELDS.has(f.key));
  if (hasSummable) {
    const totalRow = fields.map((field, idx) => {
      if (REVENUE_SUMMABLE_FIELDS.has(field.key)) {
        const sum = enrollments.reduce(
          (s, enrollment) => s + (Number(field.getValue(enrollment, students, courses)) || 0),
          0,
        );
        return `"${sum}"`;
      }
      return idx === 0 ? '"합계"' : '""';
    });
    rows.push(totalRow);
  }

  const headerLines = [getOrgName(), `수익 현황 (${dayjs().format('YYYY-MM-DD')} 기준)`];
  const csv = buildCSVWithHeader(headerLines, csvHeaders, rows);
  downloadCSV(csv, '수익_현황', encoding);
};

// 합계 대상 필드
const SUMMABLE_FIELDS = new Set(['paidAmount', 'remainingAmount']);

// 수강생 명단 필드 정의
export interface StudentExportField {
  key: string;
  label: string;
  wch: number;
  getValue: (student: Student, enrollments: Enrollment[], courses: Course[]) => string | number;
}

export const STUDENT_EXPORT_FIELDS: StudentExportField[] = [
  { key: 'name', label: '이름', wch: 10, getValue: (s) => s.name },
  { key: 'phone', label: '전화번호', wch: 15, getValue: (s) => s.phone },
  { key: 'email', label: '이메일', wch: 25, getValue: (s) => s.email || '' },
  { key: 'address', label: '주소', wch: 30, getValue: (s) => s.address || '' },
  { key: 'birthDate', label: '생년월일', wch: 12, getValue: (s) => s.birthDate || '' },
  {
    key: 'enrolledCourses', label: '수강강좌', wch: 30,
    getValue: (s, enrs, crs) =>
      enrs.filter((e) => e.studentId === s.id)
        .map((e) => crs.find((c) => c.id === e.courseId)?.name)
        .filter(Boolean)
        .join(', '),
  },
  {
    key: 'totalPaid', label: '납부금액', wch: 12,
    getValue: (s, enrs) => enrs.filter((e) => e.studentId === s.id).reduce((sum, e) => sum + e.paidAmount, 0),
  },
  {
    key: 'totalRemaining', label: '잔여금액', wch: 12,
    getValue: (s, enrs) => enrs.filter((e) => e.studentId === s.id).reduce((sum, e) => sum + e.remainingAmount, 0),
  },
  { key: 'notes', label: '메모', wch: 30, getValue: (s) => s.notes || '' },
  { key: 'createdAt', label: '등록일', wch: 12, getValue: (s) => dayjs(s.createdAt).format('YYYY-MM-DD') },
];

const STUDENT_SUMMABLE_FIELDS = new Set(['totalPaid', 'totalRemaining']);

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
  { key: 'discountAmount', label: '할인 금액', getValue: (_, e) => e.discountAmount ?? 0 },
  { key: 'remainingAmount', label: '잔여 금액', getValue: (_, e) => e.remainingAmount },
  { key: 'paymentMethod', label: '납부 방법', getValue: (_, e) => e.paymentMethod ? PAYMENT_METHOD_LABELS[e.paymentMethod] : '' },
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
    getOrgName(),
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
    getOrgName(),
    `${course.name} — 수강생 명단`,
    `강사: ${course.instructorName} | 강의실: ${course.classroom} | 수강료: ₩${course.fee.toLocaleString()} | 출력일: ${dayjs().format('YYYY-MM-DD')}`,
  ];
  const csv = buildCSVWithHeader(headerLines, csvHeaders, rows);
  downloadCSV(csv, `${course.name}_수강생`, encoding);
};

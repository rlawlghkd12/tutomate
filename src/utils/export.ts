// Excel 및 CSV 내보내기 유틸리티
import * as XLSX from 'xlsx';
import type { Course, Student, Enrollment, Attendance } from '../types';
import dayjs from 'dayjs';

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
      이메일: student.email,
      주소: student.address || '',
      생년월일: student.birthDate || '',
      수강강좌: enrolledCourses,
      납부금액: totalPaid,
      잔여금액: totalRemaining,
      메모: student.notes || '',
      등록일: dayjs(student.createdAt).format('YYYY-MM-DD'),
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수강생 명단');

  // 열 너비 설정
  const colWidths = [
    { wch: 10 }, // 이름
    { wch: 15 }, // 전화번호
    { wch: 25 }, // 이메일
    { wch: 30 }, // 주소
    { wch: 12 }, // 생년월일
    { wch: 30 }, // 수강강좌
    { wch: 12 }, // 납부금액
    { wch: 12 }, // 잔여금액
    { wch: 30 }, // 메모
    { wch: 12 }, // 등록일
  ];
  worksheet['!cols'] = colWidths;

  downloadExcel(workbook, '수강생_명단');
};

// 강좌별 출석부 Excel 내보내기
export const exportAttendanceToExcel = (
  course: Course,
  students: Student[],
  enrollments: Enrollment[],
  attendances: Attendance[]
) => {
  // 해당 강좌의 수강생 목록
  const courseEnrollments = enrollments.filter((e) => e.courseId === course.id);
  const courseStudents = students.filter((s) =>
    courseEnrollments.some((e) => e.studentId === s.id)
  );

  // 출석 날짜 목록 (유니크하게, 정렬)
  const dates = Array.from(
    new Set(
      attendances
        .filter((a) => a.courseId === course.id)
        .map((a) => a.date)
    )
  ).sort();

  // 출석부 데이터 생성
  const data = courseStudents.map((student) => {
    const row: any = {
      이름: student.name,
      전화번호: student.phone,
    };

    // 각 날짜별 출석 상태
    dates.forEach((date) => {
      const attendance = attendances.find(
        (a) => a.courseId === course.id && a.studentId === student.id && a.date === date
      );
      const statusMap = {
        present: 'O',
        absent: 'X',
        late: '△',
      };
      row[dayjs(date).format('MM/DD')] = attendance
        ? statusMap[attendance.status]
        : '-';
    });

    // 출석 통계
    const studentAttendances = attendances.filter(
      (a) => a.courseId === course.id && a.studentId === student.id
    );
    const presentCount = studentAttendances.filter((a) => a.status === 'present').length;
    const lateCount = studentAttendances.filter((a) => a.status === 'late').length;
    const absentCount = studentAttendances.filter((a) => a.status === 'absent').length;
    const total = studentAttendances.length;
    const rate = total > 0 ? ((presentCount + lateCount * 0.5) / total) * 100 : 0;

    row['출석'] = presentCount;
    row['지각'] = lateCount;
    row['결석'] = absentCount;
    row['출석률'] = `${rate.toFixed(1)}%`;

    return row;
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '출석부');

  downloadExcel(workbook, `${course.name}_출석부`);
};

// 수익 현황 Excel 내보내기
export const exportRevenueToExcel = (
  enrollments: Enrollment[],
  students: Student[],
  courses: Course[]
) => {
  const data = enrollments.map((enrollment) => {
    const student = students.find((s) => s.id === enrollment.studentId);
    const course = courses.find((c) => c.id === enrollment.courseId);

    const paymentStatusMap = {
      pending: '미납',
      partial: '부분납부',
      completed: '완납',
    };

    return {
      강좌명: course?.name || '',
      수강생: student?.name || '',
      전화번호: student?.phone || '',
      수강료: course?.fee || 0,
      납부금액: enrollment.paidAmount,
      잔여금액: enrollment.remainingAmount,
      납부상태: paymentStatusMap[enrollment.paymentStatus],
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

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '수익 현황');

  // 열 너비 설정
  const colWidths = [
    { wch: 20 }, // 강좌명
    { wch: 10 }, // 수강생
    { wch: 15 }, // 전화번호
    { wch: 12 }, // 수강료
    { wch: 12 }, // 납부금액
    { wch: 12 }, // 잔여금액
    { wch: 12 }, // 납부상태
    { wch: 12 }, // 등록일
    { wch: 30 }, // 메모
  ];
  worksheet['!cols'] = colWidths;

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

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
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

  const paymentStatusMap = {
    pending: '미납',
    partial: '부분납부',
    completed: '완납',
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
      paymentStatusMap[enrollment.paymentStatus],
      dayjs(enrollment.enrolledAt).format('YYYY-MM-DD'),
      enrollment.notes || '',
    ].map((cell) => `"${cell}"`);
  });

  const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
  downloadCSV(csv, '수익_현황', encoding);
};

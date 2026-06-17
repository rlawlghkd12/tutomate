import type { StandardField } from '../excel/types';

/**
 * 표준 필드 ↔ 학원/공방/교습소 등 도메인의 다양한 헤더 변형 사전.
 * 도메인 중립적으로 학원·공방·교습소·평생교육원·부트캠프 등 광범위 커버.
 */
export const SYNONYMS: Record<StandardField, string[]> = {
  name:           ['이름', '학생명', '성명', '원생명', '수강생명', '아이이름', '회원명', '교습생', 'name', 'student', 'member'],
  phone:          ['전화', '연락처', '핸드폰', '휴대폰', '전화번호', 'phone', 'tel', 'mobile'],
  parentPhone:    ['보호자', '학부모', '학부모연락처', '보호자전화', '엄마번호', '아빠번호'],
  birthDate:      ['생년월일', '생일', '생년', '출생일', 'birthDate', 'birthday', 'dob'],
  enrollmentDate: ['등록일', '등록일자', '입회일', '가입일', '시작일', 'enrollmentDate', 'startDate'],
  paymentDate:    ['납부일', '결제일', '입금일', '납입일', '수납일', '결제일자', '납부일자', 'paymentDate', 'paidAt'],
  amount:         ['금액', '수강료', '납부액', '결제금액', '학원비', '원비', '수업료', '교습비', '강습료', '회비', 'amount', 'fee', 'price'],
  paymentMethod:  ['결제수단', '납부방법', '결제방법', '결제유형', 'paymentMethod', 'method'],
  note:           ['비고', '메모', '특이사항', '참고', 'note', 'memo'],
  className:      ['반', '수강반', '클래스', '강의명', '강좌명', '수업명', 'className', 'class'],
  tuitionPlan:    ['과정', '수강과정', '코스', '프로그램', '강좌', 'tuitionPlan', 'course', 'program'],
};

/** 헤더 정규화: 공백/괄호/특수문자 제거 + 소문자화. 매칭 키로 사용. */
export function normalizeHeader(raw: string): string {
  return String(raw).toLowerCase().replace(/[\s()\[\]_\-./:]+/g, '');
}

/**
 * 정규화된 헤더로 사전 검색.
 * 1. 정확 일치 우선
 * 2. 부분 일치 (포함 관계) 폴백
 * 3. 못 찾으면 null
 */
export function findField(normalizedHeader: string): StandardField | null {
  // 1차: 정확 일치
  for (const [field, words] of Object.entries(SYNONYMS) as [StandardField, string[]][]) {
    for (const w of words) {
      if (normalizedHeader === normalizeHeader(w)) return field;
    }
  }
  // 2차: 부분 일치
  for (const [field, words] of Object.entries(SYNONYMS) as [StandardField, string[]][]) {
    for (const w of words) {
      const wn = normalizeHeader(w);
      if (normalizedHeader.includes(wn) || wn.includes(normalizedHeader)) return field;
    }
  }
  return null;
}

import { describe, it, expect } from 'vitest';
import { tryRuleMapping } from '../ColumnMapper';

/**
 * 골든 매핑 회귀 — 실제 사용 조직(학원/공방/교습소 등)의 다양한 헤더 변형.
 * 출시 후 새로운 양식 발견 시 이 목록에 추가하여 회귀 방지.
 */
const GOLDEN: { name: string; headers: string[]; expectedOk: boolean }[] = [
  // 표준
  { name: '표준 양식', headers: ['이름', '연락처', '결제일', '금액'], expectedOk: true },

  // 변형
  { name: '괄호/공백 변형', headers: ['학생 이름', '전화번호 (휴대)', '결제일자', '수강료(원)'], expectedOk: true },
  { name: '영어 헤더', headers: ['name', 'phone', 'paymentDate', 'amount'], expectedOk: true },

  // 도메인 (학원)
  { name: '학원 양식 - 원생명/학원비', headers: ['원생명', '연락처', '학원비', '납부일자'], expectedOk: true },
  { name: '학원 양식 - 학생명/수강료', headers: ['학생명', '학부모연락처', '수업료', '결제일'], expectedOk: true },

  // 도메인 (공방/교습소)
  { name: '공방 양식 - 회원명/강습료', headers: ['회원명', '연락처', '강습료', '등록일'], expectedOk: true },
  { name: '교습소 양식 - 교습생/교습비', headers: ['교습생', '핸드폰', '교습비', '입금일'], expectedOk: true },

  // 도메인 (평생교육원/부트캠프)
  { name: '평생교육원 양식', headers: ['수강생명', '연락처', '회비', '결제일자'], expectedOk: true },
  { name: '부트캠프 양식', headers: ['name', 'phone', '강좌명', 'amount'], expectedOk: true },

  // 메타 컬럼 포함
  { name: '메타 컬럼 풀세트', headers: ['이름', '연락처', '학부모연락처', '생년월일', '등록일', '결제일', '금액', '결제수단', '비고', '수강반', '과정'], expectedOk: true },

  // 미매칭 케이스
  { name: '미매칭 컬럼 - 도시락', headers: ['이름', '도시락여부'], expectedOk: false },
  { name: '미매칭 컬럼 - 알레르기', headers: ['이름', '연락처', '알레르기'], expectedOk: false },
  { name: '미매칭 컬럼 - 사진', headers: ['이름', '사진경로'], expectedOk: false },
];

describe('골든 매핑 회귀', () => {
  for (const c of GOLDEN) {
    it(c.name, () => {
      const r = tryRuleMapping(c.headers);
      expect(r.status === 'ok').toBe(c.expectedOk);
    });
  }
});

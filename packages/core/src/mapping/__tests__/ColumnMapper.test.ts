import { describe, it, expect } from 'vitest';
import { tryRuleMapping, computeSignature } from '../ColumnMapper';

describe('tryRuleMapping', () => {
  it('전부 매칭되면 status=ok', () => {
    const r = tryRuleMapping(['이름', '연락처', '결제일', '금액']);
    expect(r.status).toBe('ok');
    expect(r.mapping).toEqual({
      '이름': 'name',
      '연락처': 'phone',
      '결제일': 'paymentDate',
      '금액': 'amount',
    });
    expect(r.unmatched).toEqual([]);
  });

  it('매칭 안 되는 헤더 있으면 status=mismatch', () => {
    const r = tryRuleMapping(['이름', '도시락여부']);
    expect(r.status).toBe('mismatch');
    expect(r.unmatched).toEqual(['도시락여부']);
    expect(r.mapping).toEqual({ '이름': 'name' });
  });

  it('순번·출석 등 관리 컬럼은 무시하고 나머지가 매칭되면 ok', () => {
    const r = tryRuleMapping(['순번', '이름', '연락처', '금액', '결제일', '출석']);
    expect(r.status).toBe('ok');
    expect(r.unmatched).toEqual([]);
    expect(r.mapping).toEqual({
      '이름': 'name',
      '연락처': 'phone',
      '금액': 'amount',
      '결제일': 'paymentDate',
    });
    expect(r.mapping['순번']).toBeUndefined(); // 무시됨(매핑 안 함)
  });

  it('무시 컬럼이 있어도 진짜 알 수 없는 컬럼은 여전히 mismatch', () => {
    const r = tryRuleMapping(['순번', '이름', '도시락여부']);
    expect(r.status).toBe('mismatch');
    expect(r.unmatched).toEqual(['도시락여부']); // 순번은 무시, 도시락여부만 미매칭
  });

  it("'No' 인덱스 컬럼은 note로 오매핑되지 않고 무시된다", () => {
    const r = tryRuleMapping(['No', '이름', '금액', '결제일']);
    expect(r.status).toBe('ok');
    expect(r.mapping['No']).toBeUndefined(); // note로 매핑되면 안 됨
    expect(r.unmatched).toEqual([]);
  });

  it("'번호'(행 순번) 컬럼은 phone으로 오매핑되지 않고 무시된다", () => {
    const r = tryRuleMapping(['번호', '이름', '금액', '결제일']);
    expect(r.status).toBe('ok');
    expect(r.mapping['번호']).toBeUndefined(); // '전화번호' 부분일치로 phone 되면 안 됨
    expect(Object.values(r.mapping)).not.toContain('phone');
  });

  it('두 열이 같은 필드로 매핑되면(수강료+결제금액→amount) 충돌로 보고 둘 다 확인 대상', () => {
    const r = tryRuleMapping(['이름', '결제금액', '수강료', '결제일']);
    expect(r.status).toBe('mismatch');
    // 어느 열이 진짜 결제액인지 자동 결정 금지 → 두 금액 열 모두 미매칭(사용자 확인)
    expect(r.unmatched).toContain('결제금액');
    expect(r.unmatched).toContain('수강료');
    expect(Object.values(r.mapping)).not.toContain('amount');
    expect(r.mapping['이름']).toBe('name');
    expect(r.mapping['결제일']).toBe('paymentDate');
  });

  it('도메인 변형 (회원명, 강습료, 강좌명) 매칭', () => {
    const r = tryRuleMapping(['회원명', '연락처', '강습료', '강좌명']);
    expect(r.status).toBe('ok');
    expect(r.mapping).toEqual({
      '회원명': 'name',
      '연락처': 'phone',
      '강습료': 'amount',
      '강좌명': 'className',
    });
  });
});

describe('computeSignature', () => {
  it('헤더 순서가 달라도 동일 시그니처', () => {
    expect(computeSignature(['이름', '연락처']))
      .toBe(computeSignature(['연락처', '이름']));
  });

  it('헤더 집합이 다르면 시그니처 다름', () => {
    expect(computeSignature(['이름', '연락처']))
      .not.toBe(computeSignature(['이름', '주소']));
  });

  it('정규화된 헤더 기준 — 공백/괄호 변형은 동일 시그니처', () => {
    expect(computeSignature(['학생 이름', '전화번호 (휴대)']))
      .toBe(computeSignature(['학생이름', '전화번호(휴대)']));
  });

  it('무시 컬럼(순번·출석)만 다르면 동일 시그니처 → 캐시 공유', () => {
    expect(computeSignature(['순번', '이름', '금액', '출석']))
      .toBe(computeSignature(['이름', '금액']));
  });
});

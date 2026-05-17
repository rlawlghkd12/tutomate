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
});

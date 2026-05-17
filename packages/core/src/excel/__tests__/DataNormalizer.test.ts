import { describe, it, expect } from 'vitest';
import { normalizeRow } from '../DataNormalizer';

describe('normalizeRow', () => {
  it('전화번호 다양한 포맷 → 01012345678', () => {
    const cases = ['010-1234-5678', '010 1234 5678', '01012345678', '+82 10-1234-5678'];
    for (const raw of cases) {
      const r = normalizeRow({ phone: raw }, { phone: 'phone' });
      expect(r.data.phone).toBe('01012345678');
      expect(r.errors).toHaveLength(0);
    }
  });

  it('비표준 전화번호 → 에러', () => {
    const r = normalizeRow({ phone: '02-1234' }, { phone: 'phone' });
    expect(r.data.phone).toBeUndefined();
    expect(r.errors[0]).toMatchObject({ field: 'phone' });
  });

  it('날짜 다양한 포맷 → ISO', () => {
    const cases: [string, string][] = [
      ['2025-04-05', '2025-04-05'],
      ['2025.4.5', '2025-04-05'],
      ['2025/04/05', '2025-04-05'],
      ['25.4.5', '2025-04-05'],
    ];
    for (const [raw, expected] of cases) {
      const r = normalizeRow({ d: raw }, { d: 'paymentDate' });
      expect(r.data.paymentDate).toBe(expected);
    }
  });

  it('금액 콤마/원/만원 처리', () => {
    expect(normalizeRow({ a: '120,000원' }, { a: 'amount' }).data.amount).toBe(120000);
    expect(normalizeRow({ a: '12만원' }, { a: 'amount' }).data.amount).toBe(120000);
    expect(normalizeRow({ a: '₩50,000' }, { a: 'amount' }).data.amount).toBe(50000);
  });

  it('이름 공백 정규화', () => {
    const r = normalizeRow({ n: '  홍  길동  ' }, { n: 'name' });
    expect(r.data.name).toBe('홍 길동');
  });

  it('빈 값은 무시 (에러 아님)', () => {
    const r = normalizeRow({ phone: '' }, { phone: 'phone' });
    expect(r.data.phone).toBeUndefined();
    expect(r.errors).toHaveLength(0);
  });
});

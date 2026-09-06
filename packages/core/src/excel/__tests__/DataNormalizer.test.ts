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

  it('legacy·유선 전화번호는 숫자 그대로 보존(행 무효화 안 함)', () => {
    // 011/016 등 구 이동전화, 02 유선 → 매칭 키로 숫자만 남기고 에러는 만들지 않는다.
    const r1 = normalizeRow({ phone: '016-123-4567' }, { phone: 'phone' });
    expect(r1.data.phone).toBe('0161234567');
    expect(r1.errors).toHaveLength(0);
    const r2 = normalizeRow({ phone: '02-1234-5678' }, { phone: 'phone' });
    expect(r2.data.phone).toBe('0212345678');
    expect(r2.errors).toHaveLength(0);
  });

  it('전화 파싱 실패해도 다른 필드는 살아남는다(행 전체 유효)', () => {
    // 전화 칸에 "미납" 같은 비-숫자 → 전화만 생략, 이름/금액은 정상 → 오류 0.
    const r = normalizeRow(
      { name: '김말순', phone: '미납', amount: '150,000' },
      { name: 'name', phone: 'phone', amount: 'amount' },
    );
    expect(r.errors).toHaveLength(0);
    expect(r.data.name).toBe('김말순');
    expect(r.data.amount).toBe(150000);
    expect(r.data.phone).toBeUndefined();
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

import { describe, it, expect } from 'vitest';
import { formatPhone, parseBirthDate } from '../formatters';

describe('formatPhone', () => {
  it('3자리 이하 → 그대로', () => {
    expect(formatPhone('010')).toBe('010');
    expect(formatPhone('01')).toBe('01');
    expect(formatPhone('')).toBe('');
  });

  it('4~7자리 → XXX-XXXX', () => {
    expect(formatPhone('0101')).toBe('010-1');
    expect(formatPhone('0101234')).toBe('010-1234');
  });

  it('8~11자리 → XXX-XXXX-XXXX', () => {
    expect(formatPhone('01012345')).toBe('010-1234-5');
    expect(formatPhone('01012345678')).toBe('010-1234-5678');
  });

  it('12자리 이상 → 11자리까지만', () => {
    expect(formatPhone('010123456789')).toBe('010-1234-5678');
  });

  it('숫자가 아닌 문자 제거', () => {
    expect(formatPhone('010-1234-5678')).toBe('010-1234-5678');
    expect(formatPhone('abc01012345678')).toBe('010-1234-5678');
  });
});

describe('parseBirthDate', () => {
  it('빈 값 → undefined', () => {
    expect(parseBirthDate('')).toBeUndefined();
  });

  it('6자리 미만 → undefined', () => {
    expect(parseBirthDate('6302')).toBeUndefined();
    expect(parseBirthDate('63020')).toBeUndefined();
  });

  it('6자리 초과 → undefined', () => {
    expect(parseBirthDate('6302011')).toBeUndefined();
  });

  it('1900년대: 31~99 → 19XX', () => {
    expect(parseBirthDate('630201')).toBe('1963-02-01');
    expect(parseBirthDate('991231')).toBe('1999-12-31');
    expect(parseBirthDate('310101')).toBe('1931-01-01');
  });

  it('2000년대: 00~30 → 20XX', () => {
    expect(parseBirthDate('000101')).toBe('2000-01-01');
    expect(parseBirthDate('250315')).toBe('2025-03-15');
    expect(parseBirthDate('301231')).toBe('2030-12-31');
  });

  it('경계값: 30 → 2030, 31 → 1931', () => {
    expect(parseBirthDate('300601')).toBe('2030-06-01');
    expect(parseBirthDate('310601')).toBe('1931-06-01');
  });

  it('숫자가 아닌 문자 제거 후 파싱', () => {
    expect(parseBirthDate('63-02-01')).toBe('1963-02-01');
  });
});

import { describe, it, expect } from 'vitest';
import { findField, normalizeHeader } from '../synonyms';

describe('synonyms', () => {
  it('정확 일치', () => {
    expect(findField(normalizeHeader('이름'))).toBe('name');
    expect(findField(normalizeHeader('연락처'))).toBe('phone');
    expect(findField(normalizeHeader('결제일'))).toBe('paymentDate');
    expect(findField(normalizeHeader('금액'))).toBe('amount');
  });

  it('부분 일치 (괄호/공백 변형)', () => {
    expect(findField(normalizeHeader('학생 이름'))).toBe('name');
    expect(findField(normalizeHeader('전화번호 (휴대)'))).toBe('phone');
    expect(findField(normalizeHeader('수강료_원'))).toBe('amount');
  });

  it('영어 헤더', () => {
    expect(findField(normalizeHeader('name'))).toBe('name');
    expect(findField(normalizeHeader('Phone'))).toBe('phone');
  });

  it('도메인 변형 (공방/교습소)', () => {
    expect(findField(normalizeHeader('회원명'))).toBe('name');
    expect(findField(normalizeHeader('교습비'))).toBe('amount');
    expect(findField(normalizeHeader('강습료'))).toBe('amount');
  });

  it('없는 헤더 → null', () => {
    expect(findField(normalizeHeader('도시락여부'))).toBeNull();
    expect(findField(normalizeHeader('알레르기'))).toBeNull();
  });
});

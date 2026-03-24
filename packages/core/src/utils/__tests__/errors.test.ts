import { describe, it, expect } from 'vitest';
import { AppError, ErrorType } from '../errors';

describe('AppError', () => {
  it('기본 생성 — type, message, recoverable 기본값 true', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'Connection failed',
    });
    expect(err.type).toBe('NETWORK_ERROR');
    expect(err.message).toBe('Connection failed');
    expect(err.recoverable).toBe(true);
    expect(err.name).toBe('AppError');
  });

  it('recoverable: false 명시적 전달', () => {
    const err = new AppError({
      type: ErrorType.UNKNOWN_ERROR,
      message: 'Fatal',
      recoverable: false,
    });
    expect(err.recoverable).toBe(false);
  });

  it('커스텀 userMessage 지정 시 기본 메시지 대신 사용', () => {
    const err = new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message: 'internal msg',
      userMessage: '커스텀 에러 메시지',
    });
    expect(err.userMessage).toBe('커스텀 에러 메시지');
  });

  it('각 ErrorType별 기본 한국어 메시지 반환', () => {
    const cases: [ErrorType, string][] = [
      [ErrorType.FILE_READ_ERROR, '데이터를 불러오는 중 오류가 발생했습니다.'],
      [ErrorType.FILE_WRITE_ERROR, '데이터를 저장하는 중 오류가 발생했습니다.'],
      [ErrorType.FILE_NOT_FOUND, '파일을 찾을 수 없습니다.'],
      [ErrorType.VALIDATION_ERROR, '입력한 정보를 확인해주세요.'],
      [ErrorType.DUPLICATE_ERROR, '이미 존재하는 데이터입니다.'],
      [ErrorType.INVALID_DATA, '유효하지 않은 데이터입니다.'],
      [ErrorType.ENROLLMENT_ERROR, '수강 신청 중 오류가 발생했습니다.'],
      [ErrorType.PAYMENT_ERROR, '결제 처리 중 오류가 발생했습니다.'],
      [ErrorType.NETWORK_ERROR, '네트워크 연결을 확인해주세요.'],
      [ErrorType.UNKNOWN_ERROR, '예상치 못한 오류가 발생했습니다.'],
    ];

    for (const [type, expected] of cases) {
      const err = new AppError({ type, message: 'test' });
      expect(err.userMessage).toBe(expected);
    }
  });

  it('toString() 포맷 — component 포함', () => {
    const err = new AppError({
      type: ErrorType.PAYMENT_ERROR,
      message: 'Failed to process',
      component: 'PaymentPage',
    });
    expect(err.toString()).toBe('[PAYMENT_ERROR] Failed to process (PaymentPage)');
  });

  it('toString() 포맷 — component 없음', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'Timeout',
    });
    expect(err.toString()).toBe('[NETWORK_ERROR] Timeout');
  });

  it('originalError 저장', () => {
    const original = new Error('original');
    const err = new AppError({
      type: ErrorType.UNKNOWN_ERROR,
      message: 'wrapped',
      originalError: original,
    });
    expect(err.originalError).toBe(original);
  });

  it('Error 상속 — instanceof 체크', () => {
    const err = new AppError({ type: ErrorType.UNKNOWN_ERROR, message: 'test' });
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

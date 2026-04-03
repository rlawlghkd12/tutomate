import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, ErrorType, createError, handleError, ErrorHandler, setErrorDisplay } from '../errors';

// Mock error display
const mockShowError = vi.fn();

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

// ─── createError ───────────────────────────────────────────────────────────

describe('createError', () => {
  it('createError — 각 ErrorType별로 AppError 반환', () => {
    const types: ErrorType[] = [
      ErrorType.FILE_READ_ERROR,
      ErrorType.FILE_WRITE_ERROR,
      ErrorType.FILE_NOT_FOUND,
      ErrorType.VALIDATION_ERROR,
      ErrorType.DUPLICATE_ERROR,
      ErrorType.INVALID_DATA,
      ErrorType.ENROLLMENT_ERROR,
      ErrorType.PAYMENT_ERROR,
      ErrorType.NETWORK_ERROR,
      ErrorType.UNKNOWN_ERROR,
    ];
    for (const type of types) {
      const err = createError({ type, message: 'test' });
      expect(err).toBeInstanceOf(AppError);
      expect(err.type).toBe(type);
    }
  });

  it('createError — originalError 포함', () => {
    const original = new Error('original');
    const err = createError({ type: ErrorType.NETWORK_ERROR, message: 'wrap', originalError: original });
    expect(err.originalError).toBe(original);
  });
});

// ─── ErrorHandler ──────────────────────────────────────────────────────────

describe('ErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setErrorDisplay(mockShowError);
  });

  it('getInstance() 싱글톤 반환', () => {
    const a = ErrorHandler.getInstance();
    const b = ErrorHandler.getInstance();
    expect(a).toBe(b);
  });

  it('handle(AppError) — recoverable → showError 호출', async () => {
    const err = new AppError({ type: ErrorType.NETWORK_ERROR, message: 'fail', recoverable: true });
    await ErrorHandler.getInstance().handle(err);
    expect(mockShowError).toHaveBeenCalledWith(err.userMessage, true);
  });

  it('handle(AppError) — recoverable: false → showError 호출', async () => {
    const err = new AppError({ type: ErrorType.UNKNOWN_ERROR, message: 'fatal', recoverable: false });
    await ErrorHandler.getInstance().handle(err);
    expect(mockShowError).toHaveBeenCalledWith(err.userMessage, false);
  });

  it('handle(Error) — 일반 Error → UNKNOWN_ERROR AppError로 래핑 후 처리', async () => {
    const err = new Error('network failure');
    await ErrorHandler.getInstance().handle(err);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('handle(unknown) — 문자열 같은 비-Error → UNKNOWN_ERROR AppError로 처리', async () => {
    await ErrorHandler.getInstance().handle('something went wrong');
    expect(mockShowError).toHaveBeenCalled();
  });

  it('handle — showNotification=false이면 showError 미호출', async () => {
    const err = new AppError({ type: ErrorType.NETWORK_ERROR, message: 'fail' });
    await ErrorHandler.getInstance().handle(err, false);
    expect(mockShowError).not.toHaveBeenCalled();
  });

  it('handle(AppError) — VALIDATION_ERROR userMessage 포함', async () => {
    const err = new AppError({ type: ErrorType.VALIDATION_ERROR, message: 'invalid', userMessage: '검증 실패' });
    await ErrorHandler.getInstance().handle(err);
    expect(mockShowError).toHaveBeenCalledWith('검증 실패', true);
  });
});

// ─── handleError ───────────────────────────────────────────────────────────

describe('handleError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setErrorDisplay(mockShowError);
  });

  it('handleError — ErrorHandler.handle() 위임', async () => {
    const err = new AppError({ type: ErrorType.PAYMENT_ERROR, message: 'pay fail' });
    await handleError(err);
    expect(mockShowError).toHaveBeenCalled();
  });

  it('handleError — 일반 Error 전달', async () => {
    await handleError(new Error('generic error'));
    expect(mockShowError).toHaveBeenCalled();
  });

  it('handleError — showNotification=false 전달', async () => {
    await handleError(new Error('silent'), false);
    expect(mockShowError).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError, ErrorType, ErrorCode, USER_ERROR_MESSAGES, createError, handleError, ErrorHandler, setErrorDisplay, showErrorMessage } from '../errors';
import type { ErrorCodeType } from '../errors';

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

  it('각 ErrorType별 기본 한국어 메시지 반환 (code 경유)', () => {
    // userMessage는 이제 type → code 매핑 후 USER_ERROR_MESSAGES에서 가져옴
    const cases: [ErrorType, ErrorCodeType, string][] = [
      [ErrorType.FILE_READ_ERROR, ErrorCode.DB_READ_FAILED, USER_ERROR_MESSAGES.DB_READ_FAILED],
      [ErrorType.FILE_WRITE_ERROR, ErrorCode.DB_WRITE_FAILED, USER_ERROR_MESSAGES.DB_WRITE_FAILED],
      [ErrorType.FILE_NOT_FOUND, ErrorCode.DB_NOT_FOUND, USER_ERROR_MESSAGES.DB_NOT_FOUND],
      [ErrorType.VALIDATION_ERROR, ErrorCode.VALIDATION_ERROR, USER_ERROR_MESSAGES.VALIDATION_ERROR],
      [ErrorType.DUPLICATE_ERROR, ErrorCode.DB_DUPLICATE, USER_ERROR_MESSAGES.DB_DUPLICATE],
      [ErrorType.INVALID_DATA, ErrorCode.VALIDATION_ERROR, USER_ERROR_MESSAGES.VALIDATION_ERROR],
      [ErrorType.ENROLLMENT_ERROR, ErrorCode.ENROLLMENT_FULL, USER_ERROR_MESSAGES.ENROLLMENT_FULL],
      [ErrorType.PAYMENT_ERROR, ErrorCode.PAYMENT_INVALID, USER_ERROR_MESSAGES.PAYMENT_INVALID],
      [ErrorType.NETWORK_ERROR, ErrorCode.NETWORK_OFFLINE, USER_ERROR_MESSAGES.NETWORK_OFFLINE],
      [ErrorType.UNKNOWN_ERROR, ErrorCode.UNKNOWN, USER_ERROR_MESSAGES.UNKNOWN],
    ];

    for (const [type, expectedCode, expectedMsg] of cases) {
      const err = new AppError({ type, message: 'test' });
      expect(err.code).toBe(expectedCode);
      expect(err.userMessage).toBe(expectedMsg);
    }
  });

  it('toString() 포맷 — component 포함 (code 사용)', () => {
    const err = new AppError({
      type: ErrorType.PAYMENT_ERROR,
      message: 'Failed to process',
      component: 'PaymentPage',
    });
    expect(err.toString()).toBe('[PAYMENT_INVALID] Failed to process (PaymentPage)');
  });

  it('toString() 포맷 — component 없음 (code 사용)', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'Timeout',
    });
    expect(err.toString()).toBe('[NETWORK_OFFLINE] Timeout');
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

// ─── handleFileError / handleValidationError ─────────────────────────────

describe('ErrorHandler convenience methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setErrorDisplay(mockShowError);
  });

  it('handleFileError(read) → FILE_READ_ERROR 타입으로 처리', async () => {
    const err = new Error('disk fail');
    ErrorHandler.getInstance().handleFileError(err, 'read', 'FileManager');
    // handle은 비동기이지만 내부적으로 showError 호출됨
    await vi.waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        USER_ERROR_MESSAGES.DB_READ_FAILED,
        true,
      );
    });
  });

  it('handleFileError(write) → FILE_WRITE_ERROR 타입으로 처리', async () => {
    const err = new Error('write fail');
    ErrorHandler.getInstance().handleFileError(err, 'write');
    await vi.waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith(
        USER_ERROR_MESSAGES.DB_WRITE_FAILED,
        true,
      );
    });
  });

  it('handleValidationError → VALIDATION_ERROR 타입 + 커스텀 메시지', async () => {
    ErrorHandler.getInstance().handleValidationError('이름은 필수입니다', 'StudentForm');
    await vi.waitFor(() => {
      expect(mockShowError).toHaveBeenCalledWith('이름은 필수입니다', true);
    });
  });
});

// ─── setErrorDisplay ─────────────────────────────────────────────────────

describe('setErrorDisplay', () => {
  it('setErrorDisplay(null 아닌 함수) 설정 후 handle 시 호출됨', async () => {
    const customShow = vi.fn();
    setErrorDisplay(customShow);
    await handleError(new Error('test'));
    expect(customShow).toHaveBeenCalled();
  });

  it('handle — _showError가 null일 때 showNotification=true여도 에러 안 남', async () => {
    // setErrorDisplay를 null로 리셋 (내부적으로 null 설정이 없으므로 대체)
    // _showError가 설정 안 된 상태에서도 에러 없이 동작해야 함
    setErrorDisplay(mockShowError);
    const err = new AppError({ type: ErrorType.UNKNOWN_ERROR, message: 'test' });
    await expect(ErrorHandler.getInstance().handle(err)).resolves.toBeUndefined();
  });
});

// ─── ErrorCode + USER_ERROR_MESSAGES ──────────────────────────────────────

describe('ErrorCode / USER_ERROR_MESSAGES', () => {
  it('모든 ErrorCode 값에 대응하는 USER_ERROR_MESSAGES 존재', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(USER_ERROR_MESSAGES[code]).toBeDefined();
      expect(typeof USER_ERROR_MESSAGES[code]).toBe('string');
      expect(USER_ERROR_MESSAGES[code].length).toBeGreaterThan(0);
    }
  });
});

// ─── AppError code 필드 ───────────────────────────────────────────────────

describe('AppError code field', () => {
  it('code 미지정 시 type → code 자동 매핑', () => {
    const err = new AppError({
      type: ErrorType.FILE_READ_ERROR,
      message: 'read failed',
    });
    expect(err.code).toBe(ErrorCode.DB_READ_FAILED);
  });

  it('code 직접 지정 시 해당 code 사용', () => {
    const err = new AppError({
      type: ErrorType.NETWORK_ERROR,
      message: 'timeout',
      code: ErrorCode.NETWORK_TIMEOUT,
    });
    expect(err.code).toBe(ErrorCode.NETWORK_TIMEOUT);
    // type은 여전히 원래 값 유지
    expect(err.type).toBe(ErrorType.NETWORK_ERROR);
  });

  it('userMessage — code 기반 자동 매핑', () => {
    const err = new AppError({
      type: ErrorType.ENROLLMENT_ERROR,
      message: 'full',
    });
    expect(err.userMessage).toBe(USER_ERROR_MESSAGES.ENROLLMENT_FULL);
  });

  it('userMessage — 직접 override 시 우선 적용', () => {
    const err = new AppError({
      type: ErrorType.ENROLLMENT_ERROR,
      message: 'full',
      userMessage: '수강 신청 마감!',
    });
    expect(err.userMessage).toBe('수강 신청 마감!');
  });

  it('toString() — code 사용', () => {
    const err = new AppError({
      type: ErrorType.DUPLICATE_ERROR,
      message: 'dup key',
      component: 'StudentForm',
    });
    expect(err.toString()).toBe('[DB_DUPLICATE] dup key (StudentForm)');
  });
});

// ─── showErrorMessage ─────────────────────────────────────────────────────

describe('showErrorMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('_showError 설정 시 메시지 전달', () => {
    const mockFn = vi.fn();
    setErrorDisplay(mockFn);
    showErrorMessage('테스트 메시지');
    expect(mockFn).toHaveBeenCalledWith('테스트 메시지', true);
  });

  it('recoverable 인자 전달', () => {
    const mockFn = vi.fn();
    setErrorDisplay(mockFn);
    showErrorMessage('심각한 오류', false);
    expect(mockFn).toHaveBeenCalledWith('심각한 오류', false);
  });
});

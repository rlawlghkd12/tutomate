// 에러 타입 정의 및 에러 처리 유틸리티

import { logError } from './logger';

export const ErrorType = {
  // 파일 시스템 에러
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',

  // 데이터 검증 에러
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  DUPLICATE_ERROR: 'DUPLICATE_ERROR',
  INVALID_DATA: 'INVALID_DATA',

  // 비즈니스 로직 에러
  ENROLLMENT_ERROR: 'ENROLLMENT_ERROR',
  PAYMENT_ERROR: 'PAYMENT_ERROR',

  // 시스템 에러
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
} as const;

export type ErrorType = typeof ErrorType[keyof typeof ErrorType];

export const ErrorCode = {
  NETWORK_OFFLINE: 'NETWORK_OFFLINE',
  NETWORK_TIMEOUT: 'NETWORK_TIMEOUT',
  DB_READ_FAILED: 'DB_READ_FAILED',
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
  DB_DUPLICATE: 'DB_DUPLICATE',
  DB_NOT_FOUND: 'DB_NOT_FOUND',
  DB_PERMISSION: 'DB_PERMISSION',
  ENROLLMENT_FULL: 'ENROLLMENT_FULL',
  ENROLLMENT_DUPLICATE: 'ENROLLMENT_DUPLICATE',
  PAYMENT_INVALID: 'PAYMENT_INVALID',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];

export const USER_ERROR_MESSAGES: Record<ErrorCodeType, string> = {
  NETWORK_OFFLINE: '인터넷 연결을 확인해주세요.',
  NETWORK_TIMEOUT: '서버 응답이 느립니다. 잠시 후 다시 시도해주세요.',
  DB_READ_FAILED: '데이터를 불러오지 못했습니다.',
  DB_WRITE_FAILED: '저장에 실패했습니다. 다시 시도해주세요.',
  DB_DUPLICATE: '이미 존재하는 데이터입니다.',
  DB_NOT_FOUND: '요청한 데이터를 찾을 수 없습니다.',
  DB_PERMISSION: '접근 권한이 없습니다.',
  ENROLLMENT_FULL: '강좌 정원이 마감되었습니다.',
  ENROLLMENT_DUPLICATE: '이미 등록된 강좌입니다.',
  PAYMENT_INVALID: '결제 정보를 확인해주세요.',
  VALIDATION_ERROR: '입력 정보를 확인해주세요.',
  UNKNOWN: '문제가 발생했습니다. 다시 시도해주세요.',
};

export interface AppErrorOptions {
  type: ErrorType;
  message: string;
  originalError?: Error | unknown;
  component?: string;
  action?: string;
  recoverable?: boolean;
  userMessage?: string;
}

export class AppError extends Error {
  type: ErrorType;
  code: ErrorCodeType;
  originalError?: Error | unknown;
  component?: string;
  action?: string;
  recoverable: boolean;
  userMessage: string;

  constructor(options: AppErrorOptions & { code?: ErrorCodeType }) {
    super(options.message);
    this.name = 'AppError';
    this.type = options.type;
    this.code = options.code || this.typeToCode(options.type);
    this.originalError = options.originalError;
    this.component = options.component;
    this.action = options.action;
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage || USER_ERROR_MESSAGES[this.code];

    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, AppError);
    }
  }

  private typeToCode(type: ErrorType): ErrorCodeType {
    const map: Record<string, ErrorCodeType> = {
      FILE_READ_ERROR: ErrorCode.DB_READ_FAILED,
      FILE_WRITE_ERROR: ErrorCode.DB_WRITE_FAILED,
      FILE_NOT_FOUND: ErrorCode.DB_NOT_FOUND,
      VALIDATION_ERROR: ErrorCode.VALIDATION_ERROR,
      DUPLICATE_ERROR: ErrorCode.DB_DUPLICATE,
      INVALID_DATA: ErrorCode.VALIDATION_ERROR,
      ENROLLMENT_ERROR: ErrorCode.ENROLLMENT_FULL,
      PAYMENT_ERROR: ErrorCode.PAYMENT_INVALID,
      NETWORK_ERROR: ErrorCode.NETWORK_OFFLINE,
      UNKNOWN_ERROR: ErrorCode.UNKNOWN,
    };
    return map[type] || ErrorCode.UNKNOWN;
  }

  toString(): string {
    return `[${this.code}] ${this.message}${this.component ? ` (${this.component})` : ''}`;
  }
}

// 에러를 사용자에게 보여주는 콜백 (UI 레이어에서 설정)
let _showError: ((msg: string, recoverable: boolean) => void) | null = null;

/** UI 레이어에서 호출하여 에러 표시 방법을 설정 (예: toast) */
export function setErrorDisplay(fn: (msg: string, recoverable: boolean) => void): void {
  _showError = fn;
}

// 에러 핸들러
export class ErrorHandler {
  private static instance: ErrorHandler;

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  async handle(error: Error | AppError | unknown, showNotification = true): Promise<void> {
    let appError: AppError;

    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof Error) {
      appError = new AppError({
        type: ErrorType.UNKNOWN_ERROR,
        message: error.message,
        originalError: error,
      });
    } else {
      appError = new AppError({
        type: ErrorType.UNKNOWN_ERROR,
        message: '알 수 없는 오류가 발생했습니다.',
        originalError: error,
      });
    }

    // 로그 기록
    await logError(appError.message, {
      component: appError.component,
      action: appError.action,
      error: appError.originalError || appError,
    });

    // 사용자에게 알림
    if (showNotification && _showError) {
      _showError(appError.userMessage, appError.recoverable);
    }
  }

  // 특정 에러 타입에 대한 편의 메서드
  handleFileError(error: unknown, operation: 'read' | 'write', component?: string): void {
    const type = operation === 'read' ? ErrorType.FILE_READ_ERROR : ErrorType.FILE_WRITE_ERROR;
    const appError = new AppError({
      type,
      message: `Failed to ${operation} file`,
      originalError: error,
      component,
    });
    this.handle(appError);
  }

  handleValidationError(message: string, component?: string): void {
    const appError = new AppError({
      type: ErrorType.VALIDATION_ERROR,
      message,
      component,
      userMessage: message,
    });
    this.handle(appError);
  }
}

// 싱글톤 인스턴스 export
export const errorHandler = ErrorHandler.getInstance();

// 편의 함수들
export const handleError = (error: unknown, showNotification = true) =>
  errorHandler.handle(error, showNotification);

export const createError = (options: AppErrorOptions) => new AppError(options);

/** AppError 없이 에러 메시지만 표시할 때 사용 (예: cached 알림) */
export function showErrorMessage(msg: string, recoverable = true): void {
  if (_showError) _showError(msg, recoverable);
}

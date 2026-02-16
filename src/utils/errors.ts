// 에러 타입 정의 및 에러 처리 유틸리티

import { message, notification } from 'antd';
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
  originalError?: Error | unknown;
  component?: string;
  action?: string;
  recoverable: boolean;
  userMessage: string;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.type = options.type;
    this.originalError = options.originalError;
    this.component = options.component;
    this.action = options.action;
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage || this.getDefaultUserMessage();

    // Stack trace 유지
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, AppError);
    }
  }

  private getDefaultUserMessage(): string {
    switch (this.type) {
      case ErrorType.FILE_READ_ERROR:
        return '데이터를 불러오는 중 오류가 발생했습니다.';
      case ErrorType.FILE_WRITE_ERROR:
        return '데이터를 저장하는 중 오류가 발생했습니다.';
      case ErrorType.FILE_NOT_FOUND:
        return '파일을 찾을 수 없습니다.';
      case ErrorType.VALIDATION_ERROR:
        return '입력한 정보를 확인해주세요.';
      case ErrorType.DUPLICATE_ERROR:
        return '이미 존재하는 데이터입니다.';
      case ErrorType.INVALID_DATA:
        return '유효하지 않은 데이터입니다.';
      case ErrorType.ENROLLMENT_ERROR:
        return '수강 신청 중 오류가 발생했습니다.';
      case ErrorType.PAYMENT_ERROR:
        return '결제 처리 중 오류가 발생했습니다.';
      case ErrorType.NETWORK_ERROR:
        return '네트워크 연결을 확인해주세요.';
      default:
        return '예상치 못한 오류가 발생했습니다.';
    }
  }

  toString(): string {
    return `[${this.type}] ${this.message}${this.component ? ` (${this.component})` : ''}`;
  }
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
    if (showNotification) {
      this.showErrorToUser(appError);
    }
  }

  private showErrorToUser(error: AppError): void {
    if (error.recoverable) {
      // 복구 가능한 에러는 메시지로 표시
      message.error({
        content: error.userMessage,
        duration: 5,
      });
    } else {
      // 심각한 에러는 notification으로 표시
      notification.error({
        message: '오류 발생',
        description: error.userMessage,
        duration: 0, // 수동으로 닫아야 함
      });
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

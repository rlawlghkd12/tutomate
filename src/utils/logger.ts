// 프론트엔드 로깅 유틸리티 (Tauri 플러그인 없으면 콘솔 전용)
import { isTauri } from './tauri';

// Tauri 로그 함수를 동적 임포트
let tauriLog: {
  info: (msg: string) => Promise<void>;
  error: (msg: string) => Promise<void>;
  warn: (msg: string) => Promise<void>;
  debug: (msg: string) => Promise<void>;
} | null = null;

if (isTauri()) {
  import('@tauri-apps/plugin-log').then((mod) => {
    tauriLog = {
      info: mod.info,
      error: mod.error,
      warn: mod.warn,
      debug: mod.debug,
    };
  }).catch(() => {
    // Tauri log 플러그인 로드 실패 — 콘솔만 사용
  });
}

export const LogLevel = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
} as const;

export type LogLevel = typeof LogLevel[keyof typeof LogLevel];

interface LogContext {
  component?: string;
  action?: string;
  data?: unknown;
  error?: Error | unknown;
}

class Logger {
  private isDev = import.meta.env.DEV;

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const parts = [
      `[${timestamp}]`,
      `[${level}]`,
    ];

    if (context?.component) {
      parts.push(`[${context.component}]`);
    }

    if (context?.action) {
      parts.push(`[${context.action}]`);
    }

    parts.push(message);

    return parts.join(' ');
  }

  private logToConsole(level: LogLevel, message: string, context?: LogContext) {
    if (!this.isDev) return;

    const formattedMessage = this.formatMessage(level, message, context);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage, context?.data);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage, context?.data);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage, context?.data);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage, context?.error || context?.data);
        break;
    }
  }

  async debug(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.DEBUG, message, context);
    try {
      await tauriLog?.debug(this.formatMessage(LogLevel.DEBUG, message, context));
    } catch {
      // Tauri log unavailable — 무시
    }
  }

  async info(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.INFO, message, context);
    try {
      await tauriLog?.info(this.formatMessage(LogLevel.INFO, message, context));
    } catch {
      // Tauri log unavailable
    }
  }

  async warn(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.WARN, message, context);
    try {
      await tauriLog?.warn(this.formatMessage(LogLevel.WARN, message, context));
    } catch {
      // Tauri log unavailable
    }
  }

  async error(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.ERROR, message, context);
    try {
      const errorMessage = this.formatMessage(LogLevel.ERROR, message, context);
      const errorDetails = context?.error instanceof Error
        ? `\nStack: ${context.error.stack}`
        : '';
      await tauriLog?.error(errorMessage + errorDetails);
    } catch {
      // Tauri log unavailable
    }
  }

  // 성능 측정을 위한 유틸리티
  startTimer(label: string): () => void {
    const start = performance.now();
    return () => {
      const duration = performance.now() - start;
      this.debug(`Performance: ${label}`, {
        data: { duration: `${duration.toFixed(2)}ms` }
      });
    };
  }
}

// 싱글톤 인스턴스
export const logger = new Logger();

// 편의 함수들
export const logDebug = (message: string, context?: LogContext) => logger.debug(message, context);
export const logInfo = (message: string, context?: LogContext) => logger.info(message, context);
export const logWarn = (message: string, context?: LogContext) => logger.warn(message, context);
export const logError = (message: string, context?: LogContext) => logger.error(message, context);

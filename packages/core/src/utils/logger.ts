// 프론트엔드 로깅 유틸리티 (콘솔 전용 — Electron main process에서 electron-log 사용)


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
  }

  async info(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.INFO, message, context);
  }

  async warn(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.WARN, message, context);
  }

  async error(message: string, context?: LogContext) {
    this.logToConsole(LogLevel.ERROR, message, context);
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

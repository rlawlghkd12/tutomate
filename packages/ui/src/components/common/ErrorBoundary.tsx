import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, RefreshCw } from 'lucide-react';
import { AppError, ErrorType, errorHandler, reportError } from '@tutomate/core';
import { Button } from '../ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({
      errorInfo,
    });

    // AppError로 변환하여 로깅
    const appError = new AppError({
      type: ErrorType.UNKNOWN_ERROR,
      message: error.message,
      originalError: error,
      component: errorInfo.componentStack?.split('\n')[1]?.trim(),
      recoverable: false,
    });

    // 에러 핸들러로 전달 (notification은 표시하지 않음, ErrorBoundary UI로 대체)
    errorHandler.handle(appError, false);

    // DB에 에러 기록
    reportError(error, errorInfo.componentStack?.split('\n')[1]?.trim());
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex min-h-screen items-center justify-center p-5">
          <div className="flex max-w-md flex-col items-center gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-8 w-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">문제가 발생했습니다</h2>
              <p className="text-sm text-muted-foreground">
                예상치 못한 오류가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요.
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={this.handleReset}>
                <RotateCcw className="mr-2 h-4 w-4" />
                다시 시도
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                페이지 새로고침
              </Button>
            </div>
            {import.meta.env.DEV && this.state.error && (
              <div className="w-full rounded-md bg-muted p-3 text-left font-mono text-xs">
                <strong>개발 모드 정보:</strong>
                <pre className="mt-2 whitespace-pre-wrap">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// 특정 컴포넌트를 ErrorBoundary로 감싸는 HOC
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode,
  onReset?: () => void
) {
  return function WithErrorBoundary(props: P) {
    return (
      <ErrorBoundary fallback={fallback} onReset={onReset}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}

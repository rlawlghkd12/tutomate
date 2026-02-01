import React, { Component, type ReactNode } from 'react';
import { Button, Result } from 'antd';
import { AppError, ErrorType, errorHandler } from '../../utils/errors';

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
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: '20px'
        }}>
          <Result
            status="error"
            title="문제가 발생했습니다"
            subTitle="예상치 못한 오류가 발생했습니다. 페이지를 새로고침하거나 다시 시도해주세요."
            extra={[
              <Button type="primary" key="reset" onClick={this.handleReset}>
                다시 시도
              </Button>,
              <Button key="reload" onClick={() => window.location.reload()}>
                페이지 새로고침
              </Button>,
            ]}
          >
            {import.meta.env.DEV && this.state.error && (
              <div style={{
                textAlign: 'left',
                marginTop: '20px',
                padding: '10px',
                background: '#f5f5f5',
                borderRadius: '4px',
                fontSize: '12px',
                fontFamily: 'monospace'
              }}>
                <strong>개발 모드 정보:</strong>
                <pre style={{ margin: '10px 0 0 0', whiteSpace: 'pre-wrap' }}>
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </div>
            )}
          </Result>
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

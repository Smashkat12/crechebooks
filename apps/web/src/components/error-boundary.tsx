'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { ErrorFallback, CompactErrorFallback, type ErrorFallbackProps } from './ui/error-fallback';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback component to render on error */
  fallback?: ReactNode;
  /** Use compact fallback for smaller sections */
  compact?: boolean;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Called when reset is triggered */
  onReset?: () => void;
  /** Custom className for the fallback container */
  fallbackClassName?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary component that catches JavaScript errors in child component tree.
 * Logs errors and displays a fallback UI instead of crashing the whole app.
 *
 * @example
 * ```tsx
 * <ErrorBoundary>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // With custom fallback
 * <ErrorBoundary fallback={<CustomError />}>
 *   <MyComponent />
 * </ErrorBoundary>
 *
 * // Compact mode for smaller sections
 * <ErrorBoundary compact>
 *   <WidgetComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Store errorInfo for potential display
    this.setState({ errorInfo });

    // Log error to console
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);

    // Log additional context in development
    if (process.env.NODE_ENV === 'development') {
      console.group('[ErrorBoundary] Error Details');
      console.error('Error name:', error.name);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      console.groupEnd();
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);

    // TODO: Send to error tracking service (e.g., Sentry)
    // if (typeof window !== 'undefined' && window.Sentry) {
    //   window.Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    // }
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    this.props.onReset?.();
  };

  render(): ReactNode {
    const { hasError, error, errorInfo } = this.state;
    const { children, fallback, compact, fallbackClassName } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Use compact fallback for smaller sections
      if (compact) {
        return (
          <CompactErrorFallback
            error={error}
            onReset={this.handleReset}
            className={fallbackClassName}
          />
        );
      }

      // Default full fallback
      return (
        <ErrorFallback
          error={error}
          errorInfo={errorInfo}
          onReset={this.handleReset}
          className={fallbackClassName}
        />
      );
    }

    return children;
  }
}

/**
 * Higher-order component to wrap a component with an error boundary.
 *
 * @example
 * ```tsx
 * const SafeComponent = withErrorBoundary(MyComponent);
 * // or with options
 * const SafeComponent = withErrorBoundary(MyComponent, { compact: true });
 * ```
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default ErrorBoundary;

'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Wifi, WifiOff, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Error types that can occur during dashboard data loading
 */
export type DashboardErrorType = 'network' | 'server' | 'timeout' | 'auth' | 'unknown';

interface DashboardErrorBoundaryProps {
  children: ReactNode;
  /** Widget name for error identification */
  widgetName?: string;
  /** Use compact fallback for individual widgets */
  compact?: boolean;
  /** Custom fallback component */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Called when retry is triggered */
  onRetry?: () => void;
  /** Custom className for the fallback container */
  className?: string;
}

interface DashboardErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorType: DashboardErrorType;
  retryCount: number;
}

/**
 * Determines the type of error based on error message and properties
 */
function categorizeError(error: Error): DashboardErrorType {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (message.includes('network') || message.includes('fetch') || name === 'typeerror') {
    return 'network';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'timeout';
  }
  if (message.includes('401') || message.includes('unauthorized') || message.includes('auth')) {
    return 'auth';
  }
  if (message.includes('500') || message.includes('502') || message.includes('503') || message.includes('server')) {
    return 'server';
  }
  return 'unknown';
}

/**
 * Dashboard-specific error boundary with retry logic and categorized error handling.
 * Designed to handle partial failures in dashboard widgets.
 */
export class DashboardErrorBoundary extends Component<DashboardErrorBoundaryProps, DashboardErrorBoundaryState> {
  private maxRetries = 3;
  private retryTimeouts: NodeJS.Timeout[] = [];

  constructor(props: DashboardErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorType: 'unknown',
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<DashboardErrorBoundaryState> {
    return {
      hasError: true,
      error,
      errorType: categorizeError(error),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error with widget context
    const widgetContext = this.props.widgetName ? `[${this.props.widgetName}]` : '';
    console.error(`[DashboardErrorBoundary]${widgetContext} Caught error:`, error);

    if (process.env.NODE_ENV === 'development') {
      console.error('Component stack:', errorInfo.componentStack);
    }

    // Call custom error handler
    this.props.onError?.(error, errorInfo);
  }

  componentWillUnmount(): void {
    // Clean up any pending retry timeouts
    this.retryTimeouts.forEach(clearTimeout);
  }

  handleRetry = (): void => {
    const { retryCount } = this.state;

    if (retryCount < this.maxRetries) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        errorType: 'unknown',
        retryCount: retryCount + 1,
      });
      this.props.onRetry?.();
    }
  };

  handleAutoRetry = (): void => {
    // Auto-retry with exponential backoff for network errors
    const { errorType, retryCount } = this.state;

    if (errorType === 'network' && retryCount < this.maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
      const timeout = setTimeout(() => {
        this.handleRetry();
      }, delay);
      this.retryTimeouts.push(timeout);
    }
  };

  render(): ReactNode {
    const { hasError, error, errorType, retryCount } = this.state;
    const { children, fallback, compact, widgetName, className } = this.props;

    if (hasError) {
      // Use custom fallback if provided
      if (fallback) {
        return fallback;
      }

      // Use compact fallback for individual widgets
      if (compact) {
        return (
          <DashboardWidgetErrorFallback
            error={error}
            errorType={errorType}
            widgetName={widgetName}
            onRetry={this.handleRetry}
            retryCount={retryCount}
            maxRetries={this.maxRetries}
            className={className}
          />
        );
      }

      // Full fallback for dashboard-level errors
      return (
        <DashboardFullErrorFallback
          error={error}
          errorType={errorType}
          onRetry={this.handleRetry}
          retryCount={retryCount}
          maxRetries={this.maxRetries}
          className={className}
        />
      );
    }

    return children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorType: DashboardErrorType;
  onRetry: () => void;
  retryCount: number;
  maxRetries: number;
  widgetName?: string;
  className?: string;
}

/**
 * Compact error fallback for individual dashboard widgets
 */
function DashboardWidgetErrorFallback({
  error,
  errorType,
  widgetName,
  onRetry,
  retryCount,
  maxRetries,
  className,
}: ErrorFallbackProps) {
  const canRetry = retryCount < maxRetries;
  const { icon: Icon, title, description } = getErrorContent(errorType);

  return (
    <Card className={cn('border-destructive/50 bg-destructive/5', className)}>
      <CardContent className="flex flex-col items-center justify-center p-6 text-center min-h-[200px]">
        <div className="p-3 rounded-full bg-destructive/10 mb-3">
          <Icon className="h-6 w-6 text-destructive" />
        </div>

        {widgetName && (
          <p className="text-xs text-muted-foreground mb-1">
            {widgetName}
          </p>
        )}

        <h4 className="font-medium text-sm mb-1">{title}</h4>

        <p className="text-xs text-muted-foreground mb-4 max-w-xs">
          {description}
        </p>

        {process.env.NODE_ENV === 'development' && error?.message && (
          <p className="text-xs text-muted-foreground font-mono mb-4 max-w-xs truncate">
            {error.message}
          </p>
        )}

        {canRetry ? (
          <Button onClick={onRetry} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-3 w-3" />
            Retry ({maxRetries - retryCount} left)
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            Maximum retries reached. Refresh the page to try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Full-page error fallback for dashboard-level errors
 */
function DashboardFullErrorFallback({
  error,
  errorType,
  onRetry,
  retryCount,
  maxRetries,
  className,
}: ErrorFallbackProps) {
  const canRetry = retryCount < maxRetries;
  const { icon: Icon, title, description, suggestion } = getErrorContent(errorType);

  return (
    <div className={cn('flex flex-col items-center justify-center min-h-[400px] p-8', className)}>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
            <Icon className="h-7 w-7 text-destructive" />
          </div>
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error?.message && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium">Error details:</p>
              <p className="mt-1 font-mono text-xs">{error.message}</p>
            </div>
          )}

          {suggestion && (
            <div className="rounded-md bg-blue-50 dark:bg-blue-950 p-3 text-sm">
              <p className="font-medium text-blue-800 dark:text-blue-200">Suggestion:</p>
              <p className="mt-1 text-blue-700 dark:text-blue-300">{suggestion}</p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center pt-2">
            {canRetry && (
              <Button onClick={onRetry} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again ({maxRetries - retryCount} retries left)
              </Button>
            )}
            <Button variant="outline" onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>

          {retryCount > 0 && (
            <p className="text-center text-xs text-muted-foreground">
              Attempted {retryCount} of {maxRetries} retries
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Get error-specific content based on error type
 */
function getErrorContent(errorType: DashboardErrorType): {
  icon: React.ElementType;
  title: string;
  description: string;
  suggestion?: string;
} {
  switch (errorType) {
    case 'network':
      return {
        icon: WifiOff,
        title: 'Connection Problem',
        description: 'Unable to connect to the server. Please check your internet connection.',
        suggestion: 'Try disabling any VPN or proxy, or check if your firewall is blocking the connection.',
      };
    case 'timeout':
      return {
        icon: Wifi,
        title: 'Request Timed Out',
        description: 'The server took too long to respond. This might be due to high load.',
        suggestion: 'Wait a moment and try again. If the problem persists, the server might be experiencing issues.',
      };
    case 'auth':
      return {
        icon: AlertTriangle,
        title: 'Authentication Error',
        description: 'Your session may have expired. Please log in again.',
        suggestion: 'Click "Refresh Page" to be redirected to the login page.',
      };
    case 'server':
      return {
        icon: Server,
        title: 'Server Error',
        description: 'The server encountered an error while processing your request.',
        suggestion: 'This is typically a temporary issue. Wait a few minutes and try again.',
      };
    case 'unknown':
    default:
      return {
        icon: AlertTriangle,
        title: 'Something Went Wrong',
        description: 'An unexpected error occurred while loading the dashboard.',
        suggestion: 'Try refreshing the page. If the problem continues, contact support.',
      };
  }
}

/**
 * Higher-order component to wrap dashboard widgets with error boundary
 */
export function withDashboardErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  options?: Omit<DashboardErrorBoundaryProps, 'children'>
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const ComponentWithErrorBoundary = (props: P) => (
    <DashboardErrorBoundary {...options}>
      <WrappedComponent {...props} />
    </DashboardErrorBoundary>
  );

  ComponentWithErrorBoundary.displayName = `withDashboardErrorBoundary(${displayName})`;

  return ComponentWithErrorBoundary;
}

export default DashboardErrorBoundary;

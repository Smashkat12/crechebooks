'use client';

import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { cn } from '@/lib/utils';

export interface ErrorFallbackProps {
  error?: Error | null;
  errorInfo?: React.ErrorInfo | null;
  onReset?: () => void;
  className?: string;
}

/**
 * User-friendly error fallback UI component.
 * Displays when an error boundary catches an error.
 */
export function ErrorFallback({
  error,
  errorInfo,
  onReset,
  className
}: ErrorFallbackProps) {
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className={cn(
      'flex flex-col items-center justify-center min-h-[400px] p-8',
      className
    )}>
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Something went wrong</CardTitle>
          <CardDescription>
            An unexpected error occurred. Please try again or return to the dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error?.message && (
            <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
              <p className="font-medium">Error details:</p>
              <p className="mt-1 font-mono text-xs">{error.message}</p>
            </div>
          )}

          {isDev && errorInfo?.componentStack && (
            <details className="rounded-md bg-muted p-3 text-sm">
              <summary className="cursor-pointer font-medium text-muted-foreground">
                Component stack (dev only)
              </summary>
              <pre className="mt-2 overflow-auto text-xs whitespace-pre-wrap">
                {errorInfo.componentStack}
              </pre>
            </details>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            {onReset && (
              <Button onClick={onReset} variant="default">
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            )}
            <Button variant="outline" asChild>
              <a href="/dashboard">
                <Home className="mr-2 h-4 w-4" />
                Go to Dashboard
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Compact error fallback for use in smaller components/sections.
 */
export function CompactErrorFallback({
  error,
  onReset,
  className,
}: Omit<ErrorFallbackProps, 'errorInfo'>) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center p-6 text-center',
      className
    )}>
      <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
      <p className="text-sm font-medium text-foreground mb-1">
        Something went wrong
      </p>
      {error?.message && (
        <p className="text-xs text-muted-foreground mb-3 max-w-xs">
          {error.message}
        </p>
      )}
      {onReset && (
        <Button onClick={onReset} variant="outline" size="sm">
          <RefreshCw className="mr-2 h-3 w-3" />
          Retry
        </Button>
      )}
    </div>
  );
}

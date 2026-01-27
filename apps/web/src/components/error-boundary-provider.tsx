'use client';

import { ReactNode } from 'react';
import { ErrorBoundary } from './error-boundary';
import { logger } from '@/lib/logger';

interface ErrorBoundaryProviderProps {
  children: ReactNode;
}

/**
 * Top-level error boundary provider to wrap the entire application.
 * This catches any unhandled errors and prevents the app from crashing.
 */
export function ErrorBoundaryProvider({ children }: ErrorBoundaryProviderProps) {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log to error tracking service
    console.error('[App Error] Unhandled error caught by root boundary:', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
      url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    });

    // TODO: Integrate with error tracking service (Sentry, LogRocket, etc.)
    // Example:
    // Sentry.captureException(error, {
    //   extra: { componentStack: errorInfo.componentStack },
    //   tags: { boundary: 'root' },
    // });
  };

  const handleReset = () => {
    // Optionally refresh the page or clear state on reset
    logger.info('Error boundary reset triggered');
  };

  return (
    <ErrorBoundary
      onError={handleError}
      onReset={handleReset}
    >
      {children}
    </ErrorBoundary>
  );
}

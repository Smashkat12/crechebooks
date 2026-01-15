/**
 * @jest-environment jsdom
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary, withErrorBoundary } from '../error-boundary';
import { ErrorFallback, CompactErrorFallback } from '../ui/error-fallback';

// Mock console methods to avoid noise in test output
const originalError = console.error;
const originalGroup = console.group;
const originalGroupEnd = console.groupEnd;

beforeEach(() => {
  console.error = jest.fn();
  console.group = jest.fn();
  console.groupEnd = jest.fn();
});

afterEach(() => {
  console.error = originalError;
  console.group = originalGroup;
  console.groupEnd = originalGroupEnd;
});

// Test component that throws an error
function ThrowError({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error('Test error message');
  }
  return <div>Normal content</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <div>Test content</div>
      </ErrorBoundary>
    );

    expect(screen.getByText('Test content')).toBeInTheDocument();
  });

  it('renders fallback UI when an error is thrown', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/Test error message/)).toBeInTheDocument();
  });

  it('logs error to console', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalledWith(
      '[ErrorBoundary] Caught error:',
      expect.any(Error)
    );
  });

  it('calls onError callback when error occurs', () => {
    const onError = jest.fn();

    render(
      <ErrorBoundary onError={onError}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(onError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        componentStack: expect.any(String)
      })
    );
  });

  it('resets error state when retry button is clicked', () => {
    const onReset = jest.fn();
    const { rerender } = render(
      <ErrorBoundary onReset={onReset}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    // Click the try again button
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onReset).toHaveBeenCalled();

    // Re-render with non-throwing component
    rerender(
      <ErrorBoundary onReset={onReset}>
        <ThrowError shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('renders custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>Custom error UI</div>}>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
  });

  it('renders compact fallback when compact prop is true', () => {
    render(
      <ErrorBoundary compact>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows dashboard link in fallback', () => {
    render(
      <ErrorBoundary>
        <ThrowError shouldThrow={true} />
      </ErrorBoundary>
    );

    const dashboardLink = screen.getByRole('link', { name: /go to dashboard/i });
    expect(dashboardLink).toHaveAttribute('href', '/dashboard');
  });
});

describe('withErrorBoundary HOC', () => {
  it('wraps component with error boundary', () => {
    const WrappedComponent = withErrorBoundary(ThrowError);

    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('passes props to wrapped component', () => {
    const WrappedComponent = withErrorBoundary(ThrowError);

    render(<WrappedComponent shouldThrow={false} />);

    expect(screen.getByText('Normal content')).toBeInTheDocument();
  });

  it('accepts error boundary options', () => {
    const WrappedComponent = withErrorBoundary(ThrowError, { compact: true });

    render(<WrappedComponent shouldThrow={true} />);

    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});

describe('ErrorFallback', () => {
  it('renders error message', () => {
    const error = new Error('Specific error message');

    render(<ErrorFallback error={error} />);

    expect(screen.getByText(/Specific error message/)).toBeInTheDocument();
  });

  it('calls onReset when try again is clicked', () => {
    const onReset = jest.fn();

    render(<ErrorFallback onReset={onReset} />);

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(onReset).toHaveBeenCalled();
  });

  it('renders dashboard link', () => {
    render(<ErrorFallback />);

    const link = screen.getByRole('link', { name: /go to dashboard/i });
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('renders without error details when no error provided', () => {
    render(<ErrorFallback />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText(/An unexpected error occurred/)).toBeInTheDocument();
  });
});

describe('CompactErrorFallback', () => {
  it('renders compact error UI', () => {
    render(<CompactErrorFallback />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows error message when provided', () => {
    const error = new Error('Compact error');

    render(<CompactErrorFallback error={error} />);

    expect(screen.getByText('Compact error')).toBeInTheDocument();
  });

  it('renders retry button', () => {
    const onReset = jest.fn();

    render(<CompactErrorFallback onReset={onReset} />);

    const retryButton = screen.getByRole('button', { name: /retry/i });
    fireEvent.click(retryButton);

    expect(onReset).toHaveBeenCalled();
  });

  it('hides retry button when onReset not provided', () => {
    render(<CompactErrorFallback />);

    expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
  });
});

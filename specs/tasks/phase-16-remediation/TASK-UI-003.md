<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-003</task_id>
    <title>Add Error Boundaries</title>
    <type>reliability</type>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <estimated_effort>3-4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>error-handling, react, user-experience, crash-prevention</tags>
  </metadata>

  <context>
    <issue_description>
      The application has no Error Boundaries, meaning any uncaught JavaScript error in a
      component will crash the entire application. Users see a white screen with no way to
      recover, and there's no error reporting to track production issues.
    </issue_description>
    <current_behavior>
      - Component errors crash entire application
      - Users see blank white screen on errors
      - No error recovery mechanism
      - No error logging or reporting
      - No user-friendly error messages
    </current_behavior>
    <user_impact>
      - HIGH: Complete application failure on any component error
      - Poor user experience during failures
      - No ability to continue using unaffected features
      - Lost user work/state on crashes
    </user_impact>
  </context>

  <scope>
    <files_to_create>
      <file path="apps/web/src/components/ErrorBoundary.tsx">
        Main Error Boundary component with fallback UI
      </file>
      <file path="apps/web/src/components/ErrorFallback.tsx">
        Reusable error fallback UI component
      </file>
      <file path="apps/web/src/components/__tests__/ErrorBoundary.test.tsx">
        Error Boundary tests
      </file>
    </files_to_create>
    <files_to_modify>
      <file path="apps/web/src/app/layout.tsx" action="modify">
        Wrap application in root Error Boundary
      </file>
      <file path="apps/web/src/app/(dashboard)/layout.tsx" action="modify">
        Add Error Boundary for dashboard routes
      </file>
    </files_to_modify>
    <out_of_scope>
      - Server-side error handling (API)
      - Error monitoring service integration (separate task)
    </out_of_scope>
  </scope>

  <implementation>
    <step order="1" description="Create ErrorBoundary component">
      <action>
        ```typescript
        // apps/web/src/components/ErrorBoundary.tsx
        'use client';

        import { Component, ReactNode } from 'react';
        import { ErrorFallback } from './ErrorFallback';

        interface Props {
          children: ReactNode;
          fallback?: ReactNode;
          onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
        }

        interface State {
          hasError: boolean;
          error: Error | null;
        }

        export class ErrorBoundary extends Component<Props, State> {
          constructor(props: Props) {
            super(props);
            this.state = { hasError: false, error: null };
          }

          static getDerivedStateFromError(error: Error): State {
            return { hasError: true, error };
          }

          componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
            console.error('Error caught by boundary:', error, errorInfo);
            this.props.onError?.(error, errorInfo);
          }

          handleReset = () => {
            this.setState({ hasError: false, error: null });
          };

          render() {
            if (this.state.hasError) {
              return this.props.fallback || (
                <ErrorFallback
                  error={this.state.error}
                  onReset={this.handleReset}
                />
              );
            }

            return this.props.children;
          }
        }
        ```
      </action>
    </step>
    <step order="2" description="Create ErrorFallback component">
      <action>
        ```typescript
        // apps/web/src/components/ErrorFallback.tsx
        'use client';

        interface Props {
          error: Error | null;
          onReset: () => void;
        }

        export function ErrorFallback({ error, onReset }: Props) {
          return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
              <div className="max-w-md w-full p-6 bg-white rounded-lg shadow-lg">
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Something went wrong
                </h2>
                <p className="text-gray-600 mb-4">
                  We're sorry, but something unexpected happened. Please try again.
                </p>
                {process.env.NODE_ENV === 'development' && error && (
                  <pre className="text-xs bg-gray-100 p-2 rounded mb-4 overflow-auto">
                    {error.message}
                  </pre>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={onReset}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => window.location.href = '/'}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                  >
                    Go Home
                  </button>
                </div>
              </div>
            </div>
          );
        }
        ```
      </action>
    </step>
    <step order="3" description="Wrap root layout with Error Boundary">
      <action>
        ```typescript
        // apps/web/src/app/layout.tsx
        import { ErrorBoundary } from '@/components/ErrorBoundary';

        export default function RootLayout({ children }: { children: React.ReactNode }) {
          return (
            <html lang="en">
              <body>
                <ErrorBoundary>
                  {children}
                </ErrorBoundary>
              </body>
            </html>
          );
        }
        ```
      </action>
    </step>
    <step order="4" description="Add granular Error Boundaries to routes">
      <action>
        Wrap major route groups with their own Error Boundaries for isolation
      </action>
    </step>
    <step order="5" description="Write Error Boundary tests">
      <action>
        Test error catching, fallback rendering, and reset functionality
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="Error caught and fallback shown">
        Throw error in child component, verify fallback UI renders
      </test>
      <test name="Reset functionality works">
        Click Try Again, verify component re-renders
      </test>
      <test name="Error details shown in development">
        In dev mode, verify error message displayed
      </test>
      <test name="Error details hidden in production">
        In prod mode, verify error message not displayed
      </test>
      <test name="onError callback called">
        Verify custom error handler receives error info
      </test>
    </test_cases>
    <manual_verification>
      <check>Intentionally cause error, verify graceful fallback</check>
      <check>Verify other routes still work after error in one route</check>
      <check>Verify reset allows user to retry</check>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <item>ErrorBoundary component created and functional</item>
      <item>ErrorFallback component with user-friendly UI</item>
      <item>Root layout wrapped with Error Boundary</item>
      <item>Dashboard routes wrapped with Error Boundary</item>
      <item>Reset functionality allows recovery without page reload</item>
      <item>Error details visible in development only</item>
      <item>All Error Boundary tests pass</item>
      <item>Manual testing confirms graceful error handling</item>
    </criteria>
  </definition_of_done>
</task_specification>

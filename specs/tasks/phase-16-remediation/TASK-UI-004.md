<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-UI-004</task_id>
    <title>Add Suspense Boundaries</title>
    <type>performance</type>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>performance, react, suspense, code-splitting, loading-states</tags>
  </metadata>

  <context>
    <issue_description>
      The application lacks Suspense boundaries for code-split components and async data
      loading. This results in no loading feedback during navigation, jarring layout shifts,
      and poor perceived performance. Users see blank areas while content loads.
    </issue_description>
    <current_behavior>
      - No loading states during component lazy loading
      - Blank areas during async operations
      - Layout shifts when content appears
      - No skeleton screens or loading indicators
      - Poor perceived performance
    </current_behavior>
    <user_impact>
      - MEDIUM: Confusing user experience during loading
      - Layout shifts cause frustration
      - No feedback that content is loading
      - Perceived slowness of application
    </user_impact>
  </context>

  <scope>
    <files_to_create>
      <file path="apps/web/src/components/loading/PageSkeleton.tsx">
        Full page loading skeleton
      </file>
      <file path="apps/web/src/components/loading/CardSkeleton.tsx">
        Card component loading skeleton
      </file>
      <file path="apps/web/src/components/loading/TableSkeleton.tsx">
        Table loading skeleton
      </file>
      <file path="apps/web/src/components/loading/FormSkeleton.tsx">
        Form loading skeleton
      </file>
      <file path="apps/web/src/app/loading.tsx">
        Root loading component
      </file>
      <file path="apps/web/src/app/(dashboard)/loading.tsx">
        Dashboard loading component
      </file>
    </files_to_create>
    <files_to_modify>
      <file path="apps/web/src/app/(dashboard)/books/page.tsx" action="modify">
        Add Suspense boundary for book list
      </file>
      <file path="apps/web/src/app/(dashboard)/children/page.tsx" action="modify">
        Add Suspense boundary for children list
      </file>
      <file path="apps/web/src/app/(dashboard)/reports/page.tsx" action="modify">
        Add Suspense boundary for reports
      </file>
    </files_to_modify>
  </scope>

  <implementation>
    <step order="1" description="Create base skeleton components">
      <action>
        ```typescript
        // apps/web/src/components/loading/Skeleton.tsx
        interface SkeletonProps {
          className?: string;
          width?: string;
          height?: string;
        }

        export function Skeleton({ className, width, height }: SkeletonProps) {
          return (
            <div
              className={`animate-pulse bg-gray-200 rounded ${className}`}
              style={{ width, height }}
            />
          );
        }
        ```
      </action>
    </step>
    <step order="2" description="Create PageSkeleton">
      <action>
        ```typescript
        // apps/web/src/components/loading/PageSkeleton.tsx
        import { Skeleton } from './Skeleton';

        export function PageSkeleton() {
          return (
            <div className="space-y-4 p-6">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-96" />
              <div className="grid grid-cols-3 gap-4 mt-6">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            </div>
          );
        }
        ```
      </action>
    </step>
    <step order="3" description="Create TableSkeleton">
      <action>
        ```typescript
        // apps/web/src/components/loading/TableSkeleton.tsx
        import { Skeleton } from './Skeleton';

        export function TableSkeleton({ rows = 5 }: { rows?: number }) {
          return (
            <div className="space-y-3">
              <Skeleton className="h-10 w-full" />
              {[...Array(rows)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          );
        }
        ```
      </action>
    </step>
    <step order="4" description="Create Next.js loading files">
      <action>
        ```typescript
        // apps/web/src/app/loading.tsx
        import { PageSkeleton } from '@/components/loading/PageSkeleton';

        export default function Loading() {
          return <PageSkeleton />;
        }
        ```
      </action>
    </step>
    <step order="5" description="Add Suspense boundaries to pages">
      <action>
        Wrap async components with Suspense:

        ```typescript
        import { Suspense } from 'react';
        import { TableSkeleton } from '@/components/loading/TableSkeleton';

        export default function BooksPage() {
          return (
            <div>
              <h1>Books</h1>
              <Suspense fallback={<TableSkeleton rows={10} />}>
                <BookList />
              </Suspense>
            </div>
          );
        }
        ```
      </action>
    </step>
    <step order="6" description="Add streaming for async components">
      <action>
        Use async Server Components with streaming:

        ```typescript
        // Async server component streams when ready
        async function BookList() {
          const books = await fetchBooks();
          return <BookTable books={books} />;
        }
        ```
      </action>
    </step>
  </implementation>

  <verification>
    <test_cases>
      <test name="Loading state shown during navigation">
        Navigate to page, verify skeleton appears immediately
      </test>
      <test name="Skeleton matches content layout">
        Verify skeleton dimensions prevent layout shift
      </test>
      <test name="Content replaces skeleton smoothly">
        Verify no flash or jump when content loads
      </test>
      <test name="Nested Suspense works correctly">
        Verify independent loading states for nested components
      </test>
    </test_cases>
    <performance_verification>
      <check>Lighthouse CLS (Cumulative Layout Shift) score improved</check>
      <check>First Contentful Paint maintained or improved</check>
      <check>Perceived performance improved (user testing)</check>
    </performance_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <item>Skeleton components created for common patterns</item>
      <item>loading.tsx files created for route groups</item>
      <item>All major pages have appropriate Suspense boundaries</item>
      <item>Skeletons match actual content layout</item>
      <item>No layout shifts during loading transitions</item>
      <item>Animation is smooth and not jarring</item>
      <item>CLS score in Lighthouse improved</item>
      <item>Manual testing confirms good loading UX</item>
    </criteria>
  </definition_of_done>
</task_specification>

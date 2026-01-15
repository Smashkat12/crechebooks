'use client';

/**
 * Dashboard Layout Component
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Features:
 * - Responsive sidebar (hidden on mobile, collapsible on desktop)
 * - Improved touch targets (min 44px)
 * - Safe area padding for mobile devices
 * - Smooth transitions for layout changes
 */

import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/use-auth';
import { ErrorBoundary } from '@/components/error-boundary';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const { isMobile, isTablet } = useBreakpoint();
  // TASK-UI-001: Auth hook manages session state (no localStorage token storage)
  useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* TASK-UI-008: Sidebar is hidden on mobile (< lg breakpoint) */}
      <Sidebar />

      <div
        className={cn(
          'min-h-screen transition-all duration-300 ease-in-out',
          // Desktop: offset by sidebar width
          'lg:ml-64',
          sidebarCollapsed && 'lg:ml-16',
          // Mobile/Tablet: no offset (sidebar is a drawer)
          'ml-0'
        )}
      >
        <Header />

        {/* Main content area */}
        {/* TASK-UI-007: Skip link target for accessibility */}
        <main
          id="main-content"
          role="main"
          tabIndex={-1}
          className={cn(
            // TASK-UI-008: Responsive padding
            'transition-all duration-300',
            // Mobile: smaller padding
            'p-3 sm:p-4 md:p-5 lg:p-6',
            // Safe area insets for mobile devices with notches
            'pb-safe-area-inset-bottom',
            // Ensure minimum touch target spacing
            '[&_button]:min-h-[44px] [&_a]:min-h-[44px]',
            // Touch-friendly tap highlights on mobile
            isMobile && '[&_button]:active:scale-[0.98] [&_a]:active:scale-[0.98]',
            // TASK-UI-007: Remove focus outline when skip link targets this element
            'focus:outline-none'
          )}
        >
          {/* TASK-UI-003: Page-level error boundary for dashboard content */}
          <ErrorBoundary>
            {/* TASK-UI-008: Responsive content container */}
            <div
              className={cn(
                'w-full mx-auto',
                // Max width constraints for very large screens
                'max-w-[1800px]',
                // Ensure content doesn't touch edges on mobile
                isMobile && 'px-1',
                isTablet && 'px-2'
              )}
            >
              {children}
            </div>
          </ErrorBoundary>
        </main>

        {/* TASK-UI-008: Bottom safe area spacer for mobile */}
        {isMobile && (
          <div className="h-[env(safe-area-inset-bottom,0px)]" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

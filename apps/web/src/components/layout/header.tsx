'use client';

/**
 * Header Component
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Features:
 * - Responsive padding for different screen sizes
 * - Touch-friendly navigation controls
 * - Safe area support for notched devices
 */

import { MobileNav } from './mobile-nav';
import { UserNav } from './user-nav';
import { ThemeToggle } from './theme-toggle';
import { Breadcrumbs } from './breadcrumbs';
import { cn } from '@/lib/utils';

export function Header() {
  return (
    <header
      className={cn(
        'sticky top-0 z-30 flex items-center gap-4 border-b bg-background',
        // TASK-UI-008: Responsive height and padding
        'h-14 sm:h-16',
        'px-3 sm:px-4 md:px-6',
        // Safe area for notched devices
        'pt-safe'
      )}
    >
      <MobileNav />

      {/* Breadcrumbs - hidden on very small screens */}
      <div className="flex-1 min-w-0">
        <div className="hidden xs:block">
          <Breadcrumbs />
        </div>
      </div>

      {/* Actions with touch-friendly spacing */}
      <div className="flex items-center gap-1 sm:gap-2">
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}

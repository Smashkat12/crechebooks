'use client';

/**
 * Skip Link Component
 * TASK-UI-007: Add Accessibility Skip Links
 *
 * Provides keyboard and screen reader users with a way to bypass
 * repetitive navigation elements and jump directly to main content.
 *
 * WCAG Requirements:
 * - 2.4.1 Bypass Blocks (Level A)
 * - 2.4.3 Focus Order (Level A)
 * - 2.4.7 Focus Visible (Level AA)
 *
 * @example
 * <SkipLink href="#main-content">Skip to main content</SkipLink>
 */

import { cn } from '@/lib/utils';

interface SkipLinkProps {
  /** Target element ID to skip to (include # prefix) */
  href: string;
  /** Link text - should be descriptive */
  children: React.ReactNode;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Accessible skip link component
 * Hidden by default, visible on focus (keyboard navigation)
 */
export function SkipLink({ href, children, className }: SkipLinkProps) {
  return (
    <a
      href={href}
      className={cn(
        // Hidden by default using sr-only
        'sr-only',
        // Visible on focus
        'focus:not-sr-only',
        // Fixed positioning when focused
        'focus:absolute focus:top-4 focus:left-4 focus:z-[100]',
        // Styling when visible
        'focus:px-4 focus:py-2',
        'focus:bg-primary focus:text-primary-foreground',
        'focus:rounded-md focus:shadow-lg',
        // Focus ring
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        // Typography
        'focus:font-medium focus:text-sm',
        // Transition
        'transition-all duration-200',
        className
      )}
    >
      {children}
    </a>
  );
}

/**
 * Skip Links Container
 * Groups multiple skip links together at the top of the page
 */
interface SkipLinksProps {
  children: React.ReactNode;
}

export function SkipLinks({ children }: SkipLinksProps) {
  return (
    <div className="skip-links" role="navigation" aria-label="Skip links">
      {children}
    </div>
  );
}

/**
 * Default skip links for typical application layout
 * Includes links to main content and navigation
 */
export function DefaultSkipLinks() {
  return (
    <SkipLinks>
      <SkipLink href="#main-content">Skip to main content</SkipLink>
      <SkipLink href="#main-navigation">Skip to navigation</SkipLink>
    </SkipLinks>
  );
}

export default SkipLink;

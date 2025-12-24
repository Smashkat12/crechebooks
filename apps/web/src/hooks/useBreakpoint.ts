/**
 * Breakpoint Hook
 * TASK-WEB-046: Mobile Responsive Improvements
 *
 * @module hooks/useBreakpoint
 * @description React hook for detecting current viewport breakpoint.
 */

import { useState, useEffect, useCallback } from 'react';

/**
 * Tailwind CSS breakpoint values in pixels
 */
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

type Breakpoint = keyof typeof BREAKPOINTS;

export interface UseBreakpointReturn {
  /** Current viewport is mobile (<768px) */
  isMobile: boolean;
  /** Current viewport is tablet (768px - 1023px) */
  isTablet: boolean;
  /** Current viewport is desktop (>=1024px) */
  isDesktop: boolean;
  /** Current breakpoint name */
  breakpoint: Breakpoint;
  /** Current viewport width */
  width: number;
}

/**
 * Get current breakpoint based on window width
 */
function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  return 'sm';
}

/**
 * Hook to detect and respond to viewport breakpoint changes.
 * Uses debounced resize listener for performance.
 *
 * @example
 * const { isMobile, isDesktop, breakpoint } = useBreakpoint();
 *
 * if (isMobile) {
 *   return <MobileView />;
 * }
 */
export function useBreakpoint(): UseBreakpointReturn {
  // Initialize with SSR-safe default (assume desktop for initial render)
  const [state, setState] = useState<UseBreakpointReturn>({
    isMobile: false,
    isTablet: false,
    isDesktop: true,
    breakpoint: 'lg',
    width: typeof window !== 'undefined' ? window.innerWidth : 1024,
  });

  const updateBreakpoint = useCallback(() => {
    if (typeof window === 'undefined') return;

    const width = window.innerWidth;
    const breakpoint = getBreakpoint(width);

    setState({
      isMobile: width < BREAKPOINTS.md,
      isTablet: width >= BREAKPOINTS.md && width < BREAKPOINTS.lg,
      isDesktop: width >= BREAKPOINTS.lg,
      breakpoint,
      width,
    });
  }, []);

  useEffect(() => {
    // Update on mount
    updateBreakpoint();

    // Debounced resize handler
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateBreakpoint, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [updateBreakpoint]);

  return state;
}

/**
 * Hook to check if viewport matches a specific breakpoint or higher
 *
 * @example
 * const isLgOrLarger = useMinBreakpoint('lg');
 */
export function useMinBreakpoint(breakpoint: Breakpoint): boolean {
  const { width } = useBreakpoint();
  return width >= BREAKPOINTS[breakpoint];
}

/**
 * Hook to check if viewport is below a specific breakpoint
 *
 * @example
 * const isBelowMd = useMaxBreakpoint('md');
 */
export function useMaxBreakpoint(breakpoint: Breakpoint): boolean {
  const { width } = useBreakpoint();
  return width < BREAKPOINTS[breakpoint];
}

'use client';

/**
 * Mobile Detection Hook
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Simple hook for detecting mobile viewport.
 * Uses useBreakpoint internally for consistency.
 *
 * @module hooks/use-mobile
 */

import { useState, useEffect, useCallback } from 'react';
import { useBreakpoint } from './useBreakpoint';

const MOBILE_BREAKPOINT = 768; // md breakpoint in Tailwind

/**
 * Simple hook to detect if viewport is mobile size
 *
 * @example
 * const isMobile = useMobile();
 *
 * if (isMobile) {
 *   return <MobileLayout />;
 * }
 *
 * @returns boolean indicating if viewport is mobile
 */
export function useMobile(): boolean {
  const { isMobile } = useBreakpoint();
  return isMobile;
}

/**
 * Hook that uses window directly without SSR considerations
 * Useful for components that need immediate mobile detection
 *
 * @returns boolean indicating if viewport is mobile
 */
export function useMobileWindow(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  const checkMobile = useCallback(() => {
    if (typeof window !== 'undefined') {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    }
  }, []);

  useEffect(() => {
    // Check on mount
    checkMobile();

    // Add resize listener with debounce
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(checkMobile, 100);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [checkMobile]);

  return isMobile;
}

/**
 * Hook to detect if device supports touch input
 *
 * @returns boolean indicating if device supports touch
 */
export function useTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setIsTouch(
        'ontouchstart' in window ||
          navigator.maxTouchPoints > 0 ||
          // @ts-expect-error - msMaxTouchPoints is IE/Edge specific
          navigator.msMaxTouchPoints > 0
      );
    }
  }, []);

  return isTouch;
}

/**
 * Hook to detect device orientation
 *
 * @returns 'portrait' | 'landscape' | undefined
 */
export function useOrientation(): 'portrait' | 'landscape' | undefined {
  const [orientation, setOrientation] = useState<
    'portrait' | 'landscape' | undefined
  >(undefined);

  useEffect(() => {
    const updateOrientation = () => {
      if (typeof window !== 'undefined') {
        setOrientation(
          window.innerWidth > window.innerHeight ? 'landscape' : 'portrait'
        );
      }
    };

    updateOrientation();

    window.addEventListener('resize', updateOrientation);
    window.addEventListener('orientationchange', updateOrientation);

    return () => {
      window.removeEventListener('resize', updateOrientation);
      window.removeEventListener('orientationchange', updateOrientation);
    };
  }, []);

  return orientation;
}

/**
 * Combined mobile utilities hook
 *
 * @example
 * const { isMobile, isTouch, orientation } = useMobileUtils();
 */
export function useMobileUtils() {
  const isMobile = useMobile();
  const isTouch = useTouchDevice();
  const orientation = useOrientation();

  return {
    isMobile,
    isTouch,
    orientation,
    isPortrait: orientation === 'portrait',
    isLandscape: orientation === 'landscape',
  };
}

export default useMobile;

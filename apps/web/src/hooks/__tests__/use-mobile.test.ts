/**
 * useMobile Hook Tests
 * TASK-UI-002: Expand Frontend Test Coverage
 *
 * Tests for mobile detection hooks including:
 * - useMobileWindow - direct window width detection
 * - useTouchDevice - touch capability detection
 * - useOrientation - device orientation detection
 * - useMobileUtils - combined mobile utilities
 * - Window resize handling
 * - SSR safety
 */

import { renderHook, act } from '@testing-library/react';
import {
  useMobileWindow,
  useTouchDevice,
  useOrientation,
  useMobileUtils,
} from '../use-mobile';

// Helper to mock window properties
const mockWindowProperty = (property: string, value: unknown) => {
  Object.defineProperty(window, property, {
    writable: true,
    configurable: true,
    value,
  });
};

// Helper to trigger resize event
const triggerResize = (width: number, height: number = 768) => {
  mockWindowProperty('innerWidth', width);
  mockWindowProperty('innerHeight', height);
  window.dispatchEvent(new Event('resize'));
};

describe('useMobileWindow', () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    jest.useFakeTimers();
    // Reset to desktop default
    mockWindowProperty('innerWidth', 1024);
  });

  afterEach(() => {
    jest.useRealTimers();
    mockWindowProperty('innerWidth', originalInnerWidth);
  });

  describe('initial detection', () => {
    it('should detect mobile width (<768px)', () => {
      mockWindowProperty('innerWidth', 375);

      const { result } = renderHook(() => useMobileWindow());

      // Run effect
      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(true);
    });

    it('should detect desktop width (>=768px)', () => {
      mockWindowProperty('innerWidth', 1024);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(false);
    });

    it('should detect tablet at breakpoint boundary (768px)', () => {
      mockWindowProperty('innerWidth', 768);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(false); // 768 is NOT mobile
    });

    it('should detect mobile at 767px', () => {
      mockWindowProperty('innerWidth', 767);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(true);
    });
  });

  describe('resize handling', () => {
    it('should update on window resize from desktop to mobile', () => {
      mockWindowProperty('innerWidth', 1024);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(false);

      // Resize to mobile
      act(() => {
        triggerResize(375);
        jest.advanceTimersByTime(100); // Debounce delay
      });

      expect(result.current).toBe(true);
    });

    it('should update on window resize from mobile to desktop', () => {
      mockWindowProperty('innerWidth', 375);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      expect(result.current).toBe(true);

      // Resize to desktop
      act(() => {
        triggerResize(1024);
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe(false);
    });

    it('should debounce resize events', () => {
      mockWindowProperty('innerWidth', 1024);

      const { result } = renderHook(() => useMobileWindow());

      act(() => {
        jest.runAllTimers();
      });

      // Rapid resize events
      act(() => {
        triggerResize(500);
        triggerResize(400);
        triggerResize(300);
      });

      // Should not update immediately
      expect(result.current).toBe(false);

      // After debounce
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should remove resize listener on unmount', () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useMobileWindow());

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith(
        'resize',
        expect.any(Function)
      );

      removeEventListenerSpy.mockRestore();
    });

    it('should clear timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      mockWindowProperty('innerWidth', 1024);

      const { unmount } = renderHook(() => useMobileWindow());

      // Trigger a resize to start timeout
      act(() => {
        triggerResize(375);
      });

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });
  });

  describe('common device widths', () => {
    const testCases = [
      { width: 320, expected: true, device: 'iPhone SE' },
      { width: 375, expected: true, device: 'iPhone 12 Mini' },
      { width: 390, expected: true, device: 'iPhone 12/13' },
      { width: 414, expected: true, device: 'iPhone 8 Plus' },
      { width: 428, expected: true, device: 'iPhone 12 Pro Max' },
      { width: 768, expected: false, device: 'iPad Portrait' },
      { width: 820, expected: false, device: 'iPad Air' },
      { width: 1024, expected: false, device: 'iPad Landscape' },
      { width: 1280, expected: false, device: 'Laptop' },
      { width: 1920, expected: false, device: 'Desktop' },
    ];

    testCases.forEach(({ width, expected, device }) => {
      it(`should return ${expected} for ${device} (${width}px)`, () => {
        mockWindowProperty('innerWidth', width);

        const { result } = renderHook(() => useMobileWindow());

        act(() => {
          jest.runAllTimers();
        });

        expect(result.current).toBe(expected);
      });
    });
  });
});

describe('useTouchDevice', () => {
  const originalOntouchstart = window.ontouchstart;
  const originalMaxTouchPoints = navigator.maxTouchPoints;

  beforeEach(() => {
    // Reset touch properties
    delete (window as { ontouchstart?: unknown }).ontouchstart;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: 0,
    });
  });

  afterEach(() => {
    if (originalOntouchstart !== undefined) {
      (window as { ontouchstart?: unknown }).ontouchstart = originalOntouchstart;
    }
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: originalMaxTouchPoints,
    });
  });

  it('should detect touch device via ontouchstart', () => {
    (window as { ontouchstart?: unknown }).ontouchstart = () => {};

    const { result } = renderHook(() => useTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should detect touch device via maxTouchPoints', () => {
    Object.defineProperty(navigator, 'maxTouchPoints', {
      writable: true,
      configurable: true,
      value: 5,
    });

    const { result } = renderHook(() => useTouchDevice());

    expect(result.current).toBe(true);
  });

  it('should return false for non-touch device', () => {
    const { result } = renderHook(() => useTouchDevice());

    expect(result.current).toBe(false);
  });
});

describe('useOrientation', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);
  });

  afterEach(() => {
    mockWindowProperty('innerWidth', originalInnerWidth);
    mockWindowProperty('innerHeight', originalInnerHeight);
  });

  it('should detect landscape orientation', () => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('landscape');
  });

  it('should detect portrait orientation', () => {
    mockWindowProperty('innerWidth', 768);
    mockWindowProperty('innerHeight', 1024);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('portrait');
  });

  it('should update on window resize', () => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('landscape');

    // Rotate to portrait
    act(() => {
      mockWindowProperty('innerWidth', 768);
      mockWindowProperty('innerHeight', 1024);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe('portrait');
  });

  it('should update on orientationchange event', () => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('landscape');

    // Simulate orientation change
    act(() => {
      mockWindowProperty('innerWidth', 768);
      mockWindowProperty('innerHeight', 1024);
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(result.current).toBe('portrait');
  });

  it('should handle square dimensions', () => {
    mockWindowProperty('innerWidth', 768);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useOrientation());

    // Equal dimensions should be portrait (width not greater than height)
    expect(result.current).toBe('portrait');
  });

  it('should cleanup event listeners on unmount', () => {
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useOrientation());

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'resize',
      expect.any(Function)
    );
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'orientationchange',
      expect.any(Function)
    );

    removeEventListenerSpy.mockRestore();
  });
});

describe('useMobileUtils', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should provide all mobile utilities', () => {
    const { result } = renderHook(() => useMobileUtils());

    expect(result.current).toHaveProperty('isMobile');
    expect(result.current).toHaveProperty('isTouch');
    expect(result.current).toHaveProperty('orientation');
    expect(result.current).toHaveProperty('isPortrait');
    expect(result.current).toHaveProperty('isLandscape');
  });

  it('should compute isPortrait correctly', () => {
    mockWindowProperty('innerWidth', 768);
    mockWindowProperty('innerHeight', 1024);

    const { result } = renderHook(() => useMobileUtils());

    expect(result.current.isPortrait).toBe(true);
    expect(result.current.isLandscape).toBe(false);
  });

  it('should compute isLandscape correctly', () => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useMobileUtils());

    expect(result.current.isLandscape).toBe(true);
    expect(result.current.isPortrait).toBe(false);
  });
});

describe('SSR safety', () => {
  // These tests verify the hooks don't throw when window is undefined
  // In actual SSR, window would be undefined, but in Jest it exists
  // We test the conditional checks work correctly

  it('useMobileWindow should handle window check', () => {
    // The hook checks typeof window !== 'undefined'
    // This test verifies it doesn't throw
    expect(() => {
      renderHook(() => useMobileWindow());
    }).not.toThrow();
  });

  it('useTouchDevice should handle window check', () => {
    expect(() => {
      renderHook(() => useTouchDevice());
    }).not.toThrow();
  });

  it('useOrientation should handle window check', () => {
    expect(() => {
      renderHook(() => useOrientation());
    }).not.toThrow();
  });

  it('useMobileUtils should handle window check', () => {
    expect(() => {
      renderHook(() => useMobileUtils());
    }).not.toThrow();
  });
});

describe('edge cases', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle very small viewport', () => {
    mockWindowProperty('innerWidth', 100);

    const { result } = renderHook(() => useMobileWindow());

    act(() => {
      jest.runAllTimers();
    });

    expect(result.current).toBe(true);
  });

  it('should handle very large viewport', () => {
    mockWindowProperty('innerWidth', 5120);

    const { result } = renderHook(() => useMobileWindow());

    act(() => {
      jest.runAllTimers();
    });

    expect(result.current).toBe(false);
  });

  it('should handle rapid orientation changes', () => {
    mockWindowProperty('innerWidth', 1024);
    mockWindowProperty('innerHeight', 768);

    const { result } = renderHook(() => useOrientation());

    expect(result.current).toBe('landscape');

    // Rapid changes
    act(() => {
      mockWindowProperty('innerWidth', 768);
      mockWindowProperty('innerHeight', 1024);
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(result.current).toBe('portrait');

    act(() => {
      mockWindowProperty('innerWidth', 1024);
      mockWindowProperty('innerHeight', 768);
      window.dispatchEvent(new Event('orientationchange'));
    });

    expect(result.current).toBe('landscape');
  });
});

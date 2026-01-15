/**
 * useDebounce Hook Tests
 * TASK-UI-002: Expand Frontend Test Coverage
 *
 * Tests for debounce hook including:
 * - Value debouncing with default delay
 * - Custom delay timing
 * - Multiple rapid updates
 * - Cleanup on unmount
 * - Different value types
 */

import { renderHook, act } from '@testing-library/react';
import { useDebounce } from '../use-debounce';

describe('useDebounce', () => {
  // Use fake timers for all tests
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial value', () => {
    it('should return initial value immediately', () => {
      const { result } = renderHook(() => useDebounce('initial', 500));

      expect(result.current).toBe('initial');
    });

    it('should return initial value for numbers', () => {
      const { result } = renderHook(() => useDebounce(42, 500));

      expect(result.current).toBe(42);
    });

    it('should return initial value for objects', () => {
      const initialValue = { foo: 'bar' };
      const { result } = renderHook(() => useDebounce(initialValue, 500));

      expect(result.current).toEqual({ foo: 'bar' });
    });

    it('should return initial value for arrays', () => {
      const initialValue = [1, 2, 3];
      const { result } = renderHook(() => useDebounce(initialValue, 500));

      expect(result.current).toEqual([1, 2, 3]);
    });

    it('should return initial value for null', () => {
      const { result } = renderHook(() => useDebounce(null, 500));

      expect(result.current).toBeNull();
    });

    it('should return initial value for undefined', () => {
      const { result } = renderHook(() => useDebounce(undefined, 500));

      expect(result.current).toBeUndefined();
    });
  });

  describe('default delay', () => {
    it('should use 500ms as default delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value),
        { initialProps: { value: 'initial' } }
      );

      // Update value
      rerender({ value: 'updated' });

      // Should still be initial before default delay
      expect(result.current).toBe('initial');

      // Advance past default 500ms delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('debounce timing', () => {
    it('should not update value before delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      // Advance time but not enough
      act(() => {
        jest.advanceTimersByTime(400);
      });

      expect(result.current).toBe('initial');
    });

    it('should update value after delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      // Advance past delay
      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });

    it('should respect custom delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 1000),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      // 500ms should not be enough
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current).toBe('initial');

      // After 1000ms total it should update
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(result.current).toBe('updated');
    });

    it('should handle very short delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 50),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(50);
      });

      expect(result.current).toBe('updated');
    });

    it('should handle zero delay', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 0),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('rapid updates', () => {
    it('should only use last value after rapid updates', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      // Rapid updates
      rerender({ value: 'update1' });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ value: 'update2' });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ value: 'update3' });
      act(() => {
        jest.advanceTimersByTime(100);
      });

      rerender({ value: 'final' });

      // Should still be initial
      expect(result.current).toBe('initial');

      // Wait for debounce
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Should be final value
      expect(result.current).toBe('final');
    });

    it('should reset timer on each update', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      // First update
      rerender({ value: 'update1' });
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Second update resets timer
      rerender({ value: 'update2' });
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // Should still be initial (timer was reset)
      expect(result.current).toBe('initial');

      // Complete the second debounce
      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe('update2');
    });
  });

  describe('value types', () => {
    it('should debounce number values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 0 } }
      );

      rerender({ value: 100 });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe(100);
    });

    it('should debounce boolean values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: false } }
      );

      rerender({ value: true });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe(true);
    });

    it('should debounce object values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: { count: 0 } } }
      );

      rerender({ value: { count: 10 } });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toEqual({ count: 10 });
    });

    it('should debounce array values', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: [] as number[] } }
      );

      rerender({ value: [1, 2, 3] });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toEqual([1, 2, 3]);
    });

    it('should handle changing from value to null', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce<string | null>(value, 500),
        { initialProps: { value: 'initial' as string | null } }
      );

      rerender({ value: null });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBeNull();
    });

    it('should handle changing from null to value', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce<string | null>(value, 500),
        { initialProps: { value: null as string | null } }
      );

      rerender({ value: 'updated' });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('cleanup on unmount', () => {
    it('should clear timeout on unmount', () => {
      const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');

      const { unmount, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      // Trigger a debounce
      rerender({ value: 'updated' });

      // Unmount before debounce completes
      unmount();

      // clearTimeout should have been called
      expect(clearTimeoutSpy).toHaveBeenCalled();

      clearTimeoutSpy.mockRestore();
    });

    it('should not update after unmount', () => {
      const { result, unmount, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: 'updated' });
      unmount();

      // Advance time after unmount
      act(() => {
        jest.advanceTimersByTime(500);
      });

      // Value captured before unmount should still be initial
      expect(result.current).toBe('initial');
    });
  });

  describe('delay changes', () => {
    it('should respond to delay changes', () => {
      const { result, rerender } = renderHook(
        ({ value, delay }) => useDebounce(value, delay),
        { initialProps: { value: 'initial', delay: 500 } }
      );

      // Update with new delay
      rerender({ value: 'updated', delay: 200 });

      // Old delay should not work
      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(result.current).toBe('updated');
    });
  });

  describe('common use cases', () => {
    it('should work for search input debouncing', () => {
      const { result, rerender } = renderHook(
        ({ search }) => useDebounce(search, 300),
        { initialProps: { search: '' } }
      );

      // Simulate typing
      rerender({ search: 'a' });
      rerender({ search: 'ab' });
      rerender({ search: 'abc' });

      expect(result.current).toBe('');

      act(() => {
        jest.advanceTimersByTime(300);
      });

      expect(result.current).toBe('abc');
    });

    it('should work for form validation debouncing', () => {
      const { result, rerender } = renderHook(
        ({ email }) => useDebounce(email, 500),
        { initialProps: { email: '' } }
      );

      // Simulate typing email
      rerender({ email: 'u' });
      rerender({ email: 'us' });
      rerender({ email: 'user@' });
      rerender({ email: 'user@example.com' });

      expect(result.current).toBe('');

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('user@example.com');
    });

    it('should work for resize event handling', () => {
      const { result, rerender } = renderHook(
        ({ width }) => useDebounce(width, 100),
        { initialProps: { width: 1024 } }
      );

      // Simulate resize events
      rerender({ width: 1000 });
      rerender({ width: 950 });
      rerender({ width: 900 });
      rerender({ width: 768 });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(result.current).toBe(768);
    });
  });

  describe('edge cases', () => {
    it('should handle same value updates', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'same' } }
      );

      rerender({ value: 'same' });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('same');
    });

    it('should handle empty string', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: 'initial' } }
      );

      rerender({ value: '' });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('');
    });

    it('should handle whitespace string', () => {
      const { result, rerender } = renderHook(
        ({ value }) => useDebounce(value, 500),
        { initialProps: { value: '' } }
      );

      rerender({ value: '   ' });

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(result.current).toBe('   ');
    });
  });
});

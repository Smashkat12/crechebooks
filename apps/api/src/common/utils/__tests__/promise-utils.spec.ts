import {
  withTimeout,
  promiseAllSettledWithTimeout,
  promiseAllWithPartialFailure,
  promiseAllWithPartialFailureAndTimeout,
  promiseAllWithConcurrency,
  TimeoutError,
} from '../promise-utils';

describe('promise-utils', () => {
  describe('TimeoutError', () => {
    it('should create a TimeoutError with default message', () => {
      const error = new TimeoutError();
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Operation timed out');
    });

    it('should create a TimeoutError with custom message', () => {
      const error = new TimeoutError('Custom timeout message');
      expect(error.name).toBe('TimeoutError');
      expect(error.message).toBe('Custom timeout message');
    });
  });

  describe('withTimeout', () => {
    it('should resolve if promise completes before timeout', async () => {
      const promise = Promise.resolve('success');
      const result = await withTimeout(promise, 1000);
      expect(result).toBe('success');
    });

    it('should reject with TimeoutError if promise exceeds timeout', async () => {
      const promise = new Promise((resolve) =>
        setTimeout(() => resolve('late'), 200),
      );
      await expect(withTimeout(promise, 50)).rejects.toThrow(TimeoutError);
    });

    it('should use custom error message when provided', async () => {
      const promise = new Promise((resolve) =>
        setTimeout(() => resolve('late'), 200),
      );
      await expect(withTimeout(promise, 50, 'Custom error')).rejects.toThrow(
        'Custom error',
      );
    });

    it('should propagate original error if promise rejects before timeout', async () => {
      const promise = Promise.reject(new Error('Original error'));
      await expect(withTimeout(promise, 1000)).rejects.toThrow(
        'Original error',
      );
    });

    it('should clear timeout when promise resolves', async () => {
      jest.useFakeTimers();
      const promise = Promise.resolve('immediate');
      const resultPromise = withTimeout(promise, 1000);

      await expect(resultPromise).resolves.toBe('immediate');

      // Advance timers - timeout should have been cleared
      jest.advanceTimersByTime(2000);
      jest.useRealTimers();
    });
  });

  describe('promiseAllSettledWithTimeout', () => {
    it('should return settled results for all promises', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3),
      ];

      const results = await promiseAllSettledWithTimeout(promises, 1000);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
      expect(results[1]).toEqual({ status: 'fulfilled', value: 2 });
      expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
    });

    it('should handle mixed success and failure', async () => {
      const promises = [
        Promise.resolve('success'),
        Promise.reject(new Error('failure')),
        Promise.resolve('another success'),
      ];

      const results = await promiseAllSettledWithTimeout(promises, 1000);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ status: 'fulfilled', value: 'success' });
      expect(results[1].status).toBe('rejected');
      expect(results[2]).toEqual({
        status: 'fulfilled',
        value: 'another success',
      });
    });

    it('should handle timeouts as rejections', async () => {
      const promises = [
        Promise.resolve('fast'),
        new Promise((resolve) => setTimeout(() => resolve('slow'), 200)),
      ];

      const results = await promiseAllSettledWithTimeout(promises, 50);

      expect(results[0]).toEqual({ status: 'fulfilled', value: 'fast' });
      expect(results[1].status).toBe('rejected');
      if (results[1].status === 'rejected') {
        expect(results[1].reason).toBeInstanceOf(TimeoutError);
      }
    });
  });

  describe('promiseAllWithPartialFailure', () => {
    it('should return all results when all promises succeed', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3),
      ];
      const defaults = [0, 0, 0];

      const results = await promiseAllWithPartialFailure(promises, defaults);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should use default values for failed promises', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error('fail')),
        Promise.resolve(3),
      ];
      const defaults = [0, 99, 0];

      const results = await promiseAllWithPartialFailure(promises, defaults);

      expect(results).toEqual([1, 99, 3]);
    });

    it('should throw if arrays have different lengths', async () => {
      const promises = [Promise.resolve(1)];
      const defaults = [0, 0];

      await expect(
        promiseAllWithPartialFailure(promises, defaults),
      ).rejects.toThrow(
        'Promises and defaults arrays must have the same length',
      );
    });

    it('should handle all promises failing', async () => {
      const promises = [
        Promise.reject(new Error('fail 1')),
        Promise.reject(new Error('fail 2')),
      ];
      const defaults = [10, 20];

      const results = await promiseAllWithPartialFailure(promises, defaults);

      expect(results).toEqual([10, 20]);
    });
  });

  describe('promiseAllWithPartialFailureAndTimeout', () => {
    it('should return results with timeout and partial failure support', async () => {
      const promises = [
        Promise.resolve('fast'),
        new Promise((resolve) => setTimeout(() => resolve('slow'), 200)),
      ];
      const defaults = ['default1', 'default2'];

      const results = await promiseAllWithPartialFailureAndTimeout(
        promises,
        defaults,
        50,
      );

      expect(results[0]).toBe('fast');
      expect(results[1]).toBe('default2'); // Timed out, uses default
    });

    it('should handle mix of success, failure, and timeout', async () => {
      const promises = [
        Promise.resolve('success'),
        Promise.reject(new Error('error')),
        new Promise((resolve) => setTimeout(() => resolve('timeout'), 200)),
      ];
      const defaults = ['d1', 'd2', 'd3'];

      const results = await promiseAllWithPartialFailureAndTimeout(
        promises,
        defaults,
        50,
      );

      expect(results).toEqual(['success', 'd2', 'd3']);
    });

    it('should throw if arrays have different lengths', async () => {
      await expect(
        promiseAllWithPartialFailureAndTimeout(
          [Promise.resolve(1)],
          [0, 0],
          100,
        ),
      ).rejects.toThrow(
        'Promises and defaults arrays must have the same length',
      );
    });
  });

  describe('promiseAllWithConcurrency', () => {
    it('should execute all tasks and return results in order', async () => {
      const tasks = [
        () => Promise.resolve(1),
        () => Promise.resolve(2),
        () => Promise.resolve(3),
      ];

      const results = await promiseAllWithConcurrency(tasks, 2);

      expect(results).toEqual([1, 2, 3]);
    });

    it('should respect concurrency limit', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const tasks = Array.from({ length: 5 }, (_, i) => async () => {
        concurrent++;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise((resolve) => setTimeout(resolve, 10));
        concurrent--;
        return i;
      });

      const results = await promiseAllWithConcurrency(tasks, 2);

      expect(results).toEqual([0, 1, 2, 3, 4]);
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should handle empty tasks array', async () => {
      const results = await promiseAllWithConcurrency([], 2);
      expect(results).toEqual([]);
    });

    it('should handle single task', async () => {
      const tasks = [() => Promise.resolve('single')];
      const results = await promiseAllWithConcurrency(tasks, 5);
      expect(results).toEqual(['single']);
    });
  });
});

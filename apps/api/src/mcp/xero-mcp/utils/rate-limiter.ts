/**
 * Rate Limiter for Xero API
 * Xero allows 60 requests per minute
 */

export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number = 60, windowMs: number = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  /**
   * Acquire permission to make a request.
   * Will wait if rate limit is exceeded.
   */
  async acquire(): Promise<void> {
    this.cleanOldRequests();

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = oldestRequest + this.windowMs - Date.now();

      if (waitTime > 0) {
        await this.sleep(waitTime);
        return this.acquire();
      }
    }

    this.requests.push(Date.now());
  }

  /**
   * Check if a request can proceed without waiting
   */
  canProceed(): boolean {
    this.cleanOldRequests();
    return this.requests.length < this.maxRequests;
  }

  /**
   * Get current request count in the window
   */
  getCurrentCount(): number {
    this.cleanOldRequests();
    return this.requests.length;
  }

  /**
   * Get remaining requests allowed
   */
  getRemainingRequests(): number {
    this.cleanOldRequests();
    return Math.max(0, this.maxRequests - this.requests.length);
  }

  /**
   * Get time until next request slot opens (in ms)
   */
  getTimeUntilNextSlot(): number {
    if (this.canProceed()) {
      return 0;
    }

    const oldestRequest = this.requests[0];
    return Math.max(0, oldestRequest + this.windowMs - Date.now());
  }

  /**
   * Remove requests outside the current window
   */
  private cleanOldRequests(): void {
    const cutoff = Date.now() - this.windowMs;
    this.requests = this.requests.filter((timestamp) => timestamp > cutoff);
  }

  /**
   * Sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * XeroCircuitBreaker
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * Hand-rolled circuit breaker state machine to prevent cascade failures
 * during Xero API outages. Wraps all Xero API calls to provide fault tolerance.
 *
 * Circuit States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service recovered - the next request is treated as
 *   a trial: success closes the circuit, failure re-opens it with a fresh
 *   recovery timer.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter } from 'events';

/**
 * Configuration options for the circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Request timeout in milliseconds (default: 5000) */
  timeout: number;
  /** Error percentage threshold to trip circuit (default: 50) */
  errorThresholdPercentage: number;
  /** Time to wait before testing circuit (default: 30000) */
  resetTimeout: number;
  /** Minimum requests before calculating error percentage (default: 5) */
  volumeThreshold: number;
}

/**
 * Metrics collected by the circuit breaker
 */
export interface CircuitBreakerMetrics {
  /** Total number of successful requests */
  successes: number;
  /** Total number of failed requests */
  failures: number;
  /** Total number of rejected requests (circuit open) */
  rejects: number;
  /** Total number of fallback calls */
  fallbacks: number;
  /** Total number of timeout events */
  timeouts: number;
  /** Current circuit state */
  state: CircuitBreakerState;
  /** Percentage of failed requests */
  errorPercentage: number;
  /** Time when circuit was last opened */
  lastOpenedAt: Date | null;
  /** Time when circuit was last closed */
  lastClosedAt: Date | null;
}

/**
 * Circuit breaker states
 */
export type CircuitBreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * State change event data
 */
export interface StateChangeEvent {
  previousState: CircuitBreakerState;
  currentState: CircuitBreakerState;
  timestamp: Date;
  reason?: string;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  timeout: 5000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  volumeThreshold: 5,
};

@Injectable()
export class XeroCircuitBreaker implements OnModuleDestroy {
  private readonly logger = new Logger(XeroCircuitBreaker.name);
  private readonly config: CircuitBreakerConfig;
  private readonly eventEmitter = new EventEmitter();
  private readonly stateChangeCallbacks: Array<
    (state: StateChangeEvent) => void
  > = [];

  // Metrics tracking
  private successes = 0;
  private failures = 0;
  private rejects = 0;
  private fallbacks = 0;
  private timeouts = 0;
  private lastOpenedAt: Date | null = null;
  private lastClosedAt: Date | null = null;
  private currentState: CircuitBreakerState = 'CLOSED';

  // Timer used to schedule the OPEN -> HALF_OPEN transition
  private resetTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();

    this.logger.log(
      `XeroCircuitBreaker initialized with config: timeout=${this.config.timeout}ms, ` +
        `errorThreshold=${this.config.errorThresholdPercentage}%, ` +
        `resetTimeout=${this.config.resetTimeout}ms, ` +
        `volumeThreshold=${this.config.volumeThreshold}`,
    );
  }

  /**
   * Load configuration from environment or use defaults
   */
  private loadConfig(): CircuitBreakerConfig {
    return {
      timeout: this.configService.get<number>(
        'XERO_CIRCUIT_BREAKER_TIMEOUT',
        DEFAULT_CONFIG.timeout,
      ),
      errorThresholdPercentage: this.configService.get<number>(
        'XERO_CIRCUIT_BREAKER_ERROR_THRESHOLD',
        DEFAULT_CONFIG.errorThresholdPercentage,
      ),
      resetTimeout: this.configService.get<number>(
        'XERO_CIRCUIT_BREAKER_RESET_TIMEOUT',
        DEFAULT_CONFIG.resetTimeout,
      ),
      volumeThreshold: this.configService.get<number>(
        'XERO_CIRCUIT_BREAKER_VOLUME_THRESHOLD',
        DEFAULT_CONFIG.volumeThreshold,
      ),
    };
  }

  /**
   * Execute an action with circuit breaker protection
   *
   * @param action - Async function to execute (Xero API call)
   * @param fallback - Optional fallback function when circuit is open
   * @returns Result of action or fallback
   */
  async execute<T>(
    action: () => Promise<T>,
    fallback?: () => Promise<T>,
  ): Promise<T> {
    if (this.currentState === 'OPEN') {
      // Circuit is open - fail fast via fallback or rejection
      if (fallback) {
        this.fallbacks++;
        return fallback();
      }
      this.rejects++;
      throw new CircuitBreakerOpenError(
        'Circuit breaker is open - Xero API unavailable',
      );
    }

    // A CLOSED-state call is normal traffic; a HALF_OPEN-state call is the
    // trial request that decides whether the circuit re-closes or re-opens.
    const wasHalfOpen = this.currentState === 'HALF_OPEN';

    try {
      const result = await this.runWithTimeout(action);
      this.onActionSuccess(wasHalfOpen);
      return result;
    } catch (error) {
      this.onActionFailure(wasHalfOpen);
      if (fallback) {
        this.fallbacks++;
        return fallback();
      }
      throw error;
    }
  }

  /**
   * Race the action against the configured timeout so a hung Xero call
   * still counts as a failure instead of blocking indefinitely.
   */
  private async runWithTimeout<T>(action: () => Promise<T>): Promise<T> {
    if (!this.config.timeout || this.config.timeout <= 0) {
      return action();
    }

    let timer: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.timeouts++;
        reject(
          new Error(`Xero API call timed out after ${this.config.timeout}ms`),
        );
      }, this.config.timeout);
    });

    try {
      return await Promise.race([action(), timeoutPromise]);
    } finally {
      clearTimeout(timer!);
    }
  }

  /**
   * Record a successful action and, if it was the HALF_OPEN trial request,
   * close the circuit.
   */
  private onActionSuccess(wasHalfOpen: boolean): void {
    this.successes++;
    this.logger.debug('Circuit breaker: success');

    if (wasHalfOpen) {
      this.closeCircuit('Service recovered');
    }
  }

  /**
   * Record a failed action. If it was the HALF_OPEN trial request, re-open
   * the circuit immediately with a fresh recovery timer; otherwise check
   * whether the CLOSED-state error threshold has been exceeded.
   */
  private onActionFailure(wasHalfOpen: boolean): void {
    this.failures++;
    this.logger.warn('Circuit breaker: failure');

    if (wasHalfOpen) {
      this.openCircuit('Half-open trial request failed');
      return;
    }

    this.checkErrorThreshold();
  }

  /**
   * Check if error threshold is exceeded and open circuit if needed
   */
  private checkErrorThreshold(): void {
    const total = this.successes + this.failures;
    if (total < this.config.volumeThreshold) {
      return;
    }

    const errorPercentage = (this.failures / total) * 100;
    if (
      errorPercentage >= this.config.errorThresholdPercentage &&
      this.currentState !== 'OPEN'
    ) {
      this.openCircuit(
        `Error percentage ${errorPercentage.toFixed(1)}% exceeded threshold ${this.config.errorThresholdPercentage}%`,
      );
    }
  }

  /**
   * Transition to OPEN and schedule the OPEN -> HALF_OPEN recovery timer.
   */
  private openCircuit(reason: string): void {
    const previousState = this.currentState;
    this.currentState = 'OPEN';
    this.lastOpenedAt = new Date();

    this.logger.error(
      `Circuit breaker OPENED - ${reason}. Will retry after ${this.config.resetTimeout}ms`,
    );

    this.notifyStateChange({
      previousState,
      currentState: 'OPEN',
      timestamp: this.lastOpenedAt,
      reason,
    });

    this.scheduleHalfOpenTransition();
  }

  /**
   * Schedule the transition from OPEN to HALF_OPEN once the reset timeout
   * elapses. Any previously scheduled timer is cleared first so re-opening
   * from a HALF_OPEN failure always gets a fresh window.
   */
  private scheduleHalfOpenTransition(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }

    this.resetTimer = setTimeout(() => {
      this.resetTimer = null;
      if (this.currentState === 'OPEN') {
        const previousState = this.currentState;
        this.currentState = 'HALF_OPEN';

        this.logger.log(
          'Circuit breaker HALF_OPEN - Testing Xero API availability',
        );

        this.notifyStateChange({
          previousState,
          currentState: 'HALF_OPEN',
          timestamp: new Date(),
          reason: 'Reset timeout elapsed',
        });
      }
    }, this.config.resetTimeout);

    // Don't let the recovery timer keep the process alive on its own
    this.resetTimer.unref?.();
  }

  /**
   * Transition to CLOSED, clearing any pending recovery timer and resetting
   * the failure/success counters so a stale error history from before the
   * outage doesn't immediately re-trip the breaker.
   */
  private closeCircuit(reason: string): void {
    const previousState = this.currentState;
    this.currentState = 'CLOSED';
    this.successes = 0;
    this.failures = 0;
    this.lastClosedAt = new Date();

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.logger.log(`Circuit breaker CLOSED - ${reason}`);

    this.notifyStateChange({
      previousState,
      currentState: 'CLOSED',
      timestamp: this.lastClosedAt,
      reason,
    });
  }

  /**
   * Notify state change callbacks
   */
  private notifyStateChange(event: StateChangeEvent): void {
    for (const callback of this.stateChangeCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error(
          `State change callback error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    this.eventEmitter.emit('stateChange', event);
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitBreakerState {
    return this.currentState;
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    const total = this.successes + this.failures;
    const errorPercentage = total > 0 ? (this.failures / total) * 100 : 0;

    return {
      successes: this.successes,
      failures: this.failures,
      rejects: this.rejects,
      fallbacks: this.fallbacks,
      timeouts: this.timeouts,
      state: this.currentState,
      errorPercentage,
      lastOpenedAt: this.lastOpenedAt,
      lastClosedAt: this.lastClosedAt,
    };
  }

  /**
   * Register a callback for state changes
   */
  onStateChange(callback: (event: StateChangeEvent) => void): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Get configuration
   */
  getConfig(): CircuitBreakerConfig {
    return { ...this.config };
  }

  /**
   * Check if circuit is open (requests will be rejected)
   */
  isOpen(): boolean {
    return this.currentState === 'OPEN';
  }

  /**
   * Check if circuit is closed (normal operation)
   */
  isClosed(): boolean {
    return this.currentState === 'CLOSED';
  }

  /**
   * Manually reset the circuit breaker (for testing or recovery)
   */
  reset(): void {
    const previousState = this.currentState;
    this.currentState = 'CLOSED';
    this.successes = 0;
    this.failures = 0;
    this.rejects = 0;
    this.fallbacks = 0;
    this.timeouts = 0;
    this.lastClosedAt = new Date();

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }

    this.logger.log('Circuit breaker manually reset');

    this.notifyStateChange({
      previousState,
      currentState: 'CLOSED',
      timestamp: this.lastClosedAt,
      reason: 'Manual reset',
    });
  }

  /**
   * Cleanup on module destroy
   */
  onModuleDestroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
    this.eventEmitter.removeAllListeners();
    this.stateChangeCallbacks.length = 0;
    this.logger.log('XeroCircuitBreaker shutdown');
  }
}

/**
 * Error thrown when circuit breaker is open
 */
export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

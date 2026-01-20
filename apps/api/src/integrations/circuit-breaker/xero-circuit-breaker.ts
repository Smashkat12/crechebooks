/**
 * XeroCircuitBreaker
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * Implements circuit breaker pattern using opossum to prevent cascade failures
 * during Xero API outages. Wraps all Xero API calls to provide fault tolerance.
 *
 * Circuit States:
 * - CLOSED: Normal operation, requests flow through
 * - OPEN: Circuit tripped, requests fail fast
 * - HALF_OPEN: Testing if service recovered
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import CircuitBreaker from 'opossum';
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

  // Generic circuit breaker for Xero operations
  private breaker: CircuitBreaker<unknown[], unknown>;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
    this.initializeBreaker();
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
   * Initialize the opossum circuit breaker
   */
  private initializeBreaker(): void {
    // Create a generic action function that will be replaced per-call
    // eslint-disable-next-line @typescript-eslint/require-await
    const action = async (..._args: unknown[]): Promise<unknown> => {
      // This will be overridden by execute()
      throw new Error('Action not provided');
    };

    this.breaker = new CircuitBreaker(action, {
      timeout: this.config.timeout,
      errorThresholdPercentage: this.config.errorThresholdPercentage,
      resetTimeout: this.config.resetTimeout,
      volumeThreshold: this.config.volumeThreshold,
      name: 'xero-api',
    });

    // Wire up event handlers
    this.setupEventHandlers();

    this.logger.log(
      `XeroCircuitBreaker initialized with config: timeout=${this.config.timeout}ms, ` +
        `errorThreshold=${this.config.errorThresholdPercentage}%, ` +
        `resetTimeout=${this.config.resetTimeout}ms, ` +
        `volumeThreshold=${this.config.volumeThreshold}`,
    );
  }

  /**
   * Set up event handlers for circuit breaker events
   */
  private setupEventHandlers(): void {
    this.breaker.on('success', () => {
      this.successes++;
      this.logger.debug('Circuit breaker: success');
    });

    this.breaker.on('failure', (error) => {
      this.failures++;
      this.logger.warn(
        `Circuit breaker: failure - ${error?.message || 'Unknown error'}`,
      );
    });

    this.breaker.on('timeout', () => {
      this.timeouts++;
      this.logger.warn('Circuit breaker: timeout');
    });

    this.breaker.on('reject', () => {
      this.rejects++;
      this.logger.warn('Circuit breaker: rejected (circuit open)');
    });

    this.breaker.on('fallback', () => {
      this.fallbacks++;
      this.logger.debug('Circuit breaker: fallback executed');
    });

    this.breaker.on('open', () => {
      const previousState = this.currentState;
      this.currentState = 'OPEN';
      this.lastOpenedAt = new Date();

      this.logger.error(
        `Circuit breaker OPENED - Xero API may be experiencing issues. ` +
          `Will retry after ${this.config.resetTimeout}ms`,
      );

      this.notifyStateChange({
        previousState,
        currentState: 'OPEN',
        timestamp: this.lastOpenedAt,
        reason: 'Error threshold exceeded',
      });
    });

    this.breaker.on('close', () => {
      const previousState = this.currentState;
      this.currentState = 'CLOSED';
      this.lastClosedAt = new Date();

      this.logger.log('Circuit breaker CLOSED - Xero API recovered');

      this.notifyStateChange({
        previousState,
        currentState: 'CLOSED',
        timestamp: this.lastClosedAt,
        reason: 'Service recovered',
      });
    });

    this.breaker.on('halfOpen', () => {
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
    });
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
    // Create a new circuit breaker instance for this specific action
    const breaker = new CircuitBreaker(action, {
      timeout: this.config.timeout,
      errorThresholdPercentage: this.config.errorThresholdPercentage,
      resetTimeout: this.config.resetTimeout,
      volumeThreshold: this.config.volumeThreshold,
      name: 'xero-api-action',
    });

    // Copy state from main breaker
    if (this.currentState === 'OPEN') {
      // If main breaker is open, use fallback or throw
      if (fallback) {
        this.fallbacks++;
        return fallback();
      }
      this.rejects++;
      throw new CircuitBreakerOpenError(
        'Circuit breaker is open - Xero API unavailable',
      );
    }

    // Wire up event handlers to main breaker metrics
    breaker.on('success', () => {
      this.successes++;
    });

    breaker.on('failure', (_error) => {
      this.failures++;
      // Check if we should open the main breaker
      this.checkErrorThreshold();
    });

    breaker.on('timeout', () => {
      this.timeouts++;
      this.failures++;
      this.checkErrorThreshold();
    });

    try {
      if (fallback) {
        // Register fallback with the breaker - opossum will track it
        breaker.fallback(fallback);
        breaker.on('fallback', () => {
          this.fallbacks++;
        });
      }

      const result = await breaker.fire();
      return result as T;
    } catch (error) {
      // If we have a fallback and the action failed, use it
      if (fallback) {
        this.fallbacks++;
        return fallback();
      }
      throw error;
    } finally {
      breaker.shutdown();
    }
  }

  /**
   * Check if error threshold is exceeded and open circuit if needed
   */
  private checkErrorThreshold(): void {
    const total = this.successes + this.failures;
    if (total >= this.config.volumeThreshold) {
      const errorPercentage = (this.failures / total) * 100;
      if (errorPercentage >= this.config.errorThresholdPercentage) {
        if (this.currentState !== 'OPEN') {
          const previousState = this.currentState;
          this.currentState = 'OPEN';
          this.lastOpenedAt = new Date();

          this.logger.error(
            `Circuit breaker OPENED - Error percentage ${errorPercentage.toFixed(1)}% ` +
              `exceeds threshold ${this.config.errorThresholdPercentage}%`,
          );

          this.notifyStateChange({
            previousState,
            currentState: 'OPEN',
            timestamp: this.lastOpenedAt,
            reason: `Error percentage ${errorPercentage.toFixed(1)}% exceeded threshold`,
          });

          // Schedule reset
          setTimeout(() => {
            if (this.currentState === 'OPEN') {
              const prevState = this.currentState;
              this.currentState = 'HALF_OPEN';
              this.notifyStateChange({
                previousState: prevState,
                currentState: 'HALF_OPEN',
                timestamp: new Date(),
                reason: 'Reset timeout elapsed',
              });
            }
          }, this.config.resetTimeout);
        }
      }
    }
  }

  /**
   * Check if an error is a circuit breaker error
   */
  private isCircuitBreakerError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('circuit') ||
        error.message.includes('Breaker is open') ||
        error.message.includes('timeout')
      );
    }
    return false;
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
    this.breaker.shutdown();
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

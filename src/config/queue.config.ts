/**
 * Bull Queue Configuration
 * TASK-TRANS-011
 *
 * Provides configuration for Bull queue used for async transaction processing.
 * Redis connection settings and default job options.
 */
import { registerAs } from '@nestjs/config';

/**
 * Queue configuration namespace
 */
export default registerAs('queue', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential' as const,
      delay: 1000,
    },
  },
}));

/**
 * Queue names used in the application
 */
export const QUEUE_NAMES = {
  /** Queue for transaction categorization jobs */
  CATEGORIZATION: 'transaction-categorization',
  /** Queue for Xero sync jobs */
  XERO_SYNC: 'xero-sync',
} as const;

/**
 * Queue configuration type
 */
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
  };
  defaultJobOptions: {
    removeOnComplete: boolean;
    removeOnFail: boolean;
    attempts: number;
    backoff: {
      type: 'exponential';
      delay: number;
    };
  };
}

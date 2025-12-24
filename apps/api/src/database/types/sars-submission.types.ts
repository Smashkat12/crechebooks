/**
 * SARS Submission Retry Types
 * TASK-SARS-018: SARS eFiling Submission Error Handling and Retry
 *
 * @module database/types
 * @description TypeScript types for SARS submission retry and error handling.
 */

/**
 * Classification of SARS API errors
 */
export enum ErrorType {
  /** Transient errors that should be retried (timeout, 503, rate limit) */
  TRANSIENT = 'TRANSIENT',
  /** Permanent errors that should not be retried (validation, 4xx) */
  PERMANENT = 'PERMANENT',
  /** Errors requiring manual intervention */
  MANUAL_INTERVENTION = 'MANUAL_INTERVENTION',
}

/**
 * Current state of a SARS submission including retry information
 */
export interface SubmissionState {
  /** Submission ID */
  submissionId: string;
  /** Current submission status */
  status: 'PENDING' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'FAILED' | 'DLQ';
  /** Number of retry attempts made */
  retryCount: number;
  /** Maximum retry attempts allowed */
  maxRetries: number;
  /** Timestamp of last retry attempt */
  lastRetryAt: Date | null;
  /** Timestamp of next scheduled retry */
  nextRetryAt: Date | null;
  /** Last error encountered */
  lastError: string | null;
  /** Error type classification */
  errorType: ErrorType | null;
  /** SARS correlation ID for tracking */
  correlationId: string | null;
  /** Flag indicating if in dead letter queue */
  inDlq: boolean;
  /** Reason for DLQ placement */
  dlqReason: string | null;
}

/**
 * Result of a submission attempt
 */
export interface SubmissionResult {
  /** Whether submission was successful */
  success: boolean;
  /** SARS reference number if successful */
  sarsReference: string | null;
  /** SARS correlation ID for tracking */
  correlationId: string | null;
  /** Error message if failed */
  errorMessage: string | null;
  /** Error type classification */
  errorType: ErrorType | null;
  /** HTTP status code from SARS API */
  statusCode: number | null;
  /** Current retry count */
  retryCount: number;
  /** Whether another retry will be attempted */
  willRetry: boolean;
  /** Timestamp of next retry if applicable */
  nextRetryAt: Date | null;
  /** Whether submission moved to DLQ */
  movedToDlq: boolean;
}

/**
 * SARS API error structure
 */
export interface SarsApiError {
  /** HTTP status code */
  statusCode: number;
  /** Error message from SARS */
  message: string;
  /** Detailed error code from SARS */
  sarsErrorCode?: string;
  /** Whether error is transient */
  isTransient?: boolean;
  /** Original error object */
  originalError?: Error;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Base delay in milliseconds for first retry */
  baseDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum delay between retries in milliseconds */
  maxDelayMs: number;
}

/**
 * Default retry configuration
 * - Max 3 retries
 * - Exponential backoff: 1min, 5min, 15min
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 60000, // 1 minute
  backoffMultiplier: 5,
  maxDelayMs: 900000, // 15 minutes
};

/**
 * HTTP status codes considered transient
 */
export const TRANSIENT_STATUS_CODES = [408, 429, 500, 502, 503, 504];

/**
 * HTTP status codes considered permanent
 */
export const PERMANENT_STATUS_CODES = [400, 401, 403, 404, 422];

/**
 * Admin notification payload for failed submissions
 */
export interface AdminNotification {
  /** Submission ID that failed */
  submissionId: string;
  /** Tenant ID */
  tenantId: string;
  /** Submission type */
  submissionType: string;
  /** Tax period */
  period: string;
  /** Error message */
  errorMessage: string;
  /** Error type */
  errorType: ErrorType;
  /** Number of retries attempted */
  retryCount: number;
  /** Whether submission is in DLQ */
  inDlq: boolean;
  /** Correlation ID for tracking */
  correlationId: string | null;
  /** Timestamp of failure */
  failedAt: Date;
}

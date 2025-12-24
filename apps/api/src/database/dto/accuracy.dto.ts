/**
 * Accuracy Metrics DTOs
 * TASK-TRANS-017: Transaction Categorization Accuracy Tracking
 *
 * Data transfer objects for accuracy tracking and reporting.
 */

/**
 * Options for accuracy calculation
 */
export interface AccuracyOptions {
  /** Period start date (default: 30 days ago) */
  fromDate?: Date;
  /** Period end date (default: now) */
  toDate?: Date;
  /** Rolling window in days (default: 30) */
  rollingDays?: number;
}

/**
 * Accuracy report for a period
 */
export interface AccuracyReport {
  /** Tenant ID */
  tenantId: string;
  /** Period start date */
  periodStart: Date;
  /** Period end date */
  periodEnd: Date;
  /** Total transactions categorized */
  totalCategorized: number;
  /** Total transactions corrected by user */
  totalCorrected: number;
  /** Accuracy percentage (0-100) */
  accuracyPercentage: number;
  /** Average confidence score */
  averageConfidence: number;
  /** Percentage of auto-applied categorizations */
  autoApplyRate: number;
}

/**
 * Accuracy trend data point
 */
export interface AccuracyTrend {
  /** Period identifier (e.g., "2024-W01", "2024-01") */
  period: string;
  /** Accuracy percentage for this period */
  accuracyPercentage: number;
  /** Total transactions in period */
  totalTransactions: number;
}

/**
 * Result of threshold check
 */
export interface ThresholdCheckResult {
  /** Whether accuracy is above threshold */
  isAboveThreshold: boolean;
  /** Current accuracy percentage */
  currentAccuracy: number;
  /** Configured threshold percentage */
  threshold: number;
  /** Alert level if below threshold */
  alertLevel?: 'WARNING' | 'CRITICAL';
  /** Message describing the status */
  message: string;
}

/**
 * Record categorization input
 */
export interface RecordCategorizationInput {
  transactionId: string;
  confidence: number;
  isAutoApplied: boolean;
  accountCode: string;
}

/**
 * Record correction input
 */
export interface RecordCorrectionInput {
  transactionId: string;
  originalAccountCode: string;
  correctedAccountCode: string;
}

/**
 * Constants for accuracy metrics
 */
export const ACCURACY_CONSTANTS = {
  /** Default rolling window in days */
  DEFAULT_ROLLING_DAYS: 30,
  /** Warning threshold percentage */
  WARNING_THRESHOLD: 90,
  /** Critical threshold percentage */
  CRITICAL_THRESHOLD: 85,
  /** Target accuracy percentage (from REQ-TRANS-003) */
  TARGET_ACCURACY: 95,
} as const;

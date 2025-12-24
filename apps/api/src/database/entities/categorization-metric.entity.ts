/**
 * Categorization Metric Entity
 * TASK-TRANS-017: Transaction Categorization Accuracy Tracking
 *
 * Tracks categorization events for accuracy measurement.
 */

/**
 * Type of categorization metric event
 */
export enum MetricEventType {
  CATEGORIZED = 'CATEGORIZED',
  CORRECTED = 'CORRECTED',
}

/**
 * Categorization metric record
 */
export interface CategorizationMetric {
  id: string;
  tenantId: string;
  transactionId: string;
  date: Date;
  eventType: MetricEventType;
  confidence: number;
  isAutoApplied: boolean;
  originalAccountCode?: string;
  correctedAccountCode?: string;
  createdAt: Date;
}

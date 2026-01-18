/**
 * SimplePay Webhook DTO
 * TASK-SPAY-009: SimplePay Webhook Handler
 *
 * @description Types for SimplePay webhook payloads
 */

/**
 * SimplePay webhook event types
 */
export type SimplePayWebhookEventType =
  | 'payrun.completed'
  | 'payslip.created'
  | 'employee.updated'
  | 'employee.terminated';

/**
 * SimplePay webhook payload structure
 * Based on SimplePay webhook documentation
 */
export interface SimplePayWebhookPayload {
  /** Event type identifier */
  event: SimplePayWebhookEventType;

  /** Unique delivery ID for idempotency checking */
  delivery_id: string;

  /** ISO timestamp of when the event was generated */
  timestamp: string;

  /** SimplePay client ID */
  client_id: string;

  /** Event-specific data payload */
  data: Record<string, unknown>;
}

/**
 * Pay run completed event data
 */
export interface PayRunCompletedData {
  payrun_id: string;
  wave_id: number;
  wave_name: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  employee_count: number;
  status: string;
  totals: {
    gross: number;
    net: number;
    paye: number;
    uif_employee: number;
    uif_employer: number;
    sdl: number;
  };
}

/**
 * Payslip created event data
 */
export interface PayslipCreatedData {
  payslip_id: string;
  employee_id: string;
  payrun_id: string;
  period_start: string;
  period_end: string;
  gross: number;
  net: number;
  paye: number;
  uif_employee: number;
  uif_employer: number;
}

/**
 * Employee updated event data
 */
export interface EmployeeUpdatedData {
  employee_id: string;
  fields_changed: string[];
  previous_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
}

/**
 * Employee terminated event data
 */
export interface EmployeeTerminatedData {
  employee_id: string;
  termination_date: string;
  termination_code?: string;
  termination_reason?: string;
  final_payslip_id?: string;
  leave_payout?: number;
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  received: boolean;
  webhookLogId?: string;
  processed?: boolean;
  error?: string;
}

/**
 * Webhook log entity interface
 */
export interface IWebhookLog {
  id: string;
  tenantId: string | null;
  source: string;
  eventType: string;
  deliveryId: string | null;
  payload: Record<string, unknown>;
  processed: boolean;
  processedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

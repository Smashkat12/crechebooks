/**
 * Dashboard WebSocket Event Types
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 *
 * Defines all event types and payloads for dashboard real-time updates.
 */

/**
 * Dashboard event types
 */
export enum DashboardEventType {
  /** Fired when a payment is allocated to an invoice */
  PAYMENT_RECEIVED = 'payment_received',
  /** Fired when an invoice status transitions */
  INVOICE_STATUS_CHANGED = 'invoice_status_changed',
  /** Fired when arrears threshold is crossed */
  ARREARS_ALERT = 'arrears_alert',
  /** Fired periodically with updated dashboard metrics */
  METRICS_UPDATED = 'metrics_updated',
  /** Connection heartbeat */
  HEARTBEAT = 'heartbeat',
  /** Connection established confirmation */
  CONNECTED = 'connected',
  /** Fired when a new child is enrolled */
  ENROLLMENT_COMPLETED = 'enrollment_completed',
  /** Fired when a notification is created */
  NOTIFICATION_CREATED = 'notification_created',
  /** Error event */
  ERROR = 'error',
}

/**
 * Base dashboard event interface
 */
export interface DashboardEvent<T = unknown> {
  type: DashboardEventType;
  timestamp: string;
  tenantId: string;
  data: T;
}

/**
 * Payment received event data
 */
export interface PaymentReceivedData {
  paymentId: string;
  amount: number;
  parentName: string;
  childName: string;
  invoiceNumber: string;
  method?: string;
}

/**
 * Invoice status changed event data
 */
export interface InvoiceStatusChangedData {
  invoiceId: string;
  invoiceNumber: string;
  previousStatus: string;
  newStatus: string;
  parentName?: string;
  amount?: number;
}

/**
 * Arrears alert event data
 */
export interface ArrearsAlertData {
  parentId: string;
  parentName: string;
  totalArrears: number;
  daysOverdue: number;
  severity: 'warning' | 'critical';
}

/**
 * Metrics updated event data (partial dashboard metrics)
 */
export interface MetricsUpdatedData {
  revenue?: {
    total?: number;
    collected?: number;
    outstanding?: number;
  };
  arrears?: {
    total?: number;
    count?: number;
  };
  payments?: {
    matched?: number;
    unmatched?: number;
  };
}

/**
 * Enrollment completed event data
 */
export interface EnrollmentCompletedData {
  enrollmentId: string;
  childName: string;
  parentName: string;
  feeStructureName: string;
  source: 'admin_api' | 'whatsapp_onboarding';
}

/**
 * Connection confirmation data
 */
export interface ConnectedData {
  clientId: string;
  room: string;
  serverTime: string;
}

/**
 * Error event data
 */
export interface ErrorData {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Notification created event data
 */
export interface NotificationCreatedData {
  notificationId: string;
  type: string; // NotificationType value
  priority: string;
  title: string;
  recipientType: string;
  recipientId: string;
}

/**
 * Typed event creators for type-safe event emission
 */
export function createPaymentReceivedEvent(
  tenantId: string,
  data: PaymentReceivedData,
): DashboardEvent<PaymentReceivedData> {
  return {
    type: DashboardEventType.PAYMENT_RECEIVED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createInvoiceStatusChangedEvent(
  tenantId: string,
  data: InvoiceStatusChangedData,
): DashboardEvent<InvoiceStatusChangedData> {
  return {
    type: DashboardEventType.INVOICE_STATUS_CHANGED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createArrearsAlertEvent(
  tenantId: string,
  data: ArrearsAlertData,
): DashboardEvent<ArrearsAlertData> {
  return {
    type: DashboardEventType.ARREARS_ALERT,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createMetricsUpdatedEvent(
  tenantId: string,
  data: MetricsUpdatedData,
): DashboardEvent<MetricsUpdatedData> {
  return {
    type: DashboardEventType.METRICS_UPDATED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createEnrollmentCompletedEvent(
  tenantId: string,
  data: EnrollmentCompletedData,
): DashboardEvent<EnrollmentCompletedData> {
  return {
    type: DashboardEventType.ENROLLMENT_COMPLETED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createConnectedEvent(
  tenantId: string,
  data: ConnectedData,
): DashboardEvent<ConnectedData> {
  return {
    type: DashboardEventType.CONNECTED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createNotificationCreatedEvent(
  tenantId: string,
  data: NotificationCreatedData,
): DashboardEvent<NotificationCreatedData> {
  return {
    type: DashboardEventType.NOTIFICATION_CREATED,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

export function createErrorEvent(
  tenantId: string,
  data: ErrorData,
): DashboardEvent<ErrorData> {
  return {
    type: DashboardEventType.ERROR,
    timestamp: new Date().toISOString(),
    tenantId,
    data,
  };
}

/**
 * Room name helper for tenant isolation
 */
export function getTenantRoom(tenantId: string): string {
  return `tenant:${tenantId}`;
}

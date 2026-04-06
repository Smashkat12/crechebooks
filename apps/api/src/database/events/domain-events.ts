/**
 * Domain event interfaces for the in-app notification system.
 * Each interface maps to an event emitted via @nestjs/event-emitter.
 */

export interface PaymentAllocatedEvent {
  tenantId: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  amountCents: number;
  parentId: string;
  parentName: string;
  childName: string;
}

export interface InvoiceBatchCompletedEvent {
  tenantId: string;
  billingMonth: string;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  totalEnrollments: number;
}

export interface InvoiceSentEvent {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  parentId: string;
  parentName: string;
  amountCents: number;
}

export interface InvoiceDeliveryFailedEvent {
  tenantId: string;
  invoiceId: string;
  invoiceNumber: string;
  parentName: string;
  channel: string;
  error: string;
}

export interface ArrearsThresholdEvent {
  tenantId: string;
  parentId: string;
  parentName: string;
  totalArrearsCents: number;
  daysOverdue: number;
  escalationLevel: 'NEW' | '30_DAYS' | '60_DAYS' | '90_DAYS';
}

export interface SarsDeadlineEvent {
  tenantId: string;
  returnType: string;
  dueDate: Date;
  daysRemaining: number;
}

export interface ReconciliationCompletedEvent {
  tenantId: string;
  period: string;
  matchedCount: number;
  unmatchedCount: number;
  discrepancyCount: number;
}

export interface StaffLeaveRequestedEvent {
  tenantId: string;
  staffId: string;
  staffName: string;
  leaveType: string;
  startDate: Date;
  endDate: Date;
  days: number;
}

export interface StaffLeaveDecisionEvent {
  tenantId: string;
  staffId: string;
  staffName: string;
  decision: 'APPROVED' | 'REJECTED';
  leaveType: string;
  startDate: Date;
  endDate: Date;
}

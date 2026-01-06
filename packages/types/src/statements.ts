// TASK-STMT-001: Statement Entity and Data Model (Phase 12)
// Statement types for CrecheBooks

/**
 * Statement status enum - tracks the lifecycle of a statement
 */
export enum StatementStatus {
  DRAFT = 'DRAFT',
  FINAL = 'FINAL',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

/**
 * Statement line type enum - categorizes different transaction types on a statement
 */
export enum StatementLineType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  ADJUSTMENT = 'ADJUSTMENT',
  CLOSING_BALANCE = 'CLOSING_BALANCE',
}

/**
 * Statement line interface - represents a single line item on a statement
 */
export interface IStatementLine {
  id: string;
  statementId: string;
  date: Date;
  description: string;
  lineType: StatementLineType;
  referenceNumber?: string;
  referenceId?: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
  sortOrder: number;
  createdAt: Date;
}

/**
 * Statement interface - represents a parent account statement for a period
 */
export interface IStatement {
  id: string;
  tenantId: string;
  parentId: string;
  statementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents: number;
  totalChargesCents: number;
  totalPaymentsCents: number;
  totalCreditsCents: number;
  closingBalanceCents: number;
  status: StatementStatus;
  generatedAt: Date;
  deliveryStatus?: string;
  deliveredAt?: Date;
  deliveryChannel?: string;
  createdAt: Date;
  updatedAt: Date;
  lines?: IStatementLine[];
}

/**
 * DTO for creating a new statement
 */
export interface ICreateStatementDto {
  tenantId: string;
  parentId: string;
  statementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents?: number;
  totalChargesCents?: number;
  totalPaymentsCents?: number;
  totalCreditsCents?: number;
  closingBalanceCents?: number;
  status?: StatementStatus;
}

/**
 * DTO for updating an existing statement
 */
export interface IUpdateStatementDto {
  status?: StatementStatus;
  deliveryStatus?: string;
  deliveredAt?: Date;
  deliveryChannel?: string;
  openingBalanceCents?: number;
  totalChargesCents?: number;
  totalPaymentsCents?: number;
  totalCreditsCents?: number;
  closingBalanceCents?: number;
}

/**
 * DTO for creating a statement line
 */
export interface ICreateStatementLineDto {
  statementId: string;
  date: Date;
  description: string;
  lineType: StatementLineType;
  referenceNumber?: string;
  referenceId?: string;
  debitCents?: number;
  creditCents?: number;
  balanceCents?: number;
  sortOrder?: number;
}

/**
 * Filter options for querying statements
 */
export interface IStatementFilterDto {
  parentId?: string;
  status?: StatementStatus;
  periodStart?: Date;
  periodEnd?: Date;
}

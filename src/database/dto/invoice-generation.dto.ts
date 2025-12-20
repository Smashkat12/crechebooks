/**
 * Invoice Generation Service DTOs
 * TASK-BILL-012: Invoice Generation Service
 *
 * @module database/dto/invoice-generation
 * @description DTOs for invoice generation operations.
 * All monetary values are in cents (integers).
 */

import {
  IsUUID,
  IsString,
  IsOptional,
  IsDate,
  IsArray,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Decimal } from 'decimal.js';
import { LineType } from '../entities/invoice-line.entity';
import { InvoiceStatus } from '../entities/invoice.entity';

/**
 * DTO for generating monthly invoices
 */
export class GenerateMonthlyInvoicesDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Matches(/^\d{4}-\d{2}$/, {
    message: 'billingMonth must be in format YYYY-MM',
  })
  billingMonth!: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  childIds?: string[];
}

/**
 * DTO for creating a single invoice
 */
export class CreateSingleInvoiceDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  enrollmentId!: string;

  @Type(() => Date)
  @IsDate()
  billingPeriodStart!: Date;

  @Type(() => Date)
  @IsDate()
  billingPeriodEnd!: Date;
}

/**
 * Line item for invoice generation
 * Uses Decimal for precision calculations
 */
export interface LineItemInput {
  description: string;
  quantity: Decimal;
  unitPriceCents: number;
  discountCents: number;
  lineType: LineType;
  accountCode?: string;
}

/**
 * Result of adding line items to invoice
 */
export interface LineItemResult {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  lineType: LineType;
  accountCode: string | null;
  sortOrder: number;
}

/**
 * Individual invoice in generation result
 */
export interface GeneratedInvoiceInfo {
  id: string;
  invoiceNumber: string;
  childId: string;
  childName: string;
  parentId: string;
  totalCents: number;
  status: InvoiceStatus;
  xeroInvoiceId: string | null;
}

/**
 * Error during invoice generation
 */
export interface InvoiceGenerationError {
  childId: string;
  enrollmentId?: string;
  error: string;
  code: string;
}

/**
 * Result of batch invoice generation
 */
export interface InvoiceGenerationResult {
  invoicesCreated: number;
  totalAmountCents: number;
  invoices: GeneratedInvoiceInfo[];
  errors: InvoiceGenerationError[];
}

/**
 * Enrollment with relations for invoice generation
 */
export interface EnrollmentWithRelations {
  id: string;
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents: number | null;
  child: {
    id: string;
    parentId: string;
    firstName: string;
    lastName: string;
  };
  feeStructure: {
    id: string;
    name: string;
    amountCents: number;
    vatInclusive: boolean;
  };
}

/**
 * Xero invoice line item format
 */
export interface XeroLineItem {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: 'OUTPUT' | 'NONE';
}

/**
 * Result from Xero invoice creation
 */
export interface XeroInvoiceResult {
  invoiceId: string;
  status: string;
}

/**
 * Invoice sync status
 */
export enum InvoiceSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

/**
 * Xero Invoice DTOs
 * TASK-XERO-009: Bidirectional Invoice Sync with Xero
 *
 * Data transfer objects for Xero invoice sync operations.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Xero uses decimal Rand amounts, we convert on sync.
 *
 * KEY MAPPINGS:
 * - Invoice.totalAmountCents / 100 = Xero Amount (Rands)
 * - Invoice.status -> Xero Status (DRAFT/AUTHORISED/PAID)
 * - Parent -> Xero Contact (via email lookup)
 */

import {
  IsString,
  IsNumber,
  IsBoolean,
  IsArray,
  ValidateNested,
  IsOptional,
  IsDateString,
  Min,
  MinLength,
  IsEnum,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Sync direction for invoice operations
 */
export enum InvoiceSyncDirection {
  PUSH = 'PUSH',
  PULL = 'PULL',
  BIDIRECTIONAL = 'BIDIRECTIONAL',
}

/**
 * Sync status for invoice mapping
 */
export enum InvoiceSyncStatus {
  SYNCED = 'SYNCED',
  PENDING = 'PENDING',
  FAILED = 'FAILED',
  OUT_OF_SYNC = 'OUT_OF_SYNC',
}

/**
 * DTO for a single invoice line item
 */
export class XeroInvoiceLineDto {
  @ApiProperty({
    description: 'Line item description',
    example: 'Monthly childcare fee - January 2024',
  })
  @IsString()
  @MinLength(1)
  description: string;

  @ApiProperty({
    description: 'Quantity (defaults to 1)',
    example: 1,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiProperty({
    description: 'Unit price in cents',
    example: 350000,
    minimum: 0,
  })
  @IsNumber()
  @Min(0)
  unitPriceCents: number;

  @ApiPropertyOptional({
    description: 'Discount amount in cents',
    example: 0,
  })
  @IsNumber()
  @IsOptional()
  discountCents?: number;

  @ApiPropertyOptional({
    description: 'Xero account code for the line item',
    example: '200',
  })
  @IsString()
  @IsOptional()
  accountCode?: string;

  @ApiPropertyOptional({
    description: 'Tax type code (e.g., "NONE", "OUTPUT")',
    example: 'NONE',
  })
  @IsString()
  @IsOptional()
  taxType?: string;
}

/**
 * DTO for pushing an invoice to Xero
 */
export class PushInvoiceDto {
  @ApiProperty({
    description: 'CrecheBooks invoice ID to push to Xero',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  invoiceId: string;

  @ApiPropertyOptional({
    description: 'Force push even if invoice is already synced',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * DTO for pulling invoices from Xero
 */
export class PullInvoicesDto {
  @ApiPropertyOptional({
    description: 'Pull invoices modified since this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  since?: string;

  @ApiPropertyOptional({
    description: 'Maximum number of invoices to pull',
    example: 100,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Page number for pagination (starts at 1)',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({
    description: 'Filter by Xero invoice status',
    example: 'AUTHORISED',
  })
  @IsString()
  @IsOptional()
  status?: string;
}

/**
 * DTO for bulk push operation
 */
export class BulkPushInvoicesDto {
  @ApiPropertyOptional({
    description:
      'Array of invoice IDs to push. If empty, pushes all unsynced invoices.',
    type: [String],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  @IsOptional()
  invoiceIds?: string[];

  @ApiPropertyOptional({
    description: 'Force push even if invoices are already synced',
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  force?: boolean;
}

/**
 * Xero invoice structure (subset of Xero API response)
 */
export interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Type: 'ACCREC' | 'ACCPAY';
  Status: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED' | 'DELETED';
  Contact: {
    ContactID: string;
    Name: string;
    EmailAddress?: string;
  };
  Date: string;
  DueDate: string;
  LineItems: Array<{
    Description: string;
    Quantity: number;
    UnitAmount: number;
    AccountCode?: string;
    TaxType?: string;
    LineAmount: number;
  }>;
  SubTotal: number;
  TotalTax: number;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  Reference?: string;
  UpdatedDateUTC?: string;
}

/**
 * Response DTO for a pushed invoice
 */
export class PushInvoiceResponseDto {
  @ApiProperty({
    description: 'CrecheBooks invoice ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  invoiceId: string;

  @ApiProperty({
    description: 'Xero Invoice ID',
    example: 'x1y2z3-a4b5-c6d7-e8f9-0123456789ab',
  })
  xeroInvoiceId: string;

  @ApiPropertyOptional({
    description: 'Xero Invoice Number',
    example: 'INV-0001',
  })
  xeroInvoiceNumber?: string;

  @ApiProperty({
    description: 'Xero invoice status',
    example: 'AUTHORISED',
  })
  xeroStatus: string;

  @ApiProperty({
    description: 'Sync direction',
    enum: InvoiceSyncDirection,
    example: 'PUSH',
  })
  syncDirection: InvoiceSyncDirection;

  @ApiProperty({
    description: 'Timestamp of sync',
    example: '2024-01-15T10:30:00.000Z',
  })
  syncedAt: Date;
}

/**
 * Response DTO for pulled invoice
 */
export class PullInvoiceResponseDto {
  @ApiProperty({
    description: 'Xero Invoice ID',
    example: 'x1y2z3-a4b5-c6d7-e8f9-0123456789ab',
  })
  xeroInvoiceId: string;

  @ApiPropertyOptional({
    description: 'CrecheBooks invoice ID (if matched)',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  invoiceId?: string;

  @ApiProperty({
    description: 'Xero Invoice Number',
    example: 'INV-0001',
  })
  xeroInvoiceNumber: string;

  @ApiProperty({
    description: 'Contact name from Xero',
    example: 'John Smith',
  })
  contactName: string;

  @ApiPropertyOptional({
    description: 'Contact email from Xero',
    example: 'john.smith@email.com',
  })
  contactEmail?: string;

  @ApiProperty({
    description: 'Invoice date',
    example: '2024-01-15',
  })
  date: string;

  @ApiProperty({
    description: 'Due date',
    example: '2024-01-22',
  })
  dueDate: string;

  @ApiProperty({
    description: 'Total amount in cents',
    example: 350000,
  })
  totalCents: number;

  @ApiProperty({
    description: 'Amount paid in cents',
    example: 0,
  })
  amountPaidCents: number;

  @ApiProperty({
    description: 'Xero status',
    example: 'AUTHORISED',
  })
  status: string;

  @ApiProperty({
    description: 'Whether this invoice was imported into CrecheBooks',
    example: true,
  })
  imported: boolean;

  @ApiPropertyOptional({
    description: 'Reason if not imported',
    example: 'Contact email not found in CrecheBooks',
  })
  importReason?: string;
}

/**
 * Response DTO for bulk push operation
 */
export class BulkPushResponseDto {
  @ApiProperty({
    description: 'Number of invoices successfully pushed',
    example: 5,
  })
  pushed: number;

  @ApiProperty({
    description: 'Number of invoices that failed',
    example: 0,
  })
  failed: number;

  @ApiProperty({
    description: 'Number of invoices skipped (already synced)',
    example: 2,
  })
  skipped: number;

  @ApiProperty({
    description: 'Successfully pushed invoices',
    type: [PushInvoiceResponseDto],
  })
  results: PushInvoiceResponseDto[];

  @ApiProperty({
    description: 'Errors for failed invoices',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string' },
        error: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  errors: Array<{
    invoiceId: string;
    error: string;
    code: string;
  }>;
}

/**
 * Response DTO for pull operation
 */
export class PullInvoicesResponseDto {
  @ApiProperty({
    description: 'Total invoices found in Xero',
    example: 25,
  })
  totalFound: number;

  @ApiProperty({
    description: 'Number of invoices imported',
    example: 10,
  })
  imported: number;

  @ApiProperty({
    description: 'Number of existing invoices updated',
    example: 5,
  })
  updated: number;

  @ApiProperty({
    description: 'Number of invoices skipped',
    example: 10,
  })
  skipped: number;

  @ApiProperty({
    description: 'Invoice details',
    type: [PullInvoiceResponseDto],
  })
  invoices: PullInvoiceResponseDto[];

  @ApiProperty({
    description: 'Errors encountered during pull',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        xeroInvoiceId: { type: 'string' },
        error: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  errors: Array<{
    xeroInvoiceId: string;
    error: string;
    code: string;
  }>;
}

/**
 * DTO for invoice sync mapping record
 */
export class InvoiceMappingDto {
  @ApiProperty({
    description: 'Mapping record ID',
  })
  id: string;

  @ApiProperty({
    description: 'CrecheBooks invoice ID',
  })
  invoiceId: string;

  @ApiProperty({
    description: 'Xero Invoice ID',
  })
  xeroInvoiceId: string;

  @ApiPropertyOptional({
    description: 'Xero Invoice Number',
  })
  xeroInvoiceNumber?: string;

  @ApiProperty({
    description: 'Last synced timestamp',
  })
  lastSyncedAt: Date;

  @ApiProperty({
    description: 'Sync direction',
    enum: InvoiceSyncDirection,
  })
  syncDirection: InvoiceSyncDirection;

  @ApiProperty({
    description: 'Sync status',
    enum: InvoiceSyncStatus,
  })
  syncStatus: InvoiceSyncStatus;

  @ApiPropertyOptional({
    description: 'Error message if sync failed',
  })
  syncErrorMessage?: string;
}

/**
 * Status mapping between CrecheBooks and Xero
 */
export const INVOICE_STATUS_MAP = {
  // CrecheBooks -> Xero
  toXero: {
    DRAFT: 'DRAFT',
    SENT: 'AUTHORISED',
    VIEWED: 'AUTHORISED',
    PARTIALLY_PAID: 'AUTHORISED',
    PAID: 'PAID',
    OVERDUE: 'AUTHORISED',
    VOID: 'VOIDED',
  } as const,
  // Xero -> CrecheBooks
  fromXero: {
    DRAFT: 'DRAFT',
    SUBMITTED: 'SENT',
    AUTHORISED: 'SENT',
    PAID: 'PAID',
    VOIDED: 'VOID',
    DELETED: 'VOID',
  } as const,
};

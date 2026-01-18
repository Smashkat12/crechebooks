/**
 * Xero Payment DTOs
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * Data transfer objects for Xero payment sync operations.
 * Handles bi-directional payment sync between CrecheBooks and Xero.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * Conversion: cents / 100 = Rands
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsNumber,
  IsOptional,
  IsDateString,
  IsEnum,
  Min,
} from 'class-validator';

/**
 * Sync direction enum for payments
 */
export type PaymentSyncDirection = 'push' | 'pull';

/**
 * DTO for a Xero payment
 */
export class XeroPaymentDto {
  @ApiProperty({
    description: 'Xero Payment ID (UUID)',
    example: 'p1a2y3m4-e5n6-7890-abcd-ef1234567890',
  })
  @IsString()
  paymentId: string;

  @ApiProperty({
    description: 'Xero Invoice ID this payment applies to',
    example: 'i1n2v3o4-i5c6-7890-abcd-ef1234567890',
  })
  @IsString()
  invoiceId: string;

  @ApiProperty({
    description: 'Payment amount in Rands (decimal)',
    example: 1500.0,
  })
  @IsNumber()
  amount: number;

  @ApiProperty({
    description: 'Payment date (ISO 8601)',
    example: '2024-01-15',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'Payment reference',
    example: 'PAY-2024-001',
  })
  @IsString()
  @IsOptional()
  reference?: string;

  @ApiPropertyOptional({
    description: 'Bank account ID in Xero',
    example: 'b1a2n3k4-a5c6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsOptional()
  bankAccountId?: string;

  @ApiPropertyOptional({
    description: 'Payment status in Xero',
    example: 'AUTHORISED',
  })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({
    description: 'Payment type',
    example: 'ACCRECPAYMENT',
  })
  @IsString()
  @IsOptional()
  paymentType?: string;
}

/**
 * Request DTO for syncing a payment to Xero
 */
export class SyncPaymentToXeroRequestDto {
  @ApiProperty({
    description: 'CrecheBooks Payment ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @IsUUID()
  paymentId: string;

  @ApiProperty({
    description: 'Xero Invoice ID to apply payment to',
    example: 'x1y2z3a4-b5c6-7890-defg-hi1234567890',
  })
  @IsString()
  xeroInvoiceId: string;

  @ApiPropertyOptional({
    description: 'Xero Bank Account ID for the payment',
    example: 'b1a2n3k4-a5c6-7890-abcd-ef1234567890',
  })
  @IsString()
  @IsOptional()
  xeroBankAccountId?: string;
}

/**
 * Response DTO for payment sync operation
 */
export class PaymentSyncResponseDto {
  @ApiProperty({
    description: 'CrecheBooks Payment ID',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  paymentId: string;

  @ApiProperty({
    description: 'Xero Payment ID',
    example: 'x1y2z3a4-b5c6-7890-defg-hi1234567890',
  })
  xeroPaymentId: string;

  @ApiProperty({
    description: 'Xero Invoice ID',
    example: 'i1n2v3o4-i5c6-7890-abcd-ef1234567890',
  })
  xeroInvoiceId: string;

  @ApiProperty({
    description: 'Payment amount in cents',
    example: 150000,
  })
  amountCents: number;

  @ApiProperty({
    description: 'Sync direction',
    enum: ['push', 'pull'],
    example: 'push',
  })
  syncDirection: PaymentSyncDirection;

  @ApiProperty({
    description: 'Timestamp of sync',
  })
  syncedAt: Date;
}

/**
 * Request DTO for pulling payments from Xero
 */
export class PullPaymentsFromXeroRequestDto {
  @ApiProperty({
    description: 'Xero Invoice ID to pull payments for',
    example: 'x1y2z3a4-b5c6-7890-defg-hi1234567890',
  })
  @IsString()
  xeroInvoiceId: string;
}

/**
 * Response DTO for bulk payment sync
 */
export class BulkPaymentSyncResponseDto {
  @ApiProperty({
    description: 'Number of payments successfully synced',
    example: 10,
  })
  synced: number;

  @ApiProperty({
    description: 'Number of payments that failed to sync',
    example: 0,
  })
  failed: number;

  @ApiProperty({
    description: 'Number of payments skipped (already synced)',
    example: 5,
  })
  skipped: number;

  @ApiProperty({
    description: 'Details of synced payments',
    type: [PaymentSyncResponseDto],
  })
  results: PaymentSyncResponseDto[];

  @ApiProperty({
    description: 'Error details for failed syncs',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        paymentId: { type: 'string' },
        error: { type: 'string' },
        code: { type: 'string' },
      },
    },
  })
  errors: Array<{
    paymentId: string;
    error: string;
    code: string;
  }>;
}

/**
 * DTO for payment mapping record
 */
export class PaymentMappingDto {
  @ApiProperty({
    description: 'Mapping ID',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant ID',
  })
  tenantId: string;

  @ApiProperty({
    description: 'CrecheBooks Payment ID',
  })
  paymentId: string;

  @ApiProperty({
    description: 'Xero Payment ID',
  })
  xeroPaymentId: string;

  @ApiProperty({
    description: 'Xero Invoice ID',
  })
  xeroInvoiceId: string;

  @ApiProperty({
    description: 'Amount in cents',
    example: 150000,
  })
  amountCents: number;

  @ApiProperty({
    description: 'Sync direction',
    enum: ['push', 'pull'],
  })
  syncDirection: string;

  @ApiProperty({
    description: 'Last sync timestamp',
  })
  lastSyncedAt: Date;

  @ApiProperty({
    description: 'Created timestamp',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Updated timestamp',
  })
  updatedAt: Date;
}

/**
 * Xero Payment from API response
 */
export interface XeroPaymentApiResponse {
  PaymentID: string;
  Invoice?: {
    InvoiceID: string;
    InvoiceNumber?: string;
  };
  Amount: number;
  Date: string;
  Reference?: string;
  BankAccount?: {
    AccountID: string;
    Name?: string;
  };
  Status: string;
  PaymentType?: string;
  UpdatedDateUTC?: string;
}

/**
 * Helper to convert cents to Rands
 */
export function centsToRands(cents: number): number {
  return cents / 100;
}

/**
 * Helper to convert Rands to cents
 */
export function randsToCents(rands: number): number {
  return Math.round(rands * 100);
}

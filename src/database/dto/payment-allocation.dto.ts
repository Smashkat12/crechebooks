import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsInt,
  Min,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Payment } from '@prisma/client';

/**
 * Represents a single payment allocation to an invoice
 */
export class AllocationDto {
  @IsUUID()
  invoiceId!: string;

  @IsInt()
  @Min(1) // Minimum 1 cent
  amountCents!: number;
}

/**
 * Request DTO for batch payment allocation
 * Allocates a single transaction payment across multiple invoices
 */
export class AllocatePaymentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  transactionId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationDto)
  allocations!: AllocationDto[];

  @IsOptional()
  @IsUUID()
  userId?: string;
}

/**
 * Request DTO for reversing payment allocations
 * Reverses all allocations for a specific payment
 */
export class ReverseAllocationDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  paymentId!: string;

  @IsString()
  @MinLength(5)
  reason!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}

/**
 * Xero sync status for payment allocations
 */
export enum XeroSyncStatus {
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  PENDING = 'PENDING',
  SKIPPED = 'SKIPPED',
}

/**
 * Represents a validation or processing error for a specific invoice allocation
 */
export interface AllocationError {
  invoiceId: string;
  reason: string;
  code: string;
}

/**
 * Result of payment allocation operation
 * Contains created payments, affected invoices, and any errors
 */
export interface AllocationResult {
  payments: Payment[];
  invoicesUpdated: string[];
  unallocatedAmountCents: number; // Remaining unallocated amount from transaction
  xeroSyncStatus: XeroSyncStatus;
  errors: AllocationError[];
}

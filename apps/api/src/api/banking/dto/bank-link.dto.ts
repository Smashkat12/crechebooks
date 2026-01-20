/**
 * Bank Link DTOs
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * Data Transfer Objects for bank linking API endpoints.
 */

import {
  IsString,
  IsOptional,
  IsArray,
  IsUrl,
  IsUUID,
  IsBoolean,
  IsDateString,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Request to initiate bank account linking
 */
export class InitiateLinkDto {
  @ApiPropertyOptional({
    description: 'Custom redirect URI for OAuth callback',
    example: 'https://app.crechebooks.co.za/banking/callback',
  })
  @IsOptional()
  @IsUrl()
  redirectUri?: string;

  @ApiPropertyOptional({
    description: 'User reference for audit purposes',
    example: 'user-123',
  })
  @IsOptional()
  @IsString()
  userReference?: string;
}

/**
 * Response from link initiation
 */
export class LinkInitResponseDto {
  @ApiProperty({
    description: 'URL to redirect user to for bank consent',
    example: 'https://api.stitch.money/connect/authorize?...',
  })
  linkUrl: string;

  @ApiProperty({
    description: 'State parameter for CSRF protection',
    example: 'abc123xyz789',
  })
  state: string;

  @ApiProperty({
    description: 'Link session ID',
    example: 'link-abc123',
  })
  linkId: string;

  @ApiProperty({
    description: 'Link session expiry time',
    example: '2026-01-20T12:30:00Z',
  })
  expiresAt: Date;
}

/**
 * OAuth callback query parameters
 */
export class OAuthCallbackDto {
  @ApiProperty({
    description: 'Authorization code from OAuth provider',
    example: 'auth_code_123',
  })
  @IsString()
  code: string;

  @ApiProperty({
    description: 'State parameter for CSRF verification',
    example: 'abc123xyz789',
  })
  @IsString()
  state: string;

  @ApiPropertyOptional({
    description: 'Error code if authorization failed',
    example: 'access_denied',
  })
  @IsOptional()
  @IsString()
  error?: string;

  @ApiPropertyOptional({
    description: 'Error description',
    example: 'User denied consent',
  })
  @IsOptional()
  @IsString()
  error_description?: string;
}

/**
 * Linked bank account response
 */
export class LinkedAccountDto {
  @ApiProperty({
    description: 'Linked account ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id: string;

  @ApiProperty({
    description: 'Tenant ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  tenantId: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'First National Bank',
  })
  bankName: string;

  @ApiProperty({
    description: 'Masked account number (last 4 digits)',
    example: '****1234',
  })
  accountNumberMasked: string;

  @ApiProperty({
    description: 'Account type',
    example: 'cheque',
  })
  accountType: string;

  @ApiProperty({
    description: 'Account holder name',
    example: 'John Doe',
    nullable: true,
  })
  accountHolderName: string | null;

  @ApiProperty({
    description: 'Account status',
    enum: ['pending', 'active', 'expired', 'revoked', 'error'],
    example: 'active',
  })
  status: string;

  @ApiProperty({
    description: 'When account was linked',
    example: '2026-01-01T00:00:00Z',
  })
  linkedAt: Date;

  @ApiProperty({
    description: 'Last successful sync',
    example: '2026-01-20T08:00:00Z',
    nullable: true,
  })
  lastSyncedAt: Date | null;

  @ApiProperty({
    description: 'Next scheduled sync',
    example: '2026-01-20T12:00:00Z',
    nullable: true,
  })
  nextSyncAt: Date | null;

  @ApiProperty({
    description: 'Consent expiry date',
    example: '2026-04-01T00:00:00Z',
  })
  consentExpiresAt: Date;

  @ApiProperty({
    description: 'Days until consent expires',
    example: 71,
  })
  consentDaysRemaining: number;

  @ApiProperty({
    description: 'Whether consent renewal is needed (< 14 days)',
    example: false,
  })
  requiresRenewal: boolean;

  @ApiPropertyOptional({
    description: 'Current balance in cents',
    example: 1234500,
  })
  currentBalanceCents?: number;

  @ApiPropertyOptional({
    description: 'Last sync error message',
    example: 'Rate limit exceeded',
  })
  lastSyncError?: string;
}

/**
 * Sync result response
 */
export class SyncResultDto {
  @ApiProperty({
    description: 'Account ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  accountId: string;

  @ApiProperty({
    description: 'Whether sync was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Number of transactions retrieved',
    example: 25,
  })
  transactionsRetrieved: number;

  @ApiProperty({
    description: 'Number of new transactions',
    example: 10,
  })
  transactionsNew: number;

  @ApiProperty({
    description: 'Number of duplicate transactions skipped',
    example: 15,
  })
  transactionsDuplicate: number;

  @ApiProperty({
    description: 'Sync duration in milliseconds',
    example: 1234,
  })
  durationMs: number;

  @ApiProperty({
    description: 'Whether auto-reconciliation was triggered',
    example: true,
  })
  reconciliationTriggered: boolean;

  @ApiPropertyOptional({
    description: 'Error message if sync failed',
    example: 'Token expired',
  })
  errorMessage?: string;
}

/**
 * Account balance response
 */
export class AccountBalanceDto {
  @ApiProperty({
    description: 'Account ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  accountId: string;

  @ApiProperty({
    description: 'Current balance in cents',
    example: 1234500,
  })
  currentBalanceCents: number;

  @ApiProperty({
    description: 'Available balance in cents',
    example: 1200000,
  })
  availableBalanceCents: number;

  @ApiProperty({
    description: 'Currency code',
    example: 'ZAR',
  })
  currency: string;

  @ApiProperty({
    description: 'Balance as of timestamp',
    example: '2026-01-20T08:00:00Z',
  })
  asOf: Date;

  @ApiPropertyOptional({
    description: 'Overdraft limit in cents',
    example: 50000,
  })
  overdraftLimitCents?: number;
}

/**
 * Transaction query parameters
 */
export class GetTransactionsDto {
  @ApiProperty({
    description: 'Start date for transaction range',
    example: '2026-01-01',
  })
  @IsDateString()
  from: string;

  @ApiProperty({
    description: 'End date for transaction range',
    example: '2026-01-31',
  })
  @IsDateString()
  to: string;
}

/**
 * Bank transaction response
 */
export class BankTransactionDto {
  @ApiProperty({
    description: 'External transaction ID from bank',
    example: 'txn-123456',
  })
  externalId: string;

  @ApiProperty({
    description: 'Transaction date',
    example: '2026-01-15T00:00:00Z',
  })
  date: Date;

  @ApiProperty({
    description: 'Amount in cents (negative for debits)',
    example: -15000,
  })
  amountCents: number;

  @ApiProperty({
    description: 'Bank description',
    example: 'POS PURCHASE - WOOLWORTHS',
  })
  description: string;

  @ApiProperty({
    description: 'Bank reference',
    example: 'REF123456789',
  })
  reference: string;

  @ApiProperty({
    description: 'Transaction type',
    enum: ['debit', 'credit', 'transfer', 'fee', 'interest', 'reversal', 'other'],
    example: 'debit',
  })
  type: string;

  @ApiPropertyOptional({
    description: 'Running balance after transaction',
    example: 985000,
  })
  runningBalanceCents?: number;

  @ApiPropertyOptional({
    description: 'Counterparty name',
    example: 'Woolworths',
  })
  counterpartyName?: string;

  @ApiPropertyOptional({
    description: 'Bank category',
    example: 'Shopping',
  })
  bankCategory?: string;

  @ApiProperty({
    description: 'Whether this transaction was already imported',
    example: false,
  })
  isDuplicate: boolean;
}

/**
 * Bank accounts summary for dashboard
 */
export class BankAccountsSummaryDto {
  @ApiProperty({
    description: 'Total linked accounts',
    example: 3,
  })
  totalAccounts: number;

  @ApiProperty({
    description: 'Active accounts',
    example: 2,
  })
  activeAccounts: number;

  @ApiProperty({
    description: 'Accounts needing attention',
    example: 1,
  })
  attentionNeeded: number;

  @ApiProperty({
    description: 'Total balance across accounts in cents',
    example: 2500000,
  })
  totalBalanceCents: number;

  @ApiProperty({
    description: 'Last sync timestamp',
    example: '2026-01-20T08:00:00Z',
    nullable: true,
  })
  lastSyncAt: Date | null;

  @ApiProperty({
    description: 'Next scheduled sync',
    example: '2026-01-20T12:00:00Z',
    nullable: true,
  })
  nextSyncAt: Date | null;

  @ApiProperty({
    description: 'Accounts by bank',
    example: { fnb: 2, standard_bank: 1 },
  })
  byBank: Record<string, number>;
}

/**
 * Consent renewal check response
 */
export class ConsentStatusDto {
  @ApiProperty({
    description: 'Account ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  accountId: string;

  @ApiProperty({
    description: 'Bank name',
    example: 'First National Bank',
  })
  bankName: string;

  @ApiProperty({
    description: 'Consent expiry date',
    example: '2026-04-01T00:00:00Z',
  })
  expiresAt: Date;

  @ApiProperty({
    description: 'Days remaining until expiry',
    example: 14,
  })
  daysRemaining: number;

  @ApiProperty({
    description: 'Status: ok, warning (< 14 days), critical (< 7 days), expired',
    enum: ['ok', 'warning', 'critical', 'expired'],
    example: 'warning',
  })
  status: string;

  @ApiPropertyOptional({
    description: 'Renewal URL if available',
    example: 'https://api.stitch.money/connect/reauthorize?...',
  })
  renewalUrl?: string;
}

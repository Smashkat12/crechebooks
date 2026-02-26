/**
 * Accounting DTOs
 *
 * Provider-agnostic data transfer objects for the accounting REST API.
 * These mirror the interface types but add class-validator decorators
 * and Swagger documentation.
 *
 * CRITICAL: All monetary values are in ZAR cents (integers).
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMinSize,
  IsUUID,
  IsBoolean,
  IsUrl,
  IsNumber,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import type { SyncDirection, SyncEntityType } from '../interfaces';

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

/** Request to initiate an OAuth connection. */
export class ConnectRequestDto {
  @ApiProperty({
    description: 'URL to redirect back to after OAuth authorization',
    example: 'https://app.crechebooks.com/settings/accounting',
  })
  @IsUrl({ require_tld: false })
  returnUrl!: string;
}

/** Response after initiating an OAuth connection. */
export class ConnectResponseDto {
  @ApiProperty({ description: 'OAuth authorization URL to redirect the user to' })
  authUrl!: string;
}

/** OAuth callback query parameters. */
export class CallbackQueryDto {
  @ApiProperty({ description: 'OAuth authorization code' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'State parameter for CSRF protection' })
  @IsString()
  state!: string;
}

/** Connection status response. */
export class ConnectionStatusResponseDto {
  @ApiProperty({ description: 'Whether the tenant is connected to the provider' })
  isConnected!: boolean;

  @ApiProperty({ description: 'Provider name (e.g. xero, stub)' })
  providerName!: string;

  @ApiPropertyOptional({ description: 'Connected organization name' })
  organizationName?: string;

  @ApiPropertyOptional({ description: 'When the connection was established' })
  connectedAt?: Date;

  @ApiPropertyOptional({ description: 'Timestamp of last sync' })
  lastSyncAt?: Date;

  @ApiPropertyOptional({
    enum: ['success', 'partial', 'failed'],
    description: 'Outcome of the last sync',
  })
  lastSyncStatus?: 'success' | 'partial' | 'failed';

  @ApiPropertyOptional({ description: 'Error message if last sync failed' })
  errorMessage?: string;
}

/** Response after disconnecting. */
export class DisconnectResponseDto {
  @ApiProperty({ description: 'Whether the disconnection succeeded' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Informational message' })
  message?: string;
}

// ---------------------------------------------------------------------------
// Invoices
// ---------------------------------------------------------------------------

/** Request to push a single invoice. */
export class PushInvoiceRequestDto {
  @ApiProperty({ description: 'CrecheBooks invoice ID' })
  @IsUUID()
  invoiceId!: string;

  @ApiPropertyOptional({
    description: 'Force push even if already synced',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/** Request to push multiple invoices. */
export class BulkPushInvoicesRequestDto {
  @ApiProperty({
    description: 'Array of CrecheBooks invoice IDs to push',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  invoiceIds!: string[];

  @ApiPropertyOptional({
    description: 'Force push even if already synced',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}

/** Query parameters for pulling invoices. */
export class PullInvoicesQueryDto {
  @ApiPropertyOptional({
    description: 'Pull invoices modified after this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  since?: string;

  @ApiPropertyOptional({ description: 'Maximum number of invoices to return' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Page number (1-indexed)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ description: 'Filter by external invoice status' })
  @IsOptional()
  @IsString()
  status?: string;
}

/** Response for a single pushed invoice. */
export class InvoiceSyncResultDto {
  @ApiProperty({ description: 'CrecheBooks invoice ID' })
  invoiceId!: string;

  @ApiProperty({ description: 'Provider-assigned invoice ID' })
  externalInvoiceId!: string;

  @ApiPropertyOptional({ description: 'Provider-assigned invoice number' })
  externalInvoiceNumber?: string;

  @ApiProperty({ description: 'Status in the external system' })
  externalStatus!: string;

  @ApiProperty({ description: 'When the sync occurred' })
  syncedAt!: Date;
}

/** Response for a bulk invoice push. */
export class BulkInvoiceSyncResultDto {
  @ApiProperty({ description: 'Number of invoices successfully pushed' })
  pushed!: number;

  @ApiProperty({ description: 'Number of invoices that failed' })
  failed!: number;

  @ApiProperty({ description: 'Number of invoices skipped (already synced)' })
  skipped!: number;

  @ApiProperty({ type: [InvoiceSyncResultDto] })
  results!: InvoiceSyncResultDto[];

  @ApiProperty({ description: 'Errors for failed invoices' })
  errors!: Array<{ entityId: string; error: string; code: string }>;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

/** Request to sync a single parent to an external contact. */
export class SyncContactRequestDto {
  @ApiProperty({ description: 'CrecheBooks parent ID' })
  @IsUUID()
  parentId!: string;
}

/** Request to sync multiple parents in bulk. */
export class BulkSyncContactsRequestDto {
  @ApiProperty({
    description: 'Array of CrecheBooks parent IDs',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  parentIds!: string[];
}

/** Response for a single contact sync. */
export class ContactSyncResultDto {
  @ApiProperty({ description: 'CrecheBooks parent ID' })
  parentId!: string;

  @ApiProperty({ description: 'Provider-assigned contact ID' })
  externalContactId!: string;

  @ApiProperty({ description: 'Contact name in external system' })
  externalContactName!: string;

  @ApiProperty({ description: 'Whether a new contact was created' })
  wasCreated!: boolean;

  @ApiProperty({ description: 'When the sync occurred' })
  syncedAt!: Date;
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------

/** Request to sync a payment. */
export class SyncPaymentRequestDto {
  @ApiProperty({ description: 'CrecheBooks payment ID' })
  @IsUUID()
  paymentId!: string;

  @ApiProperty({ description: 'External invoice ID to apply payment against' })
  @IsString()
  @MinLength(1)
  invoiceRef!: string;
}

/** Query parameters for pulling payments. */
export class PullPaymentsQueryDto {
  @ApiProperty({ description: 'External invoice ID to pull payments for' })
  @IsString()
  @MinLength(1)
  invoiceRef!: string;
}

/** Response for a single payment sync. */
export class PaymentSyncResultDto {
  @ApiProperty({ description: 'CrecheBooks payment ID' })
  paymentId!: string;

  @ApiProperty({ description: 'Provider-assigned payment ID' })
  externalPaymentId!: string;

  @ApiProperty({ description: 'External invoice ID' })
  externalInvoiceId!: string;

  @ApiProperty({ description: 'Payment amount in ZAR cents' })
  amountCents!: number;

  @ApiProperty({ description: 'When the sync occurred' })
  syncedAt!: Date;
}

// ---------------------------------------------------------------------------
// Sync Orchestration
// ---------------------------------------------------------------------------

/** Request to trigger a sync operation. */
export class SyncRequestDto {
  @ApiProperty({
    enum: ['push', 'pull', 'bidirectional'],
    description: 'Direction of sync',
  })
  @IsEnum(['push', 'pull', 'bidirectional'])
  direction!: SyncDirection;

  @ApiPropertyOptional({
    type: [String],
    enum: ['invoices', 'payments', 'contacts'],
    description: 'Specific entity types to sync. Omit to sync all.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(['invoices', 'payments', 'contacts'], { each: true })
  entities?: SyncEntityType[];

  @ApiPropertyOptional({
    description: 'Only sync records modified after this date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({
    description: 'If true, performs a full historical sync',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  fullSync?: boolean;
}

/** Response for a sync operation. */
export class SyncResultDto {
  @ApiProperty({ description: 'Unique sync job ID' })
  jobId!: string;

  @ApiProperty({ description: 'Whether the sync succeeded overall' })
  success!: boolean;

  @ApiProperty({ description: 'Count of entities synced by type' })
  entitiesSynced!: Record<string, number>;

  @ApiProperty({ description: 'Errors encountered during sync' })
  errors!: Array<{ entityId: string; error: string; code: string }>;

  @ApiProperty({ description: 'When the sync completed' })
  completedAt!: Date;
}

// ---------------------------------------------------------------------------
// Journal (optional capability)
// ---------------------------------------------------------------------------

/** A single journal line item DTO. */
export class JournalLineItemDto {
  @ApiProperty({ description: 'Account code', example: '200' })
  @IsString()
  @MinLength(1)
  accountCode!: string;

  @ApiProperty({ description: 'Line description' })
  @IsString()
  description!: string;

  @ApiPropertyOptional({ description: 'Debit amount in ZAR cents' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  debitCents?: number;

  @ApiPropertyOptional({ description: 'Credit amount in ZAR cents' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  creditCents?: number;

  @ApiPropertyOptional({ description: 'Tax type code', example: 'NONE' })
  @IsOptional()
  @IsString()
  taxType?: string;
}

/** Request to post a journal entry. */
export class PostJournalRequestDto {
  @ApiProperty({ description: 'External reference' })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiProperty({ description: 'Journal narration/description' })
  @IsString()
  @MinLength(1)
  narration!: string;

  @ApiProperty({ description: 'Journal date (ISO 8601)', example: '2024-01-15' })
  @IsDateString()
  date!: string;

  @ApiProperty({
    description: 'Journal line items (debits must equal credits)',
    type: [JournalLineItemDto],
  })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalLineItemDto)
  lineItems!: JournalLineItemDto[];
}

/** Response for a posted journal. */
export class JournalPostResultDto {
  @ApiProperty({ description: 'Provider-assigned journal ID' })
  externalJournalId!: string;

  @ApiProperty({ description: 'Journal status in external system' })
  status!: string;

  @ApiProperty({ description: 'Total debits in ZAR cents' })
  totalDebitsCents!: number;

  @ApiProperty({ description: 'Total credits in ZAR cents' })
  totalCreditsCents!: number;

  @ApiProperty({ description: 'When the journal was posted' })
  postedAt!: Date;
}

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------

/** Response for a single account. */
export class AccountingAccountDto {
  @ApiProperty({ description: 'Provider-assigned account ID' })
  externalAccountId!: string;

  @ApiProperty({ description: 'Account code', example: '200' })
  code!: string;

  @ApiProperty({ description: 'Account name', example: 'Sales' })
  name!: string;

  @ApiProperty({ description: 'Account type', example: 'REVENUE' })
  type!: string;

  @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] })
  status!: 'ACTIVE' | 'ARCHIVED';

  @ApiPropertyOptional({ description: 'Tax type' })
  taxType?: string;
}

// ---------------------------------------------------------------------------
// Provider Capabilities
// ---------------------------------------------------------------------------

/** Response listing which capabilities the active provider supports. */
export class ProviderCapabilitiesDto {
  @ApiProperty({ description: 'Provider name' })
  providerName!: string;

  @ApiProperty({ description: 'Supports bank feed import' })
  bankFeeds!: boolean;

  @ApiProperty({ description: 'Supports manual journal posting' })
  journals!: boolean;

  @ApiProperty({ description: 'Supports bulk invoice push' })
  bulkInvoicePush!: boolean;

  @ApiProperty({ description: 'Supports invoice pull' })
  invoicePull!: boolean;

  @ApiProperty({ description: 'Supports chart of accounts' })
  chartOfAccounts!: boolean;

  @ApiProperty({ description: 'Supports sync orchestration' })
  syncOrchestration!: boolean;
}

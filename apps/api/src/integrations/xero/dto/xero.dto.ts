/**
 * Xero DTOs
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 *
 * Data transfer objects for Xero integration REST endpoints.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  ArrayMinSize,
} from 'class-validator';

/**
 * Sync direction
 */
export type SyncDirection = 'push' | 'pull' | 'bidirectional';

/**
 * Entity types that can be synced
 */
export type SyncEntityType = 'invoices' | 'payments' | 'contacts';

/**
 * Request DTO for initiating a sync
 */
export class SyncRequestDto {
  @ApiProperty({
    enum: ['push', 'pull', 'bidirectional'],
    description: 'Direction of sync - push to Xero, pull from Xero, or both',
  })
  @IsEnum(['push', 'pull', 'bidirectional'])
  direction!: SyncDirection;

  @ApiPropertyOptional({
    type: [String],
    enum: ['invoices', 'payments', 'contacts'],
    description: 'Specific entities to sync. If not provided, syncs all.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(['invoices', 'payments', 'contacts'], { each: true })
  entities?: SyncEntityType[];

  @ApiPropertyOptional({
    description: 'Start date for sync range (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  fromDate?: string;
}

/**
 * OAuth state payload for CSRF protection
 */
export interface OAuthStatePayload {
  tenantId: string;
  returnUrl: string;
  createdAt: number;
  nonce: string;
}

/**
 * Response for OAuth connect initiation
 */
export class ConnectResponseDto {
  @ApiProperty({ description: 'Xero OAuth authorization URL' })
  authUrl!: string;
}

/**
 * Connection status response
 */
export class XeroConnectionStatusDto {
  @ApiProperty({ description: 'Whether Xero is connected' })
  isConnected!: boolean;

  @ApiPropertyOptional({ description: 'Xero organization name' })
  tenantName?: string;

  @ApiPropertyOptional({ description: 'When connection was established' })
  connectedAt?: Date;

  @ApiPropertyOptional({ description: 'Last successful sync time' })
  lastSyncAt?: Date;

  @ApiPropertyOptional({
    enum: ['success', 'partial', 'failed'],
    description: 'Status of last sync',
  })
  lastSyncStatus?: 'success' | 'partial' | 'failed';

  @ApiPropertyOptional({ description: 'Error message if status is failed' })
  errorMessage?: string;
}

/**
 * Sync job response
 */
export class SyncJobResponseDto {
  @ApiProperty({ description: 'Unique sync job ID' })
  jobId!: string;

  @ApiProperty({ description: 'Current job status' })
  status!: 'queued' | 'in_progress' | 'completed' | 'failed';

  @ApiPropertyOptional({ description: 'When the job was started' })
  startedAt?: Date;

  @ApiPropertyOptional({ description: 'Estimated completion time' })
  estimatedCompletionAt?: Date;
}

/**
 * Sync progress for WebSocket events
 */
export interface SyncProgress {
  entity: string;
  total: number;
  processed: number;
  percentage: number;
}

/**
 * Sync result for WebSocket events
 */
export interface SyncResult {
  jobId: string;
  success: boolean;
  entitiesSynced: {
    invoices: number;
    payments: number;
    contacts: number;
  };
  errors: SyncError[];
  completedAt: Date;
}

/**
 * Sync error
 */
export interface SyncError {
  entity: string;
  entityId: string;
  message: string;
  code: string;
}

/**
 * Callback query parameters
 */
export class CallbackQueryDto {
  @ApiProperty({ description: 'OAuth authorization code' })
  @IsString()
  code!: string;

  @ApiProperty({ description: 'State parameter for CSRF protection' })
  @IsString()
  state!: string;
}

/**
 * Disconnect response
 */
export class DisconnectResponseDto {
  @ApiProperty({ description: 'Whether disconnect was successful' })
  success!: boolean;

  @ApiPropertyOptional({ description: 'Message' })
  message?: string;
}

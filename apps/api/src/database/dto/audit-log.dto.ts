/**
 * Audit Log DTOs
 * TASK-CORE-004: Audit Log Entity and Trail System
 * TASK-RECON-034: Audit Log Pagination and Filtering
 *
 * @module database/dto/audit-log
 * @description DTOs for audit log creation, query, and pagination.
 * NOTE: No UpdateDto - table is IMMUTABLE.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  IsInt,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AuditAction } from '../entities/audit-log.entity';

/**
 * DTO for creating an audit log entry
 * NOTE: No UpdateAuditLogDto - audit logs are IMMUTABLE
 */
export class CreateAuditLogDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsString()
  @MinLength(1)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsEnum(AuditAction)
  action!: AuditAction;

  @IsOptional()
  @IsObject()
  beforeValue?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  afterValue?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

// NOTE: No UpdateAuditLogDto - this is an IMMUTABLE table

// ============================================
// TASK-RECON-034: Pagination and Filtering DTOs
// ============================================

/**
 * Sort options for audit logs
 */
export type AuditLogSortField = 'createdAt' | 'entityType' | 'action';
export type SortOrder = 'asc' | 'desc';

/**
 * Audit log query options interface
 */
export interface AuditLogQueryOptions {
  offset?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
  entityType?: string;
  action?: string;
  userId?: string;
  entityId?: string;
  sortBy?: AuditLogSortField;
  sortOrder?: SortOrder;
}

/**
 * Audit log paginated result interface (offset-based pagination)
 * NOTE: Named differently from shared PaginatedResult which uses page-based pagination
 */
export interface AuditLogPaginatedResult<T> {
  data: T[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

/**
 * Query DTO for audit log endpoint
 */
export class AuditLogQueryDto implements AuditLogQueryOptions {
  @ApiPropertyOptional({
    description: 'Offset for pagination',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;

  @ApiPropertyOptional({
    description: 'Limit for pagination',
    default: 50,
    minimum: 1,
    maximum: 500,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  @Type(() => Number)
  limit?: number = 50;

  @ApiPropertyOptional({
    description: 'Filter by start date (ISO 8601)',
    example: '2024-01-01',
  })
  @IsOptional()
  @IsDateString()
  startDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by end date (ISO 8601)',
    example: '2024-12-31',
  })
  @IsOptional()
  @IsDateString()
  endDate?: Date;

  @ApiPropertyOptional({
    description: 'Filter by entity type',
    example: 'Transaction',
  })
  @IsOptional()
  @IsString()
  entityType?: string;

  @ApiPropertyOptional({
    description: 'Filter by action type',
    example: 'UPDATE',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional({
    description: 'Filter by user ID',
  })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({
    description: 'Filter by entity ID',
  })
  @IsOptional()
  @IsString()
  entityId?: string;

  @ApiPropertyOptional({
    description: 'Sort field',
    enum: ['createdAt', 'entityType', 'action'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: AuditLogSortField = 'createdAt';

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['asc', 'desc'],
    default: 'desc',
  })
  @IsOptional()
  @IsString()
  sortOrder?: SortOrder = 'desc';
}

/**
 * Export format type
 */
export type ExportFormat = 'csv' | 'json';

/**
 * Export query DTO
 */
export class AuditLogExportDto extends AuditLogQueryDto {
  @ApiPropertyOptional({
    description: 'Export format',
    enum: ['csv', 'json'],
    default: 'csv',
  })
  @IsOptional()
  @IsString()
  format?: ExportFormat = 'csv';
}

/**
 * Audit log response DTO for Swagger
 */
export class AuditLogResponseDto {
  @ApiProperty({ description: 'Audit log ID' })
  id!: string;

  @ApiProperty({ description: 'Tenant ID' })
  tenantId!: string;

  @ApiPropertyOptional({ description: 'User ID who performed the action' })
  userId?: string | null;

  @ApiPropertyOptional({ description: 'Agent ID if automated' })
  agentId?: string | null;

  @ApiProperty({ description: 'Entity type' })
  entityType!: string;

  @ApiProperty({ description: 'Entity ID' })
  entityId!: string;

  @ApiProperty({ description: 'Action performed' })
  action!: string;

  @ApiPropertyOptional({ description: 'State before the action' })
  beforeValue?: unknown;

  @ApiPropertyOptional({ description: 'State after the action' })
  afterValue?: unknown;

  @ApiPropertyOptional({ description: 'Summary of changes' })
  changeSummary?: string | null;

  @ApiPropertyOptional({ description: 'IP address' })
  ipAddress?: string | null;

  @ApiPropertyOptional({ description: 'User agent' })
  userAgent?: string | null;

  @ApiProperty({ description: 'When the action occurred' })
  createdAt!: Date;
}

/**
 * Paginated audit log response DTO
 */
export class PaginatedAuditLogResponseDto implements AuditLogPaginatedResult<AuditLogResponseDto> {
  @ApiProperty({
    description: 'Audit log entries',
    type: [AuditLogResponseDto],
  })
  data!: AuditLogResponseDto[];

  @ApiProperty({ description: 'Total number of records matching the query' })
  total!: number;

  @ApiProperty({ description: 'Current offset' })
  offset!: number;

  @ApiProperty({ description: 'Current limit' })
  limit!: number;

  @ApiProperty({ description: 'Whether there are more records' })
  hasMore!: boolean;
}

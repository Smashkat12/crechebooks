/**
 * Audit Log DTOs
 * TASK-CORE-004: Audit Log Entity and Trail System
 *
 * @module database/dto/audit-log
 * @description DTOs for audit log creation. NOTE: No UpdateDto - table is IMMUTABLE.
 */

import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
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

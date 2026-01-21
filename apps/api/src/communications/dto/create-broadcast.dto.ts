/**
 * Broadcast Message DTOs
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 *
 * Data Transfer Objects for creating and managing broadcast messages.
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsDate,
  IsBoolean,
  IsInt,
  IsArray,
  Min,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { PartialType } from '@nestjs/mapped-types';
import {
  RecipientType,
  CommunicationChannel,
  BroadcastStatus,
} from '../types/communication.types';

/**
 * Parent filter criteria DTO
 */
export class ParentFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enrollmentStatus?: string[];

  @IsOptional()
  @IsUUID()
  feeStructureId?: string;

  @IsOptional()
  @IsBoolean()
  hasOutstandingBalance?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  daysOverdue?: number;

  @IsOptional()
  @IsBoolean()
  whatsappOptIn?: boolean;

  @IsOptional()
  @IsBoolean()
  smsOptIn?: boolean;
}

/**
 * Staff filter criteria DTO
 */
export class StaffFilterDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employmentType?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  position?: string;
}

/**
 * Recipient filter criteria DTO
 */
export class RecipientFilterDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentFilterDto)
  parentFilter?: ParentFilterDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => StaffFilterDto)
  staffFilter?: StaffFilterDto;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  selectedIds?: string[];
}

/**
 * Create broadcast message DTO
 */
export class CreateBroadcastDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @IsString()
  body!: string;

  @IsOptional()
  @IsString()
  htmlBody?: string;

  @IsEnum(RecipientType)
  recipientType!: RecipientType;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  recipientFilter?: RecipientFilterDto;

  @IsOptional()
  @IsUUID()
  recipientGroupId?: string;

  @IsEnum(CommunicationChannel)
  channel!: CommunicationChannel;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledAt?: Date;
}

/**
 * Update broadcast message DTO
 */
export class UpdateBroadcastDto extends PartialType(CreateBroadcastDto) {
  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;
}

/**
 * Create message recipient DTO
 */
export class CreateMessageRecipientDto {
  @IsUUID()
  broadcastId!: string;

  @IsUUID()
  recipientId!: string;

  @IsEnum(RecipientType)
  recipientType!: RecipientType;

  @IsString()
  @MaxLength(200)
  recipientName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  recipientPhone?: string;
}

/**
 * Create recipient group DTO
 */
export class CreateRecipientGroupDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsEnum(RecipientType)
  recipientType!: RecipientType;

  @ValidateNested()
  @Type(() => RecipientFilterDto)
  filterCriteria!: RecipientFilterDto;

  @IsOptional()
  @IsBoolean()
  isSystem?: boolean;
}

/**
 * Update recipient group DTO
 */
export class UpdateRecipientGroupDto extends PartialType(
  CreateRecipientGroupDto,
) {}

/**
 * Broadcast list query DTO
 */
export class BroadcastListQueryDto {
  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;

  @IsOptional()
  @IsEnum(RecipientType)
  recipientType?: RecipientType;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Type(() => Number)
  offset?: number = 0;
}

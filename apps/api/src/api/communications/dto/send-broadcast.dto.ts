/**
 * Send Broadcast DTOs
 * TASK-COMM-003: Communication API Controller
 *
 * Request DTOs for creating and sending broadcast messages.
 * Uses snake_case for API compatibility with frontend conventions.
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsArray,
  IsDateString,
  MinLength,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  RecipientType,
  CommunicationChannel,
} from '../../../communications/types/communication.types';

/**
 * Filter criteria for targeting parents
 */
export class ParentFilterDto {
  @ApiPropertyOptional({ description: 'Filter by active/inactive status' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by enrollment status',
    type: [String],
    example: ['ACTIVE', 'PENDING'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  enrollment_status?: string[];

  @ApiPropertyOptional({ description: 'Filter by specific fee structure ID' })
  @IsOptional()
  @IsUUID()
  fee_structure_id?: string;

  @ApiPropertyOptional({
    description: 'Filter parents with outstanding balance',
  })
  @IsOptional()
  @IsBoolean()
  has_outstanding_balance?: boolean;

  @ApiPropertyOptional({
    description: 'Filter parents with invoices overdue by N days',
    minimum: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  days_overdue?: number;

  @ApiPropertyOptional({ description: 'Filter by WhatsApp opt-in status' })
  @IsOptional()
  @IsBoolean()
  whatsapp_opt_in?: boolean;

  @ApiPropertyOptional({ description: 'Filter by SMS opt-in status' })
  @IsOptional()
  @IsBoolean()
  sms_opt_in?: boolean;
}

/**
 * Filter criteria for targeting staff
 */
export class StaffFilterDto {
  @ApiPropertyOptional({ description: 'Filter by active/inactive status' })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by employment type',
    type: [String],
    example: ['PERMANENT', 'CONTRACT'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employment_type?: string[];

  @ApiPropertyOptional({ description: 'Filter by department' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ description: 'Filter by position/role' })
  @IsOptional()
  @IsString()
  position?: string;
}

/**
 * Combined filter criteria for recipient selection
 */
export class RecipientFilterDto {
  @ApiPropertyOptional({ description: 'Filter criteria for parent recipients' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ParentFilterDto)
  parent_filter?: ParentFilterDto;

  @ApiPropertyOptional({ description: 'Filter criteria for staff recipients' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StaffFilterDto)
  staff_filter?: StaffFilterDto;

  @ApiPropertyOptional({
    description: 'Explicit list of recipient IDs for custom selection',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  selected_ids?: string[];
}

/**
 * DTO for creating a new broadcast message
 */
export class CreateBroadcastDto {
  @ApiPropertyOptional({
    description: 'Email subject line (optional for WhatsApp/SMS)',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiProperty({
    description: 'Plain text message body',
    minLength: 1,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;

  @ApiPropertyOptional({
    description: 'HTML version of message body (for email)',
  })
  @IsOptional()
  @IsString()
  html_body?: string;

  @ApiProperty({
    description: 'Type of recipient to target',
    enum: RecipientType,
    example: RecipientType.PARENT,
  })
  @IsEnum(RecipientType)
  recipient_type: RecipientType;

  @ApiPropertyOptional({
    description: 'Filter criteria for recipient selection',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  recipient_filter?: RecipientFilterDto;

  @ApiPropertyOptional({
    description: 'ID of a saved recipient group to use',
  })
  @IsOptional()
  @IsUUID()
  recipient_group_id?: string;

  @ApiProperty({
    description: 'Communication channel(s) to use',
    enum: CommunicationChannel,
    example: CommunicationChannel.EMAIL,
  })
  @IsEnum(CommunicationChannel)
  channel: CommunicationChannel;

  @ApiPropertyOptional({
    description: 'Schedule message for future delivery (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString()
  scheduled_at?: string;
}

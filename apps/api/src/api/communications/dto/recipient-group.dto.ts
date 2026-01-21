/**
 * Recipient Group DTOs
 * TASK-COMM-003: Communication API Controller
 *
 * DTOs for managing recipient groups (saved filter presets).
 */

import {
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RecipientGroup } from '@prisma/client';
import {
  RecipientType,
  RecipientFilterCriteria,
} from '../../../communications/types/communication.types';
import { RecipientFilterDto } from './send-broadcast.dto';

/**
 * DTO for creating a recipient group
 */
export class CreateRecipientGroupDto {
  @ApiProperty({
    description: 'Group name (must be unique within tenant)',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    description: 'Group description',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Type of recipients in this group',
    enum: RecipientType,
    example: RecipientType.PARENT,
  })
  @IsEnum(RecipientType)
  recipient_type: RecipientType;

  @ApiProperty({
    description: 'Filter criteria for this group',
  })
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  filter_criteria: RecipientFilterDto;
}

/**
 * DTO for updating a recipient group
 */
export class UpdateRecipientGroupDto {
  @ApiPropertyOptional({
    description: 'Group name (must be unique within tenant)',
    minLength: 1,
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({
    description: 'Group description',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({
    description: 'Filter criteria for this group',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => RecipientFilterDto)
  filter_criteria?: RecipientFilterDto;
}

/**
 * Filter criteria in response format (snake_case)
 */
export class FilterCriteriaResponseDto {
  @ApiPropertyOptional({ description: 'Parent filter criteria' })
  parent_filter?: {
    is_active?: boolean;
    enrollment_status?: string[];
    fee_structure_id?: string;
    has_outstanding_balance?: boolean;
    days_overdue?: number;
    whatsapp_opt_in?: boolean;
    sms_opt_in?: boolean;
  };

  @ApiPropertyOptional({ description: 'Staff filter criteria' })
  staff_filter?: {
    is_active?: boolean;
    employment_type?: string[];
    department?: string;
    position?: string;
  };

  @ApiPropertyOptional({ description: 'Custom selection IDs' })
  selected_ids?: string[];
}

/**
 * Response DTO for a recipient group
 */
export class RecipientGroupResponseDto {
  @ApiProperty({ description: 'Unique group identifier' })
  id: string;

  @ApiProperty({ description: 'Group name' })
  name: string;

  @ApiPropertyOptional({ description: 'Group description' })
  description?: string;

  @ApiProperty({
    description: 'Type of recipients in this group',
    enum: RecipientType,
  })
  recipient_type: RecipientType;

  @ApiProperty({
    description: 'Filter criteria for this group',
    type: FilterCriteriaResponseDto,
  })
  filter_criteria: FilterCriteriaResponseDto;

  @ApiProperty({ description: 'Whether this is a system-defined group' })
  is_system: boolean;

  @ApiProperty({ description: 'Creation timestamp' })
  created_at: Date;

  constructor(group: RecipientGroup) {
    this.id = group.id;
    this.name = group.name;
    this.description = group.description ?? undefined;
    this.recipient_type = group.recipientType as RecipientType;
    this.is_system = group.isSystem;
    this.created_at = group.createdAt;

    // Transform filter criteria to snake_case
    const fc = group.filterCriteria as unknown as RecipientFilterCriteria;
    this.filter_criteria = {};

    if (fc?.parentFilter) {
      this.filter_criteria.parent_filter = {
        is_active: fc.parentFilter.isActive,
        enrollment_status: fc.parentFilter.enrollmentStatus,
        fee_structure_id: fc.parentFilter.feeStructureId,
        has_outstanding_balance: fc.parentFilter.hasOutstandingBalance,
        days_overdue: fc.parentFilter.daysOverdue,
        whatsapp_opt_in: fc.parentFilter.whatsappOptIn,
        sms_opt_in: fc.parentFilter.smsOptIn,
      };
    }

    if (fc?.staffFilter) {
      this.filter_criteria.staff_filter = {
        is_active: fc.staffFilter.isActive,
        employment_type: fc.staffFilter.employmentType,
        department: fc.staffFilter.department,
        position: fc.staffFilter.position,
      };
    }

    if (fc?.selectedIds) {
      this.filter_criteria.selected_ids = fc.selectedIds;
    }
  }
}

/**
 * Response wrapper for recipient group list
 */
export class RecipientGroupListResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean;

  @ApiProperty({
    description: 'List of recipient groups',
    type: [RecipientGroupResponseDto],
  })
  data: RecipientGroupResponseDto[];
}

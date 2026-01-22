import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsEnum,
  IsDateString,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';

/**
 * Staff Leave Management DTOs
 * TASK-PORTAL-024: Staff Leave Management
 *
 * DTOs for leave balance display, request submission, and history tracking
 * Based on BCEA (Basic Conditions of Employment Act) entitlements for South Africa:
 * - Annual Leave: 15 working days per year
 * - Sick Leave: 30 days per 3-year cycle (10 days in first 6 months)
 * - Family Responsibility: 3 days per year
 */

// ============================================================================
// Leave Types Enum
// ============================================================================

export enum LeaveType {
  ANNUAL = 'annual',
  SICK = 'sick',
  FAMILY = 'family',
  UNPAID = 'unpaid',
  STUDY = 'study',
  MATERNITY = 'maternity',
  PATERNITY = 'paternity',
}

export enum LeaveStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  CANCELLED = 'cancelled',
}

// ============================================================================
// Leave Balance DTOs
// ============================================================================

export class LeaveBalanceItemDto {
  @ApiProperty({
    description: 'Type of leave',
    enum: LeaveType,
    example: LeaveType.ANNUAL,
  })
  type: LeaveType;

  @ApiProperty({
    description: 'Display name for the leave type',
    example: 'Annual Leave',
  })
  name: string;

  @ApiProperty({ description: 'Total entitled days per cycle', example: 15 })
  entitled: number;

  @ApiProperty({ description: 'Days already used', example: 5 })
  used: number;

  @ApiProperty({ description: 'Days pending approval', example: 2 })
  pending: number;

  @ApiProperty({
    description: 'Days available to use (entitled - used - pending)',
    example: 8,
  })
  available: number;

  @ApiPropertyOptional({
    description: 'Cycle period description',
    example: '2024',
  })
  cyclePeriod?: string;

  @ApiPropertyOptional({
    description: 'Additional information about the leave type (BCEA reference)',
    example: '15 working days per year as per BCEA',
  })
  bceoInfo?: string;
}

export class LeaveBalancesResponseDto {
  @ApiProperty({
    type: [LeaveBalanceItemDto],
    description: 'List of leave balance items',
  })
  balances: LeaveBalanceItemDto[];

  @ApiProperty({
    description: 'Start of the current leave cycle',
    example: '2024-01-01',
  })
  cycleStartDate: Date;

  @ApiProperty({
    description: 'End of the current leave cycle',
    example: '2024-12-31',
  })
  cycleEndDate: Date;

  @ApiPropertyOptional({ description: 'Employee start date for reference' })
  employmentStartDate?: Date;
}

// ============================================================================
// Leave Request DTOs
// ============================================================================

export class LeaveRequestDto {
  @ApiProperty({
    description: 'Unique identifier for the leave request',
    example: 'lr-001',
  })
  id: string;

  @ApiProperty({
    description: 'Type of leave requested',
    enum: LeaveType,
    example: LeaveType.ANNUAL,
  })
  type: LeaveType;

  @ApiProperty({
    description: 'Display name for the leave type',
    example: 'Annual Leave',
  })
  typeName: string;

  @ApiProperty({ description: 'Start date of leave period' })
  startDate: Date;

  @ApiProperty({ description: 'End date of leave period' })
  endDate: Date;

  @ApiProperty({ description: 'Total working days requested', example: 3 })
  days: number;

  @ApiProperty({
    description: 'Current status of the request',
    enum: LeaveStatus,
    example: LeaveStatus.PENDING,
  })
  status: LeaveStatus;

  @ApiPropertyOptional({ description: 'Reason for the leave request' })
  reason?: string;

  @ApiProperty({ description: 'When the request was submitted' })
  createdAt: Date;

  @ApiPropertyOptional({ description: 'When the request was last updated' })
  updatedAt?: Date;

  @ApiPropertyOptional({ description: 'Name of the reviewer (manager)' })
  reviewerName?: string;

  @ApiPropertyOptional({ description: 'Comments from the reviewer' })
  reviewerComments?: string;

  @ApiPropertyOptional({ description: 'When the request was reviewed' })
  reviewedAt?: Date;
}

export class CreateLeaveRequestDto {
  @ApiProperty({
    description: 'Type of leave to request',
    enum: LeaveType,
    example: LeaveType.ANNUAL,
  })
  @IsEnum(LeaveType)
  type: LeaveType;

  @ApiProperty({
    description: 'Start date of leave period (ISO 8601 format)',
    example: '2024-03-15',
  })
  @IsDateString()
  startDate: string;

  @ApiProperty({
    description: 'End date of leave period (ISO 8601 format)',
    example: '2024-03-18',
  })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({
    description: 'Reason for the leave request',
    minLength: 0,
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class LeaveRequestsResponseDto {
  @ApiProperty({
    type: [LeaveRequestDto],
    description: 'List of leave requests',
  })
  data: LeaveRequestDto[];

  @ApiProperty({ description: 'Total number of requests' })
  total: number;

  @ApiPropertyOptional({ description: 'Current page number' })
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page' })
  limit?: number;
}

export class LeaveRequestSuccessDto {
  @ApiProperty({ description: 'Success message' })
  message: string;

  @ApiProperty({
    type: LeaveRequestDto,
    description: 'The created leave request',
  })
  request: LeaveRequestDto;
}

export class CancelLeaveRequestDto {
  @ApiPropertyOptional({
    description: 'Reason for cancellation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

// ============================================================================
// BCEA Policy Information DTO
// ============================================================================

export class BCEAEntitlementDto {
  @ApiProperty({ description: 'Leave type', enum: LeaveType })
  type: LeaveType;

  @ApiProperty({ description: 'Display name', example: 'Annual Leave' })
  name: string;

  @ApiProperty({
    description: 'Statutory entitlement',
    example: '15 working days per year',
  })
  entitlement: string;

  @ApiProperty({ description: 'Detailed description of the BCEA provision' })
  description: string;

  @ApiPropertyOptional({ description: 'Additional notes or conditions' })
  notes?: string;
}

export class BCEAPolicyResponseDto {
  @ApiProperty({
    type: [BCEAEntitlementDto],
    description: 'BCEA leave entitlements',
  })
  entitlements: BCEAEntitlementDto[];

  @ApiProperty({
    description: 'General information about BCEA',
    example: 'Basic Conditions of Employment Act 75 of 1997',
  })
  actReference: string;

  @ApiPropertyOptional({
    description: 'Last updated date for policy information',
  })
  lastUpdated?: Date;
}

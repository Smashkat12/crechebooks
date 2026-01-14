/**
 * Leave Management DTOs
 * TASK-SPAY-001: SimplePay Leave Management
 */

import {
  IsString,
  IsOptional,
  IsDate,
  IsInt,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveRequestStatus } from '../entities/leave-request.entity';

// Create Leave Request DTO
export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId: string;

  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId: string;

  @ApiProperty({ description: 'SimplePay leave type ID' })
  @IsInt()
  @Min(1)
  leaveTypeId: number;

  @ApiProperty({ description: 'Leave type name (e.g., Annual Leave)' })
  @IsString()
  leaveTypeName: string;

  @ApiProperty({ description: 'Start date of leave' })
  @IsDate()
  @Type(() => Date)
  startDate: Date;

  @ApiProperty({ description: 'End date of leave' })
  @IsDate()
  @Type(() => Date)
  endDate: Date;

  @ApiProperty({ description: 'Total days of leave' })
  @IsNumber()
  @Min(0.5)
  @Max(365)
  totalDays: number;

  @ApiProperty({ description: 'Total hours of leave' })
  @IsNumber()
  @Min(1)
  totalHours: number;

  @ApiPropertyOptional({ description: 'Reason for leave' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// Update Leave Request DTO
export class UpdateLeaveRequestDto {
  @ApiPropertyOptional({ description: 'SimplePay leave type ID' })
  @IsOptional()
  @IsInt()
  @Min(1)
  leaveTypeId?: number;

  @ApiPropertyOptional({ description: 'Leave type name' })
  @IsOptional()
  @IsString()
  leaveTypeName?: string;

  @ApiPropertyOptional({ description: 'Start date of leave' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional({ description: 'End date of leave' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Total days of leave' })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(365)
  totalDays?: number;

  @ApiPropertyOptional({ description: 'Total hours of leave' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  totalHours?: number;

  @ApiPropertyOptional({ description: 'Reason for leave' })
  @IsOptional()
  @IsString()
  reason?: string;
}

// Approve Leave Request DTO
export class ApproveLeaveRequestDto {
  @ApiProperty({ description: 'User ID of the approver' })
  @IsUUID()
  approvedBy: string;
}

// Reject Leave Request DTO
export class RejectLeaveRequestDto {
  @ApiProperty({ description: 'User ID of the rejector' })
  @IsUUID()
  rejectedBy: string;

  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  rejectedReason: string;
}

// Leave Request Filter DTO
export class LeaveRequestFilterDto {
  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by leave type ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  leaveTypeId?: number;

  @ApiPropertyOptional({ description: 'Filter from date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter to date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by SimplePay sync status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  simplePaySynced?: boolean;

  @ApiPropertyOptional({ description: 'Page number' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}

// Leave Balance Response DTO
export class LeaveBalanceResponseDto {
  @ApiProperty()
  leaveTypeId: number;

  @ApiProperty()
  leaveTypeName: string;

  @ApiProperty()
  openingBalance: number;

  @ApiProperty()
  accrued: number;

  @ApiProperty()
  taken: number;

  @ApiProperty()
  pending: number;

  @ApiProperty()
  adjustment: number;

  @ApiProperty()
  currentBalance: number;

  @ApiProperty()
  units: string;
}

// Leave Type Response DTO
export class LeaveTypeResponseDto {
  @ApiProperty()
  id: number;

  @ApiProperty()
  name: string;

  @ApiProperty()
  accrualType: string;

  @ApiProperty()
  accrualRate: number;

  @ApiPropertyOptional()
  accrualCap: number | null;

  @ApiPropertyOptional()
  carryOverCap: number | null;

  @ApiProperty()
  units: string;

  @ApiProperty()
  requiresApproval: boolean;

  @ApiProperty()
  isActive: boolean;
}

// Create SimplePay Leave Day DTO
export class CreateSimplePayLeaveDayDto {
  @ApiProperty({ description: 'SimplePay employee ID' })
  @IsString()
  simplePayEmployeeId: string;

  @ApiProperty({ description: 'Leave type ID' })
  @IsInt()
  @Min(1)
  leaveTypeId: number;

  @ApiProperty({ description: 'Date of leave (YYYY-MM-DD)' })
  @IsString()
  date: string;

  @ApiProperty({ description: 'Hours of leave for this day' })
  @IsNumber()
  @Min(0.5)
  @Max(24)
  hours: number;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

// Leave Request Response DTO
export class LeaveRequestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  tenantId: string;

  @ApiProperty()
  staffId: string;

  @ApiProperty()
  leaveTypeId: number;

  @ApiProperty()
  leaveTypeName: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  endDate: Date;

  @ApiProperty()
  totalDays: number;

  @ApiProperty()
  totalHours: number;

  @ApiPropertyOptional()
  reason: string | null;

  @ApiProperty({ enum: LeaveRequestStatus })
  status: LeaveRequestStatus;

  @ApiPropertyOptional()
  approvedBy: string | null;

  @ApiPropertyOptional()
  approvedAt: Date | null;

  @ApiPropertyOptional()
  rejectedReason: string | null;

  @ApiProperty()
  simplePaySynced: boolean;

  @ApiProperty({ type: [String] })
  simplePayIds: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// Sync Leave to SimplePay DTO
export class SyncLeaveToSimplePayDto {
  @ApiProperty({ description: 'Leave request ID to sync' })
  @IsUUID()
  leaveRequestId: string;
}

// Bulk Sync Result DTO
export class LeaveSyncResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  leaveRequestId: string;

  @ApiProperty({ type: [String] })
  simplePayIds: string[];

  @ApiProperty({ type: [String] })
  errors: string[];
}

// Get Leave Days DTO
export class GetLeaveDaysDto {
  @ApiProperty({ description: 'SimplePay employee ID' })
  @IsString()
  simplePayEmployeeId: string;

  @ApiPropertyOptional({ description: 'Filter from date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter to date' })
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by leave type ID' })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  leaveTypeId?: number;
}

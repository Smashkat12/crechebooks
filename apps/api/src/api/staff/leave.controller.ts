/**
 * Staff Leave Controller
 * TASK-WEB-050: Leave API endpoints and frontend hooks
 *
 * Provides REST API endpoints for leave management operations:
 * - Get leave types (from SimplePay)
 * - Get leave balances for a staff member
 * - Get leave history for a staff member
 * - Create leave requests
 */

import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiProperty,
  ApiPropertyOptional,
} from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsInt,
  Min,
  Max,
  IsISO8601,
} from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { SimplePayLeaveService } from '../../integrations/simplepay/simplepay-leave.service';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import {
  CreateLeaveRequestDto,
  LeaveTypeResponseDto,
  LeaveBalanceResponseDto,
  LeaveRequestResponseDto,
} from '../../database/dto/leave.dto';
import {
  SimplePayLeaveType,
  SimplePayLeaveBalance,
} from '../../database/entities/leave-request.entity';
import { Logger } from '@nestjs/common';

/**
 * Transform SimplePay leave type to response format (camelCase)
 */
function transformLeaveType(lt: SimplePayLeaveType): LeaveTypeResponseDto {
  return {
    id: lt.id,
    name: lt.name,
    accrualType: lt.accrual_type,
    accrualRate: lt.accrual_rate,
    accrualCap: lt.accrual_cap,
    carryOverCap: lt.carry_over_cap,
    units: lt.units,
    requiresApproval: lt.requires_approval,
    isActive: lt.is_active,
  };
}

/**
 * Transform SimplePay leave balance to response format (camelCase)
 */
function transformLeaveBalance(
  lb: SimplePayLeaveBalance,
): LeaveBalanceResponseDto {
  return {
    leaveTypeId: lb.leave_type_id,
    leaveTypeName: lb.leave_type_name,
    openingBalance: lb.opening_balance,
    accrued: lb.accrued,
    taken: lb.taken,
    pending: lb.pending,
    adjustment: lb.adjustment,
    currentBalance: lb.current_balance,
    units: lb.units,
  };
}

/**
 * API DTO for creating a leave request (snake_case from frontend)
 */
class ApiCreateLeaveRequestDto {
  @ApiProperty({ description: 'SimplePay leave type ID' })
  @IsInt()
  @Min(1)
  leave_type_id: number;

  @ApiProperty({ description: 'Leave type name (e.g., Annual Leave)' })
  @IsString()
  leave_type_name: string;

  @ApiProperty({
    description: 'Start date of leave (ISO 8601 format: YYYY-MM-DD)',
  })
  @IsISO8601({ strict: true })
  start_date: string;

  @ApiProperty({
    description: 'End date of leave (ISO 8601 format: YYYY-MM-DD)',
  })
  @IsISO8601({ strict: true })
  end_date: string;

  @ApiProperty({ description: 'Total days of leave' })
  @IsNumber()
  @Min(0.5)
  @Max(365)
  total_days: number;

  @ApiProperty({ description: 'Total hours of leave' })
  @IsNumber()
  @Min(1)
  total_hours: number;

  @ApiPropertyOptional({ description: 'Reason for leave' })
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags('Staff Leave')
@ApiBearerAuth()
@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeaveController {
  private readonly logger = new Logger(LeaveController.name);

  constructor(
    private readonly simplePayLeaveService: SimplePayLeaveService,
    private readonly staffRepository: StaffRepository,
    private readonly leaveRequestRepository: LeaveRequestRepository,
  ) {}

  /**
   * Get all available leave types for the tenant
   */
  @Get('leave/types')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get all leave types for the tenant' })
  @ApiResponse({
    status: 200,
    description: 'List of leave types',
    type: [LeaveTypeResponseDto],
  })
  async getLeaveTypes(
    @CurrentUser() user: IUser,
  ): Promise<{ leave_types: LeaveTypeResponseDto[] }> {
    try {
      const leaveTypes = await this.simplePayLeaveService.getLeaveTypes(
        getTenantId(user),
      );
      return {
        leave_types: leaveTypes.map(transformLeaveType),
      };
    } catch (error) {
      this.logger.error(
        `Failed to get leave types for tenant ${getTenantId(user)}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new BadRequestException(
        'Failed to retrieve leave types. Please ensure SimplePay is connected.',
      );
    }
  }

  /**
   * Get leave balances for a specific staff member
   */
  @Get(':staffId/leave/balances')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get leave balances for a staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({
    status: 200,
    description: 'Leave balances for the staff member',
    type: [LeaveBalanceResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getLeaveBalances(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
  ): Promise<{ balances: LeaveBalanceResponseDto[] }> {
    // Verify staff belongs to tenant
    const staff = await this.staffRepository.findById(
      staffId,
      getTenantId(user),
    );
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    try {
      const balances = await this.simplePayLeaveService.getLeaveBalancesByStaff(
        getTenantId(user),
        staffId,
      );
      return {
        balances: balances.map(transformLeaveBalance),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to get leave balances for staff ${staffId}: ${errorMessage}`,
      );

      // Check if the error is about missing SimplePay mapping
      if (errorMessage.includes('not linked to a SimplePay employee')) {
        throw new BadRequestException(
          'Staff member is not linked to SimplePay. Please set up the employee in SimplePay first.',
        );
      }

      throw new BadRequestException(
        'Failed to retrieve leave balances. Please ensure SimplePay is connected.',
      );
    }
  }

  /**
   * Get leave history (leave requests) for a specific staff member
   */
  @Get(':staffId/leave/history')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
  @ApiOperation({ summary: 'Get leave history for a staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiQuery({
    name: 'fromDate',
    required: false,
    description: 'Filter from date (ISO 8601)',
  })
  @ApiQuery({
    name: 'toDate',
    required: false,
    description: 'Filter to date (ISO 8601)',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by status (PENDING, APPROVED, REJECTED, CANCELLED)',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 20)',
  })
  @ApiResponse({
    status: 200,
    description: 'Leave history for the staff member',
    type: [LeaveRequestResponseDto],
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getLeaveHistory(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ): Promise<{
    leave_requests: LeaveRequestResponseDto[];
    total: number;
    page: number;
    limit: number;
  }> {
    // Verify staff belongs to tenant
    const staff = await this.staffRepository.findById(
      staffId,
      getTenantId(user),
    );
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    const filter = {
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      status: status as
        | 'PENDING'
        | 'APPROVED'
        | 'REJECTED'
        | 'CANCELLED'
        | undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 20,
    };

    const leaveRequests = await this.leaveRequestRepository.findByStaff(
      staffId,
      filter,
    );

    // Transform to snake_case response
    const transformedRequests = leaveRequests.map((lr) => ({
      id: lr.id,
      tenant_id: lr.tenantId,
      staff_id: lr.staffId,
      leave_type_id: lr.leaveTypeId,
      leave_type_name: lr.leaveTypeName,
      start_date: lr.startDate,
      end_date: lr.endDate,
      total_days: Number(lr.totalDays),
      total_hours: Number(lr.totalHours),
      reason: lr.reason,
      status: lr.status,
      approved_by: lr.approvedBy,
      approved_at: lr.approvedAt,
      rejected_reason: lr.rejectedReason,
      simplepay_synced: lr.simplePaySynced,
      simplepay_ids: lr.simplePayIds,
      created_at: lr.createdAt,
      updated_at: lr.updatedAt,
    }));

    return {
      leave_requests:
        transformedRequests as unknown as LeaveRequestResponseDto[],
      total: leaveRequests.length, // In a real implementation, use countByStaff with filter
      page: filter.page,
      limit: filter.limit,
    };
  }

  /**
   * Create a new leave request for a staff member
   */
  @Post(':staffId/leave/request')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a leave request for a staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({
    status: 201,
    description: 'Leave request created successfully',
    type: LeaveRequestResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async createLeaveRequest(
    @CurrentUser() user: IUser,
    @Param('staffId') staffId: string,
    @Body() dto: ApiCreateLeaveRequestDto,
  ): Promise<Record<string, unknown>> {
    // Verify staff belongs to tenant
    const staff = await this.staffRepository.findById(
      staffId,
      getTenantId(user),
    );
    if (!staff) {
      throw new NotFoundException('Staff member not found');
    }

    // Validate dates
    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new BadRequestException(
        'Invalid date format. Use ISO 8601 format.',
      );
    }

    if (endDate < startDate) {
      throw new BadRequestException('End date must be after start date');
    }

    // Transform snake_case input to camelCase for repository
    const createDto: CreateLeaveRequestDto = {
      tenantId: getTenantId(user),
      staffId,
      leaveTypeId: dto.leave_type_id,
      leaveTypeName: dto.leave_type_name,
      startDate,
      endDate,
      totalDays: dto.total_days,
      totalHours: dto.total_hours,
      reason: dto.reason,
    };

    try {
      const leaveRequest = await this.leaveRequestRepository.create(createDto);

      this.logger.log(
        `Created leave request ${leaveRequest.id} for staff ${staffId}`,
      );

      // Return snake_case response
      return {
        id: leaveRequest.id,
        tenant_id: leaveRequest.tenantId,
        staff_id: leaveRequest.staffId,
        leave_type_id: leaveRequest.leaveTypeId,
        leave_type_name: leaveRequest.leaveTypeName,
        start_date: leaveRequest.startDate,
        end_date: leaveRequest.endDate,
        total_days: Number(leaveRequest.totalDays),
        total_hours: Number(leaveRequest.totalHours),
        reason: leaveRequest.reason,
        status: leaveRequest.status,
        approved_by: leaveRequest.approvedBy,
        approved_at: leaveRequest.approvedAt,
        rejected_reason: leaveRequest.rejectedReason,
        simplepay_synced: leaveRequest.simplePaySynced,
        simplepay_ids: leaveRequest.simplePayIds,
        created_at: leaveRequest.createdAt,
        updated_at: leaveRequest.updatedAt,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create leave request for staff ${staffId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(
        error instanceof Error
          ? error.message
          : 'Failed to create leave request',
      );
    }
  }
}

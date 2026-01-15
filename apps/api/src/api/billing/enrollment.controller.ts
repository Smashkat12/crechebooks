/**
 * Enrollment Controller
 *
 * REST API endpoints for enrollment management:
 * GET /enrollments - List enrollments with filters
 * GET /enrollments/:id - Get enrollment details
 * PATCH /enrollments/:id/status - Update enrollment status
 * POST /enrollments/bulk/status - Bulk update statuses
 */

import {
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Body,
  Param,
  Logger,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { OffboardingService } from '../../database/services/offboarding.service';
import {
  AccountSettlement,
  OffboardingResult,
  CreditAction,
  OffboardingReason,
} from '../../database/dto/offboarding.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
import { NotFoundException } from '../../shared/exceptions';
import { YearEndReviewResult } from '../../database/dto/year-end-review.dto';

interface EnrollmentResponse {
  id: string;
  child_id: string;
  child_name: string;
  parent_id: string;
  parent_name: string;
  fee_tier_id: string;
  fee_tier_name: string;
  start_date: string;
  end_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

@Controller('enrollments')
@ApiTags('Enrollments')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EnrollmentController {
  private readonly logger = new Logger(EnrollmentController.name);

  constructor(
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly offboardingService: OffboardingService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List enrollments with filters' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'feeTierId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiResponse({ status: 200, description: 'List of enrollments' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listEnrollments(
    @CurrentUser() user: IUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('feeTierId') feeTierId?: string,
    @Query('search') search?: string,
  ): Promise<{
    success: boolean;
    data: EnrollmentResponse[];
    meta: { page: number; limit: number; total: number };
  }> {
    const tenantId = user.tenantId;
    const pageNum = parseInt(page || '1', 10);
    const limitNum = parseInt(limit || '20', 10);

    this.logger.debug(
      `Listing enrollments for tenant=${tenantId}, page=${pageNum}, limit=${limitNum}`,
    );

    // Get all enrollments with optional status filter
    const filter: { status?: EnrollmentStatus; feeStructureId?: string } = {};
    if (status) {
      const upperStatus = status.toUpperCase();
      if (
        Object.values(EnrollmentStatus).includes(
          upperStatus as EnrollmentStatus,
        )
      ) {
        filter.status = upperStatus as EnrollmentStatus;
      }
    }
    if (feeTierId) filter.feeStructureId = feeTierId;

    const allEnrollments = await this.enrollmentRepo.findByTenant(
      tenantId,
      filter,
    );

    // Build enriched enrollment list
    const enrichedEnrollments: EnrollmentResponse[] = [];

    for (const enrollment of allEnrollments) {
      const child = await this.childRepo.findById(enrollment.childId, tenantId);
      if (!child) continue;

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        const childName = `${child.firstName} ${child.lastName}`.toLowerCase();
        if (!childName.includes(searchLower)) {
          continue;
        }
      }

      const parent = await this.parentRepo.findById(child.parentId, tenantId);
      const feeStructure = await this.feeStructureRepo.findById(
        enrollment.feeStructureId,
        tenantId,
      );

      enrichedEnrollments.push({
        id: enrollment.id,
        child_id: child.id,
        child_name: `${child.firstName} ${child.lastName}`,
        parent_id: parent?.id || '',
        parent_name: parent
          ? `${parent.firstName} ${parent.lastName}`
          : 'Unknown',
        fee_tier_id: feeStructure?.id || '',
        fee_tier_name: feeStructure?.name || 'Unknown',
        start_date: enrollment.startDate.toISOString().split('T')[0],
        end_date: enrollment.endDate
          ? enrollment.endDate.toISOString().split('T')[0]
          : null,
        status: enrollment.status.toLowerCase(),
        created_at: enrollment.createdAt.toISOString(),
        updated_at: enrollment.updatedAt.toISOString(),
      });
    }

    // Pagination
    const total = enrichedEnrollments.length;
    const startIndex = (pageNum - 1) * limitNum;
    const paginatedEnrollments = enrichedEnrollments.slice(
      startIndex,
      startIndex + limitNum,
    );

    return {
      success: true,
      data: paginatedEnrollments,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get enrollment details' })
  @ApiResponse({ status: 200, description: 'Enrollment details' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  async getEnrollment(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; data: EnrollmentResponse }> {
    const enrollment = await this.enrollmentRepo.findById(id, user.tenantId);
    if (!enrollment) {
      throw new NotFoundException('Enrollment', id);
    }

    const child = await this.childRepo.findById(
      enrollment.childId,
      user.tenantId,
    );
    if (!child) throw new NotFoundException('Child', enrollment.childId);

    const parent = await this.parentRepo.findById(
      child.parentId,
      user.tenantId,
    );
    const feeStructure = await this.feeStructureRepo.findById(
      enrollment.feeStructureId,
      user.tenantId,
    );

    return {
      success: true,
      data: {
        id: enrollment.id,
        child_id: child.id,
        child_name: `${child.firstName} ${child.lastName}`,
        parent_id: parent?.id || '',
        parent_name: parent
          ? `${parent.firstName} ${parent.lastName}`
          : 'Unknown',
        fee_tier_id: feeStructure?.id || '',
        fee_tier_name: feeStructure?.name || 'Unknown',
        start_date: enrollment.startDate.toISOString().split('T')[0],
        end_date: enrollment.endDate
          ? enrollment.endDate.toISOString().split('T')[0]
          : null,
        status: enrollment.status.toLowerCase(),
        created_at: enrollment.createdAt.toISOString(),
        updated_at: enrollment.updatedAt.toISOString(),
      },
    };
  }

  @Patch(':id/status')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update enrollment status' })
  @ApiResponse({ status: 200, description: 'Enrollment updated' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async updateStatus(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { status: string },
  ): Promise<{ success: boolean; data: EnrollmentResponse }> {
    this.logger.log(`Update enrollment status: ${id} -> ${body.status}`);

    const enrollment = await this.enrollmentRepo.findById(id, user.tenantId);
    if (!enrollment) {
      throw new NotFoundException('Enrollment', id);
    }

    const upperStatus = body.status.toUpperCase();
    if (
      !Object.values(EnrollmentStatus).includes(upperStatus as EnrollmentStatus)
    ) {
      throw new Error(
        `Invalid status: ${body.status}. Valid values: ${Object.values(EnrollmentStatus).join(', ')}`,
      );
    }

    const updated = await this.enrollmentRepo.update(id, user.tenantId, {
      status: upperStatus as EnrollmentStatus,
    });

    const child = await this.childRepo.findById(updated.childId, user.tenantId);
    if (!child) throw new NotFoundException('Child', updated.childId);

    const parent = await this.parentRepo.findById(
      child.parentId,
      user.tenantId,
    );
    const feeStructure = await this.feeStructureRepo.findById(
      updated.feeStructureId,
      user.tenantId,
    );

    return {
      success: true,
      data: {
        id: updated.id,
        child_id: child.id,
        child_name: `${child.firstName} ${child.lastName}`,
        parent_id: parent?.id || '',
        parent_name: parent
          ? `${parent.firstName} ${parent.lastName}`
          : 'Unknown',
        fee_tier_id: feeStructure?.id || '',
        fee_tier_name: feeStructure?.name || 'Unknown',
        start_date: updated.startDate.toISOString().split('T')[0],
        end_date: updated.endDate
          ? updated.endDate.toISOString().split('T')[0]
          : null,
        status: updated.status.toLowerCase(),
        created_at: updated.createdAt.toISOString(),
        updated_at: updated.updatedAt.toISOString(),
      },
    };
  }

  @Post('bulk/status')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bulk update enrollment statuses' })
  @ApiResponse({ status: 200, description: 'Enrollments updated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async bulkUpdateStatus(
    @CurrentUser() user: IUser,
    @Body() body: { enrollment_ids: string[]; status: string },
  ): Promise<{ success: boolean; count: number }> {
    this.logger.log(
      `Bulk update enrollment statuses: ${body.enrollment_ids.length} enrollments`,
    );

    const upperStatus = body.status.toUpperCase();
    if (
      !Object.values(EnrollmentStatus).includes(upperStatus as EnrollmentStatus)
    ) {
      throw new Error(
        `Invalid status: ${body.status}. Valid values: ${Object.values(EnrollmentStatus).join(', ')}`,
      );
    }

    let count = 0;
    for (const id of body.enrollment_ids) {
      const enrollment = await this.enrollmentRepo.findById(id, user.tenantId);
      if (enrollment) {
        await this.enrollmentRepo.update(id, user.tenantId, {
          status: upperStatus as EnrollmentStatus,
        });
        count++;
      }
    }

    return { success: true, count };
  }

  @Post('bulk/graduate')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Bulk graduate enrollments (year-end processing)' })
  @ApiResponse({ status: 200, description: 'Enrollments graduated' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async bulkGraduate(
    @CurrentUser() user: IUser,
    @Body() body: { enrollment_ids: string[]; end_date: string },
  ): Promise<{ success: boolean; graduated: number; skipped: number }> {
    this.logger.log(
      `Bulk graduate enrollments: ${body.enrollment_ids.length} enrollments, end_date=${body.end_date}`,
    );

    // Parse and validate end_date
    const endDate = new Date(body.end_date);
    if (isNaN(endDate.getTime())) {
      throw new Error(
        'Invalid end_date format. Use ISO date string (YYYY-MM-DD)',
      );
    }

    const result = await this.enrollmentService.bulkGraduate(
      user.tenantId,
      body.enrollment_ids,
      endDate,
      user.id,
    );

    return {
      success: true,
      graduated: result.graduated,
      skipped: result.skipped,
    };
  }

  /**
   * GET /enrollments/year-end/review
   * TASK-ENROL-004: Year-End Processing Dashboard
   *
   * Returns year-end review data with students grouped by category
   * (continuing, graduating, withdrawing)
   */
  @Get('year-end/review')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get year-end review for academic year' })
  @ApiQuery({
    name: 'year',
    required: false,
    type: Number,
    description: 'Academic year (defaults to current/next based on month)',
  })
  @ApiResponse({ status: 200, description: 'Year-end review data' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getYearEndReview(
    @CurrentUser() user: IUser,
    @Query('year') yearStr?: string,
  ): Promise<{ success: boolean; data: YearEndReviewResult }> {
    // Determine academic year (default: current year if before July, next year if after)
    let year: number;
    if (yearStr) {
      year = parseInt(yearStr, 10);
      if (isNaN(year) || year < 2020 || year > 2100) {
        throw new Error('Invalid year. Must be between 2020 and 2100.');
      }
    } else {
      const now = new Date();
      const currentMonth = now.getMonth(); // 0-11
      // If we're in November or December, default to next year
      // Otherwise default to current year
      year = currentMonth >= 10 ? now.getFullYear() + 1 : now.getFullYear();
    }

    this.logger.log(
      `Year-end review requested for tenant ${user.tenantId}, year ${year}`,
    );

    const result = await this.enrollmentService.getYearEndReview(
      user.tenantId,
      year,
    );

    return {
      success: true,
      data: result,
    };
  }

  /**
   * GET /enrollments/:id/settlement-preview
   * TASK-ENROL-005: Off-Boarding Workflow
   *
   * Preview account settlement for an enrollment before off-boarding
   */
  @Get(':id/settlement-preview')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Preview account settlement for off-boarding' })
  @ApiQuery({
    name: 'end_date',
    required: true,
    type: String,
    description: 'Off-boarding date (YYYY-MM-DD)',
  })
  @ApiResponse({ status: 200, description: 'Account settlement preview' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async getSettlementPreview(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) enrollmentId: string,
    @Query('end_date') endDateStr: string,
  ): Promise<{ success: boolean; data: AccountSettlement }> {
    const endDate = new Date(endDateStr);
    if (isNaN(endDate.getTime())) {
      throw new Error(
        'Invalid end_date format. Use ISO date string (YYYY-MM-DD)',
      );
    }

    this.logger.log(
      `Settlement preview for enrollment ${enrollmentId}, end_date=${endDateStr}`,
    );

    const settlement = await this.offboardingService.calculateAccountSettlement(
      user.tenantId,
      enrollmentId,
      endDate,
    );

    return {
      success: true,
      data: settlement,
    };
  }

  /**
   * POST /enrollments/:id/offboard
   * TASK-ENROL-005: Off-Boarding Workflow
   *
   * Initiate off-boarding for an enrollment
   */
  @Post(':id/offboard')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Initiate off-boarding for an enrollment' })
  @ApiResponse({ status: 200, description: 'Off-boarding completed' })
  @ApiNotFoundResponse({ description: 'Enrollment not found' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async offboardEnrollment(
    @CurrentUser() user: IUser,
    @Param('id', ParseUUIDPipe) enrollmentId: string,
    @Body()
    body: {
      end_date: string;
      reason: OffboardingReason;
      credit_action: CreditAction;
      sibling_enrollment_id?: string;
    },
  ): Promise<{ success: boolean; data: OffboardingResult }> {
    const endDate = new Date(body.end_date);
    if (isNaN(endDate.getTime())) {
      throw new Error(
        'Invalid end_date format. Use ISO date string (YYYY-MM-DD)',
      );
    }

    this.logger.log(
      `Off-boarding enrollment ${enrollmentId}: reason=${body.reason}, credit_action=${body.credit_action}`,
    );

    const result = await this.offboardingService.initiateOffboarding(
      user.tenantId,
      enrollmentId,
      endDate,
      body.reason,
      body.credit_action,
      body.sibling_enrollment_id,
      user.id,
    );

    return {
      success: true,
      data: result,
    };
  }
}

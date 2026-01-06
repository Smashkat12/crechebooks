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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
import { NotFoundException } from '../../shared/exceptions';

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
      const child = await this.childRepo.findById(enrollment.childId);
      if (!child) continue;

      // Apply search filter if provided
      if (search) {
        const searchLower = search.toLowerCase();
        const childName = `${child.firstName} ${child.lastName}`.toLowerCase();
        if (!childName.includes(searchLower)) {
          continue;
        }
      }

      const parent = await this.parentRepo.findById(child.parentId);
      const feeStructure = await this.feeStructureRepo.findById(
        enrollment.feeStructureId,
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
    const enrollment = await this.enrollmentRepo.findById(id);
    if (!enrollment || enrollment.tenantId !== user.tenantId) {
      throw new NotFoundException('Enrollment', id);
    }

    const child = await this.childRepo.findById(enrollment.childId);
    if (!child) throw new NotFoundException('Child', enrollment.childId);

    const parent = await this.parentRepo.findById(child.parentId);
    const feeStructure = await this.feeStructureRepo.findById(
      enrollment.feeStructureId,
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

    const enrollment = await this.enrollmentRepo.findById(id);
    if (!enrollment || enrollment.tenantId !== user.tenantId) {
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

    const updated = await this.enrollmentRepo.update(id, {
      status: upperStatus as EnrollmentStatus,
    });

    const child = await this.childRepo.findById(updated.childId);
    if (!child) throw new NotFoundException('Child', updated.childId);

    const parent = await this.parentRepo.findById(child.parentId);
    const feeStructure = await this.feeStructureRepo.findById(
      updated.feeStructureId,
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
      const enrollment = await this.enrollmentRepo.findById(id);
      if (enrollment && enrollment.tenantId === user.tenantId) {
        await this.enrollmentRepo.update(id, {
          status: upperStatus as EnrollmentStatus,
        });
        count++;
      }
    }

    return { success: true, count };
  }
}

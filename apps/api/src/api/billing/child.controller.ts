/**
 * Child Controller
 * TASK-BILL-034: Child Enrollment Endpoints
 *
 * @module api/billing/child.controller
 * @description REST endpoints for child enrollment management.
 * POST /children - Register child with initial enrollment
 * GET /children - List children with pagination
 * GET /children/:id - Get child details
 * PUT /children/:id - Update child details
 *
 * CRITICAL: Fail-fast with detailed error logging.
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 */

import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Body,
  Param,
  Logger,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { WelcomePackDeliveryService } from '../../database/services/welcome-pack-delivery.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { NotFoundException } from '../../shared/exceptions';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
import {
  EnrollChildDto,
  EnrollChildResponseDto,
  ChildDetailResponseDto,
  ChildListResponseDto,
  ListChildrenQueryDto,
  UpdateChildDto as ApiUpdateChildDto,
} from './dto';

@Controller('children')
@ApiTags('Children')
@ApiBearerAuth('JWT-auth')
export class ChildController {
  private readonly logger = new Logger(ChildController.name);

  constructor(
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly welcomePackDeliveryService: WelcomePackDeliveryService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Register a new child with initial enrollment',
    description:
      'Creates a child record and enrolls them in a fee structure atomically.',
  })
  @ApiResponse({ status: 201, type: EnrollChildResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiNotFoundResponse({ description: 'Parent or fee structure not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async enrollChild(
    @Body() dto: EnrollChildDto,
    @CurrentUser() user: IUser,
  ): Promise<EnrollChildResponseDto> {
    this.logger.log(
      `Enroll child: tenant=${getTenantId(user)}, parent=${dto.parent_id}`,
    );

    // 1. Validate parent exists and belongs to tenant
    const parent = await this.parentRepo.findById(
      dto.parent_id,
      getTenantId(user),
    );
    if (!parent) {
      this.logger.error(
        `Parent not found: ${dto.parent_id} for tenant ${getTenantId(user)}`,
      );
      throw new NotFoundException('Parent', dto.parent_id);
    }

    // 2. Validate fee structure exists and belongs to tenant
    const feeStructure = await this.feeStructureRepo.findById(
      dto.fee_structure_id,
      getTenantId(user),
    );
    if (!feeStructure) {
      this.logger.error(
        `Fee structure not found: ${dto.fee_structure_id} for tenant ${getTenantId(user)}`,
      );
      throw new NotFoundException('FeeStructure', dto.fee_structure_id);
    }

    // 3. Create child (API snake_case -> Repository camelCase)
    const child = await this.childRepo.create({
      tenantId: getTenantId(user),
      parentId: dto.parent_id,
      firstName: dto.first_name,
      lastName: dto.last_name,
      dateOfBirth: new Date(dto.date_of_birth),
      gender: dto.gender,
      medicalNotes: dto.medical_notes,
      emergencyContact: dto.emergency_contact,
      emergencyPhone: dto.emergency_phone,
    });

    this.logger.log(`Created child: ${child.id}`);

    // 4. Create enrollment using service (handles validation, audit, invoice generation, welcome pack)
    // NOTE: allowHistoricDates=true enables historical data imports (e.g., Jan 2023 enrollments)
    const {
      enrollment,
      invoice,
      invoiceError,
      welcomePackSent,
      welcomePackError,
    } = await this.enrollmentService.enrollChild(
      getTenantId(user),
      child.id,
      dto.fee_structure_id,
      new Date(dto.start_date),
      user.id,
      true, // Allow historic dates for data imports
    );

    this.logger.log(`Created enrollment: ${enrollment.id}`);
    if (invoice) {
      this.logger.log(`Created enrollment invoice: ${invoice.invoiceNumber}`);
    }
    if (invoiceError) {
      this.logger.warn(
        `Invoice creation failed for enrollment ${enrollment.id}: ${invoiceError}`,
      );
    }
    if (welcomePackSent) {
      this.logger.log(`Welcome pack sent for enrollment ${enrollment.id}`);
    }
    if (welcomePackError) {
      this.logger.warn(
        `Welcome pack failed for enrollment ${enrollment.id}: ${welcomePackError}`,
      );
    }

    // 5. Transform to response (camelCase -> snake_case)
    return {
      success: true,
      data: {
        child: {
          id: child.id,
          first_name: child.firstName,
          last_name: child.lastName,
        },
        enrollment: {
          id: enrollment.id,
          fee_structure: {
            id: feeStructure.id,
            name: feeStructure.name,
            amount: feeStructure.amountCents / 100,
          },
          start_date: enrollment.startDate.toISOString().split('T')[0],
          end_date: enrollment.endDate
            ? enrollment.endDate.toISOString().split('T')[0]
            : undefined,
          status: enrollment.status,
        },
        // TASK-BILL-023: Include invoice in response for UI display
        invoice: invoice
          ? {
              id: invoice.id,
              invoice_number: invoice.invoiceNumber,
              total: invoice.totalCents / 100,
              due_date: invoice.dueDate.toISOString().split('T')[0],
              status: invoice.status,
            }
          : null,
        // Surface invoice creation errors so they're not hidden from API consumers
        invoice_error: invoiceError || null,
        // TASK-ENROL-008: Include welcome pack status
        welcome_pack_sent: welcomePackSent || false,
        welcome_pack_error: welcomePackError || null,
      },
    };
  }

  @Post(':childId/enrollments/:enrollmentId/resend-welcome-pack')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Resend welcome pack email for enrollment',
    description:
      'Resends the welcome pack email with PDF attachment for an existing enrollment.',
  })
  @ApiResponse({
    status: 200,
    description: 'Welcome pack resent successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        sent_at: { type: 'string', format: 'date-time' },
        recipient_email: { type: 'string' },
        error: { type: 'string', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Enrollment not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async resendWelcomePack(
    @Param('childId', ParseUUIDPipe) childId: string,
    @Param('enrollmentId', ParseUUIDPipe) enrollmentId: string,
    @CurrentUser() user: IUser,
  ): Promise<{
    success: boolean;
    sent_at?: string;
    recipient_email?: string;
    error?: string | null;
  }> {
    this.logger.log(
      `Resend welcome pack: enrollment=${enrollmentId}, child=${childId}, tenant=${getTenantId(user)}`,
    );

    // 1. Verify enrollment exists and belongs to child and tenant
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      getTenantId(user),
    );
    if (!enrollment) {
      this.logger.error(
        `Enrollment not found: ${enrollmentId} for tenant ${getTenantId(user)}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // 2. Verify enrollment belongs to the specified child
    if (enrollment.childId !== childId) {
      this.logger.error(
        `Enrollment ${enrollmentId} does not belong to child ${childId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // 3. Send welcome pack
    const result = await this.welcomePackDeliveryService.sendWelcomePack(
      getTenantId(user),
      enrollmentId,
    );

    if (result.success) {
      this.logger.log(
        `Welcome pack resent successfully for enrollment ${enrollmentId}`,
      );
    } else {
      this.logger.warn(
        `Welcome pack resend failed for enrollment ${enrollmentId}: ${result.error}`,
      );
    }

    return {
      success: result.success,
      sent_at: result.sentAt?.toISOString(),
      recipient_email: result.recipientEmail,
      error: result.error || null,
    };
  }

  @Get()
  @ApiOperation({
    summary: 'List children with pagination and filtering',
    description:
      'Returns paginated list of children for the authenticated tenant.',
  })
  @ApiResponse({ status: 200, type: ChildListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listChildren(
    @Query() query: ListChildrenQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<ChildListResponseDto> {
    const tenantId = getTenantId(user);

    this.logger.debug(
      `Listing children for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // 1. Fetch all children with filter (repository returns all, we paginate)
    let allChildren = await this.childRepo.findByTenant(tenantId, {
      parentId: query.parent_id,
      search: query.search,
    });

    // 2. Get enrollments for all children if filtering by enrollment status
    const childEnrollmentMap = new Map<string, string | null>();
    if (query.enrollment_status || allChildren.length > 0) {
      for (const child of allChildren) {
        const activeEnrollment = await this.enrollmentRepo.findActiveByChild(
          tenantId,
          child.id,
        );
        childEnrollmentMap.set(
          child.id,
          activeEnrollment ? activeEnrollment.status : null,
        );
      }

      // Filter by enrollment status if specified
      if (query.enrollment_status) {
        allChildren = allChildren.filter((child) => {
          const enrollmentStatus = childEnrollmentMap.get(child.id);
          return enrollmentStatus === query.enrollment_status;
        });
      }
    }

    // 3. Pagination
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = allChildren.length;
    const totalPages = Math.ceil(total / limit);
    const skip = (page - 1) * limit;
    const paginatedChildren = allChildren.slice(skip, skip + limit);

    // 4. Fetch parent data for all children
    const parentIds = [...new Set(paginatedChildren.map((c) => c.parentId))];
    const parentMap = new Map<
      string,
      { id: string; name: string; email: string }
    >();
    for (const parentId of parentIds) {
      const parent = await this.parentRepo.findById(parentId, tenantId);
      if (parent) {
        parentMap.set(parentId, {
          id: parent.id,
          name: `${parent.firstName} ${parent.lastName}`,
          email: parent.email ?? '',
        });
      }
    }

    // 4b. Fetch current enrollment with fee structure for all paginated children
    const enrollmentDetailsMap = new Map<
      string,
      {
        id: string;
        fee_structure: { id: string; name: string; amount: number };
        status: EnrollmentStatus;
      } | null
    >();
    for (const child of paginatedChildren) {
      const activeEnrollment = await this.enrollmentRepo.findActiveByChild(
        tenantId,
        child.id,
      );
      if (activeEnrollment) {
        const feeStructure = await this.feeStructureRepo.findById(
          activeEnrollment.feeStructureId,
          tenantId,
        );
        if (feeStructure) {
          enrollmentDetailsMap.set(child.id, {
            id: activeEnrollment.id,
            fee_structure: {
              id: feeStructure.id,
              name: feeStructure.name,
              amount: feeStructure.amountCents / 100,
            },
            status: activeEnrollment.status as EnrollmentStatus,
          });
        } else {
          enrollmentDetailsMap.set(child.id, null);
        }
      } else {
        enrollmentDetailsMap.set(child.id, null);
      }
    }

    // 5. Transform to response
    const data = paginatedChildren.map((child) => {
      const parent = parentMap.get(child.parentId);
      if (!parent) {
        this.logger.error(`Parent not found for child ${child.id}`);
        throw new Error(`Failed to load parent for child ${child.id}`);
      }

      return {
        id: child.id,
        first_name: child.firstName,
        last_name: child.lastName,
        date_of_birth: child.dateOfBirth.toISOString().split('T')[0],
        parent,
        enrollment_status: childEnrollmentMap.get(
          child.id,
        ) as EnrollmentStatus | null,
        current_enrollment: enrollmentDetailsMap.get(child.id) || null,
      };
    });

    // TASK-DATA-004: Include hasNext/hasPrev in pagination metadata
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      success: true,
      data,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNext,
        hasPrev,
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get child details by ID',
    description:
      'Returns full child details including current enrollment and parent info.',
  })
  @ApiResponse({ status: 200, type: ChildDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Child not found' })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async getChild(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: IUser,
  ): Promise<ChildDetailResponseDto> {
    this.logger.debug(`Getting child: ${id} for tenant ${getTenantId(user)}`);

    // 1. Find child and verify tenant isolation
    const child = await this.childRepo.findById(id, getTenantId(user));
    if (!child) {
      this.logger.error(
        `Child not found: ${id} for tenant ${getTenantId(user)}`,
      );
      throw new NotFoundException('Child', id);
    }

    // 2. Find parent
    const parent = await this.parentRepo.findById(
      child.parentId,
      getTenantId(user),
    );
    if (!parent) {
      this.logger.error(`Parent ${child.parentId} not found for child ${id}`);
      throw new Error(`Failed to load parent for child ${id}`);
    }

    // 3. Find current enrollment (if any)
    const activeEnrollment = await this.enrollmentRepo.findActiveByChild(
      getTenantId(user),
      id,
    );

    let currentEnrollment: {
      id: string;
      fee_structure: { id: string; name: string; amount: number };
      start_date: string;
      end_date?: string;
      status: EnrollmentStatus;
    } | null = null;

    if (activeEnrollment) {
      const feeStructure = await this.feeStructureRepo.findById(
        activeEnrollment.feeStructureId,
        getTenantId(user),
      );
      if (!feeStructure) {
        this.logger.error(
          `Fee structure ${activeEnrollment.feeStructureId} not found for enrollment ${activeEnrollment.id}`,
        );
        throw new Error(`Failed to load fee structure for enrollment`);
      }

      currentEnrollment = {
        id: activeEnrollment.id,
        fee_structure: {
          id: feeStructure.id,
          name: feeStructure.name,
          amount: feeStructure.amountCents / 100,
        },
        start_date: activeEnrollment.startDate.toISOString().split('T')[0],
        end_date: activeEnrollment.endDate
          ? activeEnrollment.endDate.toISOString().split('T')[0]
          : undefined,
        status: activeEnrollment.status as EnrollmentStatus,
      };
    }

    // 4. Transform to response
    return {
      success: true,
      data: {
        id: child.id,
        first_name: child.firstName,
        last_name: child.lastName,
        date_of_birth: child.dateOfBirth.toISOString().split('T')[0],
        gender: child.gender as
          | import('../../database/entities/child.entity').Gender
          | null,
        parent: {
          id: parent.id,
          name: `${parent.firstName} ${parent.lastName}`,
          email: parent.email ?? '',
        },
        current_enrollment: currentEnrollment,
        medical_notes: child.medicalNotes,
        emergency_contact: child.emergencyContact,
        emergency_phone: child.emergencyPhone,
        created_at: child.createdAt,
      },
    };
  }

  @Put(':id')
  @HttpCode(200)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Update child details',
    description:
      'Updates child contact/medical info. Cannot change enrollment.',
  })
  @ApiResponse({ status: 200, type: ChildDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Child not found' })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions (requires OWNER or ADMIN)',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async updateChild(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApiUpdateChildDto,
    @CurrentUser() user: IUser,
  ): Promise<ChildDetailResponseDto> {
    this.logger.log(`Update child: ${id} for tenant ${getTenantId(user)}`);

    // 1. Find child and verify tenant isolation
    const child = await this.childRepo.findById(id, getTenantId(user));
    if (!child) {
      this.logger.error(
        `Child not found: ${id} for tenant ${getTenantId(user)}`,
      );
      throw new NotFoundException('Child', id);
    }

    // 2. Update child (API snake_case -> Repository camelCase)
    const updated = await this.childRepo.update(id, getTenantId(user), {
      firstName: dto.first_name,
      lastName: dto.last_name,
      gender: dto.gender,
      medicalNotes: dto.medical_notes,
      emergencyContact: dto.emergency_contact,
      emergencyPhone: dto.emergency_phone,
    });

    this.logger.log(`Updated child: ${updated.id}`);

    // 3. Return full child details (reuse getChild logic)
    return this.getChild(id, user);
  }
}

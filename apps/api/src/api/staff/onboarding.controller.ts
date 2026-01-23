/**
 * Staff Onboarding Controller
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Endpoints for managing staff onboarding including:
 * - Onboarding workflow initiation and completion
 * - Checklist item management
 * - Document upload and verification
 * - Welcome pack PDF generation
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  HttpStatus,
  HttpCode,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { getTenantId } from '../auth/utils/tenant-assertions';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as archiver from 'archiver';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../database/entities/user.entity';
import { StaffOnboardingService } from '../../database/services/staff-onboarding.service';
import { StaffDocumentService } from '../../database/services/staff-document.service';
import { WelcomePackPdfService } from '../../database/services/welcome-pack-pdf.service';
import { EmailService } from '../../integrations/email/email.service';
import {
  InitiateOnboardingDto,
  UpdateChecklistItemDto,
  CompleteChecklistItemDto,
  CompleteOnboardingDto,
  CreateStaffDocumentDto,
  VerifyDocumentDto,
  RejectDocumentDto,
  WelcomePackOptions,
  UpdateStepDto,
  SignDocumentDto,
  GeneratedDocumentType,
} from '../../database/dto/staff-onboarding.dto';
import {
  OnboardingStatus,
  ChecklistItemStatus,
  DocumentType,
} from '../../database/entities/staff-onboarding.entity';
import * as fs from 'fs';

@Controller()
@ApiTags('Staff Onboarding')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffOnboardingController {
  private readonly logger = new Logger(StaffOnboardingController.name);

  constructor(
    private readonly onboardingService: StaffOnboardingService,
    private readonly documentService: StaffDocumentService,
    private readonly welcomePackService: WelcomePackPdfService,
    private readonly emailService: EmailService,
  ) {}

  // ============ Primary Staff Onboarding Endpoints (TASK-STAFF-001) ============

  /**
   * POST /api/staff/:staffId/onboarding
   * Initiate onboarding for a specific staff member
   */
  @Post('staff/:staffId/onboarding')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Initiate onboarding for a staff member',
    description:
      'Creates an onboarding record with default DSD compliance checklist items for a staff member',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID (UUID)' })
  @ApiResponse({
    status: 201,
    description: 'Onboarding initiated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or onboarding already exists',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async initiateOnboardingForStaff(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @Body() dto: Omit<InitiateOnboardingDto, 'staffId'>,
  ) {
    this.logger.log(
      `Initiating onboarding for staff ${staffId} by user ${user.id}`,
    );
    const fullDto: InitiateOnboardingDto = { ...dto, staffId };
    return this.onboardingService.initiateOnboarding(
      getTenantId(user),
      fullDto,
      user.id,
    );
  }

  /**
   * GET /api/staff/:staffId/onboarding
   * Get onboarding status and progress for a specific staff member
   */
  @Get('staff/:staffId/onboarding')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get onboarding status and progress',
    description:
      'Returns the complete onboarding progress including checklist items, documents, and completion percentage',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Onboarding progress details' })
  @ApiResponse({ status: 404, description: 'Onboarding not found for staff' })
  async getOnboardingByStaffId(@Param('staffId') staffId: string) {
    this.logger.debug(`Getting onboarding for staff ${staffId}`);
    return this.onboardingService.getOnboardingByStaffId(staffId);
  }

  /**
   * PATCH /api/staff/:staffId/onboarding/checklist/:itemId
   * Update checklist item status for a staff's onboarding
   */
  @Patch('staff/:staffId/onboarding/checklist/:itemId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update onboarding checklist item status',
    description:
      'Updates the status and/or notes for a specific checklist item in the staff onboarding workflow',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID (UUID)' })
  @ApiParam({ name: 'itemId', description: 'Checklist item ID (UUID)' })
  @ApiResponse({ status: 200, description: 'Checklist item updated' })
  @ApiResponse({
    status: 404,
    description: 'Checklist item or onboarding not found',
  })
  async updateChecklistItemForStaff(
    @Param('staffId') staffId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: IUser,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    this.logger.log(
      `Updating checklist item ${itemId} for staff ${staffId} by user ${user.id}`,
    );
    await this.onboardingService.updateChecklistItem(
      itemId,
      dto.status as ChecklistItemStatus,
      user.id,
      dto.notes,
    );
    return { success: true, message: 'Checklist item updated' };
  }

  /**
   * POST /api/staff/:staffId/onboarding/complete
   * Complete onboarding for a specific staff member
   */
  @Post('staff/:staffId/onboarding/complete')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete onboarding workflow',
    description:
      'Marks onboarding as complete. All required DSD compliance checklist items must be finished.',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'Onboarding completed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Incomplete required items or invalid status',
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found for staff' })
  async completeOnboardingForStaff(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @Body() dto: CompleteOnboardingDto,
  ) {
    this.logger.log(
      `Completing onboarding for staff ${staffId} by user ${user.id}`,
    );
    const onboarding =
      await this.onboardingService.getOnboardingByStaffId(staffId);
    if (!onboarding) {
      throw new BadRequestException('Onboarding not found for staff');
    }
    await this.onboardingService.completeOnboarding(
      onboarding.onboarding.id,
      dto,
      getTenantId(user),
    );
    return { success: true, message: 'Onboarding completed' };
  }

  /**
   * GET /api/staff/:staffId/onboarding/dsd-compliance
   * Get DSD (Department of Social Development) compliance status
   */
  @Get('staff/:staffId/onboarding/dsd-compliance')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get DSD compliance status',
    description:
      'Returns the DSD (Department of Social Development) compliance status for a staff member, including completed items, missing items, and expiring documents',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID (UUID)' })
  @ApiResponse({
    status: 200,
    description: 'DSD compliance status',
    schema: {
      type: 'object',
      properties: {
        isCompliant: {
          type: 'boolean',
          description: 'Whether staff meets all DSD requirements',
        },
        completedItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of completed DSD items',
        },
        missingItems: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of missing DSD items',
        },
        expiringDocuments: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              type: { type: 'string' },
              expiryDate: { type: 'string', format: 'date-time' },
            },
          },
          description: 'Documents expiring within 30 days',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getDsdComplianceStatus(@Param('staffId') staffId: string) {
    this.logger.debug(`Getting DSD compliance status for staff ${staffId}`);
    return this.onboardingService.getDsdComplianceStatus(staffId);
  }

  /**
   * GET /api/tenants/:tenantId/onboardings
   * Get all onboardings for a tenant
   */
  @Get('tenants/:tenantId/onboardings')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get all onboardings for tenant',
    description:
      'Returns a list of all onboardings for a specific tenant with optional status filtering',
  })
  @ApiParam({ name: 'tenantId', description: 'Tenant ID (UUID)' })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OnboardingStatus,
    description: 'Filter by onboarding status',
  })
  @ApiResponse({ status: 200, description: 'List of onboardings' })
  @ApiResponse({ status: 403, description: 'Access denied to tenant data' })
  async getOnboardingsForTenant(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: IUser,
    @Query('status') status?: OnboardingStatus,
  ) {
    // Verify user has access to the tenant
    if (getTenantId(user) !== tenantId) {
      throw new BadRequestException('Access denied to tenant data');
    }
    this.logger.debug(`Listing onboardings for tenant ${tenantId}`);
    return this.onboardingService.getOnboardingsByTenant(tenantId, status);
  }

  // ============ Legacy Onboarding Endpoints (backwards compatibility) ============

  @Post('staff/onboarding')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: '[Legacy] Initiate onboarding for a new staff member',
    description:
      'Creates an onboarding record with default checklist items for a staff member',
  })
  @ApiResponse({
    status: 201,
    description: 'Onboarding initiated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or onboarding already exists',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async initiateOnboarding(
    @CurrentUser() user: IUser,
    @Body() dto: InitiateOnboardingDto,
  ) {
    this.logger.log(
      `Initiating onboarding for staff ${dto.staffId} by user ${user.id}`,
    );
    return this.onboardingService.initiateOnboarding(
      getTenantId(user),
      dto,
      user.id,
    );
  }

  @Get('staff/onboarding')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: '[Legacy] Get all onboardings for tenant',
    description: 'Returns list of onboardings with optional status filter',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: OnboardingStatus,
    description: 'Filter by onboarding status',
  })
  @ApiResponse({ status: 200, description: 'List of onboardings' })
  async getOnboardings(
    @CurrentUser() user: IUser,
    @Query('status') status?: OnboardingStatus,
  ) {
    this.logger.debug(`Listing onboardings for tenant ${getTenantId(user)}`);
    return this.onboardingService.getOnboardingsByTenant(
      getTenantId(user),
      status,
    );
  }

  @Get('staff/onboarding/dashboard')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get onboarding dashboard statistics',
    description:
      'Returns aggregated stats including pending documents and recent onboardings',
  })
  @ApiResponse({ status: 200, description: 'Dashboard statistics' })
  async getDashboard(@CurrentUser() user: IUser) {
    this.logger.debug(`Getting dashboard for tenant ${getTenantId(user)}`);
    return this.onboardingService.getDashboardStats(getTenantId(user));
  }

  @Get('staff/onboarding/staff/:staffId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: '[Legacy] Get onboarding by staff ID',
    description: 'Returns onboarding progress for a specific staff member',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 200, description: 'Onboarding progress' })
  @ApiResponse({ status: 404, description: 'Onboarding not found for staff' })
  async getOnboardingByStaff(@Param('staffId') staffId: string) {
    this.logger.debug(`Getting onboarding for staff ${staffId}`);
    return this.onboardingService.getOnboardingByStaffId(staffId);
  }

  @Patch('staff/onboarding/staff/:staffId/step')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update onboarding step',
    description:
      'Updates a specific step in the onboarding wizard with form data and advances to next step',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({
    status: 200,
    description: 'Step updated successfully, returns updated progress',
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found for staff' })
  async updateOnboardingStep(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @Body() dto: UpdateStepDto,
  ) {
    this.logger.log(`Updating step ${dto.step} for staff ${staffId}`);
    return this.onboardingService.updateOnboardingStep(
      staffId,
      dto,
      user.id,
      getTenantId(user),
    );
  }

  @Get('staff/onboarding/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get onboarding progress by ID',
    description:
      'Returns full onboarding progress with checklist items and documents',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({ status: 200, description: 'Onboarding progress details' })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async getOnboardingProgress(@Param('id') id: string) {
    this.logger.debug(`Getting onboarding progress for ${id}`);
    return this.onboardingService.getOnboardingProgress(id);
  }

  @Post('staff/onboarding/:id/complete')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '[Legacy] Complete onboarding workflow',
    description:
      'Marks onboarding as complete. All required checklist items must be finished.',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({ status: 200, description: 'Onboarding completed' })
  @ApiResponse({
    status: 400,
    description: 'Incomplete required items or invalid status',
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async completeOnboarding(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Body() dto: CompleteOnboardingDto,
  ) {
    this.logger.log(`Completing onboarding ${id} by user ${user.id}`);
    await this.onboardingService.completeOnboarding(id, dto, getTenantId(user));
    return { success: true, message: 'Onboarding completed' };
  }

  @Post('staff/onboarding/:id/cancel')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel onboarding workflow',
    description:
      'Cancels an in-progress onboarding. Cannot cancel completed onboardings.',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({ status: 200, description: 'Onboarding cancelled' })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel completed onboarding',
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async cancelOnboarding(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.logger.log(`Cancelling onboarding ${id} by user ${user.id}`);
    await this.onboardingService.cancelOnboarding(
      id,
      getTenantId(user),
      user.id,
    );
    return { success: true, message: 'Onboarding cancelled' };
  }

  // ============ Checklist Endpoints ============

  @Get('staff/onboarding/:id/checklist')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get checklist items for an onboarding',
    description: 'Returns all checklist items with their current status',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({ status: 200, description: 'List of checklist items' })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async getChecklistItems(@Param('id') id: string) {
    this.logger.debug(`Getting checklist for onboarding ${id}`);
    const progress = await this.onboardingService.getOnboardingProgress(id);
    return {
      success: true,
      data: {
        items: progress.checklistItems,
        progress: progress.progress,
      },
    };
  }

  @Patch('staff/onboarding/checklist/:itemId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update a checklist item',
    description: 'Updates status and/or notes for a checklist item',
  })
  @ApiParam({ name: 'itemId', description: 'Checklist item ID' })
  @ApiResponse({ status: 200, description: 'Checklist item updated' })
  @ApiResponse({ status: 404, description: 'Checklist item not found' })
  async updateChecklistItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: IUser,
    @Body() dto: UpdateChecklistItemDto,
  ) {
    this.logger.log(`Updating checklist item ${itemId} by user ${user.id}`);
    await this.onboardingService.updateChecklistItem(
      itemId,
      dto.status as ChecklistItemStatus,
      user.id,
      dto.notes,
    );
    return { success: true, message: 'Checklist item updated' };
  }

  @Post('staff/onboarding/checklist/:itemId/complete')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark a checklist item as complete',
    description: 'Completes a checklist item with optional notes',
  })
  @ApiParam({ name: 'itemId', description: 'Checklist item ID' })
  @ApiResponse({ status: 200, description: 'Checklist item completed' })
  @ApiResponse({ status: 404, description: 'Checklist item not found' })
  async completeChecklistItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: IUser,
    @Body() dto: CompleteChecklistItemDto,
  ) {
    this.logger.log(`Completing checklist item ${itemId} by user ${user.id}`);
    await this.onboardingService.completeChecklistItem(
      itemId,
      user.id,
      dto.notes,
    );
    return { success: true, message: 'Checklist item completed' };
  }

  @Post('staff/onboarding/checklist/:itemId/skip')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Skip a checklist item',
    description:
      'Skips a non-required checklist item. Required items cannot be skipped.',
  })
  @ApiParam({ name: 'itemId', description: 'Checklist item ID' })
  @ApiResponse({ status: 200, description: 'Checklist item skipped' })
  @ApiResponse({ status: 400, description: 'Cannot skip required item' })
  @ApiResponse({ status: 404, description: 'Checklist item not found' })
  async skipChecklistItem(
    @Param('itemId') itemId: string,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(`Skipping checklist item ${itemId} by user ${user.id}`);
    await this.onboardingService.skipChecklistItem(itemId, user.id);
    return { success: true, message: 'Checklist item skipped' };
  }

  // ============ Document Endpoints ============

  @Post('staff/onboarding/documents')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Upload a staff document',
    description:
      'Creates a document record for a staff member (file upload handled separately)',
  })
  @ApiResponse({ status: 201, description: 'Document created' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async uploadDocument(
    @CurrentUser() user: IUser,
    @Body() dto: CreateStaffDocumentDto,
  ) {
    this.logger.log(
      `Uploading document ${dto.documentType} for staff ${dto.staffId}`,
    );
    return this.documentService.uploadDocument(getTenantId(user), dto, user.id);
  }

  @Post('staff/onboarding/documents/staff/:staffId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          const tenantId =
            (req as unknown as { user?: IUser }).user?.tenantId || 'default';
          const staffId = Array.isArray(req.params.staffId)
            ? req.params.staffId[0]
            : req.params.staffId;
          const uploadPath = path.join(
            process.cwd(),
            'uploads',
            'staff-documents',
            tenantId,
            staffId || 'unknown',
          );
          // Ensure directory exists
          fs.mkdirSync(uploadPath, { recursive: true });
          cb(null, uploadPath);
        },
        filename: (_req, file, cb) => {
          const timestamp = Date.now();
          const ext = path.extname(file.originalname);
          const baseName = path.basename(file.originalname, ext);
          cb(null, `${baseName}_${timestamp}${ext}`);
        },
      }),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
      fileFilter: (_req, file, cb) => {
        // Allow common document types
        const allowedMimes = [
          'application/pdf',
          'image/jpeg',
          'image/png',
          'image/gif',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Invalid file type'), false);
        }
      },
    }),
  )
  @ApiOperation({
    summary: 'Upload a document file for a staff member',
    description: 'Uploads a document file and creates a document record',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 201, description: 'Document uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or document type' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async uploadDocumentFile(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!documentType) {
      throw new BadRequestException('Document type is required');
    }

    this.logger.log(
      `Uploading document file ${file.originalname} (${documentType}) for staff ${staffId}`,
    );

    // Create the document record
    const dto: CreateStaffDocumentDto = {
      staffId,
      documentType: documentType as DocumentType,
      fileName: file.originalname,
      fileUrl: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
    };

    const document = await this.documentService.uploadDocument(
      getTenantId(user),
      dto,
      user.id,
    );

    return {
      success: true,
      message: 'Document uploaded successfully',
      data: document,
    };
  }

  @Get('documents/staff/:staffId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get documents for a staff member',
    description:
      'Returns all documents for a staff member with optional type filter',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: DocumentType,
    description: 'Filter by document type',
  })
  @ApiResponse({ status: 200, description: 'List of documents' })
  async getDocumentsByStaff(
    @Param('staffId') staffId: string,
    @Query('type') documentType?: DocumentType,
  ) {
    this.logger.debug(`Getting documents for staff ${staffId}`);
    const filter = documentType ? { documentType } : undefined;
    return this.documentService.getDocumentsByStaff(staffId, filter);
  }

  @Get('documents/pending')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get pending documents',
    description: 'Returns all documents awaiting verification',
  })
  @ApiResponse({ status: 200, description: 'List of pending documents' })
  async getPendingDocuments(@CurrentUser() user: IUser) {
    this.logger.debug(
      `Getting pending documents for tenant ${getTenantId(user)}`,
    );
    return this.documentService.getPendingDocuments(getTenantId(user));
  }

  @Get('documents/expiring')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get expiring documents',
    description: 'Returns documents expiring within specified days',
  })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead to check (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'List of expiring documents' })
  async getExpiringDocuments(
    @CurrentUser() user: IUser,
    @Query('days') days?: number,
  ) {
    this.logger.debug(
      `Getting expiring documents for tenant ${getTenantId(user)}`,
    );
    return this.documentService.getExpiringDocuments(
      getTenantId(user),
      days || 30,
    );
  }

  @Get('documents/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get document by ID',
    description: 'Returns document details',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document details' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocument(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.logger.debug(`Getting document ${id}`);
    return this.documentService.getDocumentById(id, getTenantId(user));
  }

  @Post('documents/:id/verify')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify a document',
    description: 'Marks a document as verified',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document verified' })
  @ApiResponse({ status: 400, description: 'Document already verified' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async verifyDocument(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Body() dto: VerifyDocumentDto,
  ) {
    this.logger.log(`Verifying document ${id} by user ${user.id}`);
    return this.documentService.verifyDocument(id, dto, getTenantId(user));
  }

  @Post('documents/:id/reject')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Reject a document',
    description: 'Marks a document as rejected with a reason',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 200, description: 'Document rejected' })
  @ApiResponse({ status: 400, description: 'Cannot reject verified document' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async rejectDocument(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Body() dto: RejectDocumentDto,
  ) {
    this.logger.log(`Rejecting document ${id} by user ${user.id}`);
    return this.documentService.rejectDocument(
      id,
      dto,
      getTenantId(user),
      user.id,
    );
  }

  @Delete('documents/:id')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a document',
    description: 'Permanently removes a document record',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiResponse({ status: 204, description: 'Document deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.logger.log(`Deleting document ${id} by user ${user.id}`);
    await this.documentService.deleteDocument(id, getTenantId(user), user.id);
  }

  // ============ Welcome Pack Endpoints ============

  @Get(':id/welcome-pack')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Download welcome pack PDF',
    description:
      'Generates and downloads a PDF welcome pack for the staff member',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiQuery({
    name: 'includePolicies',
    required: false,
    type: Boolean,
    description: 'Include company policies section',
  })
  @ApiQuery({
    name: 'includeEmergencyContacts',
    required: false,
    type: Boolean,
    description: 'Include emergency contacts section',
  })
  @ApiQuery({
    name: 'includeFirstDaySchedule',
    required: false,
    type: Boolean,
    description: 'Include first day schedule section',
  })
  @ApiResponse({
    status: 200,
    description: 'PDF file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async downloadWelcomePack(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Query('includePolicies') includePolicies?: string,
    @Query('includeEmergencyContacts') includeEmergencyContacts?: string,
    @Query('includeFirstDaySchedule') includeFirstDaySchedule?: string,
    @Query('customMessage') customMessage?: string,
    @Res() res?: Response,
  ) {
    this.logger.log(`Generating welcome pack for onboarding ${id}`);

    const progress = await this.onboardingService.getOnboardingProgress(id);

    const options: WelcomePackOptions = {
      includePolicies: includePolicies !== 'false',
      includeEmergencyContacts: includeEmergencyContacts !== 'false',
      includeFirstDaySchedule: includeFirstDaySchedule === 'true',
      customMessage,
    };

    const pdfBuffer = await this.welcomePackService.generateWelcomePack(
      progress.onboarding.staffId,
      getTenantId(user),
      options,
    );

    // Mark welcome pack as generated
    await this.welcomePackService.markWelcomePackGenerated(
      progress.onboarding.staffId,
    );

    // Set response headers and send PDF
    const filename = `welcome-pack-${progress.onboarding.staffId}.pdf`;
    res!.setHeader('Content-Type', 'application/pdf');
    res!.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res!.setHeader('Content-Length', pdfBuffer.length);

    res!.send(pdfBuffer);

    this.logger.log(
      `Welcome pack generated for staff ${progress.onboarding.staffId}`,
    );
  }

  @Post(':id/welcome-pack/send')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Mark welcome pack as sent',
    description:
      'Records that the welcome pack has been sent to the staff member',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({ status: 200, description: 'Welcome pack marked as sent' })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async sendWelcomePack(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.logger.log(`Marking welcome pack as sent for onboarding ${id}`);

    const progress = await this.onboardingService.getOnboardingProgress(id);
    await this.welcomePackService.markWelcomePackSent(
      progress.onboarding.staffId,
    );

    return { success: true, message: 'Welcome pack marked as sent' };
  }

  @Get(':id/welcome-pack/bundle')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Download complete welcome pack bundle as ZIP',
    description:
      'Downloads a ZIP file containing all onboarding documents: welcome pack PDF, signed employment contract, and POPIA consent form',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({
    status: 200,
    description: 'ZIP file',
    content: {
      'application/zip': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async downloadWelcomePackBundle(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Res() res: Response,
  ) {
    this.logger.log(`Generating welcome pack bundle for onboarding ${id}`);

    // Get onboarding progress and staff details
    const progress = await this.onboardingService.getOnboardingProgress(id);
    const staffId = progress.onboarding.staffId;

    // Get staff name for the ZIP filename
    const staff = await this.onboardingService.getStaffById(
      staffId,
      getTenantId(user),
    );
    const staffName = `${staff.firstName}_${staff.lastName}`.replace(
      /\s+/g,
      '_',
    );

    // Generate welcome pack PDF
    const welcomePackBuffer = await this.welcomePackService.generateWelcomePack(
      staffId,
      getTenantId(user),
      { includeFirstDaySchedule: true },
    );

    // Get generated documents (employment contract, POPIA)
    const generatedDocsResponse =
      await this.onboardingService.getGeneratedDocuments(staffId);
    const generatedDocs = generatedDocsResponse.documents || [];

    // Set response headers for ZIP download
    const filename = `onboarding-bundle-${staffName}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Create ZIP archive
    const archive = archiver.default('zip', { zlib: { level: 9 } });

    // Handle archive errors
    archive.on('error', (err: Error) => {
      this.logger.error(`Archive error: ${err.message}`);
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Failed to create ZIP archive',
      });
    });

    // Pipe archive to response
    archive.pipe(res);

    // Add welcome pack PDF
    archive.append(welcomePackBuffer, {
      name: `Welcome_Pack_${staffName}.pdf`,
    });

    // Add generated documents (contract, POPIA)
    for (const doc of generatedDocs) {
      if (fs.existsSync(doc.filePath)) {
        archive.file(doc.filePath, { name: doc.fileName });
      }
    }

    // Finalize the archive
    await archive.finalize();

    this.logger.log(`Welcome pack bundle generated for staff ${staffId}`);
  }

  @Post(':id/welcome-pack/email')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Email welcome pack to employee',
    description:
      'Sends an email to the employee with the welcome pack and all signed employment documents attached',
  })
  @ApiParam({ name: 'id', description: 'Onboarding ID' })
  @ApiResponse({
    status: 200,
    description: 'Welcome pack emailed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Employee email not found or email service not configured',
  })
  @ApiResponse({ status: 404, description: 'Onboarding not found' })
  async emailWelcomePack(
    @Param('id') id: string,
    @CurrentUser() user: IUser,
    @Body() body: { customMessage?: string },
  ) {
    this.logger.log(`Emailing welcome pack for onboarding ${id}`);

    // Get onboarding progress and staff details
    const progress = await this.onboardingService.getOnboardingProgress(id);
    const staffId = progress.onboarding.staffId;

    // Get staff details including email
    const staff = await this.onboardingService.getStaffById(
      staffId,
      getTenantId(user),
    );

    if (!staff.email) {
      throw new BadRequestException(
        'Employee email address not found. Please update staff profile with email.',
      );
    }

    // Generate welcome pack PDF
    const welcomePackBuffer = await this.welcomePackService.generateWelcomePack(
      staffId,
      getTenantId(user),
      { includeFirstDaySchedule: true, customMessage: body.customMessage },
    );

    // Get generated documents (employment contract, POPIA)
    const generatedDocsResponse =
      await this.onboardingService.getGeneratedDocuments(staffId);
    const generatedDocs = generatedDocsResponse.documents || [];

    // Build attachments array
    const attachments = [
      {
        filename: `Welcome_Pack_${staff.firstName}_${staff.lastName}.pdf`,
        content: welcomePackBuffer,
        contentType: 'application/pdf',
      },
    ];

    // Add generated documents as attachments
    for (const doc of generatedDocs) {
      if (fs.existsSync(doc.filePath)) {
        attachments.push({
          filename: doc.fileName,
          content: fs.readFileSync(doc.filePath),
          contentType: 'application/pdf',
        });
      }
    }

    // Get tenant/company name for email
    const tenant = await this.onboardingService.getTenantById(
      getTenantId(user),
    );
    const companyName = tenant?.name || 'Your New Employer';

    // Build email content
    const emailSubject = `Welcome to ${companyName} - Your Onboarding Documents`;
    const emailBody = `Dear ${staff.firstName},

Welcome to ${companyName}! We are thrilled to have you join our team.

Please find attached your onboarding documents:
- Welcome Pack - Contains important information about the company, your role, and first day instructions
${generatedDocs.map((doc) => `- ${doc.fileName.replace('.pdf', '').replace(/_/g, ' ')}`).join('\n')}

Please review all documents carefully. If you have any questions, don't hesitate to reach out.

We look forward to working with you!

Best regards,
The ${companyName} Team
`;

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
    .content { padding: 20px; }
    .documents { background-color: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 8px; }
    .footer { background-color: #f9fafb; padding: 15px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Welcome to ${companyName}!</h1>
  </div>
  <div class="content">
    <p>Dear ${staff.firstName},</p>
    <p>We are thrilled to have you join our team!</p>
    <div class="documents">
      <h3>📎 Attached Documents:</h3>
      <ul>
        <li><strong>Welcome Pack</strong> - Important information about the company, your role, and first day instructions</li>
        ${generatedDocs.map((doc) => `<li><strong>${doc.fileName.replace('.pdf', '').replace(/_/g, ' ')}</strong></li>`).join('\n        ')}
      </ul>
    </div>
    <p>Please review all documents carefully. If you have any questions, don't hesitate to reach out.</p>
    <p>We look forward to working with you!</p>
    <p>Best regards,<br>The ${companyName} Team</p>
  </div>
  <div class="footer">
    <p>This email was sent from the Staff Onboarding System</p>
  </div>
</body>
</html>
`;

    try {
      const result = await this.emailService.sendEmailWithOptions({
        to: staff.email,
        subject: emailSubject,
        body: emailBody,
        html: emailHtml,
        attachments,
      });

      // Mark welcome pack as sent
      await this.welcomePackService.markWelcomePackSent(staffId);

      this.logger.log(
        `Welcome pack emailed to ${staff.email}, messageId: ${result.messageId}`,
      );

      return {
        success: true,
        message: `Welcome pack emailed successfully to ${staff.email}`,
        data: {
          messageId: result.messageId,
          sentTo: staff.email,
          attachmentsCount: attachments.length,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to email welcome pack: ${errorMessage}`);
      throw new BadRequestException(`Failed to send email: ${errorMessage}`);
    }
  }

  // ============ Generated Documents Endpoints (TASK-STAFF-001) ============

  @Get('staff/:staffId/generated-documents')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get generated documents for a staff member',
    description:
      'Returns all auto-generated documents (employment contract, POPIA consent) for a staff member',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 200, description: 'List of generated documents' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getGeneratedDocuments(@Param('staffId') staffId: string) {
    this.logger.debug(`Getting generated documents for staff ${staffId}`);
    return this.onboardingService.getGeneratedDocuments(staffId);
  }

  @Post('staff/:staffId/generate-documents')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Generate all employment documents for a staff member',
    description:
      'Generates employment contract and POPIA consent form PDFs for a staff member',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 201, description: 'Documents generated successfully' })
  @ApiResponse({
    status: 400,
    description: 'No onboarding found or documents already exist',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async generateAllDocuments(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
  ) {
    this.logger.log(
      `Generating employment documents for staff ${staffId} by user ${user.id}`,
    );
    const documents = await this.onboardingService.generateAllDocuments(
      staffId,
      getTenantId(user),
    );
    return {
      success: true,
      message: 'Documents generated successfully',
      data: documents,
    };
  }

  @Post('generated-documents/:documentId/sign')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign/acknowledge a generated document',
    description:
      'Records acknowledgement of a generated document (employment contract or POPIA consent)',
  })
  @ApiParam({ name: 'documentId', description: 'Generated document ID' })
  @ApiResponse({ status: 200, description: 'Document signed successfully' })
  @ApiResponse({
    status: 400,
    description: 'Document already signed or invalid',
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async signGeneratedDocument(
    @Param('documentId') documentId: string,
    @CurrentUser() user: IUser,
    @Req() req: Request,
    @Body() dto: SignDocumentDto,
  ) {
    this.logger.log(
      `Signing generated document ${documentId} by user ${user.id}`,
    );

    // Get client IP for audit
    const clientIp =
      req.headers['x-forwarded-for']?.toString().split(',')[0] ||
      req.socket.remoteAddress ||
      'unknown';

    const dtoWithDocId = {
      ...dto,
      documentId,
      signedByIp: clientIp,
    };

    const document = await this.onboardingService.signDocument(
      dtoWithDocId,
      clientIp,
    );
    return {
      success: true,
      message: 'Document signed successfully',
      data: document,
    };
  }

  @Get('generated-documents/:documentId/download')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Download a generated document PDF',
    description: 'Downloads the PDF file for a generated document',
  })
  @ApiParam({ name: 'documentId', description: 'Generated document ID' })
  @ApiResponse({
    status: 200,
    description: 'PDF file',
    content: {
      'application/pdf': { schema: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async downloadGeneratedDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    this.logger.log(`Downloading generated document ${documentId}`);

    const document =
      await this.onboardingService.getGeneratedDocumentById(documentId);

    // Check if file exists
    if (!fs.existsSync(document.filePath)) {
      this.logger.error(`File not found: ${document.filePath}`);
      res.status(HttpStatus.NOT_FOUND).json({
        success: false,
        message: 'Document file not found',
      });
      return;
    }

    // Read the file
    const fileBuffer = fs.readFileSync(document.filePath);

    // Set response headers and send PDF
    res.setHeader('Content-Type', document.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${document.fileName}"`,
    );
    res.setHeader('Content-Length', fileBuffer.length);

    res.send(fileBuffer);

    this.logger.log(`Downloaded generated document ${documentId}`);
  }

  // ============ Document Statistics Endpoint ============

  @Get('documents/stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get document statistics',
    description: 'Returns aggregated document stats for the tenant',
  })
  @ApiResponse({ status: 200, description: 'Document statistics' })
  async getDocumentStats(@CurrentUser() user: IUser) {
    this.logger.debug(`Getting document stats for tenant ${getTenantId(user)}`);
    return this.documentService.getDocumentStats(getTenantId(user));
  }
}

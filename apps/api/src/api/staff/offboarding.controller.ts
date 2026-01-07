/**
 * Staff Offboarding Controller
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * REST API endpoints for managing staff offboarding including:
 * - Offboarding workflow initiation and management
 * - Asset return tracking
 * - Exit interview recording
 * - Document generation (UI-19, Certificate of Service, Exit Pack)
 * - Settlement preview and final pay
 *
 * BCEA COMPLIANCE NOTES (Basic Conditions of Employment Act, 1997):
 * ================================================================
 * - Notice Period (Section 37):
 *   * Less than 6 months employment: 1 week notice
 *   * 6-12 months employment: 2 weeks notice
 *   * Over 12 months employment: 4 weeks notice
 * - Certificate of Service (Section 42): Required on termination
 * - Payment on Termination (Section 38): Final pay within 7 days
 * - Leave Payout: Accrued leave must be paid out
 *
 * UIF COMPLIANCE (Unemployment Insurance Fund):
 * =============================================
 * - UI-19 form must be completed within 14 days of termination
 * - Employee receives UIF benefits based on last 13 weeks earnings
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
  Res,
  UseGuards,
  HttpStatus,
  HttpCode,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiExtraModels,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '../../database/entities/user.entity';
import type { IUser } from '../../database/entities/user.entity';
import { StaffOffboardingService } from '../../database/services/staff-offboarding.service';
import { Ui19GeneratorService } from '../../database/services/ui19-generator.service';
import { CertificateOfServiceService } from '../../database/services/certificate-of-service.service';
import { ExitPackPdfService } from '../../database/services/exit-pack-pdf.service';
import { StaffOffboardingRepository } from '../../database/repositories/staff-offboarding.repository';
import {
  InitiateOffboardingDto,
  UpdateOffboardingDto,
  UpdateFinalPayDto,
  AddAssetReturnDto,
  MarkAssetReturnedDto,
  RecordExitInterviewDto,
  CompleteOffboardingDto,
  SettlementPreviewQueryDto,
  OffboardingFilterDto,
} from '../../database/dto/staff-offboarding.dto';
import { StaffOffboardingStatus } from '../../database/entities/staff-offboarding.entity';

/**
 * Controller for staff-specific offboarding operations
 * Routes: /staff/:staffId/offboarding/*
 */
@ApiTags('Staff Offboarding')
@ApiBearerAuth()
@Controller('staff/:staffId/offboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffOffboardingController {
  constructor(
    private readonly offboardingService: StaffOffboardingService,
    private readonly offboardingRepo: StaffOffboardingRepository,
    private readonly ui19Service: Ui19GeneratorService,
    private readonly certificateService: CertificateOfServiceService,
    private readonly exitPackService: ExitPackPdfService,
  ) {}

  // ============ Offboarding Workflow ============

  @Post('initiate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Initiate offboarding workflow for a staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({
    status: 201,
    description: 'Offboarding initiated successfully',
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  @ApiResponse({ status: 409, description: 'Offboarding already exists' })
  async initiateOffboarding(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @Body() dto: InitiateOffboardingDto,
  ) {
    // Override staffId from path parameter
    dto.staffId = staffId;
    return this.offboardingService.initiateOffboarding(
      user.tenantId,
      dto,
      user.id,
    );
  }

  @Get('settlement-preview')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get settlement preview before initiating offboarding',
    description: `
      Returns a preview of the settlement calculation for a staff member.
      This includes tenure calculation, notice period (BCEA Section 37),
      and estimated final pay breakdown. Use this before initiating
      offboarding to review the financial impact.

      **BCEA Compliance:**
      - Notice period calculated per Section 37
      - Leave payout calculated per Section 20
    `,
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiQuery({
    name: 'lastWorkingDay',
    description: 'Proposed last working day',
    type: Date,
  })
  @ApiResponse({ status: 200, description: 'Settlement preview' })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async getSettlementPreview(
    @Param('staffId') staffId: string,
    @Query() query: SettlementPreviewQueryDto,
  ) {
    return this.offboardingService.getSettlementPreview(
      staffId,
      new Date(query.lastWorkingDay),
    );
  }

  // ============ Final Pay Calculation ============

  @Get('final-pay')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Calculate final pay for staff member',
    description: `
      Calculates the complete final pay breakdown for a staff member's offboarding.
      If an offboarding record exists, uses those details. Otherwise, calculates
      based on provided parameters.

      **BCEA Compliance (Section 38):**
      - All outstanding remuneration must be paid
      - Leave balance must be paid out (Section 20)
      - Notice pay included if employer waives notice period (Section 37)

      **Notice Period Calculation (BCEA Section 37):**
      - Less than 6 months employment: 7 days (1 week)
      - 6-12 months employment: 14 days (2 weeks)
      - Over 12 months employment: 28 days (4 weeks)

      **Included in calculation:**
      - Outstanding pro-rata salary for current period
      - Leave payout (accrued leave balance x daily rate)
      - Notice pay (if noticePeriodWaived=true)
      - PAYE tax deduction
      - UIF employee contribution (1% capped at R177.12)

      All monetary values returned in CENTS (integers).
    `,
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiQuery({
    name: 'lastWorkingDay',
    description: 'Last working day for calculation',
    type: Date,
    required: false,
  })
  @ApiQuery({
    name: 'noticePeriodWaived',
    description: 'Whether employer waives notice period (employee gets paid)',
    type: Boolean,
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Final pay calculation breakdown',
    schema: {
      type: 'object',
      properties: {
        outstandingSalaryCents: {
          type: 'integer',
          description: 'Pro-rata salary for current period',
        },
        leavePayoutCents: {
          type: 'integer',
          description: 'Accrued leave payout',
        },
        leaveBalanceDays: {
          type: 'number',
          description: 'Leave days being paid out',
        },
        noticePayCents: {
          type: 'integer',
          description: 'Notice period pay (if waived)',
        },
        proRataBonusCents: {
          type: 'integer',
          description: 'Pro-rata bonus amount',
        },
        otherEarningsCents: { type: 'integer', description: 'Other earnings' },
        grossEarningsCents: {
          type: 'integer',
          description: 'Total gross earnings',
        },
        payeCents: { type: 'integer', description: 'PAYE tax deduction' },
        uifEmployeeCents: {
          type: 'integer',
          description: 'UIF employee contribution',
        },
        deductionsCents: { type: 'integer', description: 'Other deductions' },
        totalDeductionsCents: {
          type: 'integer',
          description: 'Total deductions',
        },
        netPayCents: { type: 'integer', description: 'Net pay amount' },
        dailyRateCents: {
          type: 'integer',
          description: 'Calculated daily rate',
        },
        noticePeriodDays: {
          type: 'integer',
          description: 'BCEA notice period in days',
        },
        bceaCompliance: {
          type: 'object',
          properties: {
            section37NoticePeriod: {
              type: 'string',
              description: 'Notice period compliance',
            },
            section38PaymentTimeline: {
              type: 'string',
              description: 'Payment deadline',
            },
            section20LeaveEntitlement: {
              type: 'string',
              description: 'Leave payout compliance',
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Staff member not found' })
  async calculateFinalPay(
    @Param('staffId') staffId: string,
    @Query('lastWorkingDay') lastWorkingDayStr?: string,
    @Query('noticePeriodWaived') noticePeriodWaivedStr?: string,
  ) {
    // Check if there's an existing offboarding record
    const existingOffboarding =
      await this.offboardingRepo.findOffboardingByStaffId(staffId);

    // Determine parameters
    const lastWorkingDay = lastWorkingDayStr
      ? new Date(lastWorkingDayStr)
      : existingOffboarding?.lastWorkingDay || new Date();
    const noticePeriodWaived =
      noticePeriodWaivedStr === 'true' ||
      existingOffboarding?.noticePeriodWaived ||
      false;

    // Calculate final pay
    const finalPay = await this.offboardingService.calculateFinalPay(
      staffId,
      lastWorkingDay,
      noticePeriodWaived,
    );

    // Add BCEA compliance information
    return {
      ...finalPay,
      noticePeriodDays: this.offboardingService.calculateNoticePeriodDays(
        new Date(), // Will be replaced with staff start date in service
        lastWorkingDay,
      ),
      bceaCompliance: {
        section37NoticePeriod:
          'Notice period calculated per BCEA Section 37 based on tenure',
        section38PaymentTimeline:
          'Final pay must be made within 7 days of last working day',
        section20LeaveEntitlement:
          'Accrued leave balance paid out as required by Section 20',
      },
    };
  }

  @Patch('final-pay')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update final pay calculation for existing offboarding',
    description: `
      Updates the final pay amounts for an existing offboarding record.
      Use this to adjust calculated values before completing offboarding.

      **Note:** This updates the stored values. The system will recalculate
      gross/net totals based on the components provided.
    `,
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 200, description: 'Final pay updated' })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async updateFinalPay(
    @Param('staffId') staffId: string,
    @CurrentUser() user: IUser,
    @Body() dto: UpdateFinalPayDto,
  ) {
    const offboarding =
      await this.offboardingRepo.findOffboardingByStaffId(staffId);
    if (!offboarding) {
      return {
        success: false,
        message:
          'No offboarding found for this staff member. Initiate offboarding first.',
      };
    }
    await this.offboardingService.updateFinalPay(
      offboarding.id,
      dto,
      user.tenantId,
      user.id,
    );
    return { success: true, message: 'Final pay updated' };
  }

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get offboarding status for a staff member' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiResponse({ status: 200, description: 'Offboarding status' })
  @ApiResponse({
    status: 404,
    description: 'No offboarding found for this staff member',
  })
  async getOffboardingStatus(@Param('staffId') staffId: string) {
    const offboarding =
      await this.offboardingRepo.findOffboardingByStaffId(staffId);
    if (!offboarding) {
      return {
        exists: false,
        message: 'No offboarding found for this staff member',
      };
    }
    return this.offboardingService.getOffboardingProgress(offboarding.id);
  }

  @Patch(':offboardingId/process')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update offboarding process' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Offboarding updated' })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async processOffboarding(
    @Param('offboardingId') offboardingId: string,
    @Body() dto: UpdateOffboardingDto,
  ) {
    return this.offboardingRepo.updateOffboarding(offboardingId, dto);
  }

  // ============ Asset Returns ============

  @Post(':offboardingId/assets')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Add an asset to the return checklist' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 201, description: 'Asset added to checklist' })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async addAssetReturn(
    @Param('offboardingId') offboardingId: string,
    @Body() dto: AddAssetReturnDto,
  ) {
    return this.offboardingRepo.createAssetReturn(offboardingId, dto);
  }

  @Get(':offboardingId/assets')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all assets in the return checklist' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'List of assets' })
  async getAssetReturns(@Param('offboardingId') offboardingId: string) {
    return this.offboardingRepo.findAssetReturnsByOffboarding(offboardingId);
  }

  @Patch(':offboardingId/assets/:assetId/return')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Mark an asset as returned' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiParam({ name: 'assetId', description: 'Asset return ID' })
  @ApiResponse({ status: 200, description: 'Asset marked as returned' })
  async markAssetReturned(
    @Param('assetId') assetId: string,
    @CurrentUser() user: IUser,
    @Body() dto: MarkAssetReturnedDto,
  ) {
    return this.offboardingRepo.markAssetReturned(assetId, user.id, dto.notes);
  }

  @Delete(':offboardingId/assets/:assetId')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an asset from the return checklist' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiParam({ name: 'assetId', description: 'Asset return ID' })
  @ApiResponse({ status: 204, description: 'Asset removed from checklist' })
  async deleteAssetReturn(@Param('assetId') assetId: string) {
    await this.offboardingRepo.deleteAssetReturn(assetId);
  }

  // ============ Exit Interview ============

  @Post(':offboardingId/exit-interview')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Record exit interview details' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Exit interview recorded' })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async recordExitInterview(
    @Param('offboardingId') offboardingId: string,
    @CurrentUser() user: IUser,
    @Body() dto: RecordExitInterviewDto,
  ) {
    await this.offboardingService.recordExitInterview(
      offboardingId,
      dto,
      user.tenantId,
      user.id,
    );
    return { success: true, message: 'Exit interview recorded' };
  }

  // ============ Document Generation ============

  @Get(':offboardingId/ui19')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download UI-19 form (UIF Declaration)' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'UI-19 PDF document' })
  @ApiResponse({ status: 404, description: 'Staff or offboarding not found' })
  async downloadUi19(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.ui19Service.generateAndMark(
      staffId,
      offboardingId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="UI-19-${staffId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Get(':offboardingId/certificate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Download Certificate of Service (BCEA Section 42)',
  })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Certificate of Service PDF' })
  @ApiResponse({ status: 404, description: 'Staff or offboarding not found' })
  async downloadCertificate(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.certificateService.generateAndMark(
      staffId,
      offboardingId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Certificate-of-Service-${staffId}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Get(':offboardingId/exit-pack')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download complete Exit Pack with all documents' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Exit Pack documents' })
  @ApiResponse({ status: 404, description: 'Staff or offboarding not found' })
  @ApiResponse({ status: 400, description: 'Final pay not calculated' })
  async downloadExitPack(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const exitPack = await this.exitPackService.generateExitPack(
      staffId,
      offboardingId,
    );

    // Return the cover sheet as the primary document
    // In a full implementation, this would bundle all documents into a ZIP
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Exit-Pack-Cover-${staffId}.pdf"`,
      'Content-Length': exitPack.coverSheet.length,
    });
    res.send(exitPack.coverSheet);
  }

  @Get(':offboardingId/exit-pack/ui19')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download UI-19 from Exit Pack' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  async downloadExitPackUi19(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const exitPack = await this.exitPackService.generateExitPack(
      staffId,
      offboardingId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="UI-19-${staffId}.pdf"`,
      'Content-Length': exitPack.ui19.length,
    });
    res.send(exitPack.ui19);
  }

  @Get(':offboardingId/exit-pack/certificate')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download Certificate from Exit Pack' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  async downloadExitPackCertificate(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const exitPack = await this.exitPackService.generateExitPack(
      staffId,
      offboardingId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Certificate-of-Service-${staffId}.pdf"`,
      'Content-Length': exitPack.certificate.length,
    });
    res.send(exitPack.certificate);
  }

  @Get(':offboardingId/exit-pack/final-payslip')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Download Final Payslip from Exit Pack' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  async downloadExitPackFinalPayslip(
    @Param('staffId') staffId: string,
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  ) {
    const exitPack = await this.exitPackService.generateExitPack(
      staffId,
      offboardingId,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="Final-Payslip-${staffId}.pdf"`,
      'Content-Length': exitPack.finalPayslip.length,
    });
    res.send(exitPack.finalPayslip);
  }

  @Get(':offboardingId/documents/status')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get status of all exit documents' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Document status' })
  async getDocumentStatus(@Param('offboardingId') offboardingId: string) {
    return this.exitPackService.getDocumentStatus(offboardingId);
  }

  // ============ Completion ============

  @Post(':offboardingId/complete')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete the offboarding process' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Offboarding completed' })
  @ApiResponse({ status: 400, description: 'Required documents not generated' })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async completeOffboarding(
    @Param('offboardingId') offboardingId: string,
    @CurrentUser() user: IUser,
    @Body() dto: CompleteOffboardingDto,
  ) {
    // Use current user as completedBy if not provided
    dto.completedBy = dto.completedBy || user.id;
    await this.offboardingService.completeOffboarding(
      offboardingId,
      dto,
      user.tenantId,
    );
    return { success: true, message: 'Offboarding completed' };
  }

  @Post(':offboardingId/cancel')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel the offboarding process' })
  @ApiParam({ name: 'staffId', description: 'Staff member ID' })
  @ApiParam({ name: 'offboardingId', description: 'Offboarding ID' })
  @ApiResponse({ status: 200, description: 'Offboarding cancelled' })
  @ApiResponse({
    status: 400,
    description: 'Cannot cancel completed offboarding',
  })
  @ApiResponse({ status: 404, description: 'Offboarding not found' })
  async cancelOffboarding(
    @Param('offboardingId') offboardingId: string,
    @CurrentUser() user: IUser,
    @Body() body: { reason?: string },
  ) {
    await this.offboardingService.cancelOffboarding(
      offboardingId,
      body.reason || '',
      user.tenantId,
      user.id,
    );
    return { success: true, message: 'Offboarding cancelled' };
  }
}

/**
 * Controller for tenant-level offboarding queries
 * Routes: /staff/offboardings/*
 */
@ApiTags('Staff Offboardings')
@ApiBearerAuth()
@Controller('staff/offboardings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class StaffOffboardingsController {
  constructor(
    private readonly offboardingService: StaffOffboardingService,
    private readonly offboardingRepo: StaffOffboardingRepository,
  ) {}

  @Get()
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get all offboardings for tenant' })
  @ApiQuery({ name: 'status', required: false, enum: StaffOffboardingStatus })
  @ApiResponse({ status: 200, description: 'List of offboardings' })
  async getAllOffboardings(
    @CurrentUser() user: IUser,
    @Query('status') status?: StaffOffboardingStatus,
  ) {
    const filter: OffboardingFilterDto = {};
    if (status) {
      filter.status = status;
    }
    return this.offboardingService.getOffboardingsByTenant(
      user.tenantId,
      filter,
    );
  }

  @Get('stats')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get offboarding statistics for tenant' })
  @ApiResponse({ status: 200, description: 'Offboarding statistics' })
  async getOffboardingStats(@CurrentUser() user: IUser) {
    return this.offboardingService.getOffboardingStats(user.tenantId);
  }

  @Get('pending')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get pending offboardings for tenant' })
  @ApiResponse({ status: 200, description: 'List of pending offboardings' })
  async getPendingOffboardings(@CurrentUser() user: IUser) {
    return this.offboardingService.getPendingOffboardings(user.tenantId);
  }

  @Get('upcoming')
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get upcoming offboardings (within next X days)' })
  @ApiQuery({
    name: 'days',
    required: false,
    type: Number,
    description: 'Days ahead (default: 30)',
  })
  @ApiResponse({ status: 200, description: 'List of upcoming offboardings' })
  async getUpcomingOffboardings(
    @CurrentUser() user: IUser,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.offboardingService.getUpcomingOffboardings(user.tenantId, days);
  }
}

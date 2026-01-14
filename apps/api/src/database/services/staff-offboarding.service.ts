/**
 * Staff Offboarding Service
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * BCEA Compliant calculations for South African HR including:
 * - Notice period calculations (Section 37)
 * - Final pay calculations
 * - Leave payout calculations
 * - Settlement previews
 *
 * All monetary values in CENTS (integers)
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PayFrequency, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { StaffOffboardingRepository } from '../repositories/staff-offboarding.repository';
import { PayeService } from './paye.service';
import { UifService } from './uif.service';
import { AuditLogService } from './audit-log.service';
import { SimplePayServicePeriodService } from '../../integrations/simplepay/simplepay-service-period.service';
import { SimplePayRepository } from '../repositories/simplepay.repository';
import {
  OffboardingReason,
  StaffOffboardingStatus,
  IFinalPayCalculation,
  ISettlementPreview,
  IOffboardingProgress,
  SimplePaySyncStatus,
  offboardingReasonToTerminationCode,
} from '../entities/staff-offboarding.entity';
import {
  InitiateOffboardingDto,
  RecordExitInterviewDto,
  CompleteOffboardingDto,
  OffboardingFilterDto,
  UpdateFinalPayDto,
} from '../dto/staff-offboarding.dto';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
  BusinessException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

// Average working days per month (BCEA standard)
const WORKING_DAYS_PER_MONTH = 21.67;

// BCEA Section 37 notice period thresholds (months)
const NOTICE_THRESHOLDS = {
  LESS_THAN_6_MONTHS: 6,
  LESS_THAN_12_MONTHS: 12,
};

// BCEA notice period days
const NOTICE_PERIODS = {
  UNDER_6_MONTHS: 7, // 1 week
  UNDER_12_MONTHS: 14, // 2 weeks
  OVER_12_MONTHS: 28, // 4 weeks
};

@Injectable()
export class StaffOffboardingService {
  private readonly logger = new Logger(StaffOffboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offboardingRepo: StaffOffboardingRepository,
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
    private readonly auditLogService: AuditLogService,
    @Inject(forwardRef(() => SimplePayServicePeriodService))
    private readonly simplePayServicePeriod: SimplePayServicePeriodService,
    private readonly simplePayRepo: SimplePayRepository,
  ) {}

  /**
   * Calculate notice period based on tenure (BCEA Section 37)
   * - Less than 6 months: 1 week (7 days)
   * - 6 to 12 months: 2 weeks (14 days)
   * - More than 12 months: 4 weeks (28 days)
   *
   * @param startDate - Employment start date
   * @param terminationDate - Last working day
   * @returns Notice period in days
   */
  calculateNoticePeriodDays(startDate: Date, terminationDate: Date): number {
    const tenure = this.calculateTenure(startDate, terminationDate);
    const totalMonths = tenure.years * 12 + tenure.months;

    if (totalMonths < NOTICE_THRESHOLDS.LESS_THAN_6_MONTHS) {
      return NOTICE_PERIODS.UNDER_6_MONTHS;
    }
    if (totalMonths < NOTICE_THRESHOLDS.LESS_THAN_12_MONTHS) {
      return NOTICE_PERIODS.UNDER_12_MONTHS;
    }
    return NOTICE_PERIODS.OVER_12_MONTHS;
  }

  /**
   * Calculate tenure between two dates
   *
   * @param startDate - Start date
   * @param endDate - End date
   * @returns Tenure broken down by years, months, days
   */
  calculateTenure(
    startDate: Date,
    endDate: Date,
  ): { years: number; months: number; days: number } {
    const start = new Date(startDate);
    const end = new Date(endDate);

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();
    let days = end.getDate() - start.getDate();

    if (days < 0) {
      months--;
      // Get the last day of the previous month
      const lastDayOfPrevMonth = new Date(
        end.getFullYear(),
        end.getMonth(),
        0,
      ).getDate();
      days += lastDayOfPrevMonth;
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }

  /**
   * Calculate final pay (BCEA Compliant)
   * Includes:
   * - Outstanding salary (pro-rata for current month)
   * - Leave payout
   * - Notice pay (if waived by employer)
   * - PAYE deduction
   * - UIF deduction
   *
   * @param staffId - Staff ID
   * @param lastWorkingDay - Last working day
   * @param noticePeriodWaived - Whether employer waives notice period (employee gets paid)
   * @returns Complete final pay calculation
   */
  async calculateFinalPay(
    staffId: string,
    lastWorkingDay: Date,
    noticePeriodWaived: boolean,
  ): Promise<IFinalPayCalculation> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const monthlySalaryCents = staff.basicSalaryCents;
    const dailyRateCents = Math.round(
      monthlySalaryCents / WORKING_DAYS_PER_MONTH,
    );

    // Calculate pro-rata salary for current month
    const lastDay = new Date(lastWorkingDay);
    const monthStart = new Date(lastDay.getFullYear(), lastDay.getMonth(), 1);
    const daysWorked =
      Math.ceil(
        (lastDay.getTime() - monthStart.getTime()) / (1000 * 60 * 60 * 24),
      ) + 1;
    const daysInMonth = new Date(
      lastDay.getFullYear(),
      lastDay.getMonth() + 1,
      0,
    ).getDate();
    const outstandingSalaryCents = Math.round(
      (monthlySalaryCents * daysWorked) / daysInMonth,
    );

    // Leave payout calculation
    // In production, this would come from a leave tracking system
    // Using placeholder: assume 15 days annual leave entitlement, calculate balance
    const leaveBalanceDays = await this.getLeaveBalance(staffId);
    const leavePayoutCents = Math.round(dailyRateCents * leaveBalanceDays);

    // Notice pay calculation (if employer waives notice period)
    const noticePeriodDays = this.calculateNoticePeriodDays(
      staff.startDate,
      lastWorkingDay,
    );
    const noticePayCents = noticePeriodWaived
      ? Math.round(dailyRateCents * noticePeriodDays)
      : 0;

    // Calculate gross earnings
    const grossEarningsCents =
      outstandingSalaryCents + leavePayoutCents + noticePayCents;

    // Calculate PAYE on final pay
    const payeResult = await this.payeService.calculatePaye({
      grossIncomeCents: grossEarningsCents,
      payFrequency: staff.payFrequency,
      dateOfBirth: staff.dateOfBirth,
      medicalAidMembers: staff.medicalAidMembers,
    });
    const payeCents = payeResult.netPayeCents;

    // UIF (1% employee contribution, capped)
    const uifResult = await this.uifService.calculateUif(grossEarningsCents);
    const uifEmployeeCents = uifResult.employeeContributionCents;

    // Total deductions
    const deductionsCents = 0; // Other deductions (not calculated here)
    const totalDeductionsCents = payeCents + uifEmployeeCents + deductionsCents;

    // Net pay
    const netPayCents = Math.max(0, grossEarningsCents - totalDeductionsCents);

    return {
      outstandingSalaryCents,
      leavePayoutCents,
      leaveBalanceDays,
      noticePayCents,
      proRataBonusCents: 0,
      otherEarningsCents: 0,
      grossEarningsCents,
      payeCents,
      uifEmployeeCents,
      deductionsCents,
      totalDeductionsCents,
      netPayCents,
      dailyRateCents,
    };
  }

  /**
   * Get leave balance for a staff member
   * In production, this would query a leave tracking system
   *
   * @param staffId - Staff ID
   * @returns Leave balance in days
   */
  private async getLeaveBalance(staffId: string): Promise<number> {
    // Placeholder implementation
    // In a real system, this would calculate:
    // - Annual leave entitlement (15 days for BCEA)
    // - Pro-rata for tenure
    // - Minus leave taken
    // For now, return a default value
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      return 0;
    }

    // Calculate pro-rata leave based on months worked in current year
    const currentYear = new Date().getFullYear();
    const yearStart = new Date(currentYear, 0, 1);
    const monthsWorkedThisYear = Math.min(
      12,
      Math.ceil(
        (new Date().getTime() -
          Math.max(yearStart.getTime(), staff.startDate.getTime())) /
          (1000 * 60 * 60 * 24 * 30),
      ),
    );

    // 15 days annual leave = 1.25 days per month
    const earnedLeave = new Decimal(monthsWorkedThisYear)
      .mul(1.25)
      .round()
      .toNumber();

    // Assume some leave taken (placeholder)
    const leaveTaken = Math.floor(earnedLeave * 0.6);

    return Math.max(0, earnedLeave - leaveTaken);
  }

  /**
   * Get settlement preview before initiating offboarding
   * Shows estimated final settlement without creating any records
   *
   * @param staffId - Staff ID
   * @param lastWorkingDay - Proposed last working day
   * @returns Settlement preview with all calculations
   */
  async getSettlementPreview(
    staffId: string,
    lastWorkingDay: Date,
  ): Promise<ISettlementPreview> {
    const staff = await this.prisma.staff.findUnique({
      where: { id: staffId },
    });

    if (!staff) {
      throw new NotFoundException('Staff', staffId);
    }

    const tenure = this.calculateTenure(staff.startDate, lastWorkingDay);
    const noticePeriodDays = this.calculateNoticePeriodDays(
      staff.startDate,
      lastWorkingDay,
    );
    const finalPay = await this.calculateFinalPay(
      staffId,
      lastWorkingDay,
      false,
    );

    return {
      staffId,
      staffName: `${staff.firstName} ${staff.lastName}`,
      lastWorkingDay,
      tenure,
      noticePeriodDays,
      finalPay,
      documentsRequired: [
        'UI-19 (UIF Declaration)',
        'Certificate of Service (BCEA Section 42)',
        'IRP5 Tax Certificate',
        'Final Payslip',
      ],
    };
  }

  /**
   * Initiate offboarding workflow
   * Creates the offboarding record and default asset return checklist
   *
   * @param tenantId - Tenant ID
   * @param dto - Initiation data
   * @param userId - User initiating the offboarding
   * @returns Created offboarding with relations
   */
  async initiateOffboarding(
    tenantId: string,
    dto: InitiateOffboardingDto,
    userId: string,
  ): Promise<IOffboardingProgress> {
    this.logger.log(`Initiating offboarding for staff ${dto.staffId}`);

    // Check if staff exists and is active
    const staff = await this.prisma.staff.findFirst({
      where: { id: dto.staffId, tenantId, isActive: true },
    });

    if (!staff) {
      throw new NotFoundException('Staff', dto.staffId);
    }

    // Check if offboarding already exists
    const existing = await this.offboardingRepo.findOffboardingByStaffId(
      dto.staffId,
    );

    if (existing && existing.status !== StaffOffboardingStatus.CANCELLED) {
      throw new ConflictException(
        'Offboarding already exists for this staff member',
        { staffId: dto.staffId, existingId: existing.id },
      );
    }

    // Calculate notice period and final pay
    const noticePeriodDays = this.calculateNoticePeriodDays(
      staff.startDate,
      dto.lastWorkingDay,
    );
    const finalPay = await this.calculateFinalPay(
      dto.staffId,
      dto.lastWorkingDay,
      dto.noticePeriodWaived || false,
    );

    // Create offboarding record
    const offboarding = await this.offboardingRepo.createOffboarding(tenantId, {
      ...dto,
      noticePeriodDays: dto.noticePeriodDays ?? noticePeriodDays,
      initiatedBy: dto.initiatedBy || userId,
    });

    // Update with final pay calculation
    await this.offboardingRepo.updateFinalPay(offboarding.id, {
      outstandingSalaryCents: finalPay.outstandingSalaryCents,
      leavePayoutCents: finalPay.leavePayoutCents,
      leaveBalanceDays: finalPay.leaveBalanceDays,
      noticePayCents: finalPay.noticePayCents,
    });

    // Add default asset return items
    const defaultAssets = [
      {
        assetType: 'Keys',
        assetDescription: 'Office/building keys and access cards',
      },
      { assetType: 'Equipment', assetDescription: 'Company laptop/computer' },
      { assetType: 'Equipment', assetDescription: 'Company phone' },
      { assetType: 'Uniform', assetDescription: 'Company uniform items' },
      {
        assetType: 'Documents',
        assetDescription: 'Company documents and materials',
      },
    ];

    for (const asset of defaultAssets) {
      await this.offboardingRepo.createAssetReturn(offboarding.id, asset);
    }

    // Log the action
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'StaffOffboarding',
      entityId: offboarding.id,
      afterValue: {
        staffId: dto.staffId,
        reason: dto.reason,
        status: 'INITIATED',
        lastWorkingDay: dto.lastWorkingDay,
      },
    });

    // Return full progress view
    return this.getOffboardingProgress(offboarding.id);
  }

  /**
   * Get offboarding progress with all related data
   *
   * @param offboardingId - Offboarding ID
   * @returns Progress view with status tracking
   */
  async getOffboardingProgress(
    offboardingId: string,
  ): Promise<IOffboardingProgress> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    const assets = offboarding.assetReturns || [];
    const assetsReturned = assets.filter((a) => a.status === 'RETURNED').length;

    return {
      offboarding: {
        id: offboarding.id,
        tenantId: offboarding.tenantId,
        staffId: offboarding.staffId,
        status: offboarding.status as StaffOffboardingStatus,
        reason: offboarding.reason as OffboardingReason,
        initiatedAt: offboarding.initiatedAt,
        initiatedBy: offboarding.initiatedBy,
        lastWorkingDay: offboarding.lastWorkingDay,
        noticePeriodDays: offboarding.noticePeriodDays,
        noticePeriodWaived: offboarding.noticePeriodWaived,
        outstandingSalaryCents: offboarding.outstandingSalaryCents,
        leavePayoutCents: offboarding.leavePayoutCents,
        leaveBalanceDays: Number(offboarding.leaveBalanceDays),
        noticePayCents: offboarding.noticePayCents,
        proRataBonusCents: offboarding.proRataBonusCents,
        otherEarningsCents: offboarding.otherEarningsCents,
        deductionsCents: offboarding.deductionsCents,
        finalPayGrossCents: offboarding.finalPayGrossCents,
        finalPayNetCents: offboarding.finalPayNetCents,
        ui19GeneratedAt: offboarding.ui19GeneratedAt,
        certificateGeneratedAt: offboarding.certificateGeneratedAt,
        irp5GeneratedAt: offboarding.irp5GeneratedAt,
        exitPackGeneratedAt: offboarding.exitPackGeneratedAt,
        exitInterviewDate: offboarding.exitInterviewDate,
        exitInterviewNotes: offboarding.exitInterviewNotes,
        exitInterviewCompleted: offboarding.exitInterviewCompleted,
        completedAt: offboarding.completedAt,
        completedBy: offboarding.completedBy,
        notes: offboarding.notes,
        // SimplePay Integration (TASK-STAFF-006)
        simplePaySyncStatus: offboarding.simplePaySyncStatus,
        simplePaySyncError: offboarding.simplePaySyncError,
        simplePaySyncedAt: offboarding.simplePaySyncedAt,
        createdAt: offboarding.createdAt,
        updatedAt: offboarding.updatedAt,
      },
      assets: assets.map((a) => ({
        id: a.id,
        offboardingId: a.offboardingId,
        assetType: a.assetType,
        assetDescription: a.assetDescription,
        serialNumber: a.serialNumber,
        status: a.status as any,
        returnedAt: a.returnedAt,
        checkedBy: a.checkedBy,
        notes: a.notes,
      })),
      documentsGenerated: {
        ui19: !!offboarding.ui19GeneratedAt,
        certificate: !!offboarding.certificateGeneratedAt,
        irp5: !!offboarding.irp5GeneratedAt,
        exitPack: !!offboarding.exitPackGeneratedAt,
      },
      progress: {
        assetsReturned,
        totalAssets: assets.length,
        exitInterviewComplete: offboarding.exitInterviewCompleted,
        finalPayCalculated: offboarding.finalPayGrossCents > 0,
      },
    };
  }

  /**
   * Record exit interview
   *
   * @param offboardingId - Offboarding ID
   * @param dto - Exit interview data
   * @param tenantId - Tenant ID
   * @param userId - User recording the interview
   */
  async recordExitInterview(
    offboardingId: string,
    dto: RecordExitInterviewDto,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    await this.offboardingRepo.recordExitInterview(
      offboardingId,
      dto.interviewDate,
      dto.notes,
    );

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffOffboarding',
      entityId: offboardingId,
      beforeValue: { exitInterviewCompleted: false },
      afterValue: {
        exitInterviewCompleted: true,
        exitInterviewDate: dto.interviewDate,
      },
    });

    this.logger.log(`Recorded exit interview for offboarding ${offboardingId}`);
  }

  /**
   * Recalculate final pay with updated values
   *
   * @param offboardingId - Offboarding ID
   * @param dto - Updated final pay values
   * @param tenantId - Tenant ID
   * @param userId - User making the update
   */
  async updateFinalPay(
    offboardingId: string,
    dto: UpdateFinalPayDto,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    const beforeValue = {
      outstandingSalaryCents: offboarding.outstandingSalaryCents,
      leavePayoutCents: offboarding.leavePayoutCents,
      noticePayCents: offboarding.noticePayCents,
    };

    await this.offboardingRepo.updateFinalPay(offboardingId, dto);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffOffboarding',
      entityId: offboardingId,
      beforeValue,
      afterValue: dto as unknown as Prisma.InputJsonValue,
      changeSummary: 'Updated final pay calculation',
    });

    this.logger.log(`Updated final pay for offboarding ${offboardingId}`);
  }

  /**
   * Complete offboarding - marks staff as inactive
   *
   * @param offboardingId - Offboarding ID
   * @param dto - Completion data
   * @param tenantId - Tenant ID
   */
  async completeOffboarding(
    offboardingId: string,
    dto: CompleteOffboardingDto,
    tenantId: string,
  ): Promise<void> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    // Validate required documents are generated
    const validationErrors: { field: string; message: string }[] = [];

    if (!offboarding.ui19GeneratedAt) {
      validationErrors.push({
        field: 'ui19',
        message: 'UI-19 form must be generated before completing offboarding',
      });
    }

    if (!offboarding.certificateGeneratedAt) {
      validationErrors.push({
        field: 'certificate',
        message:
          'Certificate of Service must be generated before completing offboarding',
      });
    }

    if (validationErrors.length > 0) {
      throw new ValidationException(
        'Required documents not generated',
        validationErrors,
      );
    }

    // Complete offboarding
    await this.offboardingRepo.completeOffboarding(
      offboardingId,
      dto.completedBy,
      dto.notes,
    );

    // Mark staff as inactive
    await this.prisma.staff.update({
      where: { id: offboarding.staffId },
      data: {
        isActive: false,
        endDate: offboarding.lastWorkingDay,
      },
    });

    // TASK-STAFF-006: Sync termination to SimplePay
    await this.syncTerminationToSimplePay(
      offboardingId,
      offboarding.staffId,
      tenantId,
      offboarding.reason as OffboardingReason,
      offboarding.lastWorkingDay,
    );

    await this.auditLogService.logUpdate({
      tenantId,
      userId: dto.completedBy,
      entityType: 'StaffOffboarding',
      entityId: offboardingId,
      beforeValue: { status: offboarding.status },
      afterValue: { status: 'COMPLETED' },
      changeSummary: 'Offboarding completed',
    });

    // Also log the staff deactivation
    await this.auditLogService.logUpdate({
      tenantId,
      userId: dto.completedBy,
      entityType: 'Staff',
      entityId: offboarding.staffId,
      beforeValue: { isActive: true },
      afterValue: { isActive: false, endDate: offboarding.lastWorkingDay },
      changeSummary: 'Staff deactivated due to offboarding',
    });

    this.logger.log(`Completed offboarding ${offboardingId}`);
  }

  /**
   * Cancel an offboarding process
   *
   * @param offboardingId - Offboarding ID
   * @param reason - Cancellation reason
   * @param tenantId - Tenant ID
   * @param userId - User cancelling
   */
  async cancelOffboarding(
    offboardingId: string,
    reason: string,
    tenantId: string,
    userId: string,
  ): Promise<void> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    if (offboarding.status === StaffOffboardingStatus.COMPLETED) {
      throw new BusinessException(
        'Cannot cancel a completed offboarding',
        'OFFBOARDING_ALREADY_COMPLETED',
        { offboardingId },
      );
    }

    await this.offboardingRepo.cancelOffboarding(offboardingId, reason);

    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'StaffOffboarding',
      entityId: offboardingId,
      beforeValue: { status: offboarding.status },
      afterValue: { status: 'CANCELLED', cancellationReason: reason },
      changeSummary: 'Offboarding cancelled',
    });

    this.logger.log(`Cancelled offboarding ${offboardingId}`);
  }

  /**
   * Get offboarding by ID
   *
   * @param offboardingId - Offboarding ID
   * @returns Offboarding with relations
   */
  async getOffboardingById(offboardingId: string) {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    return offboarding;
  }

  /**
   * Get offboardings by tenant
   *
   * @param tenantId - Tenant ID
   * @param filter - Optional filter criteria
   * @returns List of offboardings
   */
  async getOffboardingsByTenant(
    tenantId: string,
    filter?: OffboardingFilterDto,
  ) {
    return this.offboardingRepo.findOffboardingsByTenant(tenantId, filter);
  }

  /**
   * Get pending offboardings for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns List of pending offboardings
   */
  async getPendingOffboardings(tenantId: string) {
    return this.offboardingRepo.findPendingOffboardings(tenantId);
  }

  /**
   * Get upcoming offboardings (within next X days)
   *
   * @param tenantId - Tenant ID
   * @param daysAhead - Number of days to look ahead (default 7)
   * @returns List of upcoming offboardings
   */
  async getUpcomingOffboardings(tenantId: string, daysAhead: number = 7) {
    return this.offboardingRepo.findUpcomingOffboardings(tenantId, daysAhead);
  }

  /**
   * Get offboarding stats for dashboard
   *
   * @param tenantId - Tenant ID
   * @returns Statistics breakdown
   */
  async getOffboardingStats(tenantId: string) {
    return this.offboardingRepo.getOffboardingStats(tenantId);
  }

  // ============ SimplePay Integration (TASK-STAFF-006) ============

  /**
   * Sync termination to SimplePay when offboarding is completed
   * This is called automatically when completeOffboarding is successful.
   * If the employee is not linked to SimplePay, marks as NOT_APPLICABLE.
   * Errors are logged but don't fail the offboarding completion.
   *
   * @param offboardingId - Offboarding ID
   * @param staffId - Staff ID
   * @param tenantId - Tenant ID
   * @param reason - Offboarding reason
   * @param lastWorkingDay - Last working date
   */
  private async syncTerminationToSimplePay(
    offboardingId: string,
    staffId: string,
    tenantId: string,
    reason: OffboardingReason,
    lastWorkingDay: Date,
  ): Promise<void> {
    try {
      // Check if employee is linked to SimplePay
      const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);

      if (!mapping) {
        // Employee not linked to SimplePay - mark as not applicable
        await this.prisma.staffOffboarding.update({
          where: { id: offboardingId },
          data: {
            simplePaySyncStatus: SimplePaySyncStatus.NOT_APPLICABLE,
            simplePaySyncedAt: new Date(),
          },
        });
        this.logger.log(
          `Staff ${staffId} not linked to SimplePay - sync not applicable`,
        );
        return;
      }

      // Check if SimplePay connection is active
      const connection = await this.simplePayRepo.findConnection(tenantId);
      if (!connection?.isActive) {
        await this.prisma.staffOffboarding.update({
          where: { id: offboardingId },
          data: {
            simplePaySyncStatus: SimplePaySyncStatus.FAILED,
            simplePaySyncError: 'SimplePay connection not active',
          },
        });
        this.logger.warn(
          `SimplePay connection not active for tenant ${tenantId}`,
        );
        return;
      }

      // Map offboarding reason to termination code
      const terminationCode = offboardingReasonToTerminationCode(reason);

      // Call SimplePay to terminate employee
      const result = await this.simplePayServicePeriod.terminateEmployee(
        tenantId,
        {
          staffId,
          terminationCode,
          endDate: lastWorkingDay,
          lastWorkingDay,
          generateFinalPayslip: true,
        },
      );

      if (result.success) {
        await this.prisma.staffOffboarding.update({
          where: { id: offboardingId },
          data: {
            simplePaySyncStatus: SimplePaySyncStatus.SUCCESS,
            simplePaySyncedAt: new Date(),
            simplePaySyncError: null,
          },
        });

        this.logger.log(
          `Successfully synced termination to SimplePay for staff ${staffId}`,
        );

        // Log the sync
        await this.auditLogService.logCreate({
          tenantId,
          entityType: 'SimplePaySync',
          entityId: offboardingId,
          afterValue: {
            action: 'TERMINATION',
            staffId,
            simplePayEmployeeId: result.simplePayEmployeeId,
            terminationCode,
            uifEligible: result.uifEligible,
          },
        });
      } else {
        await this.prisma.staffOffboarding.update({
          where: { id: offboardingId },
          data: {
            simplePaySyncStatus: SimplePaySyncStatus.FAILED,
            simplePaySyncError: result.error || 'Unknown error',
          },
        });

        this.logger.error(
          `Failed to sync termination to SimplePay for staff ${staffId}: ${result.error}`,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.prisma.staffOffboarding.update({
        where: { id: offboardingId },
        data: {
          simplePaySyncStatus: SimplePaySyncStatus.FAILED,
          simplePaySyncError: errorMessage,
        },
      });

      this.logger.error(
        `Exception syncing termination to SimplePay for staff ${staffId}: ${errorMessage}`,
      );
      // Don't throw - offboarding should still complete even if SimplePay sync fails
    }
  }

  /**
   * Retry SimplePay sync for a failed offboarding
   * Can be called manually if initial sync failed
   *
   * @param offboardingId - Offboarding ID
   * @param tenantId - Tenant ID
   * @returns Sync result
   */
  async retrySimplePaySync(
    offboardingId: string,
    tenantId: string,
  ): Promise<{ success: boolean; error?: string }> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    if (offboarding.status !== StaffOffboardingStatus.COMPLETED) {
      throw new BusinessException(
        'Can only retry SimplePay sync for completed offboardings',
        'OFFBOARDING_NOT_COMPLETED',
        { offboardingId, status: offboarding.status },
      );
    }

    if (offboarding.simplePaySyncStatus === SimplePaySyncStatus.SUCCESS) {
      throw new BusinessException(
        'SimplePay sync already successful',
        'SIMPLEPAY_ALREADY_SYNCED',
        { offboardingId },
      );
    }

    if (
      offboarding.simplePaySyncStatus === SimplePaySyncStatus.NOT_APPLICABLE
    ) {
      throw new BusinessException(
        'Employee is not linked to SimplePay',
        'SIMPLEPAY_NOT_APPLICABLE',
        { offboardingId },
      );
    }

    // Retry the sync
    await this.syncTerminationToSimplePay(
      offboardingId,
      offboarding.staffId,
      tenantId,
      offboarding.reason as OffboardingReason,
      offboarding.lastWorkingDay,
    );

    // Fetch updated status
    const updated =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    return {
      success: updated?.simplePaySyncStatus === SimplePaySyncStatus.SUCCESS,
      error: updated?.simplePaySyncError || undefined,
    };
  }

  /**
   * Get SimplePay sync status for an offboarding
   *
   * @param offboardingId - Offboarding ID
   * @returns Sync status info
   */
  async getSimplePaySyncStatus(offboardingId: string): Promise<{
    status: string | null;
    error: string | null;
    syncedAt: Date | null;
  }> {
    const offboarding =
      await this.offboardingRepo.findOffboardingById(offboardingId);

    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    return {
      status: offboarding.simplePaySyncStatus,
      error: offboarding.simplePaySyncError,
      syncedAt: offboarding.simplePaySyncedAt,
    };
  }
}

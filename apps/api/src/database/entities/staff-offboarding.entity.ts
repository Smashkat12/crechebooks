/**
 * Staff Offboarding Entities
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 * TASK-STAFF-006: SimplePay Offboarding Integration
 *
 * Represents the offboarding process for staff members including:
 * - Final pay calculations (BCEA compliant)
 * - Asset return tracking
 * - Exit document generation (UI-19, Certificate of Service, IRP5)
 * - Exit interview management
 * - SimplePay termination sync
 */

import { TerminationCode } from '@prisma/client';

export enum OffboardingReason {
  RESIGNATION = 'RESIGNATION',
  TERMINATION = 'TERMINATION',
  RETIREMENT = 'RETIREMENT',
  DEATH = 'DEATH',
  CONTRACT_END = 'CONTRACT_END',
  MUTUAL_AGREEMENT = 'MUTUAL_AGREEMENT',
  RETRENCHMENT = 'RETRENCHMENT',
  DISMISSAL = 'DISMISSAL',
  ABSCONDED = 'ABSCONDED',
}

export enum StaffOffboardingStatus {
  INITIATED = 'INITIATED',
  IN_PROGRESS = 'IN_PROGRESS',
  PENDING_FINAL_PAY = 'PENDING_FINAL_PAY',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum AssetReturnStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING = 'PENDING',
  RETURNED = 'RETURNED',
  NOT_RETURNED = 'NOT_RETURNED',
  WRITE_OFF = 'WRITE_OFF',
}

/**
 * SimplePay Sync Status for offboarding
 * TASK-STAFF-006
 */
export enum SimplePaySyncStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

/**
 * Maps OffboardingReason to SimplePay TerminationCode
 * Used when syncing offboarding completion to SimplePay
 * TASK-STAFF-006
 */
export const OFFBOARDING_REASON_TO_TERMINATION_CODE: Record<
  OffboardingReason,
  TerminationCode
> = {
  [OffboardingReason.RESIGNATION]: 'RESIGNATION',
  [OffboardingReason.TERMINATION]: 'DISMISSAL_MISCONDUCT',
  [OffboardingReason.RETIREMENT]: 'RETIREMENT',
  [OffboardingReason.DEATH]: 'DEATH',
  [OffboardingReason.CONTRACT_END]: 'CONTRACT_EXPIRY',
  [OffboardingReason.MUTUAL_AGREEMENT]: 'RESIGNATION', // Voluntary separation
  [OffboardingReason.RETRENCHMENT]: 'RETRENCHMENT',
  [OffboardingReason.DISMISSAL]: 'DISMISSAL_MISCONDUCT',
  [OffboardingReason.ABSCONDED]: 'ABSCONDED',
};

/**
 * Helper to convert offboarding reason to termination code
 */
export function offboardingReasonToTerminationCode(
  reason: OffboardingReason,
): TerminationCode {
  return OFFBOARDING_REASON_TO_TERMINATION_CODE[reason];
}

export interface IStaffOffboarding {
  id: string;
  tenantId: string;
  staffId: string;
  status: StaffOffboardingStatus;
  reason: OffboardingReason;
  initiatedAt: Date;
  initiatedBy: string | null;
  lastWorkingDay: Date;
  noticePeriodDays: number;
  noticePeriodWaived: boolean;
  // Final Pay
  outstandingSalaryCents: number;
  leavePayoutCents: number;
  leaveBalanceDays: number;
  noticePayCents: number;
  proRataBonusCents: number;
  otherEarningsCents: number;
  deductionsCents: number;
  finalPayGrossCents: number;
  finalPayNetCents: number;
  // Documents
  ui19GeneratedAt: Date | null;
  certificateGeneratedAt: Date | null;
  irp5GeneratedAt: Date | null;
  exitPackGeneratedAt: Date | null;
  // Exit Interview
  exitInterviewDate: Date | null;
  exitInterviewNotes: string | null;
  exitInterviewCompleted: boolean;
  // Completion
  completedAt: Date | null;
  completedBy: string | null;
  notes: string | null;
  // SimplePay Integration (TASK-STAFF-006)
  simplePaySyncStatus: string | null;
  simplePaySyncError: string | null;
  simplePaySyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssetReturn {
  id: string;
  offboardingId: string;
  assetType: string;
  assetDescription: string;
  serialNumber: string | null;
  status: AssetReturnStatus;
  returnedAt: Date | null;
  checkedBy: string | null;
  notes: string | null;
}

/**
 * Final Pay Calculation Interface (BCEA Compliant)
 * Used to calculate and display the complete final pay breakdown
 */
export interface IFinalPayCalculation {
  outstandingSalaryCents: number;
  leavePayoutCents: number;
  leaveBalanceDays: number;
  noticePayCents: number;
  proRataBonusCents: number;
  otherEarningsCents: number;
  grossEarningsCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  deductionsCents: number;
  totalDeductionsCents: number;
  netPayCents: number;
  dailyRateCents: number;
}

/**
 * Settlement Preview Interface
 * Shows estimated final settlement before offboarding is finalized
 */
export interface ISettlementPreview {
  staffId: string;
  staffName: string;
  lastWorkingDay: Date;
  tenure: { years: number; months: number; days: number };
  noticePeriodDays: number;
  finalPay: IFinalPayCalculation;
  documentsRequired: string[];
}

/**
 * Offboarding Progress Interface
 * Tracks overall progress of the offboarding workflow
 */
export interface IOffboardingProgress {
  offboarding: IStaffOffboarding;
  assets: IAssetReturn[];
  documentsGenerated: {
    ui19: boolean;
    certificate: boolean;
    irp5: boolean;
    exitPack: boolean;
  };
  progress: {
    assetsReturned: number;
    totalAssets: number;
    exitInterviewComplete: boolean;
    finalPayCalculated: boolean;
  };
}

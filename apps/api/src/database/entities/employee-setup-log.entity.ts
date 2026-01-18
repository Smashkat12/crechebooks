/**
 * Employee Setup Log Entity
 * TASK-SPAY-008: Employee Auto-Setup Pipeline
 *
 * Tracks the comprehensive employee setup process for SimplePay integration.
 * Supports step-by-step tracking, rollback on failure, and retry capabilities.
 */

import type { EmployeeSetupLog, Prisma } from '@prisma/client';

// Re-export SetupStatus enum from entity (following codebase patterns)
export const SetupStatus = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  PARTIAL: 'PARTIAL',
  FAILED: 'FAILED',
  ROLLED_BACK: 'ROLLED_BACK',
} as const;

export type SetupStatus = (typeof SetupStatus)[keyof typeof SetupStatus];

// Interface alias for the Prisma model
export type IEmployeeSetupLog = EmployeeSetupLog;

// Type for setup steps input
export type SetupStepsInput = Prisma.InputJsonValue;

/**
 * Setup step status tracking
 */
export const SetupStepStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  ROLLED_BACK: 'rolled_back',
} as const;

export type SetupStepStatus =
  (typeof SetupStepStatus)[keyof typeof SetupStepStatus];

/**
 * Pipeline step names
 */
export const PipelineStep = {
  CREATE_EMPLOYEE: 'create_employee',
  SET_SALARY: 'set_salary',
  ASSIGN_PROFILE: 'assign_profile',
  SETUP_LEAVE: 'setup_leave',
  CONFIGURE_TAX: 'configure_tax',
  ADD_CALCULATIONS: 'add_calculations',
  VERIFY_SETUP: 'verify_setup',
  SEND_NOTIFICATION: 'send_notification',
} as const;

export type PipelineStep = (typeof PipelineStep)[keyof typeof PipelineStep];

/**
 * Setup step result - tracks individual step execution
 */
export interface SetupStepResult {
  step: PipelineStep;
  status: SetupStepStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  details: Record<string, unknown>;
  canRollback: boolean;
  rollbackData: Record<string, unknown> | null;
}

/**
 * Employee Setup Log Entity Interface
 */
export interface EmployeeSetupLogEntity {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayEmployeeId: string | null;
  status: SetupStatus;
  setupSteps: SetupStepResult[];
  profileAssigned: string | null;
  leaveInitialized: boolean;
  taxConfigured: boolean;
  calculationsAdded: number;
  triggeredBy: string;
  errors: SetupError[] | null;
  warnings: SetupWarning[] | null;
  startedAt: Date;
  completedAt: Date | null;
}

/**
 * Setup error structure
 */
export interface SetupError {
  step: PipelineStep;
  code: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * Setup warning structure
 */
export interface SetupWarning {
  step: PipelineStep;
  code: string;
  message: string;
  details: Record<string, unknown>;
  timestamp: string;
}

/**
 * Leave entitlements based on BCEA (South Africa)
 */
export interface LeaveEntitlements {
  annualDays: number; // Pro-rata of 15 working days/year
  sickDays: number; // 30 days per 3-year cycle (NOT pro-rated)
  familyResponsibilityDays: number; // Pro-rata of 3 days/year
  maternityMonths: number; // 4 months (handled separately)
}

/**
 * BCEA-compliant leave constants
 */
export const BCEA_LEAVE = {
  ANNUAL_DAYS_PER_YEAR: 15, // Working days
  SICK_DAYS_PER_CYCLE: 30, // Per 3-year cycle
  SICK_CYCLE_YEARS: 3,
  FAMILY_RESPONSIBILITY_DAYS: 3, // Per year
  MATERNITY_MONTHS: 4,
  WORKING_DAYS_PER_WEEK: 5,
  WORKING_HOURS_PER_DAY: 8,
} as const;

/**
 * Tax settings for employee setup
 */
export interface TaxSettings {
  taxNumber: string | null;
  taxStatus: string; // 'RESIDENT', 'NON_RESIDENT', 'DIRECTIVE'
  directorIndicator: boolean;
}

/**
 * Additional calculation to add during setup
 */
export interface AdditionalCalculation {
  code: string;
  name: string;
  type: 'EARNING' | 'DEDUCTION' | 'COMPANY_CONTRIBUTION';
  amountCents: number | null;
  percentage: number | null;
  isRecurring: boolean;
}

/**
 * Profile selection rule - maps role/employment type to SimplePay profile
 */
export interface ProfileSelectionRule {
  role: string | null;
  employmentType: string | null;
  profileName: string;
  priority: number;
}

/**
 * Setup pipeline context - passed between steps
 */
export interface SetupPipelineContext {
  tenantId: string;
  staffId: string;
  staff: {
    firstName: string;
    lastName: string;
    idNumber: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: Date;
    startDate: Date;
    endDate: Date | null;
    employmentType: string;
    position: string | null;
    payFrequency: string;
    basicSalaryCents: number;
    taxNumber: string | null;
    bankName: string | null;
    bankAccount: string | null;
    bankBranchCode: string | null;
    paymentMethod: string | null;
  };
  setupLog: IEmployeeSetupLog;
  simplePayEmployeeId: string | null;
  waveId: number | null;
  profileId: number | null;
  profileName: string | null;
  leaveEntitlements: LeaveEntitlements | null;
  taxSettings: TaxSettings | null;
  additionalCalculations: AdditionalCalculation[];
  errors: SetupError[];
  warnings: SetupWarning[];
  stepResults: SetupStepResult[];
}

/**
 * Setup request - input for initiating setup
 */
export interface EmployeeSetupRequest {
  staffId: string;
  triggeredBy: string;
  profileId?: number; // Optional: auto-select if not provided
  leaveEntitlements?: LeaveEntitlements; // Optional: calculate pro-rata if not provided
  taxSettings?: TaxSettings; // Optional: use staff data if not provided
  additionalCalculations?: AdditionalCalculation[]; // Optional: extra earnings/deductions
}

/**
 * Setup result - returned after setup completion
 */
export interface EmployeeSetupResult {
  success: boolean;
  setupLogId: string;
  staffId: string;
  simplePayEmployeeId: string | null;
  status: SetupStatus;
  stepsCompleted: number;
  stepsFailed: number;
  profileAssigned: string | null;
  leaveInitialized: boolean;
  taxConfigured: boolean;
  calculationsAdded: number;
  errors: SetupError[];
  warnings: SetupWarning[];
  durationMs: number;
}

/**
 * Retry request
 */
export interface SetupRetryRequest {
  setupLogId: string;
  fromStep?: PipelineStep; // Start from specific step, or continue from last failed
  force?: boolean; // Retry even if status is COMPLETED
}

/**
 * Setup status summary
 */
export interface SetupStatusSummary {
  setupLogId: string;
  staffId: string;
  staffName: string;
  status: SetupStatus;
  progress: number; // 0-100
  currentStep: PipelineStep | null;
  stepsCompleted: number;
  totalSteps: number;
  simplePayEmployeeId: string | null;
  profileAssigned: string | null;
  leaveInitialized: boolean;
  taxConfigured: boolean;
  calculationsAdded: number;
  hasErrors: boolean;
  hasWarnings: boolean;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
}

/**
 * Helper function: Create initial step results
 */
export function createInitialStepResults(): SetupStepResult[] {
  return Object.values(PipelineStep).map((step) => ({
    step: step as PipelineStep,
    status: SetupStepStatus.PENDING,
    startedAt: null,
    completedAt: null,
    durationMs: null,
    error: null,
    details: {},
    canRollback: false,
    rollbackData: null,
  }));
}

/**
 * Helper function: Calculate setup progress percentage
 */
export function calculateProgress(steps: SetupStepResult[]): number {
  const totalSteps = steps.length;
  const completedSteps = steps.filter(
    (s) =>
      s.status === SetupStepStatus.COMPLETED ||
      s.status === SetupStepStatus.SKIPPED,
  ).length;
  return Math.round((completedSteps / totalSteps) * 100);
}

/**
 * Helper function: Get current step
 */
export function getCurrentStep(steps: SetupStepResult[]): PipelineStep | null {
  const inProgress = steps.find(
    (s) => s.status === SetupStepStatus.IN_PROGRESS,
  );
  if (inProgress) return inProgress.step;

  const firstPending = steps.find((s) => s.status === SetupStepStatus.PENDING);
  if (firstPending) return firstPending.step;

  return null;
}

/**
 * Helper function: Determine overall status from step results
 */
export function determineOverallStatus(steps: SetupStepResult[]): SetupStatus {
  const hasInProgress = steps.some(
    (s) => s.status === SetupStepStatus.IN_PROGRESS,
  );
  if (hasInProgress) return SetupStatus.IN_PROGRESS;

  const hasFailed = steps.some((s) => s.status === SetupStepStatus.FAILED);
  const hasRolledBack = steps.some(
    (s) => s.status === SetupStepStatus.ROLLED_BACK,
  );

  if (hasRolledBack) return SetupStatus.ROLLED_BACK;

  const allCompleted = steps.every(
    (s) =>
      s.status === SetupStepStatus.COMPLETED ||
      s.status === SetupStepStatus.SKIPPED,
  );
  if (allCompleted) return SetupStatus.COMPLETED;

  if (hasFailed) {
    const completedCount = steps.filter(
      (s) => s.status === SetupStepStatus.COMPLETED,
    ).length;
    return completedCount > 0 ? SetupStatus.PARTIAL : SetupStatus.FAILED;
  }

  return SetupStatus.PENDING;
}

/**
 * Helper function: Check if step can be retried
 */
export function canRetryStep(step: SetupStepResult): boolean {
  return (
    step.status === SetupStepStatus.FAILED ||
    step.status === SetupStepStatus.ROLLED_BACK
  );
}

/**
 * Helper function: Check if setup can be retried
 */
export function canRetrySetup(status: SetupStatus): boolean {
  return (
    status === SetupStatus.FAILED ||
    status === SetupStatus.PARTIAL ||
    status === SetupStatus.ROLLED_BACK
  );
}

/**
 * Service Period Entity Types
 * TASK-SPAY-004: SimplePay Service Period Management
 *
 * Provides types for service period tracking, termination processing,
 * and reinstatement operations for South African payroll compliance.
 *
 * South African UI-19 Termination Codes:
 * - Code 1: RESIGNATION - Voluntary termination by employee (UIF eligible after waiting period)
 * - Code 2: DISMISSAL_MISCONDUCT - Termination due to misconduct (NOT UIF eligible)
 * - Code 3: DISMISSAL_INCAPACITY - Termination due to incapacity (UIF eligible)
 * - Code 4: RETRENCHMENT - Redundancy/business reasons (UIF eligible)
 * - Code 5: CONTRACT_EXPIRY - Fixed-term contract ended (UIF eligible)
 * - Code 6: RETIREMENT - Retirement (UIF eligible)
 * - Code 7: DEATH - Employee deceased (Benefits to dependents)
 * - Code 8: ABSCONDED - Employee abandoned position (NOT UIF eligible)
 * - Code 9: TRANSFER - Transfer to another employer (N/A)
 */

import type { ServicePeriodSync, TerminationCode } from '@prisma/client';

// Re-export Prisma types
export type { TerminationCode };
export { TerminationCode as TerminationCodeEnum } from '@prisma/client';

// Interface alias for the Prisma model
export type IServicePeriodSync = ServicePeriodSync;

/**
 * SimplePay termination code mapping (our enum to SimplePay string codes)
 * SimplePay uses string codes "1" through "9" for UI-19 termination reasons
 */
export const TERMINATION_CODE_MAP: Record<TerminationCode, string> = {
  RESIGNATION: '1',
  DISMISSAL_MISCONDUCT: '2',
  DISMISSAL_INCAPACITY: '3',
  RETRENCHMENT: '4',
  CONTRACT_EXPIRY: '5',
  RETIREMENT: '6',
  DEATH: '7',
  ABSCONDED: '8',
  TRANSFER: '9',
};

/**
 * SimplePay code to our enum mapping (reverse of TERMINATION_CODE_MAP)
 */
export const SIMPLEPAY_CODE_MAP: Record<string, TerminationCode> = {
  '1': 'RESIGNATION',
  '2': 'DISMISSAL_MISCONDUCT',
  '3': 'DISMISSAL_INCAPACITY',
  '4': 'RETRENCHMENT',
  '5': 'CONTRACT_EXPIRY',
  '6': 'RETIREMENT',
  '7': 'DEATH',
  '8': 'ABSCONDED',
  '9': 'TRANSFER',
};

/**
 * UIF eligibility by termination code
 * Used for UI-19 generation and benefit entitlement determination
 */
export const UIF_ELIGIBILITY: Record<
  TerminationCode,
  {
    eligible: boolean;
    waitingPeriod: boolean;
    notes: string;
  }
> = {
  RESIGNATION: {
    eligible: true,
    waitingPeriod: true,
    notes: 'UIF eligible after 6-week waiting period',
  },
  DISMISSAL_MISCONDUCT: {
    eligible: false,
    waitingPeriod: false,
    notes: 'Not eligible for UIF benefits due to misconduct',
  },
  DISMISSAL_INCAPACITY: {
    eligible: true,
    waitingPeriod: false,
    notes: 'UIF eligible - illness/disability related termination',
  },
  RETRENCHMENT: {
    eligible: true,
    waitingPeriod: false,
    notes: 'UIF eligible - operational requirements',
  },
  CONTRACT_EXPIRY: {
    eligible: true,
    waitingPeriod: false,
    notes: 'UIF eligible - fixed-term contract ended',
  },
  RETIREMENT: {
    eligible: true,
    waitingPeriod: false,
    notes: 'UIF eligible - normal retirement',
  },
  DEATH: {
    eligible: true,
    waitingPeriod: false,
    notes: 'Benefits payable to dependents',
  },
  ABSCONDED: {
    eligible: false,
    waitingPeriod: false,
    notes: 'Not eligible for UIF - abandoned employment',
  },
  TRANSFER: {
    eligible: false,
    waitingPeriod: false,
    notes: 'N/A - continuous employment with new employer',
  },
};

/**
 * Human-readable termination code descriptions
 */
export const TERMINATION_CODE_DESCRIPTIONS: Record<TerminationCode, string> = {
  RESIGNATION: 'Resignation - Employee voluntary termination',
  DISMISSAL_MISCONDUCT: 'Dismissal - Misconduct',
  DISMISSAL_INCAPACITY: 'Dismissal - Incapacity (illness/disability)',
  RETRENCHMENT: 'Retrenchment - Operational requirements',
  CONTRACT_EXPIRY: 'Contract Expiry - Fixed-term contract ended',
  RETIREMENT: 'Retirement',
  DEATH: 'Death of employee',
  ABSCONDED: 'Absconded - Employee abandoned position',
  TRANSFER: 'Transfer to another employer',
};

/**
 * SimplePay API service period response structure
 * Note: SimplePay returns wrapped responses like [{ service_period: {...} }]
 */
export interface SimplePayServicePeriod {
  id: string | number;
  employee_id: string | number;
  start_date: string;
  end_date: string | null;
  termination_reason: string | null;
  termination_code: string | null;
  last_working_day: string | null;
  is_active: boolean;
}

/**
 * Normalized service period interface for internal use
 */
export interface ServicePeriod {
  id: string;
  simplePayEmployeeId: string;
  startDate: Date;
  endDate: Date | null;
  terminationCode: TerminationCode | null;
  terminationReason: string | null;
  lastWorkingDay: Date | null;
  isActive: boolean;
}

/**
 * Termination request to SimplePay API
 */
export interface TerminationRequest {
  terminationCode: TerminationCode;
  terminationReason: string | null;
  lastWorkingDay: Date;
  endDate: Date;
  finalPayslipRequired?: boolean;
}

/**
 * Reinstatement request to SimplePay API
 */
export interface ReinstatementRequest {
  effectiveDate: Date;
  reason: string | null;
  preserveHistory?: boolean;
}

/**
 * Termination result from service
 */
export interface TerminationResult {
  success: boolean;
  servicePeriodId: string | null;
  simplePayEmployeeId: string;
  terminationCode: TerminationCode;
  lastWorkingDay: Date;
  endDate: Date;
  finalPayslipId: string | null;
  uifEligible: boolean;
  uifWaitingPeriod: boolean;
  error: string | null;
}

/**
 * Reinstatement result from service
 */
export interface ReinstatementResult {
  success: boolean;
  servicePeriodId: string | null;
  simplePayEmployeeId: string;
  newServicePeriodId: string | null;
  startDate: Date;
  error: string | null;
}

/**
 * Service period sync filter options
 */
export interface ServicePeriodFilter {
  isActive?: boolean;
  staffId?: string;
  terminationCode?: TerminationCode;
  startDateFrom?: Date;
  startDateTo?: Date;
  endDateFrom?: Date;
  endDateTo?: Date;
  page?: number;
  limit?: number;
}

/**
 * Service period comparison between local and SimplePay
 */
export interface ServicePeriodComparison {
  staffId: string;
  simplePayEmployeeId: string;
  isInSync: boolean;
  differences: Array<{
    field: string;
    localValue: unknown;
    remoteValue: unknown;
  }>;
}

/**
 * Helper function: Convert SimplePay termination code to our enum
 */
export function simplePayCodeToTerminationCode(
  code: string | null | undefined,
): TerminationCode | null {
  if (!code) return null;
  return SIMPLEPAY_CODE_MAP[code] || null;
}

/**
 * Helper function: Convert our enum to SimplePay code
 */
export function terminationCodeToSimplePayCode(
  code: TerminationCode | null | undefined,
): string | null {
  if (!code) return null;
  return TERMINATION_CODE_MAP[code] || null;
}

/**
 * Helper function: Check if termination code is UIF eligible
 */
export function isUifEligible(code: TerminationCode): boolean {
  return UIF_ELIGIBILITY[code].eligible;
}

/**
 * Helper function: Check if termination code requires waiting period
 */
export function hasUifWaitingPeriod(code: TerminationCode): boolean {
  return UIF_ELIGIBILITY[code].waitingPeriod;
}

/**
 * Helper function: Get UIF eligibility info for a termination code
 */
export function getUifEligibilityInfo(code: TerminationCode): {
  eligible: boolean;
  waitingPeriod: boolean;
  notes: string;
} {
  return UIF_ELIGIBILITY[code];
}

/**
 * Helper function: Parse SimplePay service period response
 */
export function parseSimplePayServicePeriod(
  raw: SimplePayServicePeriod,
): ServicePeriod {
  return {
    id: String(raw.id),
    simplePayEmployeeId: String(raw.employee_id),
    startDate: new Date(raw.start_date),
    endDate: raw.end_date ? new Date(raw.end_date) : null,
    terminationCode: simplePayCodeToTerminationCode(raw.termination_code),
    terminationReason: raw.termination_reason,
    lastWorkingDay: raw.last_working_day
      ? new Date(raw.last_working_day)
      : null,
    isActive: raw.is_active,
  };
}

/**
 * Validate termination code is a valid enum value
 */
export function isValidTerminationCode(code: string): code is TerminationCode {
  return Object.keys(TERMINATION_CODE_MAP).includes(code);
}

/**
 * Get all valid termination codes
 */
export function getAllTerminationCodes(): TerminationCode[] {
  return Object.keys(TERMINATION_CODE_MAP) as TerminationCode[];
}

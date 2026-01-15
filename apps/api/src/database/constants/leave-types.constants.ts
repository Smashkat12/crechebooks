/**
 * Leave Type Constants for South African BCEA Compliance
 * TASK-STAFF-004
 *
 * Comprehensive leave type definitions covering all SA statutory leave types
 * and common custom leave types used in creche environments.
 *
 * References:
 * - Basic Conditions of Employment Act (BCEA) - Chapter 3
 * - Labour Relations Act
 * - SimplePay Leave Types API
 * - Xero Payroll AU Leave Types
 */

/**
 * Comprehensive Leave Type Enum
 * Covers all SA statutory leave types plus common custom types
 */
export enum LeaveType {
  // BCEA Statutory Leave Types
  /** Annual Leave - 21 consecutive days / ~15 working days per year */
  ANNUAL = 'ANNUAL',
  /** Sick Leave - 30 days over 3-year cycle (6 weeks' worth) */
  SICK = 'SICK',
  /** Family Responsibility Leave - 3 days per year */
  FAMILY_RESPONSIBILITY = 'FAMILY_RESPONSIBILITY',
  /** Maternity Leave - 4 consecutive months (unpaid, UIF covers) */
  MATERNITY = 'MATERNITY',
  /** Parental Leave - 10 consecutive days for non-birthing parent */
  PARENTAL = 'PARENTAL',
  /** Adoption Leave - 10 consecutive weeks for adopting parent */
  ADOPTION = 'ADOPTION',
  /** Commissioning Parental Leave - For surrogacy arrangements */
  COMMISSIONING_PARENTAL = 'COMMISSIONING_PARENTAL',

  // Additional Common Types
  /** Study Leave - For educational purposes */
  STUDY = 'STUDY',
  /** Unpaid Leave - Leave without pay */
  UNPAID = 'UNPAID',
  /** Compassionate/Bereavement Leave - For death of close relatives */
  COMPASSIONATE = 'COMPASSIONATE',
  /** Special Leave - Catch-all for other approved leave */
  SPECIAL = 'SPECIAL',

  // COVID-Related (may still be applicable)
  /** COVID Quarantine Leave - For isolation requirements */
  COVID_QUARANTINE = 'COVID_QUARANTINE',

  // Creche-Specific Leave Types
  /** School Holidays - For staff during creche closure periods */
  SCHOOL_HOLIDAYS = 'SCHOOL_HOLIDAYS',
  /** Training Leave - For professional development */
  TRAINING = 'TRAINING',
}

/**
 * Accrual basis for leave entitlements
 */
export type LeaveAccrualBasis =
  | 'ANNUAL' // Accrues/resets annually
  | 'MONTHLY' // Accrues monthly
  | 'CYCLE_3_YEAR' // 3-year cycle (e.g., sick leave)
  | 'EVENT' // Event-based (e.g., maternity, adoption)
  | null; // No accrual (ad-hoc)

/**
 * Leave type configuration interface
 */
export interface LeaveTypeConfig {
  /** Leave type identifier */
  type: LeaveType;
  /** Human-readable name */
  name: string;
  /** Description of the leave type */
  description: string;
  /** Whether the leave is paid by employer */
  isPaid: boolean;
  /** Whether this is a statutory (BCEA-mandated) leave type */
  isStatutory: boolean;
  /** Default entitlement in days per period (null if event-based or unlimited) */
  defaultEntitlement: number | null;
  /** How the leave accrues */
  accrualBasis: LeaveAccrualBasis;
  /** Minimum service period required (in months, null if none) */
  minServiceMonths: number | null;
  /** Whether a medical certificate is required */
  requiresCertificate: boolean;
  /** Maximum consecutive days allowed (null if unlimited) */
  maxConsecutiveDays: number | null;
}

/**
 * Complete Leave Type Configuration
 * All values align with BCEA requirements
 */
export const LEAVE_TYPE_CONFIG: Record<LeaveType, LeaveTypeConfig> = {
  [LeaveType.ANNUAL]: {
    type: LeaveType.ANNUAL,
    name: 'Annual Leave',
    description:
      'Paid annual vacation leave. BCEA mandates 21 consecutive days (approximately 15 working days) per annual leave cycle.',
    isPaid: true,
    isStatutory: true,
    defaultEntitlement: 21, // 21 consecutive days = ~15 working days
    accrualBasis: 'ANNUAL',
    minServiceMonths: null, // Accrues from day 1
    requiresCertificate: false,
    maxConsecutiveDays: null,
  },
  [LeaveType.SICK]: {
    type: LeaveType.SICK,
    name: 'Sick Leave',
    description:
      'Paid sick leave per BCEA. Employees are entitled to 30 days sick leave over a 3-year cycle (equivalent to 6 weeks).',
    isPaid: true,
    isStatutory: true,
    defaultEntitlement: 30, // 30 days over 3-year cycle
    accrualBasis: 'CYCLE_3_YEAR',
    minServiceMonths: null,
    requiresCertificate: true, // Required for >2 consecutive days
    maxConsecutiveDays: null,
  },
  [LeaveType.FAMILY_RESPONSIBILITY]: {
    type: LeaveType.FAMILY_RESPONSIBILITY,
    name: 'Family Responsibility Leave',
    description:
      'Leave for family emergencies including birth of child, illness of child, or death of close family member. 3 days per annual cycle.',
    isPaid: true,
    isStatutory: true,
    defaultEntitlement: 3,
    accrualBasis: 'ANNUAL',
    minServiceMonths: 4, // Must work >4 months and >4 days/week
    requiresCertificate: true, // Proof may be required
    maxConsecutiveDays: 3,
  },
  [LeaveType.MATERNITY]: {
    type: LeaveType.MATERNITY,
    name: 'Maternity Leave',
    description:
      'Leave for childbirth. 4 consecutive months, starting at least 4 weeks before expected due date. Unpaid by employer (UIF covers partial).',
    isPaid: false, // UIF covers, not employer
    isStatutory: true,
    defaultEntitlement: 120, // ~4 months (17 weeks minimum)
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true,
    maxConsecutiveDays: 120,
  },
  [LeaveType.PARENTAL]: {
    type: LeaveType.PARENTAL,
    name: 'Parental Leave',
    description:
      'Leave for non-birthing parent following birth or adoption. 10 consecutive days, unpaid (UIF covers partial).',
    isPaid: false, // UIF covers
    isStatutory: true,
    defaultEntitlement: 10,
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true,
    maxConsecutiveDays: 10,
  },
  [LeaveType.ADOPTION]: {
    type: LeaveType.ADOPTION,
    name: 'Adoption Leave',
    description:
      'Leave for adopting a child under 2 years old. 10 consecutive weeks for primary adopter, unpaid (UIF covers partial).',
    isPaid: false, // UIF covers
    isStatutory: true,
    defaultEntitlement: 70, // 10 weeks = ~70 days
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true,
    maxConsecutiveDays: 70,
  },
  [LeaveType.COMMISSIONING_PARENTAL]: {
    type: LeaveType.COMMISSIONING_PARENTAL,
    name: 'Commissioning Parental Leave',
    description:
      'Leave for commissioning parents in surrogacy arrangements. Same entitlements as adoption leave.',
    isPaid: false, // UIF covers
    isStatutory: true,
    defaultEntitlement: 70, // 10 weeks = ~70 days
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true,
    maxConsecutiveDays: 70,
  },
  [LeaveType.STUDY]: {
    type: LeaveType.STUDY,
    name: 'Study Leave',
    description:
      'Leave for educational purposes, examinations, or training courses. Not statutory, at employer discretion.',
    isPaid: true, // Typically paid if employer-approved
    isStatutory: false,
    defaultEntitlement: null, // At employer discretion
    accrualBasis: null,
    minServiceMonths: null,
    requiresCertificate: true, // Proof of enrollment/exams
    maxConsecutiveDays: null,
  },
  [LeaveType.UNPAID]: {
    type: LeaveType.UNPAID,
    name: 'Unpaid Leave',
    description:
      'Leave without pay, approved at employer discretion when other leave entitlements exhausted.',
    isPaid: false,
    isStatutory: false,
    defaultEntitlement: null,
    accrualBasis: null,
    minServiceMonths: null,
    requiresCertificate: false,
    maxConsecutiveDays: null,
  },
  [LeaveType.COMPASSIONATE]: {
    type: LeaveType.COMPASSIONATE,
    name: 'Compassionate Leave',
    description:
      'Bereavement leave for death of close family members. May overlap with Family Responsibility Leave.',
    isPaid: true, // Typically paid
    isStatutory: false, // Covered under Family Responsibility for close relatives
    defaultEntitlement: 3, // Common practice
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true, // Death certificate
    maxConsecutiveDays: 5,
  },
  [LeaveType.SPECIAL]: {
    type: LeaveType.SPECIAL,
    name: 'Special Leave',
    description:
      'Catch-all category for other approved leave types not covered by standard categories.',
    isPaid: true, // Depends on approval
    isStatutory: false,
    defaultEntitlement: null,
    accrualBasis: null,
    minServiceMonths: null,
    requiresCertificate: false,
    maxConsecutiveDays: null,
  },
  [LeaveType.COVID_QUARANTINE]: {
    type: LeaveType.COVID_QUARANTINE,
    name: 'COVID-19 Quarantine Leave',
    description:
      'Leave for COVID-19 isolation or quarantine requirements. May be deducted from sick leave or treated as special leave.',
    isPaid: true, // Often treated as sick leave
    isStatutory: false,
    defaultEntitlement: 14, // Typical quarantine period
    accrualBasis: 'EVENT',
    minServiceMonths: null,
    requiresCertificate: true, // Test result or medical certificate
    maxConsecutiveDays: 14,
  },
  [LeaveType.SCHOOL_HOLIDAYS]: {
    type: LeaveType.SCHOOL_HOLIDAYS,
    name: 'School Holidays',
    description:
      'Creche-specific leave during school closure periods. May be paid or unpaid depending on employment contract.',
    isPaid: true, // Depends on contract
    isStatutory: false,
    defaultEntitlement: null, // Varies by creche calendar
    accrualBasis: null,
    minServiceMonths: null,
    requiresCertificate: false,
    maxConsecutiveDays: null,
  },
  [LeaveType.TRAINING]: {
    type: LeaveType.TRAINING,
    name: 'Training Leave',
    description:
      'Leave for professional development, workshops, or mandatory training courses.',
    isPaid: true, // Typically paid if employer-mandated
    isStatutory: false,
    defaultEntitlement: null,
    accrualBasis: null,
    minServiceMonths: null,
    requiresCertificate: true, // Training attendance proof
    maxConsecutiveDays: null,
  },
};

/**
 * SimplePay Leave Type Mapping
 * Maps internal LeaveType to SimplePay API leave type codes
 */
export const SIMPLEPAY_LEAVE_TYPE_MAP: Record<LeaveType, string> = {
  [LeaveType.ANNUAL]: 'ANNUAL',
  [LeaveType.SICK]: 'SICK',
  [LeaveType.FAMILY_RESPONSIBILITY]: 'FAMILY',
  [LeaveType.MATERNITY]: 'MATERNITY',
  [LeaveType.PARENTAL]: 'PARENTAL',
  [LeaveType.ADOPTION]: 'ADOPTION',
  [LeaveType.COMMISSIONING_PARENTAL]: 'PARENTAL', // Maps to parental in SimplePay
  [LeaveType.STUDY]: 'STUDY',
  [LeaveType.UNPAID]: 'UNPAID',
  [LeaveType.COMPASSIONATE]: 'COMPASSIONATE',
  [LeaveType.SPECIAL]: 'SPECIAL',
  [LeaveType.COVID_QUARANTINE]: 'COVID',
  [LeaveType.SCHOOL_HOLIDAYS]: 'CUSTOM_1', // Custom mapping needed
  [LeaveType.TRAINING]: 'CUSTOM_2', // Custom mapping needed
};

/**
 * Reverse SimplePay mapping (SimplePay code -> Internal LeaveType)
 * Note: Some internal types map to the same SimplePay code (e.g., COMMISSIONING_PARENTAL -> PARENTAL)
 * This reverse map uses the most common/primary internal type for each SimplePay code
 */
export const SIMPLEPAY_TO_INTERNAL_MAP: Record<string, LeaveType> = {
  ANNUAL: LeaveType.ANNUAL,
  SICK: LeaveType.SICK,
  FAMILY: LeaveType.FAMILY_RESPONSIBILITY,
  MATERNITY: LeaveType.MATERNITY,
  PARENTAL: LeaveType.PARENTAL, // Primary mapping; COMMISSIONING_PARENTAL also maps here
  ADOPTION: LeaveType.ADOPTION,
  STUDY: LeaveType.STUDY,
  UNPAID: LeaveType.UNPAID,
  COMPASSIONATE: LeaveType.COMPASSIONATE,
  SPECIAL: LeaveType.SPECIAL,
  COVID: LeaveType.COVID_QUARANTINE,
  CUSTOM_1: LeaveType.SCHOOL_HOLIDAYS,
  CUSTOM_2: LeaveType.TRAINING,
  OTHER: LeaveType.SPECIAL, // Fallback for unmapped types
};

/**
 * Xero Leave Type Mapping
 * Maps internal LeaveType to Xero Payroll leave type identifiers
 */
export const XERO_LEAVE_TYPE_MAP: Record<LeaveType, string> = {
  [LeaveType.ANNUAL]: 'annual-leave',
  [LeaveType.SICK]: 'sick-leave',
  [LeaveType.FAMILY_RESPONSIBILITY]: 'family-responsibility-leave',
  [LeaveType.MATERNITY]: 'maternity-leave',
  [LeaveType.PARENTAL]: 'parental-leave',
  [LeaveType.ADOPTION]: 'adoption-leave',
  [LeaveType.COMMISSIONING_PARENTAL]: 'parental-leave', // Maps to parental in Xero
  [LeaveType.STUDY]: 'study-leave',
  [LeaveType.UNPAID]: 'unpaid-leave',
  [LeaveType.COMPASSIONATE]: 'compassionate-leave',
  [LeaveType.SPECIAL]: 'other-leave',
  [LeaveType.COVID_QUARANTINE]: 'quarantine-leave',
  [LeaveType.SCHOOL_HOLIDAYS]: 'other-leave', // Custom type maps to other
  [LeaveType.TRAINING]: 'training-leave',
};

/**
 * Reverse Xero mapping (Xero code -> Internal LeaveType)
 * Note: Some internal types map to the same Xero code
 * This reverse map uses the most common/primary internal type for each Xero code
 */
export const XERO_TO_INTERNAL_MAP: Record<string, LeaveType> = {
  'annual-leave': LeaveType.ANNUAL,
  'sick-leave': LeaveType.SICK,
  'family-responsibility-leave': LeaveType.FAMILY_RESPONSIBILITY,
  'maternity-leave': LeaveType.MATERNITY,
  'parental-leave': LeaveType.PARENTAL, // Primary mapping
  'adoption-leave': LeaveType.ADOPTION,
  'study-leave': LeaveType.STUDY,
  'unpaid-leave': LeaveType.UNPAID,
  'compassionate-leave': LeaveType.COMPASSIONATE,
  'other-leave': LeaveType.SPECIAL, // Primary mapping for other-leave
  'quarantine-leave': LeaveType.COVID_QUARANTINE,
  'training-leave': LeaveType.TRAINING,
};

/**
 * Leave types that are statutory under BCEA
 */
export const STATUTORY_LEAVE_TYPES: LeaveType[] = [
  LeaveType.ANNUAL,
  LeaveType.SICK,
  LeaveType.FAMILY_RESPONSIBILITY,
  LeaveType.MATERNITY,
  LeaveType.PARENTAL,
  LeaveType.ADOPTION,
  LeaveType.COMMISSIONING_PARENTAL,
];

/**
 * Leave types that are paid by the employer (not UIF)
 */
export const PAID_LEAVE_TYPES: LeaveType[] = [
  LeaveType.ANNUAL,
  LeaveType.SICK,
  LeaveType.FAMILY_RESPONSIBILITY,
  LeaveType.STUDY,
  LeaveType.COMPASSIONATE,
  LeaveType.SPECIAL,
  LeaveType.COVID_QUARANTINE,
  LeaveType.SCHOOL_HOLIDAYS,
  LeaveType.TRAINING,
];

/**
 * Leave types covered by UIF (not employer-paid)
 */
export const UIF_COVERED_LEAVE_TYPES: LeaveType[] = [
  LeaveType.MATERNITY,
  LeaveType.PARENTAL,
  LeaveType.ADOPTION,
  LeaveType.COMMISSIONING_PARENTAL,
];

/**
 * Enrollment Entity
 * Tracks child enrollment in fee structures with start/end dates and status
 */

export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}

export interface IEnrollment {
  id: string;
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
  endDate: Date | null;
  status: EnrollmentStatus;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

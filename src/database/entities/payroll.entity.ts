/**
 * Payroll Entity
 * Tracks monthly pay records including basic salary, overtime, bonuses,
 * PAYE, UIF deductions, and medical aid credits. Critical for EMP201
 * and IRP5 SARS submission generation.
 */

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
}

export interface IPayroll {
  id: string;
  tenantId: string;
  staffId: string;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  basicSalaryCents: number;
  overtimeCents: number;
  bonusCents: number;
  otherEarningsCents: number;
  grossSalaryCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  uifEmployerCents: number;
  otherDeductionsCents: number;
  netSalaryCents: number;
  medicalAidCreditCents: number;
  status: PayrollStatus;
  paymentDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

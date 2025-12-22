// SARS Compliance types

export interface IStaff {
  id: string;
  tenantId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  idNumber: string;
  taxNumber?: string;
  dateOfBirth: Date;
  startDate: Date;
  endDate?: Date;
  status: StaffStatus;
  salary: number; // Monthly salary in cents
  paymentMethod: PaymentMethod;
  bankAccountNumber?: string;
  bankBranchCode?: string;
}

export enum StaffStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  TERMINATED = 'TERMINATED',
}

export enum PaymentMethod {
  EFT = 'EFT',
  CASH = 'CASH',
}

export interface IPayrollPeriod {
  id: string;
  tenantId: string;
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
  status: PayrollStatus;
  processedAt?: Date;
  entries: IPayrollEntry[];
}

export interface IPayrollEntry {
  id: string;
  payrollPeriodId: string;
  staffId: string;
  grossSalary: number;
  paye: number;
  uif: number;
  uifEmployer: number;
  netSalary: number;
  deductions: IPayrollDeduction[];
}

export interface IPayrollDeduction {
  type: string;
  amount: number;
  description?: string;
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  PROCESSED = 'PROCESSED',
  SUBMITTED = 'SUBMITTED',
}

export interface ISarsSubmission {
  id: string;
  tenantId: string;
  type: SarsSubmissionType;
  period: string; // e.g., "2025-01" for January 2025
  year: number;
  month?: number;
  status: SarsSubmissionStatus;
  data: Record<string, unknown>;
  generatedAt: Date;
  submittedAt?: Date;
  referenceNumber?: string;
  fileName?: string;
}

export enum SarsSubmissionType {
  VAT201 = 'VAT201',
  EMP201 = 'EMP201',
  IRP5 = 'IRP5',
}

export enum SarsSubmissionStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  REVIEWED = 'REVIEWED',
  SUBMITTED = 'SUBMITTED',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export interface IVAT201 {
  taxPeriod: string;
  standardRatedSupplies: number;
  zeroRatedSupplies: number;
  exemptSupplies: number;
  outputVat: number;
  standardRatedAcquisitions: number;
  inputVat: number;
  netVat: number;
}

export interface IEMP201 {
  taxPeriod: string;
  employeeCount: number;
  totalGrossRemuneration: number;
  totalPaye: number;
  totalUif: number;
  totalUifEmployer: number;
  totalSdl: number;
  grandTotal: number;
}

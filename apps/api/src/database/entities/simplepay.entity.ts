/**
 * SimplePay Integration Entities
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 */

import type {
  SimplePayConnection,
  SimplePayEmployeeMapping,
  SimplePayPayslipImport,
  SimplePaySyncStatus,
  Prisma,
} from '@prisma/client';

// Re-export Prisma types
export type { SimplePaySyncStatus };

// Interface aliases for the Prisma models
export type ISimplePayConnection = SimplePayConnection;
export type ISimplePayEmployeeMapping = SimplePayEmployeeMapping;
export type ISimplePayPayslipImport = SimplePayPayslipImport;

// Type for payslip data input
export type PayslipDataInput = Prisma.InputJsonValue;

// SimplePay API Response Types
export interface SimplePayEmployee {
  id: string | number;
  wave_id?: number;
  first_name: string;
  last_name: string;
  id_number?: string;
  identification_type?: string;
  other_number?: string;
  passport_code?: string;
  tax_number?: string;
  email?: string;
  mobile?: string;
  birthdate?: string;
  appointment_date: string;
  termination_date?: string;
  employment_type?: string;
  payment_method?: string;
  basic_salary?: number;
  number?: string;
  job_title?: string;
  bank_account?: {
    bank_id: number;
    account_number: string;
    branch_code: string;
    account_type: string;
    holder_relationship: string;
  };
}

export interface SimplePayPayslip {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  gross: number;
  nett: number;
  paye: number;
  uif_employee: number;
  uif_employer: number;
  items: SimplePayPayslipItem[];
}

export interface SimplePayPayslipItem {
  code: string;
  description: string;
  amount: number;
  type: 'earning' | 'deduction';
}

export interface SimplePayIrp5 {
  tax_year: number;
  employee_id: string;
  certificate_number: string;
  gross_remuneration: number;
  paye_deducted: number;
}

export interface SimplePayEmp201 {
  period: string;
  total_paye: number;
  total_sdl: number;
  total_uif_employer: number;
  total_uif_employee: number;
  total_eti: number;
  employees_count: number;
}

export interface ConnectionStatus {
  isConnected: boolean;
  clientId: string | null;
  lastSyncAt: Date | null;
  syncErrorMessage: string | null;
  employeesSynced: number;
  employeesOutOfSync: number;
}

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ staffId: string; error: string }>;
}

export interface SyncComparison {
  staffId: string;
  simplePayEmployeeId: string;
  isInSync: boolean;
  differences: Array<{
    field: string;
    localValue: unknown;
    remoteValue: unknown;
  }>;
}

export interface BulkImportResult {
  imported: number;
  skipped: number;
  errors: Array<{ staffId: string; error: string }>;
}

export interface PayrollComparison {
  staffId: string;
  period: string;
  localGross: number;
  remoteGross: number;
  localNet: number;
  remoteNet: number;
  differences: Array<{
    item: string;
    localValue: number;
    remoteValue: number;
  }>;
}

export interface Emp201Comparison {
  period: string;
  local: {
    paye: number;
    uif: number;
    sdl: number;
  };
  remote: {
    paye: number;
    uif: number;
    sdl: number;
  };
  isMatch: boolean;
}

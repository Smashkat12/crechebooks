/**
 * Pay Run Sync Entity
 * TASK-SPAY-002: SimplePay Pay Run Tracking and Xero Journal Integration
 */

import type { PayRunSync, Prisma } from '@prisma/client';

// Re-export the enum from the entity (not from @prisma/client directly)
// This follows the codebase pattern of exporting enums from entity files
export const PayRunSyncStatus = {
  PENDING: 'PENDING',
  SYNCED: 'SYNCED',
  XERO_POSTED: 'XERO_POSTED',
  XERO_FAILED: 'XERO_FAILED',
} as const;

export type PayRunSyncStatus =
  (typeof PayRunSyncStatus)[keyof typeof PayRunSyncStatus];

// Interface alias for the Prisma model
export type IPayRunSync = PayRunSync;

// Type for accounting data input
export type AccountingDataInput = Prisma.InputJsonValue;

// SimplePay API Wave (payment wave/schedule) response
export interface SimplePayWave {
  id: number;
  name: string;
  pay_frequency: 'monthly' | 'weekly' | 'bi_weekly' | 'fortnightly';
  pay_day: number;
  is_active: boolean;
}

// SimplePay API Pay Run response
export interface SimplePayPayRun {
  id: string | number;
  wave_id: number;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: 'draft' | 'finalized' | 'paid';
  employee_count: number;
  total_gross: number;
  total_net: number;
}

// SimplePay API Payslip in Pay Run
export interface SimplePayPayslip {
  id: string | number;
  employee_id: string | number;
  employee_name: string;
  gross: number;
  nett: number;
  paye: number;
  uif_employee: number;
  uif_employer: number;
  items: SimplePayPayslipItem[];
}

// SimplePay Payslip Item
export interface SimplePayPayslipItem {
  code: string;
  description: string;
  amount: number;
  type: 'earning' | 'deduction' | 'company_contribution';
}

// SimplePay API Accounting Entry
export interface SimplePayAccountingEntry {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  description: string;
}

// SimplePay API Accounting Response (for a pay run)
export interface SimplePayAccounting {
  pay_run_id: string | number;
  period_start: string;
  period_end: string;
  entries: SimplePayAccountingEntry[];
  totals: {
    gross: number;
    nett: number;
    paye: number;
    uif_employee: number;
    uif_employer: number;
    sdl: number;
    eti: number;
  };
}

// Xero Journal configuration for posting
export interface XeroJournalConfig {
  salaryExpenseCode: string;
  salaryPayableCode: string;
  payePayableCode: string;
  uifPayableCode: string;
  sdlPayableCode: string;
  etiReceivableCode: string;
  narrationPrefix: string;
}

// Default Xero journal configuration for South African payroll
export const DEFAULT_XERO_JOURNAL_CONFIG: XeroJournalConfig = {
  salaryExpenseCode: '6100', // Salaries and Wages
  salaryPayableCode: '2100', // Accrued Wages Payable
  payePayableCode: '2200', // PAYE Payable
  uifPayableCode: '2210', // UIF Payable
  sdlPayableCode: '2220', // SDL Payable
  etiReceivableCode: '1400', // ETI Receivable
  narrationPrefix: 'SimplePay Payroll',
};

// Pay run summary with calculated totals
export interface PayRunSummary {
  id: string;
  simplePayPayRunId: string;
  waveName: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  status: string;
  employeeCount: number;
  totalGrossCents: number;
  totalNetCents: number;
  totalPayeCents: number;
  totalUifCents: number; // Employee + Employer combined
  totalSdlCents: number;
  totalEtiCents: number;
  syncStatus: PayRunSyncStatus;
  xeroJournalId: string | null;
  xeroSyncedAt: Date | null;
}

// Sync operation result
export interface PayRunSyncResult {
  success: boolean;
  payRunId: string;
  simplePayPayRunId: string;
  xeroJournalId: string | null;
  errors: string[];
}

// Wave with pay runs
export interface WaveWithPayRuns {
  wave: SimplePayWave;
  payRuns: SimplePayPayRun[];
}

// Pay run filter options
export interface PayRunFilterOptions {
  waveId?: number;
  status?: string;
  syncStatus?: PayRunSyncStatus;
  periodStart?: Date;
  periodEnd?: Date;
  limit?: number;
  offset?: number;
}

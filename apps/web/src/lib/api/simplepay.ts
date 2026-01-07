/**
 * SimplePay API Client
 * TASK-STAFF-004: SimplePay Integration
 *
 * Client functions for SimplePay payroll integration API endpoints.
 */

import { apiClient } from './client';

// ============================================================================
// Types
// ============================================================================

export interface ConnectionStatus {
  isConnected: boolean;
  clientId?: string;
  lastSyncAt?: string;
  syncErrorMessage?: string;
  employeesSynced: number;
  employeesOutOfSync: number;
}

export interface EmployeeSyncStatus {
  staffId: string;
  simplePayEmployeeId?: string;
  syncStatus: 'NOT_SYNCED' | 'SYNCED' | 'SYNC_FAILED' | 'OUT_OF_SYNC';
  lastSyncAt?: string;
  lastSyncError?: string;
}

export interface PayslipImport {
  id: string;
  staffId: string;
  simplePayPayslipId: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  grossSalaryCents: number;
  netSalaryCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  uifEmployerCents: number;
  importedAt: string;
}

export interface Irp5Certificate {
  taxYear: number;
  certificateNumber: string;
  grossRemuneration: number;
  payeDeducted: number;
  pdfUrl?: string;
}

export interface Emp201Data {
  period: string;
  totalPaye: number;
  totalUif: number;
  totalSdl: number;
  employeeCount: number;
  submissionStatus: 'PENDING' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED';
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: Array<{ staffId: string; error: string }>;
}

export interface ImportPayslipsParams {
  payPeriodStart: string;
  payPeriodEnd: string;
  staffIds?: string[];
}

export interface ImportPayslipsResult {
  imported: number;
  skipped: number;
  errors: Array<{ staffId: string; error: string }>;
}

// ============================================================================
// API Endpoints
// ============================================================================

const SIMPLEPAY_BASE = '/integrations/simplepay';

export const simplePayEndpoints = {
  status: `${SIMPLEPAY_BASE}/status`,
  connect: `${SIMPLEPAY_BASE}/connect`,
  test: `${SIMPLEPAY_BASE}/test`,
  disconnect: `${SIMPLEPAY_BASE}/disconnect`,
  employees: {
    syncAll: `${SIMPLEPAY_BASE}/employees/sync-all`,
    sync: (staffId: string) => `${SIMPLEPAY_BASE}/employees/${staffId}/sync`,
    status: (staffId: string) => `${SIMPLEPAY_BASE}/employees/${staffId}/status`,
    payslips: (staffId: string) => `${SIMPLEPAY_BASE}/employees/${staffId}/payslips`,
    irp5: (staffId: string) => `${SIMPLEPAY_BASE}/employees/${staffId}/irp5`,
    irp5Pdf: (staffId: string, year: number) => `${SIMPLEPAY_BASE}/employees/${staffId}/irp5/${year}/pdf`,
  },
  payslips: {
    import: `${SIMPLEPAY_BASE}/payslips/import`,
    pdf: (payslipId: string) => `${SIMPLEPAY_BASE}/payslips/${payslipId}/pdf`,
  },
  emp201: `${SIMPLEPAY_BASE}/emp201`,
};

// ============================================================================
// API Functions
// ============================================================================

/**
 * Get SimplePay connection status
 */
async function getStatus(): Promise<ConnectionStatus> {
  const response = await apiClient.get<ConnectionStatus>(simplePayEndpoints.status);
  return response.data;
}

/**
 * Connect to SimplePay
 */
async function connect(params: { clientId: string; apiKey: string }): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.post<{ success: boolean; message?: string }>(
    simplePayEndpoints.connect,
    params
  );
  return response.data;
}

/**
 * Test SimplePay connection
 */
async function testConnection(): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.post<{ success: boolean; message?: string }>(
    simplePayEndpoints.test
  );
  return response.data;
}

/**
 * Disconnect from SimplePay
 */
async function disconnect(): Promise<{ success: boolean; message?: string }> {
  const response = await apiClient.delete<{ success: boolean; message?: string }>(
    simplePayEndpoints.disconnect
  );
  return response.data;
}

/**
 * Sync a single employee to SimplePay
 */
async function syncEmployee(staffId: string): Promise<EmployeeSyncStatus> {
  const response = await apiClient.post<EmployeeSyncStatus>(
    simplePayEndpoints.employees.sync(staffId)
  );
  return response.data;
}

/**
 * Sync all employees to SimplePay
 */
async function syncAllEmployees(): Promise<SyncResult> {
  const response = await apiClient.post<SyncResult>(simplePayEndpoints.employees.syncAll);
  return response.data;
}

/**
 * Get employee sync status
 */
async function getEmployeeSyncStatus(staffId: string): Promise<EmployeeSyncStatus> {
  const response = await apiClient.get<EmployeeSyncStatus>(
    simplePayEndpoints.employees.status(staffId)
  );
  return response.data;
}

/**
 * Import payslips from SimplePay
 */
async function importPayslips(params: ImportPayslipsParams): Promise<ImportPayslipsResult> {
  const response = await apiClient.post<ImportPayslipsResult>(
    simplePayEndpoints.payslips.import,
    params
  );
  return response.data;
}

/**
 * Get imported payslips for an employee
 */
async function getEmployeePayslips(staffId: string): Promise<{ data: PayslipImport[]; total: number }> {
  const response = await apiClient.get<{ data: PayslipImport[]; total: number }>(
    simplePayEndpoints.employees.payslips(staffId)
  );
  return response.data;
}

/**
 * Download payslip PDF
 */
async function downloadPayslipPdf(payslipId: string): Promise<void> {
  const response = await apiClient.get(simplePayEndpoints.payslips.pdf(payslipId), {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `payslip-${payslipId}.pdf`;
  link.click();
  window.URL.revokeObjectURL(downloadUrl);
}

/**
 * Get IRP5 certificates for an employee
 */
async function getIrp5Certificates(staffId: string, year?: number): Promise<Irp5Certificate[]> {
  const params = year ? `?year=${year}` : '';
  const response = await apiClient.get<Irp5Certificate[]>(
    `${simplePayEndpoints.employees.irp5(staffId)}${params}`
  );
  return response.data;
}

/**
 * Download IRP5 PDF
 */
async function downloadIrp5Pdf(staffId: string, year: number): Promise<void> {
  const response = await apiClient.get(simplePayEndpoints.employees.irp5Pdf(staffId, year), {
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `irp5-${year}.pdf`;
  link.click();
  window.URL.revokeObjectURL(downloadUrl);
}

/**
 * Get EMP201 data
 */
async function getEmp201Data(date: string): Promise<Emp201Data> {
  const response = await apiClient.get<Emp201Data>(
    `${simplePayEndpoints.emp201}?date=${date}`
  );
  return response.data;
}

// ============================================================================
// Export
// ============================================================================

export const simplePayApi = {
  getStatus,
  connect,
  testConnection,
  disconnect,
  syncEmployee,
  syncAllEmployees,
  getEmployeeSyncStatus,
  importPayslips,
  getEmployeePayslips,
  downloadPayslipPdf,
  getIrp5Certificates,
  downloadIrp5Pdf,
  getEmp201Data,
};

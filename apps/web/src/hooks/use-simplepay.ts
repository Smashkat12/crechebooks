/**
 * SimplePay Integration Hooks
 * TASK-STAFF-004: SimplePay Integration UI
 *
 * React hooks for SimplePay integration using TanStack Query (React Query).
 * Follows the same patterns as useXeroStatus.ts for consistency.
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  simplePayApi,
  type ConnectionStatus,
  type EmployeeSyncStatus,
  type PayslipImport,
  type Irp5Certificate,
  type Emp201Data,
  type SyncResult,
  type ImportPayslipsParams,
  type ImportPayslipsResult,
} from '@/lib/api/simplepay';

// Re-export types for convenience
export type {
  ConnectionStatus,
  EmployeeSyncStatus,
  PayslipImport,
  Irp5Certificate,
  Emp201Data,
  SyncResult,
  ImportPayslipsResult,
};

// Query keys for SimplePay
export const simplePayKeys = {
  all: ['simplepay'] as const,
  status: () => [...simplePayKeys.all, 'status'] as const,
  employees: () => [...simplePayKeys.all, 'employees'] as const,
  employeeStatus: (staffId: string) => [...simplePayKeys.employees(), 'status', staffId] as const,
  employeePayslips: (staffId: string) => [...simplePayKeys.employees(), 'payslips', staffId] as const,
  irp5: (staffId: string, year?: number) => [...simplePayKeys.all, 'irp5', staffId, year] as const,
  emp201: (date: string) => [...simplePayKeys.all, 'emp201', date] as const,
};

// ============================================================================
// Connection Hooks
// ============================================================================

/**
 * Get SimplePay connection status
 */
export function useSimplePayStatus() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: simplePayKeys.status(),
    queryFn: simplePayApi.getStatus,
    staleTime: 30000, // Consider fresh for 30 seconds to avoid flicker
    refetchInterval: 60000, // Refresh every minute
    refetchOnWindowFocus: true,
    retry: 2, // Retry twice on failure before showing error
  });

  return {
    ...query,
    status: query.data,
    mutate: () => queryClient.invalidateQueries({ queryKey: simplePayKeys.status() }),
  };
}

/**
 * Connect to SimplePay
 */
export function useSimplePayConnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { clientId: string; apiKey: string }) =>
      simplePayApi.connect(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simplePayKeys.status() });
    },
  });
}

/**
 * Test SimplePay connection
 */
export function useTestSimplePayConnection() {
  return useMutation({
    mutationFn: simplePayApi.testConnection,
  });
}

/**
 * Disconnect from SimplePay
 */
export function useSimplePayDisconnect() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: simplePayApi.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simplePayKeys.status() });
    },
  });
}

// ============================================================================
// Employee Sync Hooks
// ============================================================================

/**
 * Get employee sync status
 */
export function useEmployeeSyncStatus(staffId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: simplePayKeys.employeeStatus(staffId),
    queryFn: () => simplePayApi.getEmployeeSyncStatus(staffId),
    enabled: Boolean(staffId),
    refetchOnWindowFocus: true,
  });

  return {
    ...query,
    mutate: () => queryClient.invalidateQueries({ queryKey: simplePayKeys.employeeStatus(staffId) }),
  };
}

/**
 * Sync a single employee to SimplePay
 */
export function useSyncEmployee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (staffId: string) => simplePayApi.syncEmployee(staffId),
    onSuccess: (data, staffId) => {
      queryClient.invalidateQueries({ queryKey: simplePayKeys.employeeStatus(staffId) });
      queryClient.invalidateQueries({ queryKey: simplePayKeys.status() });
    },
  });
}

/**
 * Sync all employees to SimplePay
 */
export function useSyncAllEmployees() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: simplePayApi.syncAllEmployees,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simplePayKeys.employees() });
      queryClient.invalidateQueries({ queryKey: simplePayKeys.status() });
    },
  });
}

// ============================================================================
// Payslip Hooks
// ============================================================================

/**
 * Get imported payslips for an employee
 */
export function useImportedPayslips(staffId: string) {
  return useQuery({
    queryKey: simplePayKeys.employeePayslips(staffId),
    queryFn: () => simplePayApi.getEmployeePayslips(staffId),
    enabled: Boolean(staffId),
  });
}

/**
 * Import payslips from SimplePay
 */
export function useImportPayslips() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ImportPayslipsParams) => simplePayApi.importPayslips(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: simplePayKeys.employees() });
    },
  });
}

/**
 * Download payslip PDF
 */
export function useDownloadPayslipPdf() {
  return useMutation({
    mutationFn: (payslipId: string) => simplePayApi.downloadPayslipPdf(payslipId),
  });
}

// ============================================================================
// Tax Certificate Hooks
// ============================================================================

/**
 * Get IRP5 certificates for an employee
 */
export function useIrp5Certificates(staffId: string, year?: number) {
  return useQuery({
    queryKey: simplePayKeys.irp5(staffId, year),
    queryFn: () => simplePayApi.getIrp5Certificates(staffId, year),
    enabled: Boolean(staffId),
  });
}

/**
 * Download IRP5 PDF
 */
export function useDownloadIrp5Pdf() {
  return useMutation({
    mutationFn: ({ staffId, year }: { staffId: string; year: number }) =>
      simplePayApi.downloadIrp5Pdf(staffId, year),
  });
}

// ============================================================================
// EMP201 Hooks
// ============================================================================

/**
 * Get EMP201 data for a specific date
 */
export function useEmp201Data(date: string) {
  return useQuery({
    queryKey: simplePayKeys.emp201(date),
    queryFn: () => simplePayApi.getEmp201Data(date),
    enabled: Boolean(date),
  });
}

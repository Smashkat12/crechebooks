/**
 * Staff Offboarding Hook
 * TASK-STAFF-002: Staff Offboarding UI
 *
 * Provides hooks for staff offboarding operations including:
 * - Settlement calculations
 * - Asset returns tracking
 * - Document generation (UI-19, Certificate of Service, Exit Pack)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, queryKeys } from '@/lib/api';

// Offboarding status interface
export interface OffboardingStatus {
  id: string;
  staffId: string;
  reason: string;
  lastWorkingDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'PENDING_SETTLEMENT' | 'COMPLETED' | 'CANCELLED';
  settlementCalculated: boolean;
  settlementAmount?: number;
  documentsGenerated: boolean;
  createdAt: string;
  updatedAt: string;
}

// Settlement preview for calculating final pay
export interface SettlementPreview {
  staffId: string;
  staffName: string;
  lastWorkingDate: string;
  reason: string;
  noticePeriodDays: number;
  bceanCompliant: boolean;
  finalPay: {
    basicSalary: number;
    proRataAmount: number;
    leaveEncashment: number;
    otherEarnings: number;
    totalGross: number;
    deductions: {
      paye: number;
      uif: number;
      other: number;
      total: number;
    };
    netPay: number;
  };
  documents: string[];
}

// Asset return tracking
export interface AssetReturn {
  id: string;
  assetName: string;
  assetType: string;
  serialNumber?: string;
  returnStatus: 'PENDING' | 'RETURNED' | 'DAMAGED' | 'NOT_RETURNED';
  returnedAt?: string;
  condition?: string;
  notes?: string;
}

// Query key factory for offboarding
export const offboardingKeys = {
  all: ['offboarding'] as const,
  status: (staffId: string) => [...offboardingKeys.all, 'status', staffId] as const,
  settlementPreview: (staffId: string, date?: string, reason?: string) =>
    [...offboardingKeys.all, 'settlement', staffId, date, reason] as const,
  assets: (staffId: string) => [...offboardingKeys.all, 'assets', staffId] as const,
};

// Initiate offboarding params
interface InitiateOffboardingParams {
  reason: string;
  lastWorkingDate: string;
  notes?: string;
}

// Update asset return params
interface UpdateAssetReturnParams {
  assetId: string;
  status: string;
  condition?: string;
  notes?: string;
}

/**
 * Fetch offboarding status for a staff member
 */
export function useOffboardingStatus(staffId: string, enabled = true) {
  return useQuery<OffboardingStatus, AxiosError>({
    queryKey: offboardingKeys.status(staffId),
    queryFn: async () => {
      const { data } = await apiClient.get<OffboardingStatus>(
        `/staff/${staffId}/offboarding`
      );
      return data;
    },
    enabled: enabled && !!staffId,
    retry: false, // Don't retry 404s for staff without offboarding
  });
}

/**
 * Get settlement preview for offboarding calculation
 */
export function useSettlementPreview(
  staffId: string,
  lastWorkingDate: string,
  reason: string,
  enabled = true
) {
  return useQuery<SettlementPreview, AxiosError>({
    queryKey: offboardingKeys.settlementPreview(staffId, lastWorkingDate, reason),
    queryFn: async () => {
      const { data } = await apiClient.get<SettlementPreview>(
        `/staff/${staffId}/offboarding/settlement-preview`,
        {
          params: { lastWorkingDate, reason },
        }
      );
      return data;
    },
    enabled: enabled && !!staffId && !!lastWorkingDate && !!reason,
  });
}

/**
 * Fetch asset returns for offboarding staff
 */
export function useAssetReturns(staffId: string, enabled = true) {
  return useQuery<AssetReturn[], AxiosError>({
    queryKey: offboardingKeys.assets(staffId),
    queryFn: async () => {
      const { data } = await apiClient.get<AssetReturn[]>(
        `/staff/${staffId}/offboarding/assets`
      );
      return data;
    },
    enabled: enabled && !!staffId,
  });
}

/**
 * Initiate offboarding process for a staff member
 */
export function useInitiateOffboarding(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OffboardingStatus, AxiosError, InitiateOffboardingParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.post<OffboardingStatus>(
        `/staff/${staffId}/offboarding/initiate`,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offboardingKeys.status(staffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(staffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Update asset return status
 */
export function useUpdateAssetReturn(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<AssetReturn, AxiosError, UpdateAssetReturnParams>({
    mutationFn: async ({ assetId, ...params }) => {
      const { data } = await apiClient.patch<AssetReturn>(
        `/staff/${staffId}/offboarding/assets/${assetId}`,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offboardingKeys.assets(staffId) });
    },
  });
}

/**
 * Complete offboarding process
 */
export function useCompleteOffboarding(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OffboardingStatus, AxiosError, void>({
    mutationFn: async () => {
      const { data } = await apiClient.post<OffboardingStatus>(
        `/staff/${staffId}/offboarding/complete`
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offboardingKeys.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
    },
  });
}

/**
 * Download UI-19 form (UIF termination document)
 */
export function useDownloadUi19(staffId: string) {
  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(`/staff/${staffId}/offboarding/ui19`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `ui19-${staffId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    },
  });
}

/**
 * Download Certificate of Service
 */
export function useDownloadCertificate(staffId: string) {
  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(
        `/staff/${staffId}/offboarding/certificate`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `certificate-of-service-${staffId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    },
  });
}

/**
 * Download complete Exit Pack (all documents bundled)
 */
export function useDownloadExitPack(staffId: string) {
  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(
        `/staff/${staffId}/offboarding/exit-pack`,
        { responseType: 'blob' }
      );
      const blob = new Blob([response.data], { type: 'application/pdf' });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `exit-pack-${staffId}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
    },
  });
}

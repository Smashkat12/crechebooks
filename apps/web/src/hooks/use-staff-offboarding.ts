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
  // Individual document generation status for completion validation
  documents: {
    ui19: boolean;
    certificate: boolean;
    irp5: boolean;
    exitPack: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

// Settlement preview for calculating final pay
// Matches backend ISettlementPreview and IFinalPayCalculation
export interface SettlementPreview {
  staffId: string;
  staffName: string;
  lastWorkingDay: string; // ISO date from backend
  tenure: {
    years: number;
    months: number;
    days: number;
  };
  noticePeriodDays: number;
  finalPay: {
    outstandingSalaryCents: number;
    leavePayoutCents: number;
    leaveBalanceDays: number;
    noticePayCents: number;
    proRataBonusCents: number;
    otherEarningsCents: number;
    grossEarningsCents: number;
    payeCents: number;
    uifEmployeeCents: number;
    deductionsCents: number;
    totalDeductionsCents: number;
    netPayCents: number;
    dailyRateCents: number;
  };
  documentsRequired: string[];
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
  assets: (staffId: string, offboardingId?: string) =>
    [...offboardingKeys.all, 'assets', staffId, offboardingId] as const,
};

// Initiate offboarding params
// Note: Backend expects 'lastWorkingDay' field name
interface InitiateOffboardingParams {
  reason: string;
  lastWorkingDate: string; // Frontend uses this name
  notes?: string;
}

// Update asset return params
interface UpdateAssetReturnParams {
  assetId: string;
  status: string;
  condition?: string;
  notes?: string;
}

// Backend response when no offboarding exists
interface NoOffboardingResponse {
  exists: false;
  message: string;
}

// Backend IOffboardingProgress response structure
interface BackendOffboardingProgress {
  offboarding: {
    id: string;
    staffId: string;
    status: string;
    reason: string;
    lastWorkingDay: string;
    finalPayNetCents: number;
    createdAt: string;
    updatedAt: string;
  };
  assets: unknown[];
  documentsGenerated: {
    ui19: boolean;
    certificate: boolean;
    irp5: boolean;
    exitPack: boolean;
  };
  progress: {
    assetsReturned: number;
    totalAssets: number;
    exitInterviewComplete: boolean;
    finalPayCalculated: boolean;
  };
}

// Type guard to check if response is "no offboarding" response
function isNoOffboardingResponse(data: unknown): data is NoOffboardingResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'exists' in data &&
    (data as NoOffboardingResponse).exists === false
  );
}

// Map backend status to frontend status
function mapBackendStatus(status: string): OffboardingStatus['status'] {
  const statusMap: Record<string, OffboardingStatus['status']> = {
    INITIATED: 'PENDING',
    IN_PROGRESS: 'IN_PROGRESS',
    PENDING_FINAL_PAY: 'PENDING_SETTLEMENT',
    COMPLETED: 'COMPLETED',
    CANCELLED: 'CANCELLED',
  };
  return statusMap[status] || 'PENDING';
}

// Map backend response to frontend OffboardingStatus
function mapBackendToOffboardingStatus(data: BackendOffboardingProgress): OffboardingStatus {
  const { offboarding, documentsGenerated, progress } = data;
  return {
    id: offboarding.id,
    staffId: offboarding.staffId,
    reason: offboarding.reason,
    lastWorkingDate: offboarding.lastWorkingDay,
    status: mapBackendStatus(offboarding.status),
    settlementCalculated: progress.finalPayCalculated,
    settlementAmount: offboarding.finalPayNetCents,
    documentsGenerated:
      documentsGenerated.ui19 ||
      documentsGenerated.certificate ||
      documentsGenerated.irp5 ||
      documentsGenerated.exitPack,
    // Track individual document status for completion validation
    documents: {
      ui19: documentsGenerated.ui19,
      certificate: documentsGenerated.certificate,
      irp5: documentsGenerated.irp5,
      exitPack: documentsGenerated.exitPack,
    },
    createdAt: offboarding.createdAt,
    updatedAt: offboarding.updatedAt,
  };
}

/**
 * Fetch offboarding status for a staff member
 * Returns null if no offboarding exists for the staff member
 */
export function useOffboardingStatus(staffId: string, enabled = true) {
  return useQuery<OffboardingStatus | null, AxiosError>({
    queryKey: offboardingKeys.status(staffId),
    queryFn: async () => {
      const { data } = await apiClient.get<BackendOffboardingProgress | NoOffboardingResponse>(
        `/staff/${staffId}/offboarding`
      );
      // Backend returns { exists: false, message: '...' } when no offboarding exists
      if (isNoOffboardingResponse(data)) {
        return null;
      }
      // Map backend response to frontend interface
      return mapBackendToOffboardingStatus(data as BackendOffboardingProgress);
    },
    enabled: enabled && !!staffId,
    retry: false, // Don't retry 404s for staff without offboarding
  });
}

/**
 * Get settlement preview for offboarding calculation
 * Note: Backend expects 'lastWorkingDay' field name in ISO format
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
      // Convert date to ISO format for backend
      const lastWorkingDay = new Date(lastWorkingDate).toISOString();
      const { data } = await apiClient.get<SettlementPreview>(
        `/staff/${staffId}/offboarding/settlement-preview`,
        {
          // Backend DTO uses lastWorkingDay in ISO format
          params: { lastWorkingDay },
        }
      );
      return data;
    },
    enabled: enabled && !!staffId && !!lastWorkingDate && !!reason,
  });
}

/**
 * Fetch asset returns for offboarding staff
 * TASK-STAFF-005: Updated to use offboardingId in endpoint path
 */
export function useAssetReturns(staffId: string, offboardingId: string, enabled = true) {
  return useQuery<AssetReturn[], AxiosError>({
    queryKey: offboardingKeys.assets(staffId, offboardingId),
    queryFn: async () => {
      const { data } = await apiClient.get<AssetReturn[]>(
        `/staff/${staffId}/offboarding/${offboardingId}/assets`
      );
      return data;
    },
    enabled: enabled && !!staffId && !!offboardingId,
  });
}

/**
 * Initiate offboarding process for a staff member
 */
export function useInitiateOffboarding(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OffboardingStatus, AxiosError, InitiateOffboardingParams>({
    mutationFn: async (params) => {
      // Transform to backend field names and ensure date is in ISO format
      const lastWorkingDay = new Date(params.lastWorkingDate);
      const { data } = await apiClient.post<OffboardingStatus>(
        `/staff/${staffId}/offboarding/initiate`,
        {
          staffId, // Required by DTO validation (controller also sets it from path)
          reason: params.reason,
          lastWorkingDay: lastWorkingDay.toISOString(), // Backend expects ISO date
          notes: params.notes,
        }
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
 * TASK-STAFF-005: Updated to use offboardingId in endpoint path
 */
export function useUpdateAssetReturn(staffId: string, offboardingId: string) {
  const queryClient = useQueryClient();

  return useMutation<AssetReturn, AxiosError, UpdateAssetReturnParams>({
    mutationFn: async ({ assetId, ...params }) => {
      const { data } = await apiClient.patch<AssetReturn>(
        `/staff/${staffId}/offboarding/${offboardingId}/assets/${assetId}/return`,
        params
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offboardingKeys.assets(staffId, offboardingId) });
    },
  });
}

/**
 * Complete offboarding process
 * Requires offboardingId for the API endpoint
 */
export function useCompleteOffboarding(staffId: string, offboardingId: string) {
  const queryClient = useQueryClient();

  return useMutation<OffboardingStatus, AxiosError, void>({
    mutationFn: async () => {
      // API endpoint: POST /staff/:staffId/offboarding/:offboardingId/complete
      const { data } = await apiClient.post<OffboardingStatus>(
        `/staff/${staffId}/offboarding/${offboardingId}/complete`,
        {
          // completedBy will be set by the backend from the authenticated user
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: offboardingKeys.all });
      queryClient.invalidateQueries({ queryKey: offboardingKeys.status(staffId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.staff.detail(staffId) });
    },
  });
}

/**
 * Download UI-19 form (UIF termination document)
 * Requires offboardingId for the API endpoint
 * Invalidates offboarding status on success to update documentsGenerated flag
 */
export function useDownloadUi19(staffId: string, offboardingId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(
        `/staff/${staffId}/offboarding/${offboardingId}/ui19`,
        { responseType: 'blob' }
      );
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
    onSuccess: () => {
      // Refresh offboarding status to update documentsGenerated flag
      queryClient.invalidateQueries({ queryKey: offboardingKeys.status(staffId) });
    },
  });
}

/**
 * Download Certificate of Service
 * Requires offboardingId for the API endpoint
 * Invalidates offboarding status on success to update documentsGenerated flag
 */
export function useDownloadCertificate(staffId: string, offboardingId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(
        `/staff/${staffId}/offboarding/${offboardingId}/certificate`,
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
    onSuccess: () => {
      // Refresh offboarding status to update documentsGenerated flag
      queryClient.invalidateQueries({ queryKey: offboardingKeys.status(staffId) });
    },
  });
}

/**
 * Download complete Exit Pack (all documents bundled)
 * Requires offboardingId for the API endpoint
 * Invalidates offboarding status on success to update documentsGenerated flag
 */
export function useDownloadExitPack(staffId: string, offboardingId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, void>({
    mutationFn: async () => {
      const response = await apiClient.get(
        `/staff/${staffId}/offboarding/${offboardingId}/exit-pack`,
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
    onSuccess: () => {
      // Refresh offboarding status to update documentsGenerated flag
      queryClient.invalidateQueries({ queryKey: offboardingKeys.status(staffId) });
    },
  });
}

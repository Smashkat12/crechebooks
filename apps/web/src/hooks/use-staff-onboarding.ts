/**
 * Staff Onboarding Hooks
 * TASK-STAFF-001: Staff Onboarding UI
 *
 * @description React Query hooks for staff onboarding management:
 * - Onboarding status tracking
 * - Step updates
 * - Document uploads
 * - Checklist management
 * - Welcome pack generation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  getOnboardingStatus,
  startOnboarding,
  updateOnboardingStep,
  getOnboardingChecklist,
  completeChecklistItem,
  getStaffDocuments,
  uploadStaffDocument,
  downloadWelcomePack,
  // Generated Documents API (TASK-STAFF-001)
  getGeneratedDocuments,
  generateAllDocuments,
  signGeneratedDocument,
  downloadGeneratedDocument,
  // Welcome Pack Bundle & Email (TASK-STAFF-001)
  downloadWelcomePackBundle,
  emailWelcomePack,
  type EmailWelcomePackResult,
  type OnboardingStatus,
  type OnboardingChecklist,
  type StaffDocument,
  type UpdateStepData,
  type UploadDocumentParams,
  type CompleteChecklistParams,
  // Generated Documents Types
  type GeneratedDocument,
  type GeneratedDocumentsListResponse,
  type SignDocumentParams,
  type GeneratedDocumentType,
} from '@/lib/api/staff-onboarding';

// Re-export types for convenience
export type {
  OnboardingStatus,
  OnboardingChecklist,
  StaffDocument,
  GeneratedDocument,
  GeneratedDocumentsListResponse,
  GeneratedDocumentType,
};

// Query keys
const onboardingKeys = {
  all: ['staff-onboarding'] as const,
  status: (staffId: string) => [...onboardingKeys.all, 'status', staffId] as const,
  checklist: (staffId: string) => [...onboardingKeys.all, 'checklist', staffId] as const,
  documents: (staffId: string) => [...onboardingKeys.all, 'documents', staffId] as const,
  generatedDocuments: (staffId: string) => [...onboardingKeys.all, 'generated-documents', staffId] as const,
};

/**
 * Fetch onboarding status for a staff member
 */
export function useOnboardingStatus(staffId: string, enabled = true) {
  return useQuery<OnboardingStatus, AxiosError>({
    queryKey: onboardingKeys.status(staffId),
    queryFn: () => getOnboardingStatus(staffId),
    enabled: enabled && !!staffId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch checklist items for staff onboarding
 */
export function useOnboardingChecklist(staffId: string, enabled = true) {
  return useQuery<OnboardingChecklist[], AxiosError>({
    queryKey: onboardingKeys.checklist(staffId),
    queryFn: () => getOnboardingChecklist(staffId),
    enabled: enabled && !!staffId,
    staleTime: 30000,
  });
}

/**
 * Fetch uploaded documents for staff onboarding
 */
export function useStaffDocuments(staffId: string, enabled = true) {
  return useQuery<StaffDocument[], AxiosError>({
    queryKey: onboardingKeys.documents(staffId),
    queryFn: () => getStaffDocuments(staffId),
    enabled: enabled && !!staffId,
    staleTime: 30000,
  });
}

/**
 * Start onboarding process mutation
 */
export function useStartOnboarding(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OnboardingStatus, AxiosError>({
    mutationFn: () => startOnboarding(staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist(staffId) });
    },
  });
}

/**
 * Update onboarding step mutation
 */
export function useUpdateOnboardingStep(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OnboardingStatus, AxiosError, UpdateStepData>({
    mutationFn: (params) => updateOnboardingStep(staffId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
    },
  });
}

/**
 * Complete checklist item mutation
 */
export function useCompleteChecklistItem(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<OnboardingChecklist, AxiosError, CompleteChecklistParams>({
    mutationFn: (params) => completeChecklistItem(staffId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.checklist(staffId) });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
    },
  });
}

/**
 * Upload document mutation
 */
export function useUploadDocument(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<StaffDocument, AxiosError, UploadDocumentParams>({
    mutationFn: (params) => uploadStaffDocument(staffId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.documents(staffId) });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
    },
  });
}

/**
 * Download welcome pack mutation
 */
export function useDownloadWelcomePack(staffId: string) {
  return useMutation<void, AxiosError>({
    mutationFn: () => downloadWelcomePack(staffId),
  });
}

// ============================================
// Generated Documents Hooks (TASK-STAFF-001)
// ============================================

/**
 * Fetch generated documents for a staff member
 */
export function useGeneratedDocuments(staffId: string, enabled = true) {
  return useQuery<GeneratedDocumentsListResponse, AxiosError>({
    queryKey: onboardingKeys.generatedDocuments(staffId),
    queryFn: () => getGeneratedDocuments(staffId),
    enabled: enabled && !!staffId,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Generate all employment documents (contract and POPIA consent)
 */
export function useGenerateDocuments(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<GeneratedDocument[], AxiosError>({
    mutationFn: () => generateAllDocuments(staffId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.generatedDocuments(staffId) });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
    },
  });
}

/**
 * Sign/acknowledge a generated document
 */
export function useSignDocument(staffId: string) {
  const queryClient = useQueryClient();

  return useMutation<GeneratedDocument, AxiosError, { documentId: string } & SignDocumentParams>({
    mutationFn: ({ documentId, ...params }) => signGeneratedDocument(documentId, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: onboardingKeys.generatedDocuments(staffId) });
      queryClient.invalidateQueries({ queryKey: onboardingKeys.status(staffId) });
    },
  });
}

/**
 * Download a generated document PDF
 */
export function useDownloadGeneratedDocument() {
  return useMutation<void, AxiosError, { documentId: string; fileName?: string }>({
    mutationFn: ({ documentId, fileName }) => downloadGeneratedDocument(documentId, fileName),
  });
}

// ============================================
// Welcome Pack Bundle & Email Hooks (TASK-STAFF-001)
// ============================================

/**
 * Download welcome pack bundle as ZIP
 * Contains: Welcome Pack PDF, Employment Contract, POPIA Consent
 */
export function useDownloadWelcomePackBundle() {
  return useMutation<void, AxiosError, { onboardingId: string }>({
    mutationFn: ({ onboardingId }) => downloadWelcomePackBundle(onboardingId),
  });
}

/**
 * Email welcome pack to employee
 */
export function useEmailWelcomePack() {
  const queryClient = useQueryClient();

  return useMutation<EmailWelcomePackResult, AxiosError, { onboardingId: string; customMessage?: string }>({
    mutationFn: ({ onboardingId, customMessage }) => emailWelcomePack(onboardingId, customMessage),
    onSuccess: (data, variables) => {
      // Optionally invalidate status to reflect "sent" state
      queryClient.invalidateQueries({ queryKey: ['staff-onboarding'] });
    },
  });
}

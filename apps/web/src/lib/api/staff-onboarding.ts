/**
 * Staff Onboarding API Client
 * TASK-STAFF-001: Staff Onboarding Workflow
 *
 * API functions for staff onboarding management:
 * - Onboarding status tracking
 * - Step updates
 * - Document uploads
 * - Checklist management
 * - Welcome pack generation
 */

import { apiClient } from './client';

// Types
export interface OnboardingStatus {
  id: string;
  staffId: string;
  currentStep: string;
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  completedSteps: string[];
  personalInfoComplete: boolean;
  employmentComplete: boolean;
  taxInfoComplete: boolean;
  bankingComplete: boolean;
  documentsComplete: boolean;
  checklistComplete: boolean;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OnboardingChecklist {
  id: string;
  itemName: string;
  description: string;
  category: string;
  isRequired: boolean;
  status: 'PENDING' | 'COMPLETED' | 'SKIPPED';
  completedAt: string | null;
  completedBy: string | null;
  notes: string | null;
}

export interface StaffDocument {
  id: string;
  documentType: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  uploadedAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
  rejectionReason: string | null;
}

export interface UpdateStepData {
  step: string;
  data: Record<string, unknown>;
}

export interface UploadDocumentParams {
  file: File;
  documentType: string;
}

// Generated Document Types (TASK-STAFF-001)
export type GeneratedDocumentType = 'EMPLOYMENT_CONTRACT' | 'POPIA_CONSENT' | 'WELCOME_PACK';

export interface GeneratedDocument {
  id: string;
  onboardingId: string;
  documentType: GeneratedDocumentType;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  generatedAt: string;
  signedAt: string | null;
  signedByName: string | null;
  acknowledged: boolean;
}

export interface GeneratedDocumentsListResponse {
  documents: GeneratedDocument[];
  allDocumentsGenerated: boolean;
  allDocumentsSigned: boolean;
  pendingSignatures: GeneratedDocumentType[];
}

export interface SignDocumentParams {
  signedByName: string;
}

export interface CompleteChecklistParams {
  itemId: string;
  notes?: string;
}

// Endpoints - map to actual API routes
export const staffOnboardingEndpoints = {
  status: (staffId: string) => `/staff/onboarding/staff/${staffId}`,
  start: (staffId: string) => `/staff/onboarding`,
  step: (staffId: string) => `/staff/onboarding/staff/${staffId}/step`,
  checklist: (onboardingId: string) => `/staff/onboarding/${onboardingId}/checklist`,
  checklistItem: (_staffId: string, itemId: string) =>
    `/staff/onboarding/checklist/${itemId}/complete`,
  // Document endpoints use different paths for GET vs POST
  documentsUpload: (staffId: string) => `/staff/onboarding/documents/staff/${staffId}`,
  documentsList: (staffId: string) => `/documents/staff/${staffId}`,
  // Keep 'documents' for backwards compatibility, but use specific methods
  documents: (staffId: string) => `/documents/staff/${staffId}`,
  welcomePack: (onboardingId: string) => `/staff/onboarding/${onboardingId}/welcome-pack`,
  // Generated Documents endpoints (TASK-STAFF-001)
  generatedDocuments: (staffId: string) => `/staff/onboarding/staff/${staffId}/generated-documents`,
  generateDocuments: (staffId: string) => `/staff/onboarding/staff/${staffId}/generate-documents`,
  signDocument: (documentId: string) => `/staff/onboarding/generated-documents/${documentId}/sign`,
  downloadDocument: (documentId: string) => `/staff/onboarding/generated-documents/${documentId}/download`,
};

// API Functions

// API Response type (matches backend OnboardingProgressResponse)
interface OnboardingProgressResponse {
  onboarding: {
    id: string;
    staffId: string;
    status: string;
    currentStep: string;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  checklistItems: Array<{
    id: string;
    status: string;
    category: string;
  }>;
  documents: Array<{
    id: string;
    status: string;
  }>;
  progress: {
    completedItems: number;
    totalItems: number;
    percentage: number;
  };
}

/**
 * Step order for determining completion based on currentStep
 */
const STEP_ORDER = [
  'PERSONAL_INFO',
  'EMPLOYMENT',
  'TAX_INFO',
  'BANKING',
  'GENERATED_DOCS',
  'DOCUMENTS',
  'CHECKLIST',
  'COMPLETE',
];

/**
 * Map API response to OnboardingStatus format expected by UI
 */
function mapProgressToStatus(response: OnboardingProgressResponse, staffId: string): OnboardingStatus {
  const { onboarding } = response;

  // Determine completed steps based on currentStep progression
  // All steps before the current step are considered complete
  const currentStep = onboarding.currentStep || 'PERSONAL_INFO';
  const currentStepIndex = STEP_ORDER.indexOf(currentStep);

  // All steps before the current one are complete
  const completedSteps: string[] = [];
  for (let i = 0; i < currentStepIndex; i++) {
    completedSteps.push(STEP_ORDER[i]);
  }

  // If status is COMPLETED, all steps are complete
  if (onboarding.status === 'COMPLETED') {
    completedSteps.length = 0;
    for (const step of STEP_ORDER) {
      if (step !== 'COMPLETE') {
        completedSteps.push(step);
      }
    }
  }

  // Map completion flags
  const personalInfoComplete = completedSteps.includes('PERSONAL_INFO');
  const employmentComplete = completedSteps.includes('EMPLOYMENT');
  const taxInfoComplete = completedSteps.includes('TAX_INFO');
  const bankingComplete = completedSteps.includes('BANKING');
  const documentsComplete = completedSteps.includes('DOCUMENTS');
  const checklistComplete = completedSteps.includes('CHECKLIST');

  return {
    id: onboarding.id,
    staffId,
    currentStep,
    status: onboarding.status as OnboardingStatus['status'],
    completedSteps,
    personalInfoComplete,
    employmentComplete,
    taxInfoComplete,
    bankingComplete,
    documentsComplete,
    checklistComplete,
    startedAt: onboarding.startedAt,
    completedAt: onboarding.completedAt,
    createdAt: onboarding.createdAt,
    updatedAt: onboarding.updatedAt,
  };
}

/**
 * Get onboarding status for a staff member
 * Returns a NOT_STARTED status if no onboarding record exists (null response or 404)
 */
export async function getOnboardingStatus(staffId: string): Promise<OnboardingStatus> {
  const defaultStatus: OnboardingStatus = {
    id: '',
    staffId,
    currentStep: 'PERSONAL_INFO',
    status: 'NOT_STARTED',
    completedSteps: [],
    personalInfoComplete: false,
    employmentComplete: false,
    taxInfoComplete: false,
    bankingComplete: false,
    documentsComplete: false,
    checklistComplete: false,
    startedAt: null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    const { data } = await apiClient.get<OnboardingProgressResponse | null>(
      staffOnboardingEndpoints.status(staffId)
    );
    // If API returns null/empty, return default NOT_STARTED status
    if (!data || !data.onboarding) {
      return defaultStatus;
    }
    return mapProgressToStatus(data, staffId);
  } catch (error: unknown) {
    // If 404 (no onboarding record), return default NOT_STARTED status
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { status?: number } };
      if (axiosError.response?.status === 404) {
        return defaultStatus;
      }
    }
    throw error;
  }
}

/**
 * Start onboarding process for a staff member
 */
export async function startOnboarding(staffId: string): Promise<OnboardingStatus> {
  const { data } = await apiClient.post<OnboardingProgressResponse>(
    staffOnboardingEndpoints.start(staffId),
    { staffId }
  );
  return mapProgressToStatus(data, staffId);
}

/**
 * Update onboarding step with data
 */
export async function updateOnboardingStep(
  staffId: string,
  params: UpdateStepData
): Promise<OnboardingStatus> {
  const { data } = await apiClient.patch<{ success: boolean; data: OnboardingStatus }>(
    staffOnboardingEndpoints.step(staffId),
    params
  );
  return data.data;
}

/**
 * Get checklist items for staff onboarding
 */
export async function getOnboardingChecklist(staffId: string): Promise<OnboardingChecklist[]> {
  const { data } = await apiClient.get<{ success: boolean; data: OnboardingChecklist[] }>(
    staffOnboardingEndpoints.checklist(staffId)
  );
  return data.data;
}

/**
 * Complete a checklist item
 */
export async function completeChecklistItem(
  staffId: string,
  params: CompleteChecklistParams
): Promise<OnboardingChecklist> {
  const { data } = await apiClient.patch<{ success: boolean; data: OnboardingChecklist }>(
    staffOnboardingEndpoints.checklistItem(staffId, params.itemId),
    { notes: params.notes }
  );
  return data.data;
}

/**
 * Get uploaded documents for staff onboarding
 */
export async function getStaffDocuments(staffId: string): Promise<StaffDocument[]> {
  const { data } = await apiClient.get<{ success: boolean; data: StaffDocument[] }>(
    staffOnboardingEndpoints.documents(staffId)
  );
  return data.data;
}

/**
 * Upload a document for staff onboarding
 * Uses the upload-specific endpoint path
 */
export async function uploadStaffDocument(
  staffId: string,
  params: UploadDocumentParams
): Promise<StaffDocument> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('documentType', params.documentType);

  const { data } = await apiClient.post<{ success: boolean; data: StaffDocument }>(
    staffOnboardingEndpoints.documentsUpload(staffId),
    formData,
    {
      headers: { 'Content-Type': 'multipart/form-data' },
    }
  );
  return data.data;
}

/**
 * Download welcome pack PDF
 */
export async function downloadWelcomePack(staffId: string): Promise<void> {
  const response = await apiClient.get(staffOnboardingEndpoints.welcomePack(staffId), {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `welcome-pack-${staffId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

// ============================================
// Generated Documents API Functions (TASK-STAFF-001)
// ============================================

/**
 * Get generated documents for a staff member
 */
export async function getGeneratedDocuments(staffId: string): Promise<GeneratedDocumentsListResponse> {
  const { data } = await apiClient.get<GeneratedDocumentsListResponse>(
    staffOnboardingEndpoints.generatedDocuments(staffId)
  );
  return data;
}

/**
 * Generate all employment documents (contract and POPIA consent)
 */
export async function generateAllDocuments(staffId: string): Promise<GeneratedDocument[]> {
  const { data } = await apiClient.post<{ success: boolean; data: GeneratedDocument[]; message: string }>(
    staffOnboardingEndpoints.generateDocuments(staffId)
  );
  return data.data;
}

/**
 * Sign/acknowledge a generated document
 */
export async function signGeneratedDocument(
  documentId: string,
  params: SignDocumentParams
): Promise<GeneratedDocument> {
  const { data } = await apiClient.post<{ success: boolean; data: GeneratedDocument; message: string }>(
    staffOnboardingEndpoints.signDocument(documentId),
    params
  );
  return data.data;
}

/**
 * Download a generated document PDF
 */
export async function downloadGeneratedDocument(documentId: string, fileName?: string): Promise<void> {
  const response = await apiClient.get(staffOnboardingEndpoints.downloadDocument(documentId), {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'application/pdf' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = fileName || `document-${documentId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

/**
 * Get human-readable label for document type
 */
export function getDocumentTypeLabel(type: GeneratedDocumentType): string {
  const labels: Record<GeneratedDocumentType, string> = {
    EMPLOYMENT_CONTRACT: 'Employment Contract',
    POPIA_CONSENT: 'POPIA Consent Form',
    WELCOME_PACK: 'Welcome Pack',
  };
  return labels[type] || type;
}

// ============================================
// Welcome Pack Bundle & Email Functions (TASK-STAFF-001)
// ============================================

/**
 * Download welcome pack bundle as ZIP
 * Contains: Welcome Pack PDF, Employment Contract, POPIA Consent
 */
export async function downloadWelcomePackBundle(onboardingId: string): Promise<void> {
  const response = await apiClient.get(`/staff/onboarding/${onboardingId}/welcome-pack/bundle`, {
    responseType: 'blob',
  });

  const blob = new Blob([response.data], { type: 'application/zip' });
  const downloadUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = `onboarding-documents.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(downloadUrl);
}

export interface EmailWelcomePackResult {
  success: boolean;
  message: string;
  data: {
    messageId: string;
    sentTo: string;
    attachmentsCount: number;
  };
}

/**
 * Email welcome pack to employee
 * Sends email with all onboarding documents attached
 */
export async function emailWelcomePack(
  onboardingId: string,
  customMessage?: string
): Promise<EmailWelcomePackResult> {
  const { data } = await apiClient.post<EmailWelcomePackResult>(
    `/staff/onboarding/${onboardingId}/welcome-pack/email`,
    { customMessage }
  );
  return data;
}

/**
 * Tenant Onboarding API Client
 * TASK-ACCT-014: Tenant Onboarding Wizard
 */

import { apiClient } from './client';

// Types matching backend DTO
export enum OnboardingStepId {
  LOGO = 'logo',
  ADDRESS = 'address',
  BANK_DETAILS = 'bankDetails',
  VAT_CONFIG = 'vatConfig',
  FEE_STRUCTURE = 'feeStructure',
  ENROL_CHILD = 'enrollChild',
  FIRST_INVOICE = 'firstInvoice',
  BANK_CONNECT = 'bankConnect',
}

export interface OnboardingStepInfo {
  id: OnboardingStepId;
  title: string;
  description: string;
  isComplete: boolean;
  isSkipped: boolean;
  isSkippable: boolean;
  helpText?: string;
}

export interface OnboardingProgressResponse {
  id: string;
  tenantId: string;
  logoUploaded: boolean;
  addressSet: boolean;
  bankDetailsSet: boolean;
  vatConfigured: boolean;
  feeStructureCreated: boolean;
  childEnrolled: boolean;
  firstInvoiceSent: boolean;
  bankConnected: boolean;
  skippedSteps: string[];
  lastActiveStep: string | null;
  completedAt: Date | null;
  completedCount: number;
  totalSteps: number;
  progressPercent: number;
  isComplete: boolean;
  steps: OnboardingStepInfo[];
}

export interface OnboardingDashboardCta {
  showOnboarding: boolean;
  progressPercent: number;
  nextStep: OnboardingStepInfo | null;
  message: string;
}

export interface UpdateStepAction {
  stepId: OnboardingStepId;
  action: 'complete' | 'skip';
}

/**
 * Get onboarding progress
 */
export async function getOnboardingProgress(): Promise<OnboardingProgressResponse> {
  const response = await apiClient.get<OnboardingProgressResponse>('/onboarding/progress');
  return response.data;
}

/**
 * Get dashboard CTA info
 */
export async function getOnboardingDashboardCta(): Promise<OnboardingDashboardCta> {
  const response = await apiClient.get<OnboardingDashboardCta>('/onboarding/dashboard-cta');
  return response.data;
}

/**
 * Update onboarding step (complete or skip)
 */
export async function updateOnboardingStep(
  data: UpdateStepAction
): Promise<OnboardingProgressResponse> {
  const response = await apiClient.patch<OnboardingProgressResponse>('/onboarding/progress', data);
  return response.data;
}

/**
 * Auto-detect completed steps from existing data
 */
export async function autoDetectOnboardingProgress(): Promise<OnboardingProgressResponse> {
  const response = await apiClient.post<OnboardingProgressResponse>('/onboarding/auto-detect');
  return response.data;
}

/**
 * Reset onboarding progress
 */
export async function resetOnboardingProgress(): Promise<{ success: boolean }> {
  const response = await apiClient.post<{ success: boolean }>('/onboarding/reset');
  return response.data;
}

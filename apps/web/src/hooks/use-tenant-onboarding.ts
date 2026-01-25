/**
 * Tenant Onboarding Hooks
 * TASK-ACCT-014: Tenant Onboarding Wizard UI
 *
 * React Query hooks for tenant onboarding management:
 * - Progress tracking
 * - Step updates
 * - Dashboard CTA
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  getOnboardingProgress,
  getOnboardingDashboardCta,
  updateOnboardingStep,
  autoDetectOnboardingProgress,
  resetOnboardingProgress,
  type OnboardingProgressResponse,
  type OnboardingDashboardCta,
  type UpdateStepAction,
  OnboardingStepId,
} from '@/lib/api/tenant-onboarding';

// Re-export types
export type { OnboardingProgressResponse, OnboardingDashboardCta, UpdateStepAction };
export { OnboardingStepId };

// Query keys
export const tenantOnboardingKeys = {
  all: ['tenant-onboarding'] as const,
  progress: () => [...tenantOnboardingKeys.all, 'progress'] as const,
  dashboardCta: () => [...tenantOnboardingKeys.all, 'dashboard-cta'] as const,
};

/**
 * Fetch onboarding progress for current tenant
 */
export function useOnboardingProgress(enabled = true) {
  return useQuery<OnboardingProgressResponse, AxiosError>({
    queryKey: tenantOnboardingKeys.progress(),
    queryFn: getOnboardingProgress,
    enabled,
    staleTime: 30000, // 30 seconds
  });
}

/**
 * Fetch dashboard CTA info
 */
export function useOnboardingDashboardCta(enabled = true) {
  return useQuery<OnboardingDashboardCta, AxiosError>({
    queryKey: tenantOnboardingKeys.dashboardCta(),
    queryFn: getOnboardingDashboardCta,
    enabled,
    staleTime: 30000,
  });
}

/**
 * Update onboarding step (complete or skip)
 */
export function useUpdateOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation<OnboardingProgressResponse, AxiosError, UpdateStepAction>({
    mutationFn: updateOnboardingStep,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantOnboardingKeys.all });
    },
  });
}

/**
 * Auto-detect completed steps
 */
export function useAutoDetectOnboarding() {
  const queryClient = useQueryClient();

  return useMutation<OnboardingProgressResponse, AxiosError>({
    mutationFn: autoDetectOnboardingProgress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantOnboardingKeys.all });
    },
  });
}

/**
 * Reset onboarding progress
 */
export function useResetOnboarding() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, AxiosError>({
    mutationFn: resetOnboardingProgress,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tenantOnboardingKeys.all });
    },
  });
}

/**
 * Hook to invalidate all onboarding queries
 */
export function useInvalidateOnboarding() {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () =>
      queryClient.invalidateQueries({ queryKey: tenantOnboardingKeys.all }),
  };
}

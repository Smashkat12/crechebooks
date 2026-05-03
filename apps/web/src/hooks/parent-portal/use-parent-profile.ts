/**
 * Parent Portal Profile Hooks
 * TASK-PORTAL-016: Parent Portal Profile and Preferences
 *
 * React Query hooks for parent profile operations:
 * - useParentProfile() - fetch parent profile
 * - useUpdateParentProfile() - update profile mutation
 * - useParentChildren() - fetch enrolled children
 * - useUpdateCommunicationPrefs() - update prefs mutation
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

export interface ParentAddress {
  street?: string;
  city?: string;
  postalCode?: string;
}

export interface CommunicationPreferences {
  invoiceDelivery: 'email' | 'whatsapp' | 'both';
  paymentReminders: boolean;
  emailNotifications: boolean;
  marketingOptIn: boolean;
  whatsappOptIn: boolean;
  whatsappConsentTimestamp: string | null;
}

export interface ParentProfile {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  email: string;
  phone?: string;
  alternativePhone?: string;
  address?: ParentAddress;
  communicationPreferences?: CommunicationPreferences;
  createdAt: string;
}

export interface UpdateParentProfileDto {
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  phone?: string;
  alternativePhone?: string;
  address?: ParentAddress;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface ParentChild {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender?: Gender | null;
  dateOfBirth?: string;
  enrollmentDate?: string;
  className?: string;
  attendanceType?: 'full_day' | 'half_day' | 'after_care';
  isActive: boolean;
  photoUrl?: string | null;
  medicalNotes?: string | null;
  emergencyContact?: string | null;
  emergencyPhone?: string | null;
}

export interface UpdateParentChildDto {
  firstName?: string;
  middleName?: string;
  lastName?: string;
  gender?: Gender;
  medicalNotes?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
}

export interface ParentChildUpdateResponse {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  gender: Gender | null;
  medicalNotes: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  updatedAt: string;
}

export interface DeleteAccountRequestDto {
  reason?: string;
}

// ============================================================================
// Query Keys
// ============================================================================

export const parentProfileKeys = {
  all: ['parent-profile'] as const,
  profile: () => [...parentProfileKeys.all, 'profile'] as const,
  children: () => [...parentProfileKeys.all, 'children'] as const,
  preferences: () => [...parentProfileKeys.all, 'preferences'] as const,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get authorization token from localStorage
 */
function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

/**
 * Make authenticated request to parent portal API
 */
async function parentPortalFetch<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const token = getParentToken();

  if (!token) {
    throw new Error('Not authenticated. Please log in.');
  }

  const response = await fetch(`${API_URL}/api/v1/parent-portal${endpoint}`, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear invalid token
      localStorage.removeItem('parent_session_token');
      throw new Error('Session expired. Please log in again.');
    }

    let errorMessage = `Request failed: ${response.status}`;
    try {
      const error = await response.json();
      errorMessage = error.message || error.error || errorMessage;
    } catch {
      // Use default error message
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch parent profile
 */
export function useParentProfile() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('parent_session_token') : null;
  return useQuery<ParentProfile, Error>({
    queryKey: parentProfileKeys.profile(),
    queryFn: async () => {
      return parentPortalFetch<ParentProfile>('/profile');
    },
    staleTime: 30 * 1000, // 30 seconds
    enabled: !!token,
  });
}

/**
 * Update parent profile
 */
export function useUpdateParentProfile() {
  const queryClient = useQueryClient();

  return useMutation<ParentProfile, Error, Partial<ParentProfile>>({
    mutationFn: async (data) => {
      return parentPortalFetch<ParentProfile>('/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      // Update cache with new data
      queryClient.setQueryData(parentProfileKeys.profile(), data);
    },
  });
}

/**
 * Fetch parent's enrolled children
 */
export function useParentChildren() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('parent_session_token') : null;
  return useQuery<ParentChild[], Error>({
    queryKey: parentProfileKeys.children(),
    queryFn: async () => {
      return parentPortalFetch<ParentChild[]>('/children');
    },
    staleTime: 60 * 1000, // 1 minute
    enabled: !!token,
  });
}

/**
 * Update communication preferences
 */
export function useUpdateCommunicationPrefs() {
  const queryClient = useQueryClient();

  return useMutation<CommunicationPreferences, Error, Partial<CommunicationPreferences>>({
    mutationFn: async (prefs) => {
      return parentPortalFetch<CommunicationPreferences>('/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
    },
    onSuccess: (data) => {
      // Update profile cache with new preferences
      queryClient.setQueryData(parentProfileKeys.profile(), (old: ParentProfile | undefined) => {
        if (!old) return old;
        return {
          ...old,
          communicationPreferences: data,
        };
      });
    },
  });
}

/**
 * Fetch a single child by id (derived from the children list cache)
 */
export function useParentChild(childId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('parent_session_token') : null;
  return useQuery<ParentChild, Error>({
    queryKey: [...parentProfileKeys.children(), childId],
    queryFn: async () => {
      const children = await parentPortalFetch<ParentChild[]>('/children');
      const child = children.find((c) => c.id === childId);
      if (!child) throw new Error('Child not found');
      return child;
    },
    staleTime: 60 * 1000,
    enabled: !!token && !!childId,
  });
}

/**
 * Update editable child fields (medicalNotes, emergencyContact, emergencyPhone)
 */
export function useUpdateParentChild(childId: string) {
  const queryClient = useQueryClient();

  return useMutation<ParentChildUpdateResponse, Error, UpdateParentChildDto>({
    mutationFn: async (data) => {
      return parentPortalFetch<ParentChildUpdateResponse>(
        `/children/${childId}`,
        {
          method: 'PUT',
          body: JSON.stringify(data),
        }
      );
    },
    onSuccess: (data) => {
      // Patch the children list cache so the detail view reflects changes immediately
      queryClient.setQueryData(
        parentProfileKeys.children(),
        (old: ParentChild[] | undefined) => {
          if (!old) return old;
          return old.map((c) =>
            c.id === childId
              ? {
                  ...c,
                  firstName: data.firstName,
                  middleName: data.middleName,
                  lastName: data.lastName,
                  gender: data.gender,
                  medicalNotes: data.medicalNotes,
                  emergencyContact: data.emergencyContact,
                  emergencyPhone: data.emergencyPhone,
                }
              : c
          );
        }
      );
      // Also invalidate the per-child query key
      queryClient.invalidateQueries({
        queryKey: [...parentProfileKeys.children(), childId],
      });
    },
  });
}

/**
 * Request account deletion
 */
export function useRequestAccountDeletion() {
  return useMutation<{ message: string }, Error, DeleteAccountRequestDto>({
    mutationFn: async (data) => {
      return parentPortalFetch<{ message: string }>('/delete-request', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
  });
}

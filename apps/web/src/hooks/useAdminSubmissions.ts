import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export interface ContactSubmission {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  message: string;
  status: 'PENDING' | 'CONTACTED';
  created_at: string;
  updated_at: string;
}

export interface DemoRequest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  creche_name: string | null;
  num_children: number | null;
  status: 'PENDING' | 'CONTACTED' | 'DEMO_SCHEDULED';
  created_at: string;
  updated_at: string;
}

interface ContactSubmissionsResponse {
  submissions: ContactSubmission[];
  total: number;
  pending: number;
  contacted: number;
}

interface DemoRequestsResponse {
  requests: DemoRequest[];
  total: number;
  pending: number;
  contacted: number;
  scheduled: number;
}

// Get all contact submissions
export function useContactSubmissions() {
  return useQuery<ContactSubmissionsResponse, AxiosError>({
    queryKey: queryKeys.admin.contactSubmissions(),
    queryFn: async () => {
      const { data } = await apiClient.get<ContactSubmissionsResponse>(
        endpoints.admin.contactSubmissions
      );
      return data;
    },
  });
}

// Get all demo requests
export function useDemoRequests() {
  return useQuery<DemoRequestsResponse, AxiosError>({
    queryKey: queryKeys.admin.demoRequests(),
    queryFn: async () => {
      const { data } = await apiClient.get<DemoRequestsResponse>(endpoints.admin.demoRequests);
      return data;
    },
  });
}

// Update contact submission status
export function useUpdateContactSubmissionStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    AxiosError,
    { id: string; status: 'PENDING' | 'CONTACTED' }
  >({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiClient.patch<{ success: boolean; message: string }>(
        endpoints.admin.updateContactSubmissionStatus(id),
        { status }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.contactSubmissions() });
    },
  });
}

// Update demo request status
export function useUpdateDemoRequestStatus() {
  const queryClient = useQueryClient();

  return useMutation<
    { success: boolean; message: string },
    AxiosError,
    { id: string; status: 'PENDING' | 'CONTACTED' }
  >({
    mutationFn: async ({ id, status }) => {
      const { data } = await apiClient.patch<{ success: boolean; message: string }>(
        endpoints.admin.updateDemoRequestStatus(id),
        { status }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.demoRequests() });
    },
  });
}

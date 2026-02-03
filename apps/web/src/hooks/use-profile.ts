/**
 * Profile Update Hook
 * TASK-FIX-002: Profile Update Implementation
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient } from '@/lib/api/client';

interface UpdateProfileParams {
  name: string;
  email: string;
}

interface UpdateProfileResponse {
  success: boolean;
  data: {
    id: string;
    name: string;
    email: string;
  };
}

interface ApiErrorResponse {
  message: string;
  error?: string;
  statusCode?: number;
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UpdateProfileResponse, AxiosError<ApiErrorResponse>, UpdateProfileParams>({
    mutationFn: async (params) => {
      const { data } = await apiClient.patch<UpdateProfileResponse>(
        '/auth/me',
        params,
      );
      return data;
    },
    onSuccess: () => {
      // Invalidate any user-related queries to refresh data
      // Since we use NextAuth session, the session will be refreshed on next request
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IParent, IChild } from '@crechebooks/types';

// Types for API responses
interface ParentsListResponse {
  parents: IParent[];
  total: number;
  page: number;
  limit: number;
}

interface ParentWithChildren extends IParent {
  children: IChild[];
}

interface ParentListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive';
}

interface EnrollChildParams {
  parentId: string;
  childId: string;
  feeStructureId: string;
  startDate: string;
  endDate?: string;
}

// List parents with pagination and filters
export function useParentsList(params?: ParentListParams) {
  return useQuery<ParentsListResponse, AxiosError>({
    queryKey: queryKeys.parents.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ParentsListResponse>(endpoints.parents.list, {
        params,
      });
      return data;
    },
  });
}

// Get single parent detail
export function useParent(id: string, enabled = true) {
  return useQuery<ParentWithChildren, AxiosError>({
    queryKey: queryKeys.parents.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<ParentWithChildren>(endpoints.parents.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Get children for a parent
export function useParentChildren(parentId: string, enabled = true) {
  return useQuery<IChild[], AxiosError>({
    queryKey: queryKeys.parents.children(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<IChild[]>(endpoints.parents.children(parentId));
      return data;
    },
    enabled: enabled && !!parentId,
  });
}

// Get single child detail
export function useChild(id: string, enabled = true) {
  return useQuery<IChild, AxiosError>({
    queryKey: queryKeys.children.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<IChild>(endpoints.children.detail(id));
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Enroll a child
export function useEnrollChild() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; enrollmentId: string }, AxiosError, EnrollChildParams>({
    mutationFn: async ({ parentId, childId, feeStructureId, startDate, endDate }) => {
      const { data } = await apiClient.post<{ success: boolean; enrollmentId: string }>(
        endpoints.children.enroll,
        {
          parentId,
          childId,
          feeStructureId,
          startDate,
          endDate,
        }
      );
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.detail(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.parents.children(variables.parentId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.children.detail(variables.childId) });
    },
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  fetchClassGroups,
  fetchClassGroup,
  createClassGroup,
  updateClassGroup,
  deleteClassGroup,
  fetchClassGroupChildren,
  assignChildren,
  unassignChild,
  type ClassGroup,
  type ClassGroupChild,
  type CreateClassGroupDto,
  type UpdateClassGroupDto,
} from '@/lib/api/class-groups';
import { queryKeys } from '@/lib/api/query-keys';

// ─── Query key helpers ─────────────────────────────────────────────────────────

const classGroupKeys = {
  all: ['class-groups'] as const,
  lists: () => [...classGroupKeys.all, 'list'] as const,
  list: (params?: Record<string, unknown>) => [...classGroupKeys.lists(), params] as const,
  detail: (id: string) => [...classGroupKeys.all, 'detail', id] as const,
  children: (id: string) => [...classGroupKeys.all, id, 'children'] as const,
};

// ─── Queries ───────────────────────────────────────────────────────────────────

export function useClassGroups(params?: { includeInactive?: boolean }) {
  return useQuery<ClassGroup[], AxiosError>({
    queryKey: classGroupKeys.list(params as Record<string, unknown>),
    queryFn: () => fetchClassGroups(params),
  });
}

export function useClassGroup(id: string) {
  return useQuery<ClassGroup, AxiosError>({
    queryKey: classGroupKeys.detail(id),
    queryFn: () => fetchClassGroup(id),
    enabled: !!id,
  });
}

export function useClassGroupChildren(id: string) {
  return useQuery<ClassGroupChild[], AxiosError>({
    queryKey: classGroupKeys.children(id),
    queryFn: () => fetchClassGroupChildren(id),
    enabled: !!id,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useCreateClassGroup() {
  const queryClient = useQueryClient();

  return useMutation<ClassGroup, AxiosError, CreateClassGroupDto>({
    mutationFn: (dto) => createClassGroup(dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classGroupKeys.lists() });
    },
  });
}

export function useUpdateClassGroup() {
  const queryClient = useQueryClient();

  return useMutation<ClassGroup, AxiosError, { id: string } & UpdateClassGroupDto>({
    mutationFn: ({ id, ...dto }) => updateClassGroup(id, dto),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classGroupKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classGroupKeys.detail(variables.id) });
    },
  });
}

export function useDeleteClassGroup() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: (id) => deleteClassGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: classGroupKeys.lists() });
    },
  });
}

export function useAssignChildren() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { groupId: string; childIds: string[] }>({
    mutationFn: ({ groupId, childIds }) => assignChildren(groupId, childIds),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classGroupKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classGroupKeys.detail(variables.groupId) });
      queryClient.invalidateQueries({ queryKey: classGroupKeys.children(variables.groupId) });
      // Also invalidate children list so unassigned filter refreshes
      queryClient.invalidateQueries({ queryKey: queryKeys.children.all });
    },
  });
}

export function useUnassignChild() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { groupId: string; childId: string }>({
    mutationFn: ({ groupId, childId }) => unassignChild(groupId, childId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: classGroupKeys.lists() });
      queryClient.invalidateQueries({ queryKey: classGroupKeys.detail(variables.groupId) });
      queryClient.invalidateQueries({ queryKey: classGroupKeys.children(variables.groupId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.children.all });
    },
  });
}

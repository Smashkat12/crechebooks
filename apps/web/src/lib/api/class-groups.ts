import { apiClient } from './client';

export interface ClassGroup {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  ageMinMonths: number | null;
  ageMaxMonths: number | null;
  capacity: number | null;
  displayOrder: number;
  isActive: boolean;
  childCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ClassGroupChild {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  date_of_birth: string | null;
  parent: {
    id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string | null;
  } | null;
}

export interface CreateClassGroupDto {
  name: string;
  code?: string;
  description?: string;
  ageMinMonths?: number;
  ageMaxMonths?: number;
  capacity?: number;
  displayOrder?: number;
  isActive?: boolean;
}

export type UpdateClassGroupDto = Partial<CreateClassGroupDto>;

export async function fetchClassGroups(params?: { includeInactive?: boolean }): Promise<ClassGroup[]> {
  const { data } = await apiClient.get<ClassGroup[]>('/class-groups', { params });
  return data;
}

export async function fetchClassGroup(id: string): Promise<ClassGroup> {
  const { data } = await apiClient.get<ClassGroup>(`/class-groups/${id}`);
  return data;
}

export async function createClassGroup(dto: CreateClassGroupDto): Promise<ClassGroup> {
  const { data } = await apiClient.post<ClassGroup>('/class-groups', dto);
  return data;
}

export async function updateClassGroup(id: string, dto: UpdateClassGroupDto): Promise<ClassGroup> {
  const { data } = await apiClient.patch<ClassGroup>(`/class-groups/${id}`, dto);
  return data;
}

export async function deleteClassGroup(id: string): Promise<void> {
  await apiClient.delete(`/class-groups/${id}`);
}

export async function fetchClassGroupChildren(id: string): Promise<ClassGroupChild[]> {
  const { data } = await apiClient.get<ClassGroupChild[]>(`/class-groups/${id}/children`);
  return data;
}

export async function assignChildren(id: string, childIds: string[]): Promise<void> {
  await apiClient.post(`/class-groups/${id}/children`, { childIds });
}

export async function unassignChild(groupId: string, childId: string): Promise<void> {
  await apiClient.delete(`/class-groups/${groupId}/children/${childId}`);
}

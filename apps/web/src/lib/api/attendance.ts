import { apiClient } from './client';

// ─── Status enum ──────────────────────────────────────────────────────────────

export type AttendanceStatus =
  | 'PRESENT'
  | 'ABSENT'
  | 'LATE'
  | 'EXCUSED'
  | 'EARLY_PICKUP';

// ─── Admin API shapes ─────────────────────────────────────────────────────────

export interface AttendanceTodaySummary {
  presentCount: number;
  absentCount: number;
  lateCount: number;
  excusedCount: number;
  earlyPickupCount: number;
  unmarkedCount: number;
}

export interface AttendanceRecord {
  id: string;
  childId: string;
  date: string;
  status: AttendanceStatus;
  arrivalAt: string | null;
  departureAt: string | null;
  note: string | null;
  child: {
    id: string;
    firstName: string;
    lastName: string;
    classGroup?: {
      id: string;
      name: string;
    } | null;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ClassGroupDailyReport {
  statusCounts: {
    present: number;
    absent: number;
    late: number;
    excused: number;
    earlyPickup: number;
    unmarked: number;
  };
  records: AttendanceRecord[];
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface MarkAttendanceDto {
  childId: string;
  date: string;
  status: AttendanceStatus;
  arrivalAt?: string;
  departureAt?: string;
  note?: string;
}

export interface BulkMarkRecord {
  childId: string;
  status: AttendanceStatus;
  arrivalAt?: string;
  departureAt?: string;
  note?: string;
}

export interface BulkMarkAttendanceDto {
  date: string;
  records: BulkMarkRecord[];
}

export interface UpdateAttendanceDto {
  status?: AttendanceStatus;
  arrivalAt?: string | null;
  departureAt?: string | null;
  note?: string | null;
}

// ─── Parent portal shapes ─────────────────────────────────────────────────────

export interface ParentAttendanceRecord {
  id: string;
  date: string;
  status: AttendanceStatus;
  arrivalAt: string | null;
  departureAt: string | null;
  note: string | null;
}

export interface ParentAttendanceSummary {
  presentDays: number;
  absentDays: number;
  lateDays: number;
  excusedDays: number;
  totalSchoolDays: number;
}

// ─── Admin API functions ───────────────────────────────────────────────────────

export async function fetchTodayAttendanceSummary(): Promise<AttendanceTodaySummary> {
  const { data } = await apiClient.get<AttendanceTodaySummary>('/attendance/summary/today');
  return data;
}

export async function fetchAttendanceByDate(
  date: string,
  classGroupId?: string,
): Promise<AttendanceRecord[]> {
  if (classGroupId) {
    const { data } = await apiClient.get<ClassGroupDailyReport>(
      `/attendance/class-group/${classGroupId}/by-date/${date}`,
    );
    return data.records;
  }
  const { data } = await apiClient.get<AttendanceRecord[]>(`/attendance/by-date/${date}`);
  return data;
}

export async function fetchChildAttendance(
  childId: string,
  params?: { from?: string; to?: string },
): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.get<AttendanceRecord[]>(
    `/attendance/child/${childId}`,
    { params },
  );
  return data;
}

export async function markAttendance(dto: MarkAttendanceDto): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<AttendanceRecord>('/attendance', dto);
  return data;
}

export async function bulkMarkAttendance(dto: BulkMarkAttendanceDto): Promise<AttendanceRecord[]> {
  const { data } = await apiClient.post<AttendanceRecord[]>('/attendance/bulk', dto);
  return data;
}

export async function updateAttendance(
  id: string,
  dto: UpdateAttendanceDto,
): Promise<AttendanceRecord> {
  const { data } = await apiClient.patch<AttendanceRecord>(`/attendance/${id}`, dto);
  return data;
}

export async function deleteAttendance(id: string): Promise<void> {
  await apiClient.delete(`/attendance/${id}`);
}

// ─── Parent portal API functions ───────────────────────────────────────────────

const PARENT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

async function parentAttendanceFetch<T>(endpoint: string): Promise<T> {
  const token = getParentToken();
  if (!token) throw new Error('Not authenticated. Please log in.');

  const response = await fetch(`${PARENT_API_URL}/api/v1${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('parent_session_token');
      throw new Error('Session expired. Please log in again.');
    }
    let msg = `Request failed: ${response.status}`;
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {
      // use default
    }
    throw new Error(msg);
  }

  return response.json();
}

export async function fetchParentChildAttendance(
  childId: string,
  params?: { from?: string; to?: string },
): Promise<ParentAttendanceRecord[]> {
  const query = params
    ? '?' + new URLSearchParams(params as Record<string, string>).toString()
    : '';
  return parentAttendanceFetch<ParentAttendanceRecord[]>(
    `/parent-portal/attendance/child/${childId}${query}`,
  );
}

export async function fetchParentChildAttendanceSummary(
  childId: string,
): Promise<ParentAttendanceSummary> {
  return parentAttendanceFetch<ParentAttendanceSummary>(
    `/parent-portal/attendance/child/${childId}/summary`,
  );
}

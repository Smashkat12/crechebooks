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
  /** Number of children with an active parent-reported absence today (additive field) */
  reportedAbsentCount?: number;
}

/** ParentPreReportDto — returned inside AdminDayViewDto */
export interface ParentPreReport {
  id: string;
  childId: string;
  childName: string;
  parentId: string;
  date: string; // YYYY-MM-DD
  reason: string | null;
  reportedAt: string; // ISO
}

/** AdminDayViewDto — new response shape for GET /attendance/by-date/:date */
export interface AdminDayView {
  date: string; // YYYY-MM-DD
  records: AttendanceRecord[];
  parentPreReports: ParentPreReport[];
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

/**
 * Fetch the full admin day view for a given date.
 * Returns the new AdminDayViewDto wrapper (records + parentPreReports).
 * When classGroupId is supplied the class-group endpoint is used instead
 * (it still returns only AttendanceRecord[] — no parent pre-reports).
 */
export async function fetchAdminDayView(
  date: string,
  classGroupId?: string,
): Promise<AdminDayView> {
  if (classGroupId) {
    const { data } = await apiClient.get<ClassGroupDailyReport>(
      `/attendance/class-group/${classGroupId}/by-date/${date}`,
    );
    return { date, records: data.records, parentPreReports: [] };
  }
  const { data } = await apiClient.get<AdminDayView>(`/attendance/by-date/${date}`);
  return data;
}

/** @deprecated use fetchAdminDayView — kept for callers that only need records */
export async function fetchAttendanceByDate(
  date: string,
  classGroupId?: string,
): Promise<AttendanceRecord[]> {
  const view = await fetchAdminDayView(date, classGroupId);
  return view.records;
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

// ─── Parent portal absence reporting ──────────────────────────────────────────

export interface AbsenceReportResponse {
  id: string;
  tenantId: string;
  childId: string;
  parentId: string;
  date: string; // YYYY-MM-DD
  reason: string | null;
  reportedAt: string; // ISO
  cancelledAt: string | null;
  cancelledByParentId: string | null;
}

export interface AbsenceReportsListResponse {
  total: number;
  reports: AbsenceReportResponse[];
}

export interface ReportAbsenceDto {
  date: string; // YYYY-MM-DD
  reason?: string; // max 500 chars
}

async function parentAbsenceFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token = getParentToken();
  if (!token) throw new Error('Not authenticated. Please log in.');

  const response = await fetch(`${PARENT_API_URL}/api/v1${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
      Authorization: `Bearer ${token}`,
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

  // 204 No Content
  if (response.status === 204) return undefined as unknown as T;

  return response.json();
}

export async function reportAbsence(
  childId: string,
  dto: ReportAbsenceDto,
): Promise<AbsenceReportResponse> {
  return parentAbsenceFetch<AbsenceReportResponse>(
    `/parent-portal/children/${childId}/absences`,
    { method: 'POST', body: JSON.stringify(dto) },
  );
}

export async function fetchAbsenceReports(
  childId: string,
  params?: { from?: string; to?: string },
): Promise<AbsenceReportsListResponse> {
  const query = params
    ? '?' + new URLSearchParams(params as Record<string, string>).toString()
    : '';
  return parentAbsenceFetch<AbsenceReportsListResponse>(
    `/parent-portal/children/${childId}/absences${query}`,
  );
}

export async function cancelAbsenceReport(
  childId: string,
  absenceId: string,
): Promise<void> {
  return parentAbsenceFetch<void>(
    `/parent-portal/children/${childId}/absences/${absenceId}`,
    { method: 'DELETE' },
  );
}

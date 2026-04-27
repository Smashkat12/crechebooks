import { useQuery } from '@tanstack/react-query';
import {
  fetchParentChildAttendance,
  fetchParentChildAttendanceSummary,
  type ParentAttendanceRecord,
  type ParentAttendanceSummary,
} from '@/lib/api/attendance';

// ─── Query key helpers ────────────────────────────────────────────────────────

const parentAttendanceKeys = {
  all: ['parent-attendance'] as const,
  childHistory: (childId: string, params?: { from?: string; to?: string }) =>
    [...parentAttendanceKeys.all, 'child', childId, params] as const,
  childSummary: (childId: string) =>
    [...parentAttendanceKeys.all, 'child', childId, 'summary'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useParentChildAttendance(
  childId: string,
  params?: { from?: string; to?: string },
) {
  return useQuery<ParentAttendanceRecord[], Error>({
    queryKey: parentAttendanceKeys.childHistory(childId, params),
    queryFn: () => fetchParentChildAttendance(childId, params),
    enabled: !!childId,
    staleTime: 60 * 1000,
  });
}

export function useParentChildAttendanceSummary(childId: string) {
  return useQuery<ParentAttendanceSummary, Error>({
    queryKey: parentAttendanceKeys.childSummary(childId),
    queryFn: () => fetchParentChildAttendanceSummary(childId),
    enabled: !!childId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

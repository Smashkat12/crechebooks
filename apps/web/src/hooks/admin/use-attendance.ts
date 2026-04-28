import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  fetchTodayAttendanceSummary,
  fetchAttendanceByDate,
  fetchChildAttendance,
  markAttendance,
  bulkMarkAttendance,
  updateAttendance,
  deleteAttendance,
  type AttendanceTodaySummary,
  type AttendanceRecord,
  type MarkAttendanceDto,
  type BulkMarkAttendanceDto,
  type UpdateAttendanceDto,
} from '@/lib/api/attendance';

// ─── Query key helpers ────────────────────────────────────────────────────────

const attendanceKeys = {
  all: ['attendance'] as const,
  todaySummary: () => [...attendanceKeys.all, 'today-summary'] as const,
  byDate: (date: string, classGroupId?: string) =>
    [...attendanceKeys.all, 'by-date', date, classGroupId ?? 'all'] as const,
  childHistory: (childId: string, params?: { from?: string; to?: string }) =>
    [...attendanceKeys.all, 'child', childId, params] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useTodayAttendanceSummary() {
  return useQuery<AttendanceTodaySummary, AxiosError>({
    queryKey: attendanceKeys.todaySummary(),
    queryFn: fetchTodayAttendanceSummary,
    staleTime: 60 * 1000, // 60s
    refetchOnWindowFocus: true,
  });
}

export function useAttendanceByDate(params: { date: string; classGroupId?: string }) {
  return useQuery<AttendanceRecord[], AxiosError>({
    queryKey: attendanceKeys.byDate(params.date, params.classGroupId),
    queryFn: () => fetchAttendanceByDate(params.date, params.classGroupId),
    enabled: !!params.date,
    staleTime: 30 * 1000,
  });
}

export function useChildAttendanceHistory(
  childId: string,
  params?: { from?: string; to?: string },
) {
  return useQuery<AttendanceRecord[], AxiosError>({
    queryKey: attendanceKeys.childHistory(childId, params),
    queryFn: () => fetchChildAttendance(childId, params),
    enabled: !!childId,
    staleTime: 60 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation<AttendanceRecord, AxiosError, MarkAttendanceDto>({
    mutationFn: markAttendance,
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.todaySummary() });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.byDate(record.date),
      });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.childHistory(record.childId),
      });
    },
  });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();

  return useMutation<AttendanceRecord[], AxiosError, BulkMarkAttendanceDto>({
    mutationFn: bulkMarkAttendance,
    onSuccess: (records) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.todaySummary() });
      if (records.length > 0) {
        queryClient.invalidateQueries({
          queryKey: attendanceKeys.byDate(records[0].date),
        });
        records.forEach((r) => {
          queryClient.invalidateQueries({
            queryKey: attendanceKeys.childHistory(r.childId),
          });
        });
      }
    },
  });
}

export function useUpdateAttendance() {
  const queryClient = useQueryClient();

  return useMutation<
    AttendanceRecord,
    AxiosError,
    { id: string } & UpdateAttendanceDto
  >({
    mutationFn: ({ id, ...dto }) => updateAttendance(id, dto),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.todaySummary() });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.byDate(record.date),
      });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.childHistory(record.childId),
      });
    },
  });
}

export function useDeleteAttendance() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, { id: string; date: string; childId: string }>({
    mutationFn: ({ id }) => deleteAttendance(id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: attendanceKeys.todaySummary() });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.byDate(variables.date),
      });
      queryClient.invalidateQueries({
        queryKey: attendanceKeys.childHistory(variables.childId),
      });
    },
  });
}

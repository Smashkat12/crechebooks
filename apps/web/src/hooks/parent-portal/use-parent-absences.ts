import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  reportAbsence,
  fetchAbsenceReports,
  cancelAbsenceReport,
  type AbsenceReportResponse,
  type AbsenceReportsListResponse,
  type ReportAbsenceDto,
} from '@/lib/api/attendance';

// ─── Query key helpers ────────────────────────────────────────────────────────

const parentAbsenceKeys = {
  all: ['parent-absences'] as const,
  childReports: (childId: string, params?: { from?: string; to?: string }) =>
    [...parentAbsenceKeys.all, 'child', childId, params] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useParentAbsenceReports(
  childId: string,
  params?: { from?: string; to?: string },
) {
  return useQuery<AbsenceReportsListResponse, Error>({
    queryKey: parentAbsenceKeys.childReports(childId, params),
    queryFn: () => fetchAbsenceReports(childId, params),
    enabled: !!childId,
    staleTime: 30 * 1000,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useReportAbsence(childId: string) {
  const queryClient = useQueryClient();

  return useMutation<AbsenceReportResponse, Error, ReportAbsenceDto>({
    mutationFn: (dto) => reportAbsence(childId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: parentAbsenceKeys.childReports(childId),
      });
    },
  });
}

export function useCancelAbsenceReport(childId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, { absenceId: string }>({
    mutationFn: ({ absenceId }) => cancelAbsenceReport(childId, absenceId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: parentAbsenceKeys.childReports(childId),
      });
    },
  });
}

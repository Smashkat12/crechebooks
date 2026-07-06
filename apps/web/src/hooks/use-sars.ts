import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { ISarsSubmission } from '@crechebooks/types';

/** Response shape for GET /sars/submissions (F-A-005) */
export interface SarsSubmissionsApiResponse {
  success: boolean;
  data: {
    items: Array<{
      id: string;
      submission_type: string;
      period: string;
      status: string;
      submitted_at: string | null;
      sars_reference: string | null;
      is_finalized: boolean;
      created_at: string;
    }>;
    total: number;
    page: number;
    limit: number;
  };
}

// Types for API responses
interface VAT201Response {
  period: string;
  totalSales: number;
  totalPurchases: number;
  outputVat: number;
  inputVat: number;
  netVat: number;
  transactions: {
    id: string;
    description: string;
    amount: number;
    vat: number;
    category: string;
  }[];
}

export interface EMP201Response {
  id: string;
  period: string;
  status: string;
  totalPaye: number;
  totalUif: number;
  totalSdl: number;
  totalDue: number;
  employeeCount: number;
  employees: {
    staffId: string;
    fullName: string;
    grossRemuneration: number;
    paye: number;
    uifEmployee: number;
    uifEmployer: number;
  }[];
  validationIssues: string[];
  deadline: string;
}

// API response shape (snake_case Rands) from POST /sars/emp201
interface ApiEmp201Response {
  success: boolean;
  data: {
    id: string;
    submission_type: string;
    period: string;
    status: string;
    summary: {
      employee_count: number;
      total_gross: number;
      total_paye: number;
      total_uif: number;
      total_sdl: number;
      total_due: number;
    };
    employees: Array<{
      staff_id: string;
      full_name: string;
      gross_remuneration: number;
      paye: number;
      uif_employee: number;
      uif_employer: number;
    }>;
    validation_issues: string[];
    deadline: string;
    document_url: string;
  };
}

interface SubmissionResponse {
  success: boolean;
  submissionId: string;
  reference: string;
}

interface SubmitSarsParams {
  submissionId: string;
  type: 'vat201' | 'emp201';
}

// Get VAT201 data for a period
export function useVAT201(period: string, enabled = true) {
  return useQuery<VAT201Response, AxiosError>({
    queryKey: queryKeys.sars.vat201(period),
    queryFn: async () => {
      const { data } = await apiClient.get<VAT201Response>(endpoints.sars.vat201, {
        params: { period },
      });
      return data;
    },
    enabled: enabled && !!period,
  });
}

// Get (generate) EMP201 data for a period.
// There is no standalone GET for an existing return — the backend upserts a
// DRAFT submission on each POST /sars/emp201 call (idempotent per period),
// so it's used here as the queryFn. Mirrors useSarsVat201's pattern.
export function useEMP201(period: string, enabled = true) {
  return useQuery<EMP201Response, AxiosError>({
    queryKey: queryKeys.sars.emp201(period),
    queryFn: async () => {
      const { data } = await apiClient.post<ApiEmp201Response>(endpoints.sars.emp201, {
        period_month: period,
      });
      const apiData = data.data;

      return {
        id: apiData.id,
        period: apiData.period,
        status: apiData.status,
        totalPaye: apiData.summary.total_paye,
        totalUif: apiData.summary.total_uif,
        totalSdl: apiData.summary.total_sdl,
        totalDue: apiData.summary.total_due,
        employeeCount: apiData.summary.employee_count,
        employees: apiData.employees.map((e) => ({
          staffId: e.staff_id,
          fullName: e.full_name,
          grossRemuneration: e.gross_remuneration,
          paye: e.paye,
          uifEmployee: e.uif_employee,
          uifEmployer: e.uif_employer,
        })),
        validationIssues: apiData.validation_issues,
        deadline: apiData.deadline,
      };
    },
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: enabled && !!period,
  });
}

// Get SARS submission history (F-A-005)
export function useSarsSubmissions() {
  return useQuery<SarsSubmissionsApiResponse, AxiosError>({
    queryKey: queryKeys.sars.submissions(),
    queryFn: async () => {
      const { data } = await apiClient.get<SarsSubmissionsApiResponse>(
        endpoints.sars.submissions,
      );
      return data;
    },
  });
}

// Submit SARS return
export function useSubmitSars() {
  const queryClient = useQueryClient();

  return useMutation<SubmissionResponse, AxiosError, SubmitSarsParams>({
    mutationFn: async ({ submissionId, type }) => {
      const { data } = await apiClient.post<SubmissionResponse>(
        endpoints.sars.submit(submissionId),
        {
          type,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sars.all });
    },
  });
}

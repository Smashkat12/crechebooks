import { useState, useEffect } from "react";
import type { Invoice, InvoicesListParams, InvoiceStatus } from "@/types/invoice";
import { apiClient, endpoints } from "@/lib/api";

interface PaginationState {
  pageIndex: number;
  pageSize: number;
  totalPages: number;
  totalCount: number;
}

interface UseInvoicesListResult {
  invoices: Invoice[];
  isLoading: boolean;
  error: Error | null;
  pagination: PaginationState;
  setPagination: (pagination: { pageIndex: number; pageSize: number }) => void;
}

// API response types (snake_case from backend)
interface ApiInvoiceResponse {
  id: string;
  invoice_number: string;
  parent: { id: string; name: string; email: string };
  child: { id: string; name: string };
  billing_period_start: string;
  billing_period_end: string;
  issue_date: string;
  due_date: string;
  subtotal: number;
  vat: number;
  total: number;
  amount_paid: number;
  balance_due: number;
  status: string;
  delivery_status: string | null;
  created_at: string;
}

// Transform API response to frontend Invoice type
function transformInvoice(api: ApiInvoiceResponse): Invoice {
  return {
    id: api.id,
    invoiceNumber: api.invoice_number,
    parentId: api.parent?.id || '',
    parentName: api.parent?.name || '',
    childId: api.child?.id || '',
    childName: api.child?.name || '',
    billingPeriodStart: api.billing_period_start,
    billingPeriodEnd: api.billing_period_end,
    issueDate: api.issue_date,
    dueDate: api.due_date,
    subtotal: api.subtotal,
    vat: api.vat,
    totalCents: Math.round(api.total * 100),
    amountPaid: api.amount_paid,
    balanceDue: api.balance_due,
    status: api.status.toLowerCase() as InvoiceStatus,
    deliveryStatus: api.delivery_status,
    createdAt: api.created_at,
    lines: [],
  };
}

export function useInvoicesList(
  params: InvoicesListParams = {}
): UseInvoicesListResult {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [pagination, setPaginationState] = useState<PaginationState>({
    pageIndex: params.page ?? 0,
    pageSize: params.pageSize ?? 10,
    totalPages: 0,
    totalCount: 0,
  });

  useEffect(() => {
    const fetchInvoices = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const queryParams: Record<string, string> = {};

        if (params.status) queryParams.status = params.status;
        if (params.parentSearch) queryParams.parentSearch = params.parentSearch;
        if (params.dateFrom) queryParams.date_from = params.dateFrom;
        if (params.dateTo) queryParams.date_to = params.dateTo;
        queryParams.page = (pagination.pageIndex + 1).toString();
        queryParams.limit = pagination.pageSize.toString();

        const { data } = await apiClient.get(endpoints.invoices.list, { params: queryParams });

        // API returns { success, data: [...], meta: { page, limit, total, totalPages }}
        const rawInvoices: ApiInvoiceResponse[] = data.data || data.invoices || [];
        const meta = data.meta || data.pagination || {};

        // Transform API response to frontend format
        const transformedInvoices = rawInvoices.map(transformInvoice);

        setInvoices(transformedInvoices);
        setPaginationState((prev) => ({
          ...prev,
          totalPages: meta.totalPages || Math.ceil((meta.total || 0) / pagination.pageSize),
          totalCount: meta.total || meta.totalCount || 0,
        }));
      } catch (err) {
        setError(err instanceof Error ? err : new Error("Unknown error"));
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvoices();
  }, [
    params.status,
    params.parentSearch,
    params.dateFrom,
    params.dateTo,
    pagination.pageIndex,
    pagination.pageSize,
  ]);

  const setPagination = (newPagination: {
    pageIndex: number;
    pageSize: number;
  }) => {
    setPaginationState((prev) => ({
      ...prev,
      ...newPagination,
    }));
  };

  return {
    invoices,
    isLoading,
    error,
    pagination,
    setPagination,
  };
}

import { useState, useEffect } from "react";
import type { Invoice, InvoicesListParams } from "@/types/invoice";
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
        const invoiceData = data.data || data.invoices || [];
        const meta = data.meta || data.pagination || {};

        setInvoices(invoiceData);
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

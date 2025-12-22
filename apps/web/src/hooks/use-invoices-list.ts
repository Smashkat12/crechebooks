import { useState, useEffect } from "react";
import type { Invoice, InvoicesListParams } from "@/types/invoice";

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
        const queryParams = new URLSearchParams();

        if (params.status) queryParams.append("status", params.status);
        if (params.parentSearch) queryParams.append("parentSearch", params.parentSearch);
        if (params.dateFrom) queryParams.append("dateFrom", params.dateFrom);
        if (params.dateTo) queryParams.append("dateTo", params.dateTo);
        queryParams.append("page", pagination.pageIndex.toString());
        queryParams.append("pageSize", pagination.pageSize.toString());

        const response = await fetch(`/api/invoices?${queryParams.toString()}`);

        if (!response.ok) {
          throw new Error("Failed to fetch invoices");
        }

        const data = await response.json();

        setInvoices(data.invoices);
        setPaginationState((prev) => ({
          ...prev,
          totalPages: data.pagination.totalPages,
          totalCount: data.pagination.totalCount,
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

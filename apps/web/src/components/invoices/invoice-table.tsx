import { useState } from "react";
import { DataTable } from "@/components/ui/data-table";
import { useInvoicesList } from "@/hooks/use-invoices-list";
import type { Invoice, InvoiceStatus } from "@/types/invoice";
import { createInvoiceColumns } from "./invoice-columns";
import { InvoiceFilters } from "./invoice-filters";

interface InvoiceTableProps {
  onView: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

export function InvoiceTable({
  onView,
  onSend,
  onDownload,
  onDelete,
}: InvoiceTableProps) {
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const [parentSearch, setParentSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const {
    invoices,
    isLoading,
    error,
    pagination,
    setPagination,
  } = useInvoicesList({
    status: status === "all" ? undefined : status,
    parentSearch: parentSearch || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  });

  const columns = createInvoiceColumns(onView, onSend, onDownload, onDelete);

  const handleReset = () => {
    setStatus("all");
    setParentSearch("");
    setDateFrom("");
    setDateTo("");
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Failed to load invoices: {error.message}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <InvoiceFilters
        status={status}
        onStatusChange={setStatus}
        parentSearch={parentSearch}
        onParentSearchChange={setParentSearch}
        dateFrom={dateFrom}
        onDateFromChange={setDateFrom}
        dateTo={dateTo}
        onDateToChange={setDateTo}
        onReset={handleReset}
      />
      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
      />
    </div>
  );
}

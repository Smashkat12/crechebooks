'use client';

import { useState } from 'react';
import { DataTable } from '@/components/ui/data-table';
import { useStatementsList, type StatementSummary, type StatementStatus } from '@/hooks/use-statements';
import { createStatementColumns } from './statement-columns';
import { StatementFilters } from './statement-filters';

interface StatementTableProps {
  onView: (statement: StatementSummary) => void;
  onDownload: (statement: StatementSummary) => void;
  onFinalize: (statement: StatementSummary) => void;
  onSend: (statement: StatementSummary) => void;
}

export function StatementTable({
  onView,
  onDownload,
  onFinalize,
  onSend,
}: StatementTableProps) {
  const [status, setStatus] = useState<StatementStatus | 'all'>('all');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [pagination, setPagination] = useState({
    pageIndex: 0,
    pageSize: 20,
  });

  const { data, isLoading, error } = useStatementsList({
    page: pagination.pageIndex + 1,
    limit: pagination.pageSize,
    status: status === 'all' ? undefined : status,
    periodStart: periodStart || undefined,
    periodEnd: periodEnd || undefined,
  });

  const columns = createStatementColumns({
    onView,
    onDownload,
    onFinalize,
    onSend,
  });

  const handleReset = () => {
    setStatus('all');
    setPeriodStart('');
    setPeriodEnd('');
    setPagination({ pageIndex: 0, pageSize: 20 });
  };

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Failed to load statements: {error.message}
      </div>
    );
  }

  const statements = data?.data ?? [];
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <StatementFilters
        status={status}
        onStatusChange={setStatus}
        periodStart={periodStart}
        onPeriodStartChange={setPeriodStart}
        periodEnd={periodEnd}
        onPeriodEndChange={setPeriodEnd}
        onReset={handleReset}
      />
      <DataTable
        columns={columns}
        data={statements}
        isLoading={isLoading}
        pagination={
          meta
            ? {
                pageIndex: pagination.pageIndex,
                pageSize: pagination.pageSize,
                totalPages: meta.totalPages,
                totalCount: meta.total,
              }
            : undefined
        }
        onPaginationChange={setPagination}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useAdminAuditLogs, useAuditLogStats, useAuditLogFilters } from '@/hooks/use-admin-audit-logs';
import { apiClient } from '@/lib/api/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ScrollText, Clock, Activity, Download } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
};

const MAX_EXPORT_DAYS = 366;

function today(): string {
  return new Date().toISOString().split('T')[0];
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export default function AuditLogsPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState<string>('');
  const [resourceType, setResourceType] = useState<string>('');
  const [page, setPage] = useState(1);

  // Export date range — default to current month
  const [exportFrom, setExportFrom] = useState<string>(
    today().slice(0, 8) + '01', // first of current month
  );
  const [exportTo, setExportTo] = useState<string>(today());
  const [isExporting, setIsExporting] = useState(false);

  const { toast } = useToast();

  const { data: logsData, isLoading } = useAdminAuditLogs({ search, action, resourceType, page });
  const { data: stats } = useAuditLogStats();
  const { data: filterOptions } = useAuditLogFilters();

  const handleExportCsv = async () => {
    // Client-side validation
    if (!exportFrom || !exportTo) {
      toast({ title: 'Date range required', description: 'Please set both From and To dates before exporting.', variant: 'destructive' });
      return;
    }

    const from = new Date(exportFrom);
    const to = new Date(exportTo);

    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      toast({ title: 'Invalid dates', description: 'Dates must be in YYYY-MM-DD format.', variant: 'destructive' });
      return;
    }

    if (from > to) {
      toast({ title: 'Invalid range', description: '"From" date must be on or before "To" date.', variant: 'destructive' });
      return;
    }

    const diffDays = (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_EXPORT_DAYS) {
      toast({
        title: 'Range too large',
        description: `Maximum export range is ${MAX_EXPORT_DAYS} days. Current range is ${Math.ceil(diffDays)} days.`,
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const params = new URLSearchParams({ from: exportFrom, to: exportTo });
      if (action) params.set('action', action);
      if (resourceType) params.set('resourceType', resourceType);

      const response = await apiClient.get(`/admin/audit-logs/export?${params}`, {
        responseType: 'blob',
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${exportFrom}-to-${exportTo}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({ title: 'Export complete', description: `audit-logs-${exportFrom}-to-${exportTo}.csv downloaded.` });
    } catch (err) {
      console.error('Audit log export failed:', err);
      toast({ title: 'Export failed', description: 'Could not download audit logs. Please try again.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Audit Logs</h1>
        <p className="text-muted-foreground">View all activity across the platform</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Logs</CardTitle>
            <ScrollText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.total?.toLocaleString() || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.todayCount || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top Action</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.topActions?.[0]?.action || '—'}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Export */}
      <div className="flex gap-4 flex-wrap items-end">
        <Input
          placeholder="Search logs..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={action || 'all'} onValueChange={(v) => setAction(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Actions" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {filterOptions?.actions?.map((a: string) => (
              <SelectItem key={a} value={a}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={resourceType || 'all'} onValueChange={(v) => setResourceType(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Resources" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Resources</SelectItem>
            {filterOptions?.resourceTypes?.map((r: string) => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Export controls */}
        <div className="flex items-end gap-2 ml-auto">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">From</label>
            <Input
              type="date"
              value={exportFrom}
              max={exportTo || today()}
              onChange={(e) => setExportFrom(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground font-medium">To</label>
            <Input
              type="date"
              value={exportTo}
              min={exportFrom}
              max={exportFrom ? addDays(exportFrom, MAX_EXPORT_DAYS) : today()}
              onChange={(e) => setExportTo(e.target.value)}
              className="w-36"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExportCsv}
            disabled={isExporting}
            className="flex items-center gap-2"
          >
            <Download className="h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Download CSV'}
          </Button>
        </div>
      </div>

      {/* Log Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Loading logs...
                </TableCell>
              </TableRow>
            ) : logsData?.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  No logs found
                </TableCell>
              </TableRow>
            ) : (
              logsData?.data?.map((log: any) => (
                <TableRow key={log.id}>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {log.createdAt
                      ? formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div className="font-medium">{log.user?.name || '—'}</div>
                      <div className="text-muted-foreground">{log.user?.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>{log.tenant?.name || '—'}</TableCell>
                  <TableCell>
                    <Badge className={actionColors[log.action?.split('_')[0]] || 'bg-gray-100'}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">
                      <div>{log.resourceType}</div>
                      <div className="text-muted-foreground text-xs">{log.resourceId}</div>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xs truncate">
                    {log.details ? JSON.stringify(log.details).slice(0, 50) : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {logsData?.pagination && logsData.pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Page {logsData.pagination.page} of {logsData.pagination.totalPages} ({logsData.pagination.total.toLocaleString()} total)
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={logsData.pagination.page <= 1}
                onClick={() => setPage(logsData.pagination.page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={logsData.pagination.page >= logsData.pagination.totalPages}
                onClick={() => setPage(logsData.pagination.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDistanceToNow } from 'date-fns';

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
};

interface AuditLog {
  id: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  createdAt?: string;
  user?: { name: string; email: string };
  tenant?: { name: string };
  details?: any;
}

interface PaginationInfo {
  page: number;
  totalPages: number;
  total: number;
}

interface AuditLogTableProps {
  data: AuditLog[];
  isLoading: boolean;
  pagination?: PaginationInfo;
  onPageChange: (page: number) => void;
}

export function AuditLogTable({ data, isLoading, pagination, onPageChange }: AuditLogTableProps) {
  if (isLoading) {
    return (
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
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                Loading logs...
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
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
            <TableRow>
              <TableCell colSpan={6} className="text-center py-8">
                No logs found
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
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
          {data.map((log) => (
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
          ))}
        </TableBody>
      </Table>
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages} ({pagination.total.toLocaleString()} total)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => onPageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

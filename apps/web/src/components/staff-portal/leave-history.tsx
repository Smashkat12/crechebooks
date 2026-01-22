'use client';

/**
 * Leave History Component
 * TASK-PORTAL-024: Staff Leave Management
 *
 * Displays leave request history with:
 * - Status badges (pending, approved, rejected, cancelled)
 * - Request details
 * - Cancel action for pending requests
 * - Mobile-responsive cards and desktop table views
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Ban,
  Calendar,
  Loader2,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface LeaveRequest {
  id: string;
  type: string;
  typeName: string;
  startDate: Date | string;
  endDate: Date | string;
  days: number;
  status: LeaveStatus;
  reason?: string;
  createdAt: Date | string;
  updatedAt?: Date | string;
  reviewerName?: string;
  reviewerComments?: string;
  reviewedAt?: Date | string;
}

export interface LeaveHistoryProps {
  requests: LeaveRequest[];
  isLoading?: boolean;
  onCancelRequest?: (id: string) => Promise<void>;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDate = (date: Date | string | undefined): string => {
  if (!date) return '-';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
};

const formatDateRange = (start: Date | string, end: Date | string): string => {
  const startDate = typeof start === 'string' ? new Date(start) : start;
  const endDate = typeof end === 'string' ? new Date(end) : end;

  const startStr = startDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const endStr = endDate.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

  return `${startStr} - ${endStr}`;
};

const getStatusConfig = (status: LeaveStatus) => {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        icon: Clock,
        variant: 'outline' as const,
        className: 'border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400',
      };
    case 'approved':
      return {
        label: 'Approved',
        icon: CheckCircle2,
        variant: 'outline' as const,
        className: 'border-green-300 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-900/20 dark:text-green-400',
      };
    case 'rejected':
      return {
        label: 'Rejected',
        icon: XCircle,
        variant: 'outline' as const,
        className: 'border-red-300 bg-red-50 text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        icon: Ban,
        variant: 'outline' as const,
        className: 'border-gray-300 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/20 dark:text-gray-400',
      };
  }
};

// ============================================================================
// Status Badge Component
// ============================================================================

function StatusBadge({ status }: { status: LeaveStatus }) {
  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn('gap-1', config.className)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// ============================================================================
// Mobile Card Component
// ============================================================================

interface LeaveRequestCardProps {
  request: LeaveRequest;
  onCancel?: () => void;
  isCancelling?: boolean;
}

function LeaveRequestCard({ request, onCancel, isCancelling }: LeaveRequestCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{request.typeName}</span>
              <StatusBadge status={request.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDateRange(request.startDate, request.endDate)}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Days:</span>{' '}
              <span className="font-medium">{request.days}</span>
            </p>
            {request.reason && (
              <p className="text-sm text-muted-foreground line-clamp-2">{request.reason}</p>
            )}
          </div>
          {request.status === 'pending' && onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              disabled={isCancelling}
              className="text-destructive hover:text-destructive shrink-0"
            >
              {isCancelling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Cancel'
              )}
            </Button>
          )}
        </div>
        {request.reviewerComments && (
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground">
              <span className="font-medium">Reviewer:</span> {request.reviewerName}
            </p>
            <p className="text-sm mt-1">{request.reviewerComments}</p>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Submitted {formatDate(request.createdAt)}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LeaveHistorySkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LeaveHistory({
  requests,
  isLoading = false,
  onCancelRequest,
  className,
}: LeaveHistoryProps) {
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Filter requests
  const filteredRequests = requests.filter((r) => {
    if (statusFilter === 'all') return true;
    return r.status === statusFilter;
  });

  // Handle cancel
  const handleCancel = async (id: string) => {
    if (!onCancelRequest) return;
    setCancellingId(id);
    try {
      await onCancelRequest(id);
    } finally {
      setCancellingId(null);
      setConfirmCancelId(null);
    }
  };

  if (isLoading) {
    return (
      <div className={className}>
        <LeaveHistorySkeleton />
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Leave History
          </h2>
          <p className="text-sm text-muted-foreground">
            {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Empty State */}
      {filteredRequests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-medium">No leave requests found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {statusFilter === 'all'
                ? "You haven't submitted any leave requests yet."
                : `No ${statusFilter} leave requests.`}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Mobile View - Cards */}
      <div className="sm:hidden space-y-3">
        {filteredRequests.map((request) => (
          <LeaveRequestCard
            key={request.id}
            request={request}
            onCancel={
              request.status === 'pending' && onCancelRequest
                ? () => setConfirmCancelId(request.id)
                : undefined
            }
            isCancelling={cancellingId === request.id}
          />
        ))}
      </div>

      {/* Desktop View - Table */}
      {filteredRequests.length > 0 && (
        <Card className="hidden sm:block">
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{request.typeName}</p>
                        {request.reason && (
                          <p className="text-xs text-muted-foreground line-clamp-1">
                            {request.reason}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatDateRange(request.startDate, request.endDate)}
                    </TableCell>
                    <TableCell className="text-center">{request.days}</TableCell>
                    <TableCell>
                      <StatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(request.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === 'pending' && onCancelRequest && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmCancelId(request.id)}
                          disabled={cancellingId === request.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {cancellingId === request.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Cancel'
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </Card>
      )}

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!confirmCancelId} onOpenChange={() => setConfirmCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Leave Request?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this leave request? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Request</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => confirmCancelId && handleCancel(confirmCancelId)}
            >
              Cancel Request
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default LeaveHistory;

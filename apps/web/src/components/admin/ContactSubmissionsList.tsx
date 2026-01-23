'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useContactSubmissions, useUpdateContactSubmissionStatus } from '@/hooks/useAdminSubmissions';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, Clock } from 'lucide-react';

type StatusFilter = 'ALL' | 'PENDING' | 'CONTACTED';

export function ContactSubmissionsList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const { data, isLoading, error } = useContactSubmissions();
  const updateStatus = useUpdateContactSubmissionStatus();
  const { toast } = useToast();

  const handleStatusUpdate = async (id: string, status: 'PENDING' | 'CONTACTED') => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({
        title: 'Status updated',
        description: `Contact submission marked as ${status.toLowerCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const filteredSubmissions =
    statusFilter === 'ALL'
      ? data?.submissions
      : data?.submissions.filter((s) => s.status === statusFilter);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center text-destructive">
            <p>Failed to load contact submissions</p>
            <p className="text-sm text-muted-foreground mt-2">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Contact Submissions</CardTitle>
            <CardDescription>
              Manage inquiries from the contact form ({data?.total || 0} total)
            </CardDescription>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All ({data?.total || 0})</SelectItem>
              <SelectItem value="PENDING">Pending ({data?.pending || 0})</SelectItem>
              <SelectItem value="CONTACTED">Contacted ({data?.contacted || 0})</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredSubmissions && filteredSubmissions.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Message</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubmissions.map((submission) => (
                  <TableRow key={submission.id}>
                    <TableCell className="font-medium">{submission.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[200px]">{submission.email}</span>
                        </div>
                        {submission.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{submission.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell max-w-xs">
                      <p className="truncate text-sm text-muted-foreground">
                        {submission.message}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={submission.status === 'PENDING' ? 'default' : 'secondary'}
                      >
                        {submission.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(submission.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {submission.status === 'PENDING' ? (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(submission.id, 'CONTACTED')}
                          disabled={updateStatus.isPending}
                        >
                          Mark Contacted
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(submission.id, 'PENDING')}
                          disabled={updateStatus.isPending}
                        >
                          Mark Pending
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <p>No contact submissions found</p>
            {statusFilter !== 'ALL' && (
              <Button
                variant="link"
                className="mt-2"
                onClick={() => setStatusFilter('ALL')}
              >
                Clear filter
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

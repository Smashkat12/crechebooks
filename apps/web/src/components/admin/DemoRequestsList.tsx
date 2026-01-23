'use client';

import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useDemoRequests, useUpdateDemoRequestStatus } from '@/hooks/useAdminSubmissions';
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
import { Mail, Phone, Building2, Users, Clock } from 'lucide-react';

type StatusFilter = 'ALL' | 'PENDING' | 'CONTACTED' | 'DEMO_SCHEDULED';

export function DemoRequestsList() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const { data, isLoading, error } = useDemoRequests();
  const updateStatus = useUpdateDemoRequestStatus();
  const { toast } = useToast();

  const handleStatusUpdate = async (id: string, status: 'PENDING' | 'CONTACTED') => {
    try {
      await updateStatus.mutateAsync({ id, status });
      toast({
        title: 'Status updated',
        description: `Demo request marked as ${status.toLowerCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update status',
        variant: 'destructive',
      });
    }
  };

  const filteredRequests =
    statusFilter === 'ALL'
      ? data?.requests
      : data?.requests.filter((r) => r.status === statusFilter);

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
            <p>Failed to load demo requests</p>
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
            <CardTitle>Demo Requests</CardTitle>
            <CardDescription>
              Manage demo requests from potential customers ({data?.total || 0} total)
            </CardDescription>
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All ({data?.total || 0})</SelectItem>
              <SelectItem value="PENDING">Pending ({data?.pending || 0})</SelectItem>
              <SelectItem value="CONTACTED">Contacted ({data?.contacted || 0})</SelectItem>
              <SelectItem value="DEMO_SCHEDULED">
                Scheduled ({data?.scheduled || 0})
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {filteredRequests && filteredRequests.length > 0 ? (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead className="hidden lg:table-cell">Creche Details</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.name}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1 text-sm">
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span className="truncate max-w-[200px]">{request.email}</span>
                        </div>
                        {request.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{request.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col gap-1 text-sm">
                        {request.creche_name && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{request.creche_name}</span>
                          </div>
                        )}
                        {request.num_children && (
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Users className="h-3 w-3" />
                            <span>{request.num_children} children</span>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          request.status === 'PENDING'
                            ? 'default'
                            : request.status === 'DEMO_SCHEDULED'
                              ? 'default'
                              : 'secondary'
                        }
                      >
                        {request.status.replace('_', ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(request.created_at), {
                          addSuffix: true,
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === 'PENDING' ? (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(request.id, 'CONTACTED')}
                          disabled={updateStatus.isPending}
                        >
                          Mark Contacted
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(request.id, 'PENDING')}
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
            <p>No demo requests found</p>
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

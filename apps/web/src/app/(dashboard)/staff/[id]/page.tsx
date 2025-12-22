'use client';

import { use } from 'react';
import { ArrowLeft, Edit } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useStaff } from '@/hooks/use-staff';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { StaffStatus } from '@crechebooks/types';

interface StaffDetailPageProps {
  params: Promise<{ id: string }>;
}

const statusConfig: Record<StaffStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  ACTIVE: { label: 'Active', variant: 'default' },
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  TERMINATED: { label: 'Terminated', variant: 'destructive' },
};

export default function StaffDetailPage({ params }: StaffDetailPageProps) {
  const { id } = use(params);
  const { data: staff, isLoading, error } = useStaff(id);

  if (error) {
    throw new Error(`Failed to load staff member: ${error.message}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-[600px]" />
      </div>
    );
  }

  if (!staff) {
    throw new Error('Staff member not found');
  }

  const config = statusConfig[staff.status] ?? statusConfig.ACTIVE;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/staff">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">
                {staff.firstName} {staff.lastName}
              </h1>
              <Badge variant={config.variant}>
                {config.label}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Employee #{staff.employeeNumber}
            </p>
          </div>
        </div>
        <Link href={`/staff/${id}/edit`}>
          <Button variant="outline">
            <Edit className="h-4 w-4 mr-2" />
            Edit
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Monthly Salary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(staff.salary / 100)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">ID Number</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg font-mono">{staff.idNumber}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Start Date</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-lg">{formatDate(staff.startDate)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Tax Number</p>
              <p className="font-medium">{staff.taxNumber ?? 'Not set'}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <p className="font-medium">{staff.paymentMethod}</p>
            </div>
            {staff.paymentMethod === 'EFT' && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Bank Account</p>
                  <p className="font-medium">{staff.bankAccountNumber ?? 'Not set'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Branch Code</p>
                  <p className="font-medium">{staff.bankBranchCode ?? 'Not set'}</p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

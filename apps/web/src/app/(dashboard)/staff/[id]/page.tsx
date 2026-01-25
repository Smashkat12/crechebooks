'use client';

import { use, useState } from 'react';
import { ArrowLeft, Edit, Mail, CheckCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useStaff, useResendOnboardingEmail } from '@/hooks/use-staff';
import { useOnboardingStatus } from '@/hooks/use-staff-onboarding';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { OnboardingStatusBadge } from '@/components/staff/OnboardingStatusBadge';
import { SimplepayStatusCard } from '@/components/staff/SimplepayStatusCard';
import { LeaveBalanceCard } from '@/components/staff/LeaveBalanceCard';
import { PayslipsSection } from '@/components/staff/PayslipsSection';
import { TaxDocumentsSection } from '@/components/staff/TaxDocumentsSection';
import { useToast } from '@/hooks/use-toast';
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
  const { data: onboarding, isLoading: onboardingLoading } = useOnboardingStatus(id);
  const resendEmail = useResendOnboardingEmail();
  const { toast } = useToast();
  const [emailSent, setEmailSent] = useState(false);

  const handleResendEmail = async () => {
    try {
      const result = await resendEmail.mutateAsync(id);
      setEmailSent(true);
      toast({
        title: 'Email Sent',
        description: result.message,
      });
      // Reset the "sent" state after 30 seconds
      setTimeout(() => setEmailSent(false), 30000);
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to send onboarding email. Please try again.',
        variant: 'destructive',
      });
    }
  };

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
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleResendEmail}
            disabled={resendEmail.isPending || emailSent || !staff.email}
          >
            {resendEmail.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : emailSent ? (
              <CheckCircle className="h-4 w-4 mr-2" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            {emailSent ? 'Email Sent' : 'Resend Onboarding Email'}
          </Button>
          <Link href={`/staff/${id}/edit`}>
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
        </div>
      </div>

      {/* Onboarding Status Card (read-only) */}
      <Card className={onboarding?.status === 'IN_PROGRESS' ? 'border-blue-200 bg-blue-50/50' : ''}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Onboarding Status</CardTitle>
            {!onboardingLoading && onboarding && (
              <OnboardingStatusBadge
                status={onboarding.status}
                currentStep={onboarding.currentStep}
                size="sm"
              />
            )}
          </div>
          {onboarding?.status === 'IN_PROGRESS' && (
            <CardDescription>
              Staff is completing onboarding via the Staff Portal
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {onboardingLoading ? (
            <Skeleton className="h-4 w-full" />
          ) : onboarding?.status === 'NOT_STARTED' ? (
            <div className="text-sm text-muted-foreground">
              <p>Waiting for staff to access the onboarding portal via their magic link email.</p>
              {!staff.email && (
                <p className="mt-1 text-amber-600">
                  No email address on file. Add an email address to send the onboarding link.
                </p>
              )}
            </div>
          ) : onboarding?.status === 'IN_PROGRESS' ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Progress</span>
                <span className="font-medium">
                  {onboarding.completedSteps?.length || 0} of 6 steps
                </span>
              </div>
              <Progress
                value={((onboarding.completedSteps?.length || 0) / 6) * 100}
                className="h-2"
              />
              <span className="text-xs text-muted-foreground">
                Current: {onboarding.currentStep?.replace('_', ' ') || 'Personal Info'}
              </span>
            </div>
          ) : onboarding?.status === 'COMPLETED' ? (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>Onboarding completed on {formatDate(onboarding.completedAt)}</span>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Status: {onboarding?.status || 'Unknown'}
            </div>
          )}
        </CardContent>
      </Card>

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
              <p className="font-medium">{staff.paymentMethod ?? 'Not set'}</p>
            </div>
            {staff.bankAccount && (
              <>
                <div>
                  <p className="text-sm text-muted-foreground">Bank Account</p>
                  <p className="font-medium">{staff.bankAccount}</p>
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

      {/* SimplePay Integration & Leave Management */}
      <div className="grid gap-4 md:grid-cols-2">
        <SimplepayStatusCard staffId={id} />
        <LeaveBalanceCard staffId={id} />
      </div>

      {/* Payslips & Tax Documents */}
      <div className="grid gap-4 md:grid-cols-2">
        <PayslipsSection staffId={id} />
        <TaxDocumentsSection staffId={id} />
      </div>
    </div>
  );
}

'use client';

/**
 * Offboarding Status Card
 * TASK-STAFF-002: Display offboarding status and documents
 *
 * Shows the current offboarding status for a staff member including:
 * - Status badge
 * - Settlement amount
 * - Document download buttons (UI-19, Certificate, Exit Pack)
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Download,
  FileText,
  Award,
  Package,
  Calendar,
  DollarSign,
  Loader2,
  CheckCircle,
  Clock,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import {
  useOffboardingStatus,
  useDownloadUi19,
  useDownloadCertificate,
  useDownloadExitPack,
  useCompleteOffboarding,
  type OffboardingStatus,
} from '@/hooks/use-staff-offboarding';
import { formatDate, formatCurrency } from '@/lib/utils';

interface OffboardingStatusCardProps {
  staffId: string;
}

// Status badge variant mapping
function getStatusBadge(status: OffboardingStatus['status']) {
  switch (status) {
    case 'COMPLETED':
      return {
        variant: 'default' as const,
        icon: CheckCircle,
        label: 'Completed',
        className: 'bg-green-100 text-green-800 hover:bg-green-100',
      };
    case 'IN_PROGRESS':
      return {
        variant: 'secondary' as const,
        icon: Clock,
        label: 'In Progress',
        className: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      };
    case 'PENDING_SETTLEMENT':
      return {
        variant: 'outline' as const,
        icon: DollarSign,
        label: 'Pending Settlement',
        className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      };
    case 'PENDING':
      return {
        variant: 'outline' as const,
        icon: AlertCircle,
        label: 'Pending',
        className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
      };
    case 'CANCELLED':
      return {
        variant: 'destructive' as const,
        icon: XCircle,
        label: 'Cancelled',
        className: '',
      };
    default:
      return {
        variant: 'outline' as const,
        icon: Clock,
        label: status,
        className: '',
      };
  }
}

// Reason display mapping
function getReasonDisplay(reason: string): string {
  const reasonMap: Record<string, string> = {
    RESIGNATION: 'Resignation',
    TERMINATION: 'Termination',
    RETRENCHMENT: 'Retrenchment',
    RETIREMENT: 'Retirement',
    END_OF_CONTRACT: 'End of Contract',
    MUTUAL_AGREEMENT: 'Mutual Agreement',
    DEATH: 'Death',
  };
  return reasonMap[reason] || reason;
}

export function OffboardingStatusCard({ staffId }: OffboardingStatusCardProps) {
  const { data: status, isLoading, error } = useOffboardingStatus(staffId);

  // Get offboardingId early for hook initialization (will be empty string if not loaded yet)
  const offboardingId = status?.id || '';

  // Download hooks - require offboardingId for API endpoints
  const { mutate: downloadUi19, isPending: downloadingUi19 } = useDownloadUi19(staffId, offboardingId);
  const { mutate: downloadCertificate, isPending: downloadingCertificate } =
    useDownloadCertificate(staffId, offboardingId);
  const { mutate: downloadExitPack, isPending: downloadingExitPack } =
    useDownloadExitPack(staffId, offboardingId);
  const { mutate: completeOffboarding, isPending: completing } =
    useCompleteOffboarding(staffId, offboardingId);

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-24" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
          <Skeleton className="h-10" />
        </CardContent>
      </Card>
    );
  }

  // No offboarding status or error (staff not offboarding)
  if (error || !status) {
    return null;
  }

  const statusBadge = getStatusBadge(status.status);
  const StatusIcon = statusBadge.icon;

  // Backend requires UI-19 AND Certificate to be generated before completion
  const requiredDocsGenerated = status.documents?.ui19 && status.documents?.certificate;

  // Allow completion when status is IN_PROGRESS or PENDING_SETTLEMENT and required docs are ready
  const canComplete =
    (status.status === 'IN_PROGRESS' || status.status === 'PENDING_SETTLEMENT') &&
    status.settlementCalculated &&
    requiredDocsGenerated;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg">Offboarding Status</span>
          <Badge variant={statusBadge.variant} className={statusBadge.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {statusBadge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Details Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="space-y-1">
            <span className="text-muted-foreground">Reason</span>
            <p className="font-medium">{getReasonDisplay(status.reason)}</p>
          </div>
          <div className="space-y-1">
            <span className="text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Last Working Date
            </span>
            <p className="font-medium">{formatDate(status.lastWorkingDate)}</p>
          </div>
          {status.settlementAmount !== undefined && (
            <div className="col-span-full space-y-1">
              <span className="text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3 w-3" />
                Settlement Amount
              </span>
              <p className="font-medium text-lg text-green-600">
                {formatCurrency(status.settlementAmount / 100)}
              </p>
            </div>
          )}
        </div>

        {/* Document Downloads - Show when settlement is calculated (documents generate on-demand) */}
        {status.settlementCalculated && (
          <div className="space-y-2 pt-2 border-t">
            <h4 className="font-medium text-sm">
              Documents
              {!requiredDocsGenerated && (
                <span className="text-muted-foreground ml-1">
                  (download UI-19 & Certificate to complete)
                </span>
              )}
            </h4>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant={status.documents?.ui19 ? 'default' : 'outline'}
                onClick={() => downloadUi19()}
                disabled={downloadingUi19}
              >
                {downloadingUi19 ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : status.documents?.ui19 ? (
                  <CheckCircle className="mr-1 h-4 w-4" />
                ) : (
                  <FileText className="mr-1 h-4 w-4" />
                )}
                UI-19 Form
              </Button>
              <Button
                size="sm"
                variant={status.documents?.certificate ? 'default' : 'outline'}
                onClick={() => downloadCertificate()}
                disabled={downloadingCertificate}
              >
                {downloadingCertificate ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : status.documents?.certificate ? (
                  <CheckCircle className="mr-1 h-4 w-4" />
                ) : (
                  <Award className="mr-1 h-4 w-4" />
                )}
                Certificate of Service
              </Button>
              <Button
                size="sm"
                variant={status.documents?.exitPack ? 'default' : 'outline'}
                onClick={() => downloadExitPack()}
                disabled={downloadingExitPack}
              >
                {downloadingExitPack ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : status.documents?.exitPack ? (
                  <CheckCircle className="mr-1 h-4 w-4" />
                ) : (
                  <Package className="mr-1 h-4 w-4" />
                )}
                Exit Pack
              </Button>
            </div>
          </div>
        )}

        {/* Complete Offboarding Button */}
        {canComplete && (
          <div className="pt-2 border-t">
            <Button
              onClick={() => completeOffboarding()}
              disabled={completing}
              className="w-full"
            >
              {completing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Completing...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Complete Offboarding
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

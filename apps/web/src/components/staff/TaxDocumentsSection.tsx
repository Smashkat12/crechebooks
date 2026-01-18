'use client';

/**
 * Tax Documents Section
 * TASK-WEB-049: Display IRP5 tax certificates for staff members
 *
 * Shows IRP5 tax certificates in a table with:
 * - Tax Year
 * - Certificate Type (IRP5)
 * - Status (draft/final/Available)
 * - Download action
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Download, FileCheck, FileText, Loader2 } from 'lucide-react';
import {
  useIrp5Certificates,
  useDownloadIrp5Pdf,
  type Irp5Certificate,
} from '@/hooks/use-simplepay';

interface TaxDocumentsSectionProps {
  staffId: string;
}

/**
 * Determine certificate status based on data
 * - If no PDF URL, it's a draft
 * - If PDF URL exists, it's available/final
 */
function getCertificateStatus(certificate: Irp5Certificate): 'draft' | 'final' | 'available' {
  // Determine status based on availability of PDF
  if (!certificate.pdfUrl) {
    return 'draft';
  }
  // If amounts are fully populated, consider it final
  if (certificate.grossRemuneration > 0 && certificate.payeDeducted >= 0) {
    return 'final';
  }
  return 'available';
}

/**
 * Get badge configuration for certificate status
 */
function getStatusBadge(status: 'draft' | 'final' | 'available') {
  switch (status) {
    case 'final':
      return {
        variant: 'default' as const,
        label: 'Final',
        className: 'bg-green-100 text-green-800 hover:bg-green-100',
      };
    case 'available':
      return {
        variant: 'secondary' as const,
        label: 'Available',
        className: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      };
    case 'draft':
    default:
      return {
        variant: 'outline' as const,
        label: 'Draft',
        className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
      };
  }
}

export function TaxDocumentsSection({ staffId }: TaxDocumentsSectionProps) {
  const { data: certificates, isLoading, error } = useIrp5Certificates(staffId);
  const { mutate: downloadIrp5, isPending: downloading, variables: downloadingYear } = useDownloadIrp5Pdf();

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            <Skeleton className="h-6 w-32" />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Tax Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load tax documents. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!certificates || certificates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck className="h-5 w-5" />
            Tax Documents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No tax documents available yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              IRP5 certificates will appear here once available from SimplePay.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sort certificates by tax year (most recent first)
  const sortedCertificates = [...certificates].sort((a, b) => b.taxYear - a.taxYear);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileCheck className="h-5 w-5" />
          Tax Documents
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tax Year</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCertificates.map((certificate) => {
              const status = getCertificateStatus(certificate);
              const statusBadge = getStatusBadge(status);
              const isDownloading = downloading && downloadingYear?.year === certificate.taxYear;
              const canDownload = status !== 'draft' || certificate.pdfUrl;

              return (
                <TableRow key={`${certificate.taxYear}-${certificate.certificateNumber}`}>
                  <TableCell className="font-medium">
                    {certificate.taxYear}/{certificate.taxYear + 1}
                  </TableCell>
                  <TableCell>
                    <span className="text-sm">IRP5</span>
                    {certificate.certificateNumber && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({certificate.certificateNumber})
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusBadge.variant} className={statusBadge.className}>
                      {statusBadge.label}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadIrp5({ staffId, year: certificate.taxYear })}
                      disabled={isDownloading || !canDownload}
                      aria-label={`Download IRP5 certificate for tax year ${certificate.taxYear}/${certificate.taxYear + 1}`}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                          Downloading...
                        </>
                      ) : (
                        <>
                          <Download className="mr-1 h-4 w-4" aria-hidden="true" />
                          Download
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Summary footer */}
        {sortedCertificates.length > 0 && (
          <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
            <p>
              {sortedCertificates.length} tax {sortedCertificates.length === 1 ? 'certificate' : 'certificates'} available
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

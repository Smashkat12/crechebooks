'use client';

/**
 * IRP5 Certificates List Component
 * TASK-PORTAL-025: Staff Portal Tax Documents
 *
 * Displays a list of IRP5 tax certificates with download functionality.
 * Supports filtering by tax year and shows certificate status.
 */

import { useState } from 'react';
import { Card, CardContent, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Download, FileText, Calendar, Clock, CheckCircle, Info, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface IRP5Document {
  id: string;
  taxYear: number;
  taxYearPeriod: string;
  status: 'available' | 'pending' | 'processing';
  availableDate: Date | string;
  referenceNumber?: string;
  lastDownloadDate?: Date | string;
}

export interface IRP5ListProps {
  documents: IRP5Document[];
  availableYears: number[];
  selectedYear?: number;
  onYearChange: (year: number | undefined) => void;
  onDownload: (id: string) => Promise<void>;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getStatusConfig = (status: IRP5Document['status']) => {
  switch (status) {
    case 'available':
      return {
        label: 'Available',
        variant: 'default' as const,
        icon: CheckCircle,
        color: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-50 dark:bg-green-900/20',
      };
    case 'pending':
      return {
        label: 'Pending',
        variant: 'secondary' as const,
        icon: Clock,
        color: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
      };
    case 'processing':
      return {
        label: 'Processing',
        variant: 'outline' as const,
        icon: Loader2,
        color: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-50 dark:bg-blue-900/20',
      };
    default:
      return {
        label: status,
        variant: 'outline' as const,
        icon: Info,
        color: 'text-gray-600',
        bgColor: 'bg-gray-50',
      };
  }
};

// ============================================================================
// IRP5 Card Component
// ============================================================================

interface IRP5CardProps {
  document: IRP5Document;
  onDownload: (id: string) => Promise<void>;
}

function IRP5Card({ document, onDownload }: IRP5CardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const statusConfig = getStatusConfig(document.status);
  const StatusIcon = statusConfig.icon;
  const isAvailable = document.status === 'available';

  const handleDownload = async () => {
    if (!isAvailable) return;
    setIsDownloading(true);
    try {
      await onDownload(document.id);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Card className={cn('transition-colors', isAvailable && 'hover:border-emerald-300')}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Document Info */}
          <div className="flex items-start gap-4">
            <div className={cn('p-3 rounded-lg', statusConfig.bgColor)}>
              <FileText className={cn('h-6 w-6', statusConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg">
                  IRP5 Tax Certificate
                </h3>
                <Badge variant={statusConfig.variant} className="gap-1">
                  <StatusIcon className={cn(
                    'h-3 w-3',
                    document.status === 'processing' && 'animate-spin'
                  )} />
                  {statusConfig.label}
                </Badge>
              </div>
              <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-1">
                Tax Year: {document.taxYearPeriod}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Available: {formatDate(document.availableDate)}
                </span>
                {document.referenceNumber && (
                  <span className="hidden sm:inline">
                    Ref: {document.referenceNumber}
                  </span>
                )}
              </div>
              {document.lastDownloadDate && (
                <p className="text-xs text-muted-foreground mt-1">
                  Last downloaded: {formatDate(document.lastDownloadDate)}
                </p>
              )}
            </div>
          </div>

          {/* Download Button */}
          <div className="flex-shrink-0">
            <Button
              onClick={handleDownload}
              disabled={!isAvailable || isDownloading}
              className={cn(
                'w-full sm:w-auto',
                isAvailable && 'bg-emerald-600 hover:bg-emerald-700'
              )}
            >
              {isDownloading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Downloading...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function IRP5List({
  documents,
  availableYears,
  selectedYear,
  onYearChange,
  onDownload,
  className,
}: IRP5ListProps) {
  const filteredDocuments = selectedYear
    ? documents.filter((doc) => doc.taxYear === selectedYear)
    : documents;

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">IRP5 Tax Certificates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Download your employee tax certificates for SARS submissions
          </p>
        </div>

        <Select
          value={selectedYear?.toString() || 'all'}
          onValueChange={(value) => {
            onYearChange(value === 'all' ? undefined : parseInt(value));
          }}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by year" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Tax Years</SelectItem>
            {availableYears.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year - 1}/{year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Info Alert */}
      <Alert className="border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20">
        <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <AlertDescription className="text-blue-800 dark:text-blue-200">
          IRP5 certificates are issued annually by your employer for income tax purposes.
          Use these certificates when filing your tax return with SARS.
        </AlertDescription>
      </Alert>

      {/* Documents List */}
      {filteredDocuments.length > 0 ? (
        <div className="space-y-4">
          {filteredDocuments.map((doc) => (
            <IRP5Card
              key={doc.id}
              document={doc}
              onDownload={onDownload}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg mb-2">No certificates found</h3>
              <p className="text-sm text-muted-foreground">
                {selectedYear
                  ? `No IRP5 certificates available for the ${selectedYear - 1}/${selectedYear} tax year.`
                  : 'No IRP5 certificates available yet.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      {filteredDocuments.length > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          Showing {filteredDocuments.length} certificate{filteredDocuments.length !== 1 ? 's' : ''}
          {selectedYear ? ` for ${selectedYear - 1}/${selectedYear}` : ''}
        </p>
      )}
    </div>
  );
}

export default IRP5List;

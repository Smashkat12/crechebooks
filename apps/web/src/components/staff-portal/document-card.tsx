'use client';

/**
 * Document Card Component
 * TASK-PORTAL-025: Staff Portal Tax Documents
 *
 * A reusable card component for displaying downloadable documents
 * with status indicators and download actions.
 */

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2, ExternalLink, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

export interface DocumentCardProps {
  id: string;
  title: string;
  description?: string;
  documentType: string;
  status: 'available' | 'pending' | 'processing' | 'unavailable';
  fileSize?: string;
  date?: Date | string;
  icon?: React.ComponentType<{ className?: string }>;
  onDownload?: (id: string) => Promise<void>;
  onView?: (id: string) => void;
  externalUrl?: string;
  className?: string;
}

// ============================================================================
// Helper Functions
// ============================================================================

const formatDate = (date: Date | string): string => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const getStatusConfig = (status: DocumentCardProps['status']) => {
  switch (status) {
    case 'available':
      return {
        label: 'Available',
        variant: 'default' as const,
        textColor: 'text-green-600 dark:text-green-400',
        bgColor: 'bg-green-100 dark:bg-green-900/30',
      };
    case 'pending':
      return {
        label: 'Pending',
        variant: 'secondary' as const,
        textColor: 'text-yellow-600 dark:text-yellow-400',
        bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
      };
    case 'processing':
      return {
        label: 'Processing',
        variant: 'outline' as const,
        textColor: 'text-blue-600 dark:text-blue-400',
        bgColor: 'bg-blue-100 dark:bg-blue-900/30',
      };
    case 'unavailable':
      return {
        label: 'Unavailable',
        variant: 'destructive' as const,
        textColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-100 dark:bg-red-900/30',
      };
    default:
      return {
        label: status,
        variant: 'outline' as const,
        textColor: 'text-gray-600',
        bgColor: 'bg-gray-100',
      };
  }
};

// ============================================================================
// Main Component
// ============================================================================

export function DocumentCard({
  id,
  title,
  description,
  documentType,
  status,
  fileSize,
  date,
  icon: Icon = FileText,
  onDownload,
  onView,
  externalUrl,
  className,
}: DocumentCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const statusConfig = getStatusConfig(status);
  const isAvailable = status === 'available';

  const handleDownload = async () => {
    if (!isAvailable || !onDownload) return;
    setIsDownloading(true);
    try {
      await onDownload(id);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleView = () => {
    if (onView) {
      onView(id);
    } else if (externalUrl) {
      window.open(externalUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <Card className={cn(
      'transition-all duration-200',
      isAvailable && 'hover:shadow-md hover:border-emerald-200 dark:hover:border-emerald-800',
      !isAvailable && 'opacity-75',
      className
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className={cn(
            'p-2.5 rounded-lg flex-shrink-0',
            statusConfig.bgColor
          )}>
            <Icon className={cn('h-5 w-5', statusConfig.textColor)} />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-medium text-sm sm:text-base line-clamp-1">
                  {title}
                </h4>
                {description && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {description}
                  </p>
                )}
              </div>
              <Badge variant={statusConfig.variant} className="flex-shrink-0 text-xs">
                {statusConfig.label}
              </Badge>
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {documentType}
              </span>
              {fileSize && (
                <span className="hidden sm:inline">•</span>
              )}
              {fileSize && (
                <span>{fileSize}</span>
              )}
              {date && (
                <span className="hidden sm:inline">•</span>
              )}
              {date && (
                <span>{formatDate(date)}</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 mt-3">
              {onDownload && (
                <Button
                  size="sm"
                  variant={isAvailable ? 'default' : 'outline'}
                  onClick={handleDownload}
                  disabled={!isAvailable || isDownloading}
                  className={cn(
                    'h-8 text-xs',
                    isAvailable && 'bg-emerald-600 hover:bg-emerald-700'
                  )}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-3.5 w-3.5 mr-1.5" />
                      Download
                    </>
                  )}
                </Button>
              )}

              {(onView || externalUrl) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleView}
                  disabled={!isAvailable}
                  className="h-8 text-xs"
                >
                  {externalUrl ? (
                    <>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                      Open
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5 mr-1.5" />
                      View
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default DocumentCard;

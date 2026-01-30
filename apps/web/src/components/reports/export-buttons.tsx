'use client';

/**
 * Export Buttons Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/export-buttons
 * @description Export buttons with AI toggle checkbox for PDF exports.
 *
 * CRITICAL RULES:
 * - AI insights only available for PDF format
 * - Show loading state during export
 * - Proper error handling via toast
 */

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2, Table2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

interface ExportButtonsProps {
  /** Callback when export is triggered */
  onExport: (format: ExportFormat, includeInsights: boolean) => Promise<void>;
  /** Whether export is disabled */
  disabled?: boolean;
  /** Whether AI insights are available */
  hasInsights?: boolean;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Export buttons with dropdown menu and AI toggle.
 *
 * @example
 * <ExportButtons
 *   onExport={handleExport}
 *   hasInsights={!!aiInsights}
 * />
 */
export function ExportButtons({
  onExport,
  disabled = false,
  hasInsights = false,
  className,
}: ExportButtonsProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [includeAI, setIncludeAI] = useState(true);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      // Only include AI insights for PDF format
      const shouldIncludeInsights = format === 'pdf' && includeAI && hasInsights;
      await onExport(format, shouldIncludeInsights);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* AI Toggle - Only show when insights are available */}
      {hasInsights && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-ai"
            checked={includeAI}
            onCheckedChange={(checked) => setIncludeAI(checked === true)}
            disabled={disabled || !!exporting}
          />
          <Label
            htmlFor="include-ai"
            className="text-sm cursor-pointer select-none"
          >
            Include AI insights
          </Label>
        </div>
      )}

      {/* Export Dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled || !!exporting}
            className={className}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Download className="h-4 w-4 mr-2" aria-hidden="true" />
            )}
            Export
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => handleExport('pdf')}
            disabled={!!exporting}
          >
            <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
            <span>
              PDF Report
              {includeAI && hasInsights && (
                <span className="text-muted-foreground ml-1">(with AI)</span>
              )}
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => handleExport('xlsx')}
            disabled={!!exporting}
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" aria-hidden="true" />
            Excel Spreadsheet
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleExport('csv')}
            disabled={!!exporting}
          >
            <Table2 className="h-4 w-4 mr-2" aria-hidden="true" />
            CSV Data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

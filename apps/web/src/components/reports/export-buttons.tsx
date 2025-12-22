'use client';

import { useState } from 'react';
import { Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type ExportFormat = 'pdf' | 'csv' | 'xlsx';

interface ExportButtonsProps {
  onExport: (format: ExportFormat) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ExportButtons({ onExport, disabled = false, className }: ExportButtonsProps) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await onExport(format);
    } finally {
      setExporting(null);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || !!exporting} className={className}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={!!exporting}>
          <FileText className="h-4 w-4 mr-2" />
          Export as PDF
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('csv')} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport('xlsx')} disabled={!!exporting}>
          <FileSpreadsheet className="h-4 w-4 mr-2" />
          Export as Excel
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

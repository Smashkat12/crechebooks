'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { ReportType } from '@crechebooks/types';

interface ExportDialogProps {
  reportType: ReportType;
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: 'pdf' | 'csv') => void;
  isExporting: boolean;
}

const REPORT_NAMES: Record<ReportType, string> = {
  [ReportType.INCOME_STATEMENT]: 'Income Statement',
  [ReportType.BALANCE_SHEET]: 'Balance Sheet',
  [ReportType.VAT_REPORT]: 'VAT Report',
  [ReportType.CASH_FLOW]: 'Cash Flow',
  [ReportType.AGED_RECEIVABLES]: 'Aged Receivables',
  [ReportType.AGED_PAYABLES]: 'Aged Payables',
};

export function ExportDialog({
  reportType,
  isOpen,
  onClose,
  onExport,
  isExporting,
}: ExportDialogProps) {
  const [format, setFormat] = useState<'pdf' | 'csv'>('pdf');

  const reportName = REPORT_NAMES[reportType] || 'Report';

  const handleExport = () => {
    onExport(format);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export {reportName}</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <Label>Select Format</Label>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={format === 'pdf' ? 'default' : 'outline'}
              onClick={() => setFormat('pdf')}
              className="flex flex-col items-center gap-2 h-auto py-4"
              disabled={isExporting}
            >
              <FileText className="h-8 w-8" />
              <span>PDF Document</span>
              <span className="text-xs text-muted-foreground">
                Best for printing
              </span>
            </Button>

            <Button
              variant={format === 'csv' ? 'default' : 'outline'}
              onClick={() => setFormat('csv')}
              className="flex flex-col items-center gap-2 h-auto py-4"
              disabled={isExporting}
            >
              <FileSpreadsheet className="h-8 w-8" />
              <span>CSV Spreadsheet</span>
              <span className="text-xs text-muted-foreground">
                Best for analysis
              </span>
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              `Download ${format.toUpperCase()}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

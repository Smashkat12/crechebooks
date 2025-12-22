'use client';

import { useState } from 'react';
import { Download, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: 'vat201' | 'emp201';
  period: string;
  onExport: () => void;
  isExporting?: boolean;
  hasWarnings?: boolean;
}

export function ExportDialog({
  open,
  onOpenChange,
  type,
  period,
  onExport,
  isExporting = false,
  hasWarnings = false,
}: ExportDialogProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleExport = () => {
    onExport();
    setAcknowledged(false);
    setConfirmed(false);
  };

  const formatPeriod = (p: string) => {
    const [year, month] = p.split('-');
    const monthName = new Date(parseInt(year), parseInt(month) - 1).toLocaleString('en-ZA', {
      month: 'long',
    });
    return `${monthName} ${year}`;
  };

  const formattedType = type === 'vat201' ? 'VAT201' : 'EMP201';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Export {formattedType} Return
          </DialogTitle>
          <DialogDescription>
            Export {formattedType} for {formatPeriod(period)} for submission to SARS eFiling.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {hasWarnings && (
            <Alert variant="default" className="border-yellow-500 bg-yellow-50">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-700">
                There are validation warnings. Please review before exporting.
              </AlertDescription>
            </Alert>
          )}

          <div className="p-4 rounded-lg bg-muted space-y-2">
            <h4 className="font-medium">Export Details</h4>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>Form: {formattedType}</p>
              <p>Period: {formatPeriod(period)}</p>
              <p>Format: CSV (SARS eFiling compatible)</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="acknowledge"
                checked={acknowledged}
                onCheckedChange={(checked) => setAcknowledged(checked === true)}
              />
              <Label htmlFor="acknowledge" className="text-sm leading-tight cursor-pointer">
                I have reviewed all values and confirm they are accurate
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="confirm"
                checked={confirmed}
                onCheckedChange={(checked) => setConfirmed(checked === true)}
              />
              <Label htmlFor="confirm" className="text-sm leading-tight cursor-pointer">
                I understand that this export is for my records and must be manually submitted to
                SARS eFiling
              </Label>
            </div>
          </div>

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              This export generates a file for your records. You must log into SARS eFiling to
              submit the actual return.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isExporting}>
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={!acknowledged || !confirmed || isExporting}
          >
            <Download className="mr-2 h-4 w-4" />
            {isExporting ? 'Exporting...' : 'Export File'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';
import type { IVAT201 } from '@crechebooks/types';

interface VatReportProps {
  data: IVAT201;
  period: {
    start: Date;
    end: Date;
  };
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

export function VatReport({ data, period, tenantName, onExport }: VatReportProps) {
  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  const isRefund = data.netVat < 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1">
          <ReportHeader
            title="VAT Report (VAT201)"
            tenantName={tenantName}
            periodStart={period.start}
            periodEnd={period.end}
          />
        </div>
        {onExport && <ExportButtons onExport={handleExport} />}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Output VAT Section */}
        <div>
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            Output VAT
            <Badge variant="outline" className="font-normal">VAT you charged</Badge>
          </h3>
          <div className="space-y-3 pl-4 border-l-2 border-primary">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Standard Rated Supplies (15%)</p>
                <p className="text-sm text-muted-foreground">Taxable sales at standard rate</p>
              </div>
              <div className="text-right">
                <p className="font-mono">{formatCurrency(data.standardRatedSupplies / 100)}</p>
                <p className="text-sm text-muted-foreground font-mono">
                  VAT: {formatCurrency(data.outputVat / 100)}
                </p>
              </div>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Zero Rated Supplies (0%)</p>
                <p className="text-sm text-muted-foreground">Exports and specific supplies</p>
              </div>
              <div className="text-right">
                <p className="font-mono">{formatCurrency(data.zeroRatedSupplies / 100)}</p>
                <p className="text-sm text-muted-foreground font-mono">VAT: R 0.00</p>
              </div>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Exempt Supplies</p>
                <p className="text-sm text-muted-foreground">Non-taxable supplies</p>
              </div>
              <div className="text-right">
                <p className="font-mono">{formatCurrency(data.exemptSupplies / 100)}</p>
                <p className="text-sm text-muted-foreground font-mono">VAT: N/A</p>
              </div>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between font-semibold">
            <span>Total Output VAT</span>
            <span className="font-mono text-red-600">
              {formatCurrency(data.outputVat / 100)}
            </span>
          </div>
        </div>

        {/* Input VAT Section */}
        <div>
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            Input VAT
            <Badge variant="outline" className="font-normal">VAT you paid</Badge>
          </h3>
          <div className="space-y-3 pl-4 border-l-2 border-green-500">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium">Standard Rated Acquisitions</p>
                <p className="text-sm text-muted-foreground">Purchases at standard rate</p>
              </div>
              <div className="text-right">
                <p className="font-mono">{formatCurrency(data.standardRatedAcquisitions / 100)}</p>
                <p className="text-sm text-muted-foreground font-mono">
                  VAT: {formatCurrency(data.inputVat / 100)}
                </p>
              </div>
            </div>
          </div>
          <Separator className="my-3" />
          <div className="flex justify-between font-semibold">
            <span>Total Input VAT</span>
            <span className="font-mono text-green-600">
              ({formatCurrency(data.inputVat / 100)})
            </span>
          </div>
        </div>

        {/* Net VAT */}
        <div className={`rounded-lg p-4 ${isRefund ? 'bg-green-50 dark:bg-green-900/20' : 'bg-primary/5'}`}>
          <div className="flex justify-between items-center">
            <div>
              <span className="text-lg font-semibold">
                {isRefund ? 'VAT Refund Due' : 'VAT Payable to SARS'}
              </span>
              <p className="text-sm text-muted-foreground">
                Output VAT ({formatCurrency(data.outputVat / 100)}) - Input VAT ({formatCurrency(data.inputVat / 100)})
              </p>
            </div>
            <span
              className={`text-2xl font-bold font-mono ${
                isRefund ? 'text-green-600' : 'text-primary'
              }`}
            >
              {formatCurrency(Math.abs(data.netVat) / 100)}
            </span>
          </div>
        </div>

        {/* Tax Period */}
        <div className="text-sm text-muted-foreground border-t pt-4">
          <p>
            <strong>Tax Period:</strong> {data.taxPeriod}
          </p>
          <p className="mt-2">
            This report is prepared for VAT201 submission purposes. Please verify all amounts
            before submitting to SARS. VAT is calculated at the standard rate of 15%.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

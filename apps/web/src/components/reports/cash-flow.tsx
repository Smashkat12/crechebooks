'use client';

/**
 * Cash Flow Report Component
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @module components/reports/cash-flow
 * @description UI component for displaying cash flow statement data.
 * Shows operating, investing, and financing activities with color-coded net cash flow.
 *
 * CRITICAL: All amounts are in cents - divide by 100 for display.
 */

import { Activity, TrendingUp, TrendingDown, Building2, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';

/**
 * Cash flow activity line item.
 */
interface CashFlowLineItem {
  name: string;
  amountCents: number;
  description?: string;
}

/**
 * Cash flow statement data structure.
 */
interface CashFlowData {
  period: {
    start: Date | string;
    end: Date | string;
  };
  operating: {
    netProfit: number;
    adjustments: number;
    workingCapital: number;
    total: number;
    details: CashFlowLineItem[];
  };
  investing: {
    total: number;
    items: CashFlowLineItem[];
  };
  financing: {
    total: number;
    items: CashFlowLineItem[];
  };
  netCashFlow: number;
  openingBalance: number;
  closingBalance: number;
  cashReconciles?: boolean;
}

interface CashFlowReportProps {
  data: CashFlowData;
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

/**
 * Individual cash flow line component.
 */
function CashFlowLine({
  label,
  amount,
  bold = false,
  indent = false,
  description,
}: {
  label: string;
  amount: number;
  bold?: boolean;
  indent?: boolean;
  description?: string;
}) {
  return (
    <div className={cn('flex justify-between py-1', indent && 'pl-4')}>
      <div className="flex flex-col">
        <span className={cn('text-sm', bold && 'font-semibold')}>{label}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
      <span
        className={cn(
          'font-mono text-sm',
          bold && 'font-semibold',
          amount >= 0 ? 'text-foreground' : 'text-red-600'
        )}
      >
        {amount < 0 && '('}
        {formatCurrency(Math.abs(amount) / 100)}
        {amount < 0 && ')'}
      </span>
    </div>
  );
}

/**
 * Cash Flow Report Component.
 * Displays cash flow statement using the indirect method.
 */
export function CashFlowReport({ data, tenantName, onExport }: CashFlowReportProps) {
  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  const periodStart = typeof data.period.start === 'string'
    ? new Date(data.period.start)
    : data.period.start;
  const periodEnd = typeof data.period.end === 'string'
    ? new Date(data.period.end)
    : data.period.end;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex-1">
            <ReportHeader
              title="Cash Flow Statement"
              tenantName={tenantName}
              periodStart={periodStart}
              periodEnd={periodEnd}
            />
          </div>
          {onExport && <ExportButtons onExport={handleExport} />}
        </CardHeader>
      </Card>

      {/* Opening Balance */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Opening Cash Balance</span>
            </div>
            <span className="text-lg font-semibold font-mono">
              {formatCurrency(data.openingBalance / 100)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Operating Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-600" />
            Operating Activities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <CashFlowLine label="Net Profit" amount={data.operating.netProfit} />

          <div className="text-xs text-muted-foreground mt-2 mb-1">Adjustments:</div>
          <CashFlowLine
            label="Non-cash Adjustments"
            amount={data.operating.adjustments}
            indent
          />
          <CashFlowLine
            label="Working Capital Changes"
            amount={data.operating.workingCapital}
            indent
          />

          {data.operating.details.length > 0 && (
            <>
              <div className="text-xs text-muted-foreground mt-2 mb-1">Details:</div>
              {data.operating.details.map((item, index) => (
                <CashFlowLine
                  key={index}
                  label={item.name}
                  amount={item.amountCents}
                  indent
                  description={item.description}
                />
              ))}
            </>
          )}

          <Separator className="my-2" />
          <CashFlowLine
            label="Net Cash from Operating Activities"
            amount={data.operating.total}
            bold
          />
        </CardContent>
      </Card>

      {/* Investing Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-purple-600" />
            Investing Activities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.investing.items.length > 0 ? (
            data.investing.items.map((item, index) => (
              <CashFlowLine key={index} label={item.name} amount={item.amountCents} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No investing activities for this period
            </p>
          )}

          <Separator className="my-2" />
          <CashFlowLine
            label="Net Cash from Investing Activities"
            amount={data.investing.total}
            bold
          />
        </CardContent>
      </Card>

      {/* Financing Activities */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-orange-600" />
            Financing Activities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.financing.items.length > 0 ? (
            data.financing.items.map((item, index) => (
              <CashFlowLine key={index} label={item.name} amount={item.amountCents} />
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No financing activities for this period
            </p>
          )}

          <Separator className="my-2" />
          <CashFlowLine
            label="Net Cash from Financing Activities"
            amount={data.financing.total}
            bold
          />
        </CardContent>
      </Card>

      {/* Net Cash Flow */}
      <Card
        className={cn(
          'border-2',
          data.netCashFlow >= 0 ? 'border-green-500' : 'border-red-500'
        )}
      >
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              {data.netCashFlow >= 0 ? (
                <TrendingUp className="h-6 w-6 text-green-600" />
              ) : (
                <TrendingDown className="h-6 w-6 text-red-600" />
              )}
              <span className="font-medium">Net Cash Flow</span>
            </div>
            <span
              className={cn(
                'text-2xl font-bold font-mono',
                data.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {data.netCashFlow < 0 && '('}
              {formatCurrency(Math.abs(data.netCashFlow) / 100)}
              {data.netCashFlow < 0 && ')'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Closing Balance */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Closing Cash Balance</span>
            </div>
            <span className="text-xl font-bold font-mono">
              {formatCurrency(data.closingBalance / 100)}
            </span>
          </div>
          {data.cashReconciles !== undefined && (
            <div className="mt-2 text-xs text-muted-foreground text-right">
              {data.cashReconciles ? (
                <span className="text-green-600">Cash reconciled</span>
              ) : (
                <span className="text-yellow-600">Reconciliation difference detected</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Statistics */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Operating</p>
            <p
              className={cn(
                'text-lg font-bold font-mono',
                data.operating.total >= 0 ? 'text-blue-600' : 'text-red-600'
              )}
            >
              {formatCurrency(data.operating.total / 100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Investing</p>
            <p
              className={cn(
                'text-lg font-bold font-mono',
                data.investing.total >= 0 ? 'text-purple-600' : 'text-red-600'
              )}
            >
              {formatCurrency(data.investing.total / 100)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Financing</p>
            <p
              className={cn(
                'text-lg font-bold font-mono',
                data.financing.total >= 0 ? 'text-orange-600' : 'text-red-600'
              )}
            >
              {formatCurrency(data.financing.total / 100)}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

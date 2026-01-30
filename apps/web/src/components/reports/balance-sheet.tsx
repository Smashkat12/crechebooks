'use client';

/**
 * Balance Sheet Report Component
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @module components/reports/balance-sheet
 * @description UI component for displaying balance sheet data.
 * Shows assets, liabilities, equity with balance check indicator.
 *
 * CRITICAL: All amounts are in cents - divide by 100 for display.
 */

import { CheckCircle, AlertTriangle, Building, CreditCard, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';

/**
 * Account breakdown item.
 */
interface AccountBreakdown {
  accountCode: string;
  accountName: string;
  amountCents: number;
  amountRands: number;
}

/**
 * Balance sheet data structure.
 */
interface BalanceSheetData {
  asOfDate: Date | string;
  assets: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  liabilities: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  equity: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  isBalanced: boolean;
}

interface BalanceSheetReportProps {
  data: BalanceSheetData;
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

/**
 * Account line item component.
 */
function AccountLine({ account }: { account: AccountBreakdown }) {
  return (
    <div className="flex justify-between py-1">
      <div className="flex gap-4">
        <span className="font-mono text-sm text-muted-foreground w-16">
          {account.accountCode}
        </span>
        <span className="text-sm">{account.accountName}</span>
      </div>
      <span className="font-mono text-sm">
        {formatCurrency(account.amountCents / 100)}
      </span>
    </div>
  );
}

/**
 * Balance Sheet Report Component.
 * Displays assets, liabilities, and equity with balance verification.
 */
export function BalanceSheetReport({
  data,
  tenantName,
  onExport,
}: BalanceSheetReportProps) {
  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  const asOfDate =
    typeof data.asOfDate === 'string' ? new Date(data.asOfDate) : data.asOfDate;

  // Calculate liabilities + equity for comparison
  const liabilitiesAndEquityCents = data.liabilities.totalCents + data.equity.totalCents;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div className="flex-1">
            <ReportHeader
              title="Balance Sheet"
              tenantName={tenantName}
              periodStart={asOfDate}
              periodEnd={asOfDate}
            />
          </div>
          {onExport && <ExportButtons onExport={handleExport} />}
        </CardHeader>
      </Card>

      {/* Balance Check Alert */}
      <Alert variant={data.isBalanced ? 'default' : 'destructive'}>
        {data.isBalanced ? (
          <>
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Balanced</AlertTitle>
            <AlertDescription>
              Assets = Liabilities + Equity (
              {formatCurrency(data.assets.totalCents / 100)})
            </AlertDescription>
          </>
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Out of Balance</AlertTitle>
            <AlertDescription>
              Assets ({formatCurrency(data.assets.totalCents / 100)}) does not equal
              Liabilities + Equity ({formatCurrency(liabilitiesAndEquityCents / 100)}).
              Please review the accounts.
            </AlertDescription>
          </>
        )}
      </Alert>

      {/* Assets Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-700">
            <Building className="h-5 w-5" />
            Assets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Assets */}
          {data.assets.current.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Current Assets
              </h4>
              <div className="space-y-1">
                {data.assets.current.map((asset) => (
                  <AccountLine key={asset.accountCode} account={asset} />
                ))}
              </div>
            </div>
          )}

          {/* Non-Current Assets */}
          {data.assets.nonCurrent.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Non-Current Assets
              </h4>
              <div className="space-y-1">
                {data.assets.nonCurrent.map((asset) => (
                  <AccountLine key={asset.accountCode} account={asset} />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {data.assets.current.length === 0 && data.assets.nonCurrent.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No assets recorded
            </p>
          )}

          <Separator />

          {/* Total Assets */}
          <div className="flex justify-between font-semibold text-green-700">
            <span>Total Assets</span>
            <span className="font-mono">{formatCurrency(data.assets.totalRands)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Liabilities Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <CreditCard className="h-5 w-5" />
            Liabilities
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Liabilities */}
          {data.liabilities.current.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Current Liabilities
              </h4>
              <div className="space-y-1">
                {data.liabilities.current.map((liability) => (
                  <AccountLine key={liability.accountCode} account={liability} />
                ))}
              </div>
            </div>
          )}

          {/* Non-Current Liabilities */}
          {data.liabilities.nonCurrent.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">
                Non-Current Liabilities
              </h4>
              <div className="space-y-1">
                {data.liabilities.nonCurrent.map((liability) => (
                  <AccountLine key={liability.accountCode} account={liability} />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {data.liabilities.current.length === 0 &&
            data.liabilities.nonCurrent.length === 0 && (
              <p className="text-sm text-muted-foreground italic">
                No liabilities recorded
              </p>
            )}

          <Separator />

          {/* Total Liabilities */}
          <div className="flex justify-between font-semibold text-red-700">
            <span>Total Liabilities</span>
            <span className="font-mono">
              {formatCurrency(data.liabilities.totalRands)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Equity Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-700">
            <Users className="h-5 w-5" />
            Equity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.equity.breakdown.length > 0 ? (
            <div className="space-y-1">
              {data.equity.breakdown.map((equity) => (
                <AccountLine key={equity.accountCode} account={equity} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No equity accounts recorded
            </p>
          )}

          <Separator />

          {/* Total Equity */}
          <div className="flex justify-between font-semibold text-blue-700">
            <span>Total Equity</span>
            <span className="font-mono">{formatCurrency(data.equity.totalRands)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-green-50 dark:bg-green-900/20">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Assets</p>
            <p className="text-xl font-bold font-mono text-green-700">
              {formatCurrency(data.assets.totalRands)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-red-50 dark:bg-red-900/20">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Liabilities</p>
            <p className="text-xl font-bold font-mono text-red-700">
              {formatCurrency(data.liabilities.totalRands)}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 dark:bg-blue-900/20">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">Total Equity</p>
            <p className="text-xl font-bold font-mono text-blue-700">
              {formatCurrency(data.equity.totalRands)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Balance Equation */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-4 text-sm">
            <div className="text-center">
              <p className="text-muted-foreground">Assets</p>
              <p className="font-bold font-mono text-green-700">
                {formatCurrency(data.assets.totalRands)}
              </p>
            </div>
            <span className="text-2xl">=</span>
            <div className="text-center">
              <p className="text-muted-foreground">Liabilities</p>
              <p className="font-bold font-mono text-red-700">
                {formatCurrency(data.liabilities.totalRands)}
              </p>
            </div>
            <span className="text-2xl">+</span>
            <div className="text-center">
              <p className="text-muted-foreground">Equity</p>
              <p className="font-bold font-mono text-blue-700">
                {formatCurrency(data.equity.totalRands)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

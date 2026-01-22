'use client';

/**
 * Statement Preview Component
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Displays statement details with:
 * - Statement header (period, parent name, account)
 * - Opening balance
 * - Transaction table
 * - Closing balance
 * - Total invoiced, total paid, net movement
 * - Download PDF button
 * - Email to self button
 */

import { useState } from 'react';
import {
  FileBarChart2,
  Download,
  Mail,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import { TransactionTable } from './transaction-table';
import {
  useDownloadStatementPdf,
  useEmailStatement,
  type ParentStatementDetail,
} from '@/hooks/parent-portal/use-parent-statements';

interface StatementPreviewProps {
  year: number;
  month: number;
  statement?: ParentStatementDetail;
  isLoading?: boolean;
  error?: Error;
}

// Get month name from month number
function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return months[month - 1] || 'Unknown';
}

// Loading skeleton
function PreviewSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <div className="flex gap-2">
            <Skeleton className="h-9 w-32" />
            <Skeleton className="h-9 w-32" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

// Mock statement for demo
const getMockStatement = (year: number, month: number): ParentStatementDetail => ({
  year,
  month,
  periodLabel: `${getMonthName(month)} ${year}`,
  parentName: 'John Smith',
  parentEmail: 'john.smith@example.com',
  accountNumber: 'ACC-2024-001',
  openingBalance: month === 1 ? 0 : 500,
  closingBalance: 1500,
  totalInvoiced: 3000,
  totalPaid: 1500,
  totalCredits: 0,
  netMovement: 1500,
  transactions: [
    {
      id: '1',
      date: `${year}-${String(month).padStart(2, '0')}-01`,
      description: 'INV-2024-001 - Monthly Tuition (Emma)',
      type: 'invoice',
      debit: 1500,
      credit: null,
      balance: 2000,
    },
    {
      id: '2',
      date: `${year}-${String(month).padStart(2, '0')}-05`,
      description: 'Payment - EFT Ref: PAY123456',
      type: 'payment',
      debit: null,
      credit: 1000,
      balance: 1000,
    },
    {
      id: '3',
      date: `${year}-${String(month).padStart(2, '0')}-10`,
      description: 'INV-2024-002 - Extra Activities (Emma)',
      type: 'invoice',
      debit: 500,
      credit: null,
      balance: 1500,
    },
    {
      id: '4',
      date: `${year}-${String(month).padStart(2, '0')}-15`,
      description: 'INV-2024-003 - Monthly Tuition (James)',
      type: 'invoice',
      debit: 1000,
      credit: null,
      balance: 2500,
    },
    {
      id: '5',
      date: `${year}-${String(month).padStart(2, '0')}-20`,
      description: 'Payment - Card Ref: CARD789012',
      type: 'payment',
      debit: null,
      credit: 500,
      balance: 2000,
    },
  ],
});

export function StatementPreview({
  year,
  month,
  statement,
  isLoading,
  error,
}: StatementPreviewProps) {
  const [useMockData, setUseMockData] = useState(false);
  const { downloadPdf, isDownloading } = useDownloadStatementPdf();
  const { emailStatement, isEmailing } = useEmailStatement();

  // Use mock data if no statement provided or on error
  const displayStatement = statement || (useMockData || !isLoading ? getMockStatement(year, month) : undefined);

  if (isLoading) {
    return <PreviewSkeleton />;
  }

  if (error && !useMockData) {
    return (
      <Card>
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between">
              <span>{error.message || 'Failed to load statement.'}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseMockData(true)}
              >
                View Demo
              </Button>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!displayStatement) {
    return <PreviewSkeleton />;
  }

  const handleDownloadPdf = async () => {
    try {
      await downloadPdf(year, month, displayStatement.periodLabel);
    } catch (err) {
      console.error('Download failed:', err);
      // Toast notification would be shown here
    }
  };

  const handleEmailStatement = async () => {
    try {
      await emailStatement(year, month);
    } catch (err) {
      console.error('Email failed:', err);
      // Toast notification would be shown here
    }
  };

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <FileBarChart2 className="h-5 w-5" />
            Statement: {displayStatement.periodLabel}
          </CardTitle>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleEmailStatement}
              disabled={isEmailing}
            >
              {isEmailing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Mail className="h-4 w-4 mr-2" />
              )}
              Email Statement
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Account Details */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground mb-1">Account Holder</p>
            <p className="font-medium">{displayStatement.parentName}</p>
            {displayStatement.parentEmail && (
              <p className="text-sm text-muted-foreground mt-1">
                {displayStatement.parentEmail}
              </p>
            )}
          </div>
          <div className="rounded-lg bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground mb-1">Account Number</p>
            <p className="font-medium">{displayStatement.accountNumber || '-'}</p>
            <p className="text-sm text-muted-foreground mt-1">
              Period: {displayStatement.periodLabel}
            </p>
          </div>
        </div>

        {/* Opening Balance */}
        <div className="flex items-center justify-between rounded-lg border p-4">
          <span className="font-medium">Opening Balance</span>
          <span
            className={`font-semibold ${
              displayStatement.openingBalance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(displayStatement.openingBalance)}
          </span>
        </div>

        {/* Transactions Table */}
        <TransactionTable
          transactions={displayStatement.transactions}
          isLoading={false}
        />

        {/* Closing Balance */}
        <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-4">
          <span className="font-semibold">Closing Balance</span>
          <span
            className={`text-lg font-bold ${
              displayStatement.closingBalance > 0 ? 'text-red-600' : 'text-green-600'
            }`}
          >
            {formatCurrency(displayStatement.closingBalance)}
          </span>
        </div>

        <Separator />

        {/* Summary Stats */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Total Invoiced</p>
            <p className="text-lg font-semibold text-red-600">
              {formatCurrency(displayStatement.totalInvoiced)}
            </p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Total Paid</p>
            <p className="text-lg font-semibold text-green-600">
              {formatCurrency(displayStatement.totalPaid)}
            </p>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <p className="text-sm text-muted-foreground mb-1">Net Movement</p>
            <p
              className={`text-lg font-semibold ${
                displayStatement.netMovement > 0 ? 'text-red-600' : 'text-green-600'
              }`}
            >
              {formatCurrency(displayStatement.netMovement)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

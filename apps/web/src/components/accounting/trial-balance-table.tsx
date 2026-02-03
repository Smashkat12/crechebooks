'use client';

/**
 * TASK-ACCT-UI-001: Trial Balance Table Component
 * Displays the trial balance with debits and credits.
 */

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { TrialBalanceEntry, TrialBalanceResponse } from '@/hooks/use-accounts';

interface TrialBalanceTableProps {
  trialBalance: TrialBalanceResponse;
}

/**
 * Format amount in ZAR (South African Rand)
 * Values are in cents, convert to Rand for display
 */
function formatZAR(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rands);
}

export function TrialBalanceTable({ trialBalance }: TrialBalanceTableProps) {
  const { entries, totalDebits, totalCredits, isBalanced } = trialBalance;

  // Group entries by account type for organized display
  const assetEntries = entries.filter((e) => e.accountType === 'ASSET');
  const liabilityEntries = entries.filter((e) => e.accountType === 'LIABILITY');
  const equityEntries = entries.filter((e) => e.accountType === 'EQUITY');
  const revenueEntries = entries.filter((e) => e.accountType === 'REVENUE');
  const expenseEntries = entries.filter((e) => e.accountType === 'EXPENSE');

  const renderSection = (title: string, sectionEntries: TrialBalanceEntry[]) => {
    if (sectionEntries.length === 0) return null;

    return (
      <>
        <TableRow className="bg-muted/50">
          <TableCell colSpan={4} className="font-semibold">
            {title}
          </TableCell>
        </TableRow>
        {sectionEntries.map((entry) => (
          <TableRow key={entry.accountId}>
            <TableCell className="font-mono">{entry.accountCode}</TableCell>
            <TableCell>{entry.accountName}</TableCell>
            <TableCell className="text-right tabular-nums">
              {entry.debitBalance > 0 ? formatZAR(entry.debitBalance) : '-'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {entry.creditBalance > 0 ? formatZAR(entry.creditBalance) : '-'}
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge variant={isBalanced ? 'success' : 'destructive'}>
          {isBalanced ? 'Balanced' : 'Out of Balance'}
        </Badge>
        {!isBalanced && (
          <span className="text-sm text-destructive">
            Difference: {formatZAR(Math.abs(totalDebits - totalCredits))}
          </span>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Code</TableHead>
              <TableHead>Account Name</TableHead>
              <TableHead className="text-right w-[150px]">Debit</TableHead>
              <TableHead className="text-right w-[150px]">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {renderSection('Assets', assetEntries)}
            {renderSection('Liabilities', liabilityEntries)}
            {renderSection('Equity', equityEntries)}
            {renderSection('Revenue', revenueEntries)}
            {renderSection('Expenses', expenseEntries)}
            {entries.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                  No accounts with balances found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          <TableFooter>
            <TableRow className="font-bold">
              <TableCell colSpan={2}>Totals</TableCell>
              <TableCell className="text-right tabular-nums">{formatZAR(totalDebits)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatZAR(totalCredits)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

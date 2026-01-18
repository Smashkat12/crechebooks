'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  ArrowRightLeft,
  Filter,
  Link2,
  Link2Off,
  Loader2,
  Coins,
  Scissors,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { useUnmatch, type BankStatementMatch, type BankStatementReconciliationResult, type AvailableTransaction } from '@/hooks/use-reconciliation';
import { ManualMatchDialog } from './manual-match-dialog';
import { XeroSplitDialog } from './xero-split-dialog';

/** State for split dialog when opened from manual match */
interface SplitFromManualMatchState {
  matchId: string;
  xeroTransaction: AvailableTransaction;
  bankTransaction: {
    date: string;
    description: string;
    amount: number;
    isCredit: boolean;
  };
}

type MatchStatus = BankStatementMatch['status'] | 'all';

interface BankStatementMatchResultsProps {
  result: BankStatementReconciliationResult;
  onRefresh?: () => void;
  onClose?: () => void;
}

const statusConfig: Record<BankStatementMatch['status'], { label: string; icon: React.ReactNode; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  MATCHED: {
    label: 'Matched',
    icon: <CheckCircle2 className="h-4 w-4 text-green-600" />,
    variant: 'default',
  },
  IN_BANK_ONLY: {
    label: 'Bank Only',
    icon: <XCircle className="h-4 w-4 text-orange-500" />,
    variant: 'secondary',
  },
  IN_XERO_ONLY: {
    label: 'Xero Only',
    icon: <XCircle className="h-4 w-4 text-blue-500" />,
    variant: 'secondary',
  },
  AMOUNT_MISMATCH: {
    label: 'Amount Mismatch',
    icon: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
    variant: 'outline',
  },
  DATE_MISMATCH: {
    label: 'Date Mismatch',
    icon: <Calendar className="h-4 w-4 text-yellow-500" />,
    variant: 'outline',
  },
  FEE_ADJUSTED_MATCH: {
    label: 'Fee Adjusted',
    icon: <Coins className="h-4 w-4 text-purple-600" />,
    variant: 'default',
  },
};

export function BankStatementMatchResults({
  result,
  onRefresh,
  onClose,
}: BankStatementMatchResultsProps) {
  const [filter, setFilter] = useState<MatchStatus>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [matchDialogOpen, setMatchDialogOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<BankStatementMatch | null>(null);
  const [unmatchingId, setUnmatchingId] = useState<string | null>(null);
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [selectedSplitMatch, setSelectedSplitMatch] = useState<BankStatementMatch | null>(null);
  const [splitFromManualMatch, setSplitFromManualMatch] = useState<SplitFromManualMatchState | null>(null);

  const unmatch = useUnmatch();

  const handleOpenSplitDialog = (match: BankStatementMatch) => {
    setSelectedSplitMatch(match);
    setSplitDialogOpen(true);
  };

  const handleOpenMatchDialog = (match: BankStatementMatch) => {
    setSelectedMatch(match);
    setMatchDialogOpen(true);
  };

  const handleUnmatch = async (matchId: string) => {
    setUnmatchingId(matchId);
    try {
      await unmatch.mutateAsync({
        reconciliationId: result.reconciliationId,
        matchId,
      });
      toast({
        title: 'Transaction unmatched',
        description: 'The transaction has been unlinked.',
      });
      onRefresh?.();
    } catch (error) {
      toast({
        title: 'Unmatch failed',
        description: error instanceof Error ? error.message : 'Failed to unmatch transaction',
        variant: 'destructive',
      });
    } finally {
      setUnmatchingId(null);
    }
  };

  const handleMatchSuccess = () => {
    setMatchDialogOpen(false);
    setSelectedMatch(null);
    onRefresh?.();
  };

  /** Handle when user clicks "Match with Split" in manual match dialog */
  const handleMatchWithSplit = (matchId: string, xeroTransaction: AvailableTransaction) => {
    if (!selectedMatch) return;

    // Store the state for opening split dialog
    setSplitFromManualMatch({
      matchId,
      xeroTransaction,
      bankTransaction: {
        date: selectedMatch.bankDate,
        description: selectedMatch.bankDescription,
        amount: selectedMatch.bankAmount,
        isCredit: selectedMatch.bankIsCredit,
      },
    });

    // Clear manual match state
    setSelectedMatch(null);

    // Open split dialog
    setSplitDialogOpen(true);

    // Refresh to get updated match data
    onRefresh?.();
  };

  /** Handle split dialog success (from either source) */
  const handleSplitDialogSuccess = () => {
    setSplitDialogOpen(false);
    setSelectedSplitMatch(null);
    setSplitFromManualMatch(null);
    onRefresh?.();
  };

  /** Handle split dialog close */
  const handleSplitDialogClose = (open: boolean) => {
    if (!open) {
      setSplitDialogOpen(false);
      setSelectedSplitMatch(null);
      setSplitFromManualMatch(null);
    }
  };

  const filteredMatches = result.matches.filter((match) => {
    const matchesFilter = filter === 'all' || match.status === filter;
    const matchesSearch =
      !searchTerm ||
      match.bankDescription.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (match.xeroDescription?.toLowerCase().includes(searchTerm.toLowerCase()) ?? false);
    return matchesFilter && matchesSearch;
  });

  const { matchSummary } = result;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{matchSummary.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Matched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {matchSummary.matched + (matchSummary.feeAdjustedMatch || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {matchSummary.feeAdjustedMatch > 0 && (
                <span className="text-purple-600">{matchSummary.feeAdjustedMatch} fee-adjusted</span>
              )}
              {matchSummary.feeAdjustedMatch > 0 ? ' • ' : ''}
              {(((matchSummary.matched + (matchSummary.feeAdjustedMatch || 0)) / matchSummary.total) * 100).toFixed(1)}% match rate
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <XCircle className="h-4 w-4 text-orange-500" />
              Unmatched
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">
              {matchSummary.inBankOnly + matchSummary.inXeroOnly}
            </div>
            <p className="text-xs text-muted-foreground">
              {matchSummary.inBankOnly} bank only, {matchSummary.inXeroOnly} Xero only
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              Discrepancies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {matchSummary.amountMismatch + matchSummary.dateMismatch}
            </div>
            <p className="text-xs text-muted-foreground">
              {matchSummary.amountMismatch} amount, {matchSummary.dateMismatch} date
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Balance Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Balance Summary</CardTitle>
          <CardDescription>
            Period: {new Date(result.periodStart).toLocaleDateString()} -{' '}
            {new Date(result.periodEnd).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <p className="text-sm text-muted-foreground">Opening Balance</p>
              <p className="text-lg font-semibold">{formatCurrency(result.openingBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Closing Balance</p>
              <p className="text-lg font-semibold">{formatCurrency(result.closingBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Calculated Balance</p>
              <p className="text-lg font-semibold">{formatCurrency(result.calculatedBalance)}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Discrepancy</p>
              <p
                className={`text-lg font-semibold ${result.discrepancy !== 0 ? 'text-destructive' : 'text-green-600'}`}
              >
                {formatCurrency(result.discrepancy)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Match Details Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Match Details</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Badge
                variant={filter === 'all' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilter('all')}
              >
                All ({matchSummary.total})
              </Badge>
              <Badge
                variant={filter === 'MATCHED' ? 'default' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilter('MATCHED')}
              >
                Matched ({matchSummary.matched})
              </Badge>
              <Badge
                variant={filter === 'IN_BANK_ONLY' ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilter('IN_BANK_ONLY')}
              >
                Bank Only ({matchSummary.inBankOnly})
              </Badge>
              <Badge
                variant={filter === 'IN_XERO_ONLY' ? 'secondary' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilter('IN_XERO_ONLY')}
              >
                Xero Only ({matchSummary.inXeroOnly})
              </Badge>
              <Badge
                variant={filter === 'AMOUNT_MISMATCH' ? 'destructive' : 'outline'}
                className="cursor-pointer"
                onClick={() => setFilter('AMOUNT_MISMATCH')}
              >
                Amount ({matchSummary.amountMismatch})
              </Badge>
              {matchSummary.feeAdjustedMatch > 0 && (
                <Badge
                  variant={filter === 'FEE_ADJUSTED_MATCH' ? 'default' : 'outline'}
                  className="cursor-pointer bg-purple-100 text-purple-700 hover:bg-purple-200"
                  onClick={() => setFilter('FEE_ADJUSTED_MATCH')}
                >
                  <Coins className="h-3 w-3 mr-1" />
                  Fee Adjusted ({matchSummary.feeAdjustedMatch})
                </Badge>
              )}
            </div>
          </div>
          <Input
            placeholder="Search by description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm mt-2"
          />
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Status</TableHead>
                  <TableHead>Bank Transaction</TableHead>
                  <TableHead className="w-[50px] text-center">
                    <ArrowRightLeft className="h-4 w-4 mx-auto" />
                  </TableHead>
                  <TableHead>Matched Transaction</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredMatches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      No transactions found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredMatches.map((match) => {
                    const config = statusConfig[match.status];
                    return (
                      <TableRow key={match.id}>
                        <TableCell>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <Badge variant={config.variant} className="gap-1">
                                  {config.icon}
                                  <span className="hidden sm:inline">{config.label}</span>
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent>
                                {match.discrepancyReason || config.label}
                                {match.matchConfidence !== null && (
                                  <span className="ml-2">
                                    ({(match.matchConfidence * 100).toFixed(0)}% confidence)
                                  </span>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <p className="font-medium truncate max-w-[200px]" title={match.bankDescription}>
                              {match.bankDescription}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(match.bankDate).toLocaleDateString()}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {match.status === 'MATCHED' ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600 mx-auto" />
                          ) : match.status === 'FEE_ADJUSTED_MATCH' ? (
                            <Coins className="h-4 w-4 text-purple-600 mx-auto" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground mx-auto" />
                          )}
                        </TableCell>
                        <TableCell>
                          {match.xeroDescription ? (
                            <div className="space-y-1">
                              <p className="font-medium truncate max-w-[200px]" title={match.xeroDescription}>
                                {match.xeroDescription}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {match.xeroDate && new Date(match.xeroDate).toLocaleDateString()}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">No match</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="space-y-1">
                            <p
                              className={`font-mono ${match.bankIsCredit ? 'text-green-600' : 'text-destructive'}`}
                            >
                              {match.bankIsCredit ? '+' : '-'}
                              {formatCurrency(match.bankAmount)}
                            </p>
                            {match.xeroAmount !== null && match.xeroAmount !== match.bankAmount && (
                              <p className="text-xs text-muted-foreground font-mono">
                                vs {formatCurrency(match.xeroAmount)}
                              </p>
                            )}
                            {match.status === 'FEE_ADJUSTED_MATCH' && match.accruedFeeAmount && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <p className="text-xs text-purple-600 font-mono cursor-help">
                                      + Fee: {formatCurrency(match.accruedFeeAmount / 100)}
                                    </p>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      <p>Bank NET + Accrued Fee = Xero GROSS</p>
                                      <p className="mt-1">
                                        {formatCurrency(match.bankAmount)} + {formatCurrency(match.accruedFeeAmount / 100)} = {formatCurrency(match.xeroAmount || 0)}
                                      </p>
                                      {match.feeType && <p className="mt-1">Fee type: {match.feeType}</p>}
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {(match.status === 'MATCHED' || match.status === 'FEE_ADJUSTED_MATCH') ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleUnmatch(match.id)}
                                      disabled={unmatchingId === match.id}
                                    >
                                      {unmatchingId === match.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                      ) : (
                                        <Link2Off className="h-4 w-4" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Unmatch</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : match.status === 'IN_BANK_ONLY' ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenMatchDialog(match)}
                                    >
                                      <Link2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Manual Match</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : null}
                            {/* Split button for amount mismatches and fee-adjusted matches */}
                            {(match.status === 'AMOUNT_MISMATCH' || match.status === 'FEE_ADJUSTED_MATCH') && match.xeroAmount && match.transactionId && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenSplitDialog(match)}
                                      className="text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                                    >
                                      <Scissors className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      <p className="font-medium">Split Xero Transaction</p>
                                      <p>Split into net amount + accrued fee</p>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {onClose && (
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        )}
      </div>

      {/* Manual Match Dialog */}
      {selectedMatch && (
        <ManualMatchDialog
          open={matchDialogOpen}
          onOpenChange={setMatchDialogOpen}
          reconciliationId={result.reconciliationId}
          matchId={selectedMatch.id}
          bankTransaction={{
            date: selectedMatch.bankDate,
            description: selectedMatch.bankDescription,
            amount: selectedMatch.bankAmount,
            isCredit: selectedMatch.bankIsCredit,
          }}
          onSuccess={handleMatchSuccess}
          onMatchWithSplit={handleMatchWithSplit}
        />
      )}

      {/* Xero Split Dialog - from scissors button (only when not from manual match) */}
      {splitDialogOpen && !splitFromManualMatch && selectedSplitMatch && selectedSplitMatch.transactionId && selectedSplitMatch.xeroAmount && (
        <XeroSplitDialog
          open={splitDialogOpen}
          onOpenChange={handleSplitDialogClose}
          bankStatementMatchId={selectedSplitMatch.id}
          bankAmount={selectedSplitMatch.bankAmount}
          bankDescription={selectedSplitMatch.bankDescription}
          bankDate={selectedSplitMatch.bankDate}
          xeroTransactionId={selectedSplitMatch.transactionId}
          xeroAmount={selectedSplitMatch.xeroAmount}
          xeroDescription={selectedSplitMatch.xeroDescription || undefined}
          onSuccess={handleSplitDialogSuccess}
        />
      )}

      {/* Xero Split Dialog - from manual match flow */}
      {splitDialogOpen && splitFromManualMatch && (
        <XeroSplitDialog
          open={splitDialogOpen}
          onOpenChange={handleSplitDialogClose}
          bankStatementMatchId={splitFromManualMatch.matchId}
          bankAmount={splitFromManualMatch.bankTransaction.amount}
          bankDescription={splitFromManualMatch.bankTransaction.description}
          bankDate={splitFromManualMatch.bankTransaction.date}
          xeroTransactionId={splitFromManualMatch.xeroTransaction.id}
          xeroAmount={splitFromManualMatch.xeroTransaction.amount}
          xeroDescription={splitFromManualMatch.xeroTransaction.description}
          onSuccess={handleSplitDialogSuccess}
        />
      )}
    </div>
  );
}

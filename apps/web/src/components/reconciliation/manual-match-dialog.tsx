'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { Search, CheckCircle2, Loader2, Scissors, AlertTriangle, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAvailableTransactions, useManualMatch, type AvailableTransaction } from '@/hooks/use-reconciliation';
import { formatCurrency } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface ManualMatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reconciliationId: string;
  matchId: string;
  bankTransaction: {
    date: string;
    description: string;
    amount: number;
    isCredit: boolean;
  };
  onSuccess?: () => void;
  /** Callback when user wants to match with split - passes matchId and selected transaction */
  onMatchWithSplit?: (matchId: string, xeroTransaction: AvailableTransaction) => void;
}

export function ManualMatchDialog({
  open,
  onOpenChange,
  reconciliationId,
  matchId,
  bankTransaction,
  onSuccess,
  onMatchWithSplit,
}: ManualMatchDialogProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const { data: transactions, isLoading } = useAvailableTransactions(
    reconciliationId,
    searchTerm || undefined
  );

  const manualMatch = useManualMatch();

  // Filter transactions client-side for instant feedback
  const filteredTransactions = useMemo(() => {
    if (!transactions) return [];
    if (!searchTerm) return transactions;

    const term = searchTerm.toLowerCase();
    return transactions.filter(
      (t) =>
        t.description.toLowerCase().includes(term) ||
        t.date.includes(term) ||
        t.amount.toString().includes(term)
    );
  }, [transactions, searchTerm]);

  // Get the selected transaction details
  const selectedTransaction = useMemo(() => {
    if (!selectedTransactionId || !transactions) return null;
    return transactions.find((t) => t.id === selectedTransactionId) || null;
  }, [selectedTransactionId, transactions]);

  // Calculate amount difference (Xero - Bank)
  // Positive = Xero shows more (gross), Bank shows less (net after fee)
  const amountDifference = useMemo(() => {
    if (!selectedTransaction) return null;
    const bankAmount = bankTransaction.amount;
    const xeroAmount = selectedTransaction.amount;
    return xeroAmount - bankAmount;
  }, [selectedTransaction, bankTransaction.amount]);

  // Check if this looks like a fee situation (Xero gross > Bank net)
  const isFeeScenario = useMemo(() => {
    if (amountDifference === null) return false;
    // Fee scenario: Xero (gross) > Bank (net), difference is positive and reasonable (1-50 rand typically)
    return amountDifference > 0 && amountDifference <= 100; // Up to R100 fee
  }, [amountDifference]);

  // Check if amounts match exactly
  const isExactMatch = amountDifference !== null && Math.abs(amountDifference) < 0.01;

  const handleMatch = async () => {
    if (!selectedTransactionId) return;

    try {
      await manualMatch.mutateAsync({
        reconciliationId,
        matchId,
        transactionId: selectedTransactionId,
      });

      toast({
        title: 'Transaction matched',
        description: 'The transaction has been successfully matched.',
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      toast({
        title: 'Match failed',
        description: error instanceof Error ? error.message : 'Failed to match transaction',
        variant: 'destructive',
      });
    }
  };

  const handleMatchWithSplit = async () => {
    if (!selectedTransactionId || !selectedTransaction || !onMatchWithSplit) return;

    try {
      // First create the match
      await manualMatch.mutateAsync({
        reconciliationId,
        matchId,
        transactionId: selectedTransactionId,
      });

      // Close this dialog and open the split dialog
      onOpenChange(false);
      onMatchWithSplit(matchId, selectedTransaction);
    } catch (error) {
      toast({
        title: 'Match failed',
        description: error instanceof Error ? error.message : 'Failed to match transaction',
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    setSearchTerm('');
    setSelectedTransactionId(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Match</DialogTitle>
          <DialogDescription>
            Select a transaction to match with the bank statement entry
          </DialogDescription>
        </DialogHeader>

        {/* Bank transaction info */}
        <div className="bg-muted p-4 rounded-lg">
          <p className="text-sm text-muted-foreground mb-1">Bank Statement Entry (NET):</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{bankTransaction.description}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(bankTransaction.date).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={bankTransaction.isCredit ? 'default' : 'secondary'} className="text-base px-3 py-1">
              {bankTransaction.isCredit ? '+' : '-'}
              {formatCurrency(bankTransaction.amount)}
            </Badge>
          </div>
        </div>

        {/* Amount comparison when transaction is selected */}
        {selectedTransaction && !isExactMatch && (
          <Alert variant={isFeeScenario ? 'default' : 'destructive'} className="border-2">
            {isFeeScenario ? (
              <Scissors className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            <AlertDescription>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Xero (GROSS):</span>
                  <span className="text-blue-600 font-mono">{formatCurrency(selectedTransaction.amount)}</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <span className="font-medium">Bank (NET):</span>
                  <span className="text-green-600 font-mono">{formatCurrency(bankTransaction.amount)}</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-muted-foreground">Difference:</span>
                  <Badge variant={isFeeScenario ? 'secondary' : 'destructive'}>
                    {amountDifference && amountDifference > 0 ? '+' : ''}
                    {formatCurrency(amountDifference || 0)}
                  </Badge>
                </div>
              </div>
              {isFeeScenario && (
                <p className="text-sm text-muted-foreground mt-2">
                  This looks like a bank fee scenario. Use <strong>&quot;Match with Split&quot;</strong> to record the fee as an accrued bank charge.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions by description, date, or amount..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Transactions list */}
        <div className="flex-1 overflow-auto border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount (Xero)</TableHead>
                <TableHead className="text-right w-[100px]">Difference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No available transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => {
                  const diff = transaction.amount - bankTransaction.amount;
                  const isExact = Math.abs(diff) < 0.01;
                  const isFee = diff > 0 && diff <= 100;

                  return (
                    <TableRow
                      key={transaction.id}
                      className={`cursor-pointer hover:bg-muted/50 ${
                        selectedTransactionId === transaction.id ? 'bg-primary/10' : ''
                      }`}
                      onClick={() => setSelectedTransactionId(transaction.id)}
                    >
                      <TableCell>
                        {selectedTransactionId === transaction.id && (
                          <CheckCircle2 className="h-5 w-5 text-primary" />
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(transaction.date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-[250px] truncate" title={transaction.description}>
                        {transaction.description}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        <span className={transaction.isCredit ? 'text-green-600' : 'text-destructive'}>
                          {transaction.isCredit ? '+' : '-'}
                          {formatCurrency(transaction.amount)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        {isExact ? (
                          <Badge variant="default" className="bg-green-600">Exact</Badge>
                        ) : isFee ? (
                          <Badge variant="secondary" className="text-purple-600">
                            +{formatCurrency(diff)}
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            {diff > 0 ? '+' : ''}{formatCurrency(diff)}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Actions */}
        <div className="flex justify-between gap-2 pt-4">
          <div className="text-sm text-muted-foreground">
            {selectedTransaction && isFeeScenario && (
              <span className="flex items-center gap-1">
                <Scissors className="h-4 w-4 text-purple-600" />
                Fee detected: Use &quot;Match with Split&quot; to record bank fee
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {selectedTransaction && isFeeScenario && onMatchWithSplit && (
              <Button
                variant="secondary"
                onClick={handleMatchWithSplit}
                disabled={!selectedTransactionId || manualMatch.isPending}
                className="bg-purple-100 hover:bg-purple-200 text-purple-700"
              >
                {manualMatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Scissors className="mr-2 h-4 w-4" />
                Match with Split
              </Button>
            )}
            <Button
              onClick={handleMatch}
              disabled={!selectedTransactionId || manualMatch.isPending}
            >
              {manualMatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isExactMatch ? 'Match Selected' : 'Match (Ignore Difference)'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

'use client';

import * as React from 'react';
import { useState, useMemo } from 'react';
import { Search, CheckCircle2, Loader2 } from 'lucide-react';
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
}

export function ManualMatchDialog({
  open,
  onOpenChange,
  reconciliationId,
  matchId,
  bankTransaction,
  onSuccess,
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
          <p className="text-sm text-muted-foreground mb-1">Bank Statement Entry:</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{bankTransaction.description}</p>
              <p className="text-sm text-muted-foreground">
                {new Date(bankTransaction.date).toLocaleDateString()}
              </p>
            </div>
            <Badge variant={bankTransaction.isCredit ? 'default' : 'secondary'}>
              {bankTransaction.isCredit ? '+' : '-'}
              {formatCurrency(bankTransaction.amount)}
            </Badge>
          </div>
        </div>

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
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No available transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((transaction) => (
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
                    <TableCell className="max-w-[300px] truncate" title={transaction.description}>
                      {transaction.description}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={transaction.isCredit ? 'text-green-600' : 'text-destructive'}>
                        {transaction.isCredit ? '+' : '-'}
                        {formatCurrency(transaction.amount)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleMatch}
            disabled={!selectedTransactionId || manualMatch.isPending}
          >
            {manualMatch.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Match Selected
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

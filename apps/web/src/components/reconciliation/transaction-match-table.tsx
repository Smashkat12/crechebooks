'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Link2, Link2Off } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { formatCurrency } from '@/lib/utils';
import type { IReconciliationItem } from '@crechebooks/types';

interface TransactionMatchTableProps {
  items: IReconciliationItem[];
  onMatch?: (itemId: string, xeroTransactionId: string) => void;
  onUnmatch?: (itemId: string) => void;
  showXeroId?: boolean;
}

export function TransactionMatchTable({
  items,
  onMatch,
  onUnmatch,
  showXeroId = true,
}: TransactionMatchTableProps) {
  const [filter, setFilter] = useState<'all' | 'matched' | 'unmatched'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredItems = items.filter((item) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'matched' && item.matched) ||
      (filter === 'unmatched' && !item.matched);

    const matchesSearch =
      !searchTerm ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesFilter && matchesSearch;
  });

  const matchedCount = items.filter((i) => i.matched).length;
  const unmatchedCount = items.filter((i) => !i.matched).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Transactions</CardTitle>
          <div className="flex items-center gap-2">
            <Badge
              variant={filter === 'all' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter('all')}
            >
              All ({items.length})
            </Badge>
            <Badge
              variant={filter === 'matched' ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter('matched')}
            >
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Matched ({matchedCount})
            </Badge>
            <Badge
              variant={filter === 'unmatched' ? 'destructive' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter('unmatched')}
            >
              <XCircle className="h-3 w-3 mr-1" />
              Unmatched ({unmatchedCount})
            </Badge>
          </div>
        </div>
        <Input
          placeholder="Search transactions..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="max-w-sm"
        />
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                {showXeroId && <TableHead>Xero ID</TableHead>}
                <TableHead className="w-[100px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={showXeroId ? 6 : 5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No transactions found
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      {item.matched ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive" />
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(item.date).toLocaleDateString('en-ZA', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </TableCell>
                    <TableCell className="max-w-[300px] truncate" title={item.description}>
                      {item.description}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={item.amount < 0 ? 'text-destructive' : 'text-green-600'}>
                        {formatCurrency(item.amount)}
                      </span>
                    </TableCell>
                    {showXeroId && (
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {item.xeroTransactionId ?? '-'}
                      </TableCell>
                    )}
                    <TableCell>
                      {item.matched ? (
                        onUnmatch && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onUnmatch(item.id)}
                            title="Unmatch"
                          >
                            <Link2Off className="h-4 w-4" />
                          </Button>
                        )
                      ) : (
                        onMatch && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onMatch(item.id, '')}
                            title="Match"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

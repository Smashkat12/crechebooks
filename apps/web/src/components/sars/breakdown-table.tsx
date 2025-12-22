'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';

interface BreakdownRow {
  id: string;
  description: string;
  category?: string;
  amount: number;
  vat?: number;
}

interface BreakdownTableProps {
  title: string;
  rows: BreakdownRow[];
  showVat?: boolean;
  totalLabel?: string;
}

export function BreakdownTable({
  title,
  rows,
  showVat = true,
  totalLabel = 'Total',
}: BreakdownTableProps) {
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);
  const totalVat = showVat ? rows.reduce((sum, row) => sum + (row.vat ?? 0), 0) : 0;

  return (
    <div className="space-y-2">
      <h4 className="font-medium text-sm text-muted-foreground">{title}</h4>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Description</TableHead>
              {rows.some((r) => r.category) && <TableHead>Category</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
              {showVat && <TableHead className="text-right">VAT</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showVat ? 4 : 3}
                  className="text-center text-muted-foreground py-8"
                >
                  No transactions
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>{row.description}</TableCell>
                  {rows.some((r) => r.category) && (
                    <TableCell>{row.category ?? '-'}</TableCell>
                  )}
                  <TableCell className="text-right font-mono">
                    {formatCurrency(row.amount)}
                  </TableCell>
                  {showVat && (
                    <TableCell className="text-right font-mono">
                      {formatCurrency(row.vat ?? 0)}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
          {rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell
                  colSpan={rows.some((r) => r.category) ? 2 : 1}
                  className="font-medium"
                >
                  {totalLabel}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(totalAmount)}
                </TableCell>
                {showVat && (
                  <TableCell className="text-right font-mono font-medium">
                    {formatCurrency(totalVat)}
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
    </div>
  );
}

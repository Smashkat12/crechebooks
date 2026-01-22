'use client';

/**
 * Invoice Line Items Component
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Displays invoice line items in a table format:
 * - Description, Quantity, Unit Price, Total columns
 * - Subtotal, VAT (if applicable), Total rows
 * - Mobile-friendly layout with responsive design
 */

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number; // In Rands
  total: number; // In Rands
}

interface InvoiceLineItemsProps {
  lineItems: LineItem[];
  subtotal: number; // In Rands
  vatAmount?: number; // In Rands (optional - only shown if > 0)
  total: number; // In Rands
}

// Mobile-friendly card view for a single line item
function LineItemCard({ item }: { item: LineItem }) {
  return (
    <div className="py-3 border-b last:border-b-0">
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{item.description}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {item.quantity} x {formatCurrency(item.unitPrice)}
          </p>
        </div>
        <p className="font-semibold text-sm whitespace-nowrap">
          {formatCurrency(item.total)}
        </p>
      </div>
    </div>
  );
}

export function InvoiceLineItems({
  lineItems,
  subtotal,
  vatAmount,
  total,
}: InvoiceLineItemsProps) {
  const hasVat = vatAmount && vatAmount > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Invoice Items</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {/* Desktop Table View */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Description</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.description}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              {/* Subtotal */}
              <TableRow>
                <TableCell colSpan={3} className="text-right">
                  Subtotal
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(subtotal)}
                </TableCell>
              </TableRow>

              {/* VAT (if applicable) */}
              {hasVat && (
                <TableRow>
                  <TableCell colSpan={3} className="text-right">
                    VAT (15%)
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(vatAmount)}
                  </TableCell>
                </TableRow>
              )}

              {/* Total */}
              <TableRow className="bg-muted/50">
                <TableCell colSpan={3} className="text-right font-semibold">
                  Total
                </TableCell>
                <TableCell className="text-right font-bold text-lg">
                  {formatCurrency(total)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="md:hidden">
          {/* Line Items */}
          <div className="divide-y">
            {lineItems.map((item) => (
              <LineItemCard key={item.id} item={item} />
            ))}
          </div>

          {/* Totals Section */}
          <div className="mt-4 pt-4 border-t space-y-2">
            {/* Subtotal */}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>

            {/* VAT (if applicable) */}
            {hasVat && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT (15%)</span>
                <span>{formatCurrency(vatAmount)}</span>
              </div>
            )}

            <Separator className="my-2" />

            {/* Total */}
            <div className="flex justify-between items-center">
              <span className="font-semibold">Total</span>
              <span className="text-xl font-bold">{formatCurrency(total)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

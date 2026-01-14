/**
 * Invoice Line Items Table
 * TASK-BILL-038: SA VAT Compliance Enhancement
 *
 * Displays invoice line items with VAT status indicators per South African
 * VAT Act No. 89 of 1991, Section 12(h).
 */

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { InvoiceLine } from "@/types/invoice";
import { LINE_TYPE_LABELS, VAT_EXEMPT_LINE_TYPES, type LineType } from "@/types/invoice";

interface InvoiceLineItemsProps {
  lines: InvoiceLine[];
  showVat?: boolean; // Optional: show VAT breakdown per line
  showLineType?: boolean; // TASK-BILL-038: show line type column
}

export function InvoiceLineItems({
  lines,
  showVat = false,
  showLineType = false,
}: InvoiceLineItemsProps) {
  // Check if any line has VAT information
  const hasVatData = lines.some(line => line.vatAmount !== undefined && line.vatAmount > 0);
  const shouldShowVat = showVat && hasVatData;

  // TASK-BILL-038: Check if any line has type information
  const hasTypeData = lines.some(line => line.lineType !== undefined);
  const shouldShowType = showLineType && hasTypeData;

  // TASK-BILL-038: Get VAT status display for a line
  const getVatStatusBadge = (line: InvoiceLine) => {
    // Explicit isVatExempt flag takes precedence
    if (line.isVatExempt === true) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
          Exempt
        </Badge>
      );
    }
    // Check if line type is in exempt list
    if (line.lineType && VAT_EXEMPT_LINE_TYPES.includes(line.lineType)) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-xs">
          Exempt
        </Badge>
      );
    }
    // If we have VAT amount data, show it's applicable
    if (line.vatAmount !== undefined && line.vatAmount > 0) {
      return (
        <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">
          15%
        </Badge>
      );
    }
    return null;
  };

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Child</TableHead>
            {shouldShowType && <TableHead>Type</TableHead>}
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            {shouldShowVat && <TableHead className="text-right">VAT</TableHead>}
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">
                <div className="flex items-center gap-2">
                  <span>{line.description}</span>
                  {/* TASK-BILL-038: Show VAT status badge inline with description */}
                  {getVatStatusBadge(line)}
                </div>
              </TableCell>
              <TableCell>{line.childName}</TableCell>
              {shouldShowType && (
                <TableCell className="text-sm text-muted-foreground">
                  {line.lineType ? LINE_TYPE_LABELS[line.lineType] ?? line.lineType : '-'}
                </TableCell>
              )}
              <TableCell className="text-right font-mono">{line.quantity}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(line.unitPrice)}
              </TableCell>
              {shouldShowVat && (
                <TableCell className="text-right font-mono text-muted-foreground">
                  {line.isVatExempt ? (
                    <span className="text-green-600">-</span>
                  ) : (
                    formatCurrency(line.vatAmount ?? 0)
                  )}
                </TableCell>
              )}
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

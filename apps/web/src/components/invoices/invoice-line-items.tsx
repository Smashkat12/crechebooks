import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import type { InvoiceLine } from "@/types/invoice";

interface InvoiceLineItemsProps {
  lines: InvoiceLine[];
  showVat?: boolean; // Optional: show VAT breakdown per line
}

export function InvoiceLineItems({ lines, showVat = false }: InvoiceLineItemsProps) {
  // Check if any line has VAT information
  const hasVatData = lines.some(line => line.vatAmount !== undefined && line.vatAmount > 0);
  const shouldShowVat = showVat && hasVatData;

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Child</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            {shouldShowVat && <TableHead className="text-right">VAT</TableHead>}
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.description}</TableCell>
              <TableCell>{line.childName}</TableCell>
              <TableCell className="text-right font-mono">{line.quantity}</TableCell>
              <TableCell className="text-right font-mono">
                {formatCurrency(line.unitPrice)}
              </TableCell>
              {shouldShowVat && (
                <TableCell className="text-right font-mono text-muted-foreground">
                  {formatCurrency(line.vatAmount ?? 0)}
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

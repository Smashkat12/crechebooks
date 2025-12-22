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
}

export function InvoiceLineItems({ lines }: InvoiceLineItemsProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead>Child</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell className="font-medium">{line.description}</TableCell>
              <TableCell>{line.childName}</TableCell>
              <TableCell className="text-right">{line.quantity}</TableCell>
              <TableCell className="text-right">
                {formatCurrency(line.unitPrice)}
              </TableCell>
              <TableCell className="text-right">
                {formatCurrency(line.amount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

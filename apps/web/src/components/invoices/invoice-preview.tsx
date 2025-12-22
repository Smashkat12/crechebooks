import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import { InvoiceLineItems } from "./invoice-line-items";
import { InvoiceStatusBadge } from "./invoice-status-badge";

interface InvoicePreviewProps {
  invoice: Invoice;
}

export function InvoicePreview({ invoice }: InvoicePreviewProps) {
  const subtotal = invoice.lines.reduce((sum, line) => sum + line.amount, 0);
  const vatAmount = subtotal * (invoice.vatRate / 100);
  const total = subtotal + vatAmount;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Invoice {invoice.invoiceNumber}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {invoice.parentName}
            </p>
          </div>
          <InvoiceStatusBadge status={invoice.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium">Invoice Date</p>
            <p className="text-muted-foreground">
              {formatDate(invoice.invoiceDate)}
            </p>
          </div>
          <div>
            <p className="font-medium">Due Date</p>
            <p className="text-muted-foreground">
              {formatDate(invoice.dueDate)}
            </p>
          </div>
          <div>
            <p className="font-medium">Period</p>
            <p className="text-muted-foreground">
              {formatDate(invoice.periodStart)} - {formatDate(invoice.periodEnd)}
            </p>
          </div>
          {invoice.paidDate && (
            <div>
              <p className="font-medium">Paid Date</p>
              <p className="text-muted-foreground">
                {formatDate(invoice.paidDate)}
              </p>
            </div>
          )}
        </div>

        <Separator />

        <div>
          <h3 className="font-medium mb-4">Line Items</h3>
          <InvoiceLineItems lines={invoice.lines} />
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              VAT ({invoice.vatRate}%)
            </span>
            <span>{formatCurrency(vatAmount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-medium text-lg">
            <span>Total</span>
            <span>{formatCurrency(total)}</span>
          </div>
          {invoice.amountPaid > 0 && (
            <>
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Amount Paid</span>
                <span>{formatCurrency(invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-medium">
                <span>Balance Due</span>
                <span>{formatCurrency(total - invoice.amountPaid)}</span>
              </div>
            </>
          )}
        </div>

        {invoice.notes && (
          <>
            <Separator />
            <div>
              <h3 className="font-medium mb-2">Notes</h3>
              <p className="text-sm text-muted-foreground">{invoice.notes}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

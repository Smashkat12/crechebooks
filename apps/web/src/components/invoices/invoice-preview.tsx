/**
 * Invoice Preview Component
 * TASK-BILL-001: Fix Frontend VAT Calculation Mismatch
 *
 * Correctly calculates VAT by summing per-line VAT amounts instead of
 * applying a flat 15% rate to the entire subtotal. Per SA VAT Act Section 12(h),
 * childcare/educational fees are VAT exempt while goods/services are not.
 *
 * Uses centralized VAT utility from @/lib/vat for consistent calculations.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  calculateInvoiceVAT,
  DEFAULT_VAT_RATE,
  type LineItemInput,
  type OrganizationConfig,
} from "@/lib/vat";
import type { Invoice } from "@/types/invoice";
import { InvoiceLineItems } from "./invoice-line-items";
import { InvoiceStatusBadge } from "./invoice-status-badge";

interface InvoicePreviewProps {
  invoice: Invoice;
}

export function InvoicePreview({ invoice }: InvoicePreviewProps) {
  // TASK-BILL-001: Use centralized VAT calculation utility
  // Transform invoice lines to LineItemInput format for the VAT utility
  const lineItems: LineItemInput[] = invoice.lines.map((line) => ({
    amount: line.amount,
    vatRate: invoice.vatRate,
    isVatExempt: line.isVatExempt,
    lineType: line.lineType,
    vatAmount: line.vatAmount,
  }));

  // Organization config for VAT calculations
  const orgConfig: OrganizationConfig = {
    defaultVatRate: invoice.vatRate ?? DEFAULT_VAT_RATE,
    vatStatus: 'standard', // Default to standard, could be passed via props
  };

  // Calculate VAT using centralized utility
  // Priority: Use backend-provided values if available, otherwise calculate
  const calculatedVat = calculateInvoiceVAT(lineItems, orgConfig);

  // Use backend values if provided, otherwise use calculated values
  const subtotal = invoice.subtotal ?? calculatedVat.subtotal;
  const vatAmount = invoice.vatAmount ?? calculatedVat.vatAmount;
  const total = invoice.total ?? calculatedVat.total;

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
          {/* TASK-BILL-038: Enable VAT display to show per-line VAT status */}
          <InvoiceLineItems lines={invoice.lines} showVat={true} />
        </div>

        <Separator />

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal (excl. VAT)</span>
            <span className="font-mono">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              VAT ({invoice.vatRate}%)
            </span>
            <span className="font-mono">{formatCurrency(vatAmount)}</span>
          </div>
          <Separator />
          <div className="flex justify-between font-medium text-lg">
            <span>Total (incl. VAT)</span>
            <span className="font-mono">{formatCurrency(total)}</span>
          </div>
          {invoice.amountPaid > 0 && (
            <>
              <Separator className="my-2" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Amount Paid</span>
                <span className="font-mono">{formatCurrency(invoice.amountPaid)}</span>
              </div>
              <div className="flex justify-between font-medium text-base">
                <span>Balance Due</span>
                <span className="font-mono">{formatCurrency(total - invoice.amountPaid)}</span>
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

"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useParent } from "@/hooks/use-parents";
import { useInvoicesList } from "@/hooks/use-invoices";
import { usePaymentsList } from "@/hooks/use-payments";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface ParentDetailSheetProps {
  parentId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ParentDetailSheet({
  parentId,
  open,
  onOpenChange,
}: ParentDetailSheetProps) {
  const { data: parent, isLoading: isLoadingParent } = useParent(parentId ?? "");
  // Fetch all invoices for this parent (no status filter)
  // and filter client-side for unpaid ones
  const { data: invoicesData, isLoading: isLoadingInvoices } = useInvoicesList({
    parentId: parentId ?? undefined,
    limit: 50,
  });
  const { data: paymentsData, isLoading: isLoadingPayments } = usePaymentsList({
    parentId: parentId ?? undefined,
    limit: 10,
  });

  // Filter client-side for unpaid invoices (exclude PAID and VOID)
  const allInvoices = invoicesData?.invoices ?? [];
  const invoices = allInvoices.filter(
    (inv) => inv.status !== "PAID" && inv.status !== "VOID"
  );
  const payments = paymentsData?.payments ?? [];
  // totalCents is in cents, convert to Rands for display
  // Use amountPaidCents to calculate balance due
  const totalOutstanding = invoices.reduce((sum, inv) => {
    const balanceDue = (inv.totalCents ?? 0) - (inv.amountPaidCents ?? 0);
    return sum + balanceDue;
  }, 0) / 100; // Convert cents to Rands

  if (!parentId) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Parent Arrears Details</SheetTitle>
          <SheetDescription>
            Outstanding invoices and payment history
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Parent Information */}
          {isLoadingParent ? (
            <div className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : parent ? (
            <div>
              <h3 className="text-sm font-medium text-muted-foreground">Parent</h3>
              <p className="text-lg font-semibold">{parent.firstName} {parent.lastName}</p>
              <p className="text-sm text-muted-foreground">{parent.email}</p>
              {parent.phone && (
                <p className="text-sm text-muted-foreground">{parent.phone}</p>
              )}
            </div>
          ) : null}

          <Separator />

          {/* Outstanding Summary */}
          <div className="rounded-lg border p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Outstanding</span>
              <span className="text-2xl font-bold text-destructive">
                {formatCurrency(totalOutstanding)}
              </span>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              {invoices.length} unpaid invoice(s)
            </div>
          </div>

          {/* Outstanding Invoices */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Outstanding Invoices</h3>
            {isLoadingInvoices ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : invoices.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Issue Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((invoice) => {
                      const isOverdue = new Date(invoice.dueDate) < new Date();
                      return (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-medium">
                            {invoice.invoiceNumber}
                          </TableCell>
                          <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {formatDate(invoice.dueDate)}
                              {isOverdue && (
                                <Badge variant="destructive" className="text-xs">
                                  Overdue
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatCurrency((invoice.totalCents ?? 0) / 100)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No outstanding invoices</p>
            )}
          </div>

          <Separator />

          {/* Payment History */}
          <div>
            <h3 className="mb-3 text-sm font-medium">Recent Payment History</h3>
            {isLoadingPayments ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : payments.length > 0 ? (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell>{formatDate(payment.date)}</TableCell>
                        <TableCell className="capitalize">
                          {payment.source}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {payment.reference || "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrency(payment.amount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payment history</p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

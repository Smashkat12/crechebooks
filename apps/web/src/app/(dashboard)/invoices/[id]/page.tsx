'use client';

import { use } from 'react';
import { ArrowLeft, Send, Download, Printer } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { InvoicePreview } from '@/components/invoices';
import { useInvoice } from '@/hooks/use-invoices';
import { Skeleton } from '@/components/ui/skeleton';
import type { Invoice } from '@/types/invoice';

interface InvoiceDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function InvoiceDetailPage({ params }: InvoiceDetailPageProps) {
  const { id } = use(params);
  const { data: invoiceData, isLoading, error } = useInvoice(id);

  if (error) {
    throw new Error(`Failed to load invoice: ${error.message}`);
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-[800px]" />
      </div>
    );
  }

  if (!invoiceData) {
    throw new Error('Invoice not found');
  }

  // Map API response to Invoice type expected by InvoicePreview
  // Note: IInvoice uses issueDate, not invoiceDate, and amounts in cents
  const invoice: Invoice = {
    id: invoiceData.id,
    invoiceNumber: invoiceData.invoiceNumber,
    parentId: invoiceData.parentId,
    parentName: invoiceData.parentName ?? 'Unknown Parent',
    status: invoiceData.status.toLowerCase() as Invoice['status'],
    invoiceDate: invoiceData.issueDate instanceof Date
      ? invoiceData.issueDate.toISOString()
      : String(invoiceData.issueDate),
    dueDate: invoiceData.dueDate instanceof Date
      ? invoiceData.dueDate.toISOString()
      : String(invoiceData.dueDate),
    periodStart: invoiceData.issueDate instanceof Date
      ? invoiceData.issueDate.toISOString()
      : String(invoiceData.issueDate),
    periodEnd: invoiceData.dueDate instanceof Date
      ? invoiceData.dueDate.toISOString()
      : String(invoiceData.dueDate),
    lines: invoiceData.lines.map(line => ({
      id: line.id,
      description: line.description,
      childName: '', // childName not available in IInvoiceLine
      quantity: line.quantity,
      unitPrice: line.unitAmount / 100,
      amount: line.lineAmount / 100,
      vatAmount: line.vatAmount / 100, // Add VAT amount per line
    })),
    vatRate: 15,
    // Use backend-calculated amounts (convert from cents to Rand)
    subtotal: invoiceData.subtotal / 100,
    vatAmount: invoiceData.vatAmount / 100,
    total: invoiceData.total / 100,
    amountPaid: invoiceData.amountPaid / 100,
    paidDate: invoiceData.paidAt instanceof Date
      ? invoiceData.paidAt.toISOString()
      : invoiceData.paidAt ? String(invoiceData.paidAt) : undefined,
    notes: undefined,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/invoices">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Invoice {invoice.invoiceNumber}
            </h1>
            <p className="text-muted-foreground">
              View invoice details
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          {invoice.status !== 'paid' && (
            <Button>
              <Send className="h-4 w-4 mr-2" />
              Send Invoice
            </Button>
          )}
        </div>
      </div>

      <InvoicePreview invoice={invoice} />
    </div>
  );
}

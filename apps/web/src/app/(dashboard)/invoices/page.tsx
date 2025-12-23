'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InvoiceTable } from '@/components/invoices';
import { useDownloadInvoicePdf } from '@/hooks/use-invoices';
import { useToast } from '@/hooks/use-toast';
import type { Invoice } from '@/types/invoice';

export default function InvoicesPage() {
  const router = useRouter();
  const { downloadPdf } = useDownloadInvoicePdf();
  const { toast } = useToast();

  const handleView = (invoice: Invoice) => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleSend = (invoice: Invoice) => {
    // TODO: Open send dialog
    console.log('Send invoice:', invoice.id);
  };

  const handleDownload = async (invoice: Invoice) => {
    try {
      await downloadPdf(invoice.id, invoice.invoiceNumber);
      toast({
        title: 'Download started',
        description: `Downloading ${invoice.invoiceNumber}.pdf`,
      });
    } catch (error) {
      console.error('Download failed:', error);
      toast({
        title: 'Download failed',
        description: error instanceof Error ? error.message : 'Failed to download invoice',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = (invoice: Invoice) => {
    // TODO: Confirm and delete
    console.log('Delete invoice:', invoice.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage and track invoices
          </p>
        </div>
        <Link href="/invoices/generate">
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Generate Invoices
          </Button>
        </Link>
      </div>

      <Card>
        <CardContent className="pt-6">
          <InvoiceTable
            onView={handleView}
            onSend={handleSend}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        </CardContent>
      </Card>
    </div>
  );
}

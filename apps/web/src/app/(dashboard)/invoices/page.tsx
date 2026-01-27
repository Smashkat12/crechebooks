'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InvoiceTable } from '@/components/invoices';
import { SendInvoiceDialog } from '@/components/invoices/send-invoice-dialog';
import { useDownloadInvoicePdf } from '@/hooks/use-invoices';
import { useSendInvoice } from '@/hooks/useSendInvoice';
import { useToast } from '@/hooks/use-toast';
import type { Invoice } from '@/types/invoice';

export default function InvoicesPage() {
  const router = useRouter();
  const { downloadPdf } = useDownloadInvoicePdf();
  const sendInvoice = useSendInvoice();
  const { toast } = useToast();
  const [sendDialogOpen, setSendDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const handleView = (invoice: Invoice) => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleSend = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setSendDialogOpen(true);
  };

  const handleConfirmSend = (channel: 'email' | 'whatsapp') => {
    if (!selectedInvoice) return;

    sendInvoice.mutate(
      { invoiceId: selectedInvoice.id, channel },
      {
        onSuccess: (data) => {
          if (data.data.sent > 0) {
            toast({
              title: 'Invoice sent',
              description: `Invoice sent successfully via ${channel}`,
            });
          }
          if (data.data.failed > 0 && data.data.failures.length > 0) {
            toast({
              title: 'Failed to send',
              description: data.data.failures[0].reason,
              variant: 'destructive',
            });
          }
          setSendDialogOpen(false);
          setSelectedInvoice(null);
        },
        onError: (error) => {
          toast({
            title: 'Failed to send',
            description: error.message || 'An error occurred while sending the invoice',
            variant: 'destructive',
          });
        },
      }
    );
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

      <SendInvoiceDialog
        invoice={selectedInvoice}
        isOpen={sendDialogOpen}
        onClose={() => setSendDialogOpen(false)}
        onSend={handleConfirmSend}
        isLoading={sendInvoice.isPending}
      />
    </div>
  );
}

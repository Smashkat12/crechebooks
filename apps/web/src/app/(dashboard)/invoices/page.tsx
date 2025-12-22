'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { InvoiceTable } from '@/components/invoices';
import type { Invoice } from '@/types/invoice';

export default function InvoicesPage() {
  const router = useRouter();

  const handleView = (invoice: Invoice) => {
    router.push(`/invoices/${invoice.id}`);
  };

  const handleSend = (invoice: Invoice) => {
    // TODO: Open send dialog
    console.log('Send invoice:', invoice.id);
  };

  const handleDownload = (invoice: Invoice) => {
    // TODO: Download PDF
    console.log('Download invoice:', invoice.id);
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

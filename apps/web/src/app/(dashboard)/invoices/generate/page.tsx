'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { GenerateInvoicesWizard } from '@/components/invoices';
import { useGenerateInvoices } from '@/hooks/use-invoices';

export default function GenerateInvoicesPage() {
  const router = useRouter();
  const [wizardOpen, setWizardOpen] = useState(true);
  const generateInvoices = useGenerateInvoices();

  const handleGenerate = (month: Date, enrollmentIds: string[]) => {
    generateInvoices.mutate({
      month: month.getMonth() + 1,
      year: month.getFullYear(),
      childIds: enrollmentIds,
    });
    router.push('/invoices');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/invoices">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Generate Invoices</h1>
          <p className="text-muted-foreground">
            Create invoices for enrolled children
          </p>
        </div>
      </div>

      <GenerateInvoicesWizard
        open={wizardOpen}
        onOpenChange={(open) => {
          setWizardOpen(open);
          if (!open) router.push('/invoices');
        }}
        onGenerate={handleGenerate}
      />
    </div>
  );
}

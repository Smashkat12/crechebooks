'use client';

/**
 * TASK-ACCT-UI-004: Create Supplier Page
 * Form page for creating a new supplier.
 */

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { SupplierForm } from '@/components/accounting/supplier-form';
import { useCreateSupplier, type CreateSupplierDto } from '@/hooks/use-suppliers';
import { useAccountsList } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';

export default function NewSupplierPage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: accounts } = useAccountsList({ isActive: true });
  const createSupplier = useCreateSupplier();

  const handleSubmit = (data: CreateSupplierDto) => {
    createSupplier.mutate(data, {
      onSuccess: (supplier) => {
        toast({
          title: 'Supplier created',
          description: `${supplier.name} has been added successfully.`,
        });
        router.push(`/accounting/suppliers/${supplier.id}`);
      },
      onError: (error) => {
        toast({
          title: 'Failed to create supplier',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/accounting/suppliers">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add Supplier</h1>
          <p className="text-muted-foreground">Create a new supplier record</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6">
          <SupplierForm
            accounts={accounts}
            onSubmit={handleSubmit}
            isLoading={createSupplier.isPending}
            mode="create"
          />
        </CardContent>
      </Card>
    </div>
  );
}

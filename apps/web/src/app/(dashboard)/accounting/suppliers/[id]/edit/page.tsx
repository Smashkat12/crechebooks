'use client';

/**
 * TASK-ACCT-UI-004: Edit Supplier Page
 * Form page for editing an existing supplier.
 */

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SupplierForm } from '@/components/accounting/supplier-form';
import {
  useSupplier,
  useUpdateSupplier,
  type CreateSupplierDto,
} from '@/hooks/use-suppliers';
import { useAccountsList } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';

export default function EditSupplierPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const supplierId = params.id as string;

  const { data: supplier, isLoading, error } = useSupplier(supplierId);
  const { data: accounts } = useAccountsList({ isActive: true });
  const updateSupplier = useUpdateSupplier(supplierId);

  const handleSubmit = (data: Partial<CreateSupplierDto>) => {
    updateSupplier.mutate(data, {
      onSuccess: (updatedSupplier) => {
        toast({
          title: 'Supplier updated',
          description: `${updatedSupplier.name} has been updated successfully.`,
        });
        router.push(`/accounting/suppliers/${supplierId}`);
      },
      onError: (error) => {
        toast({
          title: 'Failed to update supplier',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load supplier</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Supplier not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/accounting/suppliers/${supplierId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Supplier</h1>
          <p className="text-muted-foreground">{supplier.name}</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardContent className="pt-6">
          <SupplierForm
            supplier={supplier}
            accounts={accounts}
            onSubmit={handleSubmit}
            isLoading={updateSupplier.isPending}
            mode="edit"
          />
        </CardContent>
      </Card>
    </div>
  );
}

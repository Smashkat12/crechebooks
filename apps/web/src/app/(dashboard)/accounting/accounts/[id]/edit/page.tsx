'use client';

/**
 * TASK-ACCT-UI-001: Edit Account Page
 * Form for editing existing accounts in the chart of accounts.
 */

import { use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AccountForm } from '@/components/accounting/account-form';
import {
  useAccount,
  useAccountsList,
  useUpdateAccount,
  type UpdateAccountDto,
} from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';

interface EditAccountPageProps {
  params: Promise<{ id: string }>;
}

export default function EditAccountPage({ params }: EditAccountPageProps) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const { data: account, isLoading, error } = useAccount(id);
  const { data: accounts } = useAccountsList({ isActive: true });
  const updateAccount = useUpdateAccount(id);

  const handleSubmit = (data: UpdateAccountDto) => {
    updateAccount.mutate(data, {
      onSuccess: (updatedAccount) => {
        toast({
          title: 'Account updated',
          description: `Account "${updatedAccount.name}" has been updated successfully.`,
        });
        router.push(`/accounting/accounts/${id}`);
      },
      onError: (error) => {
        toast({
          title: 'Failed to update account',
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
          <p className="text-destructive font-medium">Failed to load account</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
          <Link href="/accounting/accounts">
            <Button variant="outline" className="mt-4">
              Back to Accounts
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="font-medium">Account not found</p>
          <Link href="/accounting/accounts">
            <Button variant="outline" className="mt-4">
              Back to Accounts
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // System accounts cannot be edited
  if (account.isSystem) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href={`/accounting/accounts/${id}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Account</h1>
            <p className="text-muted-foreground">{account.name}</p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertTitle>Cannot Edit System Account</AlertTitle>
          <AlertDescription>
            This is a system account and cannot be modified. System accounts are required for core
            accounting functionality.
          </AlertDescription>
        </Alert>
        <Link href={`/accounting/accounts/${id}`}>
          <Button variant="outline">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Account Details
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/accounting/accounts/${id}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Account</h1>
          <p className="text-muted-foreground">
            {account.code} - {account.name}
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Update the account information. Note that the account code and type cannot be changed
            after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm
            account={account}
            accounts={accounts}
            onSubmit={handleSubmit}
            isLoading={updateAccount.isPending}
            mode="edit"
          />
        </CardContent>
      </Card>
    </div>
  );
}

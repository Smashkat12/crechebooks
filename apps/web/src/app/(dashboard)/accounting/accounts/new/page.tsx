'use client';

/**
 * TASK-ACCT-UI-001: Create Account Page
 * Form for creating new accounts in the chart of accounts.
 */

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AccountForm } from '@/components/accounting/account-form';
import { useAccountsList, useCreateAccount, type CreateAccountDto } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';

export default function NewAccountPage() {
  const router = useRouter();
  const { toast } = useToast();

  // Fetch existing accounts for parent selection
  const { data: accounts } = useAccountsList({ isActive: true });
  const createAccount = useCreateAccount();

  const handleSubmit = (data: CreateAccountDto) => {
    createAccount.mutate(data, {
      onSuccess: (account) => {
        toast({
          title: 'Account created',
          description: `Account "${account.name}" (${account.code}) has been created successfully.`,
        });
        router.push('/accounting/accounts');
      },
      onError: (error) => {
        toast({
          title: 'Failed to create account',
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
        <Link href="/accounting/accounts">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Add New Account</h1>
          <p className="text-muted-foreground">
            Create a new account in your chart of accounts
          </p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          <CardDescription>
            Enter the details for the new account. Account codes should follow South African
            accounting standards (e.g., 1000-1999 for Assets, 2000-2999 for Liabilities).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountForm
            accounts={accounts}
            onSubmit={handleSubmit}
            isLoading={createAccount.isPending}
            mode="create"
          />
        </CardContent>
      </Card>
    </div>
  );
}

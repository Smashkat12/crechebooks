'use client';

/**
 * TASK-ACCT-UI-001: Chart of Accounts List Page
 * Main page for viewing and managing accounts.
 */

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, BookOpen, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useAccountsList,
  useSeedDefaultAccounts,
  useDeactivateAccount,
  useReactivateAccount,
  type AccountType,
} from '@/hooks/use-accounts';
import { createAccountColumns } from '@/components/accounting/account-columns';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function AccountsPage() {
  const [typeFilter, setTypeFilter] = useState<AccountType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [accountToDeactivate, setAccountToDeactivate] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: accounts, isLoading, error } = useAccountsList({
    type: typeFilter === 'all' ? undefined : typeFilter,
    search: search || undefined,
  });

  const seedDefaults = useSeedDefaultAccounts();
  const deactivateAccount = useDeactivateAccount();
  const reactivateAccount = useReactivateAccount();

  const handleSeedDefaults = () => {
    seedDefaults.mutate(undefined, {
      onSuccess: (data) => {
        toast({
          title: 'Default accounts created',
          description: `South African chart of accounts has been seeded with ${data.count} accounts.`,
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to seed accounts',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleDeactivate = useCallback((id: string) => {
    setAccountToDeactivate(id);
  }, []);

  const confirmDeactivate = () => {
    if (!accountToDeactivate) return;
    deactivateAccount.mutate(accountToDeactivate, {
      onSuccess: () => {
        toast({
          title: 'Account deactivated',
          description: 'The account has been deactivated successfully.',
        });
        setAccountToDeactivate(null);
      },
      onError: (error) => {
        toast({
          title: 'Failed to deactivate account',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleReactivate = useCallback((id: string) => {
    reactivateAccount.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Account reactivated',
          description: 'The account has been reactivated successfully.',
        });
      },
      onError: (error) => {
        toast({
          title: 'Failed to reactivate account',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  }, [reactivateAccount, toast]);

  const columns = useMemo(
    () =>
      createAccountColumns({
        onDeactivate: handleDeactivate,
        onReactivate: handleReactivate,
      }),
    [handleDeactivate, handleReactivate]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load accounts</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Chart of Accounts</h1>
          <p className="text-muted-foreground">
            Manage your account structure for financial reporting
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleSeedDefaults}
            disabled={seedDefaults.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${seedDefaults.isPending ? 'animate-spin' : ''}`} />
            Seed Defaults
          </Button>
          <Link href="/accounting/accounts/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Account
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search accounts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as AccountType | 'all')}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="ASSET">Assets</SelectItem>
                <SelectItem value="LIABILITY">Liabilities</SelectItem>
                <SelectItem value="EQUITY">Equity</SelectItem>
                <SelectItem value="REVENUE">Revenue</SelectItem>
                <SelectItem value="EXPENSE">Expenses</SelectItem>
              </SelectContent>
            </Select>
            <Link href="/accounting/trial-balance">
              <Button variant="outline">
                <BookOpen className="h-4 w-4 mr-2" />
                Trial Balance
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <DataTableSkeleton columns={6} rows={10} />
          ) : (
            <DataTable
              columns={columns}
              data={accounts || []}
              emptyMessage="No accounts found. Click 'Seed Defaults' to create the standard South African chart of accounts."
            />
          )}
        </CardContent>
      </Card>

      {/* Deactivate Confirmation Dialog */}
      <AlertDialog open={!!accountToDeactivate} onOpenChange={() => setAccountToDeactivate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to deactivate this account? Deactivated accounts will not appear
              in dropdowns but will retain their historical data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeactivate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

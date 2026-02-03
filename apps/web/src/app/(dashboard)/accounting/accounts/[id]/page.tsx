'use client';

/**
 * TASK-ACCT-UI-001: Account Detail Page
 * View details of a single account.
 */

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Pencil, XCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { AccountTypeBadge } from '@/components/accounting/account-type-badge';
import { useAccount, useDeactivateAccount, useReactivateAccount } from '@/hooks/use-accounts';
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
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface AccountDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function AccountDetailPage({ params }: AccountDetailPageProps) {
  const { id } = use(params);
  const { toast } = useToast();

  const { data: account, isLoading, error } = useAccount(id);
  const deactivateAccount = useDeactivateAccount();
  const reactivateAccount = useReactivateAccount();

  const handleDeactivate = () => {
    deactivateAccount.mutate(id, {
      onSuccess: () => {
        toast({
          title: 'Account deactivated',
          description: 'The account has been deactivated successfully.',
        });
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

  const handleReactivate = () => {
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
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/accounting/accounts">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight font-mono">{account.code}</h1>
              <AccountTypeBadge type={account.type} />
              {!account.isActive && <Badge variant="secondary">Inactive</Badge>}
            </div>
            <p className="text-muted-foreground">{account.name}</p>
          </div>
        </div>
        {!account.isSystem && (
          <div className="flex gap-2">
            <Link href={`/accounting/accounts/${id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
            {account.isActive ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    Deactivate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Deactivate Account</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to deactivate this account? Deactivated accounts will not
                      appear in dropdowns but will retain their historical data.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeactivate}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Deactivate
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button onClick={handleReactivate}>
                <CheckCircle className="h-4 w-4 mr-2" />
                Reactivate
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Account Details</CardTitle>
          {account.isSystem && (
            <CardDescription>
              This is a system account and cannot be modified.
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Account Code</label>
                <p className="text-lg font-mono">{account.code}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Account Name</label>
                <p className="text-lg">{account.name}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Type</label>
                <div className="mt-1">
                  <AccountTypeBadge type={account.type} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Sub Type</label>
                <p className="text-lg">
                  {account.subType ? account.subType.replace(/_/g, ' ') : 'None'}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground">Description</label>
                <p className="text-lg">{account.description || 'No description'}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-muted-foreground">Status</label>
                <div className="mt-1">
                  <Badge variant={account.isActive ? 'default' : 'secondary'}>
                    {account.isActive ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
              </div>
              {account.isEducationExempt && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">VAT Status</label>
                  <div className="mt-1">
                    <Badge
                      variant="outline"
                      className="bg-emerald-50 text-emerald-700 border-emerald-200"
                    >
                      VAT Exempt (Section 12(h))
                    </Badge>
                  </div>
                </div>
              )}
              {account.isSystem && (
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Account Type</label>
                  <div className="mt-1">
                    <Badge variant="secondary">System Account</Badge>
                  </div>
                </div>
              )}
            </div>
          </div>

          {account.xeroAccountId && (
            <>
              <Separator className="my-6" />
              <div>
                <label className="text-sm font-medium text-muted-foreground">
                  Xero Integration
                </label>
                <p className="text-sm text-muted-foreground mt-1">
                  Linked to Xero Account ID: {account.xeroAccountId}
                </p>
              </div>
            </>
          )}

          <Separator className="my-6" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <span className="font-medium">Created:</span>{' '}
              {new Date(account.createdAt).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
            <div>
              <span className="font-medium">Last Updated:</span>{' '}
              {new Date(account.updatedAt).toLocaleDateString('en-ZA', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

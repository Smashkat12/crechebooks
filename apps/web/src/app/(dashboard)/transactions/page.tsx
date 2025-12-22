'use client';

import { Upload, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TransactionTable } from '@/components/transactions';
import { useAuth } from '@/hooks/use-auth';

export default function TransactionsPage() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? '';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Transactions</h1>
          <p className="text-muted-foreground">
            View and categorize bank transactions
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            Import Statement
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <TransactionTable tenantId={tenantId} />
        </CardContent>
      </Card>
    </div>
  );
}

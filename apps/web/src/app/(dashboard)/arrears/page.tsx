'use client';

import { useState } from 'react';
import { AlertTriangle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrearsTable, SendReminderDialog } from '@/components/arrears';
import { useArrearsList, useArrearsSummary } from '@/hooks/use-arrears';
import { formatCurrency } from '@/lib/utils/format';
import type { ArrearsRow } from '@/components/arrears';

export default function ArrearsPage() {
  const [reminderOpen, setReminderOpen] = useState(false);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const { data: arrearsData, isLoading } = useArrearsList();
  const { data: summary } = useArrearsSummary();

  // Map API response to ArrearsRow format
  const arrearsRows: ArrearsRow[] = arrearsData?.arrears.map(a => ({
    id: a.id,
    parentId: a.parentId,
    parentName: a.parentName,
    parentEmail: a.contactEmail ?? '',
    childrenCount: 1,
    totalOutstanding: a.totalOutstanding,
    oldestInvoiceDate: a.oldestInvoiceDate,
    agingBand: a.daysPastDue > 90 ? '90+' : a.daysPastDue > 60 ? '61-90' : a.daysPastDue > 30 ? '31-60' : '1-30' as const,
    lastPaymentDate: a.lastPaymentDate ?? null,
    lastReminderDate: null,
  })) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Arrears Management</h1>
          <p className="text-muted-foreground">
            Track and manage outstanding payments
          </p>
        </div>
        <Button variant="outline">
          <Download className="h-4 w-4 mr-2" />
          Export Report
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(summary?.totalOutstanding ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">90+ Days Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">
              {formatCurrency(summary?.byAgeBucket.days90Plus ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Accounts in Arrears</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.totalAccounts ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <ArrearsTable data={arrearsRows} isLoading={isLoading} />
        </CardContent>
      </Card>

      <SendReminderDialog
        parentId={selectedParentId}
        open={reminderOpen}
        onOpenChange={(open) => {
          setReminderOpen(open);
          if (!open) setSelectedParentId(null);
        }}
      />
    </div>
  );
}

'use client';

import { useState } from 'react';
import { ArrowLeft, Download, Send, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PeriodSelector } from '@/components/sars';
import { useSarsVat201 } from '@/hooks/use-sars-vat201';

function getCurrentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatCentsToZAR(cents: number): string {
  return (cents / 100).toLocaleString('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  });
}

export default function Vat201Page() {
  const [period, setPeriod] = useState(getCurrentPeriod());
  const { data: vatData, isLoading, error, refetch } = useSarsVat201(period);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <p className="text-destructive">{error.message}</p>
        <Button onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  if (!vatData) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">No VAT data available for this period</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/sars">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">VAT201 Return</h1>
            <p className="text-muted-foreground">
              Prepare and submit monthly VAT return to SARS
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button>
            <Send className="h-4 w-4 mr-2" />
            Submit to SARS
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <PeriodSelector
          value={period}
          onChange={setPeriod}
          type="bimonthly"
          label="VAT Period"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCentsToZAR(vatData.standardRatedSalesCents + vatData.zeroRatedSalesCents + vatData.exemptSalesCents)}</div>
            <p className="text-xs text-muted-foreground">Excluding VAT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Output VAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCentsToZAR(vatData.outputVatCents)}</div>
            <p className="text-xs text-muted-foreground">15% on sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Input VAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCentsToZAR(vatData.inputVatCents)}</div>
            <p className="text-xs text-muted-foreground">Claimable</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCentsToZAR(vatData.netVatCents)}</div>
            <p className="text-xs text-muted-foreground">To SARS</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>VAT Calculation Summary</CardTitle>
          <CardDescription>
            Review the VAT calculation before submission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Total Supplies (Sales)</span>
            <span className="font-mono">{formatCentsToZAR(vatData.standardRatedSalesCents + vatData.zeroRatedSalesCents + vatData.exemptSalesCents)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Output VAT @ 15%</span>
            <span className="font-mono text-red-600">{formatCentsToZAR(vatData.outputVatCents)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Total Acquisitions (Purchases)</span>
            <span className="font-mono">{formatCentsToZAR(vatData.standardRatedPurchasesCents + vatData.capitalGoodsCents)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Input VAT (Claimable)</span>
            <span className="font-mono text-green-600">({formatCentsToZAR(vatData.inputVatCents)})</span>
          </div>
          <div className="flex justify-between py-2 font-semibold text-lg">
            <span>Net VAT Payable</span>
            <span className="font-mono">{formatCentsToZAR(vatData.netVatCents)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

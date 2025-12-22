'use client';

import { useState } from 'react';
import { ArrowLeft, Download, Send } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PeriodSelector } from '@/components/sars';
import { formatCurrency } from '@/lib/utils/format';

export default function Vat201Page() {
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  // Mock VAT data - in production this would come from a hook
  const vatData = {
    period,
    totalSales: 150000,
    totalPurchases: 45000,
    outputVat: 22500,
    inputVat: 6750,
    netVat: 15750,
  };

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
            <div className="text-2xl font-bold">{formatCurrency(vatData.totalSales)}</div>
            <p className="text-xs text-muted-foreground">Excluding VAT</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Output VAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(vatData.outputVat)}</div>
            <p className="text-xs text-muted-foreground">15% on sales</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Input VAT</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(vatData.inputVat)}</div>
            <p className="text-xs text-muted-foreground">Claimable</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Net Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(vatData.netVat)}</div>
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
            <span className="font-mono">{formatCurrency(vatData.totalSales)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Output VAT @ 15%</span>
            <span className="font-mono text-red-600">{formatCurrency(vatData.outputVat)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Total Acquisitions (Purchases)</span>
            <span className="font-mono">{formatCurrency(vatData.totalPurchases)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">Input VAT (Claimable)</span>
            <span className="font-mono text-green-600">({formatCurrency(vatData.inputVat)})</span>
          </div>
          <div className="flex justify-between py-2 font-semibold text-lg">
            <span>Net VAT Payable</span>
            <span className="font-mono">{formatCurrency(vatData.netVat)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

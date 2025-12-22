'use client';

import { useState } from 'react';
import { ArrowLeft, Download, Send } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PeriodSelector } from '@/components/sars';
import { formatCurrency } from '@/lib/utils/format';

export default function Emp201Page() {
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );

  // Mock EMP201 data - in production this would come from a hook
  const emp201Data = {
    period,
    totalPaye: 12500,
    totalUif: 850,
    totalSdl: 425,
    employeeCount: 5,
    totalPayable: 13775,
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
            <h1 className="text-3xl font-bold tracking-tight">EMP201 Declaration</h1>
            <p className="text-muted-foreground">
              Prepare and submit monthly employer declaration to SARS
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
          type="monthly"
          label="Pay Period"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">PAYE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(emp201Data.totalPaye)}</div>
            <p className="text-xs text-muted-foreground">Pay As You Earn</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">UIF</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(emp201Data.totalUif)}</div>
            <p className="text-xs text-muted-foreground">Unemployment Insurance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">SDL</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(emp201Data.totalSdl)}</div>
            <p className="text-xs text-muted-foreground">Skills Development</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{formatCurrency(emp201Data.totalPayable)}</div>
            <p className="text-xs text-muted-foreground">{emp201Data.employeeCount} employees</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>EMP201 Summary</CardTitle>
          <CardDescription>
            Review employer contributions before submission
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">PAYE (Employee Tax)</span>
            <span className="font-mono">{formatCurrency(emp201Data.totalPaye)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">UIF (Employee + Employer)</span>
            <span className="font-mono">{formatCurrency(emp201Data.totalUif)}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">SDL (Employer Only)</span>
            <span className="font-mono">{formatCurrency(emp201Data.totalSdl)}</span>
          </div>
          <div className="flex justify-between py-2 font-semibold text-lg">
            <span>Total Amount Due</span>
            <span className="font-mono">{formatCurrency(emp201Data.totalPayable)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment Reference</span>
            <span className="font-mono">EMP201-{period.replace('-', '')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Due Date</span>
            <span>7th of the following month</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Number of Employees</span>
            <span>{emp201Data.employeeCount}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

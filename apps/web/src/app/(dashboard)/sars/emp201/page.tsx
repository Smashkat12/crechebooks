'use client';

import { useState } from 'react';
import { ArrowLeft, Download, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PeriodSelector } from '@/components/sars';
import { formatCurrency } from '@/lib/utils/format';
import { useEMP201 } from '@/hooks/use-sars';
import { downloadEmp201Csv } from '@/lib/api/sars';
import { useToast } from '@/hooks/use-toast';

export default function Emp201Page() {
  const now = new Date();
  const [period, setPeriod] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  );
  const { toast } = useToast();
  const { data: emp201Data, isLoading, error, refetch } = useEMP201(period);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const [year, month] = period.split('-').map(Number);
      const { blob, filename } = await downloadEmp201Csv(year, month);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not generate the EMP201 CSV. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

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
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  if (!emp201Data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-muted-foreground">No EMP201 data available for this period</p>
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
            <h1 className="text-3xl font-bold tracking-tight">EMP201 Declaration</h1>
            <p className="text-muted-foreground">
              Prepare the monthly employer declaration for SARS eFiling
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownload} disabled={isDownloading}>
            <Download className="h-4 w-4 mr-2" />
            {isDownloading ? 'Downloading...' : 'Download'}
          </Button>
        </div>
      </div>

      <Alert>
        <AlertDescription>
          CrecheBooks does not submit EMP201 returns to SARS automatically. Download the CSV
          and file it via the SARS eFiling portal.
        </AlertDescription>
      </Alert>

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
            <div className="text-2xl font-bold text-primary">
              {formatCurrency(emp201Data.totalDue)}
            </div>
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
            <span className="font-mono">{formatCurrency(emp201Data.totalDue)}</span>
          </div>
        </CardContent>
      </Card>

      {emp201Data.validationIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Validation Issues</CardTitle>
            <CardDescription>Review before filing with SARS</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              {emp201Data.validationIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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

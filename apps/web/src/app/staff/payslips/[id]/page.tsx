'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { EarningsTable } from '@/components/staff-portal/earnings-table';
import { DeductionsTable } from '@/components/staff-portal/deductions-table';
import {
  ArrowLeft,
  Download,
  FileText,
  Wallet,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface EarningsItem {
  name: string;
  amount: number;
  hours?: number;
  rate?: number;
}

interface DeductionItem {
  name: string;
  amount: number;
  type: 'tax' | 'uif' | 'pension' | 'medical' | 'other';
}

interface EmployerContribution {
  name: string;
  amount: number;
}

interface PayslipDetail {
  id: string;
  payDate: Date | string;
  period: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  status: 'paid' | 'pending' | 'processing';
  earnings: EarningsItem[];
  deductions: DeductionItem[];
  employerContributions: EmployerContribution[];
  totalEarnings: number;
  totalTax: number;
  totalEmployerContributions: number;
  paymentMethod: string;
  bankAccount?: string;
}

function getMockPayslipDetail(id: string): PayslipDetail {
  const parts = id.split('-');
  const year = parseInt(parts[1]) || new Date().getFullYear();
  const month = parseInt(parts[2]) - 1 || new Date().getMonth();

  return {
    id,
    payDate: new Date(year, month, 25).toISOString(),
    period: new Date(year, month).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
    periodStart: new Date(year, month, 1).toISOString(),
    periodEnd: new Date(year, month + 1, 0).toISOString(),
    grossPay: 18500,
    netPay: 15234.56,
    totalDeductions: 3265.44,
    status: 'paid',
    earnings: [
      { name: 'Basic Salary', amount: 17000 },
      { name: 'Housing Allowance', amount: 1000 },
      { name: 'Transport Allowance', amount: 500 },
    ],
    deductions: [
      { name: 'PAYE Tax', amount: 2475, type: 'tax' },
      { name: 'UIF (Employee)', amount: 148.5, type: 'uif' },
      { name: 'Pension Fund', amount: 555, type: 'pension' },
      { name: 'Medical Aid', amount: 86.94, type: 'medical' },
    ],
    employerContributions: [
      { name: 'UIF (Employer)', amount: 148.5 },
      { name: 'SDL', amount: 185 },
      { name: 'Pension (Employer)', amount: 555 },
    ],
    totalEarnings: 18500,
    totalTax: 2475,
    totalEmployerContributions: 888.5,
    paymentMethod: 'Bank Transfer',
    bankAccount: '****4521',
  };
}

function PayslipDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-12 w-64" />
      <div className="grid sm:grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-48" />
    </div>
  );
}

export default function PayslipDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [isLoading, setIsLoading] = useState(true);
  const [payslip, setPayslip] = useState<PayslipDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchPayslipDetail(token);
  }, [router, id]);

  const fetchPayslipDetail = async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/payslips/${id}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('staff_session_token');
          localStorage.removeItem('staff_name');
          router.push('/staff/login');
          return;
        }
        throw new Error('Failed to fetch payslip');
      }

      const data = await response.json();
      setPayslip(data);
    } catch (err) {
      console.warn('Payslip detail API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setPayslip(getMockPayslipDetail(id));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPdf = async () => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) return;

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/payslips/${id}/pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `payslip-${id}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
      }
    } catch (err) {
      console.error('Download failed:', err);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  if (isLoading) {
    return <PayslipDetailSkeleton />;
  }

  if (!payslip) {
    return (
      <div className="text-center py-12">
        <p>Payslip not found</p>
        <Button variant="link" asChild>
          <Link href="/staff/payslips">Back to Payslips</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/staff/payslips">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{payslip.period}</h1>
            <p className="text-muted-foreground">
              Pay Date: {format(new Date(payslip.payDate), 'dd MMMM yyyy')}
            </p>
          </div>
        </div>
        <Button onClick={handleDownloadPdf}>
          <Download className="h-4 w-4 mr-2" />
          Download PDF
        </Button>
      </div>

      {error && (
        <Alert
          variant="default"
          className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20"
        >
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <Wallet className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gross Pay</p>
                <p className="text-xl font-bold">
                  {formatCurrency(payslip.grossPay)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Deductions</p>
                <p className="text-xl font-bold">
                  {formatCurrency(payslip.totalDeductions)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-200 dark:bg-emerald-800 rounded-lg">
                <Wallet className="h-5 w-5 text-emerald-700 dark:text-emerald-300" />
              </div>
              <div>
                <p className="text-sm text-emerald-700 dark:text-emerald-300">
                  Net Pay
                </p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                  {formatCurrency(payslip.netPay)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Earnings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Earnings</CardTitle>
        </CardHeader>
        <CardContent>
          <EarningsTable
            earnings={payslip.earnings}
            total={payslip.totalEarnings}
          />
        </CardContent>
      </Card>

      {/* Deductions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Deductions</CardTitle>
        </CardHeader>
        <CardContent>
          <DeductionsTable
            deductions={payslip.deductions}
            total={payslip.totalDeductions}
          />
        </CardContent>
      </Card>

      {/* Employer Contributions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Employer Contributions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {payslip.employerContributions.map((contribution, i) => (
              <div
                key={i}
                className="flex justify-between py-2 border-b last:border-0"
              >
                <span className="text-muted-foreground">{contribution.name}</span>
                <span className="font-medium">
                  {formatCurrency(contribution.amount)}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-semibold">
              <span>Total Employer Contributions</span>
              <span>{formatCurrency(payslip.totalEmployerContributions)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Payment Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Payment Method</p>
              <p className="font-medium">{payslip.paymentMethod}</p>
            </div>
            {payslip.bankAccount && (
              <div>
                <p className="text-sm text-muted-foreground">Bank Account</p>
                <p className="font-medium">{payslip.bankAccount}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

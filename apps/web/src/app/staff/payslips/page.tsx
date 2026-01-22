'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PayslipList } from '@/components/staff-portal/payslip-list';
import { PayslipCard } from '@/components/staff-portal/payslip-card';
import { FileText, Filter, AlertCircle } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

interface PayslipSummary {
  id: string;
  payDate: Date | string;
  period: string;
  periodStart: Date | string;
  periodEnd: Date | string;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  status: 'paid' | 'pending' | 'processing';
}

function getMockPayslips(year: number): PayslipSummary[] {
  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();
  const months = year === currentYear ? currentMonth + 1 : 12;

  return Array.from({ length: months }, (_, i) => ({
    id: `ps-${year}-${String(i + 1).padStart(2, '0')}`,
    payDate: new Date(year, i, 25).toISOString(),
    period: new Date(year, i).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    }),
    periodStart: new Date(year, i, 1).toISOString(),
    periodEnd: new Date(year, i + 1, 0).toISOString(),
    grossPay: 18500,
    netPay: 15234.56,
    totalDeductions: 3265.44,
    status: 'paid' as const,
  })).reverse();
}

function PayslipsSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(6)].map((_, i) => (
        <Skeleton key={i} className="h-20" />
      ))}
    </div>
  );
}

export default function StaffPayslipsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [payslips, setPayslips] = useState<PayslipSummary[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>(
    new Date().getFullYear().toString()
  );
  const [error, setError] = useState<string | null>(null);

  const years = Array.from({ length: 5 }, (_, i) =>
    (new Date().getFullYear() - i).toString()
  );

  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchPayslips(token, selectedYear);
  }, [router, selectedYear]);

  const fetchPayslips = async (token: string, year: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/payslips?year=${year}`,
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
        throw new Error('Failed to fetch payslips');
      }

      const data = await response.json();
      setPayslips(data.data);
    } catch (err) {
      console.warn('Payslips API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setPayslips(getMockPayslips(parseInt(year)));
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewPayslip = (id: string) => {
    router.push(`/staff/payslips/${id}`);
  };

  const handleDownloadPdf = async (id: string) => {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold">My Payslips</h1>
          <p className="text-muted-foreground">
            View and download your payslips
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map((year) => (
                <SelectItem key={year} value={year}>
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      {isLoading ? (
        <PayslipsSkeleton />
      ) : payslips.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">No payslips found</p>
            <p className="text-muted-foreground">
              No payslips available for {selectedYear}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop Table View */}
          <div className="hidden md:block">
            <PayslipList
              payslips={payslips}
              onView={handleViewPayslip}
              onDownload={handleDownloadPdf}
            />
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-3">
            {payslips.map((payslip) => (
              <PayslipCard
                key={payslip.id}
                payslip={payslip}
                onView={() => handleViewPayslip(payslip.id)}
                onDownload={() => handleDownloadPdf(payslip.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

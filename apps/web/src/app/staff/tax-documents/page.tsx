'use client';

/**
 * Staff Tax Documents Page
 * TASK-PORTAL-025: Staff Portal Tax Documents and Profile
 *
 * Main page for staff tax documents (IRP5 certificates) with:
 * - List of available IRP5 certificates by tax year
 * - Tax year filter/selector
 * - PDF download functionality
 * - Status indicators for each certificate
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { IRP5List, type IRP5Document } from '@/components/staff-portal/irp5-list';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ============================================================================
// Types
// ============================================================================

interface IRP5Response {
  data: IRP5Document[];
  total: number;
  availableYears: number[];
}

// ============================================================================
// Mock Data (for development)
// ============================================================================

function getMockIRP5Data(): IRP5Response {
  const currentYear = new Date().getFullYear();
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3, currentYear - 4];

  const documents: IRP5Document[] = years.map((year, index) => ({
    id: `irp5-${year}-001`,
    taxYear: year,
    taxYearPeriod: `${year - 1}/${year}`,
    status: index === 0 ? 'pending' : 'available' as const,
    availableDate: new Date(year, 2, 1), // March 1st of tax year
    referenceNumber: index === 0 ? undefined : `IRP5/${year}/${Math.floor(100000 + Math.random() * 900000)}`,
    lastDownloadDate: index > 0 && index < 3 ? new Date(year, 3 + Math.floor(Math.random() * 3), Math.floor(1 + Math.random() * 28)) : undefined,
  }));

  return {
    data: documents,
    total: documents.length,
    availableYears: years,
  };
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function PageSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-12 w-full max-w-md" />
      <Skeleton className="h-24" />
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export default function StaffTaxDocumentsPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [irp5Data, setIrp5Data] = useState<IRP5Response | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | undefined>(undefined);

  // Fetch IRP5 documents
  const fetchDocuments = useCallback(async (token: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (selectedYear) {
        params.set('taxYear', selectedYear.toString());
      }

      const response = await fetch(
        `${API_URL}/api/staff-portal/documents/irp5${params.toString() ? `?${params}` : ''}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (response.ok) {
        const data = await response.json();
        setIrp5Data(data);
      } else {
        throw new Error('Failed to fetch tax documents');
      }
    } catch (err) {
      console.warn('IRP5 API error, using mock data:', err);
      setError('Unable to connect to server. Showing sample data.');
      setIrp5Data(getMockIRP5Data());
    } finally {
      setIsLoading(false);
    }
  }, [router, selectedYear]);

  // Initial load
  useEffect(() => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }
    fetchDocuments(token);
  }, [router, fetchDocuments]);

  // Handle year change
  const handleYearChange = (year: number | undefined) => {
    setSelectedYear(year);
  };

  // Handle PDF download
  const handleDownload = async (id: string) => {
    const token = localStorage.getItem('staff_session_token');
    if (!token) {
      router.push('/staff/login');
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/api/staff-portal/documents/irp5/${id}/pdf`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem('staff_session_token');
        localStorage.removeItem('staff_name');
        router.push('/staff/login');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = `irp5-${id}.pdf`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }

      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // Mock download for development
      if (error?.includes('sample data')) {
        const doc = irp5Data?.data.find((d) => d.id === id);
        if (doc) {
          // Create a mock PDF blob
          const mockContent = `%PDF-1.4\n%Mock IRP5 Certificate\n%Tax Year: ${doc.taxYearPeriod}\n%%EOF`;
          const blob = new Blob([mockContent], { type: 'application/pdf' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.setAttribute('download', `IRP5-${doc.taxYearPeriod.replace('/', '-')}.pdf`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
        }
        return;
      }
      console.error('Download error:', err);
    }
  };

  // Refresh handler
  const handleRefresh = () => {
    const token = localStorage.getItem('staff_session_token');
    if (token) {
      fetchDocuments(token);
    }
  };

  if (isLoading) {
    return <PageSkeleton />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/staff/dashboard">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Tax Documents</h1>
            <p className="text-muted-foreground">
              Download your IRP5 tax certificates
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="default" className="border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20">
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
          <AlertDescription className="text-yellow-800 dark:text-yellow-200">
            {error}
          </AlertDescription>
        </Alert>
      )}

      {/* IRP5 List */}
      {irp5Data && (
        <IRP5List
          documents={irp5Data.data}
          availableYears={irp5Data.availableYears}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          onDownload={handleDownload}
        />
      )}
    </div>
  );
}

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
import { AlertCircle, ArrowLeft, FileText, RefreshCw } from 'lucide-react';
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
        `${API_URL}/api/v1/staff-portal/documents/irp5${params.toString() ? `?${params}` : ''}`,
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
      console.error('IRP5 API error:', err);
      setError('Unable to load tax documents. Please try refreshing.');
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
        `${API_URL}/api/v1/staff-portal/documents/irp5/${id}/pdf`,
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
      console.error('Download error:', err);
      setError('Failed to download document. Please try again.');
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
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* IRP5 List or empty state */}
      {irp5Data && irp5Data.total > 0 ? (
        <IRP5List
          documents={irp5Data.data}
          availableYears={irp5Data.availableYears}
          selectedYear={selectedYear}
          onYearChange={handleYearChange}
          onDownload={handleDownload}
        />
      ) : !error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <FileText className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">No tax documents yet</h2>
          <p className="text-muted-foreground max-w-sm">
            IRP5 certificates are issued annually by your employer in March/April. They will appear
            here once available.
          </p>
        </div>
      )}
    </div>
  );
}

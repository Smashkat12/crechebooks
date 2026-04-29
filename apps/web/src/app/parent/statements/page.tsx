'use client';

/**
 * Parent Portal Statements Page
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Displays account statements for the logged-in parent with:
 * - Page title "Account Statements"
 * - Year/month selection via MonthPicker
 * - Statement list showing available periods
 * - Statement preview with transactions
 * - PDF download and email options
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileBarChart2, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { StatementList } from '@/components/parent-portal/statement-list';
import { StatementPreview } from '@/components/parent-portal/statement-preview';
import { MonthPicker } from '@/components/parent-portal/month-picker';
import {
  useParentStatements,
  useParentStatement,
} from '@/hooks/parent-portal/use-parent-statements';

function StatementsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse year/month from URL or use current
  const currentDate = new Date();
  const urlYear = searchParams.get('year');
  const urlMonth = searchParams.get('month');

  const [selectedYear, setSelectedYear] = useState<number>(
    urlYear ? parseInt(urlYear, 10) : currentDate.getFullYear()
  );
  const [selectedMonth, setSelectedMonth] = useState<number | null>(
    urlMonth ? parseInt(urlMonth, 10) : null
  );

  // Fetch statements list for the selected year
  const {
    data: statementsData,
    isLoading: statementsLoading,
    error: statementsError,
    isError: isStatementsError,
  } = useParentStatements(selectedYear);

  // Fetch specific statement detail when month is selected
  const {
    data: statementDetail,
    isLoading: detailLoading,
    error: detailError,
    isError: isDetailError,
  } = useParentStatement(
    selectedYear,
    selectedMonth || 0,
    !!selectedMonth
  );

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  if (isStatementsError) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {statementsError?.message || 'Unable to load your statements. Please try again.'}
          </AlertDescription>
        </Alert>
        <Button
          className="mt-4 w-full"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  const statements = statementsData?.statements || [];

  // Handle year change
  const handleYearChange = (year: number) => {
    setSelectedYear(year);
    setSelectedMonth(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', String(year));
    params.delete('month');
    router.push(`/parent/statements?${params.toString()}`);
  };

  // Handle month selection
  const handleMonthSelect = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    const params = new URLSearchParams(searchParams.toString());
    params.set('year', String(year));
    params.set('month', String(month));
    router.push(`/parent/statements?${params.toString()}`);
  };

  // Handle statement selection from list
  const handleStatementSelect = (year: number, month: number) => {
    handleMonthSelect(year, month);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileBarChart2 className="h-6 w-6" />
          Account Statements
        </h1>
        <p className="text-muted-foreground mt-1">
          View and download your monthly account statements
        </p>
      </div>

      {/* Year/Month Selection */}
      <MonthPicker
        selectedYear={selectedYear}
        selectedMonth={selectedMonth}
        onYearChange={handleYearChange}
        onMonthSelect={handleMonthSelect}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Statement List */}
        <div className="lg:col-span-1">
          <StatementList
            statements={statements}
            isLoading={statementsLoading}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            onSelectStatement={handleStatementSelect}
          />
        </div>

        {/* Statement Preview */}
        <div className="lg:col-span-2">
          {selectedMonth ? (
            <StatementPreview
              year={selectedYear}
              month={selectedMonth}
              statement={statementDetail}
              isLoading={detailLoading}
              error={isDetailError ? detailError : undefined}
            />
          ) : (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <FileBarChart2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <h3 className="text-lg font-medium mb-2">Select a Statement</h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                Choose a month from the list or use the month picker above to view your statement details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Loading fallback for Suspense
function StatementsLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Main page component with Suspense boundary for useSearchParams
export default function ParentStatementsPage() {
  return (
    <Suspense fallback={<StatementsLoadingFallback />}>
      <StatementsPageContent />
    </Suspense>
  );
}

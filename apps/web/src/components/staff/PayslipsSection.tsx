'use client';

/**
 * Payslips Section Component
 * TASK-WEB-048: Display imported payslips for a staff member
 *
 * Shows payslip history in a table with download PDF functionality.
 * Initially displays 3 payslips with expand/collapse capability.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Download, FileText, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { useImportedPayslips, useDownloadPayslipPdf } from '@/hooks/use-simplepay';
import { format } from 'date-fns';

interface PayslipsSectionProps {
  staffId: string;
}

const INITIAL_DISPLAY_COUNT = 3;

export function PayslipsSection({ staffId }: PayslipsSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading, error } = useImportedPayslips(staffId);
  const downloadPdfMutation = useDownloadPayslipPdf();

  const payslips = data?.data ?? [];
  const displayedPayslips = expanded ? payslips : payslips.slice(0, INITIAL_DISPLAY_COUNT);
  const hasMorePayslips = payslips.length > INITIAL_DISPLAY_COUNT;

  const handleDownloadPdf = async (payslipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await downloadPdfMutation.mutateAsync(payslipId);
    } catch {
      // Error handled by mutation
    }
  };

  // Track which payslip is currently downloading
  const downloadingPayslipId = downloadPdfMutation.isPending ? downloadPdfMutation.variables : null;

  const formatPeriod = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${format(startDate, 'dd MMM')} - ${format(endDate, 'dd MMM yyyy')}`;
  };

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(cents / 100);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payslips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading payslips...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payslips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-destructive">
            <p>Failed to load payslips</p>
            <p className="text-sm text-muted-foreground mt-1">
              Please try again later
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (payslips.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payslips
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No payslips imported yet</p>
            <p className="text-sm mt-1">
              Payslips will appear here once imported from SimplePay
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Payslips
          </div>
          <span className="text-sm font-normal text-muted-foreground">
            {payslips.length} payslip{payslips.length !== 1 ? 's' : ''}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead>Imported</TableHead>
              <TableHead className="text-right">Net Pay</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayedPayslips.map((payslip) => (
              <TableRow key={payslip.id}>
                <TableCell className="font-medium">
                  {formatPeriod(payslip.payPeriodStart, payslip.payPeriodEnd)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {format(new Date(payslip.importedAt), 'dd MMM yyyy')}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(payslip.netSalaryCents)}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => handleDownloadPdf(payslip.id, e)}
                    disabled={downloadingPayslipId === payslip.id}
                    aria-label={`Download payslip for ${formatPeriod(payslip.payPeriodStart, payslip.payPeriodEnd)}`}
                    title="Download PDF"
                  >
                    {downloadingPayslipId === payslip.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="sr-only">Download PDF</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {hasMorePayslips && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="text-muted-foreground hover:text-foreground"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Show less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show all {payslips.length} payslips
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

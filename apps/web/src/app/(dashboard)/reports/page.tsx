'use client';

import { useState } from 'react';
import { FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  ReportSelector,
  DateRangePicker,
  ExportButtons,
} from '@/components/reports';
import type { DateRange, ExportFormat } from '@/components/reports';
import { ReportType } from '@crechebooks/types';

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<ReportType>(ReportType.INCOME_STATEMENT);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  const handleExport = async (format: ExportFormat): Promise<void> => {
    console.log('Export:', selectedReport, format, dateRange);
    // TODO: Implement actual export logic
  };

  const getReportTitle = () => {
    switch (selectedReport) {
      case ReportType.INCOME_STATEMENT:
        return 'Income Statement';
      case ReportType.AGED_RECEIVABLES:
        return 'Aged Receivables';
      case ReportType.VAT_REPORT:
        return 'VAT Report';
      case ReportType.CASH_FLOW:
        return 'Cash Flow';
      case ReportType.BALANCE_SHEET:
        return 'Balance Sheet';
      case ReportType.AGED_PAYABLES:
        return 'Aged Payables';
      default:
        return '';
    }
  };

  const getReportDescription = () => {
    switch (selectedReport) {
      case ReportType.INCOME_STATEMENT:
        return 'Revenue and expense summary';
      case ReportType.AGED_RECEIVABLES:
        return 'Outstanding payment analysis';
      case ReportType.VAT_REPORT:
        return 'VAT collection and claims';
      case ReportType.CASH_FLOW:
        return 'Cash inflows and outflows';
      case ReportType.BALANCE_SHEET:
        return 'Assets, liabilities, and equity';
      case ReportType.AGED_PAYABLES:
        return 'Outstanding bills analysis';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="text-muted-foreground">
          Generate financial reports and analytics
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Report Type</CardTitle>
          <CardDescription>Choose a report to generate</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportSelector
            selectedType={selectedReport}
            onSelect={setSelectedReport}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-4 items-end">
        <div className="space-y-2">
          <label className="text-sm font-medium">Date Range</label>
          <DateRangePicker
            value={dateRange}
            onChange={setDateRange}
          />
        </div>
        <ExportButtons onExport={handleExport} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {getReportTitle()}
          </CardTitle>
          <CardDescription>{getReportDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Select a date range and generate the report to see data here
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

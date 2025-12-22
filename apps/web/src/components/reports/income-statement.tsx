'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils/format';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';
import type { IReportData } from '@crechebooks/types';

interface IncomeStatementProps {
  data: IReportData;
  period: {
    start: Date;
    end: Date;
  };
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

export function IncomeStatement({ data, period, tenantName, onExport }: IncomeStatementProps) {
  // Group sections by type
  const revenueSection = data.sections.find((s) => s.name.toLowerCase().includes('revenue') || s.name.toLowerCase().includes('income'));
  const expenseSection = data.sections.find((s) => s.name.toLowerCase().includes('expense'));
  const otherSections = data.sections.filter(
    (s) => s !== revenueSection && s !== expenseSection
  );

  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1">
          <ReportHeader
            title="Income Statement"
            tenantName={tenantName}
            periodStart={period.start}
            periodEnd={period.end}
          />
        </div>
        {onExport && <ExportButtons onExport={handleExport} />}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Revenue Section */}
        {revenueSection && (
          <div>
            <h3 className="font-semibold text-lg mb-3">Revenue</h3>
            <div className="space-y-2">
              {revenueSection.items.map((item, index) => (
                <div key={index} className="flex justify-between py-1">
                  <div className="flex gap-4">
                    <span className="font-mono text-sm text-muted-foreground w-16">
                      {item.accountCode}
                    </span>
                    <span>{item.accountName}</span>
                  </div>
                  <span className="font-mono">{formatCurrency(item.amount / 100)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total Revenue</span>
              <span className="font-mono text-green-600">
                {formatCurrency(revenueSection.total / 100)}
              </span>
            </div>
          </div>
        )}

        {/* Expenses Section */}
        {expenseSection && (
          <div>
            <h3 className="font-semibold text-lg mb-3">Expenses</h3>
            <div className="space-y-2">
              {expenseSection.items.map((item, index) => (
                <div key={index} className="flex justify-between py-1">
                  <div className="flex gap-4">
                    <span className="font-mono text-sm text-muted-foreground w-16">
                      {item.accountCode}
                    </span>
                    <span>{item.accountName}</span>
                  </div>
                  <span className="font-mono">{formatCurrency(item.amount / 100)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total Expenses</span>
              <span className="font-mono text-red-600">
                ({formatCurrency(expenseSection.total / 100)})
              </span>
            </div>
          </div>
        )}

        {/* Other Sections */}
        {otherSections.map((section, sectionIndex) => (
          <div key={sectionIndex}>
            <h3 className="font-semibold text-lg mb-3">{section.name}</h3>
            <div className="space-y-2">
              {section.items.map((item, index) => (
                <div key={index} className="flex justify-between py-1">
                  <div className="flex gap-4">
                    <span className="font-mono text-sm text-muted-foreground w-16">
                      {item.accountCode}
                    </span>
                    <span>{item.accountName}</span>
                  </div>
                  <span className="font-mono">{formatCurrency(item.amount / 100)}</span>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
            <div className="flex justify-between font-semibold">
              <span>Total {section.name}</span>
              <span className="font-mono">{formatCurrency(section.total / 100)}</span>
            </div>
          </div>
        ))}

        {/* Net Profit/Loss */}
        <div className="bg-primary/5 rounded-lg p-4 mt-6">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold">
              Net {data.summary.netProfit >= 0 ? 'Profit' : 'Loss'}
            </span>
            <span
              className={`text-2xl font-bold font-mono ${
                data.summary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(data.summary.netProfit / 100)}
            </span>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="grid grid-cols-3 gap-4 text-sm border-t pt-4">
          <div>
            <p className="text-muted-foreground">Total Income</p>
            <p className="font-semibold font-mono">
              {formatCurrency(data.summary.totalIncome / 100)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Total Expenses</p>
            <p className="font-semibold font-mono">
              {formatCurrency(data.summary.totalExpenses / 100)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Profit Margin</p>
            <p className="font-semibold">
              {data.summary.totalIncome > 0
                ? ((data.summary.netProfit / data.summary.totalIncome) * 100).toFixed(1)
                : 0}
              %
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

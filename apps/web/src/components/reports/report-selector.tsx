'use client';

import { FileText, Receipt, Users, TrendingUp, CreditCard, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ReportType } from '@crechebooks/types';

interface ReportOption {
  type: ReportType;
  title: string;
  description: string;
  icon: React.ReactNode;
}

const reportOptions: ReportOption[] = [
  {
    type: ReportType.INCOME_STATEMENT,
    title: 'Income Statement',
    description: 'Revenue, expenses, and net profit summary',
    icon: <TrendingUp className="h-6 w-6" />,
  },
  {
    type: ReportType.AGED_RECEIVABLES,
    title: 'Aged Receivables',
    description: 'Outstanding invoices by age bucket',
    icon: <Receipt className="h-6 w-6" />,
  },
  {
    type: ReportType.VAT_REPORT,
    title: 'VAT Report',
    description: 'VAT collected and paid for SARS submissions',
    icon: <FileText className="h-6 w-6" />,
  },
  {
    type: ReportType.CASH_FLOW,
    title: 'Cash Flow',
    description: 'Cash inflows and outflows over the period',
    icon: <Wallet className="h-6 w-6" />,
  },
  {
    type: ReportType.BALANCE_SHEET,
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity snapshot',
    icon: <CreditCard className="h-6 w-6" />,
  },
  {
    type: ReportType.AGED_PAYABLES,
    title: 'Aged Payables',
    description: 'Outstanding bills by age bucket',
    icon: <Users className="h-6 w-6" />,
  },
];

interface ReportSelectorProps {
  selectedType?: ReportType;
  onSelect: (type: ReportType) => void;
}

export function ReportSelector({ selectedType, onSelect }: ReportSelectorProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {reportOptions.map((option) => (
        <Card
          key={option.type}
          className={cn(
            'cursor-pointer transition-all hover:border-primary hover:shadow-md',
            selectedType === option.type && 'border-primary bg-primary/5 ring-2 ring-primary'
          )}
          onClick={() => onSelect(option.type)}
        >
          <CardHeader className="flex flex-row items-center gap-4 space-y-0 pb-2">
            <div
              className={cn(
                'rounded-lg p-2',
                selectedType === option.type
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              )}
            >
              {option.icon}
            </div>
            <div>
              <CardTitle className="text-base">{option.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CardDescription>{option.description}</CardDescription>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

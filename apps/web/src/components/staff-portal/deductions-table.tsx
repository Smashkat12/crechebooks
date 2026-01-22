'use client';

import { Badge } from '@/components/ui/badge';

interface DeductionItem {
  name: string;
  amount: number;
  type: string;
}

interface DeductionsTableProps {
  deductions: DeductionItem[];
  total: number;
}

export function DeductionsTable({ deductions, total }: DeductionsTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  const typeLabels: Record<string, string> = {
    tax: 'TAX',
    uif: 'UIF',
    pension: 'PENSION',
    medical: 'MEDICAL',
    other: 'OTHER',
  };

  const typeColors: Record<string, string> = {
    tax: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    uif: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    pension:
      'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
    medical:
      'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    other: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300',
  };

  return (
    <div className="space-y-2">
      {deductions.map((item, i) => (
        <div
          key={i}
          className="flex justify-between items-center py-2 border-b"
        >
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">{item.name}</span>
            <Badge
              variant="outline"
              className={typeColors[item.type] || typeColors.other}
            >
              {typeLabels[item.type] || item.type.toUpperCase()}
            </Badge>
          </div>
          <span className="font-medium text-red-600 dark:text-red-400">
            -{formatCurrency(item.amount)}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-2 font-semibold text-lg">
        <span>Total Deductions</span>
        <span className="text-red-600 dark:text-red-400">
          -{formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

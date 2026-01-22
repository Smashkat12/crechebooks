'use client';

interface EarningsItem {
  name: string;
  amount: number;
  hours?: number;
  rate?: number;
}

interface EarningsTableProps {
  earnings: EarningsItem[];
  total: number;
}

export function EarningsTable({ earnings, total }: EarningsTableProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
    }).format(amount);
  };

  return (
    <div className="space-y-2">
      {earnings.map((item, i) => (
        <div key={i} className="flex justify-between py-2 border-b">
          <div>
            <span className="text-muted-foreground">{item.name}</span>
            {item.hours && item.rate && (
              <span className="text-xs text-muted-foreground ml-2">
                ({item.hours}hrs @ {formatCurrency(item.rate)}/hr)
              </span>
            )}
          </div>
          <span className="font-medium text-emerald-600 dark:text-emerald-400">
            {formatCurrency(item.amount)}
          </span>
        </div>
      ))}
      <div className="flex justify-between pt-2 font-semibold text-lg">
        <span>Total Earnings</span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

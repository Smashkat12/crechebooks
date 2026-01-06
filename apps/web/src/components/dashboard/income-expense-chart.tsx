'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart } from '@/components/charts';

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

interface IncomeExpenseChartProps {
  data: MonthlyData[];
  isLoading?: boolean;
}

// Format YYYY-MM to readable month label (e.g., "Oct 2025")
function formatMonthLabel(dateStr: string): string {
  if (!dateStr || !dateStr.includes('-')) return dateStr;
  const [year, month] = dateStr.split('-');
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex > 11) return dateStr;
  return `${monthNames[monthIndex]} ${year}`;
}

export function IncomeExpenseChart({ data, isLoading = false }: IncomeExpenseChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Income vs Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  // Transform data for chart format with readable month labels
  // Note: Data is already in rands from the API, no conversion needed
  const chartData = data.map((d) => ({
    name: formatMonthLabel(d.month),
    income: d.income,
    expenses: Math.abs(d.expenses),
  }));

  const bars = [
    { dataKey: 'income', name: 'Income', color: 'hsl(142.1 76.2% 36.3%)' },
    { dataKey: 'expenses', name: 'Expenses', color: 'hsl(0 84.2% 60.2%)' },
  ];

  // Get period range for description
  const periodDescription = chartData.length > 0
    ? `${chartData[0]?.name} - ${chartData[chartData.length - 1]?.name}`
    : 'No data available';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs Expenses</CardTitle>
        <CardDescription>{periodDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <BarChart
          data={chartData}
          bars={bars}
          height={300}
          showGrid
          showLegend
        />
      </CardContent>
    </Card>
  );
}

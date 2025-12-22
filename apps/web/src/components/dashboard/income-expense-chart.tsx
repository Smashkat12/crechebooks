'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

  // Transform data for chart format
  const chartData = data.map((d) => ({
    name: d.month,
    income: d.income / 100, // Convert cents to rands
    expenses: Math.abs(d.expenses) / 100,
  }));

  const bars = [
    { dataKey: 'income', name: 'Income', color: 'hsl(142.1 76.2% 36.3%)' },
    { dataKey: 'expenses', name: 'Expenses', color: 'hsl(0 84.2% 60.2%)' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs Expenses</CardTitle>
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

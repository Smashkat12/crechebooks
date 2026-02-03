'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Trend Chart
 * Displays cash flow trends over time using an area chart
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { CashFlowTrendPeriod } from '@/hooks/use-cash-flow';

interface CashFlowChartProps {
  data: CashFlowTrendPeriod[];
}

/**
 * Format amount in ZAR (South African Rand)
 * Values are in Rand (already converted from cents)
 */
function formatZAR(rands: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(rands);
}

/**
 * Format axis tick as compact number (e.g., R10k, R1M)
 */
function formatAxisTick(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `R${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `R${(value / 1000).toFixed(0)}k`;
  }
  return `R${value}`;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number;
    color: string;
  }>;
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  return (
    <div className="bg-background border rounded-lg shadow-lg p-3">
      <p className="font-medium mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center justify-between gap-4 text-sm">
          <span style={{ color: entry.color }}>{entry.name}:</span>
          <span className="font-mono">{formatZAR(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

export function CashFlowChart({ data }: CashFlowChartProps) {
  // Transform data from cents to Rand for chart display
  const chartData = data.map((period) => ({
    period: period.period,
    Operating: period.operatingCents / 100,
    Investing: period.investingCents / 100,
    Financing: period.financingCents / 100,
    'Net Change': period.netChangeCents / 100,
    'Cash Balance': period.closingBalanceCents / 100,
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Trend</CardTitle>
        <CardDescription>
          Track cash movements by activity type over time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="stacked" className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="stacked">Stacked View</TabsTrigger>
            <TabsTrigger value="comparison">Comparison</TabsTrigger>
            <TabsTrigger value="balance">Cash Balance</TabsTrigger>
          </TabsList>

          <TabsContent value="stacked">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisTick}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Operating"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="Investing"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Area
                  type="monotone"
                  dataKey="Financing"
                  stackId="1"
                  stroke="#a855f7"
                  fill="#a855f7"
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="comparison">
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisTick}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Bar dataKey="Operating" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Investing" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Financing" fill="#a855f7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </TabsContent>

          <TabsContent value="balance">
            <ResponsiveContainer width="100%" height={400}>
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tickFormatter={formatAxisTick}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="Net Change"
                  stroke="#f97316"
                  fill="#f97316"
                  fillOpacity={0.3}
                />
                <Area
                  type="monotone"
                  dataKey="Cash Balance"
                  stroke="#06b6d4"
                  fill="#06b6d4"
                  fillOpacity={0.3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface CashFlowBreakdownChartProps {
  operatingCents: number;
  investingCents: number;
  financingCents: number;
}

export function CashFlowBreakdownChart({
  operatingCents,
  investingCents,
  financingCents,
}: CashFlowBreakdownChartProps) {
  const data = [
    { name: 'Operating', value: operatingCents / 100, fill: '#22c55e' },
    { name: 'Investing', value: investingCents / 100, fill: '#3b82f6' },
    { name: 'Financing', value: financingCents / 100, fill: '#a855f7' },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Breakdown</CardTitle>
        <CardDescription>Current period cash flow by activity type</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 80, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
            <XAxis type="number" tickFormatter={formatAxisTick} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={70} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

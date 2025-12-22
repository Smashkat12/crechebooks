"use client";

import React from "react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

export interface BarData {
  name: string;
  [key: string]: string | number;
}

export interface BarConfig {
  dataKey: string;
  name: string;
  color?: string;
  stackId?: string;
}

interface BarChartProps {
  data: BarData[];
  bars: BarConfig[];
  xAxisKey?: string;
  height?: number;
  layout?: "horizontal" | "vertical";
  showGrid?: boolean;
  showLegend?: boolean;
  stacked?: boolean;
  formatValue?: (value: number) => string;
  formatTooltip?: (value: number) => string;
  className?: string;
}

// Default chart colors using CSS variables
const DEFAULT_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--secondary))",
  "hsl(var(--accent))",
  "hsl(var(--destructive))",
  "hsl(142.1 76.2% 36.3%)", // success green
  "hsl(47.9 95.8% 53.1%)", // warning yellow
];

export function BarChart({
  data,
  bars,
  xAxisKey = "name",
  height = 350,
  layout = "horizontal",
  showGrid = true,
  showLegend = true,
  stacked = false,
  formatValue,
  formatTooltip,
  className,
}: BarChartProps) {
  const stackId = stacked ? "stack" : undefined;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          layout={layout}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
              opacity={0.3}
            />
          )}
          {layout === "horizontal" ? (
            <>
              <XAxis
                dataKey={xAxisKey}
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatValue}
              />
            </>
          ) : (
            <>
              <XAxis
                type="number"
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                tickFormatter={formatValue}
              />
              <YAxis
                type="category"
                dataKey={xAxisKey}
                className="text-xs"
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
              />
            </>
          )}
          <Tooltip
            content={<ChartTooltip formatValue={formatTooltip || formatValue} />}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: "20px",
              }}
            />
          )}
          {bars.map((bar, index) => (
            <Bar
              key={bar.dataKey}
              dataKey={bar.dataKey}
              name={bar.name}
              fill={bar.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              stackId={bar.stackId || stackId}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

"use client";

import React from "react";
import {
  LineChart as RechartsLineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

export interface LineData {
  name: string;
  [key: string]: string | number;
}

export interface LineConfig {
  dataKey: string;
  name: string;
  color?: string;
  strokeWidth?: number;
}

interface LineChartProps {
  data: LineData[];
  lines: LineConfig[];
  xAxisKey?: string;
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
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

export function LineChart({
  data,
  lines,
  xAxisKey = "name",
  height = 350,
  showGrid = true,
  showLegend = true,
  formatValue,
  formatTooltip,
  className,
}: LineChartProps) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart
          data={data}
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
          <Tooltip
            content={<ChartTooltip formatValue={formatTooltip || formatValue} />}
          />
          {showLegend && (
            <Legend
              wrapperStyle={{
                paddingTop: "20px",
              }}
              iconType="line"
            />
          )}
          {lines.map((line, index) => (
            <Line
              key={line.dataKey}
              type="monotone"
              dataKey={line.dataKey}
              name={line.name}
              stroke={line.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              strokeWidth={line.strokeWidth || 2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

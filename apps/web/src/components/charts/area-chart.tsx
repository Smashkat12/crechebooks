"use client";

import React from "react";
import {
  AreaChart as RechartsAreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

export interface AreaData {
  name: string;
  [key: string]: string | number;
}

export interface AreaConfig {
  dataKey: string;
  name: string;
  color?: string;
  stackId?: string;
}

interface AreaChartProps {
  data: AreaData[];
  areas: AreaConfig[];
  xAxisKey?: string;
  height?: number;
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

export function AreaChart({
  data,
  areas,
  xAxisKey = "name",
  height = 350,
  showGrid = true,
  showLegend = true,
  stacked = false,
  formatValue,
  formatTooltip,
  className,
}: AreaChartProps) {
  const stackId = stacked ? "stack" : undefined;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsAreaChart
          data={data}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <defs>
            {areas.map((area, index) => {
              const color = area.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
              return (
                <linearGradient
                  key={`gradient-${area.dataKey}`}
                  id={`color-${area.dataKey}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                </linearGradient>
              );
            })}
          </defs>
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
              iconType="rect"
            />
          )}
          {areas.map((area, index) => {
            const color = area.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
            return (
              <Area
                key={area.dataKey}
                type="monotone"
                dataKey={area.dataKey}
                name={area.name}
                stackId={area.stackId || stackId}
                stroke={color}
                fill={`url(#color-${area.dataKey})`}
                strokeWidth={2}
              />
            );
          })}
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  );
}

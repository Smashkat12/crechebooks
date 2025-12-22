"use client";

import React from "react";
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label,
} from "recharts";
import { ChartTooltip } from "./chart-tooltip";

export interface PieData {
  name: string;
  value: number;
  color?: string;
}

interface PieChartProps {
  data: PieData[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  showLegend?: boolean;
  showLabels?: boolean;
  showPercentages?: boolean;
  centerLabel?: string;
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
  "hsl(280 100% 70%)", // purple
  "hsl(340 82% 52%)", // pink
];

const RADIAN = Math.PI / 180;

interface LabelProps {
  cx: number;
  cy: number;
  midAngle: number;
  innerRadius: number;
  outerRadius: number;
  percent: number;
  name: string;
}

const renderCustomizedLabel = ({
  cx,
  cy,
  midAngle,
  innerRadius,
  outerRadius,
  percent,
  name: _name,
}: LabelProps) => {
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="white"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      className="text-xs font-medium"
    >
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
};

export function PieChart({
  data,
  height = 350,
  innerRadius = 0,
  outerRadius = 100,
  showLegend = true,
  showLabels = false,
  showPercentages = true,
  centerLabel,
  formatValue,
  formatTooltip,
  className,
}: PieChartProps) {
  const isDonut = innerRadius > 0;

  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            labelLine={showLabels}
            label={showLabels && showPercentages ? renderCustomizedLabel : undefined}
            outerRadius={outerRadius}
            innerRadius={innerRadius}
            fill="#8884d8"
            dataKey="value"
            paddingAngle={2}
          >
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              />
            ))}
            {isDonut && centerLabel && (
              <Label
                value={centerLabel}
                position="center"
                className="fill-foreground text-2xl font-bold"
              />
            )}
          </Pie>
          <Tooltip
            content={<ChartTooltip formatValue={formatTooltip || formatValue} />}
          />
          {showLegend && (
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              wrapperStyle={{
                paddingTop: "20px",
              }}
            />
          )}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

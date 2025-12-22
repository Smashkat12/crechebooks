"use client";

import React from "react";
import { TooltipProps } from "recharts";

interface ChartTooltipProps extends TooltipProps<number, string> {
  formatValue?: (value: number) => string;
  labelFormatter?: (label: string) => string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  formatValue,
  labelFormatter,
}: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const defaultFormatValue = (value: number): string => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  };

  const valueFormatter = formatValue || defaultFormatValue;
  const formattedLabel = labelFormatter ? labelFormatter(label) : label;

  return (
    <div className="rounded-lg border bg-background p-3 shadow-md">
      {formattedLabel && (
        <p className="mb-2 text-sm font-medium text-foreground">{formattedLabel}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry, index) => (
          <div key={`tooltip-${index}`} className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-xs text-muted-foreground">{entry.name}:</span>
            <span className="text-xs font-medium text-foreground">
              {typeof entry.value === "number"
                ? valueFormatter(entry.value)
                : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatCompactCurrency(value: number): string {
  if (value >= 1000000) {
    return `R${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `R${(value / 1000).toFixed(1)}K`;
  }
  return formatCurrency(value);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-ZA").format(value);
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

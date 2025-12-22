"use client";

import React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ChartContainerProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}

export function ChartContainer({
  title,
  description,
  children,
  className,
  actions,
}: ChartContainerProps) {
  return (
    <Card className={className}>
      {(title || description || actions) && (
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div className="space-y-1">
            {title && <CardTitle className="text-base font-medium">{title}</CardTitle>}
            {description && (
              <CardDescription className="text-sm text-muted-foreground">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className="pb-4">{children}</CardContent>
    </Card>
  );
}

interface SimpleChartContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function SimpleChartContainer({ children, className }: SimpleChartContainerProps) {
  return <div className={className}>{children}</div>;
}

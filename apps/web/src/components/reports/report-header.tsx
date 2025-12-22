'use client';

import { format } from 'date-fns';
import { Building2, Calendar } from 'lucide-react';

interface ReportHeaderProps {
  title: string;
  tenantName?: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt?: Date;
}

export function ReportHeader({
  title,
  tenantName = 'CrecheBooks',
  periodStart,
  periodEnd,
  generatedAt = new Date(),
}: ReportHeaderProps) {
  return (
    <div className="border-b pb-4 mb-6">
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Building2 className="h-4 w-4" />
            <span>{tenantName}</span>
          </div>
          <h1 className="text-2xl font-bold">{title}</h1>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2 text-sm text-muted-foreground justify-end">
            <Calendar className="h-4 w-4" />
            <span>Report Period</span>
          </div>
          <p className="font-medium">
            {format(periodStart, 'dd MMM yyyy')} - {format(periodEnd, 'dd MMM yyyy')}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Generated on {format(generatedAt, 'dd MMMM yyyy \'at\' HH:mm')} (SAST)
      </p>
    </div>
  );
}

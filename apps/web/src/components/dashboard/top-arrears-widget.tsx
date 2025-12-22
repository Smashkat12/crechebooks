'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { AGING_BANDS } from '@/lib/utils/constants';

interface ArrearsItem {
  id: string;
  parentName: string;
  amount: number;
  daysOverdue: number;
}

interface TopArrearsWidgetProps {
  arrears: ArrearsItem[];
  isLoading?: boolean;
  limit?: number;
}

function getAgingBand(daysOverdue: number) {
  if (daysOverdue <= 0) return null;
  if (daysOverdue <= 30) return AGING_BANDS[0];
  if (daysOverdue <= 60) return AGING_BANDS[1];
  if (daysOverdue <= 90) return AGING_BANDS[2];
  return AGING_BANDS[3];
}

export function TopArrearsWidget({
  arrears,
  isLoading = false,
  limit = 5,
}: TopArrearsWidgetProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Top Arrears
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const topArrears = arrears.slice(0, limit);
  const totalArrears = arrears.reduce((sum, a) => sum + a.amount, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Top Arrears
        </CardTitle>
        <Badge variant="destructive">{formatCurrency(totalArrears)}</Badge>
      </CardHeader>
      <CardContent>
        {topArrears.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No outstanding arrears</p>
          </div>
        ) : (
          <div className="space-y-3">
            {topArrears.map((item) => {
              const band = getAgingBand(item.daysOverdue);
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted hover:bg-accent transition-colors"
                >
                  <div>
                    <p className="font-medium">{item.parentName}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.daysOverdue} days overdue
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium text-destructive">
                      {formatCurrency(item.amount)}
                    </p>
                    {band && (
                      <Badge
                        variant="outline"
                        className="text-xs"
                        style={{ borderColor: band.color, color: band.color }}
                      >
                        {band.label}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {arrears.length > limit && (
          <div className="mt-4 pt-4 border-t">
            <Link href="/payments/arrears">
              <Button variant="ghost" className="w-full">
                View all {arrears.length} accounts
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

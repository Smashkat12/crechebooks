'use client';

import { AlertTriangle, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';
import { AGING_BANDS } from '@/lib/utils/constants';

interface ArrearsBuckets {
  total: number;
  count: number;
  overdueBy7: number;
  overdueBy14: number;
  overdueBy30: number;
  overdueBy60: number;
  overdueOver60: number;
}

interface TopArrearsWidgetProps {
  arrears: ArrearsBuckets | null;
  isLoading?: boolean;
}

export function TopArrearsWidget({
  arrears,
  isLoading = false,
}: TopArrearsWidgetProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Arrears Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-muted animate-pulse rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const total = arrears?.total ?? 0;
  const count = arrears?.count ?? 0;

  const buckets = AGING_BANDS.map((band) => ({
    ...band,
    amount: arrears?.[band.key] ?? 0,
  }));

  const activeBuckets = buckets.filter((b) => b.amount > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" />
          Arrears Breakdown
        </CardTitle>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <Badge variant="outline">{count} account{count !== 1 ? 's' : ''}</Badge>
          )}
          <Badge variant="destructive">{formatCurrency(total)}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No outstanding arrears</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Stacked bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-muted">
              {activeBuckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="transition-all"
                  style={{
                    width: `${(bucket.amount / total) * 100}%`,
                    backgroundColor: bucket.color,
                  }}
                  title={`${bucket.label}: ${formatCurrency(bucket.amount)}`}
                />
              ))}
            </div>

            {/* Bucket rows */}
            <div className="space-y-1 pt-2">
              {buckets.map((bucket) => (
                <div
                  key={bucket.key}
                  className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: bucket.color }}
                    />
                    <span className="text-sm">{bucket.label}</span>
                  </div>
                  <span className={`text-sm font-mono ${bucket.amount > 0 ? 'font-medium' : 'text-muted-foreground'}`}>
                    {formatCurrency(bucket.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t">
          <Link href="/arrears">
            <Button variant="ghost" className="w-full">
              View arrears details
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

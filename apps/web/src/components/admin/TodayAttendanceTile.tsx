'use client';

import Link from 'next/link';
import { Users, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useTodayAttendanceSummary } from '@/hooks/admin/use-attendance';

export function TodayAttendanceTile() {
  const { data: summary, isLoading, isError } = useTodayAttendanceSummary();

  const total = summary
    ? summary.presentCount +
      summary.absentCount +
      summary.lateCount +
      summary.excusedCount +
      summary.earlyPickupCount +
      summary.unmarkedCount
    : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <Users className="h-4 w-4 text-muted-foreground" />
          Attendance Today
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/admin/attendance">
            View <ArrowRight className="ml-1 h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-8 w-28 bg-muted rounded" />
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-5 w-16 bg-muted rounded-full" />
              ))}
            </div>
          </div>
        )}

        {isError && (
          <p className="text-sm text-destructive">Failed to load attendance data.</p>
        )}

        {summary && (
          <div className="space-y-3">
            {/* Big number */}
            <div>
              <span className="text-3xl font-bold text-green-700">
                {summary.presentCount}
              </span>
              <span className="text-xl text-muted-foreground font-medium">
                {' '}/ {total}
              </span>
              <p className="text-xs text-muted-foreground mt-0.5">Present today</p>
            </div>

            {/* Status chips */}
            <div className="flex flex-wrap gap-1.5">
              {summary.absentCount > 0 && (
                <Badge className="bg-red-100 text-red-800 hover:bg-red-100 font-normal text-xs">
                  Absent {summary.absentCount}
                </Badge>
              )}
              {summary.lateCount > 0 && (
                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal text-xs">
                  Late {summary.lateCount}
                </Badge>
              )}
              {summary.excusedCount > 0 && (
                <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 font-normal text-xs">
                  Excused {summary.excusedCount}
                </Badge>
              )}
              {summary.earlyPickupCount > 0 && (
                <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100 font-normal text-xs">
                  Early pickup {summary.earlyPickupCount}
                </Badge>
              )}
              {summary.unmarkedCount > 0 && (
                <div className="flex flex-col gap-0.5">
                  <Badge className="bg-gray-100 text-gray-700 hover:bg-gray-100 font-normal text-xs">
                    Unmarked {summary.unmarkedCount}
                  </Badge>
                  {(summary.reportedAbsentCount ?? 0) > 0 && (
                    <span className="text-xs text-muted-foreground pl-0.5">
                      {summary.reportedAbsentCount} reported absent
                    </span>
                  )}
                </div>
              )}
              {summary.absentCount === 0 &&
                summary.lateCount === 0 &&
                summary.excusedCount === 0 &&
                summary.earlyPickupCount === 0 &&
                summary.unmarkedCount === 0 && (
                  <span className="text-xs text-muted-foreground">All accounted for</span>
                )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChevronRight } from 'lucide-react';

interface LeaveBalanceProps {
  leaveBalance: {
    annual: number;
    annualUsed: number;
    sick: number;
    sickUsed: number;
    family: number;
    familyUsed: number;
  };
}

export function LeaveBalanceCard({ leaveBalance }: LeaveBalanceProps) {
  const leaveTypes = [
    {
      label: 'Annual Leave',
      total: leaveBalance.annual,
      used: leaveBalance.annualUsed,
      color: 'bg-blue-500',
    },
    {
      label: 'Sick Leave',
      total: leaveBalance.sick,
      used: leaveBalance.sickUsed,
      color: 'bg-orange-500',
    },
    {
      label: 'Family Leave',
      total: leaveBalance.family,
      used: leaveBalance.familyUsed,
      color: 'bg-purple-500',
    },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg">Leave Balance</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/staff/leave" className="flex items-center gap-1">
            Request Leave <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {leaveTypes.map((leave) => {
          const remaining = leave.total - leave.used;
          const percentage = leave.total > 0 ? (leave.used / leave.total) * 100 : 0;

          return (
            <div key={leave.label} className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{leave.label}</span>
                <span className="font-medium">
                  {remaining} / {leave.total} days
                </span>
              </div>
              <Progress value={percentage} className="h-2" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

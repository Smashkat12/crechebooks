'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Wallet, CalendarDays } from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

interface NextPayCardProps {
  nextPayDate: Date | string;
}

export function NextPayCard({ nextPayDate }: NextPayCardProps) {
  const date = new Date(nextPayDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const payDateNormalized = new Date(date);
  payDateNormalized.setHours(0, 0, 0, 0);

  const daysUntil = differenceInDays(payDateNormalized, today);

  const getDaysText = () => {
    if (daysUntil < 0) {
      return 'Payment processed';
    }
    if (daysUntil === 0) {
      return 'Today!';
    }
    if (daysUntil === 1) {
      return 'Tomorrow';
    }
    return `In ${daysUntil} days`;
  };

  return (
    <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-900/20 dark:to-emerald-800/10 border-emerald-200/50 dark:border-emerald-800/30">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-emerald-500/20 dark:bg-emerald-500/30 rounded-full">
            <Wallet className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Next Pay Date</p>
            <p className="text-2xl font-bold text-foreground">
              {format(date, 'dd MMMM')}
            </p>
            <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              <span>{getDaysText()}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

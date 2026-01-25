'use client';

/**
 * Staff Onboarding Banner
 * Shows a prominent banner when staff has incomplete onboarding
 */

import Link from 'next/link';
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface OnboardingBannerProps {
  status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  percentComplete: number;
  pendingCount: number;
}

export function OnboardingBanner({ status, percentComplete, pendingCount }: OnboardingBannerProps) {
  // Don't show if completed
  if (status === 'COMPLETED') {
    return null;
  }

  return (
    <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className="flex items-start gap-3 flex-1">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900 dark:text-amber-100">
                Complete Your Onboarding
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                {status === 'NOT_STARTED'
                  ? 'Please complete your onboarding to finish setting up your profile.'
                  : `You have ${pendingCount} item${pendingCount !== 1 ? 's' : ''} remaining. Complete them to finish onboarding.`}
              </p>
              {status === 'IN_PROGRESS' && (
                <div className="mt-3 max-w-xs">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-amber-700 dark:text-amber-300">Progress</span>
                    <span className="font-medium text-amber-900 dark:text-amber-100">
                      {percentComplete}%
                    </span>
                  </div>
                  <Progress value={percentComplete} className="h-1.5 bg-amber-200 dark:bg-amber-800" />
                </div>
              )}
            </div>
          </div>
          <Button asChild className="bg-amber-600 hover:bg-amber-700 text-white">
            <Link href="/staff/onboarding">
              {status === 'NOT_STARTED' ? 'Start Onboarding' : 'Continue'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingBanner;

'use client';

/**
 * Onboarding Dashboard CTA
 * TASK-ACCT-014: Call-to-action widget for incomplete onboarding
 *
 * Shows on dashboard when tenant hasn't completed setup
 */

import { useRouter } from 'next/navigation';
import { Rocket, ArrowRight, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOnboardingDashboardCta } from '@/hooks/use-tenant-onboarding';
import { useState } from 'react';

interface OnboardingDashboardCtaProps {
  className?: string;
}

export function OnboardingDashboardCta({ className }: OnboardingDashboardCtaProps) {
  const router = useRouter();
  const [isDismissed, setIsDismissed] = useState(false);
  const { data: cta, isLoading, error } = useOnboardingDashboardCta();

  // Log for debugging
  if (typeof window !== 'undefined') {
    console.log('[Onboarding CTA]', { cta, isLoading, error: error?.message });
  }

  // Don't show if dismissed or loading
  if (isDismissed || isLoading) {
    return null;
  }

  // Show error state if API failed
  if (error) {
    console.error('[Onboarding CTA Error]', error);
    return null; // Silently fail - don't block dashboard
  }

  // Don't show if onboarding complete
  if (!cta?.showOnboarding) {
    return null;
  }

  const handleContinueSetup = () => {
    router.push('/dashboard/onboarding');
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    // Optionally persist dismissal in localStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('onboarding-cta-dismissed', 'true');
    }
  };

  return (
    <Card className={`bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20 ${className}`}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">{cta.message}</p>
              {cta.nextStep && (
                <p className="text-sm text-muted-foreground">
                  Next: {cta.nextStep.title}
                </p>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Progress value={cta.progressPercent} className="h-2 w-32" />
                <span className="text-xs text-muted-foreground">
                  {cta.progressPercent}% complete
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleContinueSetup}>
              Continue Setup
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingDashboardCta;

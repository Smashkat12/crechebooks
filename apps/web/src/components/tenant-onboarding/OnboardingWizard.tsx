'use client';

/**
 * Tenant Onboarding Wizard
 * TASK-ACCT-014: Interactive onboarding checklist for new tenants
 *
 * Styled similar to stub.africa onboarding with expandable sections
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronDown,
  Image,
  MapPin,
  Building,
  Receipt,
  DollarSign,
  Users,
  FileText,
  Link2,
  SkipForward,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  useOnboardingProgress,
  useUpdateOnboardingStep,
  useAutoDetectOnboarding,
  OnboardingStepId,
  type OnboardingProgressResponse,
} from '@/hooks/use-tenant-onboarding';

// Step icons mapping
const STEP_ICONS: Record<OnboardingStepId, React.ComponentType<{ className?: string }>> = {
  [OnboardingStepId.LOGO]: Image,
  [OnboardingStepId.ADDRESS]: MapPin,
  [OnboardingStepId.BANK_DETAILS]: Building,
  [OnboardingStepId.VAT_CONFIG]: Receipt,
  [OnboardingStepId.FEE_STRUCTURE]: DollarSign,
  [OnboardingStepId.ENROL_CHILD]: Users,
  [OnboardingStepId.FIRST_INVOICE]: FileText,
  [OnboardingStepId.BANK_CONNECT]: Link2,
};

// Step navigation links - routes are under (dashboard) group which doesn't add to URL
const STEP_LINKS: Record<OnboardingStepId, string> = {
  [OnboardingStepId.LOGO]: '/settings/organization',
  [OnboardingStepId.ADDRESS]: '/settings/organization',
  [OnboardingStepId.BANK_DETAILS]: '/settings/organization',
  [OnboardingStepId.VAT_CONFIG]: '/settings/organization',
  [OnboardingStepId.FEE_STRUCTURE]: '/settings/fees',
  [OnboardingStepId.ENROL_CHILD]: '/enrollments',
  [OnboardingStepId.FIRST_INVOICE]: '/invoices/generate',
  [OnboardingStepId.BANK_CONNECT]: '/reconciliation',
};

// Step action labels
const STEP_ACTIONS: Record<OnboardingStepId, string> = {
  [OnboardingStepId.LOGO]: 'Upload Logo',
  [OnboardingStepId.ADDRESS]: 'Set Address',
  [OnboardingStepId.BANK_DETAILS]: 'Add Bank Details',
  [OnboardingStepId.VAT_CONFIG]: 'Configure VAT',
  [OnboardingStepId.FEE_STRUCTURE]: 'Set Up Fees',
  [OnboardingStepId.ENROL_CHILD]: 'Enrol Child',
  [OnboardingStepId.FIRST_INVOICE]: 'Create Invoice',
  [OnboardingStepId.BANK_CONNECT]: 'Connect Bank',
};

interface StepItemProps {
  step: OnboardingProgressResponse['steps'][0];
  isExpanded: boolean;
  onToggle: () => void;
  onAction: () => void;
  onSkip: () => void;
  isUpdating: boolean;
}

function StepItem({
  step,
  isExpanded,
  onToggle,
  onAction,
  onSkip,
  isUpdating,
}: StepItemProps) {
  const Icon = STEP_ICONS[step.id];
  const isComplete = step.isComplete || step.isSkipped;

  return (
    <div
      className={cn(
        'border rounded-lg transition-all',
        isComplete ? 'border-green-500/30 bg-green-500/5' : 'border-border',
        isExpanded && !isComplete && 'ring-2 ring-primary/20'
      )}
    >
      {/* Header row - clickable to expand */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left"
        disabled={isComplete}
      >
        <div className="flex items-center gap-3">
          {isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <Circle className="h-5 w-5 text-muted-foreground" />
          )}
          <Icon className={cn('h-5 w-5', isComplete ? 'text-green-500' : 'text-primary')} />
          <div>
            <span className={cn('font-medium', isComplete && 'text-muted-foreground')}>
              {step.title}
            </span>
            {step.isSkipped && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Skipped
              </Badge>
            )}
          </div>
        </div>
        {!isComplete && (
          isExpanded ? (
            <ChevronDown className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          )
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && !isComplete && (
        <div className="px-4 pb-4 space-y-4">
          <p className="text-sm text-muted-foreground pl-11">
            {step.description}
          </p>
          {step.helpText && (
            <p className="text-xs text-muted-foreground/80 pl-11 italic">
              {step.helpText}
            </p>
          )}
          <div className="flex items-center gap-2 pl-11">
            <Button onClick={onAction} disabled={isUpdating}>
              {STEP_ACTIONS[step.id]}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            {step.isSkippable && (
              <Button variant="ghost" onClick={onSkip} disabled={isUpdating}>
                <SkipForward className="mr-2 h-4 w-4" />
                Skip for now
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const [expandedStep, setExpandedStep] = useState<OnboardingStepId | null>(null);

  const { data: progress, isLoading, error } = useOnboardingProgress();
  const updateStep = useUpdateOnboardingStep();
  const autoDetect = useAutoDetectOnboarding();

  // Auto-detect progress on mount
  useEffect(() => {
    autoDetect.mutate();
  }, []);

  // Auto-expand first incomplete step
  useEffect(() => {
    if (progress && !expandedStep) {
      const firstIncomplete = progress.steps.find(
        (s) => !s.isComplete && !s.isSkipped
      );
      if (firstIncomplete) {
        setExpandedStep(firstIncomplete.id);
      }
    }
  }, [progress, expandedStep]);

  const handleToggle = (stepId: OnboardingStepId) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  const handleAction = (stepId: OnboardingStepId) => {
    router.push(STEP_LINKS[stepId]);
  };

  const handleSkip = (stepId: OnboardingStepId) => {
    updateStep.mutate({ stepId, action: 'skip' });
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-8">
          <div className="flex flex-col items-center gap-4">
            <div className="h-8 w-48 bg-muted animate-pulse rounded" />
            <div className="h-4 w-64 bg-muted animate-pulse rounded" />
            <div className="w-full h-2 bg-muted animate-pulse rounded-full mt-4" />
            <div className="w-full space-y-3 mt-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-8 text-center">
          <p className="text-destructive">Failed to load onboarding progress</p>
          <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!progress) {
    return null;
  }

  // If onboarding is complete, show celebration
  if (progress.isComplete) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardContent className="p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-500" />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold">Setup Complete!</h2>
            <p className="text-muted-foreground mt-2">
              Your creche is all set up and ready to go. Start managing your enrollments and invoices.
            </p>
          </div>
          <Button size="lg" onClick={handleGoToDashboard}>
            Go to Dashboard
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="text-center space-y-4">
        <CardTitle className="text-2xl">Let&apos;s get your creche set up</CardTitle>
        <p className="text-muted-foreground">
          Complete these steps to start managing your finances
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {progress.completedCount} of {progress.totalSteps} complete
            </span>
            <span className="font-medium">{progress.progressPercent}%</span>
          </div>
          <Progress value={progress.progressPercent} className="h-2" />
        </div>
      </CardHeader>
      <CardContent className="space-y-3 pb-8">
        {progress.steps.map((step) => (
          <StepItem
            key={step.id}
            step={step}
            isExpanded={expandedStep === step.id}
            onToggle={() => handleToggle(step.id)}
            onAction={() => handleAction(step.id)}
            onSkip={() => handleSkip(step.id)}
            isUpdating={updateStep.isPending}
          />
        ))}

        {/* Skip all / go to dashboard */}
        <div className="pt-4 border-t mt-6">
          <Button
            variant="ghost"
            className="w-full"
            onClick={handleGoToDashboard}
          >
            Skip for now, I&apos;ll complete setup later
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default OnboardingWizard;

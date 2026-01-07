'use client';

/**
 * Staff Onboarding Wizard
 * TASK-STAFF-001: Multi-step onboarding workflow
 *
 * A comprehensive wizard component that guides administrators through
 * the staff onboarding process with 7 distinct steps.
 */

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CheckCircle,
  Circle,
  User,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  FileCheck,
  AlertCircle,
  Loader2,
  FileSignature,
} from 'lucide-react';
import {
  useOnboardingStatus,
  useUpdateOnboardingStep,
  useDownloadWelcomePack,
  useStartOnboarding,
} from '@/hooks/use-staff-onboarding';
import { PersonalInfoStep } from './onboarding/PersonalInfoStep';
import { EmploymentStep } from './onboarding/EmploymentStep';
import { TaxInfoStep } from './onboarding/TaxInfoStep';
import { BankingStep } from './onboarding/BankingStep';
import { GeneratedDocumentsStep } from './onboarding/GeneratedDocumentsStep';
import { DocumentsStep } from './onboarding/DocumentsStep';
import { ChecklistStep } from './onboarding/ChecklistStep';
import { CompletionStep } from './onboarding/CompletionStep';

interface OnboardingWizardProps {
  staffId: string;
  staffName: string;
}

// Step configuration
const STEPS = [
  { id: 'PERSONAL_INFO', label: 'Personal Info', icon: User, description: 'Basic personal details' },
  { id: 'EMPLOYMENT', label: 'Employment', icon: Briefcase, description: 'Employment details' },
  { id: 'TAX_INFO', label: 'Tax Info', icon: Building2, description: 'SARS tax information' },
  { id: 'BANKING', label: 'Banking', icon: CreditCard, description: 'Bank account details' },
  { id: 'GENERATED_DOCS', label: 'Contracts', icon: FileSignature, description: 'Employment documents' },
  { id: 'DOCUMENTS', label: 'Documents', icon: FileText, description: 'Required documents' },
  { id: 'CHECKLIST', label: 'Checklist', icon: FileCheck, description: 'Onboarding checklist' },
  { id: 'COMPLETE', label: 'Complete', icon: CheckCircle, description: 'Review and finish' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

export function OnboardingWizard({ staffId, staffName }: OnboardingWizardProps) {
  const { data: status, isLoading, error, refetch } = useOnboardingStatus(staffId);
  const { mutate: updateStep, isPending: isUpdating } = useUpdateOnboardingStep(staffId);
  const { mutate: downloadWelcomePack, isPending: isDownloading } = useDownloadWelcomePack(staffId);
  const { mutate: startOnboarding, isPending: isStarting } = useStartOnboarding(staffId);

  // Local state for viewing different steps (allows navigation without changing DB state)
  const [viewingStep, setViewingStep] = useState<StepId | null>(null);

  // Calculate progress based on actual currentStep from API
  const currentStepIndex = STEPS.findIndex((s) => s.id === status?.currentStep) || 0;
  const progress = status?.status === 'COMPLETED'
    ? 100
    : Math.round(((currentStepIndex) / (STEPS.length - 1)) * 100);

  // The step to display (either the viewing step or current step)
  const displayStep = viewingStep || status?.currentStep || 'PERSONAL_INFO';

  // Reset viewing step when status changes
  useEffect(() => {
    setViewingStep(null);
  }, [status?.currentStep]);

  // Handle step completion
  const handleStepComplete = async (stepData: Record<string, unknown>) => {
    if (!status?.currentStep) return;

    updateStep(
      { step: status.currentStep, data: stepData },
      {
        onSuccess: () => {
          refetch();
        },
      }
    );
  };

  // Handle starting onboarding
  const handleStartOnboarding = () => {
    startOnboarding(undefined, {
      onSuccess: () => {
        refetch();
      },
    });
  };

  // Handle welcome pack download
  const handleDownloadWelcomePack = () => {
    downloadWelcomePack();
  };

  // Check if viewing a past step (not the current one)
  const isViewingPastStep = viewingStep !== null && viewingStep !== status?.currentStep;
  const displayStepIndex = STEPS.findIndex((s) => s.id === displayStep);

  // Handle clicking on a step indicator
  const handleStepClick = (stepId: StepId, stepIndex: number) => {
    // Can only navigate to completed steps or current step
    if (stepIndex <= currentStepIndex) {
      setViewingStep(stepId === status?.currentStep ? null : stepId);
    }
  };

  // Return to current step
  const handleReturnToCurrentStep = () => {
    setViewingStep(null);
  };

  // Render current step content
  const renderStep = () => {
    if (!status) return null;

    // Determine which handlers to use based on whether we're viewing a past step
    const stepHandlers = {
      onComplete: isViewingPastStep ? handleReturnToCurrentStep : handleStepComplete,
      isSubmitting: isViewingPastStep ? false : isUpdating,
      isEditing: isViewingPastStep, // Pass this to show "Update" instead of "Save & Continue"
    };

    switch (displayStep) {
      case 'PERSONAL_INFO':
        return <PersonalInfoStep staffId={staffId} {...stepHandlers} />;
      case 'EMPLOYMENT':
        return <EmploymentStep staffId={staffId} {...stepHandlers} />;
      case 'TAX_INFO':
        return <TaxInfoStep staffId={staffId} {...stepHandlers} />;
      case 'BANKING':
        return <BankingStep staffId={staffId} {...stepHandlers} />;
      case 'GENERATED_DOCS':
        return <GeneratedDocumentsStep staffId={staffId} {...stepHandlers} />;
      case 'DOCUMENTS':
        return <DocumentsStep staffId={staffId} {...stepHandlers} />;
      case 'CHECKLIST':
        return <ChecklistStep staffId={staffId} {...stepHandlers} />;
      case 'COMPLETE':
        return (
          <CompletionStep
            staffId={staffId}
            staffName={staffName}
            onboardingId={status?.id || ''}
            onDownloadWelcomePack={handleDownloadWelcomePack}
            isDownloading={isDownloading}
          />
        );
      default:
        return <PersonalInfoStep staffId={staffId} {...stepHandlers} />;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-64" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-2 w-full mb-4" />
            <div className="flex justify-between">
              {STEPS.map((_, index) => (
                <Skeleton key={index} className="h-10 w-10 rounded-full" />
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2">Failed to Load Onboarding</h3>
            <p className="text-muted-foreground mb-4">
              {error.message || 'An error occurred while loading the onboarding status.'}
            </p>
            <Button onClick={() => refetch()}>Try Again</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Not started state
  if (!status || status.status === 'NOT_STARTED') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Start Onboarding: {staffName}</CardTitle>
          <CardDescription>
            Begin the onboarding process to collect all required information and documents.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12">
            <User className="h-16 w-16 text-muted-foreground mb-6" />
            <h3 className="text-xl font-semibold mb-2">Ready to Start Onboarding</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              This wizard will guide you through collecting personal information, employment details,
              tax information, banking details, and required documents.
            </p>
            <Button size="lg" onClick={handleStartOnboarding} disabled={isStarting}>
              {isStarting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Start Onboarding Process
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get status badge variant
  const getStatusBadgeVariant = () => {
    switch (status.status) {
      case 'COMPLETED':
        return 'default';
      case 'IN_PROGRESS':
        return 'secondary';
      case 'CANCELLED':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Onboarding: {staffName}</CardTitle>
              <CardDescription>
                Complete all steps to finish the onboarding process
              </CardDescription>
            </div>
            <Badge variant={getStatusBadgeVariant()}>
              {status.status === 'COMPLETED' ? 'Completed' :
               status.status === 'IN_PROGRESS' ? 'In Progress' :
               status.status === 'CANCELLED' ? 'Cancelled' : 'Not Started'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Step indicators */}
            <div className="flex justify-between">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const isComplete = status.completedSteps?.includes(step.id);
                const isCurrent = status.currentStep === step.id;
                const isPast = currentStepIndex > index;
                const isViewing = displayStep === step.id;
                const isClickable = index <= currentStepIndex;

                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => handleStepClick(step.id, index)}
                    disabled={!isClickable}
                    className={`flex flex-col items-center group ${
                      isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
                    }`}
                    title={isClickable ? `Go to ${step.label}` : `Complete previous steps first`}
                  >
                    <div
                      className={`
                        w-10 h-10 rounded-full flex items-center justify-center transition-all
                        ${isViewing && !isCurrent
                          ? 'ring-2 ring-blue-500 ring-offset-2'
                          : ''}
                        ${isComplete || isPast
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2'
                          : 'bg-muted text-muted-foreground'}
                        ${isClickable ? 'group-hover:scale-110' : ''}
                      `}
                    >
                      {isComplete || isPast ? (
                        <CheckCircle className="w-5 h-5" />
                      ) : (
                        <Icon className="w-5 h-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs mt-2 text-center max-w-[60px] ${
                        isViewing ? 'font-semibold text-foreground' :
                        isCurrent ? 'font-semibold text-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Banner when viewing a past step */}
      {isViewingPastStep && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-600" />
            <span className="text-sm text-blue-800">
              Viewing <strong>{STEPS.find((s) => s.id === displayStep)?.label}</strong> -
              Your current step is <strong>{STEPS.find((s) => s.id === status.currentStep)?.label}</strong>
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={handleReturnToCurrentStep}>
            Return to Current Step
          </Button>
        </div>
      )}

      {/* Current Step Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                {STEPS.find((s) => s.id === displayStep)?.label || 'Personal Info'}
              </CardTitle>
              <CardDescription>
                {STEPS.find((s) => s.id === displayStep)?.description}
              </CardDescription>
            </div>
            {isViewingPastStep && (
              <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                Viewing Past Step
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>
    </div>
  );
}

'use client';

/**
 * Parent Onboarding Page
 * Thin orchestrator that delegates to useOnboarding hook and step components.
 */

import { useRouter } from 'next/navigation';
import { ArrowLeft, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useOnboarding, steps } from '@/hooks/parent-portal/use-parent-onboarding';
import {
  StepIndicator,
  ContactStep,
  FeeAgreementStep,
  ConsentsStep,
  CompletionStep,
} from '@/components/parent-portal/onboarding';

export default function ParentOnboardingPage() {
  const router = useRouter();
  const {
    isLoading,
    isSaving,
    isGeneratingDocs,
    error,
    success,
    onboardingStatus,
    currentStep,
    profileData,
    consentData,
    feeSummary,
    isLoadingFeeSummary,
    setCurrentStep,
    setProfileData,
    setConsentData,
    handleSaveContact,
    handleDownloadDocument,
    handleSignDocument,
    handleCompleteOnboarding,
    addAuthorizedCollector,
    updateAuthorizedCollector,
  } = useOnboarding();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/parent/dashboard')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Complete Your Profile</h1>
          <p className="text-muted-foreground">
            Please complete the following steps to access all features
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            {success}
          </AlertDescription>
        </Alert>
      )}

      {/* Progress Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Your Progress</CardTitle>
          <CardDescription>Complete all required steps to finish onboarding</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {onboardingStatus?.completedCount || 0} of{' '}
              {onboardingStatus?.totalRequired || 0} required steps complete
            </span>
            <span className="font-medium">{onboardingStatus?.percentComplete || 0}%</span>
          </div>
          <Progress value={onboardingStatus?.percentComplete || 0} className="h-2" />
        </CardContent>
      </Card>

      <StepIndicator steps={steps} currentStep={currentStep} />

      {/* Step Content */}
      {currentStep === 'contact' && (
        <ContactStep
          profileData={profileData}
          onProfileChange={setProfileData}
          onSave={handleSaveContact}
          isSaving={isSaving}
        />
      )}

      {currentStep === 'fee_agreement' && (
        <FeeAgreementStep
          onboardingStatus={onboardingStatus}
          consentData={consentData}
          feeSummary={feeSummary}
          isLoadingFeeSummary={isLoadingFeeSummary}
          onConsentChange={setConsentData}
          onDownload={handleDownloadDocument}
          onSign={handleSignDocument}
          onBack={() => setCurrentStep('contact')}
          isSaving={isSaving}
          isGeneratingDocs={isGeneratingDocs}
        />
      )}

      {currentStep === 'consents' && (
        <ConsentsStep
          onboardingStatus={onboardingStatus}
          consentData={consentData}
          onConsentChange={setConsentData}
          onAddCollector={addAuthorizedCollector}
          onUpdateCollector={updateAuthorizedCollector}
          onDownload={handleDownloadDocument}
          onSign={handleSignDocument}
          onBack={() => setCurrentStep('fee_agreement')}
          isSaving={isSaving}
        />
      )}

      {currentStep === 'complete' && (
        <CompletionStep
          onComplete={handleCompleteOnboarding}
          isSaving={isSaving}
        />
      )}

      {/* Why This Is Needed */}
      <Card className="bg-muted/50">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Why is this needed?</strong> This information is required for legal
            compliance, emergency situations, and communication about your child&apos;s care.
            The fee agreement protects both you and the school with clear payment terms.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

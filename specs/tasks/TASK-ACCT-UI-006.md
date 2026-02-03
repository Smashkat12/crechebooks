<task_spec id="TASK-ACCT-UI-006" version="2.0">

<metadata>
  <title>Accounting Onboarding Wizard UI</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>506</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-ONBOARD-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-ONBOARD-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-014</task_ref>
    <task_ref status="complete">TASK-WEB-004</task_ref>
    <task_ref status="complete">TASK-WEB-006</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/onboarding/page.tsx` (Main Onboarding Page)
  - `apps/web/src/components/onboarding/onboarding-wizard.tsx` (Wizard Container)
  - `apps/web/src/components/onboarding/step-indicator.tsx` (Progress Indicator)
  - `apps/web/src/components/onboarding/step-logo.tsx` (Logo Upload Step)
  - `apps/web/src/components/onboarding/step-address.tsx` (Address Setup Step)
  - `apps/web/src/components/onboarding/step-bank.tsx` (Bank Details Step)
  - `apps/web/src/components/onboarding/step-vat.tsx` (VAT Configuration Step)
  - `apps/web/src/components/onboarding/step-fees.tsx` (Fee Structure Step)
  - `apps/web/src/components/onboarding/step-child.tsx` (Enroll First Child Step)
  - `apps/web/src/components/onboarding/step-invoice.tsx` (Send First Invoice Step)
  - `apps/web/src/components/onboarding/step-bank-connect.tsx` (Bank Connection Step)
  - `apps/web/src/components/onboarding/onboarding-cta.tsx` (Dashboard CTA)
  - `apps/web/src/hooks/use-onboarding.ts` (React Query Hooks)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (ADD onboarding endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD onboarding query keys)
  - `apps/web/src/components/dashboard/index.tsx` (Add onboarding CTA)

  **Current Problem:**
  - No UI exists for the onboarding wizard
  - Backend API is complete (OnboardingController at /onboarding)
  - New tenants have no guided setup experience
  - No progress tracking or resumable onboarding
  - No dashboard CTA to prompt continuing setup

  **Backend API Reference (OnboardingController):**
  - `GET /onboarding/progress` - Get current onboarding progress
  - `GET /onboarding/dashboard-cta` - Get dashboard CTA info
  - `PATCH /onboarding/progress` - Update step (complete or skip)
  - `POST /onboarding/auto-detect` - Auto-detect completed steps
  - `POST /onboarding/reset` - Reset onboarding progress

  **Backend DTOs:**
  ```typescript
  enum OnboardingStepId {
    LOGO = 'logo',
    ADDRESS = 'address',
    BANK_DETAILS = 'bankDetails',
    VAT_CONFIG = 'vatConfig',
    FEE_STRUCTURE = 'feeStructure',
    ENROL_CHILD = 'enrollChild',
    FIRST_INVOICE = 'firstInvoice',
    BANK_CONNECT = 'bankConnect',
  }

  interface OnboardingStepInfo {
    id: OnboardingStepId;
    title: string;
    description: string;
    isComplete: boolean;
    isSkipped: boolean;
    isSkippable: boolean;
    helpText?: string;
  }

  interface OnboardingProgressResponse {
    id: string;
    tenantId: string;
    logoUploaded: boolean;
    addressSet: boolean;
    bankDetailsSet: boolean;
    vatConfigured: boolean;
    feeStructureCreated: boolean;
    childEnrolled: boolean;
    firstInvoiceSent: boolean;
    bankConnected: boolean;
    skippedSteps: string[];
    lastActiveStep: string | null;
    completedAt: Date | null;
    completedCount: number;
    totalSteps: number;
    progressPercent: number;
    isComplete: boolean;
    steps: OnboardingStepInfo[];
  }

  interface OnboardingDashboardCta {
    showOnboarding: boolean;
    progressPercent: number;
    nextStep: OnboardingStepInfo | null;
    message: string;
  }
  ```

  **Onboarding Steps:**
  1. LOGO - Upload creche logo
  2. ADDRESS - Set business address
  3. BANK_DETAILS - Add banking details for invoices
  4. VAT_CONFIG - Configure VAT settings
  5. FEE_STRUCTURE - Create first fee structure
  6. ENROL_CHILD - Enrol first child
  7. FIRST_INVOICE - Send first invoice
  8. BANK_CONNECT - Connect bank for reconciliation (optional)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm dev:web`, `pnpm test`, etc.

  ### 2. API Endpoints Pattern
  ```typescript
  // apps/web/src/lib/api/endpoints.ts - ADD this section
  onboarding: {
    progress: '/onboarding/progress',
    dashboardCta: '/onboarding/dashboard-cta',
    autoDetect: '/onboarding/auto-detect',
    reset: '/onboarding/reset',
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
  onboarding: {
    all: ['onboarding'] as const,
    progress: () => [...queryKeys.onboarding.all, 'progress'] as const,
    dashboardCta: () => [...queryKeys.onboarding.all, 'dashboard-cta'] as const,
  },
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-onboarding.ts
  import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export type OnboardingStepId =
    | 'logo'
    | 'address'
    | 'bankDetails'
    | 'vatConfig'
    | 'feeStructure'
    | 'enrollChild'
    | 'firstInvoice'
    | 'bankConnect';

  export interface OnboardingStep {
    id: OnboardingStepId;
    title: string;
    description: string;
    isComplete: boolean;
    isSkipped: boolean;
    isSkippable: boolean;
    helpText?: string;
  }

  export interface OnboardingProgress {
    id: string;
    tenantId: string;
    logoUploaded: boolean;
    addressSet: boolean;
    bankDetailsSet: boolean;
    vatConfigured: boolean;
    feeStructureCreated: boolean;
    childEnrolled: boolean;
    firstInvoiceSent: boolean;
    bankConnected: boolean;
    skippedSteps: string[];
    lastActiveStep: string | null;
    completedAt: Date | null;
    completedCount: number;
    totalSteps: number;
    progressPercent: number;
    isComplete: boolean;
    steps: OnboardingStep[];
  }

  export interface OnboardingCta {
    showOnboarding: boolean;
    progressPercent: number;
    nextStep: OnboardingStep | null;
    message: string;
  }

  // Get onboarding progress
  export function useOnboardingProgress() {
    return useQuery<OnboardingProgress, AxiosError>({
      queryKey: queryKeys.onboarding.progress(),
      queryFn: async () => {
        const { data } = await apiClient.get<OnboardingProgress>(endpoints.onboarding.progress);
        return data;
      },
    });
  }

  // Get dashboard CTA
  export function useOnboardingCta() {
    return useQuery<OnboardingCta, AxiosError>({
      queryKey: queryKeys.onboarding.dashboardCta(),
      queryFn: async () => {
        const { data } = await apiClient.get<OnboardingCta>(endpoints.onboarding.dashboardCta);
        return data;
      },
    });
  }

  // Complete step
  export function useCompleteStep() {
    const queryClient = useQueryClient();

    return useMutation<OnboardingProgress, AxiosError, OnboardingStepId>({
      mutationFn: async (stepId) => {
        const { data } = await apiClient.patch<OnboardingProgress>(endpoints.onboarding.progress, {
          stepId,
          action: 'complete',
        });
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all });
      },
    });
  }

  // Skip step
  export function useSkipStep() {
    const queryClient = useQueryClient();

    return useMutation<OnboardingProgress, AxiosError, OnboardingStepId>({
      mutationFn: async (stepId) => {
        const { data } = await apiClient.patch<OnboardingProgress>(endpoints.onboarding.progress, {
          stepId,
          action: 'skip',
        });
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all });
      },
    });
  }

  // Auto-detect progress
  export function useAutoDetect() {
    const queryClient = useQueryClient();

    return useMutation<OnboardingProgress, AxiosError>({
      mutationFn: async () => {
        const { data } = await apiClient.post<OnboardingProgress>(endpoints.onboarding.autoDetect);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all });
      },
    });
  }

  // Reset onboarding
  export function useResetOnboarding() {
    const queryClient = useQueryClient();

    return useMutation<{ success: boolean }, AxiosError>({
      mutationFn: async () => {
        const { data } = await apiClient.post<{ success: boolean }>(endpoints.onboarding.reset);
        return data;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: queryKeys.onboarding.all });
      },
    });
  }
  ```

  ### 5. Onboarding Wizard Container Pattern
  ```typescript
  // apps/web/src/components/onboarding/onboarding-wizard.tsx
  'use client';

  import { useState, useEffect } from 'react';
  import { useRouter } from 'next/navigation';
  import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Progress } from '@/components/ui/progress';
  import { cn } from '@/lib/utils';
  import { StepIndicator } from './step-indicator';
  import { StepLogo } from './step-logo';
  import { StepAddress } from './step-address';
  import { StepBank } from './step-bank';
  import { StepVat } from './step-vat';
  import { StepFees } from './step-fees';
  import { StepChild } from './step-child';
  import { StepInvoice } from './step-invoice';
  import { StepBankConnect } from './step-bank-connect';
  import { useOnboardingProgress, useSkipStep, type OnboardingStep, type OnboardingStepId } from '@/hooks/use-onboarding';
  import { useToast } from '@/hooks/use-toast';

  const STEP_COMPONENTS: Record<OnboardingStepId, React.ComponentType<StepProps>> = {
    logo: StepLogo,
    address: StepAddress,
    bankDetails: StepBank,
    vatConfig: StepVat,
    feeStructure: StepFees,
    enrollChild: StepChild,
    firstInvoice: StepInvoice,
    bankConnect: StepBankConnect,
  };

  export interface StepProps {
    step: OnboardingStep;
    onComplete: () => void;
    onSkip: () => void;
  }

  export function OnboardingWizard() {
    const router = useRouter();
    const { toast } = useToast();
    const { data: progress, isLoading, error } = useOnboardingProgress();
    const skipStep = useSkipStep();
    const [activeStepId, setActiveStepId] = useState<OnboardingStepId | null>(null);

    // Set initial active step
    useEffect(() => {
      if (progress && !activeStepId) {
        const nextIncomplete = progress.steps.find(s => !s.isComplete && !s.isSkipped);
        if (nextIncomplete) {
          setActiveStepId(nextIncomplete.id);
        } else if (progress.isComplete) {
          router.push('/dashboard');
        }
      }
    }, [progress, activeStepId, router]);

    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-destructive">Failed to load onboarding: {error.message}</p>
        </div>
      );
    }

    if (!progress) return null;

    const activeStep = progress.steps.find(s => s.id === activeStepId);
    const StepComponent = activeStepId ? STEP_COMPONENTS[activeStepId] : null;

    const handleComplete = () => {
      // Move to next incomplete step
      const currentIndex = progress.steps.findIndex(s => s.id === activeStepId);
      const nextStep = progress.steps.slice(currentIndex + 1).find(s => !s.isComplete && !s.isSkipped);

      if (nextStep) {
        setActiveStepId(nextStep.id);
      } else {
        // All steps complete
        toast({
          title: 'Setup Complete!',
          description: 'Your creche is ready to use CrecheBooks.',
        });
        router.push('/dashboard');
      }
    };

    const handleSkip = async () => {
      if (!activeStepId) return;

      try {
        await skipStep.mutateAsync(activeStepId);
        handleComplete();
      } catch (error) {
        toast({
          title: 'Failed to skip step',
          description: 'Please try again',
          variant: 'destructive',
        });
      }
    };

    return (
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold">Welcome to CrecheBooks</h1>
          <p className="text-muted-foreground mt-2">
            Let's get your creche set up in just a few steps
          </p>
        </div>

        {/* Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>{progress.completedCount} of {progress.totalSteps} steps complete</span>
            <span>{progress.progressPercent}%</span>
          </div>
          <Progress value={progress.progressPercent} className="h-2" />
        </div>

        {/* Steps Grid */}
        <div className="grid md:grid-cols-4 gap-4">
          {progress.steps.map((step) => (
            <StepIndicator
              key={step.id}
              step={step}
              isActive={step.id === activeStepId}
              onClick={() => setActiveStepId(step.id)}
            />
          ))}
        </div>

        {/* Active Step Content */}
        {activeStep && StepComponent && (
          <Card>
            <CardHeader>
              <CardTitle>{activeStep.title}</CardTitle>
              <CardDescription>{activeStep.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <StepComponent
                step={activeStep}
                onComplete={handleComplete}
                onSkip={handleSkip}
              />
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

  ### 6. Step Indicator Component Pattern
  ```typescript
  // apps/web/src/components/onboarding/step-indicator.tsx
  'use client';

  import { CheckCircle2, Circle, SkipForward } from 'lucide-react';
  import { cn } from '@/lib/utils';
  import type { OnboardingStep } from '@/hooks/use-onboarding';

  interface StepIndicatorProps {
    step: OnboardingStep;
    isActive: boolean;
    onClick: () => void;
  }

  export function StepIndicator({ step, isActive, onClick }: StepIndicatorProps) {
    return (
      <button
        onClick={onClick}
        className={cn(
          'flex flex-col items-center p-4 rounded-lg border-2 transition-all',
          isActive && 'border-primary bg-primary/5',
          step.isComplete && 'border-green-500 bg-green-50',
          step.isSkipped && 'border-muted bg-muted/50 opacity-60',
          !isActive && !step.isComplete && !step.isSkipped && 'border-muted hover:border-muted-foreground'
        )}
      >
        {step.isComplete ? (
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        ) : step.isSkipped ? (
          <SkipForward className="h-8 w-8 text-muted-foreground" />
        ) : (
          <Circle className={cn('h-8 w-8', isActive ? 'text-primary' : 'text-muted-foreground')} />
        )}
        <span className={cn(
          'text-sm font-medium mt-2 text-center',
          isActive && 'text-primary',
          step.isComplete && 'text-green-700',
          step.isSkipped && 'text-muted-foreground'
        )}>
          {step.title}
        </span>
      </button>
    );
  }
  ```

  ### 7. Individual Step Component Pattern (Example: Address Step)
  ```typescript
  // apps/web/src/components/onboarding/step-address.tsx
  'use client';

  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { z } from 'zod';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Textarea } from '@/components/ui/textarea';
  import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
  } from '@/components/ui/form';
  import { useTenant, useUpdateTenant } from '@/hooks/useTenant';
  import { useCompleteStep } from '@/hooks/use-onboarding';
  import { useToast } from '@/hooks/use-toast';
  import type { StepProps } from './onboarding-wizard';

  const addressSchema = z.object({
    streetAddress: z.string().min(1, 'Street address is required'),
    suburb: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    province: z.string().min(1, 'Province is required'),
    postalCode: z.string().min(4, 'Valid postal code required').max(10),
  });

  type AddressFormValues = z.infer<typeof addressSchema>;

  export function StepAddress({ step, onComplete, onSkip }: StepProps) {
    const { toast } = useToast();
    const { data: tenant } = useTenant();
    const updateTenant = useUpdateTenant();
    const completeStep = useCompleteStep();

    const form = useForm<AddressFormValues>({
      resolver: zodResolver(addressSchema),
      defaultValues: {
        streetAddress: tenant?.streetAddress || '',
        suburb: tenant?.suburb || '',
        city: tenant?.city || '',
        province: tenant?.province || '',
        postalCode: tenant?.postalCode || '',
      },
    });

    const handleSubmit = async (data: AddressFormValues) => {
      try {
        await updateTenant.mutateAsync({
          streetAddress: data.streetAddress,
          suburb: data.suburb,
          city: data.city,
          province: data.province,
          postalCode: data.postalCode,
        });

        await completeStep.mutateAsync('address');

        toast({
          title: 'Address saved',
          description: 'Your business address has been updated.',
        });

        onComplete();
      } catch (error) {
        toast({
          title: 'Failed to save address',
          description: 'Please try again',
          variant: 'destructive',
        });
      }
    };

    const isLoading = updateTenant.isPending || completeStep.isPending;

    return (
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="streetAddress"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Street Address *</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="123 Main Street" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="suburb"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Suburb</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Sandton" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="city"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>City *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Johannesburg" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="province"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Province *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Gauteng" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="postalCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Postal Code *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="2000" maxLength={10} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormDescription>
            This address will appear on invoices and statements.
          </FormDescription>

          <div className="flex justify-between pt-4">
            <Button type="button" variant="ghost" onClick={onSkip} disabled={isLoading}>
              Skip for now
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : 'Save & Continue'}
            </Button>
          </div>
        </form>
      </Form>
    );
  }
  ```

  ### 8. Dashboard CTA Component Pattern
  ```typescript
  // apps/web/src/components/onboarding/onboarding-cta.tsx
  'use client';

  import Link from 'next/link';
  import { ArrowRight, Sparkles } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
  import { Progress } from '@/components/ui/progress';
  import { useOnboardingCta } from '@/hooks/use-onboarding';

  export function OnboardingCta() {
    const { data: cta, isLoading } = useOnboardingCta();

    if (isLoading || !cta?.showOnboarding) {
      return null;
    }

    return (
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Complete Your Setup</CardTitle>
          </div>
          <CardDescription>{cta.message}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Progress</span>
              <span>{cta.progressPercent}%</span>
            </div>
            <Progress value={cta.progressPercent} className="h-2" />
          </div>

          {cta.nextStep && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Next: {cta.nextStep.title}</p>
                <p className="text-xs text-muted-foreground">{cta.nextStep.description}</p>
              </div>
              <Link href="/onboarding">
                <Button size="sm">
                  Continue
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
  ```

  ### 9. Main Onboarding Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/onboarding/page.tsx
  'use client';

  import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';

  export default function OnboardingPage() {
    return (
      <div className="py-8">
        <OnboardingWizard />
      </div>
    );
  }
  ```

  ### 10. Test Commands
  ```bash
  pnpm dev:web             # Must start without errors
  pnpm build               # Must have 0 errors
  pnpm lint                # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the Accounting Onboarding Wizard UI for CrecheBooks.

**Business Context:**
1. New creches need guided setup to start using the system
2. Onboarding ensures essential data is captured before operations
3. Progress is tracked and resumable across sessions
4. Some steps can be skipped and completed later
5. Dashboard CTA prompts users to continue incomplete setup

**Onboarding Steps:**
1. **Logo** - Upload creche logo for invoices/statements
2. **Address** - Business address for invoices
3. **Bank Details** - Banking info for payment instructions
4. **VAT Config** - VAT registration and settings
5. **Fee Structure** - Create pricing for tuition/extras
6. **Enroll Child** - Add first child to demonstrate workflow
7. **First Invoice** - Generate and send first invoice
8. **Bank Connect** - Connect Xero for bank reconciliation (optional)

**South African Context:**
- SA provinces for address validation
- VAT registration threshold R1 million
- SA bank details format (branch codes)
</context>

<scope>
  <in_scope>
    - Main onboarding wizard page
    - Step indicator with progress
    - Individual step forms for each setup task
    - Skip step functionality
    - Resume onboarding from last step
    - Dashboard CTA component
    - Auto-detect completed steps
    - Progress percentage tracking
    - Completion celebration
  </in_scope>
  <out_of_scope>
    - Email verification step
    - Payment/subscription setup
    - Team member invitations
    - Advanced configuration options
    - Video tutorials
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-onboarding.ts

# 3. Create step components
# Create apps/web/src/components/onboarding/step-indicator.tsx
# Create apps/web/src/components/onboarding/step-logo.tsx
# Create apps/web/src/components/onboarding/step-address.tsx
# Create apps/web/src/components/onboarding/step-bank.tsx
# Create apps/web/src/components/onboarding/step-vat.tsx
# Create apps/web/src/components/onboarding/step-fees.tsx
# Create apps/web/src/components/onboarding/step-child.tsx
# Create apps/web/src/components/onboarding/step-invoice.tsx
# Create apps/web/src/components/onboarding/step-bank-connect.tsx

# 4. Create wizard and CTA
# Create apps/web/src/components/onboarding/onboarding-wizard.tsx
# Create apps/web/src/components/onboarding/onboarding-cta.tsx

# 5. Create page
# Create apps/web/src/app/(dashboard)/onboarding/page.tsx

# 6. Add CTA to dashboard
# Modify apps/web/src/app/(dashboard)/dashboard/page.tsx

# 7. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Progress persists across browser sessions
    - Steps can be clicked to navigate (if not locked)
    - Skip option available for skippable steps
    - Visual distinction for complete/skipped/active steps
    - Dashboard shows CTA until onboarding complete
    - Progress percentage calculated correctly
    - Form validation on each step
    - Loading states during API calls
    - Error handling with toast messages
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /onboarding loads wizard
    - Display: Progress bar shows correct percentage
    - Display: Step indicators show correct state
    - Action: Complete step updates progress
    - Action: Skip step moves to next
    - Action: Click step navigates to it
    - Navigation: Resumes from last active step
    - Dashboard: CTA shows when incomplete
    - Dashboard: CTA hidden when complete
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Reset progress without confirmation
  - Allow completing steps out of order (unless previous complete/skipped)
  - Skip required steps
  - Show CTA for completed onboarding
  - Make unskippable steps skippable
  - Forget loading states on form submission
  - Navigate away without saving in-progress data
</anti_patterns>

</task_spec>

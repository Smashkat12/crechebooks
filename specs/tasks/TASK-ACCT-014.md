<task_spec id="TASK-ACCT-014" version="2.0">

<metadata>
  <title>Tenant Onboarding Wizard</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>frontend</layer>
  <sequence>414</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-ONBOARD-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ACCT-001</task_ref>
    <task_ref status="ready">TASK-ACCT-003</task_ref>
    <task_ref status="COMPLETE">TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has no guided onboarding for new tenants. Settings are scattered.
  Stub has an excellent onboarding wizard with expandable steps and progress tracking.

  **Gap:**
  - No onboarding checklist
  - New tenants don't know where to start
  - Settings scattered across multiple pages
  - No progress indication

  **Files to Create:**
  - apps/web/src/app/(dashboard)/onboarding/page.tsx
  - apps/web/src/app/(dashboard)/onboarding/steps/page.tsx
  - apps/web/src/components/onboarding/OnboardingWizard.tsx
  - apps/web/src/components/onboarding/OnboardingStep.tsx
  - apps/web/src/components/onboarding/steps/*.tsx
  - apps/web/src/hooks/use-onboarding-progress.ts
  - apps/api/src/database/services/onboarding.service.ts

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD OnboardingProgress)
  - apps/web/src/app/(dashboard)/page.tsx (ADD onboarding CTA if incomplete)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Prisma Model
  ```prisma
  // packages/database/prisma/schema.prisma

  model OnboardingProgress {
    id              String         @id @default(cuid())
    tenantId        String         @unique

    // Step completion
    logoUploaded    Boolean        @default(false)
    addressSet      Boolean        @default(false)
    bankDetailsSet  Boolean        @default(false)
    vatConfigured   Boolean        @default(false)
    feeStructureCreated Boolean    @default(false)
    childEnrolled   Boolean        @default(false)
    firstInvoiceSent Boolean       @default(false)
    bankConnected   Boolean        @default(false)

    // Timestamps
    startedAt       DateTime       @default(now())
    completedAt     DateTime?
    lastStepAt      DateTime       @default(now())

    // Metadata
    skippedSteps    String[]       @default([])

    tenant          Tenant         @relation(fields: [tenantId], references: [id])
  }
  ```

  ### 3. Onboarding Wizard Component
  ```typescript
  // apps/web/src/components/onboarding/OnboardingWizard.tsx
  'use client';

  import { useState } from 'react';
  import { useOnboardingProgress } from '@/hooks/use-onboarding-progress';
  import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Progress } from '@/components/ui/progress';
  import { CheckCircle, Circle, ChevronDown, ChevronUp } from 'lucide-react';
  import { cn } from '@/lib/utils';

  interface OnboardingStep {
    id: string;
    title: string;
    description: string;
    isComplete: boolean;
    isSkippable: boolean;
    component: React.ReactNode;
    helpText?: string;
  }

  const steps: OnboardingStep[] = [
    {
      id: 'logo',
      title: 'Upload Your Logo',
      description: 'Add your creche logo to appear on invoices and statements',
      isComplete: false,
      isSkippable: true,
      component: <LogoUploadStep />,
      helpText: 'PNG or JPG, max 2MB',
    },
    {
      id: 'address',
      title: 'Physical Address',
      description: 'Required for legal invoices and parent communication',
      isComplete: false,
      isSkippable: false,
      component: <AddressStep />,
    },
    {
      id: 'bankDetails',
      title: 'Bank Details',
      description: 'Display on invoices so parents know where to pay',
      isComplete: false,
      isSkippable: false,
      component: <BankDetailsStep />,
      helpText: 'Parents will see these details on invoices',
    },
    {
      id: 'vatConfig',
      title: 'VAT Settings',
      description: 'Configure VAT if your creche is VAT registered (optional for most)',
      isComplete: false,
      isSkippable: true,
      component: <VatConfigStep />,
      helpText: 'Most creche fees are VAT exempt under Section 12(h)',
    },
    {
      id: 'feeStructure',
      title: 'Fee Structure',
      description: 'Set up your monthly fees, registration fees, and extras',
      isComplete: false,
      isSkippable: false,
      component: <FeeStructureStep />,
    },
    {
      id: 'enrollChild',
      title: 'Enrol First Child',
      description: 'Add your first child and parent to start billing',
      isComplete: false,
      isSkippable: true,
      component: <EnrolChildStep />,
    },
    {
      id: 'firstInvoice',
      title: 'Send First Invoice',
      description: 'Generate and send your first invoice to a parent',
      isComplete: false,
      isSkippable: true,
      component: <FirstInvoiceStep />,
    },
    {
      id: 'bankConnect',
      title: 'Connect Bank Account',
      description: 'Enable automatic bank reconciliation (optional)',
      isComplete: false,
      isSkippable: true,
      component: <BankConnectStep />,
      helpText: 'Match payments to invoices automatically',
    },
  ];

  export function OnboardingWizard() {
    const { progress, markStepComplete, skipStep, isLoading } = useOnboardingProgress();
    const [expandedStep, setExpandedStep] = useState<string | null>(null);

    if (isLoading) return <div>Loading...</div>;

    const completedCount = steps.filter(s => progress?.[`${s.id}Complete`] || progress?.skippedSteps?.includes(s.id)).length;
    const progressPercent = Math.round((completedCount / steps.length) * 100);

    const toggleStep = (stepId: string) => {
      setExpandedStep(expandedStep === stepId ? null : stepId);
    };

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Welcome to CrecheBooks!</h1>
          <p className="text-muted-foreground mt-2">
            Let&apos;s get your creche set up. Complete these steps to start billing.
          </p>
        </div>

        {/* Progress Bar */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Setup Progress</span>
              <span className="text-sm text-muted-foreground">{progressPercent}% complete</span>
            </div>
            <Progress value={progressPercent} className="h-2" />
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step) => {
            const isComplete = progress?.[`${step.id}Complete`] || false;
            const isSkipped = progress?.skippedSteps?.includes(step.id) || false;
            const isExpanded = expandedStep === step.id;

            return (
              <Card
                key={step.id}
                className={cn(
                  'transition-all',
                  isComplete && 'border-green-200 bg-green-50/50',
                  isSkipped && 'opacity-60',
                )}
              >
                <CardHeader
                  className="cursor-pointer"
                  onClick={() => !isComplete && !isSkipped && toggleStep(step.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isComplete ? (
                        <CheckCircle className="h-6 w-6 text-green-500" />
                      ) : (
                        <Circle className="h-6 w-6 text-muted-foreground" />
                      )}
                      <div>
                        <CardTitle className="text-lg">{step.title}</CardTitle>
                        <CardDescription>{step.description}</CardDescription>
                      </div>
                    </div>
                    {!isComplete && !isSkipped && (
                      isExpanded ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )
                    )}
                    {isComplete && (
                      <span className="text-sm text-green-600 font-medium">Done</span>
                    )}
                    {isSkipped && (
                      <span className="text-sm text-muted-foreground">Skipped</span>
                    )}
                  </div>
                </CardHeader>

                {isExpanded && !isComplete && !isSkipped && (
                  <CardContent className="pt-0">
                    <div className="border-t pt-4">
                      {step.helpText && (
                        <p className="text-sm text-muted-foreground mb-4">
                          {step.helpText}
                        </p>
                      )}
                      {step.component}
                      <div className="flex gap-2 mt-4">
                        <Button onClick={() => markStepComplete(step.id)}>
                          Mark Complete
                        </Button>
                        {step.isSkippable && (
                          <Button variant="ghost" onClick={() => skipStep(step.id)}>
                            Skip for now
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>

        {/* Completion CTA */}
        {progressPercent === 100 && (
          <Card className="border-green-200 bg-green-50">
            <CardContent className="flex items-center justify-between py-6">
              <div>
                <h3 className="font-semibold text-green-800">Setup Complete!</h3>
                <p className="text-green-700">
                  Your creche is ready to go. Start managing your billing.
                </p>
              </div>
              <Button asChild>
                <a href="/dashboard">Go to Dashboard</a>
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }
  ```

  ### 4. Onboarding Hook
  ```typescript
  // apps/web/src/hooks/use-onboarding-progress.ts
  import useSWR from 'swr';
  import useSWRMutation from 'swr/mutation';
  import { useSession } from 'next-auth/react';

  interface OnboardingProgress {
    logoUploaded: boolean;
    addressSet: boolean;
    bankDetailsSet: boolean;
    vatConfigured: boolean;
    feeStructureCreated: boolean;
    childEnrolled: boolean;
    firstInvoiceSent: boolean;
    bankConnected: boolean;
    skippedSteps: string[];
    completedAt: string | null;
  }

  export function useOnboardingProgress() {
    const { data: session } = useSession();
    const tenantId = session?.user?.tenantId;

    const { data: progress, isLoading, mutate } = useSWR<OnboardingProgress>(
      tenantId ? `/api/onboarding/progress` : null,
    );

    const { trigger: markComplete } = useSWRMutation(
      `/api/onboarding/progress`,
      async (url, { arg }: { arg: { stepId: string } }) => {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: arg.stepId, action: 'complete' }),
        });
        return res.json();
      },
      { onSuccess: () => mutate() },
    );

    const { trigger: skip } = useSWRMutation(
      `/api/onboarding/progress`,
      async (url, { arg }: { arg: { stepId: string } }) => {
        const res = await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepId: arg.stepId, action: 'skip' }),
        });
        return res.json();
      },
      { onSuccess: () => mutate() },
    );

    const isComplete = progress?.completedAt !== null;

    return {
      progress,
      isLoading,
      isComplete,
      markStepComplete: (stepId: string) => markComplete({ stepId }),
      skipStep: (stepId: string) => skip({ stepId }),
    };
  }
  ```

  ### 5. Onboarding Service
  ```typescript
  // apps/api/src/database/services/onboarding.service.ts
  @Injectable()
  export class OnboardingService {
    constructor(private readonly prisma: PrismaService) {}

    async getProgress(tenantId: string): Promise<OnboardingProgress> {
      let progress = await this.prisma.onboardingProgress.findUnique({
        where: { tenantId },
      });

      if (!progress) {
        progress = await this.prisma.onboardingProgress.create({
          data: { tenantId },
        });
      }

      return progress;
    }

    async markStepComplete(tenantId: string, stepId: string): Promise<OnboardingProgress> {
      const fieldName = `${stepId}Complete`;

      const progress = await this.prisma.onboardingProgress.update({
        where: { tenantId },
        data: {
          [fieldName]: true,
          lastStepAt: new Date(),
        },
      });

      // Check if all required steps are complete
      await this.checkCompletion(tenantId);

      return progress;
    }

    async skipStep(tenantId: string, stepId: string): Promise<OnboardingProgress> {
      return this.prisma.onboardingProgress.update({
        where: { tenantId },
        data: {
          skippedSteps: { push: stepId },
          lastStepAt: new Date(),
        },
      });
    }

    private async checkCompletion(tenantId: string): Promise<void> {
      const progress = await this.prisma.onboardingProgress.findUnique({
        where: { tenantId },
      });

      if (!progress) return;

      const requiredSteps = [
        progress.addressSet,
        progress.bankDetailsSet,
        progress.feeStructureCreated,
      ];

      if (requiredSteps.every(Boolean)) {
        await this.prisma.onboardingProgress.update({
          where: { tenantId },
          data: { completedAt: new Date() },
        });
      }
    }

    async autoDetectProgress(tenantId: string): Promise<void> {
      // Check actual data to auto-mark steps
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        include: {
          children: { take: 1 },
          feeStructures: { take: 1 },
          invoices: { take: 1 },
        },
      });

      if (!tenant) return;

      const updates: Partial<OnboardingProgress> = {};

      if (tenant.logo) updates.logoUploaded = true;
      if (tenant.address) updates.addressSet = true;
      if (tenant.bankAccountNumber) updates.bankDetailsSet = true;
      if (tenant.feeStructures.length > 0) updates.feeStructureCreated = true;
      if (tenant.children.length > 0) updates.childEnrolled = true;
      if (tenant.invoices.length > 0) updates.firstInvoiceSent = true;

      if (Object.keys(updates).length > 0) {
        await this.prisma.onboardingProgress.upsert({
          where: { tenantId },
          create: { tenantId, ...updates },
          update: updates,
        });
      }
    }
  }
  ```
</critical_patterns>

<context>
This task creates a guided onboarding wizard similar to Stub's excellent UX.
The wizard helps new creche owners set up their account step by step.

**Wizard Steps:**
1. Logo upload - Branding for invoices
2. Physical address - Legal requirement
3. Bank details - Payment instructions
4. VAT settings - Optional for most creches
5. Fee structure - Core pricing setup
6. First child enrollment - Start billing
7. First invoice - Complete the flow
8. Bank connection - Optional automation

**UX Patterns from Stub:**
- Expandable accordion steps
- Clear completion indicators
- Skip option for optional steps
- Progress bar
- Friendly, non-technical language
- Direct action buttons within steps
</context>

<scope>
  <in_scope>
    - OnboardingProgress model
    - Database migration
    - OnboardingService with progress tracking
    - OnboardingWizard React component
    - Step components (placeholders)
    - useOnboardingProgress hook
    - Auto-detection of existing setup
    - Dashboard CTA for incomplete onboarding
  </in_scope>
  <out_of_scope>
    - Full implementation of each step form (they exist elsewhere)
    - API endpoints (TASK-ACCT-034)
    - Mobile-specific design
    - Animated transitions
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_onboarding_progress

# 2. Build must pass
cd apps/api && pnpm run build
cd apps/web && pnpm run build

# 3. Run tests
pnpm test -- --testPathPattern="onboarding" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] OnboardingProgress model added to Prisma schema
  - [ ] Migration created and applied
  - [ ] OnboardingService with getProgress, markStepComplete, skipStep
  - [ ] Auto-detection of existing setup
  - [ ] OnboardingWizard component with expandable steps
  - [ ] useOnboardingProgress hook
  - [ ] Step placeholder components
  - [ ] Progress bar with percentage
  - [ ] Dashboard CTA for incomplete onboarding
  - [ ] Unit tests for service
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** block users from accessing other features during onboarding
  - **NEVER** require all steps (some are optional)
  - **NEVER** lose progress on page refresh
  - **NEVER** use technical accounting jargon in step descriptions
</anti_patterns>

</task_spec>

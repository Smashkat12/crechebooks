'use client';

/**
 * Tenant Onboarding Page
 * TASK-ACCT-014: Guided setup for new tenants
 *
 * Shows the onboarding wizard with checklist-style steps
 */

import { OnboardingWizard } from '@/components/tenant-onboarding';

export default function OnboardingPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      {/* Decorative background */}
      <div
        className="fixed inset-0 -z-10 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000000' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-2xl mx-auto">
        {/* Welcome header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Welcome to CrecheBooks!
          </h1>
          <p className="text-muted-foreground">
            Complete your setup to start managing your creche finances
          </p>
        </div>

        {/* Onboarding wizard */}
        <OnboardingWizard />
      </div>
    </div>
  );
}

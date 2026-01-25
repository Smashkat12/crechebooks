import { redirect } from 'next/navigation';

/**
 * Staff Onboarding Page (Admin)
 * TASK-ACCT-011: Replaced admin onboarding wizard with redirect.
 * Staff now complete onboarding via self-service portal (magic link email).
 */

interface StaffOnboardingPageProps {
  params: Promise<{ id: string }>;
}

export default async function StaffOnboardingPage({ params }: StaffOnboardingPageProps) {
  const { id } = await params;
  redirect(`/staff/${id}`);
}

import { DashboardSkeleton } from '@/components/dashboard/dashboard-widget-skeleton';

/**
 * Dashboard loading skeleton - displayed during route transitions.
 * Uses the comprehensive DashboardSkeleton that matches the actual dashboard layout.
 */
export default function DashboardLoading() {
  return <DashboardSkeleton />;
}

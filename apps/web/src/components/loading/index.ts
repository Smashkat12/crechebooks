// Base skeleton - re-exported from ui for convenience
export { Skeleton } from '@/components/ui/skeleton';

// Page-level skeletons
export {
  PageSkeleton,
  DashboardPageSkeleton,
  ListPageSkeleton,
  DetailPageSkeleton
} from './PageSkeleton';

// Table skeletons
export { TableSkeleton, CompactTableSkeleton } from './TableSkeleton';

// Card skeletons
export { CardSkeleton, StatCardSkeleton, StatCardsGridSkeleton } from './CardSkeleton';

// Form skeletons
export { FormSkeleton, SettingsFormSkeleton } from './FormSkeleton';

// Re-export DataTableSkeleton from tables for consistency
export { DataTableSkeleton } from '@/components/tables/data-table-skeleton';

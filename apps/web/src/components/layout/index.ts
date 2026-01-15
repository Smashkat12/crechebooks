export { Sidebar } from './sidebar';
export { Header } from './header';
export { MobileNav } from './mobile-nav';
export { Breadcrumbs } from './breadcrumbs';
export { UserNav } from './user-nav';
export { ThemeToggle } from './theme-toggle';
export { DashboardLayout } from './dashboard-layout';
export { mainNavLinks, managementNavLinks, complianceNavLinks, settingsNavLink } from './nav-links';
export type { NavLink } from './nav-links';

// TASK-UI-008: Responsive sidebar
export { ResponsiveSidebar, DrawerSidebar } from './responsive-sidebar';

// Re-export error boundary for convenience
export { ErrorBoundary, withErrorBoundary } from '../error-boundary';
export { ErrorBoundaryProvider } from '../error-boundary-provider';
export { ErrorFallback, CompactErrorFallback } from '../ui/error-fallback';

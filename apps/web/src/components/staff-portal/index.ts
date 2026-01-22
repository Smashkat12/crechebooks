/**
 * Staff Portal Components
 * TASK-PORTAL-021: Staff Portal Layout and Authentication
 * TASK-PORTAL-022: Staff Portal Dashboard
 * TASK-PORTAL-023: Staff Portal Payslips Page
 * TASK-PORTAL-024: Staff Portal Leave Management
 * TASK-PORTAL-025: Staff Portal Tax Documents
 *
 * Components for the staff-facing portal where employees can:
 * - View and download payslips
 * - Request and manage leave
 * - Access tax documents (IRP5)
 * - Manage their employment profile
 */

// Layout components
export { StaffHeader } from './staff-header';
export { StaffSidebar } from './staff-sidebar';
export { StaffMobileNav, StaffBottomNav } from './staff-mobile-nav';

// Dashboard components (TASK-PORTAL-022)
export { EmploymentCard } from './employment-card';
export { RecentPayslips } from './recent-payslips';
export { LeaveBalanceCard } from './leave-balance-card';
export { NextPayCard } from './next-pay-card';
export { Announcements } from './announcements';
export { YtdEarnings } from './ytd-earnings';

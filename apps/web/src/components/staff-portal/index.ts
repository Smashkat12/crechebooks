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

// Payslips components (TASK-PORTAL-023)
export { PayslipList } from './payslip-list';
export { PayslipCard } from './payslip-card';
export { EarningsTable } from './earnings-table';
export { DeductionsTable } from './deductions-table';

// Leave Management components (TASK-PORTAL-024)
export { LeaveBalanceDisplay } from './leave-balance-display';
export type { LeaveBalanceItem as LeaveBalanceDisplayItem } from './leave-balance-display';
export { LeaveRequestForm } from './leave-request-form';
export type { LeaveRequestFormData, LeaveRequestFormProps } from './leave-request-form';
export { LeaveHistory } from './leave-history';
export type { LeaveRequest, LeaveStatus, LeaveHistoryProps } from './leave-history';
export { LeaveCalendar } from './leave-calendar';
export type { LeaveEvent, LeaveCalendarProps } from './leave-calendar';
export { LeavePolicy } from './leave-policy';
export type { LeavePolicyProps } from './leave-policy';

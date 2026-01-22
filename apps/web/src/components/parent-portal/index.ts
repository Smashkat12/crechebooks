/**
 * Parent Portal Components
 * TASK-PORTAL-011: Parent Portal Layout and Authentication
 * TASK-PORTAL-012: Parent Portal Dashboard
 * TASK-PORTAL-013: Parent Portal Invoices Page
 * TASK-PORTAL-014: Parent Portal Statements Page
 *
 * Components for the parent-facing portal where parents can:
 * - View and pay invoices
 * - Download statements
 * - Manage their profile
 * - Track payment history
 */

export { PortalHeader } from './portal-header';
export { PortalNav } from './portal-nav';

// Dashboard Components (TASK-PORTAL-012)
export { BalanceCard } from './balance-card';
export { RecentInvoices } from './recent-invoices';
export { ChildrenSummary } from './children-summary';
export { QuickActions } from './quick-actions';
export { ArrearsAlert } from './arrears-alert';

// Invoice Components (TASK-PORTAL-013)
export { InvoiceFilters } from './invoice-filters';
export { InvoiceCard, type InvoiceCardData, type InvoiceStatus } from './invoice-card';
export { InvoiceList, type InvoiceListItem } from './invoice-list';
export { InvoiceLineItems, type LineItem } from './invoice-line-items';

// Statement Components (TASK-PORTAL-014)
export { StatementList, type StatementListItem, type StatementStatus } from './statement-list';
export { StatementPreview } from './statement-preview';
export { TransactionTable, type StatementTransaction, type TransactionType } from './transaction-table';
export { MonthPicker } from './month-picker';

// Payment Components (TASK-PORTAL-015)
export { PaymentList } from './payment-list';
export { PaymentDetail } from './payment-detail';
export { BankDetailsCard } from './bank-details-card';
export { PaymentReference } from './payment-reference';

// Profile Components (TASK-PORTAL-016)
export { ProfileForm } from './profile-form';
export { ChildCard } from './child-card';
export { CommunicationPrefs } from './communication-prefs';
export { WhatsAppConsent } from './whatsapp-consent';

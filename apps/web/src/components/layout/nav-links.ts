import {
  LayoutDashboard,
  Receipt,
  FileText,
  Wallet,
  AlertTriangle,
  Building2,
  Users,
  UsersRound,
  FileSpreadsheet,
  BarChart3,
  Settings,
  GraduationCap,
  ClipboardList,
  Shield,
  Megaphone,
  Calculator,
  Truck,
  BookOpen,
  FilePlus2,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  title: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  children?: NavLink[];
  requiredRole?: string; // Optional: restrict navigation to specific roles
}

export const mainNavLinks: NavLink[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Transactions', href: '/transactions', icon: Receipt },
  { title: 'Invoices', href: '/invoices', icon: FileText },
  { title: 'Quotes', href: '/accounting/quotes', icon: FilePlus2 },
  { title: 'Statements', href: '/statements', icon: ClipboardList },
  { title: 'Payments', href: '/payments', icon: Wallet },
  { title: 'Arrears', href: '/arrears', icon: AlertTriangle },
];

export const managementNavLinks: NavLink[] = [
  { title: 'Enrollments', href: '/enrollments', icon: GraduationCap },
  { title: 'Parents', href: '/parents', icon: UsersRound },
  { title: 'Staff', href: '/staff', icon: Users },
  { title: 'Payroll', href: '/staff/payroll', icon: FileSpreadsheet },
  { title: 'Communications', href: '/communications', icon: Megaphone },
];

export const complianceNavLinks: NavLink[] = [
  { title: 'Accounting', href: '/accounting/accounts', icon: Calculator },
  { title: 'General Ledger', href: '/accounting/general-ledger', icon: BookOpen },
  { title: 'Cash Flow', href: '/accounting/cash-flow', icon: TrendingUp },
  { title: 'Suppliers', href: '/accounting/suppliers', icon: Truck },
  { title: 'SARS', href: '/sars', icon: Building2 },
  { title: 'Reconciliation', href: '/reconciliation', icon: BarChart3 },
  { title: 'Reports', href: '/reports', icon: FileSpreadsheet },
];

export const settingsNavLink: NavLink = {
  title: 'Settings',
  href: '/settings',
  icon: Settings
};

export const adminNavLink: NavLink = {
  title: 'Admin Portal',
  href: '/admin',
  icon: Shield,
  requiredRole: 'SUPER_ADMIN'
};

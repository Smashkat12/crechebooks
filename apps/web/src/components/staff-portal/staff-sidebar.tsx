'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  Calendar,
  FileText,
  User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  {
    href: '/staff/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/staff/payslips',
    label: 'Payslips',
    icon: Receipt,
  },
  {
    href: '/staff/leave',
    label: 'Leave',
    icon: Calendar,
  },
  {
    href: '/staff/tax-documents',
    label: 'Tax Documents',
    icon: FileText,
  },
  {
    href: '/staff/profile',
    label: 'Profile',
    icon: User,
  },
];

export function StaffSidebar() {
  const pathname = usePathname();

  // Don't show nav on auth pages
  if (pathname === '/staff/login' || pathname === '/staff/verify') {
    return null;
  }

  return (
    <div className="flex flex-col h-full py-4">
      <nav className="flex-1 px-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <Icon className={cn('h-5 w-5', isActive && 'text-emerald-600 dark:text-emerald-400')} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Version info at bottom */}
      <div className="px-4 py-2 mt-auto">
        <p className="text-xs text-muted-foreground">
          Staff Portal v1.0
        </p>
      </div>
    </div>
  );
}

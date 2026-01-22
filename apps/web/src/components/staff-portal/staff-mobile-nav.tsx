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

interface StaffMobileNavProps {
  onNavigate?: () => void;
}

export function StaffMobileNav({ onNavigate }: StaffMobileNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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
    </div>
  );
}

export function StaffBottomNav() {
  const pathname = usePathname();

  // Don't show nav on auth pages
  if (pathname === '/staff/login' || pathname === '/staff/verify') {
    return null;
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors',
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon
                className={cn('h-5 w-5', isActive && 'text-emerald-600 dark:text-emerald-400')}
              />
              <span
                className={cn(
                  'text-xs',
                  isActive ? 'font-medium' : 'font-normal'
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

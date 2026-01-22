'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
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
    href: '/parent/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/parent/invoices',
    label: 'Invoices',
    icon: FileText,
  },
  {
    href: '/parent/statements',
    label: 'Statements',
    icon: Receipt,
  },
  {
    href: '/parent/payments',
    label: 'Payments',
    icon: CreditCard,
  },
  {
    href: '/parent/profile',
    label: 'Profile',
    icon: User,
  },
];

export function PortalNav() {
  const pathname = usePathname();

  // Don't show nav on auth pages
  if (pathname === '/parent/login' || pathname === '/parent/verify') {
    return null;
  }

  return (
    <>
      {/* Desktop sidebar (hidden by default, only shown if needed in future) */}
      <nav className="hidden" aria-label="Desktop navigation">
        <div className="flex flex-col gap-1 p-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Mobile bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon
                  className={cn('h-5 w-5', isActive && 'text-primary')}
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
    </>
  );
}

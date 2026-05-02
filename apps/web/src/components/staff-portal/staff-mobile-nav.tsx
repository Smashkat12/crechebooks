'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Receipt,
  Calendar,
  FileText,
  User,
  ClipboardList,
  MoreHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useBreakpoint } from '@/hooks/useBreakpoint';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

/** All 6 bottom-nav items in canonical order. */
const allNavItems: NavItem[] = [
  {
    href: '/staff/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/staff/onboarding',
    label: 'Onboarding',
    icon: ClipboardList,
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
    label: 'Tax Docs',
    icon: FileText,
  },
  {
    href: '/staff/profile',
    label: 'Profile',
    icon: User,
  },
];

/**
 * On screens <=375px (small phones) show 5 items; move "Onboarding"
 * into a "More" Sheet to prevent overflow. On >=376px show all 6.
 */
const STAFF_BOTTOM_VISIBLE: NavItem[] = allNavItems.filter(
  (i) => i.href !== '/staff/onboarding'
);
const STAFF_BOTTOM_OVERFLOW: NavItem[] = allNavItems.filter(
  (i) => i.href === '/staff/onboarding'
);
/** Threshold at or below which the compact layout applies (inclusive). */
const COMPACT_BREAKPOINT = 375;

interface StaffMobileNavProps {
  onNavigate?: () => void;
}

export function StaffMobileNav({ onNavigate }: StaffMobileNavProps) {
  const pathname = usePathname();

  return (
    <div className="flex flex-col gap-1">
      {allNavItems.map((item) => {
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
  const { width } = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);

  // Don't show nav on auth pages
  if (pathname === '/staff/login' || pathname === '/staff/verify') {
    return null;
  }

  /**
   * width defaults to 1024 on SSR (useBreakpoint). 1024 > 375 so the
   * compact layout won't flash on initial render.
   */
  const isCompact = width <= COMPACT_BREAKPOINT;

  /** Whether any overflow item is currently active (for More button highlight). */
  const overflowActive = STAFF_BOTTOM_OVERFLOW.some(
    (i) => pathname === i.href || pathname.startsWith(`${i.href}/`)
  );

  const visibleItems = isCompact ? STAFF_BOTTOM_VISIBLE : allNavItems;

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Mobile navigation"
    >
      <div className="flex items-center justify-around h-16 px-2">
        {visibleItems.map((item) => {
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

        {/* "More" tab — only shown on compact screens (<=375px) */}
        {isCompact && (
          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="More navigation options"
                className={cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors',
                  overflowActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MoreHorizontal
                  className={cn('h-5 w-5', overflowActive && 'text-emerald-600 dark:text-emerald-400')}
                />
                <span
                  className={cn(
                    'text-xs',
                    overflowActive ? 'font-medium' : 'font-normal'
                  )}
                >
                  More
                </span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom">
              <SheetHeader>
                <SheetTitle className="sr-only">More navigation</SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-1 pt-4">
                {STAFF_BOTTOM_OVERFLOW.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors min-h-[44px]',
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
            </SheetContent>
          </Sheet>
        )}
      </div>
    </nav>
  );
}

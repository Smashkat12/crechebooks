'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Receipt,
  CreditCard,
  User,
  MessageSquare,
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
    href: '/parent/messages',
    label: 'Messages',
    icon: MessageSquare,
  },
  {
    href: '/parent/profile',
    label: 'Profile',
    icon: User,
  },
];

/**
 * On screens <=375px (small phones) show 5 items; move "Statements"
 * into a "More" Sheet to prevent overflow. On >=376px show all 6.
 */
const COMPACT_VISIBLE: NavItem[] = allNavItems.filter((i) => i.href !== '/parent/statements');
const COMPACT_OVERFLOW: NavItem[] = allNavItems.filter((i) => i.href === '/parent/statements');
/** Threshold at or below which the compact layout applies (inclusive). */
const COMPACT_BREAKPOINT = 375;

function NavTabItem({ item, isActive }: { item: NavItem; isActive: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors',
        isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
      )}
    >
      <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
      <span className={cn('text-xs', isActive ? 'font-medium' : 'font-normal')}>
        {item.label}
      </span>
    </Link>
  );
}

export function PortalNav() {
  const pathname = usePathname();
  const { width } = useBreakpoint();
  const [moreOpen, setMoreOpen] = useState(false);

  // Don't show nav on auth pages
  if (pathname === '/parent/login' || pathname === '/parent/verify') {
    return null;
  }

  /**
   * width defaults to 1024 on SSR (useBreakpoint). Guard width > 0 is
   * satisfied on SSR too, but 1024 > 375 so compact layout won't flash.
   */
  const isCompact = width <= COMPACT_BREAKPOINT;
  const visibleItems = isCompact ? COMPACT_VISIBLE : allNavItems;
  const overflowActive =
    isCompact &&
    COMPACT_OVERFLOW.some(
      (i) => pathname === i.href || pathname.startsWith(`${i.href}/`)
    );

  return (
    <>
      {/* Desktop sidebar (hidden - reserved for future use) */}
      <nav className="hidden" aria-label="Desktop navigation" />

      {/* Mobile bottom navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
        aria-label="Mobile navigation"
      >
        <div className="flex items-center justify-around h-16 px-2">
          {visibleItems.map((item) => (
            <NavTabItem
              key={item.href}
              item={item}
              isActive={pathname === item.href || pathname.startsWith(`${item.href}/`)}
            />
          ))}

          {/* "More" tab - only shown on compact screens (<=375px) */}
          {isCompact && (
            <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
              <SheetTrigger asChild>
                <button
                  aria-label="More navigation options"
                  className={cn(
                    'flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-lg min-w-[60px] transition-colors',
                    overflowActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <MoreHorizontal
                    className={cn('h-5 w-5', overflowActive && 'text-primary')}
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
                  {COMPACT_OVERFLOW.map((item) => {
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
                            ? 'bg-primary/10 text-primary'
                            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                        )}
                      >
                        <Icon className={cn('h-5 w-5', isActive && 'text-primary')} />
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
    </>
  );
}

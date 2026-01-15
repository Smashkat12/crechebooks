'use client';

/**
 * Responsive Sidebar Component
 * TASK-UI-008: Fix Mobile Responsiveness
 *
 * Features:
 * - Hidden on mobile (< lg breakpoint)
 * - Collapsible on desktop
 * - Drawer mode for tablet
 * - Touch-friendly tap targets (min 44px)
 * - Smooth transitions
 * - Safe area padding
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { ChevronLeft, ChevronRight, Menu } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { useState, useEffect } from 'react';
import {
  mainNavLinks,
  managementNavLinks,
  complianceNavLinks,
  settingsNavLink,
  type NavLink,
} from './nav-links';

// ============================================================================
// Types
// ============================================================================

interface NavItemProps {
  link: NavLink;
  collapsed: boolean;
  isActive: boolean;
  onClick?: () => void;
}

interface NavSectionProps {
  title: string;
  links: NavLink[];
  collapsed: boolean;
  pathname: string;
  onItemClick?: () => void;
}

interface ResponsiveSidebarProps {
  /** Override default collapse state */
  defaultCollapsed?: boolean;
  /** Show toggle button */
  showToggle?: boolean;
  /** Custom class name */
  className?: string;
}

// ============================================================================
// Nav Item Component
// ============================================================================

function NavItem({ link, collapsed, isActive, onClick }: NavItemProps) {
  const Icon = link.icon;

  const content = (
    <Link href={link.href} className="w-full" onClick={onClick}>
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start',
          // TASK-UI-008: Touch-friendly tap target (min 44px)
          'min-h-[44px]',
          collapsed && 'justify-center px-2',
          isActive && 'bg-secondary font-semibold',
          // Active state feedback for touch
          'active:scale-[0.98] transition-transform'
        )}
      >
        <Icon className={cn('h-5 w-5', !collapsed && 'mr-3')} />
        {!collapsed && (
          <>
            <span className="truncate">{link.title}</span>
            {link.badge !== undefined && (
              <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {link.badge}
              </span>
            )}
          </>
        )}
      </Button>
    </Link>
  );

  // Show tooltip when collapsed
  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            <p>{link.title}</p>
            {link.badge !== undefined && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {link.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

// ============================================================================
// Nav Section Component
// ============================================================================

function NavSection({
  title,
  links,
  collapsed,
  pathname,
  onItemClick,
}: NavSectionProps) {
  return (
    <div className="space-y-1">
      {!collapsed && (
        <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
      )}
      {links.map((link) => (
        <NavItem
          key={link.href}
          link={link}
          collapsed={collapsed}
          isActive={
            pathname === link.href || pathname.startsWith(`${link.href}/`)
          }
          onClick={onItemClick}
        />
      ))}
    </div>
  );
}

// ============================================================================
// Logo Component
// ============================================================================

function Logo({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      href="/dashboard"
      className="flex items-center space-x-2"
      onClick={onClick}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold shrink-0">
        C
      </div>
      {!collapsed && <span className="text-lg font-bold">CrecheBooks</span>}
    </Link>
  );
}

// ============================================================================
// Desktop Sidebar
// ============================================================================

function DesktopSidebar({ className }: { className?: string }) {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300',
        'hidden lg:flex lg:flex-col',
        sidebarCollapsed ? 'w-16' : 'w-64',
        className
      )}
    >
      {/* Header with Logo */}
      <div
        className={cn(
          'flex h-16 items-center border-b shrink-0',
          sidebarCollapsed ? 'justify-center px-2' : 'px-4'
        )}
      >
        <Logo collapsed={sidebarCollapsed} />
      </div>

      {/* Scrollable Navigation */}
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-2">
          <NavSection
            title="Main"
            links={mainNavLinks}
            collapsed={sidebarCollapsed}
            pathname={pathname}
          />
          <Separator />
          <NavSection
            title="Management"
            links={managementNavLinks}
            collapsed={sidebarCollapsed}
            pathname={pathname}
          />
          <Separator />
          <NavSection
            title="Compliance"
            links={complianceNavLinks}
            collapsed={sidebarCollapsed}
            pathname={pathname}
          />
        </div>
      </ScrollArea>

      {/* Footer with Settings & Toggle */}
      <div className="border-t p-2 space-y-1 shrink-0">
        <NavItem
          link={settingsNavLink}
          collapsed={sidebarCollapsed}
          isActive={pathname.startsWith('/settings')}
        />
        <Button
          variant="ghost"
          className={cn(
            'w-full min-h-[44px]',
            sidebarCollapsed && 'justify-center px-2'
          )}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <>
              <ChevronLeft className="h-5 w-5 mr-3" />
              <span>Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}

// ============================================================================
// Tablet/Mobile Drawer Sidebar
// ============================================================================

function DrawerSidebar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const handleLinkClick = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            'lg:hidden',
            // TASK-UI-008: Touch-friendly tap target
            'min-h-[44px] min-w-[44px]'
          )}
          aria-label="Open navigation menu"
        >
          <Menu className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className={cn(
          'w-[280px] sm:w-[320px] p-0',
          // Safe area padding for devices with notches
          'pt-safe-area-inset-top pb-safe-area-inset-bottom'
        )}
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle>
            <Logo collapsed={false} onClick={handleLinkClick} />
          </SheetTitle>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-8rem)]">
          <div className="space-y-4 p-2">
            <NavSection
              title="Main"
              links={mainNavLinks}
              collapsed={false}
              pathname={pathname}
              onItemClick={handleLinkClick}
            />
            <Separator />
            <NavSection
              title="Management"
              links={managementNavLinks}
              collapsed={false}
              pathname={pathname}
              onItemClick={handleLinkClick}
            />
            <Separator />
            <NavSection
              title="Compliance"
              links={complianceNavLinks}
              collapsed={false}
              pathname={pathname}
              onItemClick={handleLinkClick}
            />
            <Separator />
            <div className="pt-2">
              <NavItem
                link={settingsNavLink}
                collapsed={false}
                isActive={pathname.startsWith('/settings')}
                onClick={handleLinkClick}
              />
            </div>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

// ============================================================================
// Responsive Sidebar Export
// ============================================================================

/**
 * Responsive sidebar that adapts to screen size:
 * - Desktop (lg+): Fixed sidebar with collapse toggle
 * - Tablet/Mobile (<lg): Sheet drawer triggered by menu button
 */
export function ResponsiveSidebar({ className }: ResponsiveSidebarProps) {
  // Render desktop sidebar - mobile drawer is rendered in Header via MobileNav
  // This prevents hydration mismatches by always rendering the same structure
  return (
    <>
      <DesktopSidebar className={className} />
      {/* DrawerSidebar trigger is rendered in Header component */}
    </>
  );
}

// Export drawer trigger for use in Header
export { DrawerSidebar };

export default ResponsiveSidebar;

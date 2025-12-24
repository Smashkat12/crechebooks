'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import {
  mainNavLinks,
  managementNavLinks,
  complianceNavLinks,
  settingsNavLink,
  type NavLink,
} from './nav-links';

interface NavItemProps {
  link: NavLink;
  collapsed: boolean;
  isActive: boolean;
}

function NavItem({ link, collapsed, isActive }: NavItemProps) {
  const Icon = link.icon;

  const content = (
    <Link href={link.href} className="w-full">
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start',
          collapsed && 'justify-center px-2',
          isActive && 'bg-secondary font-semibold'
        )}
      >
        <Icon className={cn('h-4 w-4', !collapsed && 'mr-2')} />
        {!collapsed && <span>{link.title}</span>}
        {!collapsed && link.badge !== undefined && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {link.badge}
          </span>
        )}
      </Button>
    </Link>
  );

  if (collapsed) {
    return (
      <TooltipProvider delayDuration={0}>
        <Tooltip>
          <TooltipTrigger asChild>{content}</TooltipTrigger>
          <TooltipContent side="right">
            <p>{link.title}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return content;
}

interface NavSectionProps {
  title: string;
  links: NavLink[];
  collapsed: boolean;
  pathname: string;
}

function NavSection({ title, links, collapsed, pathname }: NavSectionProps) {
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
          isActive={pathname === link.href || pathname.startsWith(`${link.href}/`)}
        />
      ))}
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-background transition-all duration-300',
        'hidden lg:block', // Hide on mobile, show on desktop
        sidebarCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center border-b px-4">
          {sidebarCollapsed ? (
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
              C
            </div>
          ) : (
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                C
              </div>
              <span className="text-lg font-bold">CrecheBooks</span>
            </Link>
          )}
        </div>

        {/* Navigation */}
        <div className="flex-1 space-y-4 overflow-y-auto p-2">
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

        {/* Settings & Toggle */}
        <div className="border-t p-2 space-y-1">
          <NavItem
            link={settingsNavLink}
            collapsed={sidebarCollapsed}
            isActive={pathname.startsWith('/settings')}
          />
          <Button
            variant="ghost"
            className={cn('w-full', sidebarCollapsed && 'justify-center px-2')}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span>Collapse</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Shield, LayoutDashboard, LogOut, Menu, ChevronRight } from 'lucide-react';
import { TenantSwitcher } from './TenantSwitcher';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useState } from 'react';

const breadcrumbMap: Record<string, string> = {
  '/admin': 'Dashboard',
  '/admin/tenants': 'Tenants',
  '/admin/tenants/new': 'New Tenant',
  '/admin/users': 'Users',
  '/admin/analytics': 'Analytics',
  '/admin/audit-logs': 'Audit Logs',
  '/admin/submissions': 'Submissions',
};

export function AdminHeader() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getBreadcrumbs = () => {
    const paths = pathname.split('/').filter(Boolean);
    const breadcrumbs = [];
    let currentPath = '';

    for (const path of paths) {
      currentPath += `/${path}`;
      const label = breadcrumbMap[currentPath] || path.charAt(0).toUpperCase() + path.slice(1);
      breadcrumbs.push({ href: currentPath, label });
    }

    return breadcrumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  const handleLogout = async () => {
    await logout();

    // Only redirect to Auth0 logout if Auth0 is configured
    const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
    const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;

    if (auth0Domain && clientId) {
      const returnTo = encodeURIComponent(window.location.origin + '/login');
      window.location.href = `https://${auth0Domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;
    }
    // If Auth0 is not configured, logout() already redirects to /login
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card">
      <div className="flex h-16 items-center px-4 lg:px-6">
        {/* Mobile menu */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden mr-2">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b">
              <div className="flex items-center gap-2">
                <Shield className="h-6 w-6 text-primary" />
                <span className="font-semibold">Admin Portal</span>
              </div>
            </div>
            <nav className="p-4 space-y-2">
              {Object.entries(breadcrumbMap).map(([href, label]) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        {/* Logo */}
        <Link href="/admin" className="flex items-center gap-2 mr-6">
          <Shield className="h-6 w-6 text-primary" />
          <span className="font-semibold hidden sm:inline">Admin Portal</span>
        </Link>

        {/* Breadcrumbs */}
        <nav className="hidden md:flex items-center text-sm">
          {breadcrumbs.map((crumb, index) => (
            <div key={crumb.href} className="flex items-center">
              {index > 0 && <ChevronRight className="h-4 w-4 mx-2 text-muted-foreground" />}
              {index === breadcrumbs.length - 1 ? (
                <span className="text-foreground font-medium">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="text-muted-foreground hover:text-foreground">
                  {crumb.label}
                </Link>
              )}
            </div>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-4">
          {/* TASK-ADMIN-001: Tenant Switcher for impersonation */}
          <TenantSwitcher />

          <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard">
              <LayoutDashboard className="h-4 w-4 mr-2" />
              Go to Dashboard
            </Link>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    {user?.name?.charAt(0) || 'A'}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{user?.name}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                  <p className="text-xs text-primary font-semibold">SUPER_ADMIN</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

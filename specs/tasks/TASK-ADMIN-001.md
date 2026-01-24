<task_spec id="TASK-ADMIN-001" version="2.0">

<metadata>
  <title>Admin Portal Layout and Navigation</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>301</sequence>
  <implements>
    <requirement_ref>REQ-ADMIN-LAYOUT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-AUTH-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-24</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/app/admin/layout.tsx (NEW)
  - apps/web/src/components/admin/AdminSidebar.tsx (NEW)
  - apps/web/src/components/admin/AdminHeader.tsx (NEW)
  - apps/web/src/components/admin/AdminBreadcrumbs.tsx (NEW)

  **Files to Modify:**
  - apps/web/src/app/admin/page.tsx (UPDATE - integrate with layout)

  **Current Problem:**
  The admin portal has no dedicated layout, navigation, or proper structure for SUPER_ADMIN users.
  Users cannot navigate between admin sections and there's no visual distinction from regular dashboard.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. Admin Layout Structure
  ```typescript
  // apps/web/src/app/admin/layout.tsx
  'use client';

  import { useAuth } from '@/hooks/use-auth';
  import { useRouter } from 'next/navigation';
  import { useEffect } from 'react';
  import { AdminSidebar } from '@/components/admin/AdminSidebar';
  import { AdminHeader } from '@/components/admin/AdminHeader';

  export default function AdminLayout({ children }: { children: React.ReactNode }) {
    const { user, isLoading } = useAuth();
    const router = useRouter();

    useEffect(() => {
      if (!isLoading && user?.role !== 'SUPER_ADMIN') {
        router.push('/dashboard');
      }
    }, [user, isLoading, router]);

    if (isLoading) {
      return <div className="flex h-screen items-center justify-center">Loading...</div>;
    }

    if (user?.role !== 'SUPER_ADMIN') {
      return null;
    }

    return (
      <div className="flex h-screen bg-background">
        <AdminSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <AdminHeader />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    );
  }
  ```

  ### 3. Admin Sidebar Navigation
  ```typescript
  // apps/web/src/components/admin/AdminSidebar.tsx
  'use client';

  import Link from 'next/link';
  import { usePathname } from 'next/navigation';
  import { cn } from '@/lib/utils';
  import {
    LayoutDashboard,
    Building2,
    Users,
    BarChart3,
    ScrollText,
    Settings,
    MessageSquare,
    Shield,
  } from 'lucide-react';

  const navItems = [
    { href: '/admin', label: 'Overview', icon: LayoutDashboard },
    { href: '/admin/tenants', label: 'Tenants', icon: Building2 },
    { href: '/admin/users', label: 'Users', icon: Users },
    { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
    { href: '/admin/submissions', label: 'Submissions', icon: MessageSquare },
    { href: '/admin/settings', label: 'Settings', icon: Settings },
  ];

  export function AdminSidebar() {
    const pathname = usePathname();

    return (
      <aside className="hidden w-64 border-r bg-muted/40 lg:block">
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center gap-2 border-b px-6">
            <Shield className="h-6 w-6 text-primary" />
            <span className="text-lg font-semibold">Admin Portal</span>
          </div>
          <nav className="flex-1 space-y-1 p-4">
            {navItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    );
  }
  ```

  ### 4. Admin Header
  ```typescript
  // apps/web/src/components/admin/AdminHeader.tsx
  'use client';

  import { useAuth } from '@/hooks/use-auth';
  import { useRouter } from 'next/navigation';
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
  import { LogOut, User } from 'lucide-react';
  import { AdminBreadcrumbs } from './AdminBreadcrumbs';

  export function AdminHeader() {
    const { user, logout } = useAuth();
    const router = useRouter();

    const initials = user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'SA';

    const handleLogout = async () => {
      await logout();
      const auth0Domain = process.env.NEXT_PUBLIC_AUTH0_DOMAIN;
      const clientId = process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID;
      const returnTo = encodeURIComponent(window.location.origin + '/login');
      window.location.href = `https://${auth0Domain}/v2/logout?client_id=${clientId}&returnTo=${returnTo}`;
    };

    return (
      <header className="flex h-16 items-center justify-between border-b px-6">
        <AdminBreadcrumbs />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-9 w-9 rounded-full">
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span>{user?.name || 'Super Admin'}</span>
                <span className="text-xs text-muted-foreground">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Admin layout with sidebar navigation
    - Admin header with user menu and sign out
    - Breadcrumb navigation
    - Role-based access control (SUPER_ADMIN only)
    - Mobile responsive sidebar (collapsible)
  </in_scope>
  <out_of_scope>
    - Actual admin page content (separate tasks)
    - API endpoints (separate tasks)
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - Admin layout renders with sidebar
    - Navigation links work correctly
    - Active state highlights current page
    - Sign out works (clears Auth0 session)
    - Non-SUPER_ADMIN users redirected to /dashboard
  </verification>
</definition_of_done>

</task_spec>

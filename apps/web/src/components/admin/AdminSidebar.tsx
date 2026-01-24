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
  Mail,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

const navigation = [
  {
    title: 'Overview',
    items: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    ],
  },
  {
    title: 'Management',
    items: [
      { name: 'Tenants', href: '/admin/tenants', icon: Building2 },
      { name: 'Users', href: '/admin/users', icon: Users },
    ],
  },
  {
    title: 'Insights',
    items: [
      { name: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
      { name: 'Audit Logs', href: '/admin/audit-logs', icon: ScrollText },
    ],
  },
  {
    title: 'Inquiries',
    items: [
      { name: 'Submissions', href: '/admin/submissions', icon: Mail },
    ],
  },
];

export function AdminSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <>
      {/* Mobile overlay */}
      <div className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm hidden" />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-16 z-30 h-[calc(100vh-4rem)] bg-card border-r transition-all duration-300',
          collapsed ? 'w-16' : 'w-64',
          'hidden lg:block'
        )}
      >
        <div className="flex flex-col h-full">
          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
            {navigation.map((section) => (
              <div key={section.title}>
                {!collapsed && (
                  <h3 className="mb-2 px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.title}
                  </h3>
                )}
                <ul className="space-y-1">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href ||
                      (item.href !== '/admin' && pathname.startsWith(item.href));
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                            collapsed && 'justify-center px-2'
                          )}
                          title={collapsed ? item.name : undefined}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          {!collapsed && <span>{item.name}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          {/* Collapse toggle */}
          <div className="p-4 border-t">
            <Button
              variant="ghost"
              size="sm"
              className={cn('w-full', collapsed && 'px-2')}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? (
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
    </>
  );
}

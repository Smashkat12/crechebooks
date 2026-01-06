'use client';

import { cn } from '@/lib/utils';
import { Sidebar } from './sidebar';
import { Header } from './header';
import { useUIStore } from '@/stores/ui-store';
import { useAuth } from '@/hooks/use-auth';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  // Auth hook syncs token to localStorage and handles session
  useAuth();

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div
        className={cn(
          'transition-all duration-300',
          'lg:ml-64',
          sidebarCollapsed && 'lg:ml-16'
        )}
      >
        <Header />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

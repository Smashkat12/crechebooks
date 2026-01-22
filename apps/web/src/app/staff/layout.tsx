import type { Metadata } from 'next';
import Link from 'next/link';
import { StaffHeader } from '@/components/staff-portal/staff-header';
import { StaffSidebar } from '@/components/staff-portal/staff-sidebar';
import { StaffBottomNav } from '@/components/staff-portal/staff-mobile-nav';

export const metadata: Metadata = {
  title: {
    template: '%s | Staff Portal',
    default: 'Staff Portal',
  },
  description: 'CrecheBooks Staff Portal - View payslips, request leave, and manage your employment details',
};

export default function StaffPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <StaffHeader />
      <div className="flex-1 flex">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 md:pt-16 border-r bg-background">
          <StaffSidebar />
        </aside>
        {/* Main content */}
        <main className="flex-1 md:pl-64 pb-20 md:pb-6">
          <div className="container mx-auto px-4 py-6 pt-20 md:pt-6">
            {children}
          </div>
        </main>
      </div>
      {/* Mobile bottom navigation */}
      <StaffBottomNav />
      <footer className="hidden md:block border-t bg-muted/50 py-4 mt-auto md:ml-64">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} CrecheBooks. All rights reserved.</p>
            <div className="flex gap-4">
              <Link
                href="/staff/help"
                className="hover:text-foreground transition-colors"
              >
                Help & Support
              </Link>
              <Link
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy Policy
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

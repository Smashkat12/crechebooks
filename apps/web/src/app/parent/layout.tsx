import type { Metadata } from 'next';
import { PortalHeader } from '@/components/parent-portal/portal-header';
import { PortalNav } from '@/components/parent-portal/portal-nav';
import { ParentAuthGuard } from '@/components/parent-portal/auth-guard';

export const metadata: Metadata = {
  title: {
    template: '%s | Parent Portal',
    default: 'Parent Portal',
  },
  description: 'CrecheBooks Parent Portal - View invoices, statements, and make payments',
};

export default function ParentPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PortalHeader />
      <main className="flex-1 container mx-auto px-4 py-6 pb-20 md:pb-6">
        <ParentAuthGuard>{children}</ParentAuthGuard>
      </main>
      <PortalNav />
      <footer className="hidden md:block border-t bg-muted/50 py-4 mt-auto">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-muted-foreground">
            <p>&copy; {new Date().getFullYear()} CrecheBooks. All rights reserved.</p>
            <div className="flex gap-4">
              <a
                href="/parent/help"
                className="hover:text-foreground transition-colors"
              >
                Help & Support
              </a>
              <a
                href="/parent/contact"
                className="hover:text-foreground transition-colors"
              >
                Contact Us
              </a>
              <a
                href="/privacy"
                className="hover:text-foreground transition-colors"
              >
                Privacy Policy
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

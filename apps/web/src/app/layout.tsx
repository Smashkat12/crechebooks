import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';
import { Toaster } from '@/components/ui/toaster';
import { DefaultSkipLinks } from '@/components/ui/skip-link';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'CrecheBooks - AI-Powered Bookkeeping',
  description: 'AI-powered bookkeeping system for South African creches and pre-schools',
  keywords: ['creche', 'bookkeeping', 'daycare', 'invoicing', 'SARS', 'South Africa'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* TASK-UI-007: Skip links for keyboard/screen reader accessibility */}
        <DefaultSkipLinks />
        <Providers>{children}</Providers>
        <Toaster />
      </body>
    </html>
  );
}

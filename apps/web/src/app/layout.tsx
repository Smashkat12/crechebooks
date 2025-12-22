import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/styles/globals.css';
import { Providers } from '@/components/providers';

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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

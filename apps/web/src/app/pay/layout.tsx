import type { ReactNode } from 'react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Payment - CrecheBooks',
  description: 'Secure payment portal',
  robots: 'noindex, nofollow',
};

export default function PayLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/40">
      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-lg">{children}</div>
      </main>
      <footer className="border-t bg-background py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Powered by{' '}
            <a
              href="https://crechebooks.co.za"
              className="font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              CrecheBooks
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

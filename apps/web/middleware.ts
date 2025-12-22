export { auth as middleware } from '@/lib/auth';

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/transactions/:path*',
    '/invoices/:path*',
    '/payments/:path*',
    '/arrears/:path*',
    '/sars/:path*',
    '/reconciliation/:path*',
    '/parents/:path*',
    '/staff/:path*',
    '/payroll/:path*',
    '/reports/:path*',
    '/settings/:path*',
  ],
};

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { logger } from '@/lib/logger';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the JWT token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
    cookieName: process.env.NODE_ENV === 'production'
      ? '__Secure-authjs.session-token'
      : 'authjs.session-token',
  });

  const isLoggedIn = !!token;

  // Define protected routes
  const protectedRoutes = [
    '/dashboard',
    '/admin',
    '/transactions',
    '/invoices',
    '/payments',
    '/arrears',
    '/sars',
    '/reconciliation',
    '/parents',
    '/staff',
    '/payroll',
    '/reports',
    '/settings',
  ];

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect unauthenticated users from protected routes to login
  if (isProtectedRoute && !isLoggedIn) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users from login to dashboard
  if (pathname === '/login' && isLoggedIn) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/admin/:path*',
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
    '/login',
  ],
};

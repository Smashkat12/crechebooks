/**
 * Authentication Hook
 * TASK-UI-001: Removed localStorage token storage for XSS protection
 *
 * Authentication is now handled via:
 * - NextAuth session cookies (managed by NextAuth)
 * - HttpOnly cookies for API authentication (set by backend)
 *
 * No localStorage is used for tokens - this prevents XSS attacks from
 * stealing authentication credentials.
 */

'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { resetAuthState, clearAuthState, apiClient } from '@/lib/api/client';

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // TASK-UI-001: Reset auth state when session is authenticated
  // No localStorage storage - cookies handle authentication automatically
  useEffect(() => {
    if (status === 'authenticated') {
      resetAuthState(); // Reset 401 handling flag on successful auth
    }
  }, [status]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      resetAuthState(); // Reset after successful login
      router.push('/dashboard');
      router.refresh();
    },
    [router]
  );

  const logout = useCallback(async () => {
    // TASK-UI-001: Call backend logout to clear HttpOnly cookies and end impersonation
    // Uses apiClient (which attaches Authorization header from in-memory token)
    // instead of raw fetch, because SameSite:lax cookies are NOT sent on
    // cross-origin POST requests, making the HttpOnly cookie unavailable.
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Continue with signOut even if backend call fails
    }

    // Clear client-side auth state after backend call (so the token is still
    // available for the Authorization header during the logout request)
    clearAuthState();

    // Sign out from NextAuth session
    await signOut({ redirect: false });
    router.push('/');
    router.refresh();
  }, [router]);

  return {
    user: session?.user ?? null,
    // TASK-UI-001: accessToken is still available from session for backward compatibility
    // but should not be stored in localStorage or exposed to JavaScript
    accessToken: session?.accessToken,
    isAuthenticated: !!session?.user,
    isLoading: status === 'loading',
    login,
    logout,
  };
}

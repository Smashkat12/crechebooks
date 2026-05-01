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
import { resetAuthState, clearAuthState, apiClient, setAuthToken } from '@/lib/api/client';

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // TASK-UI-001: Reset auth state when session is authenticated
  // No localStorage storage - cookies handle authentication automatically
  //
  // ALSO sync the NextAuth session's accessToken into apiClient's in-memory
  // authToken. Without this, the request interceptor races on `await
  // getSession()` for every call during the first paint — the dashboard fans
  // out a dozen parallel queries and any whose interceptor returns from
  // getSession() before NextAuth has hydrated ship without a Bearer header
  // and come back as 401 "Authorization token required". The user-visible
  // symptom is "some routes work, some don't" plus a dashboard stuck in
  // skeleton state because React Query's retry budget swallows the time.
  useEffect(() => {
    if (status === 'authenticated') {
      resetAuthState();
      if (session?.accessToken) {
        setAuthToken(session.accessToken as string);
      }
    } else if (status === 'unauthenticated') {
      setAuthToken(null);
    }
  }, [status, session?.accessToken]);

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
    let auth0LogoutUrl: string | undefined;
    try {
      const { data } = await apiClient.post<{ success: boolean; auth0LogoutUrl?: string }>('/auth/logout');
      auth0LogoutUrl = data?.auth0LogoutUrl;
    } catch {
      // Continue with signOut even if backend call fails
    }

    // Clear client-side auth state after backend call (so the token is still
    // available for the Authorization header during the logout request)
    clearAuthState();

    // Sign out from NextAuth session (clears authjs.session-token / __Secure-authjs.session-token)
    await signOut({ redirect: false });

    // TASK-AUTH-002: Redirect to Auth0 /v2/logout to clear the Auth0 session cookie.
    // Without this, Auth0 silently re-issues a session on the next page load, making
    // logout appear to have no effect on refresh (the primary reported bug).
    // The URL is built server-side so no NEXT_PUBLIC_AUTH0_* env vars are needed.
    if (auth0LogoutUrl) {
      window.location.href = auth0LogoutUrl;
      return; // Auth0 will redirect back to the app's origin (returnTo)
    }

    // JWT-only mode (staging/dev): no Auth0, just navigate home
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

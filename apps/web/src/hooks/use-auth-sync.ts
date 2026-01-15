/**
 * Auth Sync Hook
 * TASK-UI-001: Removed localStorage token storage for XSS protection
 *
 * This hook now only manages session status without storing tokens.
 * HttpOnly cookies are used for authentication - managed by the browser.
 *
 * @deprecated This hook is maintained for backwards compatibility.
 * Use useAuth() directly instead for new code.
 */

'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { resetAuthState } from '@/lib/api/client';

/**
 * TASK-UI-001: No longer syncs tokens to localStorage.
 * HttpOnly cookies handle authentication automatically.
 * This hook is kept for backwards compatibility but does no token storage.
 */
export function useAuthSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    // TASK-UI-001: Reset auth state on authentication
    // No localStorage operations - cookies handle auth
    if (status === 'authenticated') {
      resetAuthState();
    }
  }, [status]);

  return { session, status };
}

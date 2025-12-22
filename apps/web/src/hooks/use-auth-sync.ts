'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

/**
 * Syncs the NextAuth session accessToken to localStorage
 * so the API client can use it for authenticated requests.
 */
export function useAuthSync() {
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      localStorage.setItem('token', session.accessToken);
    } else if (status === 'unauthenticated') {
      localStorage.removeItem('token');
    }
  }, [session, status]);

  return { session, status };
}

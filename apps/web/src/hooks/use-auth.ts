'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { resetAuthState } from '@/lib/api/client';

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Sync token to localStorage when session changes
  useEffect(() => {
    if (status === 'authenticated' && session?.accessToken) {
      localStorage.setItem('token', session.accessToken);
      resetAuthState(); // Reset 401 handling flag on successful auth
    } else if (status === 'unauthenticated') {
      localStorage.removeItem('token');
    }
  }, [session, status]);

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
    localStorage.removeItem('token');
    await signOut({ redirect: false });
    router.push('/login');
    router.refresh();
  }, [router]);

  return {
    user: session?.user ?? null,
    accessToken: session?.accessToken,
    isAuthenticated: !!session?.user,
    isLoading: status === 'loading',
    login,
    logout,
  };
}

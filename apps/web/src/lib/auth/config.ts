import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const authConfig: NextAuthConfig = {
  providers: [
    // Auth0 callback provider - receives user data after OAuth callback
    Credentials({
      id: 'auth0-callback',
      name: 'Auth0 Callback',
      credentials: {
        userId: { type: 'text' },
        email: { type: 'email' },
        name: { type: 'text' },
        role: { type: 'text' },
        tenantId: { type: 'text' },
        accessToken: { type: 'text' },
      },
      async authorize(credentials) {
        // This provider receives already-validated user data from the callback page
        // The backend has already exchanged the code for tokens and validated the user
        if (!credentials?.userId || !credentials?.email) {
          console.error('Auth0 callback: Missing required credentials');
          return null;
        }

        return {
          id: credentials.userId as string,
          email: credentials.email as string,
          name: (credentials.name as string) || '',
          role: (credentials.role as string) || 'STAFF',
          tenantId: (credentials.tenantId as string) || '',
          accessToken: (credentials.accessToken as string) || '',
        };
      },
    }),
    // Dev login provider - for development mode only
    Credentials({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

        // Development mode - use dev-login endpoint
        if (process.env.NEXT_PUBLIC_ENABLE_DEV_LOGIN === 'true') {
          try {
            const response = await fetch(`${apiUrl}/api/v1/auth/dev-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            });

            if (!response.ok) {
              const error = await response.json().catch(() => ({}));
              console.error('Dev login failed:', error);
              return null;
            }

            const data = await response.json();
            return {
              id: data.user.id,
              email: data.user.email,
              name: data.user.name,
              role: data.user.role,
              tenantId: data.user.tenant_id || '',
              accessToken: data.access_token,
            };
          } catch (error) {
            console.error('Dev login error:', error);
            return null;
          }
        }

        // Production mode - credentials login is not supported
        // Use Auth0 Universal Login instead
        console.error('Credentials login not supported in production. Use Auth0.');
        return null;
      },
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.tenantId = user.tenantId;
        token.accessToken = user.accessToken;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.tenantId = token.tenantId as string;
        session.accessToken = token.accessToken as string;
      }
      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours
  },
  trustHost: true,
};

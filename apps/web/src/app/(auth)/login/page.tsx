'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { signOut, signIn, useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Loader2, UserCircle, Mail, Eye, EyeOff } from 'lucide-react';

function LoginContent() {
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showEmailLogin, setShowEmailLogin] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();

  // Check for error from callback
  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
    }
  }, [searchParams]);

  // Handle signing out to use a different account
  const handleUseDifferentAccount = async () => {
    setIsSigningOut(true);
    try {
      // Clear the NextAuth session first
      await signOut({ redirect: false });
      // Then proceed with login (Auth0 will show login screen due to prompt=login)
      await handleAuth0Login();
    } catch (err) {
      console.error('Sign out error:', err);
      setIsSigningOut(false);
    }
  };

  const handleAuth0Login = async () => {
    setError('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      // Get the callback URL for this environment
      const callbackUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/callback`
        : 'http://localhost:3000/callback';

      // Call backend to get Auth0 authorization URL
      const response = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirect_uri: callbackUrl,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to initiate login');
      }

      const data = await response.json();

      if (!data.auth_url) {
        throw new Error('No authorization URL received');
      }

      // Redirect to Auth0 login page
      window.location.href = data.auth_url;
    } catch (err) {
      console.error('Login error:', err);
      setError(err instanceof Error ? err.message : 'Failed to initiate login');
      setIsLoading(false);
    }
  };

  // Handle email/password login (for trial accounts)
  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

      // Use dev-login endpoint for email/password auth
      const response = await fetch(`${apiUrl}/api/v1/auth/dev-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Invalid email or password');
      }

      // Create NextAuth session with the user data
      const result = await signIn('auth0-callback', {
        redirect: false,
        userId: data.user.id,
        email: data.user.email,
        name: data.user.name,
        role: data.user.role,
        tenantId: data.user.tenant_id || '',
        accessToken: data.access_token,
      });

      if (result?.error) {
        throw new Error(result.error);
      }

      // Redirect based on role
      const redirectPath = data.user.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard';
      router.push(redirectPath);
      router.refresh();
    } catch (err) {
      console.error('Email login error:', err);
      setError(err instanceof Error ? err.message : 'Login failed');
      setIsLoading(false);
    }
  };

  // If user has an active session, show options
  if (status === 'authenticated' && session?.user) {
    return (
      <Card className="w-full">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
          <CardDescription className="text-center">
            You&apos;re already signed in
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Current user info */}
          <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
            <UserCircle className="h-10 w-10 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{session.user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{session.user.email}</p>
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col space-y-3">
          <Button
            onClick={() => {
              const redirectPath = (session.user as any)?.role === 'SUPER_ADMIN' ? '/admin' : '/dashboard';
              router.push(redirectPath);
            }}
            className="w-full"
          >
            Continue as {session.user.name?.split(' ')[0] || 'User'}
          </Button>

          <Button
            variant="outline"
            onClick={handleUseDifferentAccount}
            className="w-full"
            disabled={isSigningOut || isLoading}
          >
            {isSigningOut || isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing out...
              </>
            ) : (
              'Use a different account'
            )}
          </Button>

          <div className="text-sm text-center text-muted-foreground pt-2">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up for free
            </Link>
          </div>
        </CardFooter>
      </Card>
    );
  }

  // Default: show login form
  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
        <CardDescription className="text-center">
          Sign in to your CrečheBooks account
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {showEmailLogin ? (
          // Email/Password login form
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isLoading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
        ) : (
          // SSO login button
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Click the button below to sign in with your account.
            </p>
            <Button
              onClick={handleAuth0Login}
              className="w-full"
              disabled={isLoading || status === 'loading'}
            >
              {isLoading || status === 'loading' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {status === 'loading' ? 'Checking session...' : 'Redirecting to login...'}
                </>
              ) : (
                'Sign in with SSO'
              )}
            </Button>
          </div>
        )}

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or</span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowEmailLogin(!showEmailLogin)}
          disabled={isLoading}
        >
          <Mail className="mr-2 h-4 w-4" />
          {showEmailLogin ? 'Sign in with SSO instead' : 'Sign in with email'}
        </Button>
      </CardContent>

      <CardFooter className="flex flex-col space-y-4">
        <div className="text-sm text-center text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-primary hover:underline">
            Sign up for free
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

function LoginFallback() {
  return (
    <Card className="w-full">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold text-center">Welcome back</CardTitle>
        <CardDescription className="text-center">
          Sign in to your CrečheBooks account
        </CardDescription>
      </CardHeader>
      <CardContent className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

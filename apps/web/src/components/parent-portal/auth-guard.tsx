'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

/** Pages that don't require authentication */
const PUBLIC_PARENT_PAGES = ['/parent/login', '/parent/verify'];

export function ParentAuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Skip auth check for public pages
    if (PUBLIC_PARENT_PAGES.some(page => pathname.startsWith(page))) {
      setIsChecking(false);
      return;
    }

    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.replace(`/parent/login?redirect=${encodeURIComponent(pathname)}`);
      return;
    }

    setIsChecking(false);
  }, [pathname, router]);

  // Don't show loader for public pages
  if (PUBLIC_PARENT_PAGES.some(page => pathname.startsWith(page))) {
    return <>{children}</>;
  }

  if (isChecking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}

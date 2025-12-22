'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, Home } from 'lucide-react';
import { Fragment } from 'react';

interface BreadcrumbSegment {
  label: string;
  href: string;
}

function formatSegment(segment: string): string {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function Breadcrumbs() {
  const pathname = usePathname();

  // Skip breadcrumbs for login/auth pages
  if (pathname.startsWith('/login') || pathname === '/') {
    return null;
  }

  const segments = pathname.split('/').filter(Boolean);

  const breadcrumbs: BreadcrumbSegment[] = [
    { label: 'Home', href: '/dashboard' },
  ];

  let currentPath = '';
  segments.forEach((segment) => {
    currentPath += `/${segment}`;
    breadcrumbs.push({
      label: formatSegment(segment),
      href: currentPath,
    });
  });

  // Don't show breadcrumbs if only on dashboard
  if (breadcrumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center space-x-1 text-sm text-muted-foreground">
      {breadcrumbs.map((breadcrumb, index) => {
        const isLast = index === breadcrumbs.length - 1;

        return (
          <Fragment key={breadcrumb.href}>
            {index === 0 ? (
              <Link
                href={breadcrumb.href}
                className="flex items-center hover:text-foreground transition-colors"
              >
                <Home className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                {isLast ? (
                  <span className="font-medium text-foreground">
                    {breadcrumb.label}
                  </span>
                ) : (
                  <Link
                    href={breadcrumb.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {breadcrumb.label}
                  </Link>
                )}
              </>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

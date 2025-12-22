'use client';

import { MobileNav } from './mobile-nav';
import { UserNav } from './user-nav';
import { ThemeToggle } from './theme-toggle';
import { Breadcrumbs } from './breadcrumbs';

export function Header() {

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-background px-6">
      <MobileNav />

      <div className="flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2">
        <ThemeToggle />
        <UserNav />
      </div>
    </header>
  );
}

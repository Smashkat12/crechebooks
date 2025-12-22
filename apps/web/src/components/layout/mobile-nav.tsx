'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { Menu } from 'lucide-react';
import { useState } from 'react';
import {
  mainNavLinks,
  managementNavLinks,
  complianceNavLinks,
  settingsNavLink,
  type NavLink,
} from './nav-links';

interface MobileNavLinkProps {
  link: NavLink;
  isActive: boolean;
  onClick: () => void;
}

function MobileNavLink({ link, isActive, onClick }: MobileNavLinkProps) {
  const Icon = link.icon;

  return (
    <Link href={link.href} onClick={onClick}>
      <Button
        variant={isActive ? 'secondary' : 'ghost'}
        className={cn(
          'w-full justify-start',
          isActive && 'bg-secondary font-semibold'
        )}
      >
        <Icon className="h-4 w-4 mr-2" />
        <span>{link.title}</span>
        {link.badge !== undefined && (
          <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
            {link.badge}
          </span>
        )}
      </Button>
    </Link>
  );
}

interface MobileNavSectionProps {
  title: string;
  links: NavLink[];
  pathname: string;
  onLinkClick: () => void;
}

function MobileNavSection({ title, links, pathname, onLinkClick }: MobileNavSectionProps) {
  return (
    <div className="space-y-1">
      <h3 className="mb-2 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
        {title}
      </h3>
      {links.map((link) => (
        <MobileNavLink
          key={link.href}
          link={link}
          isActive={pathname === link.href || pathname.startsWith(`${link.href}/`)}
          onClick={onLinkClick}
        />
      ))}
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const handleLinkClick = () => {
    setOpen(false);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Toggle navigation menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle>
            <Link href="/dashboard" className="flex items-center space-x-2" onClick={handleLinkClick}>
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold">
                C
              </div>
              <span className="text-lg font-bold">CrecheBooks</span>
            </Link>
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 p-2">
          <MobileNavSection
            title="Main"
            links={mainNavLinks}
            pathname={pathname}
            onLinkClick={handleLinkClick}
          />
          <Separator />
          <MobileNavSection
            title="Management"
            links={managementNavLinks}
            pathname={pathname}
            onLinkClick={handleLinkClick}
          />
          <Separator />
          <MobileNavSection
            title="Compliance"
            links={complianceNavLinks}
            pathname={pathname}
            onLinkClick={handleLinkClick}
          />
          <Separator />
          <div className="pt-2">
            <MobileNavLink
              link={settingsNavLink}
              isActive={pathname.startsWith('/settings')}
              onClick={handleLinkClick}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

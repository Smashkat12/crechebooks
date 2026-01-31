'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { User, Building2, Link as LinkIcon, DollarSign, MessageSquare, Key } from 'lucide-react';

const settingsNav = [
  { href: '/settings', label: 'Profile', icon: User, exact: true },
  { href: '/settings/organization', label: 'Organization', icon: Building2 },
  { href: '/settings/integrations', label: 'Integrations', icon: LinkIcon },
  { href: '/settings/fees', label: 'Fee Structures', icon: DollarSign },
  { href: '/settings/templates', label: 'Templates', icon: MessageSquare },
  { href: '/settings/api-keys', label: 'API Keys', icon: Key },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your account and organization settings
        </p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        <nav className="flex md:flex-col gap-2 md:w-48 shrink-0">
          {settingsNav.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={isActive ? 'secondary' : 'ghost'}
                  className={cn('w-full justify-start', isActive && 'bg-muted')}
                >
                  <item.icon className="h-4 w-4 mr-2" />
                  {item.label}
                </Button>
              </Link>
            );
          })}
        </nav>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}

'use client';

import * as React from 'react';
import Link from 'next/link';
import { Menu } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet';

const navLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
  { href: '/login', label: 'Login' },
];

export function PublicHeader() {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <nav
        className="container mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8"
        aria-label="Main navigation"
      >
        {/* Logo / Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-primary"
          aria-label="CrecheBooks - Home"
        >
          <svg
            className="h-8 w-8"
            viewBox="0 0 32 32"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="2"
              y="4"
              width="28"
              height="24"
              rx="3"
              className="fill-primary"
            />
            <path
              d="M8 10h16M8 16h12M8 22h8"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
          <span>CrecheBooks</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex md:items-center md:gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                'text-sm font-medium transition-colors hover:text-primary',
                link.label === 'Login'
                  ? 'text-muted-foreground'
                  : 'text-foreground'
              )}
            >
              {link.label}
            </Link>
          ))}
          <Button asChild>
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        {/* Mobile Navigation */}
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] sm:w-[350px]">
            <SheetHeader>
              <SheetTitle className="text-left">Menu</SheetTitle>
            </SheetHeader>
            <nav
              className="mt-8 flex flex-col gap-4"
              aria-label="Mobile navigation"
            >
              {navLinks.map((link) => (
                <SheetClose asChild key={link.href}>
                  <Link
                    href={link.href}
                    className="block rounded-lg px-4 py-3 text-lg font-medium transition-colors hover:bg-accent"
                  >
                    {link.label}
                  </Link>
                </SheetClose>
              ))}
              <SheetClose asChild>
                <Button asChild className="mt-4 w-full" size="lg">
                  <Link href="/signup">Get Started</Link>
                </Button>
              </SheetClose>
            </nav>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}

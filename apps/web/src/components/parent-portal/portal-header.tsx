'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Menu, X, User, LogOut, HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';

interface ParentUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function PortalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<ParentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if we're on auth pages (login/verify)
  const isAuthPage = pathname === '/parent/login' || pathname === '/parent/verify';

  useEffect(() => {
    const fetchUser = async () => {
      const token = localStorage.getItem('parent_session_token');
      if (!token) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/api/v1/auth/parent/me`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data);
        } else {
          localStorage.removeItem('parent_session_token');
        }
      } catch {
        // Ignore errors, user will be null
      } finally {
        setIsLoading(false);
      }
    };

    if (!isAuthPage) {
      fetchUser();
    } else {
      setIsLoading(false);
    }
  }, [isAuthPage]);

  const handleLogout = async () => {
    try {
      const token = localStorage.getItem('parent_session_token');
      if (token) {
        await fetch(`${API_URL}/api/v1/auth/parent/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // Continue with logout even if API call fails
    } finally {
      localStorage.removeItem('parent_session_token');
      router.push('/parent/login');
    }
  };

  const initials = user
    ? `${user.firstName[0]}${user.lastName[0]}`.toUpperCase()
    : 'PP';

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link
            href={user ? '/parent/dashboard' : '/parent/login'}
            className="flex items-center gap-2"
          >
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-lg">C</span>
            </div>
            <span className="font-semibold text-lg hidden sm:inline">
              CrecheBooks
            </span>
            <span className="text-muted-foreground text-sm hidden sm:inline">
              Parent Portal
            </span>
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {!isAuthPage && (
              <>
                {/* Help button (desktop) */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden md:flex"
                  asChild
                >
                  <Link href="/parent/help">
                    <HelpCircle className="h-5 w-5" />
                    <span className="sr-only">Help</span>
                  </Link>
                </Button>

                {/* User menu */}
                {!isLoading && user && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="relative h-10 w-10 rounded-full"
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56" align="end" forceMount>
                      <DropdownMenuLabel className="font-normal">
                        <div className="flex flex-col space-y-1">
                          <p className="text-sm font-medium leading-none">
                            {user.firstName} {user.lastName}
                          </p>
                          <p className="text-xs leading-none text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => router.push('/parent/profile')}>
                        <User className="mr-2 h-4 w-4" />
                        <span>Profile</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => router.push('/parent/help')}>
                        <HelpCircle className="mr-2 h-4 w-4" />
                        <span>Help & Support</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleLogout}>
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Log out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Mobile menu */}
                <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                  <SheetTrigger asChild className="md:hidden">
                    <Button variant="ghost" size="icon">
                      {isMobileMenuOpen ? (
                        <X className="h-5 w-5" />
                      ) : (
                        <Menu className="h-5 w-5" />
                      )}
                      <span className="sr-only">Toggle menu</span>
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[300px] sm:w-[400px]">
                    <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
                    <nav className="flex flex-col gap-4 mt-8">
                      {user && (
                        <>
                          <div className="flex items-center gap-3 pb-4 border-b">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">
                                {user.firstName} {user.lastName}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {user.email}
                              </p>
                            </div>
                          </div>
                          <Link
                            href="/parent/profile"
                            className="flex items-center gap-2 py-2 hover:text-primary"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            <User className="h-5 w-5" />
                            Profile
                          </Link>
                        </>
                      )}
                      <Link
                        href="/parent/help"
                        className="flex items-center gap-2 py-2 hover:text-primary"
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        <HelpCircle className="h-5 w-5" />
                        Help & Support
                      </Link>
                      {user && (
                        <Button
                          variant="outline"
                          className="mt-4 justify-start"
                          onClick={handleLogout}
                        >
                          <LogOut className="mr-2 h-4 w-4" />
                          Log out
                        </Button>
                      )}
                    </nav>
                  </SheetContent>
                </Sheet>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

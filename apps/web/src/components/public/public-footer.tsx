import Link from 'next/link';

const quickLinks = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/contact', label: 'Contact' },
];

const legalLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
];

export function PublicFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t bg-muted/40">
      <div className="container mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          {/* Brand Section */}
          <div className="md:col-span-2">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-xl text-primary"
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
            <p className="mt-4 max-w-md text-sm text-muted-foreground">
              AI-powered bookkeeping designed specifically for South African
              creches and pre-schools. Simplify invoicing, payments, and SARS
              compliance.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-foreground">Quick Links</h3>
            <nav className="mt-4" aria-label="Quick links">
              <ul className="space-y-3">
                {quickLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>

          {/* Legal Links */}
          <div>
            <h3 className="font-semibold text-foreground">Legal</h3>
            <nav className="mt-4" aria-label="Legal links">
              <ul className="space-y-3">
                {legalLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-8 border-t pt-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              <p>
                Contact:{' '}
                <a
                  href="mailto:support@crechebooks.co.za"
                  className="hover:text-primary"
                >
                  support@crechebooks.co.za
                </a>
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              &copy; {currentYear} CrecheBooks. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

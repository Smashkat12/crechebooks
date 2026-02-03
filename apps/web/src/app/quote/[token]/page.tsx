/**
 * TASK-QUOTE-002: Public Quote View Page
 * Displays quote details for recipients to view, accept, or decline
 *
 * NO AUTHENTICATION REQUIRED - Access controlled by viewToken (UUID)
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Phone,
  Mail,
  Building2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';

interface PublicQuoteResponse {
  quoteNumber: string;
  recipientName: string;
  childName: string | null;
  expectedStartDate: string | null;
  quoteDate: string;
  expiryDate: string;
  validityDays: number;
  subtotalCents: number;
  vatAmountCents: number;
  totalCents: number;
  status: string;
  isExpired: boolean;
  canAccept: boolean;
  canDecline: boolean;
  lines: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    lineTotalCents: number;
  }>;
  tenant: {
    name: string;
    phone: string | null;
    email: string;
  };
}

export const metadata: Metadata = {
  title: 'View Quote - CrecheBooks',
  description: 'View and respond to your quote from your creche.',
  robots: 'noindex, nofollow', // Public quotes should not be indexed
};

/**
 * Format cents to ZAR currency string
 */
function formatCurrency(cents: number): string {
  return `R ${(cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Format date for display
 */
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-ZA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get status badge variant and label
 */
function getStatusBadge(status: string, isExpired: boolean) {
  if (isExpired && ['SENT', 'VIEWED'].includes(status)) {
    return { variant: 'destructive' as const, label: 'Expired' };
  }

  switch (status) {
    case 'DRAFT':
      return { variant: 'secondary' as const, label: 'Draft' };
    case 'SENT':
      return { variant: 'default' as const, label: 'Sent' };
    case 'VIEWED':
      return { variant: 'default' as const, label: 'Viewed' };
    case 'ACCEPTED':
      return { variant: 'default' as const, label: 'Accepted' };
    case 'DECLINED':
      return { variant: 'destructive' as const, label: 'Declined' };
    case 'EXPIRED':
      return { variant: 'destructive' as const, label: 'Expired' };
    case 'CONVERTED':
      return { variant: 'default' as const, label: 'Converted' };
    default:
      return { variant: 'secondary' as const, label: status };
  }
}

/**
 * Fetch quote data from API
 */
async function getQuote(token: string): Promise<PublicQuoteResponse | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

  try {
    const response = await fetch(`${apiUrl}/api/public/quotes/${token}`, {
      cache: 'no-store', // Always fetch fresh data
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch quote: ${response.status}`);
    }

    return response.json();
  } catch (error) {
    console.error('Error fetching quote:', error);
    throw error;
  }
}

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicQuotePage({ params }: PageProps) {
  const { token } = await params;

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(token)) {
    notFound();
  }

  const quote = await getQuote(token);

  if (!quote) {
    notFound();
  }

  const statusBadge = getStatusBadge(quote.status, quote.isExpired);
  const daysUntilExpiry = Math.ceil(
    (new Date(quote.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="min-h-screen bg-muted/40">
      {/* Header */}
      <header className="border-b bg-background">
        <div className="container mx-auto px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-6 w-6 text-primary" />
              <span className="text-xl font-bold">Quote {quote.quoteNumber}</span>
            </div>
            <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl space-y-6">
          {/* Status Alerts */}
          {quote.isExpired && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Quote Expired</AlertTitle>
              <AlertDescription>
                This quote expired on {formatDate(quote.expiryDate)}. Please contact{' '}
                {quote.tenant.name} for a new quote.
              </AlertDescription>
            </Alert>
          )}

          {quote.status === 'ACCEPTED' && (
            <Alert>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertTitle>Quote Accepted</AlertTitle>
              <AlertDescription>
                This quote has been accepted. {quote.tenant.name} will contact you to
                complete the enrollment process.
              </AlertDescription>
            </Alert>
          )}

          {quote.status === 'DECLINED' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertTitle>Quote Declined</AlertTitle>
              <AlertDescription>
                This quote has been declined. If you&apos;ve changed your mind, please
                contact {quote.tenant.name}.
              </AlertDescription>
            </Alert>
          )}

          {!quote.isExpired && daysUntilExpiry <= 7 && daysUntilExpiry > 0 && quote.canAccept && (
            <Alert>
              <Clock className="h-4 w-4 text-amber-600" />
              <AlertTitle>Quote Expires Soon</AlertTitle>
              <AlertDescription>
                This quote will expire in {daysUntilExpiry} day{daysUntilExpiry !== 1 ? 's' : ''}.
                Please respond before {formatDate(quote.expiryDate)}.
              </AlertDescription>
            </Alert>
          )}

          {/* Quote Details Card */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
              <CardDescription>
                Quote from {quote.tenant.name}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Recipient & Child Info */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">To</p>
                  <p className="text-lg font-semibold">{quote.recipientName}</p>
                </div>
                {quote.childName && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Child</p>
                    <p className="text-lg">{quote.childName}</p>
                  </div>
                )}
              </div>

              {/* Dates */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Quote Date</p>
                    <p>{formatDate(quote.quoteDate)}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Valid Until</p>
                    <p>{formatDate(quote.expiryDate)}</p>
                  </div>
                </div>
                {quote.expectedStartDate && (
                  <div className="flex items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Expected Start</p>
                      <p>{formatDate(quote.expectedStartDate)}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Line Items */}
              <div>
                <h3 className="mb-4 text-lg font-semibold">Items</h3>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quote.lines.map((line, index) => (
                        <TableRow key={index}>
                          <TableCell>{line.description}</TableCell>
                          <TableCell className="text-right">{line.quantity}</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(line.unitPriceCents)}
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(line.lineTotalCents)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3}>Subtotal</TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(quote.subtotalCents)}
                        </TableCell>
                      </TableRow>
                      {quote.vatAmountCents > 0 && (
                        <TableRow>
                          <TableCell colSpan={3}>VAT (15%)</TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(quote.vatAmountCents)}
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className="bg-muted/50">
                        <TableCell colSpan={3} className="font-bold">
                          Total
                        </TableCell>
                        <TableCell className="text-right text-lg font-bold">
                          {formatCurrency(quote.totalCents)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              </div>
            </CardContent>

            {/* Action Buttons */}
            {(quote.canAccept || quote.canDecline) && (
              <CardFooter className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:justify-end">
                {quote.canDecline && (
                  <Button variant="outline" asChild className="w-full sm:w-auto">
                    <Link href={`/quote/${token}/decline`}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Decline Quote
                    </Link>
                  </Button>
                )}
                {quote.canAccept && (
                  <Button asChild className="w-full sm:w-auto">
                    <Link href={`/quote/${token}/accept`}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Accept Quote
                    </Link>
                  </Button>
                )}
              </CardFooter>
            )}
          </Card>

          {/* Contact Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
                <div>
                  <p className="font-semibold">{quote.tenant.name}</p>
                </div>
                {quote.tenant.phone && (
                  <a
                    href={`tel:${quote.tenant.phone}`}
                    className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                  >
                    <Phone className="h-4 w-4" />
                    {quote.tenant.phone}
                  </a>
                )}
                <a
                  href={`mailto:${quote.tenant.email}`}
                  className="flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail className="h-4 w-4" />
                  {quote.tenant.email}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t bg-background py-6">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground sm:px-6 lg:px-8">
          <p>
            Powered by{' '}
            <a
              href="https://crechebooks.co.za"
              className="font-medium text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              CrecheBooks
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

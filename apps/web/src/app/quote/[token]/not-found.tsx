/**
 * TASK-QUOTE-002: Quote Not Found Page
 * Displayed when quote token is invalid or expired
 */

import Link from 'next/link';
import { FileQuestion, ArrowLeft, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function QuoteNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <FileQuestion className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">Quote Not Found</CardTitle>
          <CardDescription>
            The quote you&apos;re looking for could not be found.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This could mean:
          </p>
          <ul className="list-inside list-disc space-y-2 text-left text-sm text-muted-foreground">
            <li>The link has expired or is invalid</li>
            <li>The quote has been withdrawn</li>
            <li>There was a typo in the link</li>
          </ul>
          <p className="text-sm text-muted-foreground">
            Please contact the creche directly if you need assistance.
          </p>
        </CardContent>
        <CardFooter className="flex-col gap-4">
          <Button asChild variant="outline" className="w-full">
            <Link href="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Go to Homepage
            </Link>
          </Button>
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <a href="mailto:support@crechebooks.co.za" className="flex items-center justify-center gap-2 hover:text-foreground">
              <Mail className="h-4 w-4" />
              support@crechebooks.co.za
            </a>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}

'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XCircle, Link2 } from 'lucide-react';

export default function IntegrationsSettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <Link2 className="h-8 w-8" />
          Integrations
        </h1>
        <p className="text-muted-foreground">
          Connect external services and third-party applications
        </p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Xero
                <Badge variant="secondary">
                  <XCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              </CardTitle>
              <CardDescription>
                Sync invoices and payments with Xero accounting
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button>Connect to Xero</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            WhatsApp Business
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>
            Send payment reminders via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Configure WhatsApp</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Email (SMTP)
            <Badge variant="secondary">Coming Soon</Badge>
          </CardTitle>
          <CardDescription>
            Configure custom email sending
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled>Configure Email</Button>
        </CardContent>
      </Card>
    </div>
  );
}

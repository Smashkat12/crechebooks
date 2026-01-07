'use client';

/**
 * SimplePay Integration Settings Page
 * TASK-STAFF-004: Configure SimplePay connection
 *
 * Settings page for managing SimplePay payroll integration.
 */

import Link from 'next/link';
import { ArrowLeft, DollarSign, FileText, Calculator, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SimplepayConnectionForm } from '@/components/integrations/SimplepayConnectionForm';
import { SimplepaySyncStatus } from '@/components/integrations/SimplepaySyncStatus';
import { useSimplePayStatus } from '@/hooks/use-simplepay';

export default function SimplepaySettingsPage() {
  const { status } = useSimplePayStatus();

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/settings/integrations">
            <ArrowLeft className="w-5 h-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">SimplePay Integration</h1>
          <p className="text-muted-foreground">
            Connect to SimplePay for payroll processing, IRP5 certificates, and EMP201 submissions.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div className="grid gap-6 md:grid-cols-2">
        <SimplepayConnectionForm />
        {status?.isConnected && <SimplepaySyncStatus />}
      </div>

      {/* Features section - only when connected */}
      {status?.isConnected && (
        <Card>
          <CardHeader>
            <CardTitle>Integration Features</CardTitle>
            <CardDescription>
              What you can do with the SimplePay integration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900">
                  <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h4 className="font-medium">Employee Sync</h4>
                  <p className="text-sm text-muted-foreground">
                    Sync employee data from CrecheBooks to SimplePay automatically
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <div className="p-2 rounded-lg bg-green-100 dark:bg-green-900">
                  <DollarSign className="w-5 h-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <h4 className="font-medium">Payslip Import</h4>
                  <p className="text-sm text-muted-foreground">
                    Import payslip data from SimplePay for record keeping
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <div className="p-2 rounded-lg bg-purple-100 dark:bg-purple-900">
                  <FileText className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h4 className="font-medium">IRP5 Certificates</h4>
                  <p className="text-sm text-muted-foreground">
                    Download IRP5 tax certificates directly from SimplePay
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 rounded-lg border">
                <div className="p-2 rounded-lg bg-orange-100 dark:bg-orange-900">
                  <Calculator className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h4 className="font-medium">EMP201 Data</h4>
                  <p className="text-sm text-muted-foreground">
                    Fetch EMP201 submission data for SARS compliance
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 p-4 rounded-lg bg-muted">
              <h4 className="font-medium mb-2">Note about payroll processing</h4>
              <p className="text-sm text-muted-foreground">
                Payroll runs and salary calculations are done directly in SimplePay.
                This integration syncs employee data and imports payroll results
                into CrecheBooks for reporting and compliance purposes.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help section */}
      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-2">Finding your API credentials</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Log in to your SimplePay account</li>
                <li>Go to Settings &rarr; API Access</li>
                <li>Copy your Client ID and API Key</li>
                <li>Paste them in the connection form above</li>
              </ol>
            </div>
            <div>
              <h4 className="font-medium mb-2">Troubleshooting</h4>
              <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                <li>Ensure your SimplePay subscription includes API access</li>
                <li>Check that your API key has the required permissions</li>
                <li>Verify your network allows connections to SimplePay</li>
              </ul>
            </div>
          </div>

          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground">
              For more information, visit the{' '}
              <a
                href="https://www.simplepay.co.za/help"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                SimplePay Help Center
              </a>
              {' '}or contact our support team.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

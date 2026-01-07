'use client';

/**
 * Xero Payroll Integration Settings
 * TASK-STAFF-003: Configure Xero account mappings and manage payroll journals
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccountMappingsTable } from '@/components/xero/AccountMappingsTable';
import { PayrollJournalsTable } from '@/components/xero/PayrollJournalsTable';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function XeroPayrollSettingsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Xero Payroll Integration</h1>
        <p className="text-muted-foreground">
          Configure account mappings and manage payroll journal entries for Xero.
        </p>
      </div>

      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Prerequisites</AlertTitle>
        <AlertDescription>
          Ensure your Xero account is connected and you have the necessary
          permissions to post manual journals. Account mappings must be
          configured before generating payroll journals.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="mappings" className="space-y-4">
        <TabsList>
          <TabsTrigger value="mappings">Account Mappings</TabsTrigger>
          <TabsTrigger value="journals">Payroll Journals</TabsTrigger>
        </TabsList>

        <TabsContent value="mappings">
          <Card>
            <CardHeader>
              <CardTitle>Account Mappings</CardTitle>
              <CardDescription>
                Map payroll components to your Xero chart of accounts. Each
                payroll component (e.g., gross salary, PAYE, UIF) needs a
                corresponding Xero account code for journal posting.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AccountMappingsTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="journals">
          <Card>
            <CardHeader>
              <CardTitle>Payroll Journals</CardTitle>
              <CardDescription>
                Generate payroll journals from processed payroll data and post
                them to Xero. Journals can be previewed before posting and their
                status tracked after submission.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PayrollJournalsTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

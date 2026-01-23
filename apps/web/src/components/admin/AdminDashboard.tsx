'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContactSubmissionsList } from './ContactSubmissionsList';
import { DemoRequestsList } from './DemoRequestsList';
import { useContactSubmissions, useDemoRequests } from '@/hooks/useAdminSubmissions';
import { Mail, Calendar, MessageSquare } from 'lucide-react';

export function AdminDashboard() {
  const { data: contactData } = useContactSubmissions();
  const { data: demoData } = useDemoRequests();

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Contact Submissions</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contactData?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {contactData?.pending || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Demo Requests</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{demoData?.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              {demoData?.pending || 0} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inquiries</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(contactData?.total || 0) + (demoData?.total || 0)}
            </div>
            <p className="text-xs text-muted-foreground">
              {(contactData?.pending || 0) + (demoData?.pending || 0)} pending
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="contacts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="contacts">
            Contact Submissions
            {contactData?.pending && contactData.pending > 0 ? (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {contactData.pending}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="demos">
            Demo Requests
            {demoData?.pending && demoData.pending > 0 ? (
              <span className="ml-2 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {demoData.pending}
              </span>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="space-y-4">
          <ContactSubmissionsList />
        </TabsContent>

        <TabsContent value="demos" className="space-y-4">
          <DemoRequestsList />
        </TabsContent>
      </Tabs>
    </div>
  );
}

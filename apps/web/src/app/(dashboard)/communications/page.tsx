'use client';

/**
 * Communications Dashboard Page
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Mail, MessageSquare, Send, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BroadcastList } from '@/components/communications/broadcast-list';
import { useCommunications } from '@/hooks/use-communications';

function QuickStatCard({
  title,
  value,
  description,
  icon,
  trend,
}: {
  title: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  trend?: { value: number; positive: boolean };
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="h-4 w-4 text-muted-foreground">{icon}</div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
        {trend && (
          <p className={`text-xs mt-1 ${trend.positive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.positive ? '+' : ''}{trend.value}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function CommunicationsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('all');
  const { broadcasts, isLoading, meta } = useCommunications();

  // Calculate stats from broadcasts
  const sentThisMonth = broadcasts.filter(
    (b) => b.status === 'sent' &&
    new Date(b.created_at).getMonth() === new Date().getMonth()
  ).length;

  const pendingCount = broadcasts.filter(
    (b) => b.status === 'scheduled' || b.status === 'draft'
  ).length;

  const failedCount = broadcasts.filter((b) => b.status === 'failed').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Communications</h1>
          <p className="text-muted-foreground">
            Send announcements and messages to parents and staff
          </p>
        </div>
        <Button onClick={() => router.push('/communications/new')}>
          <Plus className="mr-2 h-4 w-4" />
          New Message
        </Button>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <QuickStatCard
          title="Messages Sent"
          value={sentThisMonth}
          description="This month"
          icon={<Send className="h-4 w-4" />}
        />
        <QuickStatCard
          title="Email Delivery"
          value="94%"
          description="Average rate"
          icon={<Mail className="h-4 w-4" />}
        />
        <QuickStatCard
          title="WhatsApp Delivery"
          value="98%"
          description="Average rate"
          icon={<MessageSquare className="h-4 w-4" />}
        />
        <QuickStatCard
          title="Pending"
          value={pendingCount}
          description="Scheduled messages"
          icon={<Clock className="h-4 w-4" />}
        />
      </div>

      {/* Failed messages alert */}
      {failedCount > 0 && (
        <Card className="border-destructive">
          <CardContent className="flex items-center gap-4 py-4">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <div className="flex-1">
              <p className="font-medium text-destructive">
                {failedCount} message{failedCount > 1 ? 's' : ''} failed to send
              </p>
              <p className="text-sm text-muted-foreground">
                Review failed messages and retry sending
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setActiveTab('failed')}
            >
              View Failed
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Broadcast List */}
      <Card>
        <CardHeader>
          <CardTitle>Message History</CardTitle>
          <CardDescription>
            View and manage your broadcast messages
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="sent">Sent</TabsTrigger>
              <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
              <TabsTrigger value="draft">Drafts</TabsTrigger>
              {failedCount > 0 && (
                <TabsTrigger value="failed" className="text-destructive">
                  Failed ({failedCount})
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value={activeTab} className="mt-4">
              <BroadcastList
                status={activeTab === 'all' ? undefined : activeTab}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

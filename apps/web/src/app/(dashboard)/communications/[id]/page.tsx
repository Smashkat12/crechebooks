'use client';

/**
 * Broadcast Detail Page
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Send, XCircle, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { DeliveryStatsChart } from '@/components/communications/delivery-stats-chart';
import { useBroadcast } from '@/hooks/use-communications';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    draft: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    scheduled: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    sending: { variant: 'default', icon: <Send className="h-3 w-3" /> },
    sent: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
    cancelled: { variant: 'secondary', icon: <XCircle className="h-3 w-3" /> },
    failed: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  };

  const { variant, icon } = variants[status] || { variant: 'secondary', icon: null };

  return (
    <Badge variant={variant} className="capitalize gap-1">
      {icon}
      {status}
    </Badge>
  );
}


function BroadcastDetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

export default function BroadcastDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { broadcast, isLoading, send, cancel, isSending, isCancelling } = useBroadcast(id);
  const { toast } = useToast();

  const handleSend = async () => {
    try {
      await send();
      toast({ title: 'Message sent successfully' });
    } catch {
      toast({ title: 'Failed to send message', variant: 'destructive' });
    }
  };

  const handleCancel = async () => {
    try {
      await cancel();
      toast({ title: 'Message cancelled' });
    } catch {
      toast({ title: 'Failed to cancel message', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <BroadcastDetailSkeleton />
      </div>
    );
  }

  if (!broadcast) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-lg font-semibold">Broadcast not found</h2>
            <p className="text-muted-foreground mb-4">
              The broadcast message you&apos;re looking for doesn&apos;t exist.
            </p>
            <Button onClick={() => router.push('/communications')}>
              Back to Communications
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const canSend = broadcast.status === 'draft' || broadcast.status === 'scheduled';
  const canCancel = broadcast.status === 'draft' || broadcast.status === 'scheduled';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/communications')}
            className="mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Communications
          </Button>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {broadcast.subject || 'Untitled Message'}
            </h1>
            <StatusBadge status={broadcast.status} />
          </div>
          <p className="text-muted-foreground">
            Created {formatDistanceToNow(new Date(broadcast.created_at), { addSuffix: true })}
          </p>
        </div>
        <div className="space-x-2">
          {canCancel && (
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCancelling}
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
          )}
          {canSend && (
            <Button onClick={handleSend} disabled={isSending}>
              <Send className="mr-2 h-4 w-4" />
              Send Now
            </Button>
          )}
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Recipients
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{broadcast.total_recipients}</p>
            <p className="text-sm text-muted-foreground capitalize">
              {broadcast.recipient_type}s
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Channel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold capitalize">{broadcast.channel}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Delivery
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {broadcast.sent_count}/{broadcast.total_recipients}
            </p>
            <p className="text-sm text-muted-foreground">
              {broadcast.failed_count > 0 && (
                <span className="text-destructive">{broadcast.failed_count} failed</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Delivery Stats */}
      {broadcast.delivery_stats && (
        <DeliveryStatsChart
          stats={{ ...broadcast.delivery_stats, total: broadcast.total_recipients }}
          channel={broadcast.channel as 'email' | 'whatsapp' | 'sms' | 'all'}
        />
      )}

      {/* Message Content */}
      <Card>
        <CardHeader>
          <CardTitle>Message Content</CardTitle>
          {broadcast.sent_at && (
            <CardDescription>
              Sent on {format(new Date(broadcast.sent_at), 'PPpp')}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="whitespace-pre-wrap rounded-md bg-muted p-4">
            {broadcast.body}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

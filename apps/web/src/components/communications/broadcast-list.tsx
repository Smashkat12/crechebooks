'use client';

/**
 * Broadcast List Component
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { useRouter } from 'next/navigation';
import { formatDistanceToNow } from 'date-fns';
import { Mail, MessageSquare, Phone, Users, Clock, CheckCircle, XCircle, AlertCircle, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCommunications, BroadcastMessage } from '@/hooks/use-communications';

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
    draft: { variant: 'secondary', icon: <Clock className="h-3 w-3" /> },
    scheduled: { variant: 'outline', icon: <Clock className="h-3 w-3" /> },
    sending: { variant: 'default', icon: <Send className="h-3 w-3" /> },
    sent: { variant: 'default', icon: <CheckCircle className="h-3 w-3" /> },
    cancelled: { variant: 'secondary', icon: <XCircle className="h-3 w-3" /> },
    failed: { variant: 'destructive', icon: <AlertCircle className="h-3 w-3" /> },
  };

  const { variant, icon } = config[status] || { variant: 'secondary', icon: null };

  return (
    <Badge variant={variant} className="capitalize gap-1">
      {icon}
      {status}
    </Badge>
  );
}

function ChannelIcon({ channel }: { channel: string }) {
  switch (channel) {
    case 'email':
      return <Mail className="h-4 w-4 text-blue-500" />;
    case 'whatsapp':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'sms':
      return <Phone className="h-4 w-4 text-purple-500" />;
    case 'all':
      return <Users className="h-4 w-4 text-orange-500" />;
    default:
      return <Mail className="h-4 w-4" />;
  }
}

function BroadcastListSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center space-x-4">
          <Skeleton className="h-12 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ status }: { status?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Mail className="h-12 w-12 text-muted-foreground mb-4" />
      <h3 className="text-lg font-semibold">No messages found</h3>
      <p className="text-muted-foreground">
        {status
          ? `You don't have any ${status} messages yet.`
          : "You haven't sent any messages yet."}
      </p>
    </div>
  );
}

interface BroadcastListProps {
  status?: string;
}

export function BroadcastList({ status }: BroadcastListProps) {
  const router = useRouter();
  const { broadcasts, isLoading } = useCommunications(
    status ? { status } : undefined
  );

  if (isLoading) {
    return <BroadcastListSkeleton />;
  }

  const filteredBroadcasts = status
    ? broadcasts.filter((b) => b.status === status)
    : broadcasts;

  if (filteredBroadcasts.length === 0) {
    return <EmptyState status={status} />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Recipients</TableHead>
          <TableHead>Channel</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Delivery</TableHead>
          <TableHead>Created</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filteredBroadcasts.map((broadcast) => (
          <TableRow
            key={broadcast.id}
            className="cursor-pointer"
            onClick={() => router.push(`/communications/${broadcast.id}`)}
          >
            <TableCell className="font-medium">
              {broadcast.subject || (
                <span className="text-muted-foreground italic">No subject</span>
              )}
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>{broadcast.total_recipients}</span>
                <span className="text-muted-foreground capitalize text-xs">
                  {broadcast.recipient_type}s
                </span>
              </div>
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <ChannelIcon channel={broadcast.channel} />
                <span className="capitalize">{broadcast.channel}</span>
              </div>
            </TableCell>
            <TableCell>
              <StatusBadge status={broadcast.status} />
            </TableCell>
            <TableCell>
              {broadcast.status === 'sent' || broadcast.status === 'sending' ? (
                <span>
                  {broadcast.sent_count}/{broadcast.total_recipients}
                  {broadcast.failed_count > 0 && (
                    <span className="text-destructive ml-1">
                      ({broadcast.failed_count} failed)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDistanceToNow(new Date(broadcast.created_at), { addSuffix: true })}
            </TableCell>
            <TableCell>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/communications/${broadcast.id}`);
                }}
              >
                View
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

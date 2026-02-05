'use client';

/**
 * WhatsApp Message History Component
 * TASK-WA-004: WhatsApp Opt-In UI Components
 *
 * Displays WhatsApp message history for a parent with status badges.
 */

import { MessageCircle, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useWhatsAppHistory, type WhatsAppMessage } from '@/hooks/use-whatsapp';
import { formatDistanceToNow } from 'date-fns';

interface WhatsAppMessageHistoryProps {
  parentId: string;
}

/**
 * Status color mappings for message badges
 */
const statusConfig: Record<
  WhatsAppMessage['status'],
  { label: string; className: string }
> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  SENT: {
    label: 'Sent',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
  },
  DELIVERED: {
    label: 'Delivered',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  READ: {
    label: 'Read',
    className: 'bg-green-200 text-green-900 hover:bg-green-200',
  },
  FAILED: {
    label: 'Failed',
    className: 'bg-red-100 text-red-800 hover:bg-red-100',
  },
};

/**
 * Context type labels for display
 */
const contextTypeLabels: Record<WhatsAppMessage['contextType'], string> = {
  INVOICE: 'Invoice',
  REMINDER: 'Reminder',
  STATEMENT: 'Statement',
  WELCOME: 'Welcome',
  ARREARS: 'Arrears Notice',
};

export function WhatsAppMessageHistory({ parentId }: WhatsAppMessageHistoryProps) {
  const { messages, isLoading, isError, refetch } = useWhatsAppHistory(parentId);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="h-4 w-4" />
            Message History
          </CardTitle>
          <CardDescription>Recent WhatsApp messages sent to this parent</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-center py-8 text-destructive gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load message history</span>
          </div>
        ) : messages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No messages sent yet
          </p>
        ) : (
          <div className="space-y-3">
            {messages.map((msg) => (
              <MessageItem key={msg.id} message={msg} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Individual message item component
 */
function MessageItem({ message }: { message: WhatsAppMessage }) {
  const status = statusConfig[message.status];
  const contextLabel = contextTypeLabels[message.contextType];

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="space-y-1">
        <p className="font-medium text-sm">{contextLabel}</p>
        <p className="text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(message.createdAt), { addSuffix: true })}
        </p>
        {message.status === 'FAILED' && message.errorMessage && (
          <p className="text-xs text-destructive">{message.errorMessage}</p>
        )}
      </div>
      <Badge variant="secondary" className={status.className}>
        {status.label}
      </Badge>
    </div>
  );
}

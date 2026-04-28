'use client';

import { useRef, useEffect } from 'react';
import {
  MessageSquare,
  Loader2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { format } from 'date-fns';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useParentMessages } from '@/hooks/parent-portal/use-parent-messages';
import type { ParentMessage } from '@/hooks/parent-portal/use-parent-messages';

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: ParentMessage }) {
  // From parent portal perspective:
  // - inbound = message sent TO parent (creche admin outbound = parent portal inbound)
  // - outbound = message sent FROM parent
  const isFromParent = message.direction === 'outbound';
  const isImage = message.mediaContentType?.startsWith('image/') ?? false;

  return (
    <div
      className={cn(
        'flex flex-col max-w-[75%] gap-1',
        isFromParent ? 'self-end items-end' : 'self-start items-start',
      )}
    >
      {!isFromParent && (
        <span className="text-xs text-muted-foreground px-1">
          School
        </span>
      )}
      <div
        className={cn(
          'rounded-2xl px-3 py-2 text-sm',
          isFromParent
            ? 'bg-primary text-primary-foreground rounded-br-sm'
            : 'bg-muted rounded-bl-sm',
        )}
      >
        {/* Media */}
        {message.mediaUrl && isImage && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-1"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={message.mediaUrl}
              alt="Attachment"
              className="rounded max-w-full max-h-48 object-cover"
            />
          </a>
        )}
        {message.mediaUrl && !isImage && (
          <a
            href={message.mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs underline mb-1"
          >
            <ExternalLink className="h-3 w-3" />
            Open file
          </a>
        )}
        {/* Body */}
        {message.body && <p className="whitespace-pre-wrap">{message.body}</p>}
      </div>
      <span className="text-xs text-muted-foreground px-1">
        {format(new Date(message.createdAt), 'dd MMM HH:mm')}
      </span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ParentMessagesPage() {
  const { data, isLoading, error } = useParentMessages();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const messages = data?.messages ?? [];

  // Scroll to bottom on load
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          Messages
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          WhatsApp messages from your child&apos;s school
        </p>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error.message || 'Failed to load messages. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && messages.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/40" />
            <div>
              <p className="font-medium">No messages yet</p>
              <p className="text-sm text-muted-foreground mt-1">
                Messages from the school will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Conversation */}
      {!isLoading && messages.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Read-only notice */}
      {!isLoading && messages.length > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          To reply, please send a WhatsApp message directly to the school.
        </p>
      )}
    </div>
  );
}

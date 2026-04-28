'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  MessageSquare,
  Search,
  AlertTriangle,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { useAdminThreads } from '@/hooks/admin/use-admin-messages';
import type { AdminMessageThread } from '@/hooks/admin/use-admin-messages';

// ─── Thread row ───────────────────────────────────────────────────────────────

function ThreadRow({
  thread,
  isSelected,
  onClick,
}: {
  thread: AdminMessageThread;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted',
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-sm truncate">{thread.parentName}</span>
        <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
          {formatDistanceToNow(new Date(thread.lastMessageAt), { addSuffix: true })}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground truncate flex-1">
          {thread.lastMessageSnippet}
        </p>
        {thread.unreadCount > 0 && (
          <Badge className="flex-shrink-0 h-5 min-w-[20px] flex items-center justify-center text-xs rounded-full px-1.5 bg-primary text-primary-foreground">
            {thread.unreadCount}
          </Badge>
        )}
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function InboxPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);

  const { data, isLoading, error } = useAdminThreads({ search });

  const threads = data?.threads ?? [];

  function handleSelectThread(parentId: string) {
    setSelectedParentId(parentId);
    router.push(`/communications/inbox/${parentId}`);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="text-muted-foreground">WhatsApp conversations with parents</p>
        </div>
        <Link href="/communications/inbox/unknown">
          <Button variant="outline" size="sm" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Unknown senders
          </Button>
        </Link>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as Error).message || 'Failed to load inbox. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-[calc(100vh-200px)]">
        {/* Left: Thread list */}
        <Card className="md:col-span-1 overflow-hidden flex flex-col">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by parent name..."
                className="pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {/* Thread list */}
          <div className="overflow-y-auto flex-1">
            {isLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && threads.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-12 px-4 text-center">
                <MessageSquare className="h-10 w-10 text-muted-foreground/40" />
                <div>
                  <p className="font-medium text-sm">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Inbound WhatsApp messages from parents will appear here.
                  </p>
                </div>
              </div>
            )}

            {threads.map((thread) => (
              <ThreadRow
                key={thread.parentId}
                thread={thread}
                isSelected={selectedParentId === thread.parentId}
                onClick={() => handleSelectThread(thread.parentId)}
              />
            ))}
          </div>
        </Card>

        {/* Right: Placeholder (detail navigates to [parentId] page on mobile,
            shown inline on larger screens via the [parentId] route) */}
        <Card className="md:col-span-2 hidden md:flex items-center justify-center text-center">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">
              Select a conversation to view messages
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

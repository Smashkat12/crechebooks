'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Link2, Loader2, AlertCircle, Search } from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import {
  useUnknownMessages,
  useLinkParent,
} from '@/hooks/admin/use-admin-messages';
import type { UnknownMessage } from '@/hooks/admin/use-admin-messages';
import { useParentsList } from '@/hooks/use-parents';

// ─── Link parent modal ─────────────────────────────────────────────────────────

function LinkParentModal({
  message,
  open,
  onClose,
}: {
  message: UnknownMessage;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const { data: parentsData, isLoading: parentsLoading } = useParentsList({
    search,
    limit: 20,
  });
  const { mutate: linkParent, isPending } = useLinkParent();

  const parents = parentsData?.parents ?? [];

  function handleLink(parentId: string) {
    linkParent(
      { messageId: message.id, parentId },
      {
        onSuccess: () => {
          toast({ title: 'Sender linked to parent' });
          onClose();
        },
        onError: () => {
          toast({
            title: 'Failed to link',
            description: 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) onClose(); }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Link to parent</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          From: <span className="font-mono font-medium">{message.from}</span>
        </p>
        <p className="text-xs text-muted-foreground border rounded p-2 bg-muted line-clamp-2">
          {message.body}
        </p>

        <div className="space-y-3 mt-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search parent by name..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {parentsLoading && (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {!parentsLoading && parents.length === 0 && search.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-2">
              No parents found for &quot;{search}&quot;
            </p>
          )}

          <div className="space-y-1 max-h-60 overflow-y-auto">
            {parents.map((parent) => (
              <button
                key={parent.id}
                type="button"
                disabled={isPending}
                onClick={() => handleLink(parent.id)}
                className="w-full text-left flex items-center justify-between rounded px-3 py-2 hover:bg-muted/50 transition-colors border"
              >
                <div>
                  <p className="text-sm font-medium">
                    {parent.firstName} {parent.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">{parent.email}</p>
                </div>
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Link2 className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UnknownSendersPage() {
  const { data: messages, isLoading, error } = useUnknownMessages();
  const [linkTarget, setLinkTarget] = useState<UnknownMessage | null>(null);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/communications/inbox">
          <Button variant="ghost" size="sm" className="px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Unknown senders</h1>
          <p className="text-muted-foreground text-sm">
            Inbound messages where the sender could not be matched to a parent
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as Error).message || 'Failed to load unknown messages.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && (!messages || messages.length === 0) && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <Link2 className="h-10 w-10 text-muted-foreground/40" />
            <div>
              <p className="font-medium text-sm">No unknown senders</p>
              <p className="text-xs text-muted-foreground mt-1">
                All inbound messages have been matched to a parent.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!isLoading && messages && messages.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {messages.length} unmatched message{messages.length !== 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>From</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Received</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((msg) => (
                    <TableRow key={msg.id}>
                      <TableCell className="font-mono text-sm">
                        {msg.from}
                      </TableCell>
                      <TableCell className="max-w-[260px] truncate text-sm text-muted-foreground">
                        {msg.body}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {format(new Date(msg.createdAt), 'dd MMM yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1"
                          onClick={() => setLinkTarget(msg)}
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Link to parent
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Link modal */}
      {linkTarget && (
        <LinkParentModal
          message={linkTarget}
          open={!!linkTarget}
          onClose={() => setLinkTarget(null)}
        />
      )}
    </div>
  );
}

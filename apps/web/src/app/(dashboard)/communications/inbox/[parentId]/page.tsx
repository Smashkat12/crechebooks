'use client';

import { useState, useRef, useEffect } from 'react';
import { use } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Send,
  Loader2,
  AlertCircle,
  CheckCheck,
  Check,
  ExternalLink,
  AlertTriangle,
  LayoutTemplate,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  useAdminThread,
  useReplyAdmin,
  useSendTemplate,
  useMarkAllRead,
} from '@/hooks/admin/use-admin-messages';
import type { AdminMessage } from '@/hooks/admin/use-admin-messages';
import { WHATSAPP_TEMPLATES, type WhatsAppTemplate } from '@/lib/utils/whatsapp-templates';
import type { AxiosError } from 'axios';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface TemplateWindowErrorBody {
  requiresTemplate: boolean;
  lastInboundAt: string;
}

// ─── Message bubble ───────────────────────────────────────────────────────────

function MessageBubble({ message }: { message: AdminMessage }) {
  const isOutbound = message.direction === 'outbound';
  const isImage =
    message.mediaContentType?.startsWith('image/') ?? false;

  return (
    <div
      className={cn(
        'flex flex-col max-w-[75%] gap-1',
        isOutbound ? 'self-end items-end' : 'self-start items-start',
      )}
    >
      <div
        className={cn(
          'rounded-2xl px-3 py-2 text-sm',
          isOutbound
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

      {/* Timestamp + status */}
      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground">
          {format(new Date(message.createdAt), 'HH:mm')}
        </span>
        {isOutbound && (
          <span className="text-xs text-muted-foreground">
            {message.status === 'read' ? (
              <CheckCheck className="h-3 w-3 text-blue-500" />
            ) : message.status === 'delivered' ? (
              <CheckCheck className="h-3 w-3" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Template picker modal ────────────────────────────────────────────────────

function TemplatePickerModal({
  open,
  onClose,
  parentId,
}: {
  open: boolean;
  onClose: () => void;
  parentId: string;
}) {
  const { toast } = useToast();
  const [selected, setSelected] = useState<WhatsAppTemplate | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const { mutate: sendTemplate, isPending } = useSendTemplate(parentId);

  function handleSelectTemplate(tpl: WhatsAppTemplate) {
    setSelected(tpl);
    const initial: Record<string, string> = {};
    tpl.variables.forEach((v) => { initial[v] = ''; });
    setParams(initial);
  }

  function handleSend() {
    if (!selected) return;
    const contentParams: Record<string, string> = {};
    selected.variables.forEach((v, i) => {
      contentParams[String(i + 1)] = params[v] ?? '';
    });
    sendTemplate(
      { contentSid: selected.contentSid, templateParams: contentParams },
      {
        onSuccess: () => {
          toast({ title: 'Template sent' });
          setSelected(null);
          setParams({});
          onClose();
        },
        onError: () => {
          toast({
            title: 'Failed to send template',
            description: 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  function handleClose() {
    setSelected(null);
    setParams({});
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Choose approved template</DialogTitle>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            {WHATSAPP_TEMPLATES.map((tpl) => (
              <button
                key={tpl.contentSid}
                type="button"
                onClick={() => handleSelectTemplate(tpl)}
                className="w-full text-left rounded-lg border p-3 hover:bg-muted/50 transition-colors"
              >
                <p className="font-medium text-sm">{tpl.friendlyName}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {tpl.body}
                </p>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg bg-muted p-3 text-sm whitespace-pre-wrap">
              {selected.body}
            </div>
            <div className="space-y-3">
              {selected.variables.map((varName) => (
                <div key={varName}>
                  <Label htmlFor={`tpl-var-${varName}`} className="capitalize text-xs">
                    {varName.replace(/_/g, ' ')}
                  </Label>
                  <Input
                    id={`tpl-var-${varName}`}
                    value={params[varName] ?? ''}
                    onChange={(e) =>
                      setParams((prev) => ({ ...prev, [varName]: e.target.value }))
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setSelected(null); setParams({}); }}
              >
                Back
              </Button>
              <Button
                size="sm"
                disabled={
                  isPending ||
                  selected.variables.some((v) => !(params[v] ?? '').trim())
                }
                onClick={handleSend}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Send template
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Reply box ────────────────────────────────────────────────────────────────

function ReplyBox({
  parentId,
  requiresTemplate,
  lastInboundAt,
}: {
  parentId: string;
  requiresTemplate: boolean;
  lastInboundAt: string | null;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState('');
  const [templateOpen, setTemplateOpen] = useState(false);
  const { mutate: reply, isPending } = useReplyAdmin(parentId);

  function handleSend() {
    if (!body.trim()) return;
    reply(
      { body: body.trim() },
      {
        onSuccess: () => setBody(''),
        onError: (err: AxiosError) => {
          const resData = err.response?.data as TemplateWindowErrorBody | undefined;
          if (resData?.requiresTemplate) {
            toast({
              title: '24h window expired',
              description: 'You must use an approved template to message this parent.',
              variant: 'destructive',
            });
            return;
          }
          toast({
            title: 'Failed to send',
            description: 'Please try again.',
            variant: 'destructive',
          });
        },
      },
    );
  }

  if (requiresTemplate) {
    return (
      <div className="border-t p-4 space-y-3">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            Outside the 24h messaging window
            {lastInboundAt && (
              <>
                {' '}— last inbound message was{' '}
                {formatDistanceToNow(new Date(lastInboundAt), { addSuffix: true })}
              </>
            )}
            . You must use an approved WhatsApp template.
          </AlertDescription>
        </Alert>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setTemplateOpen(true)}
        >
          <LayoutTemplate className="h-4 w-4" />
          Choose template
        </Button>
        <TemplatePickerModal
          open={templateOpen}
          onClose={() => setTemplateOpen(false)}
          parentId={parentId}
        />
      </div>
    );
  }

  return (
    <div className="border-t p-4">
      <div className="flex gap-2">
        <Textarea
          placeholder="Type a message..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          className="resize-none flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        <Button
          size="sm"
          disabled={isPending || !body.trim()}
          onClick={handleSend}
          className="self-end"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mt-1">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ConversationPage({
  params,
}: {
  params: Promise<{ parentId: string }>;
}) {
  const { parentId } = use(params);
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useAdminThread(parentId, { order: 'asc', limit: 100 });
  const { mutate: markAllRead } = useMarkAllRead(parentId);

  const messages = data?.messages ?? [];

  // Derive 24h window state from messages
  const lastInbound = messages.filter((m) => m.direction === 'inbound').at(-1);
  const lastInboundAt = lastInbound?.createdAt ?? null;
  const requiresTemplate = lastInboundAt
    ? Date.now() - new Date(lastInboundAt).getTime() > 24 * 60 * 60 * 1000
    : true;

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Mark all read on mount
  useEffect(() => {
    if (parentId) {
      markAllRead(undefined, {
        onError: () => {
          // Non-critical — ignore silently
        },
      });
    }
    // Run only once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentId]);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b px-4 py-3 flex-shrink-0">
        <Link href="/communications/inbox">
          <Button variant="ghost" size="sm" className="px-2">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold truncate">
            {parentId}
          </p>
        </div>
        <Link href={`/parents?search=${parentId}`}>
          <Button variant="ghost" size="sm" className="gap-1 text-xs">
            <ExternalLink className="h-3 w-3" />
            Parent profile
          </Button>
        </Link>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            markAllRead(undefined, {
              onSuccess: () => toast({ title: 'All messages marked as read' }),
            })
          }
        >
          Mark all read
        </Button>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-4 flex-shrink-0">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {(error as Error).message || 'Failed to load conversation.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!isLoading && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No messages in this conversation yet.</p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Reply box */}
      <div className="flex-shrink-0">
        <ReplyBox
          parentId={parentId}
          requiresTemplate={requiresTemplate}
          lastInboundAt={lastInboundAt}
        />
      </div>
    </div>
  );
}

'use client';

/**
 * Recipient Preview Component
 * TASK-COMM-005: Recipient Selection Component
 */

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useRecipientPreview, RecipientPreview as PreviewData } from '@/hooks/use-communications';
import { Users, Mail, MessageSquare, RefreshCw } from 'lucide-react';

interface RecipientPreviewProps {
  recipientType: string;
  filter?: Record<string, unknown>;
  channel: string;
}

export function RecipientPreview({ recipientType, filter, channel }: RecipientPreviewProps) {
  const { previewRecipients, isPreviewing } = useRecipientPreview();
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = useCallback(async () => {
    try {
      setError(null);
      const result = await previewRecipients({
        recipient_type: recipientType,
        filter,
        channel,
      });
      setPreview(result);
    } catch (err) {
      setError('Failed to load preview');
      console.error('Failed to preview recipients', err);
    }
  }, [recipientType, filter, channel, previewRecipients]);

  useEffect(() => {
    loadPreview();
  }, [loadPreview]);

  if (isPreviewing) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-4">
          <span className="text-muted-foreground">{error}</span>
          <Button variant="ghost" size="sm" onClick={loadPreview}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!preview) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">Recipient Preview</CardTitle>
        <Badge variant="secondary">
          <Users className="mr-1 h-3 w-3" />
          {preview.total} recipient{preview.total !== 1 ? 's' : ''}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {preview.recipients.slice(0, 5).map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-md border px-3 py-2"
            >
              <span className="font-medium">{r.name}</span>
              <div className="flex items-center gap-2">
                {r.email && (channel === 'email' || channel === 'all') && (
                  <Badge variant="outline" className="text-xs">
                    <Mail className="mr-1 h-3 w-3" />
                    {r.email}
                  </Badge>
                )}
                {r.phone && (channel === 'whatsapp' || channel === 'sms' || channel === 'all') && (
                  <Badge variant="outline" className="text-xs">
                    <MessageSquare className="mr-1 h-3 w-3" />
                    {r.phone}
                  </Badge>
                )}
              </div>
            </div>
          ))}
          {preview.has_more && (
            <p className="text-center text-sm text-muted-foreground pt-2">
              ... and {preview.total - preview.recipients.length} more
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

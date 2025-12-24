'use client';

/**
 * Template Preview Component
 * TASK-WEB-045: Payment Reminder Template Editor
 *
 * Shows a preview of the template with sample data.
 */

import { Mail, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export interface TemplatePreviewProps {
  /** Rendered subject line (email only) */
  subject?: string;
  /** Rendered body content */
  body: string;
  /** Channel type for styling */
  channel: 'email' | 'whatsapp';
}

/**
 * Preview component showing how the template will look
 */
export function TemplatePreview({ subject, body, channel }: TemplatePreviewProps) {
  const isEmail = channel === 'email';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          {isEmail ? (
            <Mail className="h-4 w-4" />
          ) : (
            <MessageSquare className="h-4 w-4" />
          )}
          Preview
          <Badge variant="secondary" className="ml-auto">
            {isEmail ? 'Email' : 'WhatsApp'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isEmail ? (
          <div className="space-y-3">
            {/* Email preview styled like an email client */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-muted px-4 py-3 border-b">
                <div className="text-xs text-muted-foreground">Subject:</div>
                <div className="font-medium">{subject || '(No subject)'}</div>
              </div>
              <div className="p-4 bg-white">
                <div className="whitespace-pre-wrap text-sm">{body}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {/* WhatsApp preview styled like a chat bubble */}
            <div className="flex justify-end">
              <div className="bg-[#DCF8C6] rounded-lg px-3 py-2 max-w-[85%] shadow-sm">
                <div className="whitespace-pre-wrap text-sm">{body}</div>
                <div className="text-xs text-gray-500 text-right mt-1">
                  10:30 AM
                </div>
              </div>
            </div>
            {/* Character count for WhatsApp */}
            <div className="text-xs text-right">
              <span className={body.length > 1024 ? 'text-destructive font-medium' : 'text-muted-foreground'}>
                {body.length}/1024 characters
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

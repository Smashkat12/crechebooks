'use client';

/**
 * Message Composer Component
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface MessageComposerProps {
  value: {
    subject: string;
    body: string;
  };
  onChange: (updates: { subject?: string; body?: string }) => void;
  showSubject?: boolean;
}

export function MessageComposer({
  value,
  onChange,
  showSubject = true,
}: MessageComposerProps) {
  return (
    <div className="space-y-4">
      {showSubject && (
        <div className="space-y-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            placeholder="Enter message subject"
            value={value.subject}
            onChange={(e) => onChange({ subject: e.target.value })}
          />
          <p className="text-xs text-muted-foreground">
            Subject line for email messages
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="body">Message</Label>
        <Textarea
          id="body"
          placeholder="Write your message here..."
          value={value.body}
          onChange={(e) => onChange({ body: e.target.value })}
          rows={8}
          className="resize-none"
        />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {value.body.length} characters
          </span>
          <span>
            WhatsApp messages over 1024 characters may be split
          </span>
        </div>
      </div>
    </div>
  );
}

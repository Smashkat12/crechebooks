'use client';

/**
 * Template Editor Component
 * TASK-WEB-045: Payment Reminder Template Editor
 *
 * Main editor for editing reminder templates with variable insertion.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Save, RotateCcw, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VariablePicker } from './VariablePicker';
import { TemplatePreview } from './TemplatePreview';
import {
  TEMPLATE_VARIABLES,
  usePreviewTemplate,
  type ReminderTemplate,
  type TemplateVariable,
} from '@/hooks/useTemplates';
import { useToast } from '@/hooks/use-toast';

export interface TemplateEditorProps {
  /** Template being edited */
  template: ReminderTemplate;
  /** Available template variables */
  variables?: TemplateVariable[];
  /** Callback when save is clicked */
  onSave: (data: { subject?: string; body: string }) => void;
  /** Callback when reset to default is clicked */
  onReset?: () => void;
  /** Whether save is in progress */
  isSaving?: boolean;
}

/**
 * Get escalation level badge variant
 */
function getEscalationBadgeVariant(level: string) {
  switch (level) {
    case 'FRIENDLY':
      return 'default';
    case 'FIRM':
      return 'secondary';
    case 'FINAL':
      return 'destructive';
    default:
      return 'outline';
  }
}

/**
 * Editor component for modifying reminder templates
 */
export function TemplateEditor({
  template,
  variables = TEMPLATE_VARIABLES,
  onSave,
  onReset,
  isSaving = false,
}: TemplateEditorProps) {
  const [subject, setSubject] = useState(template.subject || '');
  const [body, setBody] = useState(template.body);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState<{ subject?: string; body: string } | null>(null);

  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const previewMutation = usePreviewTemplate();

  const isEmail = template.channel === 'email';
  const isWhatsApp = template.channel === 'whatsapp';
  const hasChanges = subject !== (template.subject || '') || body !== template.body;
  const isOverLimit = isWhatsApp && body.length > 1024;

  // Reset form when template changes
  useEffect(() => {
    setSubject(template.subject || '');
    setBody(template.body);
    setShowPreview(false);
    setPreviewContent(null);
  }, [template.id, template.subject, template.body]);

  // Insert variable at cursor position
  const insertVariable = useCallback((variable: string) => {
    const activeElement = document.activeElement;

    // Determine which input to insert into
    if (activeElement === subjectRef.current && isEmail) {
      const input = subjectRef.current!;
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const newValue = subject.slice(0, start) + variable + subject.slice(end);
      setSubject(newValue);

      // Restore cursor position after state update
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    } else {
      // Default to body textarea
      const textarea = bodyRef.current!;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const newValue = body.slice(0, start) + variable + body.slice(end);
      setBody(newValue);

      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  }, [body, subject, isEmail]);

  // Generate preview
  const handlePreview = useCallback(async () => {
    try {
      const result = await previewMutation.mutateAsync({
        body,
        subject: isEmail ? subject : undefined,
      });
      setPreviewContent(result);
      setShowPreview(true);
    } catch (error) {
      toast({
        title: 'Preview failed',
        description: 'Could not generate preview',
        variant: 'destructive',
      });
    }
  }, [body, subject, isEmail, previewMutation, toast]);

  // Handle save
  const handleSave = useCallback(() => {
    if (isOverLimit) {
      toast({
        title: 'Message too long',
        description: 'WhatsApp messages must be 1024 characters or less',
        variant: 'destructive',
      });
      return;
    }

    onSave({
      subject: isEmail ? subject : undefined,
      body,
    });
  }, [body, subject, isEmail, isOverLimit, onSave, toast]);

  // Handle reset
  const handleReset = useCallback(() => {
    if (onReset) {
      onReset();
    } else {
      setSubject(template.subject || '');
      setBody(template.body);
    }
    setShowPreview(false);
    setPreviewContent(null);
  }, [onReset, template.subject, template.body]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Editor Panel */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">{template.name}</CardTitle>
              <div className="flex gap-2 mt-2">
                <Badge variant={getEscalationBadgeVariant(template.escalationLevel)}>
                  {template.escalationLevel}
                </Badge>
                <Badge variant="outline">
                  {template.channel.toUpperCase()}
                </Badge>
              </div>
            </div>
            <VariablePicker variables={variables} onInsert={insertVariable} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Subject field (email only) */}
          {isEmail && (
            <div className="space-y-2">
              <Label htmlFor="subject">Subject Line</Label>
              <Input
                id="subject"
                ref={subjectRef}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter email subject..."
              />
            </div>
          )}

          {/* Body field */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Message Body</Label>
              {isWhatsApp && (
                <span className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {body.length}/1024
                </span>
              )}
            </div>
            <Textarea
              id="body"
              ref={bodyRef}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Enter message content..."
              rows={12}
              className="font-mono text-sm resize-none"
            />
            {isOverLimit && (
              <p className="text-xs text-destructive">
                WhatsApp messages must be 1024 characters or less
              </p>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleReset}
              disabled={!hasChanges && !onReset}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              {onReset ? 'Reset to Default' : 'Revert Changes'}
            </Button>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handlePreview}
                disabled={previewMutation.isPending}
              >
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving || isOverLimit || !hasChanges}
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Panel */}
      {showPreview && previewContent && (
        <TemplatePreview
          subject={previewContent.subject}
          body={previewContent.body}
          channel={template.channel}
        />
      )}

      {/* Variable reference */}
      {!showPreview && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Variable Reference</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {variables.map((variable) => (
                <div key={variable.key} className="text-sm">
                  <code className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono">
                    {`{${variable.key}}`}
                  </code>
                  <span className="text-muted-foreground ml-2">
                    {variable.description}
                  </span>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Example: {variable.example}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

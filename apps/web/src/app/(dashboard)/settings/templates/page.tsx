'use client';

/**
 * Template Editor Page
 * TASK-WEB-045: Payment Reminder Template Editor
 *
 * Page for managing payment reminder templates.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { TemplateEditor } from '@/components/templates';
import {
  useTemplates,
  useUpdateTemplate,
  useResetTemplate,
  TEMPLATE_VARIABLES,
  type ReminderTemplate,
} from '@/hooks/useTemplates';
import { useToast } from '@/hooks/use-toast';

/**
 * Template list item component
 */
function TemplateListItem({
  template,
  isSelected,
  onClick,
}: {
  template: ReminderTemplate;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-colors ${
        isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-muted'
      }`}
    >
      <div className="font-medium text-sm">{template.name}</div>
      <div className="text-xs text-muted-foreground capitalize mt-0.5">
        {template.escalationLevel.toLowerCase()} reminder
      </div>
    </button>
  );
}

/**
 * Loading skeleton for template list
 */
function TemplateListSkeleton() {
  return (
    <div className="space-y-1">
      {[1, 2, 3].map((i) => (
        <div key={i} className="px-4 py-3 border-b">
          <Skeleton className="h-4 w-32 mb-1" />
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

/**
 * Template channel tab content
 */
function ChannelTemplates({ channel }: { channel: 'email' | 'whatsapp' }) {
  const [selectedTemplate, setSelectedTemplate] = useState<ReminderTemplate | null>(null);
  const { data: templates, isLoading, error } = useTemplates(channel);
  const updateTemplate = useUpdateTemplate();
  const resetTemplate = useResetTemplate();
  const { toast } = useToast();

  // Select first template when loaded
  if (templates && templates.length > 0 && !selectedTemplate) {
    setSelectedTemplate(templates[0]);
  }

  const handleSave = async (data: { subject?: string; body: string }) => {
    if (!selectedTemplate) return;

    try {
      await updateTemplate.mutateAsync({
        id: selectedTemplate.id,
        ...data,
      });
      toast({
        title: 'Template saved',
        description: 'Your changes have been saved successfully.',
      });
    } catch (_error) {
      toast({
        title: 'Save failed',
        description: 'Could not save template changes.',
        variant: 'destructive',
      });
    }
  };

  const handleReset = async () => {
    if (!selectedTemplate) return;

    try {
      const updated = await resetTemplate.mutateAsync(selectedTemplate.id);
      setSelectedTemplate(updated);
      toast({
        title: 'Template reset',
        description: 'Template has been reset to default.',
      });
    } catch (_error) {
      toast({
        title: 'Reset failed',
        description: 'Could not reset template.',
        variant: 'destructive',
      });
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          Failed to load templates
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Template list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {channel === 'email' ? 'Email' : 'WhatsApp'} Templates
          </CardTitle>
          <CardDescription className="text-xs">
            Select a template to edit
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <TemplateListSkeleton />
          ) : (
            <div className="border-t">
              {templates?.map((template) => (
                <TemplateListItem
                  key={template.id}
                  template={template}
                  isSelected={selectedTemplate?.id === template.id}
                  onClick={() => setSelectedTemplate(template)}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Template editor */}
      {selectedTemplate ? (
        <TemplateEditor
          template={selectedTemplate}
          variables={TEMPLATE_VARIABLES}
          onSave={handleSave}
          onReset={handleReset}
          isSaving={updateTemplate.isPending}
        />
      ) : (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Select a template to edit
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Templates page component
 */
export default function TemplatesPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payment Reminder Templates</CardTitle>
          <CardDescription>
            Customize the messages sent to parents for payment reminders.
            Use variables like {'{parent_name}'} to personalize messages.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="email" className="space-y-4">
            <TabsList>
              <TabsTrigger value="email">Email Templates</TabsTrigger>
              <TabsTrigger value="whatsapp">WhatsApp Templates</TabsTrigger>
            </TabsList>
            <TabsContent value="email" className="space-y-4">
              <ChannelTemplates channel="email" />
            </TabsContent>
            <TabsContent value="whatsapp" className="space-y-4">
              <ChannelTemplates channel="whatsapp" />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

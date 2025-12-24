/**
 * Template Hooks
 * TASK-WEB-045: Payment Reminder Template Editor
 *
 * @module hooks/useTemplates
 * @description React Query hooks for managing reminder templates.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Template variable that can be inserted into templates
 */
export interface TemplateVariable {
  /** Variable placeholder (e.g., "parent_name") */
  key: string;
  /** Display label (e.g., "Parent Name") */
  label: string;
  /** Description of what the variable contains */
  description: string;
  /** Example value for preview */
  example: string;
}

/**
 * Reminder template structure
 */
export interface ReminderTemplate {
  /** Unique template ID */
  id: string;
  /** Template name */
  name: string;
  /** Escalation level: FRIENDLY, FIRM, FINAL */
  escalationLevel: 'FRIENDLY' | 'FIRM' | 'FINAL';
  /** Delivery channel */
  channel: 'email' | 'whatsapp';
  /** Email subject (email templates only) */
  subject?: string;
  /** Template body content */
  body: string;
  /** Whether this is the default template */
  isDefault: boolean;
  /** Last updated timestamp */
  updatedAt: string;
}

/**
 * Available template variables
 */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: 'parent_name',
    label: 'Parent Name',
    description: 'Full name of the parent/guardian',
    example: 'John Smith',
  },
  {
    key: 'child_name',
    label: 'Child Name',
    description: 'Name of the enrolled child',
    example: 'Emma Smith',
  },
  {
    key: 'amount',
    label: 'Amount Due',
    description: 'Outstanding amount in ZAR format',
    example: 'R1,500.00',
  },
  {
    key: 'due_date',
    label: 'Due Date',
    description: 'Invoice due date',
    example: '15 January 2024',
  },
  {
    key: 'days_overdue',
    label: 'Days Overdue',
    description: 'Number of days past due date',
    example: '7',
  },
  {
    key: 'creche_name',
    label: 'Creche Name',
    description: 'Name of the creche/daycare',
    example: 'Sunshine Creche',
  },
  {
    key: 'invoice_number',
    label: 'Invoice Number',
    description: 'Invoice reference number',
    example: 'INV-2024-001',
  },
];

/**
 * Default templates for each escalation level
 */
export const DEFAULT_TEMPLATES: Omit<ReminderTemplate, 'id' | 'updatedAt'>[] = [
  {
    name: 'Friendly Reminder - Email',
    escalationLevel: 'FRIENDLY',
    channel: 'email',
    subject: 'Payment Reminder - Invoice from {creche_name}',
    body: `Dear {parent_name},

This is a friendly reminder that your invoice for {child_name}'s care is now overdue.

Outstanding Amount: {amount}
Due Date: {due_date}
Days Overdue: {days_overdue}

Please arrange payment at your earliest convenience.

Kind regards,
{creche_name}`,
    isDefault: true,
  },
  {
    name: 'Friendly Reminder - WhatsApp',
    escalationLevel: 'FRIENDLY',
    channel: 'whatsapp',
    body: `Hi {parent_name}, this is a friendly reminder from {creche_name}. Your payment of {amount} for {child_name} is now {days_overdue} days overdue. Please arrange payment soon. Thank you!`,
    isDefault: true,
  },
  {
    name: 'Firm Reminder - Email',
    escalationLevel: 'FIRM',
    channel: 'email',
    subject: 'Urgent: Payment Required - {creche_name}',
    body: `Dear {parent_name},

Your payment for {child_name}'s care is now significantly overdue and requires immediate attention.

Outstanding Amount: {amount}
Due Date: {due_date}
Days Overdue: {days_overdue}

Please note that continued non-payment may affect your child's enrollment status.

Please contact us immediately to discuss payment arrangements.

Regards,
{creche_name}`,
    isDefault: true,
  },
  {
    name: 'Firm Reminder - WhatsApp',
    escalationLevel: 'FIRM',
    channel: 'whatsapp',
    body: `URGENT: {parent_name}, your payment of {amount} for {child_name} at {creche_name} is {days_overdue} days overdue. Please settle immediately or contact us to discuss.`,
    isDefault: true,
  },
  {
    name: 'Final Notice - Email',
    escalationLevel: 'FINAL',
    channel: 'email',
    subject: 'FINAL NOTICE: Immediate Payment Required - {creche_name}',
    body: `Dear {parent_name},

This is a FINAL NOTICE regarding your outstanding payment.

Outstanding Amount: {amount}
Due Date: {due_date}
Days Overdue: {days_overdue}

Failure to settle this account within 48 hours may result in:
- Suspension of {child_name}'s enrollment
- Referral to debt collection

Please contact us immediately to avoid these actions.

{creche_name}`,
    isDefault: true,
  },
  {
    name: 'Final Notice - WhatsApp',
    escalationLevel: 'FINAL',
    channel: 'whatsapp',
    body: `FINAL NOTICE: {parent_name}, {amount} outstanding for {child_name} at {creche_name}. {days_overdue} days overdue. Pay within 48 hours to avoid enrollment suspension. Contact us urgently.`,
    isDefault: true,
  },
];

/**
 * Query key factory for templates
 */
const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (channel: 'email' | 'whatsapp') => [...templateKeys.lists(), channel] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
  preview: (id: string) => [...templateKeys.all, 'preview', id] as const,
};

/**
 * Generate mock templates (simulating API response)
 */
function generateMockTemplates(): ReminderTemplate[] {
  return DEFAULT_TEMPLATES.map((template, index) => ({
    ...template,
    id: `template-${index + 1}`,
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Hook to fetch templates by channel
 */
export function useTemplates(channel: 'email' | 'whatsapp') {
  return useQuery({
    queryKey: templateKeys.list(channel),
    queryFn: async (): Promise<ReminderTemplate[]> => {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/templates?channel=${channel}`);
      // return response.json();

      // Mock data for now
      await new Promise(resolve => setTimeout(resolve, 300));
      return generateMockTemplates().filter(t => t.channel === channel);
    },
  });
}

/**
 * Hook to fetch a single template
 */
export function useTemplate(id: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: async (): Promise<ReminderTemplate | null> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 200));
      return generateMockTemplates().find(t => t.id === id) || null;
    },
    enabled: !!id,
  });
}

/**
 * Hook to update a template
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: { id: string; subject?: string; body: string }): Promise<ReminderTemplate> => {
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/templates/${data.id}`, {
      //   method: 'PATCH',
      //   body: JSON.stringify(data),
      // });
      // return response.json();

      await new Promise(resolve => setTimeout(resolve, 500));

      const templates = generateMockTemplates();
      const template = templates.find(t => t.id === data.id);
      if (!template) throw new Error('Template not found');

      return {
        ...template,
        subject: data.subject,
        body: data.body,
        updatedAt: new Date().toISOString(),
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.setQueryData(templateKeys.detail(data.id), data);
    },
  });
}

/**
 * Hook to reset a template to default
 */
export function useResetTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string): Promise<ReminderTemplate> => {
      // TODO: Replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 300));

      const templates = generateMockTemplates();
      const template = templates.find(t => t.id === id);
      if (!template) throw new Error('Template not found');

      return template;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.setQueryData(templateKeys.detail(data.id), data);
    },
  });
}

/**
 * Preview a template with sample data
 */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: async (data: { body: string; subject?: string }): Promise<{ subject?: string; body: string }> => {
      // Replace variables with sample values
      let previewBody = data.body;
      let previewSubject = data.subject;

      for (const variable of TEMPLATE_VARIABLES) {
        const placeholder = `{${variable.key}}`;
        previewBody = previewBody.replaceAll(placeholder, variable.example);
        if (previewSubject) {
          previewSubject = previewSubject.replaceAll(placeholder, variable.example);
        }
      }

      return {
        subject: previewSubject,
        body: previewBody,
      };
    },
  });
}

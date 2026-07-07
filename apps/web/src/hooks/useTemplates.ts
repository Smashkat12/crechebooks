/**
 * Template Hooks
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * @module hooks/useTemplates
 * @description React Query hooks for the settings/templates page. Fetches
 * ARREARS_REMINDER_* templates from `/api/v1/templates` and adapts the wire
 * shape (MessageTemplateResponseDto) into the ReminderTemplate shape the
 * existing UI expects.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { apiClient } from '@/lib/api';

/**
 * Template variable that can be inserted into templates.
 * The `key` values match the placeholder tokens supported by the backend
 * MessageTemplateResolverService — `{parentName}` etc.
 */
export interface TemplateVariable {
  key: string;
  label: string;
  description: string;
  example: string;
}

/**
 * Reminder template shape consumed by the settings/templates UI.
 *
 * Note: `id` is the API row id when the tenant has a saved override, or a
 * synthetic `<KEY>::<CHANNEL>` identifier when the resolver returned the
 * coded default. The mutation hooks translate this back into the (key,
 * channel) tuple the REST API needs.
 */
export interface ReminderTemplate {
  id: string;
  name: string;
  escalationLevel: 'FRIENDLY' | 'FIRM' | 'FINAL';
  channel: 'email' | 'whatsapp';
  subject?: string;
  body: string;
  isDefault: boolean;
  updatedAt: string;
  /**
   * Backend key/channel pair — kept alongside `id` because mutations
   * address templates by (key, channel), not by uuid.
   */
  key: MessageTemplateKey;
  apiChannel: MessageTemplateChannel;
}

export type MessageTemplateKey =
  | 'ARREARS_REMINDER_FRIENDLY'
  | 'ARREARS_REMINDER_FIRM'
  | 'ARREARS_REMINDER_FINAL'
  | 'INVOICE_DELIVERY'
  | 'WELCOME_PACK'
  | 'STATEMENT_DELIVERY'
  | 'INVOICE_SCHEDULER_ADMIN_SUMMARY';

export type MessageTemplateChannel = 'EMAIL' | 'WHATSAPP' | 'SMS';

/**
 * Wire shape returned by GET /templates. Matches the MessageTemplateResponseDto
 * on the API side.
 */
interface MessageTemplateResponse {
  id: string | null;
  tenantId: string;
  key: MessageTemplateKey;
  channel: MessageTemplateChannel;
  subject: string | null;
  body: string;
  isDefault: boolean;
  label: string;
  placeholders: string[];
  createdAt: string | null;
  updatedAt: string | null;
}

/**
 * Placeholders the reminder templates understand. Names match the backend
 * substitution keys — MessageTemplateResolverService replaces `{parentName}`
 * with the parent's first name, and so on.
 */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    key: 'parentName',
    label: 'Parent Name',
    description: 'Full name of the parent/guardian',
    example: 'John Smith',
  },
  {
    key: 'childName',
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
    key: 'dueDate',
    label: 'Due Date',
    description: 'Invoice due date',
    example: '15 January 2024',
  },
  {
    key: 'daysOverdue',
    label: 'Days Overdue',
    description: 'Number of days past due date',
    example: '7',
  },
  {
    key: 'crecheName',
    label: 'Creche Name',
    description: 'Name of the creche/daycare',
    example: 'Sunshine Creche',
  },
  {
    key: 'invoiceNumber',
    label: 'Invoice Number',
    description: 'Invoice reference number',
    example: 'INV-2024-001',
  },
];

const templateKeys = {
  all: ['templates'] as const,
  lists: () => [...templateKeys.all, 'list'] as const,
  list: (channel: 'email' | 'whatsapp') => [...templateKeys.lists(), channel] as const,
  detail: (id: string) => [...templateKeys.all, 'detail', id] as const,
};

/** Map wire key → the UI's escalation level literal. Non-reminder keys → null. */
function keyToEscalationLevel(key: MessageTemplateKey): ReminderTemplate['escalationLevel'] | null {
  switch (key) {
    case 'ARREARS_REMINDER_FRIENDLY':
      return 'FRIENDLY';
    case 'ARREARS_REMINDER_FIRM':
      return 'FIRM';
    case 'ARREARS_REMINDER_FINAL':
      return 'FINAL';
    default:
      return null;
  }
}

/**
 * Synthesise a stable id for coded-default rows so the UI's selected-item
 * state doesn't churn when the query refetches. Once a tenant saves an
 * override the API returns a real uuid instead.
 */
function templateId(row: MessageTemplateResponse): string {
  return row.id ?? `${row.key}::${row.channel}`;
}

function adaptResponse(row: MessageTemplateResponse): ReminderTemplate | null {
  const level = keyToEscalationLevel(row.key);
  if (!level) return null;
  const channel = row.channel === 'EMAIL' ? 'email' : row.channel === 'WHATSAPP' ? 'whatsapp' : null;
  if (!channel) return null;
  return {
    id: templateId(row),
    name: row.label,
    escalationLevel: level,
    channel,
    subject: row.subject ?? undefined,
    body: row.body,
    isDefault: row.isDefault,
    updatedAt: row.updatedAt ?? new Date(0).toISOString(),
    key: row.key,
    apiChannel: row.channel,
  };
}

/** Fetch reminder templates for a channel (arrears keys only). */
export function useTemplates(channel: 'email' | 'whatsapp') {
  return useQuery({
    queryKey: templateKeys.list(channel),
    queryFn: async (): Promise<ReminderTemplate[]> => {
      const apiChannel: MessageTemplateChannel = channel === 'email' ? 'EMAIL' : 'WHATSAPP';
      const { data } = await apiClient.get<MessageTemplateResponse[]>('/templates', {
        params: { channel: apiChannel },
      });
      return data
        .map(adaptResponse)
        .filter((t): t is ReminderTemplate => t !== null);
    },
  });
}

/**
 * Upsert a tenant's template override. `id` here is the local UI id — either
 * the API row uuid or the synthetic `<KEY>::<CHANNEL>` id from the default;
 * either way we look up the (key, channel) from the cached template list to
 * address the correct row on the server.
 */
export function useUpdateTemplate() {
  const queryClient = useQueryClient();

  return useMutation<
    ReminderTemplate,
    AxiosError,
    { id: string; subject?: string; body: string; key: MessageTemplateKey; apiChannel: MessageTemplateChannel }
  >({
    mutationFn: async ({ key, apiChannel, subject, body }) => {
      const { data } = await apiClient.put<MessageTemplateResponse>(
        `/templates/${key}/${apiChannel}`,
        { subject, body },
      );
      const adapted = adaptResponse(data);
      if (!adapted) {
        throw new Error(`Unexpected template response for ${key}/${apiChannel}`);
      }
      return adapted;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.setQueryData(templateKeys.detail(updated.id), updated);
    },
  });
}

/** Revert to the coded default by deleting the tenant override. */
export function useResetTemplate() {
  const queryClient = useQueryClient();

  return useMutation<
    ReminderTemplate,
    AxiosError,
    { key: MessageTemplateKey; apiChannel: MessageTemplateChannel }
  >({
    mutationFn: async ({ key, apiChannel }) => {
      const { data } = await apiClient.delete<MessageTemplateResponse>(
        `/templates/${key}/${apiChannel}`,
      );
      const adapted = adaptResponse(data);
      if (!adapted) {
        throw new Error(`Unexpected template response for ${key}/${apiChannel}`);
      }
      return adapted;
    },
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.lists() });
      queryClient.setQueryData(templateKeys.detail(updated.id), updated);
    },
  });
}

/**
 * Preview a template body with sample values. Purely client-side — matches
 * the substitution behaviour of the backend resolver.
 */
export function usePreviewTemplate() {
  return useMutation({
    mutationFn: async (data: { body: string; subject?: string }): Promise<{ subject?: string; body: string }> => {
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

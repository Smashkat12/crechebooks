import { apiClient } from './client';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface AdminMessageThread {
  parentId: string;
  parentName: string;
  parentPhone: string | null;
  lastMessageAt: string;
  lastMessageSnippet: string;
  unreadCount: number;
}

export interface AdminMessage {
  id: string;
  direction: MessageDirection;
  body: string;
  mediaUrl: string | null;
  mediaContentType: string | null;
  status: MessageStatus;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  replyToMessageId: string | null;
  parentId: string | null;
}

export interface UnknownMessage {
  id: string;
  from: string;
  body: string;
  mediaUrl: string | null;
  mediaContentType: string | null;
  createdAt: string;
}

export interface AdminThreadsParams {
  page?: number;
  limit?: number;
  search?: string;
}

export interface AdminThreadParams {
  order?: 'asc' | 'desc';
  limit?: number;
  cursor?: string;
}

export interface AdminThreadsResponse {
  threads: AdminMessageThread[];
  total: number;
  page: number;
  limit: number;
}

export interface AdminThreadResponse {
  messages: AdminMessage[];
  nextCursor: string | null;
}

export interface ReplyRequest {
  body: string;
  replyToMessageId?: string;
}

export interface TemplateWindowError {
  requiresTemplate: boolean;
  lastInboundAt: string;
}

export interface SendTemplateRequest {
  contentSid: string;
  templateParams: Record<string, string>;
}

export interface LinkParentRequest {
  parentId: string;
}

// ─── Admin API functions ───────────────────────────────────────────────────────

export async function fetchAdminThreads(
  params?: AdminThreadsParams,
): Promise<AdminThreadsResponse> {
  const { data } = await apiClient.get<AdminThreadsResponse>(
    '/admin/messages/threads',
    { params },
  );
  return data;
}

export async function fetchAdminThread(
  parentId: string,
  params?: AdminThreadParams,
): Promise<AdminThreadResponse> {
  const { data } = await apiClient.get<AdminThreadResponse>(
    `/admin/messages/threads/${parentId}`,
    { params },
  );
  return data;
}

export async function replyAdminThread(
  parentId: string,
  req: ReplyRequest,
): Promise<AdminMessage> {
  const { data } = await apiClient.post<AdminMessage>(
    `/admin/messages/threads/${parentId}/reply`,
    req,
  );
  return data;
}

export async function sendAdminTemplate(
  parentId: string,
  req: SendTemplateRequest,
): Promise<AdminMessage> {
  const { data } = await apiClient.post<AdminMessage>(
    `/admin/messages/threads/${parentId}/send-template`,
    req,
  );
  return data;
}

export async function markMessageRead(messageId: string): Promise<void> {
  await apiClient.patch(`/admin/messages/${messageId}/read`);
}

export async function markAllRead(parentId: string): Promise<void> {
  await apiClient.post(`/admin/messages/threads/${parentId}/read-all`);
}

export async function fetchUnknownMessages(): Promise<UnknownMessage[]> {
  const { data } = await apiClient.get<UnknownMessage[]>(
    '/admin/messages/unknown',
  );
  return data;
}

export async function linkMessageParent(
  messageId: string,
  req: LinkParentRequest,
): Promise<void> {
  await apiClient.post(`/admin/messages/${messageId}/link-parent`, req);
}

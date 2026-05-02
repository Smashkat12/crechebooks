// ─── Parent portal messages API ────────────────────────────────────────────────

const PARENT_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Types ─────────────────────────────────────────────────────────────────────

export type MessageDirection = 'inbound' | 'outbound';
export type MessageStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'pending';

export interface ParentMessage {
  id: string;
  direction: MessageDirection;
  body: string;
  mediaUrl: string | null;
  mediaContentType: string | null;
  status: MessageStatus;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface ParentMessagesResponse {
  messages: ParentMessage[];
  nextCursor: string | null;
}

// ─── Auth helper ───────────────────────────────────────────────────────────────

function getParentToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('parent_session_token');
}

async function parentPortalFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const token = getParentToken();
  if (!token) throw new Error('Not authenticated. Please log in.');

  const response = await fetch(`${PARENT_API_URL}/api/v1/parent-portal${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem('parent_session_token');
      throw new Error('Session expired. Please log in again.');
    }
    let msg = `Request failed: ${response.status}`;
    try {
      const err = await response.json();
      msg = err.message || err.error || msg;
    } catch {
      // use default
    }
    throw new Error(msg);
  }

  if (response.status === 204) return undefined as T;
  return response.json();
}

// ─── API functions ─────────────────────────────────────────────────────────────

export async function fetchParentMessages(): Promise<ParentMessagesResponse> {
  return parentPortalFetch<ParentMessagesResponse>(
    '/messages',
  );
}

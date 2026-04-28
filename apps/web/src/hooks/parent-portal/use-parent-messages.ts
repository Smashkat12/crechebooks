import { useQuery } from '@tanstack/react-query';
import {
  fetchParentMessages,
  type ParentMessage,
  type ParentMessagesResponse,
} from '@/lib/api/parent-messages';

// ─── Query keys ───────────────────────────────────────────────────────────────

const parentMessageKeys = {
  all: ['parent-messages'] as const,
  list: () => [...parentMessageKeys.all, 'list'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useParentMessages() {
  return useQuery<ParentMessagesResponse, Error>({
    queryKey: parentMessageKeys.list(),
    queryFn: fetchParentMessages,
    staleTime: 25 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  });
}

// Re-export types for convenience
export type { ParentMessage };

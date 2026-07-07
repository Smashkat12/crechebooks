/**
 * useAdminAgentRollout — TanStack Query hooks for /admin/agent-rollout
 *
 * Backs the SUPER_ADMIN agent rollout console. Types mirror the API DTOs
 * intentionally — see apps/api/src/api/admin/dto/agent-rollout.dto.ts.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';

// ─── Types (mirror the API DTOs) ───────────────────────────────────────────

export type RolloutMode = 'DISABLED' | 'SHADOW' | 'PRIMARY';
export type AgentType =
  | 'categorizer'
  | 'matcher'
  | 'sars'
  | 'validator'
  | 'orchestrator';

export const AGENT_TYPES: AgentType[] = [
  'categorizer',
  'matcher',
  'sars',
  'validator',
  'orchestrator',
];

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  categorizer: 'Transaction categorizer',
  matcher: 'Payment matcher',
  sars: 'SARS tax explainer',
  validator: 'Extraction validator',
  orchestrator: 'Orchestrator',
};

export interface AgentRolloutRow {
  tenantId: string;
  tenantName: string;
  agentType: AgentType;
  flagKey: string;
  mode: RolloutMode;
  matchRate: number;
  totalDecisions: number;
  meetsPromotionCriteria: boolean;
  promotionBlockers: string[];
}

export interface AgentRolloutListResponse {
  rows: AgentRolloutRow[];
  periodDays: number;
  generatedAt: string;
}

export interface AgentRolloutTenantResponse {
  tenantId: string;
  tenantName: string;
  agents: AgentRolloutRow[];
  periodDays: number;
  generatedAt: string;
}

export interface RolloutMutationResponse {
  success: boolean;
  tenantId: string;
  agentType: AgentType;
  previousMode: RolloutMode;
  newMode: RolloutMode;
  reason?: string;
}

// ─── Queries ────────────────────────────────────────────────────────────────

export function useAgentRollout(periodDays: number = 7) {
  return useQuery<AgentRolloutListResponse>({
    queryKey: ['admin', 'agent-rollout', { periodDays }],
    queryFn: async () => {
      const { data } = await apiClient.get('/admin/agent-rollout', {
        params: { periodDays },
      });
      return data as AgentRolloutListResponse;
    },
  });
}

export function useAgentRolloutForTenant(
  tenantId: string,
  periodDays: number = 7,
) {
  return useQuery<AgentRolloutTenantResponse>({
    queryKey: ['admin', 'agent-rollout', tenantId, { periodDays }],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/admin/agent-rollout/${tenantId}`,
        { params: { periodDays } },
      );
      return data as AgentRolloutTenantResponse;
    },
    enabled: !!tenantId,
  });
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useSetAgentMode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tenantId: string;
      agentType: AgentType;
      mode: RolloutMode;
      reason: string;
      force?: boolean;
    }) => {
      const { tenantId, agentType, ...body } = params;
      const { data } = await apiClient.post(
        `/admin/agent-rollout/${tenantId}/${agentType}`,
        body,
      );
      return data as RolloutMutationResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'agent-rollout'] });
    },
  });
}

export function usePromoteAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      tenantId: string;
      agentType: AgentType;
      reason: string;
    }) => {
      const { tenantId, agentType, reason } = params;
      const { data } = await apiClient.post(
        `/admin/agent-rollout/${tenantId}/${agentType}/promote`,
        { reason },
      );
      return data as RolloutMutationResponse;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'agent-rollout'] });
    },
  });
}

export function useRollbackAllAgents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { tenantId: string; reason: string }) => {
      const { tenantId, reason } = params;
      const { data } = await apiClient.post(
        `/admin/agent-rollout/${tenantId}/rollback-all`,
        { reason },
      );
      return data as {
        success: boolean;
        tenantId: string;
        results: RolloutMutationResponse[];
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'agent-rollout'] });
    },
  });
}

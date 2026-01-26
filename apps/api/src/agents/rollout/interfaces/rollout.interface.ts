/**
 * Rollout Interfaces
 * TASK-SDK-012: SDK Agent Integration Tests & Parallel Rollout Framework
 *
 * @module agents/rollout/interfaces/rollout.interface
 */

export const SdkMode = {
  DISABLED: 'DISABLED',
  SHADOW: 'SHADOW',
  PRIMARY: 'PRIMARY',
} as const;
export type SdkMode = (typeof SdkMode)[keyof typeof SdkMode];

export const SdkFlag = {
  CATEGORIZER: 'sdk_categorizer',
  MATCHER: 'sdk_matcher',
  SARS: 'sdk_sars',
  VALIDATOR: 'sdk_validator',
  ORCHESTRATOR: 'sdk_orchestrator',
  CONVERSATIONAL: 'sdk_conversational',
} as const;
export type SdkFlag = (typeof SdkFlag)[keyof typeof SdkFlag];

export interface ComparisonResult {
  tenantId: string;
  agentType: string;
  sdkResult: unknown;
  heuristicResult: unknown;
  sdkDurationMs: number;
  heuristicDurationMs: number;
  resultsMatch: boolean;
  sdkConfidence?: number;
  heuristicConfidence?: number;
  details: Record<string, unknown>;
}

export interface ShadowRunParams<T> {
  tenantId: string;
  agentType: string;
  sdkFn: () => Promise<T>;
  heuristicFn: () => Promise<T>;
  compareFn: (sdk: T, heuristic: T) => ComparisonResult;
}

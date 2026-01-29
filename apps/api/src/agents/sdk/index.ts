/**
 * SDK Agent Barrel Exports
 * TASK-SDK-001: Claude Agent SDK TypeScript Integration Setup
 *
 * @module agents/sdk
 * @description Re-exports all SDK agent classes, interfaces, and types.
 */

// Interfaces (type-only exports for isolatedModules compliance)
export type {
  AgentDefinition,
  SdkAgentInterface,
  SdkExecutionResult,
  SdkCategorizationResult,
  SdkMatchResult,
  SdkValidationResult,
} from './interfaces/sdk-agent.interface';

// Config
export { SdkConfigService, SDK_CONFIG_DEFAULTS } from './sdk-config';
export type { AgentType, ModelProvider } from './sdk-config';

// Factory
export { SdkAgentFactory } from './sdk-agent.factory';

// Base Agent
export { BaseSdkAgent } from './base-sdk-agent';

// Ruvector Service
export { RuvectorService } from './ruvector.service';
export type { RuvectorSearchResult, RuvectorModule } from './ruvector.service';

// Claude Client Service
export { ClaudeClientService } from './claude-client.service';
export type {
  ClaudeMessage,
  ClaudeRequestOptions,
  ClaudeResponse,
} from './claude-client.service';

// IntelligenceEngine Service
export { IntelligenceEngineService } from './intelligence-engine.service';
export type {
  IntelligenceRouteResult,
  IntelligenceMemoryEntry,
  IntelligenceRecallResult,
  IntelligenceTrajectory,
  IntelligenceStats,
  IntelligenceEngineServiceConfig,
} from './interfaces/intelligence-engine.interface';

// Persistence Config
export { PersistenceConfig } from './persistence-config';
export type { PersistenceConfigValues } from './persistence-config';

// SONA Bootstrap Service
export { SonaBootstrapService } from './sona-bootstrap.service';
export type { BootstrapStats } from './sona-bootstrap.service';

// Module
export { SdkAgentModule } from './sdk-agent.module';

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

// Module
export { SdkAgentModule } from './sdk-agent.module';

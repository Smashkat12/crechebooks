/**
 * Agent Memory Barrel Exports
 * TASK-SDK-010: AgentDB & Persistent Learning Memory Integration
 *
 * @module agents/memory
 * @description Re-exports all agent memory classes, interfaces, and types.
 */

// Interfaces (type-only exports for isolatedModules compliance)
export type {
  StoreDecisionParams,
  RecordCorrectionParams,
  CorrectedCategorization,
  PatternLearnResult,
  MemoryAccuracyStats,
  SimilarDecision,
} from './interfaces/agent-memory.interface';

// Services
export { AgentMemoryService, computeInputHash } from './agent-memory.service';
export { PatternLearner } from './pattern-learner';
export { CorrectionHandler } from './correction-handler';

// Module
export { AgentMemoryModule } from './agent-memory.module';

/**
 * IntelligenceEngine Interface Types
 * TASK-STUB-009: IntelligenceEngine Full Stack Integration
 *
 * @module agents/sdk/interfaces/intelligence-engine.interface
 * @description CrecheBooks-specific wrapper types for ruvector IntelligenceEngine.
 * All types enforce strict typing with zero `any` usage.
 */

/**
 * Result from IntelligenceEngine.routeAgent().
 * Provides the recommended execution path for an agent request.
 */
export interface IntelligenceRouteResult {
  /** Recommended execution path (e.g., 'sdk', 'heuristic', 'hybrid') */
  recommendedPath: string;
  /** Confidence in the routing decision (0.0 - 1.0) */
  confidence: number;
  /** Human-readable reasoning for the routing decision */
  reasoning: string;
  /** Alternative paths considered with their confidence scores */
  alternatives: Array<{
    path: string;
    confidence: number;
  }>;
}

/**
 * A memory entry stored in the dual VectorDB + FastAgentDB store.
 */
export interface IntelligenceMemoryEntry {
  /** Unique key for retrieval */
  key: string;
  /** Content that was embedded and stored */
  content: string;
  /** Type classification for filtering */
  type: 'decision' | 'reasoning' | 'pattern' | 'embedding';
  /** Tenant ID for isolation */
  tenantId: string;
  /** Timestamp of storage */
  createdAt: number;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Result from IntelligenceEngine.recall() semantic search.
 */
export interface IntelligenceRecallResult {
  /** Key of the recalled memory */
  key: string;
  /** Content of the recalled memory */
  content: string;
  /** Memory type */
  type: string;
  /** Cosine similarity score (0.0 - 1.0) */
  similarity: number;
  /** Additional metadata from the stored entry */
  metadata: Record<string, unknown>;
}

/**
 * A SONA trajectory for the learning subsystem.
 * Captures a state-action-quality triplet for policy learning.
 */
export interface IntelligenceTrajectory {
  /** State representation (agent context at decision time) */
  state: Record<string, unknown>;
  /** Action taken (e.g., 'categorize:5200', 'match:inv-123') */
  action: string;
  /** Quality of the outcome (0.0 - 1.0, higher = better) */
  quality: number;
  /** Additional metadata (agent type, duration, etc.) */
  metadata?: Record<string, unknown>;
}

/**
 * Unified statistics from all IntelligenceEngine subsystems.
 */
export interface IntelligenceStats {
  vectorDb: {
    totalVectors: number;
    collections: number;
    storageSizeBytes: number;
  };
  sona: {
    trajectoriesRecorded: number;
    patternsLearned: number;
    lastBackgroundRun: number | null;
    backgroundIntervalMs: number;
  };
  fastAgentDb: {
    totalEpisodes: number;
    totalMemories: number;
  };
  learningEngine: {
    totalDecisions: number;
    averageConfidence: number;
    routingAccuracy: number;
  };
  initialized: boolean;
  uptimeMs: number;
}

/**
 * Configuration for IntelligenceEngine NestJS service.
 * Maps to ruvector's IntelligenceConfig with CrecheBooks defaults.
 */
export interface IntelligenceEngineServiceConfig {
  /** Embedding vector dimensions (default: 384 for all-MiniLM-L6-v2) */
  embeddingDim: number;
  /** Maximum number of memory entries (default: 100,000) */
  maxMemories: number;
  /** Maximum number of SONA episodes (default: 50,000) */
  maxEpisodes: number;
  /** Enable SONA self-optimizing architecture (default: true) */
  enableSona: boolean;
  /** Enable attention mechanisms (default: false for CrecheBooks) */
  enableAttention: boolean;
  /** Path to persistent storage (redb ACID on-disk) */
  storagePath: string;
  /** Learning rate for SONA (default: 0.1) */
  learningRate: number;
}

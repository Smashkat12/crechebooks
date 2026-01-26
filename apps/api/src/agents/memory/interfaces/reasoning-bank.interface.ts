/**
 * Reasoning Bank Interfaces
 * TASK-STUB-006: ReasoningBank VectorDB Store (Decision Chain Persistence)
 *
 * @module agents/memory/interfaces/reasoning-bank.interface
 * @description Type definitions for reasoning chain storage and semantic retrieval.
 * Reasoning chains capture the "why" behind agent categorization decisions.
 *
 * CRITICAL RULES:
 * - No PII in reasoning chains (accounting logic only)
 * - ALL monetary values referenced in chains are CENTS (integers)
 * - Tenant isolation is mandatory (POPI Act)
 */

/**
 * Parameters for storing a reasoning chain.
 */
export interface StoreChainParams {
  /** Unique decision ID (from Prisma agentDecision.id) */
  decisionId: string;
  /** The reasoning chain -- either a string or structured object */
  chain: string | Record<string, unknown>;
  /** Tenant ID for data isolation */
  tenantId: string;
}

/**
 * A stored reasoning chain record.
 */
export interface ReasoningChainRecord {
  /** Decision ID that produced this reasoning */
  decisionId: string;
  /** The reasoning chain text */
  chain: string;
  /** Tenant ID */
  tenantId: string;
  /** When the chain was stored (ISO string) */
  storedAt?: string;
}

/**
 * Result from semantic similarity search over reasoning chains.
 */
export interface SimilarReasoningResult {
  /** Decision ID of the similar reasoning chain */
  decisionId: string;
  /** The reasoning chain text */
  chain: string;
  /** Cosine similarity score (0.0 to 1.0) */
  similarity: number;
  /** When the chain was stored (ISO string) */
  storedAt?: string;
}

/**
 * Interface for reasoning chain storage and retrieval.
 * Implemented by VectorDBReasoningBank (production) and the legacy
 * in-memory stub (fallback).
 */
export interface ReasoningBankInterface {
  /**
   * Store a reasoning chain for a decision.
   * Non-blocking -- errors should be caught and logged.
   */
  store(params: StoreChainParams): Promise<void>;

  /**
   * Retrieve a reasoning chain by decision ID.
   * Returns null if not found.
   */
  get(decisionId: string): Promise<string | null>;

  /**
   * Find reasoning chains semantically similar to query text.
   * Returns empty array if VectorDB unavailable.
   *
   * @param queryText - Text to search for similar reasoning
   * @param tenantId - Tenant ID for data isolation
   * @param k - Number of results (default: 5)
   */
  findSimilarReasoning?(
    queryText: string,
    tenantId: string,
    k?: number,
  ): Promise<SimilarReasoningResult[]>;
}

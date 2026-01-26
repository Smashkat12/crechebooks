/**
 * GNN Pattern Interfaces
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * @module agents/memory/interfaces/gnn-pattern.interface
 * @description Type definitions for graph-based transaction pattern learning.
 * Defines the transaction graph structure, node embeddings, and GNN
 * adapter configuration.
 *
 * CRITICAL RULES:
 * - All monetary values are CENTS (integers)
 * - Tenant isolation on ALL queries
 * - No PII in graph embeddings (payee names are hashed)
 */

/** Types of nodes in the transaction graph */
export type GraphNodeType = 'payee' | 'account' | 'amount' | 'txtype';

/** A node in the transaction graph */
export interface TransactionGraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  embedding: Float32Array;
}

/** An edge in the transaction graph */
export interface TransactionGraphEdge {
  source: string;
  target: string;
  weight: number;
}

/** Complete transaction graph */
export interface TransactionGraph {
  nodes: TransactionGraphNode[];
  edges: TransactionGraphEdge[];
  nodeCount: number;
  edgeCount: number;
}

/** Input for building a node embedding */
export interface NodeEmbeddingInput {
  payeeName: string;
  accountCode: string;
  accountName?: string;
  amountCents: number;
  isCredit: boolean;
  transactionType?: string;
  confidence?: number;
}

/** Input for GNN pattern learning */
export interface GnnLearnInput {
  tenantId: string;
  payeeName: string;
  accountCode: string;
  accountName?: string;
  amountCents: number;
  isCredit: boolean;
  transactionType?: string;
  agentDecisionId?: string;
}

/** Input for GNN prediction */
export interface GnnPredictInput {
  tenantId: string;
  payeeName: string;
  description?: string;
  amountCents: number;
  isCredit: boolean;
  transactionType?: string;
}

/** GNN prediction result */
export interface GnnPrediction {
  accountCode: string;
  confidence: number;
  source: 'LEARNED_GNN';
  neighbors: number;
  attentionWeights?: Float32Array;
}

/** GNN adapter configuration */
export interface GnnAdapterConfig {
  inputDim: number;
  hiddenDim: number;
  attentionHeads: number;
  searchTemperature: number;
  searchTopK: number;
  compressThreshold: number;
  ewcLambda: number;
}

/** Interface for GNN pattern learning */
export interface GnnPatternInterface {
  learnPattern(input: GnnLearnInput): Promise<void>;
  predict(input: GnnPredictInput): Promise<GnnPrediction | null>;
  consolidateEWC(): Promise<void>;
}

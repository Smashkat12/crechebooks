/**
 * Graph Builder
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * @module agents/memory/graph-builder
 * @description Builds transaction graphs from correction data for GNN processing.
 * Converts raw transaction attributes (payee name, account code, amount, type)
 * into graph nodes and edges suitable for RuvectorLayer forward passes.
 *
 * CRITICAL RULES:
 * - All monetary values are CENTS (integers)
 * - Payee names are hashed (no PII in embeddings)
 * - Deterministic: same input always produces same embedding
 * - 448d node embedding = 384 payee + 50 account + 10 amount + 4 type
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import type {
  TransactionGraphNode,
  TransactionGraphEdge,
  TransactionGraph,
  NodeEmbeddingInput,
} from './interfaces/gnn-pattern.interface';

/** Payee name hash dimension (matches all-MiniLM-L6-v2 dimension) */
const PAYEE_EMBEDDING_DIM = 384;
/** Account code one-hot dimension (covers ~50 codes) */
const ACCOUNT_EMBEDDING_DIM = 50;
/** Log-scale amount buckets */
const AMOUNT_EMBEDDING_DIM = 10;
/** Transaction types: debit, credit, reversal, fee */
const TYPE_EMBEDDING_DIM = 4;

/** Total node embedding dimension: 384 + 50 + 10 + 4 = 448 */
export const NODE_EMBEDDING_DIM =
  PAYEE_EMBEDDING_DIM +
  ACCOUNT_EMBEDDING_DIM +
  AMOUNT_EMBEDDING_DIM +
  TYPE_EMBEDDING_DIM;

@Injectable()
export class GraphBuilder {
  private readonly logger = new Logger(GraphBuilder.name);

  /**
   * Build a transaction graph from a set of transactions.
   * Creates nodes for payees, account codes, amount buckets, and types.
   * Creates edges for each transaction linking its components.
   */
  buildGraph(transactions: NodeEmbeddingInput[]): TransactionGraph {
    const nodes: Map<string, TransactionGraphNode> = new Map();
    const edges: TransactionGraphEdge[] = [];

    for (const tx of transactions) {
      // Create/get payee node
      const payeeId = `payee:${tx.payeeName.toLowerCase().trim()}`;
      if (!nodes.has(payeeId)) {
        nodes.set(payeeId, {
          id: payeeId,
          type: 'payee',
          label: tx.payeeName,
          embedding: this.buildPayeeEmbedding(tx.payeeName),
        });
      }

      // Create/get account code node
      const accountId = `account:${tx.accountCode}`;
      if (!nodes.has(accountId)) {
        nodes.set(accountId, {
          id: accountId,
          type: 'account',
          label: `${tx.accountCode} ${tx.accountName ?? ''}`.trim(),
          embedding: this.buildAccountEmbedding(tx.accountCode),
        });
      }

      // Create/get amount bucket node
      const bucket = this.getAmountBucket(tx.amountCents);
      const bucketId = `amount:${bucket}`;
      if (!nodes.has(bucketId)) {
        nodes.set(bucketId, {
          id: bucketId,
          type: 'amount',
          label: bucket,
          embedding: this.buildAmountEmbedding(tx.amountCents),
        });
      }

      // Create/get type node
      const typeLabel =
        tx.transactionType ?? (tx.isCredit ? 'credit' : 'debit');
      const typeId = `type:${typeLabel}`;
      if (!nodes.has(typeId)) {
        nodes.set(typeId, {
          id: typeId,
          type: 'txtype',
          label: typeLabel,
          embedding: this.buildTypeEmbedding(typeLabel),
        });
      }

      // Create edges (payee->account, payee->amount, payee->type)
      const weight = tx.confidence !== undefined ? tx.confidence / 100 : 0.5;
      edges.push(
        { source: payeeId, target: accountId, weight },
        { source: payeeId, target: bucketId, weight: 0.5 },
        { source: payeeId, target: typeId, weight: 0.5 },
      );
    }

    return {
      nodes: Array.from(nodes.values()),
      edges,
      nodeCount: nodes.size,
      edgeCount: edges.length,
    };
  }

  /**
   * Build a full node embedding by concatenating all components.
   * Output: 448-dimensional Float32Array.
   */
  buildNodeEmbedding(input: NodeEmbeddingInput): Float32Array {
    const embedding = new Float32Array(NODE_EMBEDDING_DIM);
    let offset = 0;

    // Payee embedding (384d hash)
    const payeeEmb = this.buildPayeeEmbedding(input.payeeName);
    embedding.set(payeeEmb, offset);
    offset += PAYEE_EMBEDDING_DIM;

    // Account code embedding (50d one-hot)
    const accountEmb = this.buildAccountEmbedding(input.accountCode);
    embedding.set(accountEmb, offset);
    offset += ACCOUNT_EMBEDDING_DIM;

    // Amount bucket embedding (10d log-scale)
    const amountEmb = this.buildAmountEmbedding(input.amountCents);
    embedding.set(amountEmb, offset);
    offset += AMOUNT_EMBEDDING_DIM;

    // Transaction type embedding (4d)
    const typeLabel =
      input.transactionType ?? (input.isCredit ? 'credit' : 'debit');
    const typeEmb = this.buildTypeEmbedding(typeLabel);
    embedding.set(typeEmb, offset);

    return embedding;
  }

  /**
   * Payee embedding: SHA-256 hash of normalized payee name to 384d float vector.
   * Deterministic: same payee always produces same embedding.
   */
  private buildPayeeEmbedding(payeeName: string): Float32Array {
    const normalized = payeeName.toLowerCase().trim();
    const hash = createHash('sha256').update(normalized).digest();
    const emb = new Float32Array(PAYEE_EMBEDDING_DIM);

    for (let i = 0; i < PAYEE_EMBEDDING_DIM; i++) {
      const byteIdx = i % hash.length;
      emb[i] = (hash[byteIdx] / 255) * 2 - 1; // [-1, 1]
    }

    return emb;
  }

  /**
   * Account code embedding: one-hot-ish encoding.
   * Maps account code prefix (first 2 digits) to a slot.
   * Uses the full code as hash seed for the remaining dimensions.
   */
  private buildAccountEmbedding(accountCode: string): Float32Array {
    const emb = new Float32Array(ACCOUNT_EMBEDDING_DIM).fill(0);
    const prefix = parseInt(accountCode.substring(0, 2), 10);

    if (!isNaN(prefix) && prefix >= 0 && prefix < ACCOUNT_EMBEDDING_DIM) {
      emb[prefix] = 1.0;
    }

    // Add hash-based secondary signal
    const hash = createHash('md5').update(accountCode).digest();
    for (let i = 0; i < Math.min(10, ACCOUNT_EMBEDDING_DIM); i++) {
      emb[i] += (hash[i % hash.length] / 255) * 0.1;
    }

    return emb;
  }

  /**
   * Amount bucket embedding: log-scale encoding of amount in cents.
   * 10 dimensions representing different magnitude ranges.
   */
  private buildAmountEmbedding(amountCents: number): Float32Array {
    const emb = new Float32Array(AMOUNT_EMBEDDING_DIM).fill(0);
    const logAmount = Math.log10(Math.max(1, Math.abs(amountCents)));

    // Spread across buckets: 0=<1, 1=1-10, 2=10-100, ..., 9=100M+
    const bucketIdx = Math.min(AMOUNT_EMBEDDING_DIM - 1, Math.floor(logAmount));
    emb[bucketIdx] = 1.0;

    // Soft activation for neighboring buckets
    if (bucketIdx > 0) emb[bucketIdx - 1] = 0.3;
    if (bucketIdx < AMOUNT_EMBEDDING_DIM - 1) emb[bucketIdx + 1] = 0.3;

    return emb;
  }

  /**
   * Transaction type embedding: one-hot encoding.
   * 4 dimensions: [debit, credit, reversal, fee]
   */
  private buildTypeEmbedding(typeLabel: string): Float32Array {
    const emb = new Float32Array(TYPE_EMBEDDING_DIM).fill(0);
    const types = ['debit', 'credit', 'reversal', 'fee'];
    const idx = types.indexOf(typeLabel.toLowerCase());
    if (idx >= 0) emb[idx] = 1.0;
    return emb;
  }

  /**
   * Get log-scale amount bucket label.
   */
  private getAmountBucket(amountCents: number): string {
    const abs = Math.abs(amountCents);
    if (abs < 1000) return 'micro'; // < R10
    if (abs < 10000) return 'small'; // R10-R100
    if (abs < 100000) return 'medium'; // R100-R1000
    if (abs < 1000000) return 'large'; // R1000-R10000
    if (abs < 5000000) return 'xlarge'; // R10000-R50000
    return 'xxlarge'; // > R50000
  }
}

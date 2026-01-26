<task_spec id="TASK-STUB-007" version="2.0">

<metadata>
  <title>GNN Pattern Learner Integration (Graph-Based Transaction Learning)</title>
  <status>ready</status>
  <phase>stub-replacement</phase>
  <layer>agent</layer>
  <sequence>807</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-STUB-GNN-PATTERN-LEARNER</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-STUB-001</task_ref>
    <task_ref status="ready">TASK-STUB-004</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>14 hours</estimated_effort>
  <last_updated>2026-01-26</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The `GnnPatternLearnerStub` in `apps/api/src/agents/memory/pattern-learner.ts`
  (lines 26-30) has `learnPattern(data)` that does nothing except serve as a
  forward-compatible stub. The current `PatternLearner` class (lines 44-235) operates
  purely on threshold-based correction counting:

  1. Receives a correction (`processCorrection()`)
  2. Counts corrections with matching payee + accountCode for the same tenant
  3. When count reaches `MIN_CORRECTIONS_FOR_PATTERN` (3), creates a Prisma `PayeePattern`
  4. Marks applied corrections as `appliedToPattern: true`

  This approach misses implicit patterns in the transaction topology. For example:
  - "Woolworths Food", "Woolies Groceries", and "WW Holdings" are all the same payee
    but string matching treats them as different entities
  - A debit from "Pick n Pay" for R2,500 near month-end is likely food, but the same
    payee for R15,000 might be bulk supplies
  - Account code relationships (5200 Food and 5300 Educational Materials are both in
    the direct cost range) are not captured

  **Gap Analysis:**
  - `GnnPatternLearnerStub.learnPattern()` is a no-op (line 27-29)
  - No graph-based pattern learning from transaction topology
  - No neighbor aggregation (payee→account code relationships)
  - No differentiable search for finding similar patterns with soft attention
  - No EWC for preventing catastrophic forgetting of learned patterns
  - No TensorCompress for memory-efficient embedding storage
  - The existing threshold-based learning (3+ corrections) remains correct but limited
  - The stub is called at line 91-100 in pattern-learner.ts (fire-and-forget)

  **Transaction Graph Topology:**
  CrecheBooks transactions naturally form a bipartite graph:
  ```
  PAYEE NODES                  ACCOUNT CODE NODES
  ┌─────────────┐             ┌──────────────────┐
  │ Woolworths  │────────────▶│ 5200 Food        │
  │ Pick n Pay  │────────────▶│ 5200 Food        │
  │ Pick n Pay  │────────────▶│ 5300 Ed Materials │
  │ Eskom       │────────────▶│ 6100 Utilities   │
  │ FNB         │────────────▶│ 6600 Bank Charges│
  └─────────────┘             └──────────────────┘

  AMOUNT BUCKET NODES          TYPE NODES
  ┌─────────────┐             ┌──────────────────┐
  │ medium      │             │ debit            │
  │ large       │             │ credit           │
  │ small       │             │ reversal         │
  └─────────────┘             └──────────────────┘
  ```

  Each transaction creates edges between these node types. The GNN aggregates
  information from connected nodes to produce graph-aware embeddings that capture
  relational patterns.

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - ORM: Prisma (PostgreSQL)
  - Package Manager: pnpm (NEVER npm)
  - GNN: `ruvector` v0.1.96 (RuvectorLayer, differentiableSearch, TensorCompress, EWC)
  - Existing Service: `RuvectorService` from `apps/api/src/agents/sdk/ruvector.service.ts`
  - Testing: Jest
  - All monetary values: integers (cents)

  **Files to Create:**
  - `apps/api/src/agents/memory/gnn-pattern-adapter.ts` — Wraps RuvectorLayer + differentiableSearch
  - `apps/api/src/agents/memory/graph-builder.ts` — Builds transaction graph nodes and edges
  - `apps/api/src/agents/memory/interfaces/gnn-pattern.interface.ts` — Type definitions
  - `apps/api/tests/agents/memory/gnn-pattern-adapter.spec.ts` — Adapter unit tests
  - `apps/api/tests/agents/memory/graph-builder.spec.ts` — Graph builder unit tests

  **Files to Modify:**
  - `apps/api/src/agents/memory/pattern-learner.ts` — Replace GnnPatternLearnerStub with GnnPatternAdapter
  - `apps/api/src/agents/memory/agent-memory.module.ts` — Register new providers
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands:
  ```bash
  pnpm run build
  pnpm test
  pnpm run lint
  ```

  ### 2. Graph Builder: Transaction-to-Graph Conversion
  The graph builder converts raw transaction data into a typed graph structure that
  the GNN layer can process:
  ```typescript
  // apps/api/src/agents/memory/graph-builder.ts
  import { Injectable, Logger } from '@nestjs/common';
  import { createHash } from 'crypto';
  import type {
    TransactionGraphNode,
    TransactionGraphEdge,
    TransactionGraph,
    GraphNodeType,
    NodeEmbeddingInput,
  } from './interfaces/gnn-pattern.interface';

  /** Payee name hash → 384d embedding (matches all-MiniLM-L6-v2 dimension) */
  const PAYEE_EMBEDDING_DIM = 384;
  /** Account code one-hot dimension (covers ~50 codes) */
  const ACCOUNT_EMBEDDING_DIM = 50;
  /** Log-scale amount buckets */
  const AMOUNT_EMBEDDING_DIM = 10;
  /** Transaction types: debit, credit, reversal, fee */
  const TYPE_EMBEDDING_DIM = 4;

  /** Total node embedding dimension: 384 + 50 + 10 + 4 = 448 */
  export const NODE_EMBEDDING_DIM = PAYEE_EMBEDDING_DIM + ACCOUNT_EMBEDDING_DIM
    + AMOUNT_EMBEDDING_DIM + TYPE_EMBEDDING_DIM;

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
        const typeLabel = tx.transactionType ?? (tx.isCredit ? 'credit' : 'debit');
        const typeId = `type:${typeLabel}`;
        if (!nodes.has(typeId)) {
          nodes.set(typeId, {
            id: typeId,
            type: 'txtype',
            label: typeLabel,
            embedding: this.buildTypeEmbedding(typeLabel),
          });
        }

        // Create edges (payee→account, payee→amount, payee→type)
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
      const typeLabel = input.transactionType ?? (input.isCredit ? 'credit' : 'debit');
      const typeEmb = this.buildTypeEmbedding(typeLabel);
      embedding.set(typeEmb, offset);

      return embedding;
    }

    /**
     * Payee embedding: SHA-256 hash of normalized payee name → 384d float vector.
     * Deterministic: same payee → same embedding.
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
      const bucketIdx = Math.min(
        AMOUNT_EMBEDDING_DIM - 1,
        Math.floor(logAmount),
      );
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
      if (abs < 1000) return 'micro';        // < R10
      if (abs < 10000) return 'small';       // R10-R100
      if (abs < 100000) return 'medium';     // R100-R1000
      if (abs < 1000000) return 'large';     // R1000-R10000
      if (abs < 5000000) return 'xlarge';    // R10000-R50000
      return 'xxlarge';                       // > R50000
    }
  }
  ```

  ### 3. GnnPatternAdapter: Wrapping RuvectorLayer + differentiableSearch
  ```typescript
  // apps/api/src/agents/memory/gnn-pattern-adapter.ts
  import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
  import { RuvectorService } from '../sdk/ruvector.service';
  import { PrismaService } from '../../database/prisma/prisma.service';
  import { GraphBuilder, NODE_EMBEDDING_DIM } from './graph-builder';
  import type {
    GnnPatternInterface,
    GnnLearnInput,
    GnnPredictInput,
    GnnPrediction,
    GnnAdapterConfig,
  } from './interfaces/gnn-pattern.interface';

  /** Injection token for GNN pattern learner */
  export const GNN_PATTERN_TOKEN = 'GNN_PATTERN_LEARNER';

  /** GNN hidden dimension (output of RuvectorLayer) */
  const GNN_HIDDEN_DIM = 256;
  /** GNN attention heads */
  const GNN_ATTENTION_HEADS = 4;

  const DEFAULT_GNN_CONFIG: GnnAdapterConfig = {
    inputDim: NODE_EMBEDDING_DIM,  // 448
    hiddenDim: GNN_HIDDEN_DIM,     // 256
    attentionHeads: GNN_ATTENTION_HEADS, // 4
    searchTemperature: 0.1,
    searchTopK: 5,
    compressThreshold: 10,         // Compress embeddings accessed < 10 times
    ewcLambda: 0.5,               // EWC regularization strength
  };

  @Injectable()
  export class GnnPatternAdapter implements GnnPatternInterface {
    private readonly logger = new Logger(GnnPatternAdapter.name);
    private ruvectorLayer: unknown = null;
    private initialized = false;
    private readonly config: GnnAdapterConfig;
    private readonly graphBuilder: GraphBuilder;

    /** Cache of graph-aware embeddings for differentiable search */
    private readonly embeddingCache: Map<string, Float32Array> = new Map();
    /** Access count for TensorCompress decisions */
    private readonly accessCounts: Map<string, number> = new Map();

    constructor(
      @Optional()
      @Inject(RuvectorService)
      private readonly ruvector?: RuvectorService,
      @Optional()
      @Inject(PrismaService)
      private readonly prisma?: PrismaService,
      config?: Partial<GnnAdapterConfig>,
    ) {
      this.config = { ...DEFAULT_GNN_CONFIG, ...config };
      this.graphBuilder = new GraphBuilder();
    }

    /**
     * Lazy-initialize RuvectorLayer from ruvector.
     */
    private async ensureInitialized(): Promise<boolean> {
      if (this.initialized) return true;

      try {
        const { RuvectorLayer } = await import('ruvector');
        this.ruvectorLayer = new RuvectorLayer(
          this.config.inputDim,   // 448
          this.config.hiddenDim,  // 256
          this.config.attentionHeads, // 4
        );
        this.initialized = true;
        this.logger.log(
          `GNN RuvectorLayer initialized (${this.config.inputDim}→${this.config.hiddenDim}, ${this.config.attentionHeads} heads)`,
        );
        return true;
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`RuvectorLayer initialization failed (non-fatal): ${msg}`);
        return false;
      }
    }

    /**
     * Learn a pattern from a correction.
     * Builds a node embedding, passes it through the GNN layer with neighbor
     * embeddings, and stores the graph-aware embedding for future search.
     *
     * Dual-write: also creates Prisma PayeePattern (source: 'LEARNED_GNN').
     */
    async learnPattern(input: GnnLearnInput): Promise<void> {
      const ready = await this.ensureInitialized();
      if (!ready) {
        this.logger.debug('GNN not available — pattern learning skipped');
        return;
      }

      try {
        // Build node embedding for this transaction
        const nodeEmb = this.graphBuilder.buildNodeEmbedding({
          payeeName: input.payeeName,
          accountCode: input.accountCode,
          accountName: input.accountName,
          amountCents: input.amountCents,
          isCredit: input.isCredit,
        });

        // Get neighbor embeddings (other transactions with same payee or account)
        const neighborEmbs = await this.getNeighborEmbeddings(
          input.tenantId,
          input.payeeName,
          input.accountCode,
        );

        // Build edge weights (confidence-based)
        const edgeWeights = neighborEmbs.map(() => 0.5); // Equal weight for now

        // Forward pass through GNN layer → graph-aware embedding
        const layer = this.ruvectorLayer as any;
        const graphAwareEmb: Float32Array = await layer.forward(
          nodeEmb,
          neighborEmbs,
          new Float32Array(edgeWeights),
        );

        // Cache the graph-aware embedding for differentiable search
        const cacheKey = this.buildCacheKey(input.tenantId, input.payeeName, input.accountCode);
        this.embeddingCache.set(cacheKey, graphAwareEmb);
        this.accessCounts.set(cacheKey, 0);

        this.logger.debug(
          `GNN pattern learned: ${input.payeeName} → ${input.accountCode} ` +
          `(${neighborEmbs.length} neighbors, ${graphAwareEmb.length}d embedding)`,
        );

        // Dual-write: create Prisma PayeePattern with source 'LEARNED_GNN'
        await this.createPrismaPattern(input);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`GNN learnPattern failed (non-fatal): ${msg}`);
      }
    }

    /**
     * Predict account code for a new transaction using differentiable search.
     * Returns null if insufficient data or GNN unavailable.
     */
    async predict(input: GnnPredictInput): Promise<GnnPrediction | null> {
      const ready = await this.ensureInitialized();
      if (!ready || this.embeddingCache.size === 0) return null;

      try {
        // Build query node embedding
        const queryEmb = this.graphBuilder.buildNodeEmbedding({
          payeeName: input.payeeName,
          accountCode: '', // Unknown — this is what we're predicting
          amountCents: input.amountCents,
          isCredit: input.isCredit,
        });

        // Get neighbor embeddings
        const neighborEmbs = await this.getNeighborEmbeddings(
          input.tenantId,
          input.payeeName,
        );

        // Forward pass → graph-aware query embedding
        const layer = this.ruvectorLayer as any;
        const queryGraphEmb: Float32Array = await layer.forward(
          queryEmb,
          neighborEmbs,
          new Float32Array(neighborEmbs.map(() => 0.5)),
        );

        // Differentiable search over cached embeddings
        const { differentiableSearch } = await import('ruvector');
        const candidates = Array.from(this.embeddingCache.entries())
          .filter(([key]) => key.startsWith(`${input.tenantId}:`));

        if (candidates.length === 0) return null;

        const candidateEmbs = candidates.map(([, emb]) => emb);
        const results = differentiableSearch(
          queryGraphEmb,
          candidateEmbs,
          Math.min(this.config.searchTopK, candidates.length),
          this.config.searchTemperature,
        );

        if (!results || results.length === 0) return null;

        // Extract prediction from best match
        const bestIdx = results[0].index;
        const bestKey = candidates[bestIdx][0];
        const parts = bestKey.split(':');
        const accountCode = parts[parts.length - 1];
        const similarity = results[0].score;

        // Update access count
        this.accessCounts.set(bestKey, (this.accessCounts.get(bestKey) ?? 0) + 1);

        // TensorCompress: compress infrequently accessed embeddings
        await this.compressInfrequentEmbeddings();

        return {
          accountCode,
          confidence: Math.round(similarity * 100),
          source: 'LEARNED_GNN',
          neighbors: neighborEmbs.length,
          attentionWeights: results[0].attentionWeights,
        };
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`GNN predict failed: ${msg}`);
        return null;
      }
    }

    /**
     * Apply EWC: store Fisher information after a batch of corrections
     * to prevent catastrophic forgetting of previously learned patterns.
     */
    async consolidateEWC(): Promise<void> {
      if (!this.initialized || !this.ruvectorLayer) return;

      try {
        const layer = this.ruvectorLayer as any;
        if (typeof layer.computeFisherInformation === 'function') {
          await layer.computeFisherInformation();
          this.logger.log('EWC Fisher information consolidated');
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`EWC consolidation failed: ${msg}`);
      }
    }

    /**
     * Get neighbor embeddings for a node (other transactions with same payee or account).
     */
    private async getNeighborEmbeddings(
      tenantId: string,
      payeeName: string,
      accountCode?: string,
    ): Promise<Float32Array[]> {
      const neighbors: Float32Array[] = [];

      // Look up cached embeddings that share this payee or account
      for (const [key, emb] of this.embeddingCache.entries()) {
        if (!key.startsWith(`${tenantId}:`)) continue;

        const normalizedPayee = payeeName.toLowerCase().trim();
        if (key.includes(normalizedPayee) || (accountCode && key.includes(accountCode))) {
          neighbors.push(emb);
          if (neighbors.length >= 10) break; // Cap neighbors
        }
      }

      return neighbors;
    }

    /**
     * Build a cache key for a pattern embedding.
     */
    private buildCacheKey(
      tenantId: string,
      payeeName: string,
      accountCode: string,
    ): string {
      const normalizedPayee = payeeName.toLowerCase().trim();
      return `${tenantId}:${normalizedPayee}:${accountCode}`;
    }

    /**
     * Dual-write: create Prisma PayeePattern with source 'LEARNED_GNN'.
     */
    private async createPrismaPattern(input: GnnLearnInput): Promise<void> {
      if (!this.prisma) return;

      try {
        await this.prisma.payeePattern.upsert({
          where: {
            tenantId_payeePattern: {
              tenantId: input.tenantId,
              payeePattern: input.payeeName.toLowerCase().trim(),
            },
          },
          create: {
            tenantId: input.tenantId,
            payeePattern: input.payeeName.toLowerCase().trim(),
            defaultAccountCode: input.accountCode,
            defaultAccountName: input.accountName ?? input.accountCode,
            source: 'LEARNED_GNN',
            isActive: true,
          },
          update: {
            defaultAccountCode: input.accountCode,
            defaultAccountName: input.accountName ?? input.accountCode,
            source: 'LEARNED_GNN',
          },
        });
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`GNN Prisma pattern upsert failed: ${msg}`);
      }
    }

    /**
     * TensorCompress: compress embeddings that have been accessed fewer than
     * `compressThreshold` times. Uses ruvector's TensorCompress for lossy
     * compression to reduce memory footprint.
     */
    private async compressInfrequentEmbeddings(): Promise<void> {
      try {
        const { TensorCompress } = await import('ruvector');

        for (const [key, count] of this.accessCounts.entries()) {
          if (count < this.config.compressThreshold) {
            const emb = this.embeddingCache.get(key);
            if (emb) {
              const compressed = TensorCompress.compress(emb, 0.5); // 50% compression
              this.embeddingCache.set(key, compressed);
            }
          }
        }
      } catch {
        // TensorCompress not available — skip compression
      }
    }
  }
  ```

  ### 4. GNN Pattern Interfaces
  ```typescript
  // apps/api/src/agents/memory/interfaces/gnn-pattern.interface.ts

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
  ```

  ### 5. Integration into PatternLearner
  ```typescript
  // In apps/api/src/agents/memory/pattern-learner.ts — changes needed:

  // REMOVE: class GnnPatternLearnerStub (lines 26-30)

  // ADD: import
  import { GnnPatternAdapter, GNN_PATTERN_TOKEN } from './gnn-pattern-adapter';
  import type { GnnPatternInterface } from './interfaces/gnn-pattern.interface';

  @Injectable()
  export class PatternLearner {
    private readonly logger = new Logger(PatternLearner.name);
    private readonly gnnAdapter: GnnPatternInterface;

    constructor(
      @Optional()
      @Inject(PrismaService)
      private readonly prisma?: PrismaService,
      @Optional()
      @Inject(RuvectorService)
      private readonly ruvector?: RuvectorService,
      @Optional()
      @Inject(GNN_PATTERN_TOKEN)
      gnnAdapter?: GnnPatternInterface,
    ) {
      // Fallback to no-op when GNN is unavailable
      this.gnnAdapter = gnnAdapter ?? {
        learnPattern: async () => {},
        predict: async () => null,
        consolidateEWC: async () => {},
      };
    }

    // In processCorrection(), replace the stub call:
    // BEFORE (line 91-100):
    //   this.gnnStub.learnPattern({ ... }).catch(...)
    // AFTER:
    //   this.gnnAdapter.learnPattern({ ... }).catch(...)
  }
  ```

  ### 6. Module Registration
  ```typescript
  // apps/api/src/agents/memory/agent-memory.module.ts — additions
  import { GnnPatternAdapter, GNN_PATTERN_TOKEN } from './gnn-pattern-adapter';
  import { GraphBuilder } from './graph-builder';

  @Module({
    imports: [DatabaseModule, SdkAgentModule],
    providers: [
      AgentMemoryService,
      PatternLearner,
      VectorDBReasoningBank,
      { provide: REASONING_BANK_TOKEN, useExisting: VectorDBReasoningBank },
      GraphBuilder,
      GnnPatternAdapter,
      { provide: GNN_PATTERN_TOKEN, useExisting: GnnPatternAdapter },
    ],
    exports: [AgentMemoryService, PatternLearner, GraphBuilder],
  })
  export class AgentMemoryModule {}
  ```

  ### 7. Dual-Write Pattern
  GNN-learned patterns ALSO create Prisma `PayeePattern` records with
  `source: 'LEARNED_GNN'`:
  ```typescript
  // CORRECT: dual-write
  // 1. GNN learns embedding → cache
  // 2. Prisma PayeePattern created with source: 'LEARNED_GNN'

  // This ensures:
  // - GNN patterns work even if ruvector becomes unavailable (Prisma persists)
  // - Existing pattern-matching logic picks up GNN-learned patterns
  // - Source tracking distinguishes GNN-learned from correction-based (source: 'LEARNED')
  ```

  ### 8. Testing Pattern
  ```typescript
  describe('GraphBuilder', () => {
    let builder: GraphBuilder;

    beforeEach(() => {
      builder = new GraphBuilder();
    });

    describe('buildNodeEmbedding', () => {
      it('should produce 448-dimensional embedding', () => {
        const emb = builder.buildNodeEmbedding({
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        });
        expect(emb).toBeInstanceOf(Float32Array);
        expect(emb.length).toBe(448);
      });

      it('should produce deterministic embeddings', () => {
        const input = {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        };
        const emb1 = builder.buildNodeEmbedding(input);
        const emb2 = builder.buildNodeEmbedding(input);
        expect(emb1).toEqual(emb2);
      });

      it('should differentiate by payee name', () => {
        const emb1 = builder.buildNodeEmbedding({
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        });
        const emb2 = builder.buildNodeEmbedding({
          payeeName: 'Pick n Pay',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        });
        expect(emb1).not.toEqual(emb2);
      });

      it('should differentiate by amount bucket', () => {
        const emb1 = builder.buildNodeEmbedding({
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 5000,   // small
          isCredit: false,
        });
        const emb2 = builder.buildNodeEmbedding({
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 5000000, // xxlarge
          isCredit: false,
        });
        expect(emb1).not.toEqual(emb2);
      });

      it('should differentiate by transaction type', () => {
        const emb1 = builder.buildNodeEmbedding({
          payeeName: 'FNB',
          accountCode: '6600',
          amountCents: 5000,
          isCredit: false,
        });
        const emb2 = builder.buildNodeEmbedding({
          payeeName: 'FNB',
          accountCode: '6600',
          amountCents: 5000,
          isCredit: true,
        });
        expect(emb1).not.toEqual(emb2);
      });
    });

    describe('buildGraph', () => {
      it('should create nodes for each unique entity', () => {
        const graph = builder.buildGraph([
          { payeeName: 'Woolworths', accountCode: '5200', amountCents: 250000, isCredit: false },
          { payeeName: 'Woolworths', accountCode: '5200', amountCents: 300000, isCredit: false },
        ]);

        // 1 payee + 1 account + 2 amount buckets (both medium) + 1 type
        // But amounts are similar buckets, so fewer unique nodes
        expect(graph.nodeCount).toBeGreaterThanOrEqual(3);
        expect(graph.edgeCount).toBe(6); // 2 transactions * 3 edges each
      });

      it('should not duplicate nodes for same payee', () => {
        const graph = builder.buildGraph([
          { payeeName: 'Woolworths', accountCode: '5200', amountCents: 250000, isCredit: false },
          { payeeName: 'Woolworths', accountCode: '5300', amountCents: 10000, isCredit: false },
        ]);

        const payeeNodes = graph.nodes.filter(n => n.type === 'payee');
        expect(payeeNodes).toHaveLength(1); // Same payee, one node
      });
    });
  });

  describe('GnnPatternAdapter', () => {
    let adapter: GnnPatternAdapter;
    let mockPrisma: jest.Mocked<PrismaService>;

    beforeEach(() => {
      mockPrisma = {
        payeePattern: {
          upsert: jest.fn().mockResolvedValue({ id: 'pat-1' }),
        },
      } as unknown as jest.Mocked<PrismaService>;

      adapter = new GnnPatternAdapter(undefined, mockPrisma);
    });

    describe('learnPattern', () => {
      it('should not throw when ruvector is unavailable', async () => {
        await expect(
          adapter.learnPattern({
            tenantId: 't1',
            payeeName: 'Woolworths',
            accountCode: '5200',
            amountCents: 250000,
            isCredit: false,
          }),
        ).resolves.not.toThrow();
      });

      it('should create Prisma PayeePattern with source LEARNED_GNN', async () => {
        // Mock the GNN layer
        const mockLayer = {
          forward: jest.fn().mockResolvedValue(new Float32Array(256)),
        };
        (adapter as any).ruvectorLayer = mockLayer;
        (adapter as any).initialized = true;

        await adapter.learnPattern({
          tenantId: 't1',
          payeeName: 'Woolworths',
          accountCode: '5200',
          accountName: 'Food & Catering',
          amountCents: 250000,
          isCredit: false,
        });

        expect(mockPrisma.payeePattern.upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              source: 'LEARNED_GNN',
            }),
          }),
        );
      });
    });

    describe('predict', () => {
      it('should return null when no cached embeddings', async () => {
        const result = await adapter.predict({
          tenantId: 't1',
          payeeName: 'Unknown',
          amountCents: 5000,
          isCredit: false,
        });
        expect(result).toBeNull();
      });
    });

    describe('consolidateEWC', () => {
      it('should not throw when layer is unavailable', async () => {
        await expect(adapter.consolidateEWC()).resolves.not.toThrow();
      });
    });
  });
  ```

  ### 9. Monetary Values
  ALL amounts are in cents (integers):
  ```typescript
  // CORRECT
  amountCents: 250000  // R2,500.00

  // WRONG
  // amount: 2500.00
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks transaction patterns are naturally graph-structured. Payees connect to
  account codes, amounts, and transaction types. The GNN learns from these connections:

  - **New payee variants**: "WW Holdings", "Woolworths Food", "Woolies" all connect
    to account code 5200 → the GNN aggregates neighbor information to understand
    they are related
  - **Amount-sensitive categorization**: Same payee at different amounts may map to
    different codes (e.g., R200 at Pick n Pay = food, R15,000 = bulk supplies)
  - **Transaction type awareness**: Credits from "Parents" are tuition (4000), but
    debits to "Parents" are refunds (different account)

  The threshold-based learning (3+ corrections) remains as the reliable baseline.
  GNN learning is additive — it supplements threshold learning, not replaces it.

  ## SA Compliance Notes
  - All monetary values in cents (integers) — R1,500.00 = 150000
  - Payee patterns are tenant-isolated (POPI Act)
  - GNN-learned patterns are tracked with `source: 'LEARNED_GNN'` for auditability
  - No PII in graph embeddings (payee names are hashed, not stored as cleartext in vectors)

  ## Architectural Decisions
  1. **Dual-write**: GNN patterns also create Prisma PayeePattern (source: 'LEARNED_GNN')
     to ensure persistence even if ruvector is unavailable
  2. **Hash-based payee embeddings**: 384d SHA-256 hash of normalized payee name,
     not neural embeddings. This avoids dependency on the embedding model for graph
     node construction.
  3. **448d node embedding**: Concatenation of payee (384d) + account (50d) + amount
     (10d) + type (4d). The GNN layer reduces this to 256d graph-aware embedding.
  4. **Lazy initialization**: RuvectorLayer is imported dynamically via
     `import('ruvector')` to avoid startup failures
  5. **TensorCompress**: Infrequently accessed embeddings (< 10 accesses) are
     compressed to reduce memory footprint
  6. **EWC**: Elastic Weight Consolidation prevents catastrophic forgetting when
     the GNN learns new patterns
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create `GraphBuilder` class for transaction → graph conversion
    - Create `GnnPatternAdapter` class wrapping RuvectorLayer + differentiableSearch
    - Implement `buildNodeEmbedding()`: payee (384d hash) + account (50d one-hot) + amount (10d log) + type (4d)
    - Implement `buildGraph()`: create nodes and edges from transaction list
    - Implement `learnPattern()`: node embedding → GNN forward → cache graph-aware embedding
    - Implement `predict()`: query embedding → GNN forward → differentiableSearch → top-k results
    - Implement `consolidateEWC()`: Fisher information computation for forgetting prevention
    - Implement TensorCompress for infrequently accessed embeddings
    - Implement dual-write: GNN patterns → Prisma PayeePattern (source: 'LEARNED_GNN')
    - Create all interfaces: TransactionGraphNode, GraphEdge, GnnLearnInput, GnnPrediction, etc.
    - Replace GnnPatternLearnerStub in pattern-learner.ts with GnnPatternAdapter
    - Register GnnPatternAdapter and GraphBuilder in agent-memory.module.ts
    - `@Optional() @Inject()` — falls back to no-op when ruvector unavailable
    - Lazy RuvectorLayer initialization via `import('ruvector')`
    - Unit tests: GraphBuilder (448d embeddings, determinism, differentiation, graph construction)
    - Unit tests: GnnPatternAdapter (learnPattern, predict, EWC, graceful degradation)
    - All existing PatternLearner tests still pass
    - Build succeeds (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
  </in_scope>

  <out_of_scope>
    - Distributed GNN training (batch-only, single process)
    - Online GNN layer weight updates (embedding cache is updated, layer weights are fixed until EWC)
    - Graph visualization or graph analytics
    - Neural payee name normalization (using hash-based approach)
    - Cross-tenant pattern sharing (prohibited by POPI)
    - Production model checkpointing or serialization
    - Real database integration tests (use mocks)
    - Changing the MIN_CORRECTIONS_FOR_PATTERN threshold (3 — keep as-is)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify file structure
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks
ls -la apps/api/src/agents/memory/gnn-pattern-adapter.ts
ls -la apps/api/src/agents/memory/graph-builder.ts
ls -la apps/api/src/agents/memory/interfaces/gnn-pattern.interface.ts
ls -la apps/api/tests/agents/memory/gnn-pattern-adapter.spec.ts
ls -la apps/api/tests/agents/memory/graph-builder.spec.ts

# 2. Build succeeds
cd apps/api && pnpm run build

# 3. Run GNN tests
pnpm test -- --testPathPattern="gnn-pattern-adapter" --runInBand
pnpm test -- --testPathPattern="graph-builder" --runInBand

# 4. Run existing pattern-learner tests (regression check)
pnpm test -- --testPathPattern="pattern-learner" --runInBand

# 5. Run ALL existing tests
pnpm test -- --runInBand

# 6. Lint check
pnpm run lint

# 7. Verify GnnPatternLearnerStub is removed
grep -n "class GnnPatternLearnerStub" apps/api/src/agents/memory/pattern-learner.ts && echo "FAIL: stub present" || echo "PASS: stub removed"

# 8. Verify GnnPatternAdapter implements interface
grep -n "implements GnnPatternInterface" apps/api/src/agents/memory/gnn-pattern-adapter.ts

# 9. Verify NODE_EMBEDDING_DIM = 448
grep "NODE_EMBEDDING_DIM" apps/api/src/agents/memory/graph-builder.ts

# 10. Verify dual-write (LEARNED_GNN source)
grep "LEARNED_GNN" apps/api/src/agents/memory/gnn-pattern-adapter.ts

# 11. Verify no 'any' types in interfaces
grep -rn ": any" apps/api/src/agents/memory/interfaces/gnn-pattern.interface.ts && echo "FAIL" || echo "PASS"

# 12. Verify lazy loading
grep -n "import('ruvector')" apps/api/src/agents/memory/gnn-pattern-adapter.ts

# 13. Verify module registration
grep "GnnPatternAdapter" apps/api/src/agents/memory/agent-memory.module.ts
grep "GraphBuilder" apps/api/src/agents/memory/agent-memory.module.ts

# 14. Verify @Optional() @Inject() pattern
grep -n "@Optional()" apps/api/src/agents/memory/gnn-pattern-adapter.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `GraphBuilder` class created with `buildNodeEmbedding()` and `buildGraph()` methods
  - [ ] `buildNodeEmbedding()` produces 448-dimensional Float32Array (384 payee + 50 account + 10 amount + 4 type)
  - [ ] `buildNodeEmbedding()` is deterministic (same input → same output)
  - [ ] `buildNodeEmbedding()` differentiates by payee name, account code, amount, and type
  - [ ] `buildGraph()` creates unique nodes for each entity and edges linking transaction components
  - [ ] `buildGraph()` deduplicates nodes (same payee → one node)
  - [ ] Payee embedding: SHA-256 hash of normalized name → 384d float vector in [-1, 1]
  - [ ] Account embedding: one-hot-ish encoding with hash-based secondary signal → 50d
  - [ ] Amount embedding: log-scale encoding with soft neighbor activation → 10d
  - [ ] Type embedding: one-hot encoding (debit/credit/reversal/fee) → 4d
  - [ ] `NODE_EMBEDDING_DIM = 448` exported constant
  - [ ] `GnnPatternAdapter` class created implementing `GnnPatternInterface`
  - [ ] `GnnPatternAdapter.learnPattern()` builds node embedding → GNN forward → caches graph-aware embedding
  - [ ] `GnnPatternAdapter.learnPattern()` creates Prisma PayeePattern with `source: 'LEARNED_GNN'` (dual-write)
  - [ ] `GnnPatternAdapter.learnPattern()` is non-blocking — errors caught and logged
  - [ ] `GnnPatternAdapter.learnPattern()` gracefully degrades when ruvector unavailable
  - [ ] `GnnPatternAdapter.predict()` builds query embedding → GNN forward → differentiableSearch → returns prediction
  - [ ] `GnnPatternAdapter.predict()` returns `null` when no cached embeddings or GNN unavailable
  - [ ] `GnnPatternAdapter.predict()` uses configurable temperature (0.1 default) and topK (5 default)
  - [ ] `GnnPatternAdapter.consolidateEWC()` delegates to RuvectorLayer Fisher information computation
  - [ ] `GnnPatternAdapter.consolidateEWC()` is safe to call when layer unavailable
  - [ ] TensorCompress: embeddings accessed < `compressThreshold` times are compressed
  - [ ] RuvectorLayer: `new RuvectorLayer(448, 256, 4)` — 448 input, 256 hidden, 4 attention heads
  - [ ] RuvectorLayer is lazy-loaded via `import('ruvector')` (not top-level)
  - [ ] `GNN_PATTERN_TOKEN` injection token exported
  - [ ] `GnnPatternLearnerStub` class REMOVED from `pattern-learner.ts`
  - [ ] `PatternLearner` constructor accepts `@Optional() @Inject(GNN_PATTERN_TOKEN)` parameter
  - [ ] `PatternLearner` falls back to no-op when GNN unavailable
  - [ ] `PatternLearner.processCorrection()` calls `gnnAdapter.learnPattern()` (fire-and-forget)
  - [ ] `agent-memory.module.ts` registers `GnnPatternAdapter`, `GraphBuilder`, and `GNN_PATTERN_TOKEN`
  - [ ] All interfaces created: `TransactionGraphNode`, `TransactionGraphEdge`, `TransactionGraph`,
        `NodeEmbeddingInput`, `GnnLearnInput`, `GnnPredictInput`, `GnnPrediction`, `GnnAdapterConfig`, `GnnPatternInterface`
  - [ ] All existing `PatternLearner` tests still pass (zero regressions)
  - [ ] Unit tests: GraphBuilder — 448d embeddings, determinism, payee/amount/type differentiation, graph construction, deduplication
  - [ ] Unit tests: GnnPatternAdapter — learnPattern (GNN forward + cache + Prisma), predict (differentiableSearch), EWC, graceful degradation
  - [ ] Test coverage >= 90% for new files
  - [ ] Zero `any` types in interface files
  - [ ] Build succeeds with 0 errors (`pnpm run build`)
  - [ ] Lint passes with 0 errors (`pnpm run lint`)
  - [ ] All existing tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER remove the threshold-based learning** (3+ corrections → PayeePattern). GNN learning is ADDITIVE, not replacement.
  - **NEVER use `any` type** — use proper TypeScript interfaces from `gnn-pattern.interface.ts`
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER use a top-level `import` for ruvector** — use `import('ruvector')` lazy loading
  - **NEVER block the correction flow on GNN operations** — all GNN calls use `.catch()` fire-and-forget
  - **NEVER share GNN embeddings across tenants** — cache keys include `tenantId` prefix
  - **NEVER store PII in graph embeddings** — payee names are hashed to 384d vectors, not stored as cleartext
  - **NEVER modify `MIN_CORRECTIONS_FOR_PATTERN`** (3) — it is a business rule
  - **NEVER use floating-point for monetary values** — always integer cents
  - **NEVER skip the dual-write** — GNN-learned patterns MUST also create Prisma PayeePattern with `source: 'LEARNED_GNN'`
  - **NEVER make real API calls in tests** — always mock RuvectorLayer, differentiableSearch, and PrismaService
  - **NEVER use neural embedding models for graph node construction** — use hash-based approach for determinism and zero external dependencies
  - **NEVER create global (non-tenant-scoped) patterns** — all patterns are tenant-isolated
  - **NEVER change the existing `processCorrection()` return type** — it still returns `PatternLearnResult`
  - **NEVER train the GNN layer online during prediction** — learn during corrections, predict with fixed weights
  - **NEVER ignore EWC consolidation** — call `consolidateEWC()` after batch corrections to prevent forgetting
</anti_patterns>

</task_spec>

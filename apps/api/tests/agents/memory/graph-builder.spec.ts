/**
 * GraphBuilder Tests
 * TASK-STUB-007: GNN Pattern Learner Integration
 *
 * Tests transaction-to-graph conversion, node embedding construction,
 * determinism, differentiation by payee/amount/type, and graph deduplication.
 */

import {
  GraphBuilder,
  NODE_EMBEDDING_DIM,
} from '../../../src/agents/memory/graph-builder';

describe('GraphBuilder', () => {
  let builder: GraphBuilder;

  beforeEach(() => {
    builder = new GraphBuilder();
  });

  describe('NODE_EMBEDDING_DIM', () => {
    it('should be 448 (384 payee + 50 account + 10 amount + 4 type)', () => {
      expect(NODE_EMBEDDING_DIM).toBe(448);
    });
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

    it('should differentiate by account code', () => {
      const emb1 = builder.buildNodeEmbedding({
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });
      const emb2 = builder.buildNodeEmbedding({
        payeeName: 'Woolworths',
        accountCode: '5300',
        amountCents: 250000,
        isCredit: false,
      });
      expect(emb1).not.toEqual(emb2);
    });

    it('should differentiate by amount bucket', () => {
      const emb1 = builder.buildNodeEmbedding({
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 5000, // small
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

    it('should handle explicit transactionType over isCredit', () => {
      const emb1 = builder.buildNodeEmbedding({
        payeeName: 'FNB',
        accountCode: '6600',
        amountCents: 5000,
        isCredit: false,
        transactionType: 'reversal',
      });
      const emb2 = builder.buildNodeEmbedding({
        payeeName: 'FNB',
        accountCode: '6600',
        amountCents: 5000,
        isCredit: false,
        transactionType: 'fee',
      });
      expect(emb1).not.toEqual(emb2);
    });

    it('should produce values within [-1, 1] range for payee component', () => {
      const emb = builder.buildNodeEmbedding({
        payeeName: 'Test Payee',
        accountCode: '5200',
        amountCents: 100000,
        isCredit: false,
      });

      // Check first 384 values (payee component) are in [-1, 1]
      for (let i = 0; i < 384; i++) {
        expect(emb[i]).toBeGreaterThanOrEqual(-1);
        expect(emb[i]).toBeLessThanOrEqual(1);
      }
    });

    it('should normalize payee name for consistency', () => {
      const emb1 = builder.buildNodeEmbedding({
        payeeName: 'Woolworths',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });
      const emb2 = builder.buildNodeEmbedding({
        payeeName: '  woolworths  ',
        accountCode: '5200',
        amountCents: 250000,
        isCredit: false,
      });
      expect(emb1).toEqual(emb2);
    });

    it('should handle zero amount', () => {
      const emb = builder.buildNodeEmbedding({
        payeeName: 'Zero',
        accountCode: '5200',
        amountCents: 0,
        isCredit: false,
      });
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(448);
    });

    it('should handle negative amounts', () => {
      const emb = builder.buildNodeEmbedding({
        payeeName: 'Refund',
        accountCode: '5200',
        amountCents: -50000,
        isCredit: true,
      });
      expect(emb).toBeInstanceOf(Float32Array);
      expect(emb.length).toBe(448);
    });
  });

  describe('buildGraph', () => {
    it('should create nodes for each unique entity', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        },
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 300000,
          isCredit: false,
        },
      ]);

      // 1 payee + 1 account + amount buckets (both medium) + 1 type = at least 3
      expect(graph.nodeCount).toBeGreaterThanOrEqual(3);
      expect(graph.edgeCount).toBe(6); // 2 transactions * 3 edges each
    });

    it('should not duplicate nodes for same payee', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        },
        {
          payeeName: 'Woolworths',
          accountCode: '5300',
          amountCents: 10000,
          isCredit: false,
        },
      ]);

      const payeeNodes = graph.nodes.filter((n) => n.type === 'payee');
      expect(payeeNodes).toHaveLength(1); // Same payee, one node
    });

    it('should create separate nodes for different payees', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        },
        {
          payeeName: 'Pick n Pay',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        },
      ]);

      const payeeNodes = graph.nodes.filter((n) => n.type === 'payee');
      expect(payeeNodes).toHaveLength(2);
    });

    it('should create separate nodes for different account codes', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
        },
        {
          payeeName: 'Woolworths',
          accountCode: '5300',
          amountCents: 250000,
          isCredit: false,
        },
      ]);

      const accountNodes = graph.nodes.filter((n) => n.type === 'account');
      expect(accountNodes).toHaveLength(2);
    });

    it('should handle empty transaction list', () => {
      const graph = builder.buildGraph([]);
      expect(graph.nodeCount).toBe(0);
      expect(graph.edgeCount).toBe(0);
      expect(graph.nodes).toHaveLength(0);
      expect(graph.edges).toHaveLength(0);
    });

    it('should use confidence-based edge weights', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Woolworths',
          accountCode: '5200',
          amountCents: 250000,
          isCredit: false,
          confidence: 90,
        },
      ]);

      // First edge (payee->account) should have weight = 90/100 = 0.9
      const payeeToAccountEdge = graph.edges[0];
      expect(payeeToAccountEdge.weight).toBe(0.9);

      // Other edges should have default weight 0.5
      expect(graph.edges[1].weight).toBe(0.5);
      expect(graph.edges[2].weight).toBe(0.5);
    });

    it('should create edges linking payee to account, amount, and type', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Eskom',
          accountCode: '6100',
          amountCents: 500000,
          isCredit: false,
        },
      ]);

      expect(graph.edges).toHaveLength(3);
      expect(graph.edges[0].source).toBe('payee:eskom');
      expect(graph.edges[0].target).toBe('account:6100');
      expect(graph.edges[1].source).toBe('payee:eskom');
      expect(graph.edges[1].target).toMatch(/^amount:/);
      expect(graph.edges[2].source).toBe('payee:eskom');
      expect(graph.edges[2].target).toBe('type:debit');
    });

    it('should embed all node types with Float32Array', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'Test',
          accountCode: '5200',
          amountCents: 100000,
          isCredit: false,
        },
      ]);

      for (const node of graph.nodes) {
        expect(node.embedding).toBeInstanceOf(Float32Array);
        expect(node.embedding.length).toBeGreaterThan(0);
      }
    });

    it('should set correct nodeCount and edgeCount', () => {
      const graph = builder.buildGraph([
        {
          payeeName: 'A',
          accountCode: '5200',
          amountCents: 100000,
          isCredit: false,
        },
        {
          payeeName: 'B',
          accountCode: '5300',
          amountCents: 200000,
          isCredit: true,
        },
      ]);

      expect(graph.nodeCount).toBe(graph.nodes.length);
      expect(graph.edgeCount).toBe(graph.edges.length);
    });
  });
});

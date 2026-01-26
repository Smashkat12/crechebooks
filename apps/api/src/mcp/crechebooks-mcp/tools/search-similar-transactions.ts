/**
 * Search Similar Transactions Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Semantic search using RuvectorService for vector similarity.
 * Sanitizes input (strips PII). Only registered when ruvector is available.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import { RuvectorService } from '../../../agents/sdk/ruvector.service';
import type {
  McpToolDefinition,
  McpToolResult,
  SearchSimilarTransactionsInput,
  SimilarTransactionRecord,
} from '../types/index';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_MIN_SIMILARITY = 0.5;

/**
 * Sanitize input text by stripping potential PII patterns.
 * Removes email addresses, phone numbers, ID numbers, and bank account patterns.
 */
export function sanitizeSearchInput(text: string): string {
  let sanitized = text;

  // Strip email addresses
  sanitized = sanitized.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    '[REDACTED_EMAIL]',
  );

  // Strip SA ID numbers (13 digits) - must run before phone/account patterns
  sanitized = sanitized.replace(/\b\d{13}\b/g, '[REDACTED_ID]');

  // Strip bank account numbers (8-12 digits) - must run before phone patterns
  sanitized = sanitized.replace(/\b\d{8,12}\b/g, '[REDACTED_ACCOUNT]');

  // Strip phone numbers (various formats with separators)
  sanitized = sanitized.replace(
    /(\+?\d{1,3}[-.\s])?\(?\d{2,4}\)?[-.\s]\d{3,4}[-.\s]?\d{3,4}/g,
    '[REDACTED_PHONE]',
  );

  return sanitized.trim();
}

export function searchSimilarTransactions(
  prisma: PrismaService,
  ruvector: RuvectorService,
): McpToolDefinition<
  SearchSimilarTransactionsInput,
  McpToolResult<SimilarTransactionRecord[]>
> {
  return {
    name: 'search_similar_transactions',
    description:
      'Search for transactions with similar descriptions using semantic vector search. Input is sanitized to strip PII before embedding generation. Requires ruvector to be available.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        description: {
          type: 'string',
          description:
            'Transaction description to search for similar matches. PII will be automatically stripped.',
        },
        minSimilarity: {
          type: 'number',
          description: `Minimum similarity score (0-1, default: ${String(DEFAULT_MIN_SIMILARITY)})`,
          minimum: 0,
          maximum: 1,
          default: DEFAULT_MIN_SIMILARITY,
        },
        limit: {
          type: 'number',
          description: `Maximum results (default: ${String(DEFAULT_LIMIT)}, max: ${String(MAX_LIMIT)})`,
          minimum: 1,
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
        },
      },
      required: ['tenantId', 'description'],
    },
    handler: async (
      args: SearchSimilarTransactionsInput,
    ): Promise<McpToolResult<SimilarTransactionRecord[]>> => {
      const startTime = Date.now();
      const effectiveLimit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
      const minSimilarity = args.minSimilarity ?? DEFAULT_MIN_SIMILARITY;

      try {
        // Sanitize search input to remove PII
        const sanitizedDescription = sanitizeSearchInput(args.description);

        if (!sanitizedDescription || sanitizedDescription.length === 0) {
          return {
            success: false,
            error: 'Description is empty after PII sanitization',
            metadata: {
              toolName: 'search_similar_transactions',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Generate embedding for the search query
        const embedding =
          await ruvector.generateEmbedding(sanitizedDescription);

        // Search for similar vectors
        const searchResults = await ruvector.searchSimilar(
          embedding,
          'transactions',
          effectiveLimit * 2, // Fetch extra to account for tenant filtering and similarity threshold
        );

        // Filter by similarity threshold
        const filteredResults = searchResults.filter(
          (r) => r.score >= minSimilarity,
        );

        // Get transaction IDs from results
        const transactionIds = filteredResults.map((r) => r.id);

        if (transactionIds.length === 0) {
          return {
            success: true,
            data: [],
            metadata: {
              toolName: 'search_similar_transactions',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
              resultCount: 0,
            },
          };
        }

        // Fetch transactions with tenant isolation
        const transactions = await prisma.transaction.findMany({
          where: {
            id: { in: transactionIds },
            tenantId: args.tenantId,
            isDeleted: false,
          },
          select: {
            id: true,
            date: true,
            description: true,
            payeeName: true,
            amountCents: true,
            isCredit: true,
          },
        });

        // Create a lookup map for scores
        const scoreMap = new Map<string, number>();
        for (const result of filteredResults) {
          scoreMap.set(result.id, result.score);
        }

        // Map to output records with similarity scores, sorted by score desc
        const data: SimilarTransactionRecord[] = transactions
          .map((tx) => ({
            id: tx.id,
            date: tx.date.toISOString(),
            description: tx.description,
            payeeName: tx.payeeName,
            amountCents: tx.amountCents,
            isCredit: tx.isCredit,
            similarityScore: scoreMap.get(tx.id) ?? 0,
          }))
          .sort((a, b) => b.similarityScore - a.similarityScore)
          .slice(0, effectiveLimit);

        return {
          success: true,
          data,
          metadata: {
            toolName: 'search_similar_transactions',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: data.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to search similar transactions: ${errorMessage}`,
          metadata: {
            toolName: 'search_similar_transactions',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

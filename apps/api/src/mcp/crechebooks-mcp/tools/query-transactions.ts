/**
 * Query Transactions Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Queries Transaction model with latest categorization.
 * Uses REAL fields: date (not transactionDate), includes categorizations.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  CategorizationSource,
  ImportSource,
  LatestCategorization,
  McpToolDefinition,
  McpToolResult,
  QueryTransactionsInput,
  TransactionRecord,
  TransactionStatus,
  VatType,
} from '../types/index';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function queryTransactions(
  prisma: PrismaService,
): McpToolDefinition<
  QueryTransactionsInput,
  McpToolResult<TransactionRecord[]>
> {
  return {
    name: 'query_transactions',
    description:
      'Query bank transactions for a tenant with optional filters. Returns transactions with their latest categorization (account code, confidence, VAT type). Supports date range, status, credit/debit, payee name, and amount filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        fromDate: {
          type: 'string',
          description: 'Start date filter (ISO date string, inclusive)',
        },
        toDate: {
          type: 'string',
          description: 'End date filter (ISO date string, inclusive)',
        },
        status: {
          type: 'string',
          description: 'Filter by transaction status',
          enum: ['PENDING', 'CATEGORIZED', 'REVIEW_REQUIRED', 'SYNCED'],
        },
        isCredit: {
          type: 'string',
          description: 'Filter by credit (true) or debit (false)',
          enum: ['true', 'false'],
        },
        payeeName: {
          type: 'string',
          description:
            'Filter by payee name (case-insensitive substring match)',
        },
        minAmountCents: {
          type: 'number',
          description: 'Minimum transaction amount in cents (absolute value)',
          minimum: 0,
        },
        maxAmountCents: {
          type: 'number',
          description: 'Maximum transaction amount in cents (absolute value)',
          minimum: 0,
        },
        limit: {
          type: 'number',
          description: `Maximum number of results (default: ${String(DEFAULT_LIMIT)}, max: ${String(MAX_LIMIT)})`,
          minimum: 1,
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: QueryTransactionsInput,
    ): Promise<McpToolResult<TransactionRecord[]>> => {
      const startTime = Date.now();
      const effectiveLimit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

      try {
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
          isDeleted: false,
        };

        if (args.status) {
          where.status = args.status;
        }

        if (args.isCredit !== undefined) {
          where.isCredit = args.isCredit;
        }

        if (args.payeeName) {
          where.payeeName = {
            contains: args.payeeName,
            mode: 'insensitive',
          };
        }

        // Date filter on `date` field
        if (args.fromDate || args.toDate) {
          const dateFilter: Record<string, Date> = {};
          if (args.fromDate) {
            dateFilter.gte = new Date(args.fromDate);
          }
          if (args.toDate) {
            dateFilter.lte = new Date(args.toDate);
          }
          where.date = dateFilter;
        }

        // Amount filter on amountCents
        if (
          args.minAmountCents !== undefined ||
          args.maxAmountCents !== undefined
        ) {
          const amountFilter: Record<string, number> = {};
          if (args.minAmountCents !== undefined) {
            amountFilter.gte = args.minAmountCents;
          }
          if (args.maxAmountCents !== undefined) {
            amountFilter.lte = args.maxAmountCents;
          }
          where.amountCents = amountFilter;
        }

        const transactions = await prisma.transaction.findMany({
          where,
          include: {
            categorizations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          take: effectiveLimit,
          orderBy: { date: 'desc' },
        });

        const data: TransactionRecord[] = transactions.map((tx) => {
          const latestCat = tx.categorizations[0];
          const latestCategorization: LatestCategorization | null = latestCat
            ? {
                accountCode: latestCat.accountCode,
                accountName: latestCat.accountName,
                confidenceScore: Number(latestCat.confidenceScore),
                vatType: latestCat.vatType as VatType,
                source: latestCat.source as CategorizationSource,
              }
            : null;

          return {
            id: tx.id,
            date: tx.date.toISOString(),
            description: tx.description,
            payeeName: tx.payeeName,
            amountCents: tx.amountCents,
            isCredit: tx.isCredit,
            status: tx.status as TransactionStatus,
            source: tx.source as ImportSource,
            isReconciled: tx.isReconciled,
            xeroAccountCode: tx.xeroAccountCode,
            latestCategorization,
          };
        });

        return {
          success: true,
          data,
          metadata: {
            toolName: 'query_transactions',
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
          error: `Failed to query transactions: ${errorMessage}`,
          metadata: {
            toolName: 'query_transactions',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

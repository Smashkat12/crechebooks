/**
 * Get Categorization History Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Queries Categorization joined with Transaction.
 * Tenant isolation via transaction.tenantId (Categorization has no direct tenantId).
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  CategorizationSource,
  GetHistoryInput,
  HistoryRecord,
  McpToolDefinition,
  McpToolResult,
  VatType,
} from '../types/index';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getHistory(
  prisma: PrismaService,
): McpToolDefinition<GetHistoryInput, McpToolResult<HistoryRecord[]>> {
  return {
    name: 'get_history',
    description:
      'Retrieve categorization history for a tenant. Shows how transactions were categorized, including account codes, confidence scores, VAT types, and source (AI vs manual). Tenant isolation enforced via the transaction relation.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        accountCode: {
          type: 'string',
          description: 'Filter by account code (exact match)',
        },
        payeeName: {
          type: 'string',
          description:
            'Filter by transaction payee name (case-insensitive substring match)',
        },
        fromDate: {
          type: 'string',
          description: 'Start date filter (ISO date string, inclusive)',
        },
        toDate: {
          type: 'string',
          description: 'End date filter (ISO date string, inclusive)',
        },
        source: {
          type: 'string',
          description: 'Filter by categorization source',
          enum: ['AI_AUTO', 'AI_SUGGESTED', 'USER_OVERRIDE', 'RULE_BASED'],
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
      args: GetHistoryInput,
    ): Promise<McpToolResult<HistoryRecord[]>> => {
      const startTime = Date.now();
      const effectiveLimit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

      try {
        // Build transaction-level where clause for tenant isolation
        const transactionWhere: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (args.payeeName) {
          transactionWhere.payeeName = {
            contains: args.payeeName,
            mode: 'insensitive',
          };
        }

        // Date filter on transaction.date
        if (args.fromDate || args.toDate) {
          const dateFilter: Record<string, Date> = {};
          if (args.fromDate) {
            dateFilter.gte = new Date(args.fromDate);
          }
          if (args.toDate) {
            dateFilter.lte = new Date(args.toDate);
          }
          transactionWhere.date = dateFilter;
        }

        // Build categorization-level where clause
        const where: Record<string, unknown> = {
          transaction: transactionWhere,
        };

        if (args.accountCode) {
          where.accountCode = args.accountCode;
        }

        if (args.source) {
          where.source = args.source;
        }

        const categorizations = await prisma.categorization.findMany({
          where,
          include: {
            transaction: {
              select: {
                description: true,
                payeeName: true,
                amountCents: true,
                isCredit: true,
              },
            },
          },
          take: effectiveLimit,
          orderBy: { createdAt: 'desc' },
        });

        const data: HistoryRecord[] = categorizations.map((c) => ({
          id: c.id,
          accountCode: c.accountCode,
          accountName: c.accountName,
          confidenceScore: Number(c.confidenceScore),
          source: c.source as CategorizationSource,
          vatType: c.vatType as VatType,
          transactionDescription: c.transaction.description,
          transactionPayeeName: c.transaction.payeeName,
          transactionAmountCents: c.transaction.amountCents,
          transactionIsCredit: c.transaction.isCredit,
          createdAt: c.createdAt.toISOString(),
        }));

        return {
          success: true,
          data,
          metadata: {
            toolName: 'get_history',
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
          error: `Failed to fetch categorization history: ${errorMessage}`,
          metadata: {
            toolName: 'get_history',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Get Patterns Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Queries PayeePattern table with tenant isolation.
 * Supports filtering by payee name (case-insensitive) and minimum confidence boost.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  GetPatternsInput,
  McpToolDefinition,
  McpToolResult,
  PatternRecord,
} from '../types/index';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getPatterns(
  prisma: PrismaService,
): McpToolDefinition<GetPatternsInput, McpToolResult<PatternRecord[]>> {
  return {
    name: 'get_patterns',
    description:
      'Retrieve payee patterns for a tenant. Patterns map payee names to default account codes and provide confidence boosts for categorization. Supports filtering by payee name (case-insensitive substring match) and minimum confidence boost.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        payeeName: {
          type: 'string',
          description:
            'Optional payee name filter. Matches against payeePattern field using case-insensitive substring.',
        },
        minConfidence: {
          type: 'number',
          description:
            'Minimum confidence boost value to filter by (0-100). Maps to confidenceBoost field.',
          minimum: 0,
          maximum: 100,
        },
        limit: {
          type: 'number',
          description: `Maximum number of results to return (default: ${String(DEFAULT_LIMIT)}, max: ${String(MAX_LIMIT)})`,
          minimum: 1,
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: GetPatternsInput,
    ): Promise<McpToolResult<PatternRecord[]>> => {
      const startTime = Date.now();
      const effectiveLimit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

      try {
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
        };

        if (args.payeeName) {
          where.payeePattern = {
            contains: args.payeeName,
            mode: 'insensitive',
          };
        }

        if (args.minConfidence !== undefined) {
          where.confidenceBoost = {
            gte: args.minConfidence,
          };
        }

        const patterns = await prisma.payeePattern.findMany({
          where,
          take: effectiveLimit,
          orderBy: { matchCount: 'desc' },
        });

        const data: PatternRecord[] = patterns.map((p) => ({
          id: p.id,
          payeePattern: p.payeePattern,
          payeeAliases: p.payeeAliases,
          defaultAccountCode: p.defaultAccountCode,
          defaultAccountName: p.defaultAccountName,
          confidenceBoost: Number(p.confidenceBoost),
          matchCount: p.matchCount,
          isRecurring: p.isRecurring,
          expectedAmountCents: p.expectedAmountCents,
        }));

        return {
          success: true,
          data,
          metadata: {
            toolName: 'get_patterns',
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
          error: `Failed to fetch patterns: ${errorMessage}`,
          metadata: {
            toolName: 'get_patterns',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

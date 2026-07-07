/**
 * list_transactions tool
 *
 * Lists bank transactions for the current tenant, optionally filtered by
 * status. The categorizer uses this to inspect recent transactions.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

const VALID_STATUSES = [
  'PENDING',
  'CATEGORIZED',
  'REVIEW_REQUIRED',
  'SYNCED',
] as const;
type TransactionStatus = (typeof VALID_STATUSES)[number];

interface ListTransactionsInput {
  status?: string;
  limit?: number;
}

export const listTransactionsTool: AgentTool = {
  name: 'list_transactions',
  description:
    'List bank transactions for the current tenant. Optional status filter (PENDING | CATEGORIZED | REVIEW_REQUIRED | SYNCED). Returns most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: VALID_STATUSES as unknown as string[],
        description:
          'Optional transaction status (PENDING | CATEGORIZED | REVIEW_REQUIRED | SYNCED).',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 100,
        description: 'Max rows (default 25, cap 100).',
      },
    },
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as ListTransactionsInput;
    const limit = clampLimit(input.limit);
    const status = normaliseStatus(input.status);

    const rows = await ctx.prisma.transaction.findMany({
      where: {
        tenantId: ctx.tenantId,
        isDeleted: false,
        ...(status ? { status } : {}),
      },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        date: true,
        description: true,
        payeeName: true,
        reference: true,
        amountCents: true,
        isCredit: true,
        status: true,
        bankAccount: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: rows.length,
      transactions: rows.map((t) => ({
        id: t.id,
        date: t.date.toISOString().slice(0, 10),
        description: t.description,
        payeeName: t.payeeName,
        reference: t.reference,
        amountCents: t.amountCents,
        isCredit: t.isCredit,
        status: t.status,
        bankAccount: t.bankAccount,
      })),
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

function normaliseStatus(
  raw: string | undefined,
): TransactionStatus | undefined {
  if (raw == null) return undefined;
  const upper = raw.toUpperCase().trim();
  if ((VALID_STATUSES as readonly string[]).includes(upper)) {
    return upper as TransactionStatus;
  }
  throw new AgentToolError(
    `unknown transaction status "${raw}". Valid: ${VALID_STATUSES.join(', ')}.`,
    'INVALID_INPUT',
  );
}

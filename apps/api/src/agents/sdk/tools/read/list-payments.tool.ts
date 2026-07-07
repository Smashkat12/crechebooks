/**
 * list_payments tool
 *
 * Lists payments (invoice allocations) for the current tenant. Optional filter
 * by who created the allocation — AI matcher vs. a human user.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

const VALID_MATCHED_BY = ['AI_AUTO', 'USER'] as const;
type MatchedBy = (typeof VALID_MATCHED_BY)[number];

interface ListPaymentsInput {
  matchedBy?: string;
  limit?: number;
}

export const listPaymentsTool: AgentTool = {
  name: 'list_payments',
  description:
    'List invoice-payment allocations for the current tenant. Optional matchedBy filter (AI_AUTO | USER) narrows the source. Returns most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      matchedBy: {
        type: 'string',
        enum: VALID_MATCHED_BY as unknown as string[],
        description:
          'Filter by allocation source: AI_AUTO (matcher agent) or USER (human).',
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
    const input = rawInput as unknown as ListPaymentsInput;
    const limit = clampLimit(input.limit);
    const matchedBy = normaliseMatchedBy(input.matchedBy);

    const payments = await ctx.prisma.payment.findMany({
      where: {
        tenantId: ctx.tenantId,
        isReversed: false,
        deletedAt: null,
        ...(matchedBy ? { matchedBy } : {}),
      },
      orderBy: { paymentDate: 'desc' },
      take: limit,
      select: {
        id: true,
        invoiceId: true,
        transactionId: true,
        amountCents: true,
        paymentDate: true,
        reference: true,
        matchType: true,
        matchedBy: true,
        matchConfidence: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: payments.length,
      payments: payments.map((p) => ({
        id: p.id,
        invoiceId: p.invoiceId,
        transactionId: p.transactionId,
        amountCents: p.amountCents,
        paymentDate: p.paymentDate.toISOString().slice(0, 10),
        reference: p.reference,
        matchType: p.matchType,
        matchedBy: p.matchedBy,
        matchConfidence:
          p.matchConfidence == null ? null : Number(p.matchConfidence),
      })),
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

function normaliseMatchedBy(raw: string | undefined): MatchedBy | undefined {
  if (raw == null) return undefined;
  const upper = raw.toUpperCase().trim();
  if ((VALID_MATCHED_BY as readonly string[]).includes(upper)) {
    return upper as MatchedBy;
  }
  throw new AgentToolError(
    `unknown matchedBy "${raw}". Valid: ${VALID_MATCHED_BY.join(', ')}.`,
    'INVALID_INPUT',
  );
}

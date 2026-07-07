/**
 * run_payment_matching tool
 *
 * Preview-default. Scans unmatched credit transactions and finds candidate
 * invoices by exact amount + reference substring. Reports candidates without
 * writing. With confirm=true, records the AI's intent to run matching in the
 * audit log — but does NOT bypass the real PaymentMatchingService (fee-adjusted,
 * split, and confidence-scored). The real matcher runs via POST /api/v1/payments/match.
 *
 * Guardrails:
 *   - Tenant-scoped.
 *   - No writes to invoice/payment tables in this tool. Delegates to the real
 *     matching endpoint on confirm.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

interface RunPaymentMatchingInput {
  minConfidence?: number;
  limit?: number;
  confirm?: boolean;
}

interface Candidate {
  transactionId: string;
  invoiceId: string;
  amountCents: number;
  matchReason: string;
}

export const runPaymentMatchingTool: AgentTool = {
  name: 'run_payment_matching',
  description:
    'Preview candidate transaction→invoice matches (by exact amount + reference substring). With confirm=true, audit-logs the run request. Never bypasses the real matcher — delegates to POST /api/v1/payments/match.',
  mutation: true,
  inputSchema: {
    type: 'object',
    properties: {
      minConfidence: {
        type: 'number',
        minimum: 0,
        maximum: 1,
        description:
          'Optional confidence floor (0..1) forwarded to the real matcher.',
      },
      limit: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'Max candidates to return in the preview (default 10).',
      },
      confirm: {
        type: 'boolean',
        description:
          'true audit-logs the intent to run matching. Default false returns preview candidates only.',
      },
    },
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as RunPaymentMatchingInput;
    const limit = clampLimit(input.limit ?? 10);
    const confirm = input.confirm === true;
    const minConfidence = validateMinConfidence(input.minConfidence);

    // Find recent credit transactions with no linked Payment (unallocated).
    const candidates = await ctx.prisma.transaction.findMany({
      where: {
        tenantId: ctx.tenantId,
        isDeleted: false,
        isCredit: true,
        payments: { none: {} },
      },
      orderBy: { date: 'desc' },
      take: limit,
      select: {
        id: true,
        amountCents: true,
        reference: true,
        payeeName: true,
        date: true,
      },
    });

    // For each, look up open invoices with the same total.
    const proposals: Candidate[] = [];
    for (const tx of candidates) {
      const invoices = await ctx.prisma.invoice.findMany({
        where: {
          tenantId: ctx.tenantId,
          isDeleted: false,
          status: {
            in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE', 'DRAFT'],
          },
          totalCents: tx.amountCents,
          amountPaidCents: 0,
        },
        take: 3,
        select: { id: true, invoiceNumber: true, parentId: true },
      });

      for (const inv of invoices) {
        const referenceHit =
          tx.reference != null &&
          inv.invoiceNumber.length > 0 &&
          tx.reference.toUpperCase().includes(inv.invoiceNumber.toUpperCase());
        proposals.push({
          transactionId: tx.id,
          invoiceId: inv.id,
          amountCents: tx.amountCents,
          matchReason: referenceHit ? 'EXACT_AMOUNT+REFERENCE' : 'EXACT_AMOUNT',
        });
      }
    }

    if (!confirm) {
      return {
        preview: true,
        tenantId: ctx.tenantId,
        unallocatedCandidates: candidates.length,
        proposals,
        message:
          'Preview only. Pass confirm=true to audit-log the request. Real matching runs server-side via POST /api/v1/payments/match.',
      };
    }

    await ctx.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId ?? null,
        agentId: ctx.agentId ?? null,
        entityType: 'payment_match_run',
        entityId: `run:${new Date().toISOString()}`,
        action: 'MATCH',
        afterValue: {
          source: 'agent-tool:run_payment_matching',
          minConfidence,
          candidateCount: candidates.length,
          proposalCount: proposals.length,
        },
        changeSummary: `Agent requested payment matching (${String(proposals.length)} candidate matches)`,
      },
    });

    return {
      queued: true,
      tenantId: ctx.tenantId,
      unallocatedCandidates: candidates.length,
      proposals,
      minConfidence,
      message:
        'Intent audit-logged. Trigger POST /api/v1/payments/match to run the real PaymentMatchingService.',
    };
  },
};

function clampLimit(raw: number): number {
  if (!Number.isFinite(raw) || raw < 1) return 10;
  return Math.min(50, Math.floor(raw));
}

function validateMinConfidence(raw: number | undefined): number | undefined {
  if (raw == null) return undefined;
  if (!Number.isFinite(raw) || raw < 0 || raw > 1) {
    throw new AgentToolError(
      `minConfidence must be between 0 and 1 (got ${String(raw)})`,
      'INVALID_INPUT',
    );
  }
  return raw;
}

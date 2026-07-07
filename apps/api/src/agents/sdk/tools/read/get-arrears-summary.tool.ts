/**
 * get_arrears_summary tool
 *
 * Aggregates outstanding invoice balances into aging buckets for the current
 * tenant. Read-only. Bucket boundaries follow the SA-standard arrears report:
 * current (not yet due), 1-30, 31-60, 61-90, 90+.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';

interface GetArrearsSummaryInput {
  asOf?: string;
}

interface AgingBucket {
  bucket: string;
  invoiceCount: number;
  outstandingCents: number;
}

export const getArrearsSummaryTool: AgentTool = {
  name: 'get_arrears_summary',
  description:
    'Summarise outstanding invoice balances into aging buckets (current, 1-30, 31-60, 61-90, 90+) as of a given date (defaults to today).',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      asOf: {
        type: 'string',
        description:
          'ISO 8601 date (YYYY-MM-DD). Defaults to today. Aging is measured from invoice dueDate to this date.',
      },
    },
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as GetArrearsSummaryInput;
    const asOf = parseAsOf(input.asOf);

    const invoices = await ctx.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        isDeleted: false,
        status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      select: {
        id: true,
        dueDate: true,
        totalCents: true,
        amountPaidCents: true,
      },
    });

    const buckets: Record<string, AgingBucket> = {
      current: { bucket: 'current', invoiceCount: 0, outstandingCents: 0 },
      '1-30': { bucket: '1-30', invoiceCount: 0, outstandingCents: 0 },
      '31-60': { bucket: '31-60', invoiceCount: 0, outstandingCents: 0 },
      '61-90': { bucket: '61-90', invoiceCount: 0, outstandingCents: 0 },
      '90+': { bucket: '90+', invoiceCount: 0, outstandingCents: 0 },
    };

    let totalOutstandingCents = 0;
    let totalInvoiceCount = 0;

    for (const inv of invoices) {
      const outstanding = inv.totalCents - inv.amountPaidCents;
      if (outstanding <= 0) continue;

      const days = daysBetween(inv.dueDate, asOf);
      const bucket = pickBucket(days);
      buckets[bucket].invoiceCount += 1;
      buckets[bucket].outstandingCents += outstanding;
      totalOutstandingCents += outstanding;
      totalInvoiceCount += 1;
    }

    return {
      tenantId: ctx.tenantId,
      asOf: asOf.toISOString().slice(0, 10),
      totalInvoiceCount,
      totalOutstandingCents,
      buckets: Object.values(buckets),
    };
  },
};

function parseAsOf(raw: string | undefined): Date {
  if (raw == null) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return new Date();
  }
  return parsed;
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function pickBucket(daysOverdue: number): string {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '90+';
}

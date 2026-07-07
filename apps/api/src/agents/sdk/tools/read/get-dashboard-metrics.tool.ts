/**
 * get_dashboard_metrics tool
 *
 * Rolls up headline financials for the current tenant over a chosen period:
 * total invoiced, total collected, outstanding balance, active enrollment
 * count. Read-only; feeds the conversational + orchestrator agents.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

type Period = 'current-month' | 'last-quarter' | 'ytd';

interface GetDashboardMetricsInput {
  period?: string;
}

export const getDashboardMetricsTool: AgentTool = {
  name: 'get_dashboard_metrics',
  description:
    'Headline dashboard metrics for the current tenant over a period: invoiced total, collected total, outstanding balance, active enrollment count.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      period: {
        type: 'string',
        enum: ['current-month', 'last-quarter', 'ytd'],
        description:
          'Reporting window: current-month (default), last-quarter (last 3 months), ytd (year-to-date).',
      },
    },
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as GetDashboardMetricsInput;
    const period = normalisePeriod(input.period);
    const { from, to } = periodBounds(period);

    const [invoiceAgg, activeEnrollments] = await Promise.all([
      ctx.prisma.invoice.aggregate({
        where: {
          tenantId: ctx.tenantId,
          isDeleted: false,
          issueDate: { gte: from, lte: to },
        },
        _sum: { totalCents: true, amountPaidCents: true },
        _count: { _all: true },
      }),
      ctx.prisma.enrollment.count({
        where: {
          tenantId: ctx.tenantId,
          status: 'ACTIVE',
        },
      }),
    ]);

    const invoicedCents = invoiceAgg._sum.totalCents ?? 0;
    const collectedCents = invoiceAgg._sum.amountPaidCents ?? 0;
    const outstandingCents = invoicedCents - collectedCents;
    const collectionRate =
      invoicedCents === 0
        ? 0
        : Math.round((collectedCents / invoicedCents) * 1000) / 10;

    return {
      tenantId: ctx.tenantId,
      period,
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      invoicedCents,
      collectedCents,
      outstandingCents,
      collectionRatePct: collectionRate,
      invoiceCount: invoiceAgg._count._all,
      activeEnrollments,
    };
  },
};

function normalisePeriod(raw: string | undefined): Period {
  if (raw == null) return 'current-month';
  const lower = raw.toLowerCase().trim();
  if (
    lower === 'current-month' ||
    lower === 'last-quarter' ||
    lower === 'ytd'
  ) {
    return lower;
  }
  throw new AgentToolError(
    `unknown period "${raw}". Use current-month | last-quarter | ytd.`,
    'INVALID_INPUT',
  );
}

function periodBounds(period: Period): { from: Date; to: Date } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);
  if (period === 'current-month') {
    from.setUTCDate(1);
    from.setUTCHours(0, 0, 0, 0);
  } else if (period === 'last-quarter') {
    from.setUTCMonth(from.getUTCMonth() - 3);
    from.setUTCHours(0, 0, 0, 0);
  } else {
    from.setUTCMonth(0, 1);
    from.setUTCHours(0, 0, 0, 0);
  }
  return { from, to };
}

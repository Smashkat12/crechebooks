/**
 * list_invoices tool
 *
 * Ports the harness `list_invoices` domain tool onto direct Prisma access.
 * Tenant-scoped, read-only, capped at 100 rows.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

const VALID_STATUSES = [
  'DRAFT',
  'SENT',
  'VIEWED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
] as const;
type InvoiceStatus = (typeof VALID_STATUSES)[number];

interface ListInvoicesInput {
  status?: string;
  limit?: number;
}

export const listInvoicesTool: AgentTool = {
  name: 'list_invoices',
  description:
    'List invoices for the current tenant, optionally filtered by status (DRAFT, SENT, PAID, OVERDUE, …). Returns the most recent first, capped at 100.',
  mutation: false,
  inputSchema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: VALID_STATUSES as unknown as string[],
        description:
          'Optional invoice status filter (DRAFT | SENT | VIEWED | PARTIALLY_PAID | PAID | OVERDUE | VOID).',
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
    const input = rawInput as unknown as ListInvoicesInput;
    const limit = clampLimit(input.limit);
    const status = normaliseStatus(input.status);

    const invoices = await ctx.prisma.invoice.findMany({
      where: {
        tenantId: ctx.tenantId,
        isDeleted: false,
        ...(status ? { status } : {}),
      },
      orderBy: { issueDate: 'desc' },
      take: limit,
      select: {
        id: true,
        invoiceNumber: true,
        parentId: true,
        childId: true,
        issueDate: true,
        dueDate: true,
        totalCents: true,
        amountPaidCents: true,
        status: true,
      },
    });

    return {
      tenantId: ctx.tenantId,
      count: invoices.length,
      invoices: invoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        parentId: i.parentId,
        childId: i.childId,
        issueDate: i.issueDate.toISOString().slice(0, 10),
        dueDate: i.dueDate.toISOString().slice(0, 10),
        totalCents: i.totalCents,
        amountPaidCents: i.amountPaidCents,
        outstandingCents: i.totalCents - i.amountPaidCents,
        status: i.status,
      })),
    };
  },
};

function clampLimit(raw: number | undefined): number {
  if (raw == null) return 25;
  if (!Number.isFinite(raw) || raw < 1) return 25;
  return Math.min(100, Math.floor(raw));
}

function normaliseStatus(raw: string | undefined): InvoiceStatus | undefined {
  if (raw == null) return undefined;
  const upper = raw.toUpperCase().trim();
  if ((VALID_STATUSES as readonly string[]).includes(upper)) {
    return upper as InvoiceStatus;
  }
  throw new AgentToolError(
    `unknown invoice status "${raw}". Valid: ${VALID_STATUSES.join(', ')}.`,
    'INVALID_INPUT',
  );
}

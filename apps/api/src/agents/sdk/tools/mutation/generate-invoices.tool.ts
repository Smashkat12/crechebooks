/**
 * generate_invoices tool
 *
 * Preview-default: without confirm=true, returns the count of enrollments that
 * WOULD be invoiced for the given billing month + an estimated total, WITHOUT
 * touching the invoice table.
 *
 * With confirm=true: this tool intentionally does NOT bypass the full
 * InvoiceGenerationService (pro-rata, sibling discount, VAT, catch-up, invoice
 * numbering, Xero sync). Faking it here would produce inconsistent invoices.
 * Instead it audit-logs the AI's intent to generate and returns a directive to
 * call POST /api/v1/invoices/generate — the human-triggered endpoint that
 * wires the real generator.
 *
 * Guardrails:
 *   - Tenant-scoped enrollment/child counts only.
 *   - Every confirmed call writes an audit_log entry (action=CREATE, entity=invoice_batch).
 *   - Never sends invoices — delivery stays out of the LLM path.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

interface GenerateInvoicesInput {
  month: string;
  confirm?: boolean;
}

export const generateInvoicesTool: AgentTool = {
  name: 'generate_invoices',
  description:
    'Preview or record intent to generate DRAFT invoices for a billing month (YYYY-MM). Without confirm=true, returns the count of active enrollments that would be invoiced. NEVER sends invoices to parents.',
  mutation: true,
  inputSchema: {
    type: 'object',
    properties: {
      month: {
        type: 'string',
        pattern: '^\\d{4}-\\d{2}$',
        description: 'Billing month YYYY-MM, e.g. 2026-06.',
      },
      confirm: {
        type: 'boolean',
        description:
          'true records the AI intent + audit log. Default false returns a preview only.',
      },
    },
    required: ['month'],
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as GenerateInvoicesInput;
    const month = validateMonth(input.month);
    const confirm = input.confirm === true;

    // Preview: count active enrollments for the tenant.
    const activeEnrollments = await ctx.prisma.enrollment.count({
      where: {
        tenantId: ctx.tenantId,
        status: 'ACTIVE',
      },
    });

    if (!confirm) {
      return {
        preview: true,
        tenantId: ctx.tenantId,
        month,
        activeEnrollments,
        message:
          'Preview only. Pass confirm=true to record intent. Actual invoice generation runs via POST /api/v1/invoices/generate (server-side InvoiceGenerationService).',
      };
    }

    // Confirmed: audit-log the request. Do NOT bypass InvoiceGenerationService
    // (pro-rata + sibling discount + VAT + Xero sync). Return a directive.
    await ctx.prisma.auditLog.create({
      data: {
        tenantId: ctx.tenantId,
        userId: ctx.userId ?? null,
        agentId: ctx.agentId ?? null,
        entityType: 'invoice_batch',
        entityId: `batch:${month}`,
        action: 'CREATE',
        afterValue: {
          source: 'agent-tool:generate_invoices',
          month,
          activeEnrollments,
        },
        changeSummary: `Agent requested invoice generation for ${month} (${String(activeEnrollments)} active enrollments)`,
      },
    });

    return {
      queued: true,
      tenantId: ctx.tenantId,
      month,
      activeEnrollments,
      message:
        'Intent audit-logged. Trigger POST /api/v1/invoices/generate with { billingMonth: "' +
        month +
        '" } to run the real InvoiceGenerationService.',
    };
  },
};

function validateMonth(raw: string | undefined): string {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) {
    throw new AgentToolError(
      `month must be YYYY-MM (got "${String(raw)}")`,
      'INVALID_INPUT',
    );
  }
  const [y, m] = raw.split('-').map((s) => parseInt(s, 10));
  if (m < 1 || m > 12 || y < 2020 || y > 2100) {
    throw new AgentToolError(`month "${raw}" out of range`, 'INVALID_INPUT');
  }
  return raw;
}

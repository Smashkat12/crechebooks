/**
 * allocate_payment tool
 *
 * Ties a bank transaction to an invoice by creating a Payment row (matchType=MANUAL,
 * matchedBy=AI_AUTO) and updating the invoice's amountPaid. Preview-default.
 *
 * Guardrails:
 *   - Both the transaction and the invoice MUST belong to the tenant. Cross-tenant
 *     ids fail with TENANT_MISMATCH.
 *   - Refuses to over-allocate (amountCents > outstanding).
 *   - Audit-logs a MATCH action for the invoice.
 *   - NEVER sends a receipt or notifies parents; delivery is out of scope.
 */

import type {
  AgentTool,
  AgentToolContext,
} from '../interfaces/agent-tool.interface';
import { AgentToolError } from '../interfaces/agent-tool.interface';

interface AllocatePaymentInput {
  transactionId: string;
  invoiceId: string;
  amountCents: number;
  reference?: string;
  confirm?: boolean;
}

export const allocatePaymentTool: AgentTool = {
  name: 'allocate_payment',
  description:
    'Allocate a bank transaction (or portion thereof) to an invoice by creating a Payment record. Preview-default: without confirm=true, returns the intended allocation without writing.',
  mutation: true,
  inputSchema: {
    type: 'object',
    properties: {
      transactionId: {
        type: 'string',
        description: 'Bank transaction UUID to allocate from.',
      },
      invoiceId: {
        type: 'string',
        description: 'Invoice UUID to allocate to.',
      },
      amountCents: {
        type: 'integer',
        minimum: 1,
        description:
          'Portion of the transaction to allocate, in cents. Must be > 0 and <= invoice outstanding.',
      },
      reference: {
        type: 'string',
        description: 'Optional payment reference (e.g. EFT reference).',
      },
      confirm: {
        type: 'boolean',
        description:
          'true executes the allocation. Default false returns a preview only.',
      },
    },
    required: ['transactionId', 'invoiceId', 'amountCents'],
  },
  async handler(rawInput: Record<string, unknown>, ctx: AgentToolContext) {
    const input = rawInput as unknown as AllocatePaymentInput;
    const { transactionId, invoiceId, amountCents, reference } = input;
    if (!Number.isInteger(amountCents) || amountCents <= 0) {
      throw new AgentToolError(
        `amountCents must be a positive integer (got ${String(amountCents)})`,
        'INVALID_INPUT',
      );
    }
    const confirm = input.confirm === true;

    const [tx, invoice] = await Promise.all([
      ctx.prisma.transaction.findUnique({
        where: { id: transactionId },
        select: {
          id: true,
          tenantId: true,
          amountCents: true,
          isCredit: true,
          date: true,
          reference: true,
          isDeleted: true,
        },
      }),
      ctx.prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          tenantId: true,
          totalCents: true,
          amountPaidCents: true,
          status: true,
          isDeleted: true,
        },
      }),
    ]);

    if (!tx || tx.isDeleted) {
      throw new AgentToolError(
        `transaction ${transactionId} not found`,
        'TX_NOT_FOUND',
      );
    }
    if (!invoice || invoice.isDeleted) {
      throw new AgentToolError(
        `invoice ${invoiceId} not found`,
        'INVOICE_NOT_FOUND',
      );
    }
    if (tx.tenantId !== ctx.tenantId || invoice.tenantId !== ctx.tenantId) {
      throw new AgentToolError(
        `tenant mismatch — refusing cross-tenant allocation`,
        'TENANT_MISMATCH',
      );
    }
    if (!tx.isCredit) {
      throw new AgentToolError(
        `transaction ${transactionId} is a debit, cannot allocate as payment`,
        'INVALID_TRANSACTION',
      );
    }

    const outstanding = invoice.totalCents - invoice.amountPaidCents;
    if (amountCents > outstanding) {
      throw new AgentToolError(
        `amountCents ${String(amountCents)} exceeds outstanding ${String(outstanding)} on invoice ${invoiceId}`,
        'OVER_ALLOCATION',
      );
    }

    if (!confirm) {
      return {
        preview: true,
        tenantId: ctx.tenantId,
        would: {
          transactionId,
          invoiceId,
          amountCents,
          reference: reference ?? tx.reference,
          resultingAmountPaidCents: invoice.amountPaidCents + amountCents,
          resultingStatus:
            invoice.amountPaidCents + amountCents >= invoice.totalCents
              ? 'PAID'
              : 'PARTIALLY_PAID',
        },
      };
    }

    // Confirmed. Run inside a transaction so the payment insert + invoice
    // update + audit log commit atomically.
    const result = await ctx.prisma.$transaction(async (tx2) => {
      const payment = await tx2.payment.create({
        data: {
          tenantId: ctx.tenantId,
          transactionId,
          invoiceId,
          amountCents,
          paymentDate: tx.date,
          reference: reference ?? tx.reference,
          matchType: 'MANUAL',
          matchedBy: 'AI_AUTO',
          matchConfidence: null,
        },
      });

      const newPaid = invoice.amountPaidCents + amountCents;
      const newStatus =
        newPaid >= invoice.totalCents
          ? 'PAID'
          : newPaid > 0
            ? 'PARTIALLY_PAID'
            : invoice.status;

      const updated = await tx2.invoice.update({
        where: { id: invoiceId },
        data: {
          amountPaidCents: newPaid,
          status: newStatus,
        },
        select: {
          id: true,
          amountPaidCents: true,
          totalCents: true,
          status: true,
        },
      });

      await tx2.auditLog.create({
        data: {
          tenantId: ctx.tenantId,
          userId: ctx.userId ?? null,
          agentId: ctx.agentId ?? null,
          entityType: 'invoice',
          entityId: invoiceId,
          action: 'MATCH',
          beforeValue: {
            amountPaidCents: invoice.amountPaidCents,
            status: invoice.status,
          },
          afterValue: {
            amountPaidCents: updated.amountPaidCents,
            status: updated.status,
            paymentId: payment.id,
            transactionId,
          },
          changeSummary: `Agent allocated ${String(amountCents)}c from transaction ${transactionId}`,
        },
      });

      return { payment, invoice: updated };
    });

    return {
      allocated: true,
      tenantId: ctx.tenantId,
      paymentId: result.payment.id,
      invoiceId: result.invoice.id,
      amountCents,
      invoiceStatus: result.invoice.status,
      invoiceOutstandingCents:
        result.invoice.totalCents - result.invoice.amountPaidCents,
    };
  },
};

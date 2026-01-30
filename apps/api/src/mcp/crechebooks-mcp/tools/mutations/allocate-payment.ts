/**
 * Allocate Payment Tool
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Allocates a bank transaction payment to a specific invoice.
 * Uses PaymentAllocationService for business logic.
 */

import { PaymentAllocationService } from '../../../../database/services/payment-allocation.service';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  AllocatePaymentInput,
  AllocatePaymentOutput,
} from '../../types/mutations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

export function allocatePayment(
  prisma: PrismaService,
  paymentAllocationService: PaymentAllocationService,
): McpToolDefinition<
  AllocatePaymentInput,
  McpToolResult<AllocatePaymentOutput>
> {
  return {
    name: 'allocate_payment',
    description:
      'Allocate a bank transaction payment to a specific invoice. Supports exact, partial, and overpayment allocations. Creates audit trail and syncs to Xero if connected.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        transactionId: {
          type: 'string',
          description: 'Bank transaction ID to allocate',
        },
        invoiceId: {
          type: 'string',
          description: 'Invoice ID to allocate payment to',
        },
        amountCents: {
          type: 'number',
          description:
            'Amount to allocate in cents. If omitted, allocates full transaction amount or remaining unallocated amount.',
          minimum: 1,
        },
        userId: {
          type: 'string',
          description: 'User ID performing the allocation (for audit trail)',
        },
      },
      required: ['tenantId', 'transactionId', 'invoiceId'],
    },
    handler: async (
      args: AllocatePaymentInput,
    ): Promise<McpToolResult<AllocatePaymentOutput>> => {
      const startTime = Date.now();

      try {
        // Get transaction to determine amount if not specified
        const transaction = await prisma.transaction.findFirst({
          where: {
            id: args.transactionId,
            tenantId: args.tenantId,
          },
        });

        if (!transaction) {
          return {
            success: false,
            error: `Transaction ${args.transactionId} not found`,
            metadata: {
              toolName: 'allocate_payment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Get existing payments on this transaction
        const existingPayments = await prisma.payment.findMany({
          where: {
            transactionId: args.transactionId,
            tenantId: args.tenantId,
            isReversed: false,
          },
        });
        const totalAllocated = existingPayments.reduce(
          (sum, p) => sum + p.amountCents,
          0,
        );
        const availableAmount = transaction.amountCents - totalAllocated;

        // Determine allocation amount
        const allocationAmount = args.amountCents ?? availableAmount;

        if (allocationAmount <= 0) {
          return {
            success: false,
            error: 'Transaction is fully allocated',
            metadata: {
              toolName: 'allocate_payment',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Execute allocation
        const result = await paymentAllocationService.allocatePayment({
          tenantId: args.tenantId,
          transactionId: args.transactionId,
          allocations: [
            {
              invoiceId: args.invoiceId,
              amountCents: allocationAmount,
            },
          ],
          userId: args.userId,
        });

        // Get updated invoice for response
        const invoice = await prisma.invoice.findUnique({
          where: { id: args.invoiceId },
        });

        const payment = result.payments[0];

        return {
          success: true,
          data: {
            paymentId: payment.id,
            transactionId: payment.transactionId ?? args.transactionId,
            invoiceId: payment.invoiceId,
            invoiceNumber: invoice?.invoiceNumber ?? 'Unknown',
            amountAllocatedCents: payment.amountCents,
            remainingUnallocatedCents: result.unallocatedAmountCents,
            invoiceStatus: invoice?.status ?? 'Unknown',
          },
          metadata: {
            toolName: 'allocate_payment',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: 1,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to allocate payment: ${errorMessage}`,
          metadata: {
            toolName: 'allocate_payment',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

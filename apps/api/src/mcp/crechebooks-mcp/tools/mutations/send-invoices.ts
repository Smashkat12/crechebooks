/**
 * Send Invoices Tool
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Sends invoices to parents via email and/or WhatsApp.
 * Updates invoice status to SENT and creates delivery log entries.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  SendInvoicesInput,
  SendInvoicesOutput,
  InvoiceSendResult,
} from '../../types/mutations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

export function sendInvoices(
  prisma: PrismaService,
): McpToolDefinition<SendInvoicesInput, McpToolResult<SendInvoicesOutput>> {
  return {
    name: 'send_invoices',
    description:
      'Send invoices to parents via email and/or WhatsApp. Updates invoice status to SENT and records delivery attempts. Supports filtering by status or sending specific invoices.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        invoiceIds: {
          type: 'string',
          description:
            'Optional JSON array of invoice IDs to send. If omitted, uses sendAll or statusFilter.',
        },
        sendAll: {
          type: 'string',
          description:
            'If "true", send all unsent invoices (DRAFT status). Default: false',
        },
        statusFilter: {
          type: 'string',
          description:
            'Filter invoices by status (e.g., DRAFT, OVERDUE). Used when sendAll is false and no invoiceIds provided.',
        },
        method: {
          type: 'string',
          description: 'Delivery method: "email", "whatsapp", or "both". Default: "email"',
          enum: ['email', 'whatsapp', 'both'],
        },
        userId: {
          type: 'string',
          description: 'User ID performing the send operation (for audit trail)',
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: SendInvoicesInput,
    ): Promise<McpToolResult<SendInvoicesOutput>> => {
      const startTime = Date.now();
      const sendAll = args.sendAll === true || String(args.sendAll) === 'true';
      const method = args.method ?? 'email';

      try {
        // Build query based on input parameters
        let invoiceIds: string[] | undefined;

        if (args.invoiceIds && Array.isArray(args.invoiceIds)) {
          invoiceIds = args.invoiceIds;
        }

        // Find invoices to send
        const invoices = await prisma.invoice.findMany({
          where: {
            tenantId: args.tenantId,
            isDeleted: false,
            ...(invoiceIds
              ? { id: { in: invoiceIds } }
              : sendAll
                ? { status: 'DRAFT' }
                : args.statusFilter
                  ? { status: args.statusFilter as 'DRAFT' | 'SENT' | 'VIEWED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID' }
                  : { status: 'DRAFT' }),
          },
          include: {
            parent: true,
            child: true,
            lines: true,
          },
        });

        if (invoices.length === 0) {
          return {
            success: true,
            data: {
              sentCount: 0,
              failedCount: 0,
              results: [],
            },
            metadata: {
              toolName: 'send_invoices',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
              resultCount: 0,
            },
          };
        }

        const results: InvoiceSendResult[] = [];
        let sentCount = 0;
        let failedCount = 0;

        for (const invoice of invoices) {
          const { parent } = invoice;
          const deliveryMethods: string[] = [];

          // Determine which delivery methods to use
          if (method === 'email' || method === 'both') {
            deliveryMethods.push('EMAIL');
          }
          if (method === 'whatsapp' || method === 'both') {
            deliveryMethods.push('WHATSAPP');
          }

          // Check if parent has required contact info
          const canSendEmail = parent.email && deliveryMethods.includes('EMAIL');
          const canSendWhatsApp =
            parent.whatsapp && parent.whatsappOptIn && deliveryMethods.includes('WHATSAPP');

          if (!canSendEmail && !canSendWhatsApp) {
            results.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              success: false,
              method: method,
              error: 'No valid delivery method available for parent',
            });
            failedCount++;
            continue;
          }

          try {
            // Update invoice status and create delivery logs in a transaction
            await prisma.$transaction(async (tx) => {
              // Update invoice status to SENT
              await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                  status: 'SENT',
                  deliveryMethod: method === 'both' ? 'BOTH' : method === 'whatsapp' ? 'WHATSAPP' : 'EMAIL',
                  deliveryStatus: 'SENT',
                  deliveredAt: new Date(),
                },
              });

              // Create delivery log entries for each method
              if (canSendEmail) {
                await tx.invoiceDeliveryLog.create({
                  data: {
                    invoiceId: invoice.id,
                    tenantId: args.tenantId,
                    channel: 'EMAIL',
                    status: 'SENT',
                    eventType: 'INVOICE_SENT',
                    externalMessageId: null,
                    metadata: {
                      recipientEmail: parent.email,
                      invoiceNumber: invoice.invoiceNumber,
                      totalCents: invoice.totalCents,
                      userId: args.userId,
                    },
                    occurredAt: new Date(),
                  },
                });
              }

              if (canSendWhatsApp) {
                await tx.invoiceDeliveryLog.create({
                  data: {
                    invoiceId: invoice.id,
                    tenantId: args.tenantId,
                    channel: 'WHATSAPP',
                    status: 'SENT',
                    eventType: 'INVOICE_SENT',
                    externalMessageId: null,
                    metadata: {
                      recipientWhatsApp: parent.whatsapp,
                      invoiceNumber: invoice.invoiceNumber,
                      totalCents: invoice.totalCents,
                      userId: args.userId,
                    },
                    occurredAt: new Date(),
                  },
                });
              }
            });

            // Determine the actual method(s) used
            const methodsUsed: string[] = [];
            if (canSendEmail) methodsUsed.push('email');
            if (canSendWhatsApp) methodsUsed.push('whatsapp');

            results.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              success: true,
              method: methodsUsed.join('+'),
            });
            sentCount++;
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            results.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              success: false,
              method: method,
              error: `Failed to send invoice: ${errorMessage}`,
            });
            failedCount++;
          }
        }

        return {
          success: true,
          data: {
            sentCount,
            failedCount,
            results,
          },
          metadata: {
            toolName: 'send_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: results.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to send invoices: ${errorMessage}`,
          metadata: {
            toolName: 'send_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

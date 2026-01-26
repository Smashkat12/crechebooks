/**
 * Get Invoices Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Queries Invoice with lines and parent relation.
 * Uses REAL fields: totalCents, amountPaidCents, issueDate.
 * Contact name derived from parent.firstName + parent.lastName.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  GetInvoicesInput,
  InvoiceLineRecord,
  InvoiceRecord,
  InvoiceStatus,
  McpToolDefinition,
  McpToolResult,
} from '../types/index';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function getInvoices(
  prisma: PrismaService,
): McpToolDefinition<GetInvoicesInput, McpToolResult<InvoiceRecord[]>> {
  return {
    name: 'get_invoices',
    description:
      'Retrieve invoices for a tenant with line items. Includes parent (contact) name, amounts, outstanding balance, and delivery status. Supports filtering by status, date range, parent, and amount range.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        status: {
          type: 'string',
          description: 'Filter by invoice status',
          enum: [
            'DRAFT',
            'SENT',
            'VIEWED',
            'PARTIALLY_PAID',
            'PAID',
            'OVERDUE',
            'VOID',
          ],
        },
        fromDate: {
          type: 'string',
          description:
            'Filter invoices issued on or after this date (ISO date string)',
        },
        toDate: {
          type: 'string',
          description:
            'Filter invoices issued on or before this date (ISO date string)',
        },
        parentId: {
          type: 'string',
          description: 'Filter by parent (contact) ID',
        },
        minAmountCents: {
          type: 'number',
          description: 'Minimum total amount in cents',
          minimum: 0,
        },
        maxAmountCents: {
          type: 'number',
          description: 'Maximum total amount in cents',
          minimum: 0,
        },
        limit: {
          type: 'number',
          description: `Maximum number of results (default: ${String(DEFAULT_LIMIT)}, max: ${String(MAX_LIMIT)})`,
          minimum: 1,
          maximum: MAX_LIMIT,
          default: DEFAULT_LIMIT,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: GetInvoicesInput,
    ): Promise<McpToolResult<InvoiceRecord[]>> => {
      const startTime = Date.now();
      const effectiveLimit = Math.min(args.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

      try {
        const where: Record<string, unknown> = {
          tenantId: args.tenantId,
          isDeleted: false,
        };

        if (args.status) {
          where.status = args.status;
        }

        if (args.parentId) {
          where.parentId = args.parentId;
        }

        // Date filter on issueDate
        if (args.fromDate || args.toDate) {
          const dateFilter: Record<string, Date> = {};
          if (args.fromDate) {
            dateFilter.gte = new Date(args.fromDate);
          }
          if (args.toDate) {
            dateFilter.lte = new Date(args.toDate);
          }
          where.issueDate = dateFilter;
        }

        // Amount filter on totalCents
        if (
          args.minAmountCents !== undefined ||
          args.maxAmountCents !== undefined
        ) {
          const amountFilter: Record<string, number> = {};
          if (args.minAmountCents !== undefined) {
            amountFilter.gte = args.minAmountCents;
          }
          if (args.maxAmountCents !== undefined) {
            amountFilter.lte = args.maxAmountCents;
          }
          where.totalCents = amountFilter;
        }

        const invoices = await prisma.invoice.findMany({
          where,
          include: {
            lines: {
              orderBy: { sortOrder: 'asc' },
            },
            parent: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
          take: effectiveLimit,
          orderBy: { issueDate: 'desc' },
        });

        const data: InvoiceRecord[] = invoices.map((inv) => {
          const parentName =
            `${inv.parent.firstName} ${inv.parent.lastName}`.trim();
          const outstandingCents = inv.totalCents - inv.amountPaidCents;

          const lines: InvoiceLineRecord[] = inv.lines.map((line) => ({
            id: line.id,
            description: line.description,
            quantity: Number(line.quantity),
            unitPriceCents: line.unitPriceCents,
            discountCents: line.discountCents,
            subtotalCents: line.subtotalCents,
            vatCents: line.vatCents,
            totalCents: line.totalCents,
            lineType: line.lineType,
            accountCode: line.accountCode,
            sortOrder: line.sortOrder,
          }));

          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            parentName,
            issueDate: inv.issueDate.toISOString(),
            dueDate: inv.dueDate.toISOString(),
            subtotalCents: inv.subtotalCents,
            vatCents: inv.vatCents,
            totalCents: inv.totalCents,
            amountPaidCents: inv.amountPaidCents,
            outstandingCents,
            status: inv.status as InvoiceStatus,
            pdfUrl: inv.pdfUrl,
            lines,
          };
        });

        return {
          success: true,
          data,
          metadata: {
            toolName: 'get_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: data.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to fetch invoices: ${errorMessage}`,
          metadata: {
            toolName: 'get_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

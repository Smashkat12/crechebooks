/**
 * Generate Invoices Tool
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Generates monthly invoices for enrolled children based on their fee structure.
 * Creates invoice records with appropriate line items for tuition fees.
 */

import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  GenerateInvoicesInput,
  GenerateInvoicesOutput,
  GeneratedInvoiceSummary,
  InvoiceGenerationError,
} from '../../types/mutations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

export function generateInvoices(
  prisma: PrismaService,
): McpToolDefinition<
  GenerateInvoicesInput,
  McpToolResult<GenerateInvoicesOutput>
> {
  return {
    name: 'generate_invoices',
    description:
      'Generate monthly invoices for enrolled children. Creates invoice records with line items based on the fee structure for each active enrollment. Supports dry-run mode to preview without creating records.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        billingMonth: {
          type: 'string',
          description: 'Billing month in YYYY-MM format (e.g., 2024-03)',
        },
        childIds: {
          type: 'string',
          description:
            'Optional JSON array of child IDs to generate invoices for. If omitted, generates for all active enrollments.',
        },
        userId: {
          type: 'string',
          description: 'User ID performing the generation (for audit trail)',
        },
        dryRun: {
          type: 'string',
          description:
            'If "true", returns preview without creating records. Default: false',
        },
      },
      required: ['tenantId', 'billingMonth'],
    },
    handler: async (
      args: GenerateInvoicesInput,
    ): Promise<McpToolResult<GenerateInvoicesOutput>> => {
      const startTime = Date.now();
      const isDryRun = args.dryRun === true || String(args.dryRun) === 'true';

      try {
        // Parse billing month
        const billingMonthMatch = args.billingMonth.match(/^(\d{4})-(\d{2})$/);
        if (!billingMonthMatch) {
          return {
            success: false,
            error:
              'Invalid billingMonth format. Expected YYYY-MM (e.g., 2024-03)',
            metadata: {
              toolName: 'generate_invoices',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        const year = parseInt(billingMonthMatch[1], 10);
        const month = parseInt(billingMonthMatch[2], 10);
        const billingPeriodStart = new Date(year, month - 1, 1);
        const billingPeriodEnd = new Date(year, month, 0); // Last day of month
        const issueDate = new Date();
        const dueDate = new Date(year, month - 1, 7); // Due on 7th of billing month

        // Parse childIds if provided
        let childIdFilter: string[] | undefined;
        if (args.childIds && Array.isArray(args.childIds)) {
          childIdFilter = args.childIds;
        }

        // Find active enrollments for the tenant
        const enrollments = await prisma.enrollment.findMany({
          where: {
            tenantId: args.tenantId,
            status: 'ACTIVE',
            startDate: { lte: billingPeriodEnd },
            OR: [{ endDate: null }, { endDate: { gte: billingPeriodStart } }],
            ...(childIdFilter ? { childId: { in: childIdFilter } } : {}),
          },
          include: {
            child: {
              include: {
                parent: true,
              },
            },
            feeStructure: true,
          },
        });

        if (enrollments.length === 0) {
          return {
            success: true,
            data: {
              invoicesCreated: 0,
              totalAmountCents: 0,
              invoices: [],
              errors: [],
            },
            metadata: {
              toolName: 'generate_invoices',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
              resultCount: 0,
            },
          };
        }

        // Check for existing invoices for this billing period
        const existingInvoices = await prisma.invoice.findMany({
          where: {
            tenantId: args.tenantId,
            billingPeriodStart,
            billingPeriodEnd,
            isDeleted: false,
          },
          select: {
            childId: true,
          },
        });
        const existingChildIds = new Set(
          existingInvoices.map((inv) => inv.childId),
        );

        const invoicesToCreate: GeneratedInvoiceSummary[] = [];
        const errors: InvoiceGenerationError[] = [];
        let totalAmountCents = 0;

        for (const enrollment of enrollments) {
          const { child, feeStructure } = enrollment;

          // Skip if invoice already exists for this child/period
          if (existingChildIds.has(child.id)) {
            errors.push({
              childId: child.id,
              reason: `Invoice already exists for ${args.billingMonth}`,
              code: 'DUPLICATE_INVOICE',
            });
            continue;
          }

          // Calculate fee amount (use override if set, otherwise fee structure amount)
          let feeAmountCents =
            enrollment.customFeeOverrideCents ?? feeStructure.amountCents;

          // Apply sibling discount if applicable
          if (
            enrollment.siblingDiscountApplied &&
            feeStructure.siblingDiscountPercent
          ) {
            const discountMultiplier =
              1 - Number(feeStructure.siblingDiscountPercent) / 100;
            feeAmountCents = Math.round(feeAmountCents * discountMultiplier);
          }

          // Educational services are VAT exempt in SA (Section 12(h))
          const vatCents = 0;
          const subtotalCents = feeAmountCents;
          const invoiceTotalCents = subtotalCents + vatCents;

          if (isDryRun) {
            // Preview mode - don't create records
            invoicesToCreate.push({
              id: `preview-${child.id}`,
              invoiceNumber: `[PREVIEW]`,
              parentName: `${child.parent.firstName} ${child.parent.lastName}`,
              childName: `${child.firstName} ${child.lastName}`,
              totalCents: invoiceTotalCents,
              status: 'DRAFT',
            });
            totalAmountCents += invoiceTotalCents;
          } else {
            // Create the invoice
            try {
              const invoice = await prisma.$transaction(async (tx) => {
                // Get next invoice number atomically
                const counter = await tx.invoiceNumberCounter.upsert({
                  where: {
                    tenantId_year: {
                      tenantId: args.tenantId,
                      year,
                    },
                  },
                  update: {
                    currentValue: { increment: 1 },
                  },
                  create: {
                    tenantId: args.tenantId,
                    year,
                    currentValue: 1,
                  },
                });

                const invoiceNumber = `INV-${year}-${String(counter.currentValue).padStart(5, '0')}`;

                // Create invoice
                const newInvoice = await tx.invoice.create({
                  data: {
                    tenantId: args.tenantId,
                    parentId: child.parentId,
                    childId: child.id,
                    invoiceNumber,
                    billingPeriodStart,
                    billingPeriodEnd,
                    issueDate,
                    dueDate,
                    subtotalCents,
                    vatCents,
                    vatRate: 0,
                    totalCents: invoiceTotalCents,
                    amountPaidCents: 0,
                    status: 'DRAFT',
                    lines: {
                      create: {
                        description: `${feeStructure.name} - ${args.billingMonth}`,
                        quantity: 1,
                        unitPriceCents: feeAmountCents,
                        discountCents: 0,
                        subtotalCents: feeAmountCents,
                        vatCents: 0,
                        totalCents: feeAmountCents,
                        lineType: 'MONTHLY_FEE',
                        sortOrder: 0,
                      },
                    },
                  },
                  include: {
                    parent: true,
                    child: true,
                  },
                });

                return newInvoice;
              });

              invoicesToCreate.push({
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                parentName: `${invoice.parent.firstName} ${invoice.parent.lastName}`,
                childName: `${invoice.child.firstName} ${invoice.child.lastName}`,
                totalCents: invoice.totalCents,
                status: invoice.status,
              });
              totalAmountCents += invoice.totalCents;
            } catch (err) {
              const errorMessage =
                err instanceof Error ? err.message : String(err);
              errors.push({
                childId: child.id,
                reason: `Failed to create invoice: ${errorMessage}`,
                code: 'CREATE_FAILED',
              });
            }
          }
        }

        return {
          success: true,
          data: {
            invoicesCreated: invoicesToCreate.length,
            totalAmountCents,
            invoices: invoicesToCreate,
            errors,
          },
          metadata: {
            toolName: 'generate_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: invoicesToCreate.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to generate invoices: ${errorMessage}`,
          metadata: {
            toolName: 'generate_invoices',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

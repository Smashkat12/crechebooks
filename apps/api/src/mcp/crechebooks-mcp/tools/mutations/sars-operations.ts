/**
 * SARS Operations MCP Tools
 * CrecheBooks MCP Server - SARS Compliance
 *
 * L2 AUTONOMY: All operations generate DRAFTS only.
 * User MUST review and manually upload to SARS eFiling portal.
 * NO auto-submission to SARS is permitted.
 *
 * Provides tools for:
 * - generate_vat201: Generate VAT201 return draft
 * - generate_emp201: Generate EMP201 monthly declaration draft
 * - download_sars_file: Download submission CSV for SARS eFiling
 * - mark_sars_submitted: Mark submission as submitted with SARS reference
 *
 * Note: EMP501 (annual reconciliation) is handled as IRP5 submissions in the schema.
 * SubmissionType enum: VAT201, EMP201, IRP5
 */

import { Decimal } from 'decimal.js';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type { McpToolDefinition, McpToolResult } from '../../types/index';
import type {
  GenerateVat201Input,
  GenerateVat201Output,
  GenerateEmp201Input,
  GenerateEmp201Output,
  DownloadSarsFileInput,
  DownloadSarsFileOutput,
  MarkSarsSubmittedInput,
  MarkSarsSubmittedOutput,
  VatFlaggedItem,
  Emp201StaffRecord,
  L2DraftResult,
} from '../../types/sars';

// L2 Autonomy warning included in all outputs
const L2_WARNING =
  'DRAFT ONLY - Review required before submission to SARS eFiling portal. This tool does not auto-submit to SARS.';

/**
 * Calculate SARS submission deadline based on type and period.
 * VAT201: Last business day of month following tax period
 * EMP201: 7th of month following pay period
 */
function calculateDeadline(
  submissionType: 'VAT201' | 'EMP201' | 'IRP5',
  periodEnd: Date,
): Date {
  const deadline = new Date(periodEnd);

  switch (submissionType) {
    case 'VAT201':
      // Last business day of month following period
      deadline.setMonth(deadline.getMonth() + 2);
      deadline.setDate(0); // Last day of previous month
      break;
    case 'EMP201':
      // 7th of month following period
      deadline.setMonth(deadline.getMonth() + 1);
      deadline.setDate(7);
      break;
    case 'IRP5':
      // 31 May for tax year ending February
      deadline.setFullYear(deadline.getFullYear());
      deadline.setMonth(4); // May
      deadline.setDate(31);
      break;
  }

  return deadline;
}

/**
 * Generate VAT201 Tool
 * Creates a VAT201 return draft for a specified period.
 * L2 Autonomy: Returns draft, requires user review.
 */
export function generateVat201(
  prisma: PrismaService,
): McpToolDefinition<
  GenerateVat201Input,
  McpToolResult<L2DraftResult<GenerateVat201Output>>
> {
  return {
    name: 'generate_vat201',
    description: `Generate a VAT201 return draft for a specified period. ${L2_WARNING}`,
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        periodStart: {
          type: 'string',
          description: 'Period start date (ISO format: YYYY-MM-DD)',
        },
        periodEnd: {
          type: 'string',
          description: 'Period end date (ISO format: YYYY-MM-DD)',
        },
        userId: {
          type: 'string',
          description: 'User ID for audit trail (optional)',
        },
        dryRun: {
          type: 'string',
          description:
            'If "true", returns preview without creating record. Default: false',
        },
      },
      required: ['tenantId', 'periodStart', 'periodEnd'],
    },
    handler: async (
      args: GenerateVat201Input,
    ): Promise<McpToolResult<L2DraftResult<GenerateVat201Output>>> => {
      const startTime = Date.now();
      const isDryRun = args.dryRun === true || String(args.dryRun) === 'true';

      try {
        const periodStart = new Date(args.periodStart);
        const periodEnd = new Date(args.periodEnd);

        if (isNaN(periodStart.getTime()) || isNaN(periodEnd.getTime())) {
          return {
            success: false,
            error: 'Invalid date format. Use ISO format: YYYY-MM-DD',
            metadata: {
              toolName: 'generate_vat201',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Fetch all transactions for the period
        const transactions = await prisma.transaction.findMany({
          where: {
            tenantId: args.tenantId,
            date: {
              gte: periodStart,
              lte: periodEnd,
            },
            isDeleted: false,
          },
          include: {
            categorizations: {
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        });

        // Calculate VAT amounts
        let outputVatCents = 0; // VAT on sales (collected from customers)
        let inputVatCents = 0; // VAT on purchases (paid to suppliers)
        const flaggedItems: VatFlaggedItem[] = [];

        for (const tx of transactions) {
          const categorization = tx.categorizations[0];

          // Calculate VAT based on categorization
          if (categorization) {
            const vatRate = categorization.vatType === 'STANDARD' ? 0.15 : 0;
            const vatAmount = Math.round(
              (tx.amountCents * vatRate) / (1 + vatRate),
            );

            if (tx.isCredit) {
              // Income - output VAT (we collected)
              outputVatCents += vatAmount;
            } else {
              // Expense - input VAT (we paid)
              inputVatCents += vatAmount;
            }

            // Flag items that need review - compare Decimal to number properly
            const confidence = new Decimal(
              categorization.confidenceScore?.toString() ?? '1',
            );
            if (confidence.lessThan(0.8) && vatAmount > 0) {
              flaggedItems.push({
                transactionId: tx.id,
                description: tx.description,
                amountCents: tx.amountCents,
                vatAmountCents: vatAmount,
                reason: 'Low confidence categorization - verify VAT treatment',
              });
            }
          } else {
            // Uncategorized transaction with significant amount
            if (Math.abs(tx.amountCents) > 100000) {
              // R1,000+
              flaggedItems.push({
                transactionId: tx.id,
                description: tx.description,
                amountCents: tx.amountCents,
                vatAmountCents: 0,
                reason: 'Uncategorized transaction - VAT treatment unknown',
              });
            }
          }
        }

        const netVatCents = outputVatCents - inputVatCents;
        const isPayable = netVatCents > 0;
        const deadline = calculateDeadline('VAT201', periodEnd);

        let submissionId = `preview-${Date.now()}`;

        if (!isDryRun) {
          // Create submission record using actual schema fields
          const submission = await prisma.sarsSubmission.create({
            data: {
              tenantId: args.tenantId,
              submissionType: 'VAT201',
              periodStart,
              periodEnd,
              deadline,
              outputVatCents,
              inputVatCents,
              netVatCents,
              status: 'DRAFT',
              documentData: {
                isPayable,
                flaggedItemsCount: flaggedItems.length,
                transactionCount: transactions.length,
              },
            },
          });
          submissionId = submission.id;
        }

        const output: GenerateVat201Output = {
          id: submissionId,
          status: 'DRAFT',
          periodStart: args.periodStart,
          periodEnd: args.periodEnd,
          outputVatCents,
          inputVatCents,
          netVatCents,
          isPayable,
          flaggedItemsCount: flaggedItems.length,
          flaggedItems: flaggedItems.slice(0, 10), // Limit to 10 in response
          createdAt: new Date().toISOString(),
        };

        return {
          success: true,
          data: {
            status: 'DRAFT',
            requiresReview: true,
            warning: L2_WARNING,
            data: output,
          },
          metadata: {
            toolName: 'generate_vat201',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: transactions.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to generate VAT201: ${errorMessage}`,
          metadata: {
            toolName: 'generate_vat201',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Generate EMP201 Tool
 * Creates an EMP201 monthly declaration draft.
 * L2 Autonomy: Returns draft, requires user review.
 */
export function generateEmp201(
  prisma: PrismaService,
): McpToolDefinition<
  GenerateEmp201Input,
  McpToolResult<L2DraftResult<GenerateEmp201Output>>
> {
  return {
    name: 'generate_emp201',
    description: `Generate an EMP201 monthly employer declaration draft. ${L2_WARNING}`,
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        month: {
          type: 'string',
          description: 'Tax month in YYYY-MM format (e.g., 2025-01)',
        },
        userId: {
          type: 'string',
          description: 'User ID for audit trail (optional)',
        },
        dryRun: {
          type: 'string',
          description:
            'If "true", returns preview without creating record. Default: false',
        },
      },
      required: ['tenantId', 'month'],
    },
    handler: async (
      args: GenerateEmp201Input,
    ): Promise<McpToolResult<L2DraftResult<GenerateEmp201Output>>> => {
      const startTime = Date.now();
      const isDryRun = args.dryRun === true || String(args.dryRun) === 'true';

      try {
        // Validate month format
        const monthMatch = args.month.match(/^(\d{4})-(\d{2})$/);
        if (!monthMatch) {
          return {
            success: false,
            error: 'Invalid month format. Expected YYYY-MM (e.g., 2025-01)',
            metadata: {
              toolName: 'generate_emp201',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        const year = parseInt(monthMatch[1], 10);
        const month = parseInt(monthMatch[2], 10);
        const periodStart = new Date(year, month - 1, 1);
        const periodEnd = new Date(year, month, 0); // Last day of month

        // Fetch payroll data for the month using actual model name
        const payrollRecords = await prisma.payroll.findMany({
          where: {
            tenantId: args.tenantId,
            payPeriodStart: { lte: periodEnd },
            payPeriodEnd: { gte: periodStart },
          },
          include: {
            staff: true,
          },
        });

        // Calculate totals - note: Payroll model has separate UIF fields
        let totalGrossRemunerationCents = 0;
        let totalPayeCents = 0;
        let totalUifCents = 0;
        const staffRecords: Emp201StaffRecord[] = [];

        for (const record of payrollRecords) {
          totalGrossRemunerationCents += record.grossSalaryCents;
          totalPayeCents += record.payeCents;
          // Total UIF = employee portion + employer portion
          const uifTotal = record.uifEmployeeCents + record.uifEmployerCents;
          totalUifCents += uifTotal;

          staffRecords.push({
            staffId: record.staffId,
            idNumber: maskIdNumber(record.staff.idNumber),
            name: `${record.staff.firstName} ${record.staff.lastName}`,
            grossRemunerationCents: record.grossSalaryCents,
            payeCents: record.payeCents,
            uifCents: uifTotal,
          });
        }

        // SDL is typically 1% of gross remuneration
        const totalSdlCents = Math.round(totalGrossRemunerationCents * 0.01);
        const totalDueCents = totalPayeCents + totalUifCents + totalSdlCents;
        const deadline = calculateDeadline('EMP201', periodEnd);

        let submissionId = `preview-${Date.now()}`;

        if (!isDryRun) {
          // Create submission record using actual schema fields
          const submission = await prisma.sarsSubmission.create({
            data: {
              tenantId: args.tenantId,
              submissionType: 'EMP201',
              periodStart,
              periodEnd,
              deadline,
              totalPayeCents,
              totalUifCents,
              totalSdlCents,
              status: 'DRAFT',
              documentData: {
                staffCount: staffRecords.length,
                totalGrossRemunerationCents,
                totalDueCents,
              },
            },
          });
          submissionId = submission.id;
        }

        const output: GenerateEmp201Output = {
          id: submissionId,
          status: 'DRAFT',
          periodMonth: args.month,
          staffCount: staffRecords.length,
          totalGrossRemunerationCents,
          totalPayeCents,
          totalUifCents,
          totalSdlCents,
          totalDueCents,
          staffRecords,
          createdAt: new Date().toISOString(),
        };

        return {
          success: true,
          data: {
            status: 'DRAFT',
            requiresReview: true,
            warning: L2_WARNING,
            data: output,
          },
          metadata: {
            toolName: 'generate_emp201',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: staffRecords.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to generate EMP201: ${errorMessage}`,
          metadata: {
            toolName: 'generate_emp201',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Download SARS File Tool
 * Downloads a submission CSV file for upload to SARS eFiling.
 */
export function downloadSarsFile(
  prisma: PrismaService,
): McpToolDefinition<
  DownloadSarsFileInput,
  McpToolResult<DownloadSarsFileOutput>
> {
  return {
    name: 'download_sars_file',
    description:
      'Download a SARS submission CSV file for manual upload to SARS eFiling portal.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        submissionType: {
          type: 'string',
          description: 'Submission type: VAT201 or EMP201',
          enum: ['VAT201', 'EMP201'],
        },
        period: {
          type: 'string',
          description: 'Period identifier (YYYY-MM)',
        },
      },
      required: ['tenantId', 'submissionType', 'period'],
    },
    handler: async (
      args: DownloadSarsFileInput,
    ): Promise<McpToolResult<DownloadSarsFileOutput>> => {
      const startTime = Date.now();

      try {
        // Parse period
        const periodMatch = args.period.match(/^(\d{4})-(\d{2})$/);
        if (!periodMatch) {
          return {
            success: false,
            error: 'Invalid period format. Expected YYYY-MM',
            metadata: {
              toolName: 'download_sars_file',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        const year = parseInt(periodMatch[1], 10);
        const month = parseInt(periodMatch[2], 10);
        const periodStart = new Date(year, month - 1, 1);

        // Find the submission
        const submission = await prisma.sarsSubmission.findFirst({
          where: {
            tenantId: args.tenantId,
            submissionType: args.submissionType as 'VAT201' | 'EMP201',
            periodStart,
          },
          orderBy: { createdAt: 'desc' },
        });

        if (!submission) {
          return {
            success: false,
            error: `No ${args.submissionType} submission found for period ${args.period}`,
            metadata: {
              toolName: 'download_sars_file',
              executionMs: Date.now() - startTime,
              tenantId: args.tenantId,
            },
          };
        }

        // Generate CSV content based on submission type
        let csvContent: string;
        let fileName: string;

        switch (args.submissionType) {
          case 'VAT201':
            csvContent = generateVat201Csv(submission);
            fileName = `VAT201-${args.period}.csv`;
            break;
          case 'EMP201':
            csvContent = await generateEmp201Csv(
              prisma,
              args.tenantId,
              submission,
            );
            fileName = `EMP201-${args.period}.csv`;
            break;
          default:
            return {
              success: false,
              error: `Unknown submission type: ${args.submissionType}`,
              metadata: {
                toolName: 'download_sars_file',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
              },
            };
        }

        return {
          success: true,
          data: {
            fileName,
            contentType: 'text/csv',
            content: Buffer.from(csvContent).toString('base64'),
            submissionId: submission.id,
          },
          metadata: {
            toolName: 'download_sars_file',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to download SARS file: ${errorMessage}`,
          metadata: {
            toolName: 'download_sars_file',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Mark SARS Submitted Tool
 * Updates a submission status after manual upload to SARS eFiling.
 */
export function markSarsSubmitted(
  prisma: PrismaService,
): McpToolDefinition<
  MarkSarsSubmittedInput,
  McpToolResult<MarkSarsSubmittedOutput>
> {
  return {
    name: 'mark_sars_submitted',
    description:
      'Mark a SARS submission as submitted after manual upload to SARS eFiling portal.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        submissionId: {
          type: 'string',
          description: 'The submission ID to mark as submitted',
        },
        sarsReference: {
          type: 'string',
          description: 'SARS reference number from eFiling confirmation',
        },
        userId: {
          type: 'string',
          description: 'User ID for audit trail (optional)',
        },
      },
      required: ['tenantId', 'submissionId', 'sarsReference'],
    },
    handler: async (
      args: MarkSarsSubmittedInput,
    ): Promise<McpToolResult<MarkSarsSubmittedOutput>> => {
      const startTime = Date.now();

      try {
        // Update submission status using actual schema fields
        const submission = await prisma.sarsSubmission.update({
          where: {
            id: args.submissionId,
            tenantId: args.tenantId,
          },
          data: {
            status: 'SUBMITTED',
            sarsReference: args.sarsReference,
            submittedAt: new Date(),
            submittedBy: args.userId,
          },
        });

        return {
          success: true,
          data: {
            submissionId: submission.id,
            submissionType: submission.submissionType,
            status: 'SUBMITTED',
            sarsReference: args.sarsReference,
            submittedAt:
              submission.submittedAt?.toISOString() || new Date().toISOString(),
          },
          metadata: {
            toolName: 'mark_sars_submitted',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to mark submission: ${errorMessage}`,
          metadata: {
            toolName: 'mark_sars_submitted',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

// ============================================
// Helper Functions
// ============================================

/**
 * Mask SA ID number for privacy (show first 6 and last 2 digits)
 */
function maskIdNumber(idNumber: string): string {
  if (!idNumber || idNumber.length < 13) return idNumber;
  return `${idNumber.slice(0, 6)}*****${idNumber.slice(-2)}`;
}

/**
 * Format cents as ZAR currency string
 */
function formatCents(cents: number): string {
  return `R${(cents / 100).toFixed(2)}`;
}

/**
 * Generate VAT201 CSV content
 */
function generateVat201Csv(submission: {
  periodStart: Date;
  periodEnd: Date;
  outputVatCents: number | null;
  inputVatCents: number | null;
  netVatCents: number | null;
  documentData: unknown;
}): string {
  const docData = (submission.documentData || {}) as Record<string, unknown>;

  const rows = [
    ['Field', 'Value', 'Amount'],
    [
      'Period Start',
      submission.periodStart.toISOString().split('T')[0],
      '',
    ],
    ['Period End', submission.periodEnd.toISOString().split('T')[0], ''],
    [
      'Output VAT (collected)',
      String(submission.outputVatCents || 0),
      formatCents(submission.outputVatCents || 0),
    ],
    [
      'Input VAT (paid)',
      String(submission.inputVatCents || 0),
      formatCents(submission.inputVatCents || 0),
    ],
    [
      'Net VAT',
      String(submission.netVatCents || 0),
      formatCents(submission.netVatCents || 0),
    ],
    ['Direction', docData.isPayable ? 'PAYABLE' : 'REFUND', ''],
  ];

  return rows.map((row) => row.join(',')).join('\n');
}

/**
 * Generate EMP201 CSV content with staff details
 */
async function generateEmp201Csv(
  prisma: PrismaService,
  tenantId: string,
  submission: { periodStart: Date; periodEnd: Date },
): Promise<string> {
  const payrollRecords = await prisma.payroll.findMany({
    where: {
      tenantId,
      payPeriodStart: { lte: submission.periodEnd },
      payPeriodEnd: { gte: submission.periodStart },
    },
    include: {
      staff: true,
    },
  });

  const headerRow = [
    'Staff ID',
    'ID Number',
    'Name',
    'Gross Remuneration (cents)',
    'Gross Remuneration',
    'PAYE (cents)',
    'PAYE',
    'UIF (cents)',
    'UIF',
  ];

  const dataRows = payrollRecords.map((record) => {
    const uifTotal = record.uifEmployeeCents + record.uifEmployerCents;
    return [
      record.staffId,
      maskIdNumber(record.staff.idNumber),
      `${record.staff.firstName} ${record.staff.lastName}`,
      String(record.grossSalaryCents),
      formatCents(record.grossSalaryCents),
      String(record.payeCents),
      formatCents(record.payeCents),
      String(uifTotal),
      formatCents(uifTotal),
    ];
  });

  // Add totals row
  const totalGross = payrollRecords.reduce(
    (sum, r) => sum + r.grossSalaryCents,
    0,
  );
  const totalPaye = payrollRecords.reduce((sum, r) => sum + r.payeCents, 0);
  const totalUif = payrollRecords.reduce(
    (sum, r) => sum + r.uifEmployeeCents + r.uifEmployerCents,
    0,
  );
  const totalSdl = Math.round(totalGross * 0.01);

  const totalsRows = [
    [],
    ['TOTALS', '', '', String(totalGross), formatCents(totalGross), String(totalPaye), formatCents(totalPaye), String(totalUif), formatCents(totalUif)],
    ['SDL (1%)', '', '', '', '', '', '', String(totalSdl), formatCents(totalSdl)],
    ['TOTAL DUE', '', '', '', '', '', '', String(totalPaye + totalUif + totalSdl), formatCents(totalPaye + totalUif + totalSdl)],
  ];

  return [headerRow, ...dataRows, ...totalsRows]
    .map((row) => row.join(','))
    .join('\n');
}

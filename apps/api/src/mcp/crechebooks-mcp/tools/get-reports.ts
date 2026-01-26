/**
 * Get Reports Tool
 * TASK-SDK-002: CrecheBooks In-Process MCP Server
 *
 * Generates financial summaries from Transaction + Categorization data.
 * Supports: INCOME_EXPENSE, VAT_SUMMARY, MONTHLY_TOTALS, ACCOUNT_BREAKDOWN.
 */

import { PrismaService } from '../../../database/prisma/prisma.service';
import type {
  AccountBreakdownRecord,
  AccountBreakdownReport,
  GetReportsInput,
  IncomeExpenseReport,
  McpToolDefinition,
  McpToolResult,
  MonthlyTotalRecord,
  MonthlyTotalsReport,
  ReportOutput,
  VatGroupRecord,
  VatSummaryReport,
  VatType,
} from '../types/index';

export function getReports(
  prisma: PrismaService,
): McpToolDefinition<GetReportsInput, McpToolResult<ReportOutput>> {
  return {
    name: 'get_reports',
    description:
      'Generate financial reports for a tenant. Report types: INCOME_EXPENSE (totals), VAT_SUMMARY (VAT breakdown by type), MONTHLY_TOTALS (month-by-month), ACCOUNT_BREAKDOWN (by account code). All require a date range.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        reportType: {
          type: 'string',
          description: 'Type of financial report to generate',
          enum: [
            'INCOME_EXPENSE',
            'VAT_SUMMARY',
            'MONTHLY_TOTALS',
            'ACCOUNT_BREAKDOWN',
          ],
        },
        fromDate: {
          type: 'string',
          description: 'Report period start date (ISO date string, inclusive)',
        },
        toDate: {
          type: 'string',
          description: 'Report period end date (ISO date string, inclusive)',
        },
      },
      required: ['tenantId', 'reportType', 'fromDate', 'toDate'],
    },
    handler: async (
      args: GetReportsInput,
    ): Promise<McpToolResult<ReportOutput>> => {
      const startTime = Date.now();
      const period = { from: args.fromDate, to: args.toDate };

      try {
        const fromDate = new Date(args.fromDate);
        const toDate = new Date(args.toDate);

        const baseWhere = {
          tenantId: args.tenantId,
          isDeleted: false,
          date: {
            gte: fromDate,
            lte: toDate,
          },
        };

        switch (args.reportType) {
          case 'INCOME_EXPENSE': {
            const transactions = await prisma.transaction.findMany({
              where: baseWhere,
              select: {
                amountCents: true,
                isCredit: true,
              },
            });

            let totalIncomeCents = 0;
            let totalExpenseCents = 0;

            for (const tx of transactions) {
              if (tx.isCredit) {
                totalIncomeCents += tx.amountCents;
              } else {
                totalExpenseCents += tx.amountCents;
              }
            }

            const report: IncomeExpenseReport = {
              reportType: 'INCOME_EXPENSE',
              period,
              totalIncomeCents,
              totalExpenseCents,
              netCents: totalIncomeCents - totalExpenseCents,
              transactionCount: transactions.length,
            };

            return {
              success: true,
              data: report,
              metadata: {
                toolName: 'get_reports',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
                resultCount: transactions.length,
              },
            };
          }

          case 'VAT_SUMMARY': {
            const categorizations = await prisma.categorization.findMany({
              where: {
                transaction: {
                  tenantId: args.tenantId,
                  isDeleted: false,
                  date: {
                    gte: fromDate,
                    lte: toDate,
                  },
                },
              },
              select: {
                vatType: true,
                vatAmountCents: true,
                transaction: {
                  select: {
                    amountCents: true,
                  },
                },
              },
            });

            const groupMap = new Map<
              string,
              {
                transactionCount: number;
                totalAmountCents: number;
                totalVatCents: number;
              }
            >();

            for (const cat of categorizations) {
              const key = cat.vatType;
              const existing = groupMap.get(key) ?? {
                transactionCount: 0,
                totalAmountCents: 0,
                totalVatCents: 0,
              };
              existing.transactionCount += 1;
              existing.totalAmountCents += cat.transaction.amountCents;
              existing.totalVatCents += cat.vatAmountCents ?? 0;
              groupMap.set(key, existing);
            }

            const groups: VatGroupRecord[] = Array.from(groupMap.entries()).map(
              ([vatType, data]) => ({
                vatType: vatType as VatType,
                transactionCount: data.transactionCount,
                totalAmountCents: data.totalAmountCents,
                totalVatCents: data.totalVatCents,
              }),
            );

            const totalVatCents = groups.reduce(
              (sum, g) => sum + g.totalVatCents,
              0,
            );

            const report: VatSummaryReport = {
              reportType: 'VAT_SUMMARY',
              period,
              groups,
              totalVatCents,
            };

            return {
              success: true,
              data: report,
              metadata: {
                toolName: 'get_reports',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
                resultCount: groups.length,
              },
            };
          }

          case 'MONTHLY_TOTALS': {
            const transactions = await prisma.transaction.findMany({
              where: baseWhere,
              select: {
                date: true,
                amountCents: true,
                isCredit: true,
              },
              orderBy: { date: 'asc' },
            });

            const monthMap = new Map<
              string,
              {
                incomeCents: number;
                expenseCents: number;
                transactionCount: number;
              }
            >();

            for (const tx of transactions) {
              const txDate = tx.date;
              const year = txDate.getFullYear();
              const month = String(txDate.getMonth() + 1).padStart(2, '0');
              const key = `${String(year)}-${month}`;

              const existing = monthMap.get(key) ?? {
                incomeCents: 0,
                expenseCents: 0,
                transactionCount: 0,
              };

              if (tx.isCredit) {
                existing.incomeCents += tx.amountCents;
              } else {
                existing.expenseCents += tx.amountCents;
              }
              existing.transactionCount += 1;
              monthMap.set(key, existing);
            }

            const months: MonthlyTotalRecord[] = Array.from(monthMap.entries())
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, data]) => ({
                month,
                incomeCents: data.incomeCents,
                expenseCents: data.expenseCents,
                netCents: data.incomeCents - data.expenseCents,
                transactionCount: data.transactionCount,
              }));

            const report: MonthlyTotalsReport = {
              reportType: 'MONTHLY_TOTALS',
              period,
              months,
            };

            return {
              success: true,
              data: report,
              metadata: {
                toolName: 'get_reports',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
                resultCount: months.length,
              },
            };
          }

          case 'ACCOUNT_BREAKDOWN': {
            const categorizations = await prisma.categorization.findMany({
              where: {
                transaction: {
                  tenantId: args.tenantId,
                  isDeleted: false,
                  date: {
                    gte: fromDate,
                    lte: toDate,
                  },
                },
              },
              select: {
                accountCode: true,
                accountName: true,
                transaction: {
                  select: {
                    amountCents: true,
                    isCredit: true,
                  },
                },
              },
            });

            const accountMap = new Map<
              string,
              {
                accountName: string;
                totalCreditCents: number;
                totalDebitCents: number;
                transactionCount: number;
              }
            >();

            for (const cat of categorizations) {
              const key = cat.accountCode;
              const existing = accountMap.get(key) ?? {
                accountName: cat.accountName,
                totalCreditCents: 0,
                totalDebitCents: 0,
                transactionCount: 0,
              };

              if (cat.transaction.isCredit) {
                existing.totalCreditCents += cat.transaction.amountCents;
              } else {
                existing.totalDebitCents += cat.transaction.amountCents;
              }
              existing.transactionCount += 1;
              accountMap.set(key, existing);
            }

            const accounts: AccountBreakdownRecord[] = Array.from(
              accountMap.entries(),
            ).map(([accountCode, data]) => ({
              accountCode,
              accountName: data.accountName,
              totalCreditCents: data.totalCreditCents,
              totalDebitCents: data.totalDebitCents,
              netCents: data.totalCreditCents - data.totalDebitCents,
              transactionCount: data.transactionCount,
            }));

            const report: AccountBreakdownReport = {
              reportType: 'ACCOUNT_BREAKDOWN',
              period,
              accounts,
            };

            return {
              success: true,
              data: report,
              metadata: {
                toolName: 'get_reports',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
                resultCount: accounts.length,
              },
            };
          }

          default: {
            return {
              success: false,
              error: `Unknown report type: ${args.reportType as string}`,
              metadata: {
                toolName: 'get_reports',
                executionMs: Date.now() - startTime,
                tenantId: args.tenantId,
              },
            };
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to generate report: ${errorMessage}`,
          metadata: {
            toolName: 'get_reports',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Match Payments Tool
 * TASK-SDK-003: CrecheBooks MCP Server Mutations
 *
 * Runs AI-powered payment matching to auto-allocate bank transactions to invoices.
 * Wraps the existing PaymentMatchingService for MCP access.
 */

import { PaymentMatchingService } from '../../../../database/services/payment-matching.service';
import { PrismaService } from '../../../../database/prisma/prisma.service';
import type {
  MatchPaymentsInput,
  MatchPaymentsOutput,
  PaymentMatchResult,
} from '../../types/mutations';
import type { McpToolDefinition, McpToolResult } from '../../types/index';

/** Default minimum confidence threshold for auto-apply (80%) */
const DEFAULT_MIN_CONFIDENCE = 0.8;

/** Default maximum matches to process per run */
const DEFAULT_MAX_MATCHES = 50;

export function matchPayments(
  prisma: PrismaService,
  paymentMatchingService: PaymentMatchingService,
): McpToolDefinition<MatchPaymentsInput, McpToolResult<MatchPaymentsOutput>> {
  return {
    name: 'match_payments',
    description:
      'Run AI-powered payment matching to auto-allocate bank transactions to invoices. Finds unallocated credit transactions, matches them against outstanding invoices using reference, amount, and name similarity, and optionally auto-applies high-confidence matches.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: {
          type: 'string',
          description: 'Tenant ID (required for data isolation)',
        },
        dryRun: {
          type: 'boolean',
          description:
            'Preview matches without applying them. Defaults to false.',
        },
        minConfidence: {
          type: 'number',
          description:
            'Minimum confidence threshold for auto-apply (0-1). Defaults to 0.8 (80%).',
          minimum: 0,
          maximum: 1,
        },
        maxMatches: {
          type: 'number',
          description:
            'Maximum number of matches to process. Defaults to 50.',
          minimum: 1,
          maximum: 500,
        },
      },
      required: ['tenantId'],
    },
    handler: async (
      args: MatchPaymentsInput,
    ): Promise<McpToolResult<MatchPaymentsOutput>> => {
      const startTime = Date.now();
      const minConfidence = args.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
      const maxMatches = args.maxMatches ?? DEFAULT_MAX_MATCHES;
      const dryRun = args.dryRun ?? false;

      // Convert minConfidence from 0-1 to 0-100 for internal service
      const minConfidencePercent = Math.round(minConfidence * 100);

      try {
        // For dry run, we need to query transactions and invoices to show potential matches
        // without actually applying them
        if (dryRun) {
          return await handleDryRun(
            prisma,
            args.tenantId,
            minConfidencePercent,
            maxMatches,
            startTime,
          );
        }

        // Use PaymentMatchingService for actual matching
        const result = await paymentMatchingService.matchPayments({
          tenantId: args.tenantId,
        });

        // Convert service result to MCP output format
        const matches: PaymentMatchResult[] = result.results.map((r) => {
          if (r.status === 'AUTO_APPLIED' && r.appliedMatch) {
            return {
              transactionId: r.transactionId,
              invoiceId: r.appliedMatch.invoiceId,
              invoiceNumber: r.appliedMatch.invoiceNumber,
              amountCents: r.appliedMatch.amountCents,
              confidence: r.appliedMatch.confidenceScore / 100,
              action: 'AUTO_APPLY' as const,
              reasoning: r.reason ?? 'High confidence match',
              applied: true,
            };
          } else if (r.status === 'REVIEW_REQUIRED' && r.candidates?.length) {
            const bestCandidate = r.candidates[0];
            return {
              transactionId: r.transactionId,
              invoiceId: bestCandidate.invoiceId,
              invoiceNumber: bestCandidate.invoiceNumber,
              amountCents: bestCandidate.transactionAmountCents,
              confidence: bestCandidate.confidenceScore / 100,
              action: 'REVIEW_REQUIRED' as const,
              reasoning: r.reason ?? 'Review required',
              applied: false,
            };
          } else {
            return {
              transactionId: r.transactionId,
              invoiceId: '',
              invoiceNumber: '',
              amountCents: 0,
              confidence: 0,
              action: 'NO_MATCH' as const,
              reasoning: r.reason ?? 'No matching invoices found',
              applied: false,
            };
          }
        });

        // Apply maxMatches limit
        const limitedMatches = matches.slice(0, maxMatches);

        return {
          success: true,
          data: {
            matches: limitedMatches,
            autoApplied: result.autoApplied,
            pendingReview: result.reviewRequired,
            totalProcessed: result.processed,
          },
          metadata: {
            toolName: 'match_payments',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
            resultCount: limitedMatches.length,
          },
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `Failed to match payments: ${errorMessage}`,
          metadata: {
            toolName: 'match_payments',
            executionMs: Date.now() - startTime,
            tenantId: args.tenantId,
          },
        };
      }
    },
  };
}

/**
 * Handle dry run mode - preview matches without applying
 */
async function handleDryRun(
  prisma: PrismaService,
  tenantId: string,
  minConfidencePercent: number,
  maxMatches: number,
  startTime: number,
): Promise<McpToolResult<MatchPaymentsOutput>> {
  // Query unallocated credit transactions
  const allocatedTransactionIds = await prisma.payment
    .findMany({
      where: {
        tenantId,
        isReversed: false,
        transactionId: { not: null },
      },
      select: { transactionId: true },
    })
    .then((payments) =>
      payments
        .map((p) => p.transactionId)
        .filter((id): id is string => id !== null),
    );

  const unallocatedTransactions = await prisma.transaction.findMany({
    where: {
      tenantId,
      isCredit: true,
      isDeleted: false,
      id: { notIn: allocatedTransactionIds },
    },
    orderBy: { date: 'desc' },
    take: maxMatches,
  });

  if (unallocatedTransactions.length === 0) {
    return {
      success: true,
      data: {
        matches: [],
        autoApplied: 0,
        pendingReview: 0,
        totalProcessed: 0,
      },
      metadata: {
        toolName: 'match_payments',
        executionMs: Date.now() - startTime,
        tenantId,
        resultCount: 0,
      },
    };
  }

  // Get outstanding invoices with relations
  const outstandingInvoices = await prisma.invoice.findMany({
    where: {
      tenantId,
      isDeleted: false,
      status: { notIn: ['PAID', 'VOID'] },
    },
    include: {
      parent: true,
      child: true,
    },
    orderBy: { dueDate: 'asc' },
  });

  const matches: PaymentMatchResult[] = [];
  let potentialAutoApply = 0;
  let pendingReview = 0;

  for (const transaction of unallocatedTransactions) {
    // Simple matching for dry run preview
    const transactionAmount = Math.abs(transaction.amountCents);
    let bestMatch: {
      invoice: (typeof outstandingInvoices)[0];
      confidence: number;
      reasons: string[];
    } | null = null;

    for (const invoice of outstandingInvoices) {
      const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;
      if (outstandingAmount <= 0) continue;

      let confidence = 0;
      const reasons: string[] = [];

      // Reference match (0-40 points)
      if (transaction.reference) {
        const normRef = normalizeString(transaction.reference);
        const normInv = normalizeString(invoice.invoiceNumber);

        if (normRef === normInv) {
          confidence += 40;
          reasons.push('Exact reference match');
        } else if (normRef.includes(normInv)) {
          confidence += 30;
          reasons.push('Reference contains invoice number');
        }
      }

      // Amount match (0-40 points)
      const amountDiff = Math.abs(transactionAmount - outstandingAmount);
      const percentDiff =
        outstandingAmount > 0 ? amountDiff / outstandingAmount : 1;

      if (amountDiff === 0) {
        confidence += 40;
        reasons.push('Exact amount match');
      } else if (percentDiff <= 0.01 || amountDiff <= 100) {
        confidence += 35;
        reasons.push('Amount within 1% or R1');
      } else if (percentDiff <= 0.05) {
        confidence += 25;
        reasons.push('Amount within 5%');
      } else if (percentDiff <= 0.1) {
        confidence += 15;
        reasons.push('Amount within 10%');
      } else if (transactionAmount < outstandingAmount) {
        confidence += 10;
        reasons.push('Partial payment');
      }

      // Name match (0-20 points)
      if (transaction.payeeName) {
        const normPayee = normalizeString(transaction.payeeName);
        const parentName = `${invoice.parent.firstName} ${invoice.parent.lastName}`;
        const normParent = normalizeString(parentName);

        if (normPayee === normParent) {
          confidence += 20;
          reasons.push('Exact name match');
        } else if (
          normPayee.includes(normalizeString(invoice.parent.lastName))
        ) {
          confidence += 10;
          reasons.push('Last name match');
        }
      }

      if (confidence > (bestMatch?.confidence ?? 0)) {
        bestMatch = { invoice, confidence, reasons };
      }
    }

    if (bestMatch && bestMatch.confidence >= 20) {
      const action =
        bestMatch.confidence >= minConfidencePercent
          ? 'AUTO_APPLY'
          : 'REVIEW_REQUIRED';

      if (action === 'AUTO_APPLY') {
        potentialAutoApply++;
      } else {
        pendingReview++;
      }

      matches.push({
        transactionId: transaction.id,
        invoiceId: bestMatch.invoice.id,
        invoiceNumber: bestMatch.invoice.invoiceNumber,
        amountCents: transactionAmount,
        confidence: bestMatch.confidence / 100,
        action: action as 'AUTO_APPLY' | 'REVIEW_REQUIRED',
        reasoning: bestMatch.reasons.join('; '),
        applied: false, // Dry run - never applied
      });
    } else {
      matches.push({
        transactionId: transaction.id,
        invoiceId: '',
        invoiceNumber: '',
        amountCents: transactionAmount,
        confidence: 0,
        action: 'NO_MATCH',
        reasoning: 'No matching invoices found',
        applied: false,
      });
    }
  }

  return {
    success: true,
    data: {
      matches,
      autoApplied: potentialAutoApply, // Would-be auto-applied if not dry run
      pendingReview,
      totalProcessed: unallocatedTransactions.length,
    },
    metadata: {
      toolName: 'match_payments',
      executionMs: Date.now() - startTime,
      tenantId,
      resultCount: matches.length,
    },
  };
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

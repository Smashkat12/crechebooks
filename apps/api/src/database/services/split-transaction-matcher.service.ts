/**
 * Split Transaction Matcher Service
 * TASK-RECON-035: Split Transaction Matching
 *
 * Service for matching single bank transactions to multiple invoices (1-to-many)
 * or multiple payments to single invoices (many-to-1) using subset sum algorithm.
 */

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma';
import {
  SuggestSplitMatchDto,
  ConfirmSplitMatchDto,
  SplitMatchResponseDto,
  SplitMatchComponentResponseDto,
  SplitMatchTypeDto,
  SplitMatchStatusDto,
  SplitMatchFilterDto,
} from '../dto/split-transaction.dto';
import { SplitMatchStatus, SplitMatchType } from '@prisma/client';

/**
 * Interface for invoice candidate in subset sum
 */
interface InvoiceCandidate {
  id: string;
  amountCents: number;
  invoiceNumber: string | null;
  notes: string | null;
}

/**
 * Interface for subset sum result
 */
interface SubsetSumResult {
  invoices: InvoiceCandidate[];
  totalCents: number;
  remainderCents: number;
}

@Injectable()
export class SplitTransactionMatcherService {
  private readonly logger = new Logger(SplitTransactionMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Suggest split matches for a bank transaction
   * Uses subset sum algorithm to find invoice combinations that match the transaction amount
   */
  async suggestSplitMatches(
    tenantId: string,
    dto: SuggestSplitMatchDto,
  ): Promise<SplitMatchResponseDto[]> {
    const toleranceCents = dto.tolerance_cents ?? 100;
    const maxComponents = dto.max_components ?? 10;

    this.logger.log(
      `Suggesting split matches for transaction ${dto.bank_transaction_id}, amount: ${dto.amount_cents} cents, tolerance: ${toleranceCents} cents`,
    );

    // Get unpaid invoices for the tenant
    const unpaidInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: { in: ['SENT', 'VIEWED', 'OVERDUE'] },
        isDeleted: false,
      },
      select: {
        id: true,
        totalCents: true,
        invoiceNumber: true,
        notes: true,
      },
      orderBy: { totalCents: 'desc' },
    });

    if (unpaidInvoices.length < 2) {
      this.logger.log('Not enough unpaid invoices for split matching');
      return [];
    }

    // Convert to candidates
    const candidates: InvoiceCandidate[] = unpaidInvoices.map((inv) => ({
      id: inv.id,
      amountCents: inv.totalCents,
      invoiceNumber: inv.invoiceNumber,
      notes: inv.notes,
    }));

    // Find all valid subsets using subset sum algorithm
    const validSubsets = this.findSubsetSums(
      candidates,
      dto.amount_cents,
      toleranceCents,
      maxComponents,
    );

    if (validSubsets.length === 0) {
      this.logger.log('No valid split combinations found');
      return [];
    }

    // Create split match suggestions in the database
    const suggestions: SplitMatchResponseDto[] = [];

    for (const subset of validSubsets.slice(0, 5)) {
      // Limit to top 5 suggestions
      const splitMatch = await this.prisma.splitMatch.create({
        data: {
          tenantId,
          bankTransactionId: dto.bank_transaction_id,
          matchType: SplitMatchType.ONE_TO_MANY,
          totalAmountCents: dto.amount_cents,
          matchedAmountCents: subset.totalCents,
          remainderCents: subset.remainderCents,
          status: SplitMatchStatus.PENDING,
          components: {
            create: subset.invoices.map((inv) => ({
              invoiceId: inv.id,
              amountCents: inv.amountCents,
            })),
          },
        },
        include: {
          components: {
            include: {
              invoice: {
                select: {
                  invoiceNumber: true,
                  notes: true,
                },
              },
            },
          },
        },
      });

      suggestions.push(this.mapToResponseDto(splitMatch));
    }

    this.logger.log(`Found ${suggestions.length} split match suggestions`);
    return suggestions;
  }

  /**
   * Confirm a split match and create payments
   * Uses Prisma transaction for atomic operations
   */
  async confirmSplitMatch(
    tenantId: string,
    dto: ConfirmSplitMatchDto,
    userId: string,
  ): Promise<{
    splitMatch: SplitMatchResponseDto;
    invoicesPaid: number;
    paymentsCreated: number;
  }> {
    this.logger.log(`Confirming split match ${dto.split_match_id}`);

    // Fetch the split match
    const existingMatch = await this.prisma.splitMatch.findFirst({
      where: {
        id: dto.split_match_id,
        tenantId,
      },
      include: {
        components: true,
      },
    });

    if (!existingMatch) {
      throw new NotFoundException(
        `Split match ${dto.split_match_id} not found`,
      );
    }

    if (existingMatch.status !== SplitMatchStatus.PENDING) {
      throw new BadRequestException(
        `Split match is already ${existingMatch.status.toLowerCase()}`,
      );
    }

    // Use transaction for atomic operations
    const result = await this.prisma.$transaction(async (tx) => {
      let invoicesPaid = 0;
      let paymentsCreated = 0;

      // If custom components provided, update the split match
      if (dto.components && dto.components.length > 0) {
        // Delete existing components
        await tx.splitMatchComponent.deleteMany({
          where: { splitMatchId: dto.split_match_id },
        });

        // Calculate new totals
        const matchedAmountCents = dto.components.reduce(
          (sum, c) => sum + c.amount_cents,
          0,
        );

        // Create new components
        await tx.splitMatchComponent.createMany({
          data: dto.components.map((c) => ({
            splitMatchId: dto.split_match_id,
            invoiceId: c.invoice_id || null,
            paymentId: c.payment_id || null,
            amountCents: c.amount_cents,
          })),
        });

        // Update split match totals
        await tx.splitMatch.update({
          where: { id: dto.split_match_id },
          data: {
            matchedAmountCents,
            remainderCents: existingMatch.totalAmountCents - matchedAmountCents,
          },
        });
      }

      // Confirm the split match
      const confirmedMatch = await tx.splitMatch.update({
        where: { id: dto.split_match_id },
        data: {
          status: SplitMatchStatus.CONFIRMED,
          confirmedBy: userId,
          confirmedAt: new Date(),
        },
        include: {
          components: {
            include: {
              invoice: {
                select: {
                  invoiceNumber: true,
                  notes: true,
                },
              },
            },
          },
        },
      });

      // Create payments and update invoice statuses
      for (const component of confirmedMatch.components) {
        if (component.invoiceId) {
          // Create payment record
          await tx.payment.create({
            data: {
              tenantId,
              invoiceId: component.invoiceId,
              amountCents: component.amountCents,
              paymentDate: new Date(),
              reference: `Split match ${dto.split_match_id}`,
              matchType: 'EXACT', // Using EXACT as it's a confirmed match
              matchedBy: 'USER', // User confirmed the split match
            },
          });
          paymentsCreated++;

          // Check if invoice is fully paid
          const invoice = await tx.invoice.findUnique({
            where: { id: component.invoiceId },
            select: { totalCents: true },
          });

          const totalPayments = await tx.payment.aggregate({
            where: {
              invoiceId: component.invoiceId,
              isReversed: false,
            },
            _sum: { amountCents: true },
          });

          const paidAmount = totalPayments._sum.amountCents || 0;

          if (invoice && paidAmount >= invoice.totalCents) {
            await tx.invoice.update({
              where: { id: component.invoiceId },
              data: { status: 'PAID' },
            });
            invoicesPaid++;
          }
        }
      }

      return {
        splitMatch: this.mapToResponseDto(confirmedMatch),
        invoicesPaid,
        paymentsCreated,
      };
    });

    this.logger.log(
      `Split match confirmed: ${result.invoicesPaid} invoices paid, ${result.paymentsCreated} payments created`,
    );

    return result;
  }

  /**
   * Reject a split match suggestion
   */
  async rejectSplitMatch(
    tenantId: string,
    splitMatchId: string,
    _reason?: string,
  ): Promise<SplitMatchResponseDto> {
    this.logger.log(`Rejecting split match ${splitMatchId}`);

    const existingMatch = await this.prisma.splitMatch.findFirst({
      where: {
        id: splitMatchId,
        tenantId,
      },
    });

    if (!existingMatch) {
      throw new NotFoundException(`Split match ${splitMatchId} not found`);
    }

    if (existingMatch.status !== SplitMatchStatus.PENDING) {
      throw new BadRequestException(
        `Split match is already ${existingMatch.status.toLowerCase()}`,
      );
    }

    const rejectedMatch = await this.prisma.splitMatch.update({
      where: { id: splitMatchId },
      data: {
        status: SplitMatchStatus.REJECTED,
      },
      include: {
        components: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                notes: true,
              },
            },
          },
        },
      },
    });

    return this.mapToResponseDto(rejectedMatch);
  }

  /**
   * Get split matches with filtering and pagination
   */
  async getSplitMatches(
    tenantId: string,
    filter: SplitMatchFilterDto,
  ): Promise<{
    data: SplitMatchResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = filter.page ?? 1;
    const limit = filter.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = {
      tenantId,
      ...(filter.status && { status: filter.status as SplitMatchStatus }),
      ...(filter.match_type && {
        matchType: filter.match_type as SplitMatchType,
      }),
    };

    const [matches, total] = await Promise.all([
      this.prisma.splitMatch.findMany({
        where,
        include: {
          components: {
            include: {
              invoice: {
                select: {
                  invoiceNumber: true,
                  notes: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.splitMatch.count({ where }),
    ]);

    return {
      data: matches.map((m) => this.mapToResponseDto(m)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get a single split match by ID
   */
  async getSplitMatchById(
    tenantId: string,
    splitMatchId: string,
  ): Promise<SplitMatchResponseDto> {
    const match = await this.prisma.splitMatch.findFirst({
      where: {
        id: splitMatchId,
        tenantId,
      },
      include: {
        components: {
          include: {
            invoice: {
              select: {
                invoiceNumber: true,
                notes: true,
              },
            },
          },
        },
      },
    });

    if (!match) {
      throw new NotFoundException(`Split match ${splitMatchId} not found`);
    }

    return this.mapToResponseDto(match);
  }

  /**
   * Find subsets of invoices that sum to the target amount within tolerance
   * Uses dynamic programming approach with memoization for efficiency
   */
  private findSubsetSums(
    candidates: InvoiceCandidate[],
    targetCents: number,
    toleranceCents: number,
    maxComponents: number,
  ): SubsetSumResult[] {
    const results: SubsetSumResult[] = [];
    const minTarget = targetCents - toleranceCents;
    const maxTarget = targetCents + toleranceCents;

    // Filter candidates that are individually too large
    const validCandidates = candidates.filter(
      (c) => c.amountCents <= maxTarget,
    );

    if (validCandidates.length < 2) {
      return [];
    }

    // Use iterative approach with pruning for better performance
    this.findSubsetsRecursive(
      validCandidates,
      0,
      [],
      0,
      minTarget,
      maxTarget,
      maxComponents,
      results,
      targetCents,
    );

    // Sort by smallest remainder (best matches first)
    results.sort((a, b) => a.remainderCents - b.remainderCents);

    return results;
  }

  /**
   * Recursive helper for finding valid subsets
   */
  private findSubsetsRecursive(
    candidates: InvoiceCandidate[],
    index: number,
    currentSubset: InvoiceCandidate[],
    currentSum: number,
    minTarget: number,
    maxTarget: number,
    maxComponents: number,
    results: SubsetSumResult[],
    targetCents: number,
  ): void {
    // Limit results to avoid performance issues
    if (results.length >= 20) {
      return;
    }

    // Check if current subset is valid (at least 2 components and within tolerance)
    if (
      currentSubset.length >= 2 &&
      currentSum >= minTarget &&
      currentSum <= maxTarget
    ) {
      results.push({
        invoices: [...currentSubset],
        totalCents: currentSum,
        remainderCents: Math.abs(targetCents - currentSum),
      });
    }

    // Stop if we've reached max components or processed all candidates
    if (currentSubset.length >= maxComponents || index >= candidates.length) {
      return;
    }

    // Prune: if current sum already exceeds max target, skip
    if (currentSum > maxTarget) {
      return;
    }

    // Try including current candidate
    const candidate = candidates[index];
    currentSubset.push(candidate);
    this.findSubsetsRecursive(
      candidates,
      index + 1,
      currentSubset,
      currentSum + candidate.amountCents,
      minTarget,
      maxTarget,
      maxComponents,
      results,
      targetCents,
    );
    currentSubset.pop();

    // Try excluding current candidate
    this.findSubsetsRecursive(
      candidates,
      index + 1,
      currentSubset,
      currentSum,
      minTarget,
      maxTarget,
      maxComponents,
      results,
      targetCents,
    );
  }

  /**
   * Map database entity to response DTO
   */
  private mapToResponseDto(match: {
    id: string;
    bankTransactionId: string;
    matchType: SplitMatchType;
    totalAmountCents: number;
    matchedAmountCents: number;
    remainderCents: number;
    status: SplitMatchStatus;
    confirmedBy: string | null;
    confirmedAt: Date | null;
    createdAt: Date;
    components: Array<{
      id: string;
      invoiceId: string | null;
      paymentId: string | null;
      amountCents: number;
      invoice?: {
        invoiceNumber: string | null;
        notes: string | null;
      } | null;
    }>;
  }): SplitMatchResponseDto {
    return {
      id: match.id,
      bank_transaction_id: match.bankTransactionId,
      match_type: match.matchType as SplitMatchTypeDto,
      total_amount_cents: match.totalAmountCents,
      matched_amount_cents: match.matchedAmountCents,
      remainder_cents: match.remainderCents,
      status: match.status as SplitMatchStatusDto,
      confirmed_by: match.confirmedBy,
      confirmed_at: match.confirmedAt?.toISOString() || null,
      created_at: match.createdAt.toISOString(),
      components: match.components.map(
        (c): SplitMatchComponentResponseDto => ({
          id: c.id,
          invoice_id: c.invoiceId,
          payment_id: c.paymentId,
          amount_cents: c.amountCents,
          invoice_number: c.invoice?.invoiceNumber || null,
          invoice_description: c.invoice?.notes || null,
        }),
      ),
    };
  }
}

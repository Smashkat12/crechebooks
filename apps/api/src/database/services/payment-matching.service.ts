/**
 * Payment Matching Service
 * TASK-PAY-011: Payment Matching Service
 * TASK-RECON-001: Enhanced with Amount Tolerance Matching
 *
 * @module database/services/payment-matching
 * @description Confidence-based payment matching service that matches
 * bank transactions (credits) to outstanding invoices using a scoring algorithm.
 *
 * Confidence Scoring Algorithm (0-100 points):
 * - Reference Match: 0-40 points (exact=40, contains=30, suffix=15)
 * - Amount Match: 0-40 points (exact=40, within tolerance=35-38, 1%=35, 5%=25, 10%=15, partial=10)
 * - Name Similarity: 0-20 points (exact=20, >0.8=15, >0.6=10, >0.4=5)
 *
 * Amount Tolerance (TASK-RECON-001):
 * - Default tolerance: 1 cent
 * - Bank fee tolerance: R5 (500 cents)
 * - Percentage tolerance: 0.5% for large amounts
 * - Confidence adjusted based on deviation amount
 *
 * Auto-apply rules:
 * - Single match with confidence >= 80%: auto-apply
 * - Multiple high-confidence matches: flag for review (ambiguous)
 * - Confidence < 80%: flag for review
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, Transaction, Parent, Child, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentRepository } from '../repositories/payment.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { AuditLogService } from './audit-log.service';
import {
  MatchingBatchResult,
  TransactionMatchResult,
  MatchCandidate,
  AppliedMatch,
  MatchConfidenceLevel,
  ConfidenceResult,
  MatchPaymentsDto,
  ApplyMatchDto,
} from '../dto/payment-matching.dto';
import { MatchType, MatchedBy } from '../entities/payment.entity';
import { InvoiceStatus } from '../entities/invoice.entity';
import { AuditAction } from '../entities/audit-log.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { PaymentMatcherAgent } from '../../agents/payment-matcher/matcher.agent';
import {
  MatchDecision,
  InvoiceCandidate,
} from '../../agents/payment-matcher/interfaces/matcher.interface';
import {
  isAmountWithinTolerance,
  AmountToleranceConfig,
  createBankFeeTolerance,
} from './amount-tolerance.util';
import { TOLERANCE_DEFAULTS } from '../constants/tolerance.constants';

/** Confidence threshold for auto-apply (single high-confidence match) */
const AUTO_APPLY_THRESHOLD = 80;

/**
 * Lower threshold for name-identified matches.
 * In SA creche payments, the child name in the bank description IS the
 * payment reference. When a strong name match (full name, initial+surname)
 * uniquely identifies one parent, auto-apply even with partial payments.
 */
const NAME_IDENTIFIED_THRESHOLD = 55;

/**
 * Match reason substrings that indicate a strong, unambiguous name match.
 * These patterns identify the payer with high certainty — full child/parent
 * name found, initial+surname, or high string similarity (>85%).
 *
 * "Unique first name" is also strong: if only one child in the entire tenant
 * has that first name, it's unambiguous (e.g., "Leano" → Leano Mogashoa,
 * "Sethu" → Siphosethu Skhosana). This is safe because the name-identified
 * path already de-duplicates by parentId.
 *
 * Excluded: generic "First name found" and "Surname match" when the name
 * is shared (e.g., "Thatego" matches both Mphela and Madisa).
 */
const STRONG_NAME_PATTERNS = [
  'exact name match',
  'first and last name found',
  'initial + surname match',
  'family initial + surname match',
  'strong name match',
  'unique first name match', // covers both exact and similarity variants
];

/** Confidence threshold for agent decision (ambiguous matches) */
const AGENT_CONFIDENCE_HIGH = 85;

/** Confidence threshold for review required */
const AGENT_CONFIDENCE_MEDIUM = 60;

/** Minimum confidence to include as a candidate for review */
const CANDIDATE_THRESHOLD = 20;

/** Maximum candidates to return for review */
const MAX_CANDIDATES = 5;

/** Maximum retries for agent calls */
const MAX_AGENT_RETRIES = 3;

/** Invoice with parent and child relations */
type InvoiceWithRelations = Invoice & { parent: Parent; child: Child };

@Injectable()
export class PaymentMatchingService {
  private readonly logger = new Logger(PaymentMatchingService.name);

  /**
   * Set of child first names (lowercased) that are unique across the tenant.
   * Built at the start of each matchPayments batch from outstanding invoices.
   * Used by matchNameAgainst to upgrade first-name-only matches to strong
   * when the name is unambiguous.
   */
  private uniqueFirstNames: Set<string> = new Set();

  constructor(
    private readonly prisma: PrismaService,
    private readonly paymentRepo: PaymentRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly auditLogService: AuditLogService,
    private readonly paymentAgent: PaymentMatcherAgent,
  ) {}

  /**
   * Match transactions to outstanding invoices
   * @param dto - Contains tenantId and optional transactionIds
   * @returns Batch result with statistics and individual results
   */
  async matchPayments(dto: MatchPaymentsDto): Promise<MatchingBatchResult> {
    this.logger.log(`Starting payment matching for tenant ${dto.tenantId}`);

    // 1. Get unallocated credit transactions
    const transactions = await this.getUnallocatedCredits(
      dto.tenantId!,
      dto.transactionIds,
    );

    if (transactions.length === 0) {
      this.logger.log('No unallocated transactions to process');
      return {
        processed: 0,
        autoApplied: 0,
        reviewRequired: 0,
        noMatch: 0,
        results: [],
      };
    }

    // 2. Get outstanding invoices with parent/child relations
    const outstandingInvoices = await this.getOutstandingInvoices(
      dto.tenantId!,
    );

    // Build unique first name set for this tenant's children
    // A name is "unique" if only one distinct child has it — safe for first-name-only matching
    // Count by childId (not invoice) to avoid duplicates from multiple invoices per child
    const childNameMap = new Map<string, Set<string>>(); // firstName → set of childIds
    for (const inv of outstandingInvoices) {
      const name = inv.child.firstName.toLowerCase().trim();
      if (!childNameMap.has(name)) childNameMap.set(name, new Set());
      childNameMap.get(name)!.add(inv.childId);
    }
    this.uniqueFirstNames = new Set(
      [...childNameMap.entries()]
        .filter(([, childIds]) => childIds.size === 1)
        .map(([name]) => name),
    );
    this.logger.log(
      `Unique first names: ${this.uniqueFirstNames.size} of ${childNameMap.size}`,
    );

    if (outstandingInvoices.length === 0) {
      this.logger.log('No outstanding invoices to match against');
      return {
        processed: transactions.length,
        autoApplied: 0,
        reviewRequired: 0,
        noMatch: transactions.length,
        results: transactions.map((t) => ({
          transactionId: t.id,
          status: 'NO_MATCH' as const,
          reason: 'No outstanding invoices found',
        })),
      };
    }

    // 3. Process each transaction
    const results: TransactionMatchResult[] = [];
    let autoApplied = 0;
    let reviewRequired = 0;
    let noMatch = 0;

    for (const transaction of transactions) {
      // Skip if already allocated (race condition check)
      if (await this.isTransactionAllocated(transaction.id)) {
        results.push({
          transactionId: transaction.id,
          status: 'NO_MATCH',
          reason: 'Transaction already allocated',
        });
        noMatch++;
        continue;
      }

      // Try exact matches first (reference + amount)
      const exactMatches = this.findExactMatches(
        transaction,
        outstandingInvoices,
      );

      if (exactMatches.length === 1) {
        // Single exact match - auto-apply
        const applied = await this.autoApplyMatch(
          exactMatches[0],
          dto.tenantId!,
        );
        results.push({
          transactionId: transaction.id,
          status: 'AUTO_APPLIED',
          appliedMatch: applied,
          reason: 'Exact match: reference and amount',
        });
        autoApplied++;
        continue;
      }

      // Try partial/fuzzy matches
      const partialMatches = this.findPartialMatches(
        transaction,
        outstandingInvoices,
      );

      if (partialMatches.length === 0) {
        results.push({
          transactionId: transaction.id,
          status: 'NO_MATCH',
          reason: 'No matching invoices found',
        });
        noMatch++;
        continue;
      }

      // Check for single high-confidence match
      const highConfidence = partialMatches.filter(
        (m) => m.confidenceScore >= AUTO_APPLY_THRESHOLD,
      );

      if (highConfidence.length === 1) {
        // Single high-confidence - auto-apply
        const applied = await this.autoApplyMatch(
          highConfidence[0],
          dto.tenantId!,
        );
        results.push({
          transactionId: transaction.id,
          status: 'AUTO_APPLIED',
          appliedMatch: applied,
          reason: `High confidence match (${highConfidence[0].confidenceScore}%)`,
        });
        autoApplied++;
      } else if (highConfidence.length > 1) {
        // Multiple high-confidence matches - AMBIGUOUS, invoke agent
        const agentResult = await this.resolveAmbiguousMatch(
          transaction,
          partialMatches,
          dto.tenantId!,
        );

        if (agentResult.status === 'AUTO_APPLIED') {
          results.push(agentResult);
          autoApplied++;
        } else {
          results.push(agentResult);
          reviewRequired++;
        }
      } else {
        // NAME-IDENTIFIED FAST PATH:
        // SA creche parents use child names as payment references, not invoice
        // numbers. When a strong name match (full name / initial+surname)
        // uniquely identifies ONE parent, auto-apply even with partial payments.
        const nameIdentified = partialMatches.filter(
          (m) =>
            m.confidenceScore >= NAME_IDENTIFIED_THRESHOLD &&
            m.matchReasons.some((r) =>
              STRONG_NAME_PATTERNS.some((p) => r.toLowerCase().includes(p)),
            ),
        );

        // De-duplicate by parentId — if multiple invoices for same parent
        // match, pick the one with highest score (oldest outstanding via
        // the invoice sort order will naturally surface)
        const uniqueParents = new Map<string, MatchCandidate>();
        for (const m of nameIdentified) {
          const existing = uniqueParents.get(m.parentId);
          if (!existing || m.confidenceScore > existing.confidenceScore) {
            uniqueParents.set(m.parentId, m);
          }
        }

        if (uniqueParents.size === 1) {
          // Single parent identified by name — auto-apply
          const best = [...uniqueParents.values()][0];
          const applied = await this.autoApplyMatch(best, dto.tenantId!);
          results.push({
            transactionId: transaction.id,
            status: 'AUTO_APPLIED',
            appliedMatch: applied,
            reason: `Name-identified match (${best.confidenceScore}%): ${best.parentName}`,
          });
          autoApplied++;
        } else if (uniqueParents.size > 1) {
          // Multiple parents matched by name — ambiguous, invoke agent
          const agentResult = await this.resolveAmbiguousMatch(
            transaction,
            partialMatches,
            dto.tenantId!,
          );
          if (agentResult.status === 'AUTO_APPLIED') {
            results.push(agentResult);
            autoApplied++;
          } else {
            results.push(agentResult);
            reviewRequired++;
          }
        } else {
          // No name-identified match — require review
          results.push({
            transactionId: transaction.id,
            status: 'REVIEW_REQUIRED',
            candidates: partialMatches.slice(0, MAX_CANDIDATES),
            reason: 'No high-confidence match found',
          });
          reviewRequired++;
        }
      }
    }

    this.logger.log(
      `Matching complete: ${autoApplied} auto-applied, ${reviewRequired} review, ${noMatch} no match`,
    );

    return {
      processed: transactions.length,
      autoApplied,
      reviewRequired,
      noMatch,
      results,
    };
  }

  /**
   * Find exact matches for a transaction
   * Exact = reference matches invoice number AND amounts match (within tolerance)
   * @param transaction - Bank transaction to match
   * @param outstandingInvoices - List of outstanding invoices to match against
   * @param toleranceConfig - Optional tolerance configuration for amount matching
   * @returns Array of exact match candidates (should be 0 or 1)
   *
   * TASK-RECON-001: Enhanced with amount tolerance matching
   * - Uses 1 cent default tolerance for rounding differences
   * - Adjusts confidence score based on amount deviation
   */
  findExactMatches(
    transaction: Transaction,
    outstandingInvoices: InvoiceWithRelations[],
    toleranceConfig?: AmountToleranceConfig,
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];

    if (!transaction.reference) {
      return candidates;
    }

    const normalizedRef = this.normalizeString(transaction.reference);
    const transactionAmount = Math.abs(transaction.amountCents);

    // Default tolerance for exact matching: 1 cent
    const config = toleranceConfig ?? {
      absoluteTolerance: TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
      percentageTolerance: 0, // No percentage tolerance for "exact" matches
      useHigherTolerance: false,
    };

    for (const invoice of outstandingInvoices) {
      const normalizedInvoice = this.normalizeString(invoice.invoiceNumber);
      const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;

      // Check for exact reference match
      if (normalizedRef !== normalizedInvoice) {
        continue;
      }

      // Check amount match with tolerance (TASK-RECON-001)
      const toleranceResult = isAmountWithinTolerance(
        transactionAmount,
        outstandingAmount,
        config,
      );

      if (toleranceResult.matches) {
        const parentName = `${invoice.parent.firstName} ${invoice.parent.lastName}`;

        // Adjust confidence based on deviation (100 for exact, 98-99 for tolerance match)
        const baseConfidence = toleranceResult.deviation === 0 ? 100 : 98;
        const confidenceScore = Math.max(
          95,
          Math.round(
            baseConfidence + toleranceResult.confidenceAdjustment * 100,
          ),
        );

        const matchReasons = ['Exact reference match'];
        if (toleranceResult.deviation === 0) {
          matchReasons.push('Exact amount match');
        } else {
          matchReasons.push(toleranceResult.matchDescription);
        }

        candidates.push({
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          confidenceLevel:
            toleranceResult.deviation === 0
              ? MatchConfidenceLevel.EXACT
              : MatchConfidenceLevel.HIGH,
          confidenceScore,
          matchReasons,
          parentId: invoice.parentId,
          parentName,
          childName: invoice.child.firstName,
          invoiceOutstandingCents: outstandingAmount,
          transactionAmountCents: transactionAmount,
        });
      }
    }

    return candidates;
  }

  /**
   * Find partial/fuzzy matches for a transaction
   * Uses name similarity and amount proximity
   * @returns Array of candidates sorted by confidence DESC
   */
  findPartialMatches(
    transaction: Transaction,
    outstandingInvoices: InvoiceWithRelations[],
  ): MatchCandidate[] {
    const candidates: MatchCandidate[] = [];

    for (const invoice of outstandingInvoices) {
      const { score, reasons } = this.calculateConfidence(transaction, invoice);

      // Only include if meets minimum threshold
      if (score >= CANDIDATE_THRESHOLD) {
        const parentName = `${invoice.parent.firstName} ${invoice.parent.lastName}`;
        const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;

        candidates.push({
          transactionId: transaction.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          confidenceLevel: this.getConfidenceLevel(score),
          confidenceScore: score,
          matchReasons: reasons,
          parentId: invoice.parentId,
          parentName,
          childName: invoice.child.firstName,
          invoiceOutstandingCents: outstandingAmount,
          transactionAmountCents: Math.abs(transaction.amountCents),
        });
      }
    }

    // Sort by confidence score descending
    return candidates.sort((a, b) => b.confidenceScore - a.confidenceScore);
  }

  /**
   * Calculate confidence score for a transaction-invoice pair
   * TASK-RECON-001: Enhanced with tolerance-based amount matching
   * @returns Score 0-100 with reasons
   */
  calculateConfidence(
    transaction: Transaction,
    invoice: InvoiceWithRelations,
    toleranceConfig?: AmountToleranceConfig,
  ): ConfidenceResult {
    let score = 0;
    const reasons: string[] = [];

    const transactionAmount = Math.abs(transaction.amountCents);
    const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;

    // 1. REFERENCE MATCH (0-40 points)
    let referenceScore = 0;
    if (transaction.reference) {
      const normalizedRef = this.normalizeString(transaction.reference);
      const normalizedInvoice = this.normalizeString(invoice.invoiceNumber);

      if (normalizedRef === normalizedInvoice) {
        referenceScore = 40;
        reasons.push('Exact reference match');
      } else if (normalizedRef.includes(normalizedInvoice)) {
        referenceScore = 30;
        reasons.push('Reference contains invoice number');
      } else if (
        normalizedInvoice.length >= 4 &&
        normalizedRef.endsWith(normalizedInvoice.slice(-4))
      ) {
        referenceScore = 15;
        reasons.push('Reference ends with invoice suffix');
      }
    }
    score += referenceScore;

    // 2. AMOUNT MATCH (0-40 points)
    // TASK-RECON-001: Use tolerance-based matching for bank fees and rounding
    const amountDiff = Math.abs(transactionAmount - outstandingAmount);
    const percentDiff =
      outstandingAmount > 0 ? amountDiff / outstandingAmount : 1;

    // Use bank fee tolerance config for amount matching
    const bankFeeConfig = toleranceConfig ?? createBankFeeTolerance();
    const toleranceResult = isAmountWithinTolerance(
      transactionAmount,
      outstandingAmount,
      bankFeeConfig,
    );

    if (amountDiff === 0) {
      score += 40;
      reasons.push('Exact amount match');
    } else if (
      toleranceResult.matches &&
      amountDiff <= TOLERANCE_DEFAULTS.BANK_FEE_TOLERANCE_CENTS
    ) {
      // TASK-RECON-001: Bank fee tolerance match (R5 or less)
      // Score between 35-38 based on deviation
      const bankFeeScore =
        38 + Math.round(toleranceResult.confidenceAdjustment * 15);
      score += Math.max(35, bankFeeScore);
      reasons.push(toleranceResult.matchDescription);
    } else if (percentDiff <= 0.01 || amountDiff <= 100) {
      // Within 1% or R1 (100 cents)
      score += 35;
      reasons.push('Amount within 1% or R1');
    } else if (percentDiff <= 0.05) {
      score += 25;
      reasons.push('Amount within 5%');
    } else if (percentDiff <= 0.1) {
      score += 15;
      reasons.push('Amount within 10%');
    } else if (transactionAmount < outstandingAmount) {
      score += 10;
      reasons.push('Partial payment (less than outstanding)');
    }

    // 3. NAME SIMILARITY (0-20 base points, boosted when no reference)
    // Check both payeeName and description for name matches
    const nameScore = this.calculateNameMatchScore(transaction, invoice);
    if (nameScore.score > 0) {
      let effectiveNameScore = nameScore.score;

      // REFERENCE-ABSENT NAME BOOST:
      // SA creche parents almost never include invoice reference numbers.
      // When no reference is found, name is the primary identifier — boost
      // strong name matches (>= 15 pts) by up to 15 extra points so that
      // name + amount + date can realistically exceed the 80% auto-apply
      // threshold. Without this, max achievable is ~80 (name 20 + amount 40
      // + date 20), meaning even perfect matches barely qualify.
      if (referenceScore === 0 && nameScore.score >= 15) {
        const nameBoost = Math.round((nameScore.score / 20) * 15);
        effectiveNameScore += nameBoost;
        reasons.push(`Name boost (no reference): +${nameBoost}`);
      }

      score += effectiveNameScore;
      reasons.push(...nameScore.reasons);
    }

    // 4. DATE PROXIMITY (0-20 points)
    // Payments made close to billing period are more likely matches
    const transactionDate = new Date(transaction.date);
    const billingStart = new Date(invoice.billingPeriodStart);
    const billingEnd = new Date(invoice.billingPeriodEnd);
    const dueDate = new Date(invoice.dueDate);

    // Days from billing period start
    const daysDiff = Math.abs(
      (transactionDate.getTime() - billingStart.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    // Check if payment is within or near billing period
    const isWithinBillingPeriod =
      transactionDate >= billingStart && transactionDate <= billingEnd;
    const isNearDueDate =
      Math.abs(
        (transactionDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
      ) <= 7;

    if (isWithinBillingPeriod) {
      // Payment within billing period is strong signal - 20 points
      score += 20;
      reasons.push('Payment within billing period');
    } else if (isNearDueDate) {
      score += 15;
      reasons.push('Payment near due date');
    } else if (daysDiff <= 30) {
      score += 10;
      reasons.push('Payment within 30 days of billing');
    } else if (daysDiff <= 60) {
      score += 5;
      reasons.push('Payment within 60 days of billing');
    }

    return { score: Math.min(score, 100), reasons };
  }

  /**
   * Calculate name match score from transaction against invoice parent/child names
   * Searches both payeeName and description for matches.
   *
   * Handles real-world SA banking patterns:
   * - Full names: "Bokamoso Mbewe" → child Bokamoso Mbewe (20 pts)
   * - Concatenated: "SSkhosana" → parent Simphiwe Skhosana (18 pts)
   * - Initial + surname: "M MOSAKA" → parent Mmatseleng Mosaka (18 pts)
   * - Surname only: "Gosiame Khoza" → child Kagoyarona Khoza via surname (12 pts)
   * - First name only: "Onthatile" → child Onthatile Mohlabeng (15 pts)
   *
   * @returns Score 0-20 with reasons
   */
  private calculateNameMatchScore(
    transaction: Transaction,
    invoice: InvoiceWithRelations,
  ): { score: number; reasons: string[] } {
    let bestScore = 0;
    const reasons: string[] = [];

    // Names to match against
    const parentFirstName = invoice.parent.firstName.toLowerCase().trim();
    const parentLastName = invoice.parent.lastName.toLowerCase().trim();
    const parentFullName = `${parentFirstName} ${parentLastName}`;
    const childFirstName = invoice.child.firstName.toLowerCase().trim();
    const childLastName = invoice.child.lastName.toLowerCase().trim();
    const childFullName = `${childFirstName} ${childLastName}`;

    // Sources to search for names (payeeName and description)
    const searchSources: string[] = [];
    if (transaction.payeeName) {
      searchSources.push(transaction.payeeName);
    }
    if (transaction.description) {
      const extractedNames = this.extractNamesFromDescription(
        transaction.description,
      );
      searchSources.push(...extractedNames);
    }

    for (const source of searchSources) {
      const normalizedSource = this.normalizeString(source);
      const sourceLower = source.toLowerCase().trim();

      // --- CHILD NAME MATCHING ---
      const childScore = this.matchNameAgainst(
        normalizedSource,
        sourceLower,
        childFirstName,
        childLastName,
        childFullName,
      );

      if (childScore.score > bestScore) {
        bestScore = childScore.score;
        reasons.length = 0;
        reasons.push(
          `${childScore.label}: ${invoice.child.firstName} ${invoice.child.lastName}`,
        );
      }

      // --- PARENT NAME MATCHING ---
      const parentScore = this.matchNameAgainst(
        normalizedSource,
        sourceLower,
        parentFirstName,
        parentLastName,
        parentFullName,
      );

      if (parentScore.score > bestScore) {
        bestScore = parentScore.score;
        reasons.length = 0;
        reasons.push(
          `${parentScore.label}: ${invoice.parent.firstName} ${invoice.parent.lastName}`,
        );
      }
    }

    return { score: bestScore, reasons };
  }

  /**
   * Match a source string against a person's first/last/full name.
   * Returns a score (0-20) and descriptive label.
   *
   * Handles: exact full name, contains both parts, concatenated forms,
   * initial + surname, first-name-only, surname-only, and fuzzy similarity.
   */
  private matchNameAgainst(
    normalizedSource: string,
    sourceLower: string,
    firstName: string,
    lastName: string,
    fullName: string,
  ): { score: number; label: string } {
    const normFirst = firstName.replace(/[^a-z0-9]/g, '');
    const normLast = lastName.replace(/[^a-z0-9]/g, '');
    const normFull = fullName.replace(/[^a-z0-9]/g, '');

    // 1. Exact full name (normalized) → 20 points
    if (normalizedSource === normFull) {
      return { score: 20, label: 'Exact name match' };
    }

    // 2. Full-name Levenshtein similarity
    const fullSimilarity = this.calculateStringSimilarity(
      normalizedSource,
      normFull,
    );

    // 3. Contains both first AND last name → 20 points
    const containsFirst =
      normFirst.length >= 3 && normalizedSource.includes(normFirst);
    const containsLast =
      normLast.length >= 3 && normalizedSource.includes(normLast);

    if (containsFirst && containsLast) {
      return { score: 20, label: 'First and last name found' };
    }

    // 4. Concatenated name match (e.g., "bokamosombewe" or "sskhosana")
    //    Check if source without spaces matches fullName without spaces
    if (fullSimilarity > 0.85) {
      return {
        score: 18,
        label: `Strong name match (${Math.round(fullSimilarity * 100)}%)`,
      };
    }

    // 5. Initial + surname match
    //    Two sub-patterns:
    //    a) Known initial: "M MOSAKA" where M = firstName[0] → 18 pts (strong)
    //    b) Unknown initial: "K RAMATLHATSE" where K ≠ any registered name →
    //       family member paying with their initial + family surname → 15 pts
    //    In SA creche payments, any family member may pay using "[Initial] [Surname]"
    if (normLast.length >= 3) {
      const sourceWords = sourceLower.split(/\s+/);
      for (let i = 0; i < sourceWords.length - 1; i++) {
        const word = sourceWords[i];
        const nextWord = sourceWords.slice(i + 1).join(' ');
        if (word.length === 1 && this.normalizeString(nextWord) === normLast) {
          if (word === firstName[0]) {
            return { score: 18, label: 'Initial + surname match' };
          }
          // Unknown initial but surname matches — family member paying
          return { score: 15, label: 'Family initial + surname match' };
        }
      }
      // Also handle concatenated initial: "mmosaka", "nmalinga", "kramatlhatse"
      if (
        normalizedSource.length >= normLast.length + 1 &&
        normalizedSource.length <= normLast.length + 2 &&
        normalizedSource.endsWith(normLast)
      ) {
        const prefix = normalizedSource.slice(
          0,
          normalizedSource.length - normLast.length,
        );
        if (prefix.length === 1) {
          if (prefix === normFirst[0]) {
            return {
              score: 18,
              label: 'Initial + surname match (concatenated)',
            };
          }
          return {
            score: 15,
            label: 'Family initial + surname match (concatenated)',
          };
        }
      }
    }

    // 6. Contains first name (child-first-name-only is common in SA payments)
    if (containsFirst && normFirst.length >= 4) {
      // If this first name is unique across the tenant, it's unambiguous
      if (this.uniqueFirstNames.has(normFirst)) {
        return { score: 18, label: 'Unique first name match' };
      }
      return { score: 15, label: 'First name found' };
    }

    // 6b. First name similarity — handles typos/misspellings in ADT deposits
    //     e.g., "Tshegfatso" vs "Tshegofatso", "Segofatso" vs "Tshegofatso"
    if (normFirst.length >= 5) {
      const firstNameSimilarity = this.calculateStringSimilarity(
        normalizedSource,
        normFirst,
      );
      if (firstNameSimilarity > 0.8) {
        if (this.uniqueFirstNames.has(normFirst)) {
          return {
            score: 16,
            label: `Unique first name match (${Math.round(firstNameSimilarity * 100)}% similar)`,
          };
        }
        return {
          score: 12,
          label: `First name similar (${Math.round(firstNameSimilarity * 100)}%)`,
        };
      }
    }

    // 7. Contains last name (someone else in family paying, e.g., "Gosiame Khoza" for child "Kagoyarona Khoza")
    if (containsLast && normLast.length >= 4) {
      return { score: 12, label: 'Surname match' };
    }

    // 8. Good overall similarity (handles typos, truncation)
    if (fullSimilarity > 0.7) {
      return {
        score: 12,
        label: `Good name similarity (${Math.round(fullSimilarity * 100)}%)`,
      };
    }

    // 9. Partial first or last name match (short names, 3 chars)
    if (containsFirst || containsLast) {
      return {
        score: 10,
        label: containsFirst ? 'First name found' : 'Surname found',
      };
    }

    // 10. Moderate similarity
    if (fullSimilarity > 0.5) {
      return {
        score: 5,
        label: `Weak name similarity (${Math.round(fullSimilarity * 100)}%)`,
      };
    }

    return { score: 0, label: '' };
  }

  /**
   * Extract potential names from bank transaction description
   * Removes SA banking prefixes, hex hashes, account numbers, and
   * non-name suffixes (Trip, Fees, Books, Uniform, etc.)
   *
   * Handles real-world patterns observed in FNB/Capitec/ABSA/Nedbank statements:
   * - "Payshap Credit Bokamoso Mbewe"
   * - "Magtape Credit Capitec Thatego Mphela"
   * - "ADT Cash Deposit 00686117 Phenyo Nthite"
   * - "ADT Cash Deposit Bloedstr Phetogo Mbezi"
   * - "Rtc Credit Kefentse Motsepe 34C7D697C1"
   * - "CAPITEC M MOSAKA"
   * - "Payshap Credit SSkhosana" (concatenated)
   * - "FNBOBPmt Kgetoentle Moqau Mog" (truncated)
   */
  private extractNamesFromDescription(description: string): string[] {
    // SA banking prefixes (ordered longest-first for greedy match)
    const bankingPrefixes = [
      /^FNB App Payment From\s*/i,
      /^FNB App Transfer From\s*/i,
      /^Scheduled Pymt From\s*/i,
      /^Int-Banking Pmt Frm\s*/i,
      /^Magtape Credit ABSABank\s*/i,
      /^Magtape Credit Capitec\s*/i,
      /^Magtape Credit Investec\w*\s*/i,
      /^Magtape Credit\s*/i,
      /^Payshap Credit\s*/i,
      /^Rtc Credit\s*/i,
      /^ADT Cash Deposit\s*/i,
      /^FNBOBPmt\s*/i,
      /^EFT Credit\s*/i,
      /^Debit Order\s*/i,
      /^Internet Transfer\s*/i,
      /^Mobile Transfer\s*/i,
      /^Credit Voucher\s*/i,
      /^CAPITEC\s*/i,
      /^ABSA\s*/i,
      /^NEDBANK\s*/i,
      /^STANDARD BANK\s*/i,
    ];

    let cleaned = description;

    // Remove banking prefixes
    for (const prefix of bankingPrefixes) {
      cleaned = cleaned.replace(prefix, '');
    }

    // Remove ADT branch/location names that precede the actual payer name
    // e.g., "Bloedstr NSeitshokelo" → "NSeitshokelo", "Brooklyn Oabile" → "Oabile"
    cleaned = cleaned.replace(
      /^(Bloedstr|Brooklyn|Sandton|Menlyn|Hatfield|Centurion|Pretoria|Midrand|Rosebank)\s+/i,
      '',
    );

    // Remove account/reference numbers (8+ digits)
    cleaned = cleaned.replace(/\d{8,}/g, '');

    // Remove hex transaction hashes (e.g., 34C7D697C1, 3Afb41Ef75)
    // These are 8+ char mixed alphanumeric with at least one digit and one letter
    cleaned = cleaned.replace(
      /\b[0-9A-Fa-f]{2,}\s*[0-9A-Fa-f]{2,}\s*[0-9A-Fa-f]*\s*[0-9A-Fa-f]*\b/g,
      (match) => {
        // Only strip if it looks like a hex hash (has both digits and letters, 8+ alphanumeric chars)
        const stripped = match.replace(/\s/g, '');
        const hasDigit = /\d/.test(stripped);
        const hasLetter = /[A-Fa-f]/i.test(stripped);
        if (hasDigit && hasLetter && stripped.length >= 8) return '';
        return match;
      },
    );

    // Remove standalone short hex-like tokens (e.g., "18Bo722285")
    cleaned = cleaned.replace(/\b\w*\d+[A-Fa-f]+\w*\b/g, (match) => {
      if (match.length >= 8 && /\d/.test(match) && /[A-Fa-f]/i.test(match))
        return '';
      return match;
    });

    // Remove short number sequences
    cleaned = cleaned.replace(/\b\d{1,7}\b/g, '');

    // Remove non-name suffixes (payment purpose descriptors)
    cleaned = cleaned.replace(
      /\b(Trip|Fees?|Books?|Uniform|Workbo\w*|Graduation\w*|Entrance|Photo\w*|Tshirt|Grad)\b/gi,
      '',
    );

    // Remove card/voucher references
    cleaned = cleaned.replace(/\b(Vouch|Paystack|Apple|S\d+\**\d+)\b/gi, '');
    cleaned = cleaned.replace(/\*+/g, '');

    // Clean up extra whitespace and trim
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    // Remove dangling single characters (except valid initials at start)
    cleaned = cleaned.replace(/\s+[a-z]\s+/gi, ' ').trim();

    const results: string[] = [];

    // Skip known non-person descriptions
    const nonPersonDescriptions = [
      'owner loan',
      'g suite',
      'elle elephant',
      'capitec bank',
      'kc',
      'elle',
      'mini',
      'david',
      'fridge',
      'elephant',
    ];
    if (nonPersonDescriptions.includes(cleaned.toLowerCase())) {
      return results;
    }

    // Add the full cleaned string
    if (cleaned.length > 2) {
      results.push(cleaned);
    }

    // Also add individual words that could be names (3+ chars, no digits)
    const words = cleaned
      .split(/\s+/)
      .filter((word) => word.length >= 3 && !/\d/.test(word));
    if (words.length > 0 && words.join(' ') !== cleaned) {
      results.push(words.join(' '));
    }

    return results;
  }

  /**
   * Auto-apply a match (create Payment, update Invoice)
   * @throws BusinessException if transaction already allocated
   */
  async autoApplyMatch(
    candidate: MatchCandidate,
    tenantId: string,
  ): Promise<AppliedMatch> {
    // Double-check not already allocated (race condition protection)
    if (await this.isTransactionAllocated(candidate.transactionId)) {
      throw new BusinessException(
        `Transaction ${candidate.transactionId} is already allocated to a payment`,
        'TRANSACTION_ALREADY_ALLOCATED',
      );
    }

    // Determine match type based on confidence
    const matchType =
      candidate.confidenceScore === 100 ? MatchType.EXACT : MatchType.PARTIAL;

    // Create payment record
    const payment = await this.paymentRepo.create({
      tenantId: tenantId,
      transactionId: candidate.transactionId,
      invoiceId: candidate.invoiceId,
      amountCents: candidate.transactionAmountCents,
      paymentDate: new Date(),
      matchType,
      matchConfidence: candidate.confidenceScore,
      matchedBy: MatchedBy.AI_AUTO,
    });

    // Update invoice with payment
    await this.invoiceRepo.recordPayment(
      candidate.invoiceId,
      tenantId,
      candidate.transactionAmountCents,
    );

    // Create audit log
    await this.auditLogService.logAction({
      tenantId: tenantId,
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.CREATE,
      afterValue: {
        transactionId: candidate.transactionId,
        invoiceId: candidate.invoiceId,
        invoiceNumber: candidate.invoiceNumber,
        amountCents: candidate.transactionAmountCents,
        confidenceScore: candidate.confidenceScore,
        matchReasons: candidate.matchReasons,
        matchType,
      },
      changeSummary: `Auto-matched transaction to invoice ${candidate.invoiceNumber} with ${candidate.confidenceScore}% confidence`,
    });

    this.logger.log(
      `Auto-applied match: Transaction ${candidate.transactionId} → Invoice ${candidate.invoiceNumber} (${candidate.confidenceScore}%)`,
    );

    return {
      paymentId: payment.id,
      transactionId: candidate.transactionId,
      invoiceId: candidate.invoiceId,
      invoiceNumber: candidate.invoiceNumber,
      amountCents: candidate.transactionAmountCents,
      confidenceScore: candidate.confidenceScore,
    };
  }

  /**
   * Manually apply a suggested match (called from API)
   * @throws NotFoundException if transaction or invoice not found
   * @throws BusinessException if transaction already allocated
   */
  async applyMatch(dto: ApplyMatchDto): Promise<AppliedMatch> {
    // Verify transaction exists and is a credit
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        id: dto.transactionId,
        tenantId: dto.tenantId!,
        isCredit: true,
        isDeleted: false,
      },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction', dto.transactionId);
    }

    // Check if already allocated
    if (await this.isTransactionAllocated(dto.transactionId)) {
      throw new BusinessException(
        `Transaction ${dto.transactionId} is already allocated to a payment`,
        'TRANSACTION_ALREADY_ALLOCATED',
      );
    }

    // Verify invoice exists and belongs to tenant
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: dto.invoiceId,
        tenantId: dto.tenantId!,
        isDeleted: false,
        status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] },
      },
      include: { parent: true, child: true },
    });

    if (!invoice) {
      throw new NotFoundException('Invoice', dto.invoiceId);
    }

    // Determine amount to apply
    const amountCents = dto.amountCents ?? Math.abs(transaction.amountCents);
    const outstandingAmount = invoice.totalCents - invoice.amountPaidCents;

    // Validate amount doesn't exceed outstanding
    if (amountCents > outstandingAmount) {
      throw new BusinessException(
        `Amount ${amountCents} exceeds outstanding amount ${outstandingAmount}`,
        'AMOUNT_EXCEEDS_OUTSTANDING',
        { amountCents, outstandingAmount },
      );
    }

    // Create payment record
    const payment = await this.paymentRepo.create({
      tenantId: dto.tenantId!,
      transactionId: dto.transactionId,
      invoiceId: dto.invoiceId,
      amountCents,
      paymentDate: new Date(),
      matchType: MatchType.MANUAL,
      matchConfidence: undefined,
      matchedBy: MatchedBy.USER,
    });

    // Update invoice with payment
    await this.invoiceRepo.recordPayment(
      dto.invoiceId,
      dto.tenantId!,
      amountCents,
    );

    // Create audit log
    await this.auditLogService.logAction({
      tenantId: dto.tenantId!,
      entityType: 'Payment',
      entityId: payment.id,
      action: AuditAction.CREATE,
      afterValue: {
        transactionId: dto.transactionId,
        invoiceId: dto.invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        amountCents,
        matchType: MatchType.MANUAL,
      },
      changeSummary: `Manually matched transaction to invoice ${invoice.invoiceNumber}`,
    });

    this.logger.log(
      `Manual match applied: Transaction ${dto.transactionId} → Invoice ${invoice.invoiceNumber}`,
    );

    return {
      paymentId: payment.id,
      transactionId: dto.transactionId,
      invoiceId: dto.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      amountCents,
      confidenceScore: 0, // Manual match has no confidence score
    };
  }

  /**
   * Calculate string similarity using Levenshtein distance
   * @returns Similarity score 0-1 (1 = identical)
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    // Build Levenshtein distance matrix
    const matrix: number[][] = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // deletion
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j - 1] + cost, // substitution
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }

  /**
   * Normalize string for comparison
   * Converts to lowercase and removes non-alphanumeric characters
   */
  private normalizeString(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Get confidence level category from score
   */
  private getConfidenceLevel(score: number): MatchConfidenceLevel {
    if (score === 100) return MatchConfidenceLevel.EXACT;
    if (score >= 80) return MatchConfidenceLevel.HIGH;
    if (score >= 50) return MatchConfidenceLevel.MEDIUM;
    return MatchConfidenceLevel.LOW;
  }

  /**
   * Get outstanding invoices for tenant with parent/child relations
   */
  private async getOutstandingInvoices(
    tenantId: string,
  ): Promise<InvoiceWithRelations[]> {
    return this.prisma.invoice.findMany({
      where: {
        tenantId: tenantId,
        isDeleted: false,
        status: { notIn: [InvoiceStatus.PAID, InvoiceStatus.VOID] },
      },
      include: {
        parent: true,
        child: true,
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  /**
   * Get unallocated credit transactions for tenant
   */
  private async getUnallocatedCredits(
    tenantId: string,
    transactionIds?: string[],
  ): Promise<Transaction[]> {
    // Find transactions that don't have any non-reversed payments
    const allocatedTransactionIds = await this.prisma.payment
      .findMany({
        where: {
          tenantId: tenantId,
          isReversed: false,
          transactionId: { not: null },
        },
        select: { transactionId: true },
      })
      .then((payments) =>
        payments.map((p) => p.transactionId).filter((id): id is string => !!id),
      );

    const where: Prisma.TransactionWhereInput = {
      tenantId: tenantId,
      isCredit: true,
      isDeleted: false,
    };

    // If specific transaction IDs provided, filter to those
    if (transactionIds && transactionIds.length > 0) {
      // Filter to requested IDs that are not allocated
      where.AND = [
        { id: { in: transactionIds } },
        { id: { notIn: allocatedTransactionIds } },
      ];
    } else {
      // All unallocated credits
      where.id = { notIn: allocatedTransactionIds };
    }

    return this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Check if transaction is already allocated to a payment
   */
  private async isTransactionAllocated(
    transactionId: string,
  ): Promise<boolean> {
    const existingPayment = await this.prisma.payment.findFirst({
      where: {
        transactionId,
        isReversed: false,
      },
    });
    return existingPayment !== null;
  }

  /**
   * Resolve ambiguous match using PaymentMatcherAgent
   * Called when multiple high-confidence candidates exist
   *
   * @param transaction - The transaction to match
   * @param candidates - Match candidates sorted by confidence
   * @param tenantId - Tenant ID for audit logging
   * @returns Transaction match result with agent decision
   */
  private async resolveAmbiguousMatch(
    transaction: Transaction,
    candidates: MatchCandidate[],
    tenantId: string,
  ): Promise<TransactionMatchResult> {
    this.logger.log(
      `Resolving ambiguous match for transaction ${transaction.id} with ${candidates.length} candidates`,
    );

    // Convert MatchCandidate[] to InvoiceCandidate[] format agent expects
    const invoiceCandidates: InvoiceCandidate[] = candidates.map((c) => ({
      invoice: {
        id: c.invoiceId,
        invoiceNumber: c.invoiceNumber,
        totalCents: c.invoiceOutstandingCents, // Using outstanding as total for candidate
        amountPaidCents: 0, // Not needed for agent decision
        parentId: c.parentId,
        parent: {
          firstName: c.parentName.split(' ')[0] ?? '',
          lastName: c.parentName.split(' ').slice(1).join(' ') || '',
        },
        child: {
          firstName: c.childName,
        },
      },
      confidence: c.confidenceScore,
      matchReasons: c.matchReasons,
    }));

    let agentDecision: MatchDecision | null = null;
    let lastError: Error | null = null;

    // Retry logic with max 3 attempts
    for (let attempt = 1; attempt <= MAX_AGENT_RETRIES; attempt++) {
      try {
        agentDecision = await this.paymentAgent.makeMatchDecision(
          transaction,
          invoiceCandidates,
          tenantId,
          AGENT_CONFIDENCE_HIGH,
        );
        break; // Success - exit retry loop
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          `Agent decision failed (attempt ${attempt}/${MAX_AGENT_RETRIES}): ${lastError.message}`,
        );

        // Wait before retry (exponential backoff)
        if (attempt < MAX_AGENT_RETRIES) {
          await new Promise((resolve) =>
            setTimeout(resolve, Math.pow(2, attempt) * 100),
          );
        }
      }
    }

    // If agent failed after retries, fall back to rule-based
    if (!agentDecision) {
      this.logger.error(
        `Agent decision failed after ${MAX_AGENT_RETRIES} retries, falling back to rule-based: ${lastError?.message}`,
      );

      // Log agent failure to audit
      await this.auditLogService.logAction({
        tenantId: tenantId,
        entityType: 'Payment',
        entityId: transaction.id,
        action: AuditAction.UPDATE,
        afterValue: {
          agentFailure: true,
          errorMessage: lastError?.message,
          fallbackUsed: 'rule-based',
          candidateCount: candidates.length,
        },
        changeSummary: `Agent failed to resolve ambiguous match, falling back to manual review`,
      });

      // Return first candidate as best match for review
      return {
        transactionId: transaction.id,
        status: 'REVIEW_REQUIRED',
        candidates: candidates.slice(0, MAX_CANDIDATES),
        reason: `Agent resolution failed - ${candidates.length} high-confidence matches require manual selection`,
      };
    }

    // Log agent decision to audit
    await this.auditLogService.logAction({
      tenantId: tenantId,
      entityType: 'Payment',
      entityId: transaction.id,
      action: AuditAction.UPDATE,
      afterValue: {
        agentDecision: agentDecision.action,
        agentConfidence: agentDecision.confidence,
        agentReasoning: agentDecision.reasoning,
        selectedInvoice: agentDecision.invoiceId,
        alternativesCount: agentDecision.alternatives.length,
      },
      changeSummary: `Agent resolved ambiguous match: ${agentDecision.action} (${agentDecision.confidence}% confidence)`,
    });

    // Apply confidence thresholds to agent decision
    if (
      agentDecision.action === 'AUTO_APPLY' &&
      agentDecision.confidence >= AGENT_CONFIDENCE_HIGH &&
      agentDecision.invoiceId
    ) {
      // Agent confident - auto-apply
      const selectedCandidate = candidates.find(
        (c) => c.invoiceId === agentDecision.invoiceId,
      );

      if (!selectedCandidate) {
        this.logger.error(
          `Agent selected invoice ${agentDecision.invoiceId} not found in candidates`,
        );
        return {
          transactionId: transaction.id,
          status: 'REVIEW_REQUIRED',
          candidates: candidates.slice(0, MAX_CANDIDATES),
          reason: 'Agent selected invalid invoice - requires manual review',
        };
      }

      const applied = await this.autoApplyMatch(selectedCandidate, tenantId);

      return {
        transactionId: transaction.id,
        status: 'AUTO_APPLIED',
        appliedMatch: applied,
        reason: `Agent auto-applied (${agentDecision.confidence}%): ${agentDecision.reasoning}`,
      };
    } else if (
      agentDecision.confidence >= AGENT_CONFIDENCE_MEDIUM &&
      agentDecision.confidence < AGENT_CONFIDENCE_HIGH
    ) {
      // Medium confidence - suggest to user for review
      return {
        transactionId: transaction.id,
        status: 'REVIEW_REQUIRED',
        candidates: candidates.slice(0, MAX_CANDIDATES),
        reason: `Agent suggests review (${agentDecision.confidence}%): ${agentDecision.reasoning}`,
      };
    } else {
      // Low confidence or NO_MATCH - flag for manual review
      return {
        transactionId: transaction.id,
        status: 'REVIEW_REQUIRED',
        candidates: candidates.slice(0, MAX_CANDIDATES),
        reason: `Agent flagged for manual review (${agentDecision.confidence}%): ${agentDecision.reasoning}`,
      };
    }
  }
}

/**
 * Payment Matcher Agent
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/matcher.agent
 * @description Makes match decisions for payment transactions.
 * Uses confidence scoring to determine auto-apply vs review required.
 *
 * Decision Rules:
 * - Single match >= 80%: AUTO_APPLY
 * - Multiple matches >= 80%: REVIEW_REQUIRED (ambiguous)
 * - Best match < 80%: REVIEW_REQUIRED (low confidence)
 * - No matches >= 20%: NO_MATCH
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - 80% confidence threshold for auto-apply (L3 autonomy)
 * - No backwards compatibility - fail fast
 * - Tenant isolation on ALL queries
 */

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MatchDecisionLogger } from './decision-logger';
import {
  MatchDecision,
  InvoiceCandidate,
} from './interfaces/matcher.interface';

/** Confidence threshold for auto-apply */
const AUTO_APPLY_THRESHOLD = 80;

/** Minimum confidence to include as candidate */
const CANDIDATE_THRESHOLD = 20;

@Injectable()
export class PaymentMatcherAgent {
  private readonly logger = new Logger(PaymentMatcherAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionLogger: MatchDecisionLogger,
  ) {}

  /**
   * Make a match decision for a transaction against invoice candidates
   *
   * @param transaction - Credit transaction to match
   * @param candidates - Invoice candidates with confidence scores
   * @param tenantId - Tenant ID for isolation
   * @param autoApplyThreshold - Threshold for auto-apply (default 80)
   * @returns Match decision with action and reasoning
   */
  async makeMatchDecision(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number = AUTO_APPLY_THRESHOLD,
  ): Promise<MatchDecision> {
    const highConfidenceCandidates = candidates.filter(
      (c) => c.confidence >= autoApplyThreshold,
    );
    const validCandidates = candidates.filter(
      (c) => c.confidence >= CANDIDATE_THRESHOLD,
    );

    let decision: MatchDecision;

    if (candidates.length === 0) {
      // No candidates at all
      decision = {
        transactionId: transaction.id,
        confidence: 0,
        action: 'NO_MATCH',
        reasoning: 'No matching invoices found',
        alternatives: [],
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'no_match',
        confidence: 0,
        autoApplied: false,
        reasoning: 'No matching invoices found',
        candidateCount: 0,
      });
    } else if (highConfidenceCandidates.length === 1) {
      // Single high-confidence match - AUTO APPLY
      const best = highConfidenceCandidates[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'AUTO_APPLY',
        reasoning: best.matchReasons.join('; '),
        alternatives: validCandidates
          .filter((c) => c.invoice.id !== best.invoice.id)
          .slice(0, 4)
          .map((c) => ({
            invoiceId: c.invoice.id,
            invoiceNumber: c.invoice.invoiceNumber,
            confidence: c.confidence,
          })),
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'match',
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        autoApplied: true,
        reasoning: best.matchReasons.join('; '),
        candidateCount: validCandidates.length,
      });
    } else if (highConfidenceCandidates.length > 1) {
      // Multiple high-confidence matches - AMBIGUOUS, need review
      const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'REVIEW_REQUIRED',
        reasoning: `Ambiguous: ${highConfidenceCandidates.length} high-confidence matches found`,
        alternatives: validCandidates.slice(0, 5).map((c) => ({
          invoiceId: c.invoice.id,
          invoiceNumber: c.invoice.invoiceNumber,
          confidence: c.confidence,
        })),
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'escalate',
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        autoApplied: false,
        reasoning: `Ambiguous: ${highConfidenceCandidates.length} high-confidence matches`,
        candidateCount: validCandidates.length,
      });

      await this.decisionLogger.logEscalation(
        tenantId,
        transaction.id,
        'AMBIGUOUS_MATCH',
        `${highConfidenceCandidates.length} invoices with confidence >= ${autoApplyThreshold}%`,
        highConfidenceCandidates.map((c) => c.invoice.id),
        highConfidenceCandidates.map((c) => c.invoice.invoiceNumber),
      );
    } else {
      // No high-confidence match - LOW CONFIDENCE, need review
      const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'REVIEW_REQUIRED',
        reasoning: `Confidence ${best.confidence}% below threshold ${autoApplyThreshold}%`,
        alternatives: validCandidates.slice(0, 5).map((c) => ({
          invoiceId: c.invoice.id,
          invoiceNumber: c.invoice.invoiceNumber,
          confidence: c.confidence,
        })),
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'escalate',
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        autoApplied: false,
        reasoning: `Confidence ${best.confidence}% below threshold`,
        candidateCount: validCandidates.length,
      });

      await this.decisionLogger.logEscalation(
        tenantId,
        transaction.id,
        'LOW_CONFIDENCE',
        `Best match ${best.invoice.invoiceNumber} at ${best.confidence}%`,
        validCandidates.map((c) => c.invoice.id),
        validCandidates.map((c) => c.invoice.invoiceNumber),
      );
    }

    return decision;
  }

  /**
   * Find invoice candidates for a transaction
   * Uses reference matching, amount matching, and name similarity
   */
  async findCandidates(
    transaction: Transaction,
    tenantId: string,
  ): Promise<InvoiceCandidate[]> {
    // Get outstanding invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      include: {
        parent: true,
        child: true,
      },
    });

    const candidates: InvoiceCandidate[] = [];
    const transactionAmount = Math.abs(transaction.amountCents);

    for (const invoice of invoices) {
      const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
      if (outstandingCents <= 0) continue;

      let confidence = 0;
      const reasons: string[] = [];

      // 1. Reference match (0-40 points)
      if (transaction.reference) {
        const refScore = this.calculateReferenceScore(
          transaction.reference,
          invoice.invoiceNumber,
        );
        confidence += refScore.score;
        if (refScore.reason) reasons.push(refScore.reason);
      }

      // 2. Amount match (0-40 points)
      const amountScore = this.calculateAmountScore(
        transactionAmount,
        outstandingCents,
      );
      confidence += amountScore.score;
      if (amountScore.reason) reasons.push(amountScore.reason);

      // 3. Name similarity (0-20 points)
      if (transaction.payeeName) {
        const nameScore = this.calculateNameScore(
          transaction.payeeName,
          `${invoice.parent.firstName} ${invoice.parent.lastName}`,
        );
        confidence += nameScore.score;
        if (nameScore.reason) reasons.push(nameScore.reason);
      }

      // Only include if meets minimum threshold
      if (confidence >= CANDIDATE_THRESHOLD) {
        candidates.push({
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalCents: invoice.totalCents,
            amountPaidCents: invoice.amountPaidCents,
            parentId: invoice.parentId,
            parent: {
              firstName: invoice.parent.firstName,
              lastName: invoice.parent.lastName,
            },
            child: {
              firstName: invoice.child.firstName,
            },
          },
          confidence: Math.min(100, confidence),
          matchReasons: reasons,
        });
      }
    }

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate reference match score
   */
  private calculateReferenceScore(
    reference: string,
    invoiceNumber: string,
  ): { score: number; reason?: string } {
    const normRef = this.normalize(reference);
    const normInv = this.normalize(invoiceNumber);

    if (normRef === normInv) {
      return { score: 40, reason: 'Exact reference match' };
    }

    if (normRef.includes(normInv)) {
      return { score: 30, reason: 'Reference contains invoice number' };
    }

    if (normInv.length >= 4 && normRef.endsWith(normInv.slice(-4))) {
      return { score: 15, reason: 'Reference ends with invoice suffix' };
    }

    return { score: 0 };
  }

  /**
   * Calculate amount match score
   */
  private calculateAmountScore(
    transactionCents: number,
    outstandingCents: number,
  ): { score: number; reason?: string } {
    const diff = Math.abs(transactionCents - outstandingCents);
    const percentDiff = outstandingCents > 0 ? diff / outstandingCents : 1;

    if (diff === 0) {
      return { score: 40, reason: 'Exact amount match' };
    }

    if (percentDiff <= 0.01 || diff <= 100) {
      return { score: 35, reason: 'Amount within 1% or R1' };
    }

    if (percentDiff <= 0.05) {
      return { score: 25, reason: 'Amount within 5%' };
    }

    if (percentDiff <= 0.1) {
      return { score: 15, reason: 'Amount within 10%' };
    }

    if (transactionCents < outstandingCents) {
      return { score: 10, reason: 'Partial payment' };
    }

    return { score: 0 };
  }

  /**
   * Calculate name similarity score
   */
  private calculateNameScore(
    payeeName: string,
    parentName: string,
  ): { score: number; reason?: string } {
    const normPayee = this.normalize(payeeName);
    const normParent = this.normalize(parentName);

    const similarity = this.calculateStringSimilarity(normPayee, normParent);

    if (similarity === 1) {
      return { score: 20, reason: 'Exact name match' };
    }

    if (similarity > 0.8) {
      return {
        score: 15,
        reason: `Strong name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    if (similarity > 0.6) {
      return {
        score: 10,
        reason: `Good name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    if (similarity > 0.4) {
      return {
        score: 5,
        reason: `Weak name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    return { score: 0 };
  }

  /**
   * Normalize string for comparison
   */
  private normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

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
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }
}

/**
 * PaymentAttachmentMatcherService
 *
 * Stage 2 of the OCR + auto-match pipeline.
 *
 * Given an approved PaymentAttachment:
 *  1. Stream file from S3 to buffer
 *  2. Run OCR via OCRService (image or PDF)
 *  3. Parse extracted text to amount, date, reference
 *  4. Query unallocated Transactions in tenant
 *  5. Score each candidate directly (amount +/-1 cent OR reference keyword match)
 *  6. If best candidate score / 100 >= 0.80: persist suggestedPaymentId +
 *     matchConfidence (0.0000-1.0000 scale — divide by 100 from 0-100 scale)
 *  7. Audit-log the attempt
 *  8. Return MatchResult
 *
 * Scale note (from schema-guardian):
 *   Payment.matchConfidence is Decimal(5,2) on a 0-100 scale.
 *   PaymentAttachment.matchConfidence is Decimal(5,4) on a 0.0000-1.0000 scale.
 *   We divide the scoring service result (0-100) by 100 before storing on
 *   PaymentAttachment.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PaymentAttachmentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { StorageService } from '../../integrations/storage/storage.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import { OCRService } from '../../integrations/ocr/ocr.service';
import type { Transaction } from '@prisma/client';

/** Confidence threshold (normalised 0-1) to store a suggestion */
const MATCH_THRESHOLD = 0.8;

/** Max file size to buffer (10 MB — validated upstream) */
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export interface ExtractedFields {
  amount: number | null; // cents
  date: Date | null;
  reference: string | null;
}

export interface MatchResult {
  extracted: ExtractedFields;
  ocrText: string;
  ocrConfidence: number;
  suggestedPaymentId: string | null;
  /** Normalised 0.0000-1.0000, null when no suggestion */
  matchConfidence: number | null;
}

@Injectable()
export class PaymentAttachmentMatcherService {
  private readonly logger = new Logger(PaymentAttachmentMatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly storage: StorageService,
    private readonly ocr: OCRService,
  ) {}

  /**
   * Run OCR + match on an approved PaymentAttachment.
   *
   * @throws NotFoundException when attachment is not found in tenant
   */
  async extractAndMatch(
    tenantId: string,
    attachmentId: string,
  ): Promise<MatchResult> {
    // 1. Fetch attachment, assert tenant scope + APPROVED status
    const attachment = await this.prisma.paymentAttachment.findFirst({
      where: { id: attachmentId, tenantId },
      select: {
        id: true,
        s3Key: true,
        contentType: true,
        reviewStatus: true,
      },
    });

    if (!attachment) {
      throw new NotFoundException(
        `PaymentAttachment ${attachmentId} not found in tenant`,
      );
    }

    if (attachment.reviewStatus !== PaymentAttachmentStatus.APPROVED) {
      throw new Error(
        `PaymentAttachment ${attachmentId} is not APPROVED (status=${attachment.reviewStatus})`,
      );
    }

    // 2. Stream from S3 to buffer
    const stream = await this.storage.getObjectStream(
      tenantId,
      StorageKind.ProofOfPayment,
      attachment.s3Key,
    );

    const chunks: Buffer[] = [];
    let totalBytes = 0;
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_BUFFER_BYTES) {
          reject(new Error(`File exceeds ${MAX_BUFFER_BYTES} byte limit`));
          return;
        }
        chunks.push(chunk);
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    const fileBuffer = Buffer.concat(chunks);

    // 3. Run OCR based on content type
    const isImage = attachment.contentType.startsWith('image/');
    const ocrResult = isImage
      ? await this.ocr.extractFromImage(fileBuffer)
      : await this.ocr.extractFromPdf(fileBuffer);

    this.logger.log(
      `extractAndMatch: attachment=${attachmentId} ocr_chars=${ocrResult.text.length} ocr_confidence=${ocrResult.confidence}`,
    );

    // 4. Parse fields from extracted text
    const extracted = this.parseExtractedText(ocrResult.text);

    // 5. Persist OCR fields immediately (even if matching fails below)
    await this.prisma.paymentAttachment.update({
      where: { id: attachmentId },
      data: {
        ocrText: ocrResult.text || null,
        extractedAmount: extracted.amount,
        extractedDate: extracted.date,
        extractedReference: extracted.reference,
        matchAttemptedAt: new Date(),
      },
    });

    // 6. Find candidate unallocated Transactions in tenant
    const candidates = await this.findCandidateTransactions(
      tenantId,
      extracted,
    );

    // 7. Score each candidate
    let bestScore = 0;
    let bestTransactionId: string | null = null;

    if (
      candidates.length > 0 &&
      (extracted.amount !== null || extracted.reference !== null)
    ) {
      for (const txn of candidates) {
        const score = this.scoreTransactionCandidate(txn, extracted);
        if (score > bestScore) {
          bestScore = score;
          bestTransactionId = txn.id;
        }
      }
    }

    // 8. Apply threshold — look for an existing Payment on the winning transaction
    const normalised = bestScore / 100;
    const meetsThreshold =
      normalised >= MATCH_THRESHOLD && bestTransactionId !== null;

    let suggestedPaymentId: string | null = null;
    let matchConfidence: number | null = null;

    if (meetsThreshold && bestTransactionId) {
      // suggestedPaymentId FK points to Payment.id, not Transaction.id.
      // Unallocated transactions have no Payment row yet — we record the
      // candidate in the audit log and store the payment if one already exists.
      const existingPayment = await this.prisma.payment.findFirst({
        where: {
          transactionId: bestTransactionId,
          tenantId,
          isReversed: false,
        },
        select: { id: true },
      });

      matchConfidence = normalised;

      if (existingPayment) {
        suggestedPaymentId = existingPayment.id;
        await this.prisma.paymentAttachment.update({
          where: { id: attachmentId },
          data: {
            suggestedPaymentId,
            matchConfidence: new Prisma.Decimal(normalised.toFixed(4)),
          },
        });
      } else {
        // No Payment row yet — the transaction is genuinely unallocated.
        // We still record the match confidence on the attachment for admin context.
        await this.prisma.paymentAttachment.update({
          where: { id: attachmentId },
          data: {
            matchConfidence: new Prisma.Decimal(normalised.toFixed(4)),
          },
        });
        this.logger.log(
          `extractAndMatch: best candidate is unallocated txn=${bestTransactionId} (score=${bestScore}), no Payment row yet`,
        );
      }
    }

    // 9. Audit log
    await this.auditLog.logAction({
      tenantId,
      entityType: 'PaymentAttachment',
      entityId: attachmentId,
      action: AuditAction.UPDATE,
      afterValue: {
        ocrChars: ocrResult.text.length,
        ocrConfidence: ocrResult.confidence,
        extractedAmount: extracted.amount,
        extractedDate: extracted.date?.toISOString() ?? null,
        extractedReference: extracted.reference,
        candidateCount: candidates.length,
        bestScore,
        bestTransactionId,
        suggestedPaymentId,
        matchConfidence,
      },
      changeSummary: suggestedPaymentId
        ? `OCR match: suggested payment ${suggestedPaymentId} (confidence ${(normalised * 100).toFixed(1)}%)`
        : `OCR extract: no suggestion (best score ${bestScore}, threshold ${MATCH_THRESHOLD * 100}%)`,
    });

    this.logger.log(
      `extractAndMatch done: attachment=${attachmentId} candidates=${candidates.length} bestScore=${bestScore} suggested=${suggestedPaymentId ?? 'none'}`,
    );

    return {
      extracted,
      ocrText: ocrResult.text,
      ocrConfidence: ocrResult.confidence,
      suggestedPaymentId,
      matchConfidence,
    };
  }

  // ---------------------------------------------------------------------------
  // Text parsing
  // ---------------------------------------------------------------------------

  /**
   * Parse extracted OCR text into structured fields.
   *
   * Amount: matches currency patterns near payment keywords.
   * Date: tries ISO, then DD/MM/YYYY (SA convention), then DD MMM YYYY.
   * Reference: captures value after ref/reference/description keywords.
   */
  parseExtractedText(text: string): ExtractedFields {
    return {
      amount: this.parseAmount(text),
      date: this.parseDate(text),
      reference: this.parseReference(text),
    };
  }

  parseAmount(text: string): number | null {
    const patterns: RegExp[] = [
      // Currency symbol + amount
      /(?:R|ZAR)\s*([0-9][0-9,\s]*\.?[0-9]{0,2})/gi,
      // Amount near payment keywords
      /(?:amount|total|paid|transfer|payment|balance|deposit)[\s:]*(?:R|ZAR)?\s*([0-9][0-9,\s]*\.?[0-9]{0,2})/gi,
    ];

    const amounts: number[] = [];

    for (const pattern of patterns) {
      let match: RegExpExecArray | null;
      pattern.lastIndex = 0;
      while ((match = pattern.exec(text)) !== null) {
        const raw = match[1].replace(/[\s,]/g, '');
        const val = parseFloat(raw);
        if (!isNaN(val) && val > 0 && val < 1_000_000) {
          amounts.push(Math.round(val * 100)); // convert to cents
        }
      }
    }

    if (amounts.length === 0) return null;

    // Return the most-frequently seen amount
    const freq = new Map<number, number>();
    for (const a of amounts) freq.set(a, (freq.get(a) ?? 0) + 1);
    let bestAmt = amounts[amounts.length - 1];
    let bestCount = 0;
    for (const [amt, count] of freq) {
      if (count > bestCount) {
        bestCount = count;
        bestAmt = amt;
      }
    }

    return bestAmt;
  }

  parseDate(text: string): Date | null {
    const patterns: Array<{
      re: RegExp;
      parse: (m: RegExpMatchArray) => Date | null;
    }> = [
      // ISO: 2025-12-31
      {
        re: /\b(\d{4})-(\d{2})-(\d{2})\b/,
        parse: (m) => {
          const d = new Date(`${m[1]}-${m[2]}-${m[3]}`);
          return isNaN(d.getTime()) ? null : d;
        },
      },
      // DD/MM/YYYY (SA convention)
      {
        re: /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/,
        parse: (m) => {
          const d = new Date(
            `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`,
          );
          return isNaN(d.getTime()) ? null : d;
        },
      },
      // DD MMM YYYY
      {
        re: /\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b/i,
        parse: (m) => {
          const d = new Date(`${m[1]} ${m[2]} ${m[3]}`);
          return isNaN(d.getTime()) ? null : d;
        },
      },
    ];

    for (const { re, parse } of patterns) {
      const match = text.match(re);
      if (match) {
        const d = parse(match);
        if (d) return d;
      }
    }

    return null;
  }

  parseReference(text: string): string | null {
    const pattern =
      /(?:ref(?:erence)?|description|narration)[\s:#]*([^\n]{1,200})/i;
    const match = text.match(pattern);
    if (!match) return null;
    const ref = match[1].trim().slice(0, 200);
    return ref.length > 0 ? ref : null;
  }

  // ---------------------------------------------------------------------------
  // Candidate transaction lookup
  // ---------------------------------------------------------------------------

  /**
   * Find unallocated credit Transactions in tenant that could match the PoP.
   * Filters: amount within +/-1 cent OR description/reference contains extracted reference.
   */
  async findCandidateTransactions(
    tenantId: string,
    extracted: ExtractedFields,
  ): Promise<Transaction[]> {
    if (extracted.amount === null && extracted.reference === null) {
      return [];
    }

    // Collect IDs of already-allocated transactions
    const allocatedIds = await this.prisma.payment
      .findMany({
        where: { tenantId, isReversed: false, transactionId: { not: null } },
        select: { transactionId: true },
      })
      .then((rows) =>
        rows.map((r) => r.transactionId).filter((id): id is string => !!id),
      );

    const orConditions: Prisma.TransactionWhereInput[] = [];

    if (extracted.amount !== null) {
      orConditions.push({
        amountCents: {
          gte: extracted.amount - 1,
          lte: extracted.amount + 1,
        },
      });
    }

    if (extracted.reference) {
      orConditions.push({
        description: {
          contains: extracted.reference,
          mode: Prisma.QueryMode.insensitive,
        },
      });
      orConditions.push({
        reference: {
          contains: extracted.reference,
          mode: Prisma.QueryMode.insensitive,
        },
      });
    }

    if (orConditions.length === 0) return [];

    return this.prisma.transaction.findMany({
      where: {
        tenantId,
        isCredit: true,
        isDeleted: false,
        id: { notIn: allocatedIds },
        OR: orConditions,
      },
      orderBy: { date: 'desc' },
      take: 10,
    });
  }

  // ---------------------------------------------------------------------------
  // Scoring
  // ---------------------------------------------------------------------------

  /**
   * Score a transaction candidate against extracted PoP fields.
   * Returns 0-100 (same scale as PaymentMatchingService).
   *
   * Signals:
   *  - Amount exact match (+/-0 cents): 60 points
   *  - Amount within +/-1 cent:         55 points
   *  - Reference match in description:  30 points
   *  - Date within 1 day:               10 points
   *  - Date within 7 days:               5 points
   */
  scoreTransactionCandidate(
    txn: Transaction,
    extracted: ExtractedFields,
  ): number {
    let score = 0;

    if (extracted.amount !== null) {
      const diff = Math.abs(Math.abs(txn.amountCents) - extracted.amount);
      if (diff === 0) score += 60;
      else if (diff <= 1) score += 55;
    }

    if (extracted.reference) {
      const ref = extracted.reference.toLowerCase();
      const desc = (txn.description ?? '').toLowerCase();
      const txnRef = (txn.reference ?? '').toLowerCase();
      if (desc.includes(ref) || txnRef.includes(ref)) {
        score += 30;
      }
    }

    if (extracted.date) {
      const daysDiff =
        Math.abs(txn.date.getTime() - extracted.date.getTime()) /
        (1000 * 60 * 60 * 24);
      if (daysDiff <= 1) score += 10;
      else if (daysDiff <= 7) score += 5;
    }

    return Math.min(score, 100);
  }
}

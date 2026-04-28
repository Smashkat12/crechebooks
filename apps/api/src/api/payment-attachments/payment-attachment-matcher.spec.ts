/**
 * PaymentAttachmentMatcherService unit tests
 *
 * Coverage:
 *  1.  extractAndMatch — happy path: amount extracted, match above threshold, Payment exists → stored
 *  2.  extractAndMatch — below threshold: extracted but no suggestion stored
 *  3.  extractAndMatch — no matches from DB: extracted only, no suggestion
 *  4.  extractAndMatch — tenant isolation: candidate query scoped to tenantId
 *  5.  extractAndMatch — not APPROVED: throws
 *  6.  extractAndMatch — not found in tenant: NotFoundException
 *  7.  parseExtractedText — amount, date (ISO), date (DD/MM/YYYY), reference
 *  8.  scoreTransactionCandidate — exact amount + reference = high score
 *  9.  scoreTransactionCandidate — below threshold on amount mismatch
 * 10.  extractAndMatch — unallocated transaction (no Payment row) stores matchConfidence only
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PaymentAttachmentStatus } from '@prisma/client';
import { PaymentAttachmentMatcherService } from './payment-attachment-matcher.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { OCRService } from '../../integrations/ocr/ocr.service';
import { Readable } from 'stream';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const ATTACHMENT_ID = 'attach-uuid-1';
const TRANSACTION_ID = 'txn-uuid-1';
const PAYMENT_ID = 'payment-uuid-1';

const approvedAttachment = {
  id: ATTACHMENT_ID,
  s3Key: `tenants/${TENANT_A}/proof-of-payments/pop.pdf`,
  contentType: 'application/pdf',
  reviewStatus: PaymentAttachmentStatus.APPROVED,
};

const pendingAttachment = {
  ...approvedAttachment,
  reviewStatus: PaymentAttachmentStatus.PENDING,
};

// A transaction that matches amount 50000 cents (R500.00)
const matchingTransaction = {
  id: TRANSACTION_ID,
  tenantId: TENANT_A,
  amountCents: 50000,
  isCredit: true,
  isDeleted: false,
  date: new Date('2025-01-31'),
  description: 'Payment from client',
  reference: 'REF123',
  payeeName: null,
};

function makeStream(content = 'fake-file-bytes'): Readable {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return stream;
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const mockPrisma = {
  paymentAttachment: {
    findFirst: jest.fn(),
    update: jest.fn(),
  },
  payment: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  transaction: {
    findMany: jest.fn(),
  },
};

const mockAuditLog = {
  logAction: jest.fn().mockResolvedValue(undefined),
};

const mockStorage = {
  getObjectStream: jest.fn(),
};

const mockOcr = {
  extractFromImage: jest.fn(),
  extractFromPdf: jest.fn(),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentAttachmentMatcherService', () => {
  let service: PaymentAttachmentMatcherService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: allocated payments list is empty
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.paymentAttachment.update.mockResolvedValue({});
    mockStorage.getObjectStream.mockResolvedValue(makeStream());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentAttachmentMatcherService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: StorageService, useValue: mockStorage },
        { provide: OCRService, useValue: mockOcr },
      ],
    }).compile();

    service = module.get<PaymentAttachmentMatcherService>(
      PaymentAttachmentMatcherService,
    );
  });

  // -------------------------------------------------------------------------
  // Happy path — above threshold, Payment row exists
  // -------------------------------------------------------------------------

  describe('happy path — match above threshold with Payment row', () => {
    it('stores suggestedPaymentId + matchConfidence when score >= 0.80', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        approvedAttachment,
      );

      // OCR returns text with R500.00
      mockOcr.extractFromPdf.mockResolvedValue({
        text: 'Amount: R 500.00\nDate: 2025-01-31\nReference: REF123',
        confidence: 85,
      });

      // One matching transaction in tenant
      mockPrisma.transaction.findMany.mockResolvedValue([matchingTransaction]);

      // A Payment already exists for this transaction
      mockPrisma.payment.findFirst.mockResolvedValue({ id: PAYMENT_ID });

      const result = await service.extractAndMatch(TENANT_A, ATTACHMENT_ID);

      expect(result.suggestedPaymentId).toBe(PAYMENT_ID);
      // Score: 60 (exact amount) + 30 (reference match) + 10 (date within 1 day) = 100 → normalised 1.0
      expect(result.matchConfidence).toBeGreaterThanOrEqual(0.8);
      expect(result.extracted.amount).toBe(50000);
      expect(result.extracted.reference).toBe('REF123');

      // Verify matchConfidence and suggestedPaymentId were persisted
      const updateCalls = mockPrisma.paymentAttachment.update.mock.calls;
      const finalUpdate = updateCalls[updateCalls.length - 1][0];
      expect(finalUpdate.data).toMatchObject({
        suggestedPaymentId: PAYMENT_ID,
      });
      // matchConfidence is Decimal(5,4) — stored as Prisma.Decimal
      expect(finalUpdate.data.matchConfidence).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Below threshold
  // -------------------------------------------------------------------------

  describe('below threshold', () => {
    it('does not store suggestion when score < 0.80', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        approvedAttachment,
      );

      // OCR: no amount → scoring will be 0
      mockOcr.extractFromPdf.mockResolvedValue({
        text: 'Some random text without amount or reference',
        confidence: 60,
      });

      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.extractAndMatch(TENANT_A, ATTACHMENT_ID);

      expect(result.suggestedPaymentId).toBeNull();
      expect(result.matchConfidence).toBeNull();
      // Update was called to persist OCR fields but not suggestedPaymentId
      const updateCalls = mockPrisma.paymentAttachment.update.mock.calls;
      expect(updateCalls[0][0].data).not.toHaveProperty('suggestedPaymentId');
    });
  });

  // -------------------------------------------------------------------------
  // No candidate transactions
  // -------------------------------------------------------------------------

  describe('no candidate transactions', () => {
    it('returns empty extraction when no transactions match', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        approvedAttachment,
      );

      mockOcr.extractFromPdf.mockResolvedValue({
        text: 'R 500.00',
        confidence: 70,
      });

      // No candidates returned from DB
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      const result = await service.extractAndMatch(TENANT_A, ATTACHMENT_ID);

      expect(result.suggestedPaymentId).toBeNull();
      expect(result.matchConfidence).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Tenant isolation
  // -------------------------------------------------------------------------

  describe('tenant isolation', () => {
    it('queries transactions scoped to tenantId', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        approvedAttachment,
      );
      mockOcr.extractFromPdf.mockResolvedValue({
        text: 'Amount R 500.00',
        confidence: 80,
      });
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.extractAndMatch(TENANT_A, ATTACHMENT_ID);

      const txnFindCall = mockPrisma.transaction.findMany.mock.calls[0][0];
      expect(txnFindCall.where.tenantId).toBe(TENANT_A);
    });

    it('findCandidateTransactions scopes to provided tenantId', async () => {
      mockPrisma.payment.findMany.mockResolvedValue([]);
      mockPrisma.transaction.findMany.mockResolvedValue([]);

      await service.findCandidateTransactions(TENANT_B, {
        amount: 50000,
        date: null,
        reference: null,
      });

      const call = mockPrisma.transaction.findMany.mock.calls[0][0];
      expect(call.where.tenantId).toBe(TENANT_B);
      // TENANT_A transactions must not be fetched
      expect(call.where.tenantId).not.toBe(TENANT_A);
    });
  });

  // -------------------------------------------------------------------------
  // Not APPROVED
  // -------------------------------------------------------------------------

  describe('not APPROVED', () => {
    it('throws when attachment is PENDING', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        pendingAttachment,
      );

      await expect(
        service.extractAndMatch(TENANT_A, ATTACHMENT_ID),
      ).rejects.toThrow(/not APPROVED/);
    });
  });

  // -------------------------------------------------------------------------
  // Not found
  // -------------------------------------------------------------------------

  describe('not found', () => {
    it('throws NotFoundException when attachment not in tenant', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(null);

      await expect(
        service.extractAndMatch(TENANT_A, ATTACHMENT_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // Unallocated transaction (no Payment row)
  // -------------------------------------------------------------------------

  describe('unallocated transaction', () => {
    it('stores matchConfidence but not suggestedPaymentId when no Payment row exists', async () => {
      mockPrisma.paymentAttachment.findFirst.mockResolvedValue(
        approvedAttachment,
      );

      // Include reference so score reaches threshold: 60 (amount) + 30 (ref) + 10 (date) = 100
      mockOcr.extractFromPdf.mockResolvedValue({
        text: 'Amount: R 500.00\nDate: 2025-01-31\nReference: REF123',
        confidence: 85,
      });

      mockPrisma.transaction.findMany.mockResolvedValue([matchingTransaction]);

      // No Payment row for this transaction
      mockPrisma.payment.findFirst.mockResolvedValue(null);

      const result = await service.extractAndMatch(TENANT_A, ATTACHMENT_ID);

      expect(result.suggestedPaymentId).toBeNull();
      // matchConfidence should be set because score >= threshold (1.0)
      expect(result.matchConfidence).toBeGreaterThanOrEqual(0.8);

      // Verify: update called with matchConfidence but no suggestedPaymentId
      const updateCalls = mockPrisma.paymentAttachment.update.mock.calls;
      const matchingUpdate = updateCalls.find(
        (call: unknown[]) =>
          (call[0] as { data: Record<string, unknown> }).data.matchConfidence !=
            null &&
          !(call[0] as { data: Record<string, unknown> }).data
            .suggestedPaymentId,
      );
      expect(matchingUpdate).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // parseExtractedText
  // -------------------------------------------------------------------------

  describe('parseExtractedText', () => {
    it('extracts amount in cents from R currency pattern', () => {
      const result = service.parseExtractedText('Total: R 1,500.00');
      expect(result.amount).toBe(150000);
    });

    it('extracts amount from ZAR pattern', () => {
      const result = service.parseExtractedText('ZAR 250.50 paid');
      expect(result.amount).toBe(25050);
    });

    it('extracts ISO date', () => {
      const result = service.parseExtractedText('Date: 2025-03-15');
      expect(result.date?.toISOString().startsWith('2025-03-15')).toBe(true);
    });

    it('extracts DD/MM/YYYY date (SA convention)', () => {
      const result = service.parseExtractedText('Date 31/01/2025');
      expect(result.date?.toISOString().startsWith('2025-01-31')).toBe(true);
    });

    it('extracts reference after "Reference:" keyword', () => {
      const result = service.parseExtractedText(
        'Reference: ACC-2025-001\nOther info',
      );
      expect(result.reference).toBe('ACC-2025-001');
    });

    it('returns nulls when text has no parseable fields', () => {
      const result = service.parseExtractedText('Hello world');
      expect(result.amount).toBeNull();
      expect(result.date).toBeNull();
      expect(result.reference).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // scoreTransactionCandidate
  // -------------------------------------------------------------------------

  describe('scoreTransactionCandidate', () => {
    it('returns >= 80 for exact amount match with reference', () => {
      const score = service.scoreTransactionCandidate(
        matchingTransaction as unknown as Parameters<
          typeof service.scoreTransactionCandidate
        >[0],
        { amount: 50000, date: new Date('2025-01-31'), reference: 'REF123' },
      );
      expect(score).toBeGreaterThanOrEqual(80);
    });

    it('returns 0 when no fields match', () => {
      const score = service.scoreTransactionCandidate(
        { ...matchingTransaction, amountCents: 99999 } as unknown as Parameters<
          typeof service.scoreTransactionCandidate
        >[0],
        { amount: 1000, date: null, reference: null },
      );
      expect(score).toBe(0);
    });

    it('caps score at 100', () => {
      const score = service.scoreTransactionCandidate(
        matchingTransaction as unknown as Parameters<
          typeof service.scoreTransactionCandidate
        >[0],
        {
          amount: 50000,
          date: new Date('2025-01-31'),
          reference: 'Payment from client',
        },
      );
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});

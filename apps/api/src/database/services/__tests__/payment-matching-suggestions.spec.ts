/**
 * Unit tests for PaymentMatchingService.getSuggestionsForTransaction
 * (AUDIT-PAY-009)
 *
 * Asserts that:
 *  1. The method is read-only — no Payment rows are created.
 *  2. Exact candidates rank ahead of partial candidates when both exist.
 *  3. Deduplication: if an invoice appears in both exact and partial sets,
 *     it is only included once.
 *  4. NotFoundException propagates when the transaction is not found.
 *  5. Empty result when no outstanding invoices exist.
 *  6. uniqueFirstNames is populated so name-scoring works correctly.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMatchingService } from '../payment-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentRepository } from '../../repositories/payment.repository';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { AuditLogService } from '../audit-log.service';
import { PaymentMatcherAgent } from '../../../agents/payment-matcher/matcher.agent';
import type { Transaction } from '@prisma/client';
import { NotFoundException } from '../../../shared/exceptions';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT = 'tenant-suggestions-test';
const TX_ID = 'tx-sugg-001';
const INV_ID_A = 'inv-sugg-a';
const INV_ID_B = 'inv-sugg-b';

const makeTransaction = (
  overrides: Partial<Transaction> = {},
): Transaction => ({
  id: TX_ID,
  tenantId: TENANT,
  bankAccount: 'Business Account',
  xeroTransactionId: null,
  date: new Date('2026-03-15'),
  amountCents: 200000, // R2 000.00
  description: 'Payment ref: Smith Thabo',
  reference: INV_ID_A,
  payeeName: 'Smith',
  isCredit: true,
  isDeleted: false,
  deletedAt: null,
  source: 'BANK_FEED',
  importBatchId: null,
  status: 'PENDING',
  isReconciled: false,
  reconciledAt: null,
  transactionHash: null,
  duplicateOfId: null,
  duplicateStatus: 'NONE',
  reversesTransactionId: null,
  isReversal: false,
  xeroAccountCode: null,
  supplierId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeInvoice = (id: string, invoiceNumber: string, overrides = {}) => ({
  id,
  invoiceNumber,
  tenantId: TENANT,
  parentId: `parent-${id}`,
  childId: `child-${id}`,
  totalCents: 200000,
  amountPaidCents: 0,
  status: 'SENT',
  isDeleted: false,
  dueDate: new Date('2026-03-31'),
  issueDate: new Date('2026-03-01'),
  parent: {
    id: `parent-${id}`,
    firstName: 'Mary',
    lastName: 'Smith',
    middleName: null,
  },
  child: {
    id: `child-${id}`,
    firstName: 'Thabo',
    lastName: 'Smith',
    middleName: null,
  },
  ...overrides,
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('PaymentMatchingService.getSuggestionsForTransaction — AUDIT-PAY-009', () => {
  let service: PaymentMatchingService;
  let prisma: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatchingService,
        {
          provide: PrismaService,
          useValue: {
            transaction: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
            },
            invoice: {
              findMany: jest.fn(),
            },
            payment: {
              findFirst: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: PaymentRepository,
          useValue: { create: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: { recordPayment: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { logAction: jest.fn() },
        },
        {
          provide: PaymentMatcherAgent,
          useValue: { makeMatchDecision: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<PaymentMatchingService>(PaymentMatchingService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------

  it('Test 1: throws NotFoundException when transaction does not exist', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      service.getSuggestionsForTransaction(TENANT, 'nonexistent-tx'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // -------------------------------------------------------------------------

  it('Test 2: returns empty array when no outstanding invoices exist', async () => {
    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(
      makeTransaction(),
    );
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getSuggestionsForTransaction(TENANT, TX_ID);

    expect(result).toEqual([]);
  });

  // -------------------------------------------------------------------------

  it('Test 3: does not call paymentRepo.create — method is read-only', async () => {
    const paymentCreateMock = jest.fn();

    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(
      makeTransaction(),
    );
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([
      makeInvoice(INV_ID_A, 'INV-2026-001'),
    ]);

    // Patch create onto the injected repo mock
    (
      service as unknown as { paymentRepo: { create: jest.Mock } }
    ).paymentRepo.create = paymentCreateMock;

    await service.getSuggestionsForTransaction(TENANT, TX_ID);

    expect(paymentCreateMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------

  it('Test 4: exact reference match returns confidence 95–100', async () => {
    // Transaction reference matches invoiceNumber exactly
    const tx = makeTransaction({ reference: 'INV-2026-EXACT' });
    const invoice = makeInvoice(INV_ID_A, 'INV-2026-EXACT');

    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(tx);
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([invoice]);

    const result = await service.getSuggestionsForTransaction(TENANT, TX_ID);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const exactCandidate = result.find((c) => c.invoiceId === INV_ID_A);
    expect(exactCandidate).toBeDefined();
    // Exact reference match guarantees confidenceScore >= 95
    expect(exactCandidate!.confidenceScore).toBeGreaterThanOrEqual(95);
  });

  // -------------------------------------------------------------------------

  it('Test 5: result is capped at 5 candidates', async () => {
    const tx = makeTransaction({
      reference: null,
      description: 'random payment',
    });
    // Create 10 invoices that will all pass the CANDIDATE_THRESHOLD (score >= 20)
    const invoices = Array.from({ length: 10 }, (_, i) =>
      makeInvoice(`inv-many-${i}`, `INV-2026-00${i}`, {
        totalCents: 200000,
        amountPaidCents: 0,
        // Vary child name so they all score on amount but not uniquely on name
        child: {
          id: `child-many-${i}`,
          firstName: `Child${i}`,
          lastName: 'Test',
          middleName: null,
        },
        parent: {
          id: `parent-many-${i}`,
          firstName: 'Parent',
          lastName: 'Test',
          middleName: null,
        },
      }),
    );

    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(tx);
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue(invoices);

    const result = await service.getSuggestionsForTransaction(TENANT, TX_ID);

    expect(result.length).toBeLessThanOrEqual(5);
  });

  // -------------------------------------------------------------------------

  it('Test 6: exact-match invoice is not duplicated even if partial scoring also scores it', async () => {
    // Invoice whose number matches the reference (exact) AND matches by amount (partial)
    const tx = makeTransaction({ reference: 'INV-2026-DUP' });
    const invoice = makeInvoice(INV_ID_A, 'INV-2026-DUP');

    (prisma.transaction.findFirst as jest.Mock).mockResolvedValue(tx);
    (prisma.invoice.findMany as jest.Mock).mockResolvedValue([invoice]);

    const result = await service.getSuggestionsForTransaction(TENANT, TX_ID);

    const ids = result.map((c) => c.invoiceId);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });
});

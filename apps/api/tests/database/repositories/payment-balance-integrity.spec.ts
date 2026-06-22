/**
 * PaymentRepository – Balance Integrity Tests
 *
 * Tests that PaymentRepository.softDelete and PaymentRepository.restore
 * correctly recompute Invoice.amountPaidCents and status via
 * InvoiceRepository.recomputePaidAndStatus (the balance-integrity fix).
 *
 * These tests require the Postgres test DB (same DATABASE_URL as other
 * repository specs).  They CANNOT run without a DB connection and are
 * designed to run in CI alongside the existing repository tests.
 *
 * Module setup mirrors payment.repository.spec.ts EXACTLY except that
 * InvoiceRepository must also be provided (PaymentRepository now depends
 * on it for recompute).
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';
import {
  MatchType,
  MatchedBy,
} from '../../../src/database/entities/payment.entity';
import { Tenant, Parent, Child, Invoice, Transaction } from '@prisma/client';

describe('PaymentRepository – balance integrity (softDelete / restore)', () => {
  let repository: PaymentRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testInvoice: Invoice;
  let testTransaction: Transaction;

  // ── Module bootstrap ─────────────────────────────────────────────────────────

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      // InvoiceRepository is required because PaymentRepository.softDelete /
      // restore now calls invoiceRepo.recomputePaidAndStatus inside their tx.
      providers: [PrismaService, InvoiceRepository, PaymentRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PaymentRepository>(PaymentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  // ── DB cleanup (FK order, mirrors payment.repository.spec.ts) ────────────────

  beforeEach(async () => {
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Seed tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Balance Integrity Creche',
        addressLine1: '1 Test Road',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
        phone: '+27115550001',
        email: `balance-integrity${Date.now()}@test.co.za`,
      },
    });

    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Test',
        lastName: 'Parent',
        email: 'parent@test.co.za',
        phone: '+27821111111',
      },
    });

    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Test',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-01'),
      },
    });

    // Invoice with totalCents = 10000 (R100.00), starting status SENT
    testInvoice = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-BI-001',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate: new Date('2025-01-01'),
        dueDate: new Date('2025-01-07'),
        subtotalCents: 8695,
        vatCents: 1305,
        totalCents: 10000,
        status: InvoiceStatus.SENT,
      },
    });

    testTransaction = await prisma.transaction.create({
      data: {
        tenantId: testTenant.id,
        bankAccount: 'FNB-001',
        date: new Date('2025-01-15'),
        description: 'Payment received',
        amountCents: 10000,
        isCredit: true,
        source: 'BANK_FEED',
      },
    });
  });

  // ── Helper ───────────────────────────────────────────────────────────────────

  async function seedPayment(amountCents: number): Promise<string> {
    const payment = await prisma.payment.create({
      data: {
        tenantId: testTenant.id,
        invoiceId: testInvoice.id,
        transactionId: testTransaction.id,
        amountCents,
        paymentDate: new Date('2025-01-15'),
        matchType: MatchType.EXACT,
        matchedBy: MatchedBy.AI_AUTO,
        matchConfidence: 1.0,
      },
    });
    return payment.id;
  }

  async function refreshInvoice(): Promise<Invoice> {
    const inv = await prisma.invoice.findUnique({
      where: { id: testInvoice.id },
    });
    return inv!;
  }

  // ── softDelete decrements invoice balance ────────────────────────────────────

  describe('softDelete recomputes invoice balance', () => {
    it('sets amountPaidCents to 0 and status to SENT after deleting the sole payment', async () => {
      // Arrange: fully paid invoice
      const paymentId = await seedPayment(10000);
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 10000, status: InvoiceStatus.PAID },
      });

      // Act
      await repository.softDelete(paymentId, testTenant.id);

      // Assert
      const inv = await refreshInvoice();
      expect(inv.amountPaidCents).toBe(0);
      expect(inv.status).toBe(InvoiceStatus.SENT);
    });

    it('payment row has deletedAt set after softDelete', async () => {
      const paymentId = await seedPayment(10000);

      await repository.softDelete(paymentId, testTenant.id);

      const payment = await prisma.payment.findUnique({
        where: { id: paymentId },
      });
      expect(payment?.deletedAt).not.toBeNull();
      expect(payment?.deletedAt).toBeInstanceOf(Date);
    });

    it('leaves the partially-paid amount from a second active payment intact', async () => {
      // Arrange: two payments of 6000 + 4000 = 10000 (PAID)
      const p1 = await seedPayment(6000);
      await seedPayment(4000);
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 10000, status: InvoiceStatus.PAID },
      });

      // Act: delete only the 4000 payment
      await repository.softDelete(p1, testTenant.id);

      // Assert: 4000 remains, PARTIALLY_PAID
      const inv = await refreshInvoice();
      expect(inv.amountPaidCents).toBe(4000);
      expect(inv.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });
  });

  // ── restore re-adds payment to invoice balance ───────────────────────────────

  describe('restore recomputes invoice balance', () => {
    it('restores amountPaidCents to 10000 and status to PAID after restore', async () => {
      // Arrange: payment that has already been soft-deleted
      const paymentId = await seedPayment(10000);
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 10000, status: InvoiceStatus.PAID },
      });
      await repository.softDelete(paymentId, testTenant.id);

      // Confirm invoice is now zeroed
      const invAfterDelete = await refreshInvoice();
      expect(invAfterDelete.amountPaidCents).toBe(0);

      // Act
      await repository.restore(paymentId, testTenant.id);

      // Assert
      const inv = await refreshInvoice();
      expect(inv.amountPaidCents).toBe(10000);
      expect(inv.status).toBe(InvoiceStatus.PAID);
    });

    it('restore clears deletedAt on the payment row', async () => {
      const paymentId = await seedPayment(10000);
      await repository.softDelete(paymentId, testTenant.id);

      const restored = await repository.restore(paymentId, testTenant.id);

      expect(restored.deletedAt).toBeNull();
    });

    it('restore of a partial payment sets PARTIALLY_PAID', async () => {
      // Arrange: only a 6000-cent payment, invoice totalCents=10000
      const paymentId = await seedPayment(6000);
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 6000, status: InvoiceStatus.PARTIALLY_PAID },
      });
      await repository.softDelete(paymentId, testTenant.id);

      // Act
      await repository.restore(paymentId, testTenant.id);

      // Assert
      const inv = await refreshInvoice();
      expect(inv.amountPaidCents).toBe(6000);
      expect(inv.status).toBe(InvoiceStatus.PARTIALLY_PAID);
    });
  });

  // ── soft-delete then restore is a round-trip ─────────────────────────────────

  describe('round-trip: softDelete then restore restores original state', () => {
    it('returns invoice to PAID / 10000 after delete then restore cycle', async () => {
      const paymentId = await seedPayment(10000);
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 10000, status: InvoiceStatus.PAID },
      });

      await repository.softDelete(paymentId, testTenant.id);
      await repository.restore(paymentId, testTenant.id);

      const inv = await refreshInvoice();
      expect(inv.amountPaidCents).toBe(10000);
      expect(inv.status).toBe(InvoiceStatus.PAID);
    });
  });

  // ── Clamp: overpayment stored in payment rows capped at totalCents ────────────

  describe('recompute clamps overpaid value to totalCents', () => {
    it('invoice amountPaidCents never exceeds totalCents even if payment rows sum higher', async () => {
      // Seed a payment row whose amountCents > invoice.totalCents to simulate
      // pre-fix data. After a softDelete+restore cycle the recompute path is
      // exercised; the SECOND payment being the active one must be clamped.
      const p1 = await seedPayment(12000); // 12000 > totalCents=10000
      await prisma.invoice.update({
        where: { id: testInvoice.id },
        data: { amountPaidCents: 12000, status: InvoiceStatus.PAID },
      });

      // Soft-delete triggers recompute with 0 active payments
      await repository.softDelete(p1, testTenant.id);
      const inv = await refreshInvoice();
      // 0 active payments -> amountPaidCents = 0
      expect(inv.amountPaidCents).toBe(0);

      // Restore triggers recompute with the 12000 payment active again
      await repository.restore(p1, testTenant.id);
      const invAfterRestore = await refreshInvoice();
      // clamp(12000, 0, 10000) = 10000
      expect(invAfterRestore.amountPaidCents).toBe(10000);
      expect(invAfterRestore.status).toBe(InvoiceStatus.PAID);
    });
  });

  // ── Initialisation sanity check ──────────────────────────────────────────────

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });
});

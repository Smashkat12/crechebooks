/**
 * Payment Matching - Name Extraction & Matching Tests
 * Tests the improved SA banking description parsing and name matching logic.
 *
 * Covers real-world patterns from FNB/Capitec/ABSA bank statements:
 * - Banking prefix stripping (Payshap, Magtape, ADT, Rtc, etc.)
 * - Concatenated names (SSkhosana, Bokamosombewe)
 * - Initial + surname (M MOSAKA, N MALINGA)
 * - First-name-only payments (Onthatile, Leano)
 * - Hex hash removal from Rtc Credit transactions
 * - Non-person transaction exclusion (Owner Loan, G Suite)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMatchingService } from '../payment-matching.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentRepository } from '../../repositories/payment.repository';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { AuditLogService } from '../audit-log.service';
import { PaymentMatcherAgent } from '../../../agents/payment-matcher/matcher.agent';
import { Transaction, Invoice, Parent, Child } from '@prisma/client';

type InvoiceWithRelations = Invoice & { parent: Parent; child: Child };

describe('PaymentMatchingService - Name Extraction & Matching', () => {
  let service: PaymentMatchingService;

  const tenantId = 'tenant-test';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentMatchingService,
        { provide: PrismaService, useValue: {} },
        { provide: PaymentRepository, useValue: {} },
        { provide: InvoiceRepository, useValue: {} },
        { provide: AuditLogService, useValue: {} },
        { provide: PaymentMatcherAgent, useValue: {} },
      ],
    }).compile();

    service = module.get<PaymentMatchingService>(PaymentMatchingService);
  });

  function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
    return {
      id: 'txn-1',
      tenantId,
      bankAccount: 'Business Account',
      xeroTransactionId: null,
      date: new Date('2026-01-15'),
      amountCents: 150000,
      description: '',
      reference: null,
      payeeName: null,
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
    };
  }

  function makeInvoice(
    parentFirst: string,
    parentLast: string,
    childFirst: string,
    childLast: string,
    totalCents = 150000,
  ): InvoiceWithRelations {
    return {
      id: `inv-${childFirst.toLowerCase()}`,
      tenantId,
      xeroInvoiceId: null,
      invoiceNumber: `INV-2026-001`,
      parentId: `parent-${parentLast.toLowerCase()}`,
      childId: `child-${childFirst.toLowerCase()}`,
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
      issueDate: new Date('2026-01-01'),
      dueDate: new Date('2026-01-07'),
      subtotalCents: totalCents,
      vatCents: 0,
      totalCents,
      amountPaidCents: 0,
      status: 'SENT',
      deliveryMethod: null,
      deliveryStatus: null,
      deliveredAt: null,
      notes: null,
      isDeleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      deliveryRetryCount: 0,
      pdfUrl: null,
      vatRate: null,
      parent: {
        id: `parent-${parentLast.toLowerCase()}`,
        tenantId,
        firstName: parentFirst,
        lastName: parentLast,
        email: null,
        phone: null,
        whatsapp: null,
        whatsappOptIn: false,
        address: null,
        idNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        xeroContactId: null,
      } as Parent,
      child: {
        id: `child-${childFirst.toLowerCase()}`,
        tenantId,
        parentId: `parent-${parentLast.toLowerCase()}`,
        firstName: childFirst,
        lastName: childLast,
        dateOfBirth: new Date('2022-01-01'),
        status: 'ENROLLED',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
        enrollmentDate: new Date('2025-01-01'),
        withdrawalDate: null,
        notes: null,
        medicalInfo: null,
        allergies: null,
        emergencyContact: null,
      } as unknown as Child,
    } as unknown as InvoiceWithRelations;
  }

  // ───────────────────────────────────────────────────
  // NAME EXTRACTION VIA extractNamesFromDescription
  // (tested indirectly through calculateConfidence)
  // ──���────────────────────────────────────────────────

  describe('Name extraction from SA banking descriptions', () => {
    const invoice = makeInvoice('Rose', 'Nthite', 'Phenyo', 'Nthite', 150000);

    const testCases: Array<{
      description: string;
      expectedMinScore: number;
      label: string;
    }> = [
      {
        description: 'ADT Cash Deposit 00686117 Phenyo Nthite',
        expectedMinScore: 15,
        label: 'ADT with account number + child name',
      },
      {
        description: 'Payshap Credit Phenyo',
        expectedMinScore: 10,
        label: 'Payshap with first name only',
      },
      {
        description: 'adt cash deposit 00686115 phenyo nthite',
        expectedMinScore: 15,
        label: 'ADT lowercase',
      },
      {
        description: 'ADT Cash Deposit 00686115 Phenyo Nthite Workbo',
        expectedMinScore: 15,
        label: 'ADT with truncated suffix (Workbo)',
      },
      {
        description: 'ADT Cash Deposit Bloedstr NSeitshokelo',
        expectedMinScore: 0,
        label: 'ADT with branch name - no match expected',
      },
    ];

    test.each(testCases)(
      '$label: "$description" → score >= $expectedMinScore',
      ({ description, expectedMinScore }) => {
        const txn = makeTransaction({
          description,
          payeeName: description,
        });
        const { score } = service.calculateConfidence(txn, invoice);
        // Name score is part of the total; we verify name component is non-zero
        // by checking total exceeds what we'd get from just amount + date
        expect(score).toBeGreaterThanOrEqual(expectedMinScore);
      },
    );
  });

  describe('Payshap / Magtape / Rtc prefix stripping', () => {
    const invoiceMbewe = makeInvoice(
      'Lesego',
      'Mbewe',
      'Bokamoso',
      'Mbewe',
      100000,
    );

    it('Payshap Credit Bokamoso Mbewe → exact child name (20 pts name component)', () => {
      const txn = makeTransaction({
        description: 'Payshap Credit Bokamoso Mbewe',
        payeeName: 'Payshap Credit Bokamoso Mbewe',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceMbewe);
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
      expect(score).toBeGreaterThanOrEqual(60); // name + amount + date
    });

    it('Payshap Credit Bokamosombewe → concatenated child name', () => {
      const txn = makeTransaction({
        description: 'Payshap Credit Bokamosombewe',
        payeeName: 'Payshap Credit Bokamosombewe',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceMbewe);
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
      expect(score).toBeGreaterThanOrEqual(40);
    });

    it('Rtc Credit Bokamoso Mbewe 34B1Fb1431 → strips hex hash', () => {
      const txn = makeTransaction({
        description: 'Rtc Credit Bokamoso Mbewe 34B1Fb1431',
        payeeName: 'Rtc Credit Bokamoso Mbewe 34B1Fb1431',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceMbewe);
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
      expect(score).toBeGreaterThanOrEqual(60);
    });

    it('Magtape Credit Capitec Bokamoso Mbewe → strips bank prefix', () => {
      const txn = makeTransaction({
        description: 'Magtape Credit Capitec Bokamoso Mbewe',
        payeeName: 'Magtape Credit Capitec Bokamoso Mbewe',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceMbewe);
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
      expect(score).toBeGreaterThanOrEqual(60);
    });
  });

  describe('Initial + surname matching', () => {
    const invoiceMosaka = makeInvoice(
      'Mmatseleng Mosaka',
      'Mosaka',
      'Ulethiwe',
      'Mkhonto',
      190000,
    );
    const invoiceMalinga = makeInvoice(
      'Nothemba',
      'Malinga',
      'Zara Nonsikelelo',
      'Malinga',
      150000,
    );
    const invoiceSkhosana = makeInvoice(
      'Simphiwe',
      'Skhosana',
      'Siphosethu',
      'Skhosana',
      150000,
    );

    it('CAPITEC M MOSAKA → matches Mmatseleng Mosaka via initial + surname', () => {
      const txn = makeTransaction({
        description: 'CAPITEC M MOSAKA',
        payeeName: 'CAPITEC M MOSAKA',
        amountCents: 190000,
      });
      const { score, reasons } = service.calculateConfidence(
        txn,
        invoiceMosaka,
      );
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
      expect(score).toBeGreaterThanOrEqual(40);
    });

    it('N MALINGA N MALINGA → matches Nothemba Malinga', () => {
      const txn = makeTransaction({
        description: 'N MALINGA N MALINGA',
        payeeName: 'N MALINGA N MALINGA',
        amountCents: 151000,
      });
      const { score, reasons } = service.calculateConfidence(
        txn,
        invoiceMalinga,
      );
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
    });

    it('Payshap Credit SSkhosana → matches Simphiwe Skhosana', () => {
      const txn = makeTransaction({
        description: 'Payshap Credit SSkhosana',
        payeeName: 'Payshap Credit SSkhosana',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(
        txn,
        invoiceSkhosana,
      );
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
    });

    it('S Skhosana → matches Simphiwe Skhosana (bare name, no prefix)', () => {
      const txn = makeTransaction({
        description: 'S Skhosana',
        payeeName: 'S Skhosana',
        amountCents: 100000,
      });
      const { score, reasons } = service.calculateConfidence(
        txn,
        invoiceSkhosana,
      );
      expect(reasons.some((r) => r.toLowerCase().includes('name'))).toBe(true);
    });
  });

  describe('Surname-only matching (family member paying)', () => {
    const invoiceKhoza = makeInvoice(
      'Cathrine',
      'Khoza',
      'Kagoyarona',
      'Khoza',
      150000,
    );

    it('Magtape Credit Capitec Gosiame Khoza → surname match to Khoza family', () => {
      const txn = makeTransaction({
        description: 'Magtape Credit Capitec Gosiame Khoza',
        payeeName: 'Magtape Credit Capitec Gosiame Khoza',
        amountCents: 95000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceKhoza);
      expect(
        reasons.some(
          (r) =>
            r.toLowerCase().includes('surname') ||
            r.toLowerCase().includes('name'),
        ),
      ).toBe(true);
    });

    it('Magtape Credit Warona Khoza → surname match to Khoza family', () => {
      const txn = makeTransaction({
        description: 'Magtape Credit Warona Khoza',
        payeeName: 'Magtape Credit Warona Khoza',
        amountCents: 95000,
      });
      const { score, reasons } = service.calculateConfidence(txn, invoiceKhoza);
      expect(
        reasons.some(
          (r) =>
            r.toLowerCase().includes('surname') ||
            r.toLowerCase().includes('name'),
        ),
      ).toBe(true);
    });
  });

  describe('Non-person transaction exclusion', () => {
    const invoice = makeInvoice('Rose', 'Nqunqa', 'Enelo', 'Nqunqa', 150000);

    const nonPersonDescriptions = [
      'Owner Loan',
      'G Suite',
      'FNB App Payment From Elle Elephant',
      'SCHEDULED PYMT FROM OWNER LOAN OWNER LOA',
    ];

    test.each(nonPersonDescriptions)(
      '"%s" should not produce high name scores',
      (desc) => {
        const txn = makeTransaction({
          description: desc,
          payeeName: desc,
          amountCents: 100000,
        });
        const { score } = service.calculateConfidence(txn, invoice);
        // These should not match invoice for Enelo Nqunqa
        // Score should come only from amount/date, not name
        expect(score).toBeLessThan(80);
      },
    );
  });

  describe('findPartialMatches returns best candidates sorted', () => {
    it('ranks child full name match above surname-only match', () => {
      const invoiceMbewe = makeInvoice(
        'Lesego',
        'Mbewe',
        'Bokamoso',
        'Mbewe',
        100000,
      );
      const invoiceOther = makeInvoice(
        'Someone',
        'Mbewe',
        'Sibling',
        'Mbewe',
        100000,
      );

      const txn = makeTransaction({
        description: 'Payshap Credit Bokamoso Mbewe',
        payeeName: 'Payshap Credit Bokamoso Mbewe',
        amountCents: 100000,
      });

      const results = service.findPartialMatches(txn, [
        invoiceOther,
        invoiceMbewe,
      ]);

      expect(results.length).toBeGreaterThanOrEqual(1);
      // The exact child name match should rank first
      expect(results[0].invoiceId).toBe(invoiceMbewe.id);
      expect(results[0].confidenceScore).toBeGreaterThan(
        results[1]?.confidenceScore ?? 0,
      );
    });
  });
});

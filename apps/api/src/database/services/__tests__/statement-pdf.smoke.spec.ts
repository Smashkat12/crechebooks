/**
 * Smoke test: actually exercise the PDF rendering pipeline with PDFKit.
 * The unit tests elsewhere mock StatementPdfService, so this is the first
 * test that runs the renderer end-to-end.
 */

import { StatementPdfService } from '../statement-pdf.service';

const tenantRepo = {
  findById: async () => ({
    id: 't1',
    name: 'Test',
    tradingName: 'Trading',
    addressLine1: '1 Test St',
    addressLine2: null,
    city: 'CT',
    province: 'WC',
    postalCode: '8000',
    phone: '0123456789',
    email: 'e@e.com',
    bankName: null,
    bankAccountNumber: null,
    bankBranchCode: null,
    bankAccountHolder: null,
    bankAccountType: null,
    bankSwiftCode: null,
    taxStatus: 'NON_VAT_REGISTERED',
    vatNumber: null,
  }),
} as any;

const parentRepo = {
  findById: async () => ({
    id: 'p1',
    firstName: 'A',
    middleName: '',
    lastName: 'B',
    email: 'p@p.com',
    phone: '0123456789',
    children: [],
  }),
} as any;

const stmtRepo = {
  findByIdWithLines: async () => ({
    id: 's1',
    statementNumber: 'STMT-001',
    parentId: 'p1',
    tenantId: 't1',
    periodStart: new Date('2025-12-01'),
    periodEnd: new Date('2026-01-31'),
    openingBalanceCents: 0,
    totalChargesCents: 295238,
    totalPaymentsCents: 0,
    totalCreditsCents: 0,
    closingBalanceCents: 395238,
    status: 'FINAL',
    createdAt: new Date(),
    lines: [
      {
        date: new Date('2025-12-31'),
        description: 'Opening Balance',
        lineType: 'OPENING_BALANCE',
        referenceNumber: null,
        debitCents: 0,
        creditCents: 0,
        balanceCents: 0,
        sortOrder: 0,
      },
      {
        date: new Date('2026-01-01'),
        description: 'Kenya Modise',
        lineType: 'INVOICE',
        referenceNumber: 'INV-2026-004',
        debitCents: 145238,
        creditCents: 0,
        balanceCents: 145238,
        sortOrder: 1,
      },
      {
        date: new Date('2026-02-28'),
        description: 'Closing Balance',
        lineType: 'CLOSING_BALANCE',
        referenceNumber: null,
        debitCents: 395238,
        creditCents: 0,
        balanceCents: 395238,
        sortOrder: 2,
      },
    ],
  }),
} as any;

describe('StatementPdfService — end-to-end PDF generation', () => {
  it('generatePdf produces a non-empty buffer (regression for refactor)', async () => {
    const svc = new StatementPdfService(tenantRepo, parentRepo, stmtRepo);
    const buf = await svc.generatePdf('t1', 's1', {
      includePaymentInstructions: true,
    });
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500); // real PDFs are well over 500 bytes
    // PDF magic bytes
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('generateLedgerPdf produces a non-empty buffer with no Statement row', async () => {
    const svc = new StatementPdfService(tenantRepo, parentRepo, stmtRepo);
    const buf = await svc.generateLedgerPdf(
      {
        tenantId: 't1',
        parentId: 'p1',
        periodStart: new Date('2025-12-01'),
        periodEnd: new Date('2026-01-31'),
        openingBalanceCents: 0,
        totalChargesCents: 145238,
        totalPaymentsCents: 0,
        totalCreditsCents: 0,
        closingBalanceCents: 145238,
        lines: [
          {
            date: new Date('2025-12-31'),
            description: 'Opening Balance',
            referenceNumber: null,
            debitCents: 0,
            creditCents: 0,
            balanceCents: 0,
          },
          {
            date: new Date('2026-01-01'),
            description: 'Kenya Modise',
            referenceNumber: 'INV-2026-004',
            debitCents: 145238,
            creditCents: 0,
            balanceCents: 145238,
          },
          {
            date: new Date('2026-01-31'),
            description: 'Closing Balance',
            referenceNumber: null,
            debitCents: 145238,
            creditCents: 0,
            balanceCents: 145238,
          },
        ],
      },
      { includePaymentInstructions: true },
    );
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.length).toBeGreaterThan(500);
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
  });
});

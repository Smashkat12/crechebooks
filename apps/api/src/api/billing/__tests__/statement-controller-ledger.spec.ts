/**
 * Tests for the live ledger endpoints on StatementController:
 *   - GET /statements/parents/:parentId/ledger
 *   - GET /statements/parents/:parentId/ledger/pdf
 *
 * These endpoints compute a ledger snapshot WITHOUT persisting a Statement
 * row. They reuse StatementGenerationService.computeLiveLedger() — which is
 * the same math used by the persisted generateStatement() — guaranteeing
 * that "live" numbers and "sent" numbers stay in lockstep.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { StatementController } from '../statement.controller';
import { StatementGenerationService } from '../../../database/services/statement-generation.service';
import { StatementPdfService } from '../../../database/services/statement-pdf.service';
import { StatementRepository } from '../../../database/repositories/statement.repository';
import { ParentAccountService } from '../../../database/services/parent-account.service';
import { ParentRepository } from '../../../database/repositories/parent.repository';
import { StatementDeliveryService } from '../../../database/services/statement-delivery.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_TENANT = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser = {
  id: 'user-1',
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
};

const parent = {
  id: PARENT_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  middleName: '',
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: '0821234567',
  deletedAt: null,
  children: [],
};

const sampleLedger = {
  tenantId: TENANT_ID,
  parentId: PARENT_ID,
  periodStart: new Date('2025-01-01T00:00:00.000Z'),
  periodEnd: new Date('2025-03-31T23:59:59.999Z'),
  openingBalanceCents: 50000,
  totalChargesCents: 200000,
  totalPaymentsCents: 100000,
  totalCreditsCents: 0,
  closingBalanceCents: 150000,
  lines: [
    {
      date: new Date('2025-01-01T00:00:00.000Z'),
      description: 'Opening Balance',
      lineType: 'OPENING_BALANCE' as const,
      referenceNumber: undefined,
      debitCents: 50000,
      creditCents: 0,
      balanceCents: 50000,
      sortOrder: 0,
    },
    {
      date: new Date('2025-01-15T00:00:00.000Z'),
      description: 'Ada Smith – January 2025',
      lineType: 'INVOICE' as const,
      referenceNumber: 'INV-2025-0001',
      debitCents: 200000,
      creditCents: 0,
      balanceCents: 250000,
      sortOrder: 1,
    },
    {
      date: new Date('2025-02-01T00:00:00.000Z'),
      description: 'Payment received',
      lineType: 'PAYMENT' as const,
      referenceNumber: 'INV-2025-0001',
      debitCents: 0,
      creditCents: 100000,
      balanceCents: 150000,
      sortOrder: 2,
    },
    {
      date: new Date('2025-03-31T23:59:59.999Z'),
      description: 'Closing Balance',
      lineType: 'CLOSING_BALANCE' as const,
      referenceNumber: undefined,
      debitCents: 150000,
      creditCents: 0,
      balanceCents: 150000,
      sortOrder: 3,
    },
  ],
};

async function buildController(overrides: {
  computeLiveLedger?: jest.Mock;
  generateLedgerPdf?: jest.Mock;
  parent?: typeof parent | null;
} = {}) {
  const computeLiveLedger =
    overrides.computeLiveLedger ?? jest.fn().mockResolvedValue(sampleLedger);
  const generateLedgerPdf =
    overrides.generateLedgerPdf ??
    jest.fn().mockResolvedValue(Buffer.from('PDFCONTENT'));

  const module: TestingModule = await Test.createTestingModule({
    controllers: [StatementController],
    providers: [
      {
        provide: StatementGenerationService,
        useValue: {
          computeLiveLedger,
          getStatementWithLines: jest.fn(),
          generateStatement: jest.fn(),
          finalizeStatement: jest.fn(),
          getStatementsForParent: jest.fn(),
          bulkGenerateStatements: jest.fn(),
        },
      },
      {
        provide: StatementPdfService,
        useValue: { generatePdf: jest.fn(), generateLedgerPdf },
      },
      {
        provide: StatementRepository,
        useValue: { findByTenant: jest.fn(), findById: jest.fn() },
      },
      { provide: ParentAccountService, useValue: { getAccountSummary: jest.fn() } },
      {
        provide: ParentRepository,
        useValue: {
          findById: jest
            .fn()
            .mockResolvedValue(overrides.parent === undefined ? parent : overrides.parent),
        },
      },
      { provide: StatementDeliveryService, useValue: { deliverStatement: jest.fn() } },
    ],
  }).compile();

  const controller = module.get<StatementController>(StatementController);
  return { controller, computeLiveLedger, generateLedgerPdf };
}

describe('StatementController — live ledger endpoints', () => {
  describe('GET /statements/parents/:parentId/ledger', () => {
    it('returns a live ledger payload with explicit period', async () => {
      const { controller, computeLiveLedger } = await buildController();

      const result = await controller.getLedger(
        PARENT_ID,
        { period_start: '2025-01-01', period_end: '2025-03-31' } as any,
        mockUser as any,
      );

      expect(result.success).toBe(true);
      expect(result.data.is_live).toBe(true);
      expect(result.data.opening_balance_cents).toBe(50000);
      expect(result.data.closing_balance_cents).toBe(150000);
      expect(result.data.total_charges_cents).toBe(200000);
      expect(result.data.total_payments_cents).toBe(100000);
      expect(result.data.lines).toHaveLength(4);
      expect(result.data.lines[1].reference_number).toBe('INV-2025-0001');
      expect(result.data.parent.name).toBe('Jane Smith');

      // Period was forwarded to the service
      expect(computeLiveLedger).toHaveBeenCalledTimes(1);
      const call = computeLiveLedger.mock.calls[0][0];
      expect(call.tenantId).toBe(TENANT_ID);
      expect(call.parentId).toBe(PARENT_ID);
      // periodStart normalized to start-of-day, periodEnd to end-of-day
      expect(call.periodStart.getHours()).toBe(0);
      expect(call.periodEnd.getHours()).toBe(23);
    });

    it('defaults to last 3 months when no period is supplied', async () => {
      const { controller, computeLiveLedger } = await buildController();

      await controller.getLedger(PARENT_ID, {} as any, mockUser as any);

      const call = computeLiveLedger.mock.calls[0][0];
      const diffDays = Math.round(
        (call.periodEnd.getTime() - call.periodStart.getTime()) /
          (1000 * 60 * 60 * 24),
      );
      // 3 months is ~89-92 days depending on month
      expect(diffDays).toBeGreaterThanOrEqual(88);
      expect(diffDays).toBeLessThanOrEqual(93);
    });

    it('scopes by tenantId (passes the caller tenant to the service)', async () => {
      const { controller, computeLiveLedger } = await buildController();

      await controller.getLedger(
        PARENT_ID,
        {} as any,
        { ...mockUser, tenantId: OTHER_TENANT } as any,
      );

      expect(computeLiveLedger.mock.calls[0][0].tenantId).toBe(OTHER_TENANT);
    });

    it('returns lines with deterministic positional ids (no DB row needed)', async () => {
      const { controller } = await buildController();
      const result = await controller.getLedger(
        PARENT_ID,
        {} as any,
        mockUser as any,
      );

      expect(result.data.lines.map((l) => l.id)).toEqual([
        'live-0',
        'live-1',
        'live-2',
        'live-3',
      ]);
    });
  });

  describe('GET /statements/parents/:parentId/ledger/pdf', () => {
    it('returns a PDF stream with correct headers', async () => {
      const { controller, generateLedgerPdf } = await buildController();

      const set = jest.fn();
      const end = jest.fn();
      const res = { set, end } as any;

      await controller.downloadLedgerPdf(
        PARENT_ID,
        { period_start: '2025-01-01', period_end: '2025-03-31' } as any,
        mockUser as any,
        res,
      );

      expect(generateLedgerPdf).toHaveBeenCalledTimes(1);
      const pdfInput = generateLedgerPdf.mock.calls[0][0];
      expect(pdfInput.tenantId).toBe(TENANT_ID);
      expect(pdfInput.parentId).toBe(PARENT_ID);
      expect(pdfInput.openingBalanceCents).toBe(50000);
      expect(pdfInput.closingBalanceCents).toBe(150000);
      expect(pdfInput.lines).toHaveLength(4);

      expect(set).toHaveBeenCalledTimes(1);
      const headers = set.mock.calls[0][0];
      expect(headers['Content-Type']).toBe('application/pdf');
      expect(headers['Content-Disposition']).toMatch(/^attachment; filename=/);
      expect(headers['Content-Length']).toBe('10'); // 'PDFCONTENT'.length
      expect(end).toHaveBeenCalledTimes(1);
      expect(end.mock.calls[0][0]).toBeInstanceOf(Buffer);
    });
  });
});

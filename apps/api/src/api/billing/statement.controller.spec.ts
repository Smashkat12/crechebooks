/**
 * StatementController — formatFullName integration tests (AUDIT-BILL-06)
 *
 * Verifies that the 4 raw-concat sites previously using
 * `${parent.firstName} ${parent.lastName}` now include middleName via
 * formatFullName(parent). Only the name-serialisation path is exercised here;
 * deeper business logic lives in the service specs.
 *
 * Handlers covered:
 *  1. findOne       (GET /statements/:id)
 *  2. generate      (POST /statements/generate)
 *  3. finalize      (POST /statements/:id/finalize)
 *  4. getForParent  (GET /statements/parents/:parentId)
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException as NestNotFoundException,
} from '@nestjs/common';
import { StatementController } from './statement.controller';
import { StatementGenerationService } from '../../database/services/statement-generation.service';
import { StatementPdfService } from '../../database/services/statement-pdf.service';
import { StatementRepository } from '../../database/repositories/statement.repository';
import { ParentAccountService } from '../../database/services/parent-account.service';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { StatementDeliveryService } from '../../database/services/statement-delivery.service';
import { SchedulerService } from '../../scheduler/scheduler.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STMT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const mockUser = {
  id: 'user-1',
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
};

/** Parent WITH a middle name — the critical case */
const parentWithMiddle = {
  id: PARENT_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  middleName: 'Marie',
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: '0821234567',
  deletedAt: null,
  children: [],
};

/** Parent WITHOUT a middle name — must still work gracefully */
const parentNoMiddle = {
  id: PARENT_ID,
  tenantId: TENANT_ID,
  firstName: 'Jane',
  middleName: null,
  lastName: 'Smith',
  email: 'jane@example.com',
  phone: '0821234567',
  deletedAt: null,
  children: [],
};

const NOW = new Date('2025-03-01T00:00:00.000Z');
const END = new Date('2025-03-31T23:59:59.000Z');

function baseStatement(overrides = {}) {
  return {
    id: STMT_ID,
    statementNumber: 'STMT-001',
    parentId: PARENT_ID,
    tenantId: TENANT_ID,
    periodStart: NOW,
    periodEnd: END,
    openingBalanceCents: 0,
    totalChargesCents: 100000,
    totalPaymentsCents: 0,
    totalCreditsCents: 0,
    closingBalanceCents: 100000,
    status: 'DRAFT',
    createdAt: NOW,
    lines: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------
function makeStatementGenerationService(stmtOverrides = {}) {
  return {
    getStatementWithLines: jest
      .fn()
      .mockResolvedValue(baseStatement(stmtOverrides)),
    generateStatement: jest
      .fn()
      .mockResolvedValue(baseStatement({ ...stmtOverrides, lines: [] })),
    finalizeStatement: jest
      .fn()
      .mockResolvedValue(baseStatement({ ...stmtOverrides, status: 'FINAL' })),
    getStatementsForParent: jest
      .fn()
      .mockResolvedValue([baseStatement(stmtOverrides)]),
    bulkGenerateStatements: jest.fn().mockResolvedValue({
      generated: 0,
      skipped: 0,
      errors: [],
      statementIds: [],
    }),
  };
}

function makeParentRepository(parent: typeof parentWithMiddle) {
  return {
    findById: jest.fn().mockResolvedValue(parent),
  };
}

async function buildController(
  parent: typeof parentWithMiddle,
  stmtOverrides = {},
): Promise<StatementController> {
  const module: TestingModule = await Test.createTestingModule({
    controllers: [StatementController],
    providers: [
      {
        provide: StatementGenerationService,
        useValue: makeStatementGenerationService(stmtOverrides),
      },
      { provide: StatementPdfService, useValue: { generatePdf: jest.fn() } },
      {
        provide: StatementRepository,
        useValue: {
          findByTenant: jest.fn().mockResolvedValue([]),
          findById: jest.fn(),
        },
      },
      {
        provide: ParentAccountService,
        useValue: { getAccountSummary: jest.fn() },
      },
      { provide: ParentRepository, useValue: makeParentRepository(parent) },
      {
        provide: StatementDeliveryService,
        useValue: {
          deliverStatement: jest.fn(),
          bulkDeliverStatements: jest.fn(),
        },
      },
      { provide: SchedulerService, useValue: null },
    ],
  }).compile();

  return module.get<StatementController>(StatementController);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('StatementController — formatFullName serialisation (AUDIT-BILL-06)', () => {
  describe('findOne (GET /statements/:id)', () => {
    it('includes middle name in parent.name when parent has middleName', async () => {
      const controller = await buildController(parentWithMiddle);
      const result = await controller.findOne(STMT_ID, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Marie Smith');
    });

    it('returns first + last only when middleName is null', async () => {
      const controller = await buildController(parentNoMiddle);
      const result = await controller.findOne(STMT_ID, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Smith');
    });
  });

  describe('generate (POST /statements/generate)', () => {
    it('includes middle name in parent.name when parent has middleName', async () => {
      const controller = await buildController(parentWithMiddle);
      const dto = {
        parent_id: PARENT_ID,
        period_start: '2025-03-01',
        period_end: '2025-03-31',
      } as any;
      const result = await controller.generate(dto, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Marie Smith');
    });

    it('returns first + last only when middleName is null', async () => {
      const controller = await buildController(parentNoMiddle);
      const dto = {
        parent_id: PARENT_ID,
        period_start: '2025-03-01',
        period_end: '2025-03-31',
      } as any;
      const result = await controller.generate(dto, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Smith');
    });
  });

  describe('finalize (POST /statements/:id/finalize)', () => {
    it('includes middle name in parent.name when parent has middleName', async () => {
      const controller = await buildController(parentWithMiddle);
      const result = await controller.finalize(STMT_ID, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Marie Smith');
    });

    it('returns first + last only when middleName is null', async () => {
      const controller = await buildController(parentNoMiddle);
      const result = await controller.finalize(STMT_ID, mockUser as any);
      expect(result.data.parent.name).toBe('Jane Smith');
    });
  });

  describe('getForParent (GET /statements/parents/:parentId)', () => {
    it('includes middle name in parent.name when parent has middleName', async () => {
      const controller = await buildController(parentWithMiddle);
      const result = await controller.getForParent(PARENT_ID, mockUser as any);
      expect(result.data[0].parent.name).toBe('Jane Marie Smith');
    });

    it('returns first + last only when middleName is null', async () => {
      const controller = await buildController(parentNoMiddle);
      const result = await controller.getForParent(PARENT_ID, mockUser as any);
      expect(result.data[0].parent.name).toBe('Jane Smith');
    });
  });

  describe('findAll (GET /statements) — pre-existing correct site', () => {
    it('includes middle name in parent.name via formatFullName (regression guard)', async () => {
      const stmtSummary = baseStatement();
      const module: TestingModule = await Test.createTestingModule({
        controllers: [StatementController],
        providers: [
          {
            provide: StatementGenerationService,
            useValue: { ...makeStatementGenerationService() },
          },
          {
            provide: StatementPdfService,
            useValue: { generatePdf: jest.fn() },
          },
          {
            provide: StatementRepository,
            useValue: {
              findByTenant: jest.fn().mockResolvedValue([stmtSummary]),
              findById: jest.fn(),
            },
          },
          { provide: ParentAccountService, useValue: {} },
          {
            provide: ParentRepository,
            useValue: makeParentRepository(parentWithMiddle),
          },
          { provide: StatementDeliveryService, useValue: {} },
          { provide: SchedulerService, useValue: null },
        ],
      }).compile();

      const controller = module.get<StatementController>(StatementController);
      const result = await controller.findAll({} as any, mockUser as any);
      expect(result.data[0].parent.name).toBe('Jane Marie Smith');
    });
  });
});

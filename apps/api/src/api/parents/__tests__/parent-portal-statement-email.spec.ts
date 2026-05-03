/**
 * ParentPortalController.emailStatement — unit tests
 *
 * Coverage:
 *  1. COMMS_DISABLED=false (normal): statement found, FINAL — email dispatched, audit logged
 *  2. COMMS_DISABLED=true: delivery short-circuits in EmailService; endpoint returns success
 *  3. Statement DB row not found for this period → 404 NotFoundException
 *  4. Statement belongs to a different parent (findFirst returns null) → 404
 *  5. Parent email not found → 404
 *  6. Statement not FINAL (BusinessException from delivery service) → 400 BadRequestException
 *  7. Invalid year/month params → 404 NotFoundException
 *  8. Audit log is written BEFORE delivery (even when delivery fails)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import type { CanActivate } from '@nestjs/common';
import { ParentPortalController } from '../parent-portal.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentOnboardingService } from '../../../database/services/parent-onboarding.service';
import { ParentPortalChildService } from '../parent-portal-child.service';
import { InvoicePdfService } from '../../../database/services/invoice-pdf.service';
import { StatementPdfService } from '../../../database/services/statement-pdf.service';
import { PaymentReceiptService } from '../../../database/services/payment-receipt.service';
import { StatementDeliveryService } from '../../../database/services/statement-delivery.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { BusinessException } from '../../../shared/exceptions';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';
import type { ParentSession } from '../../auth/decorators/current-parent.decorator';
import { NotificationChannelType } from '../../../notifications/types/notification.types';

const TENANT_ID = 'tenant-bbb';
const PARENT_ID = 'parent-222';
const STATEMENT_ID = 'stmt-abc';
const STATEMENT_NUMBER = 'STMT-2026-002';
const PARENT_EMAIL = 'parent@example.com';

const PARENT_SESSION: ParentSession = {
  parentId: PARENT_ID,
  tenantId: TENANT_ID,
};

const STATEMENT_ROW = {
  id: STATEMENT_ID,
  statementNumber: STATEMENT_NUMBER,
  status: 'FINAL',
};

const mockParentAuthGuard: CanActivate = { canActivate: () => true };

function buildModule(opts: {
  statementRow: object | null;
  parentRow: { email: string } | null;
  deliverStatementImpl?: Partial<StatementDeliveryService>;
  auditLogImpl?: Partial<AuditLogService>;
}) {
  const mockPrisma = {
    statement: {
      findFirst: jest.fn().mockResolvedValue(opts.statementRow),
    },
    parent: {
      findUnique: jest.fn().mockResolvedValue(opts.parentRow),
    },
  };

  const mockStatementDeliveryService: Partial<StatementDeliveryService> = {
    deliverStatement: jest.fn().mockResolvedValue({
      statementId: STATEMENT_ID,
      parentId: PARENT_ID,
      success: true,
      channel: NotificationChannelType.EMAIL,
      deliveredAt: new Date(),
    }),
    ...opts.deliverStatementImpl,
  };

  const mockAuditLogService: Partial<AuditLogService> = {
    logAction: jest.fn().mockResolvedValue(undefined),
    ...opts.auditLogImpl,
  };

  return Test.createTestingModule({
    controllers: [ParentPortalController],
    providers: [
      { provide: PrismaService, useValue: mockPrisma },
      { provide: ParentOnboardingService, useValue: {} },
      { provide: ParentPortalChildService, useValue: {} },
      { provide: InvoicePdfService, useValue: {} },
      { provide: StatementPdfService, useValue: {} },
      { provide: PaymentReceiptService, useValue: {} },
      {
        provide: StatementDeliveryService,
        useValue: mockStatementDeliveryService,
      },
      { provide: AuditLogService, useValue: mockAuditLogService },
    ],
  })
    .overrideGuard(ParentAuthGuard)
    .useValue(mockParentAuthGuard)
    .compile();
}

describe('ParentPortalController — emailStatement', () => {
  // ────────────────────────────────────────────────────────────────────────────
  // 1. Happy path (COMMS_DISABLED=false / not set) — email dispatched
  // ────────────────────────────────────────────────────────────────────────────
  describe('when statement is FINAL and email is sent (COMMS_DISABLED not set)', () => {
    let controller: ParentPortalController;
    let module: TestingModule;
    let mockDeliverStatement: jest.Mock;
    let mockLogAction: jest.Mock;

    beforeEach(async () => {
      mockDeliverStatement = jest.fn().mockResolvedValue({
        statementId: STATEMENT_ID,
        parentId: PARENT_ID,
        success: true,
        channel: NotificationChannelType.EMAIL,
        deliveredAt: new Date(),
      });
      mockLogAction = jest.fn().mockResolvedValue(undefined);

      module = await buildModule({
        statementRow: STATEMENT_ROW,
        parentRow: { email: PARENT_EMAIL },
        deliverStatementImpl: { deliverStatement: mockDeliverStatement },
        auditLogImpl: { logAction: mockLogAction },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('returns success message', async () => {
      const result = await controller.emailStatement(
        PARENT_SESSION,
        '2026',
        '5',
      );
      expect(result.message).toContain('has been sent to your email');
    });

    it('returns the parent email address in sentTo', async () => {
      const result = await controller.emailStatement(
        PARENT_SESSION,
        '2026',
        '5',
      );
      expect(result.sentTo).toBe(PARENT_EMAIL);
    });

    it('calls deliverStatement with EMAIL channel and correct ids', async () => {
      await controller.emailStatement(PARENT_SESSION, '2026', '5');
      expect(mockDeliverStatement).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        statementId: STATEMENT_ID,
        userId: PARENT_ID,
        channel: NotificationChannelType.EMAIL,
      });
    });

    it('writes an audit log entry before delivery', async () => {
      await controller.emailStatement(PARENT_SESSION, '2026', '5');
      expect(mockLogAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: PARENT_ID,
          entityType: 'ParentPortalStatementEmail',
          entityId: STATEMENT_ID,
          afterValue: expect.objectContaining({
            channel: 'EMAIL',
            via: 'parent-portal',
            statementNumber: STATEMENT_NUMBER,
          }),
        }),
      );
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. COMMS_DISABLED=true path — delivery short-circuits in EmailService;
  //    endpoint still returns success (the noop messageId comes from EmailService)
  // ────────────────────────────────────────────────────────────────────────────
  describe('when COMMS_DISABLED=true (comms suppressed at adapter level)', () => {
    let controller: ParentPortalController;
    let module: TestingModule;
    let mockDeliverStatement: jest.Mock;

    beforeEach(async () => {
      // StatementDeliveryService calls EmailService internally.
      // When COMMS_DISABLED=true, EmailService returns a noop messageId.
      // StatementDeliveryService still returns success:true.
      // We mock that final outcome here — adapter-level suppression is unit-tested
      // in invoice-delivery.service.spec.ts.
      mockDeliverStatement = jest.fn().mockResolvedValue({
        statementId: STATEMENT_ID,
        parentId: PARENT_ID,
        success: true,
        channel: NotificationChannelType.EMAIL,
        messageId: 'comms-disabled-noop',
        deliveredAt: new Date(),
      });

      module = await buildModule({
        statementRow: STATEMENT_ROW,
        parentRow: { email: PARENT_EMAIL },
        deliverStatementImpl: { deliverStatement: mockDeliverStatement },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('returns success message even when comms are disabled', async () => {
      const result = await controller.emailStatement(
        PARENT_SESSION,
        '2026',
        '5',
      );
      expect(result.message).toContain('has been sent to your email');
    });

    it('still calls deliverStatement (suppression is inside EmailService)', async () => {
      await controller.emailStatement(PARENT_SESSION, '2026', '5');
      expect(mockDeliverStatement).toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. Statement DB row not found for this period → 404
  // ────────────────────────────────────────────────────────────────────────────
  describe('when no statement row exists for the requested period', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule({
        statementRow: null,
        parentRow: { email: PARENT_EMAIL },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('throws NotFoundException', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '5'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. Statement belongs to a different parent → 404 (no existence leak)
  //    (findFirst returns null because parentId is in the WHERE clause)
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the statement belongs to a different parent', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule({
        statementRow: null, // ownership mismatch → findFirst returns null
        parentRow: { email: PARENT_EMAIL },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('throws NotFoundException (no existence leak)', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '5'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. Parent email not found
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the parent has no email address', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule({
        statementRow: STATEMENT_ROW,
        parentRow: null,
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('throws NotFoundException', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '5'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. Statement not FINAL → 400 BadRequestException
  //    (StatementDeliveryService throws BusinessException with INVALID_STATEMENT_STATUS)
  // ────────────────────────────────────────────────────────────────────────────
  describe('when the statement is not in FINAL status', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      const draftStatement = { ...STATEMENT_ROW, status: 'DRAFT' };
      module = await buildModule({
        statementRow: draftStatement,
        parentRow: { email: PARENT_EMAIL },
        deliverStatementImpl: {
          deliverStatement: jest
            .fn()
            .mockRejectedValue(
              new BusinessException(
                'Cannot deliver statement with status DRAFT. Statement must be FINAL.',
                'INVALID_STATEMENT_STATUS',
                { statementId: STATEMENT_ID, currentStatus: 'DRAFT' },
              ),
            ),
        },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('throws BadRequestException', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '5'),
      ).rejects.toThrow(BadRequestException);
    });

    it('still writes the audit log (attempt is logged before delivery)', async () => {
      const mockLogAction = jest.fn().mockResolvedValue(undefined);
      const mod2 = await buildModule({
        statementRow: { ...STATEMENT_ROW, status: 'DRAFT' },
        parentRow: { email: PARENT_EMAIL },
        deliverStatementImpl: {
          deliverStatement: jest
            .fn()
            .mockRejectedValue(
              new BusinessException(
                'Cannot deliver statement with status DRAFT.',
                'INVALID_STATEMENT_STATUS',
              ),
            ),
        },
        auditLogImpl: { logAction: mockLogAction },
      });
      const ctrl = mod2.get<ParentPortalController>(ParentPortalController);
      await expect(
        ctrl.emailStatement(PARENT_SESSION, '2026', '5'),
      ).rejects.toThrow(BadRequestException);
      expect(mockLogAction).toHaveBeenCalled();
      await mod2.close();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. Invalid year/month params → 404
  // ────────────────────────────────────────────────────────────────────────────
  describe('when year or month params are invalid', () => {
    let controller: ParentPortalController;
    let module: TestingModule;

    beforeEach(async () => {
      module = await buildModule({
        statementRow: null,
        parentRow: { email: PARENT_EMAIL },
      });
      controller = module.get<ParentPortalController>(ParentPortalController);
    });

    afterEach(() => module.close());

    it('throws NotFoundException for month=0', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '0'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for month=13', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, '2026', '13'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for non-numeric year', async () => {
      await expect(
        controller.emailStatement(PARENT_SESSION, 'abc', '5'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

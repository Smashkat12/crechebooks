/**
 * ParentAbsenceService — unit tests
 *
 * Coverage:
 *  1.  reportAbsence — happy path (future date, no existing report)
 *  2.  reportAbsence — rejects past date
 *  3.  reportAbsence — rejects today → past boundary (today accepted)
 *  4.  reportAbsence — rejects unknown/unowned child → ForbiddenException
 *  5.  reportAbsence — conflicts with existing active report → ConflictException
 *  6.  reportAbsence — replaces a cancelled report (hard-deletes cancelled, then creates)
 *  7.  listAbsences — happy path, defaults to today onwards
 *  8.  listAbsences — rejects unowned child → ForbiddenException
 *  9.  cancelAbsence — happy path (soft-deletes via cancelledAt)
 * 10.  cancelAbsence — rejects cancellation of already-cancelled report → BadRequestException
 * 11.  cancelAbsence — rejects cancellation of past-date report → BadRequestException
 * 12.  cancelAbsence — 404 for unknown report
 * 13.  getActiveReportsForDate — returns only non-cancelled rows
 * 14.  getActiveReportForChild — returns null when no active report
 * 15.  (admin override) reportAbsence audit log carries childId + date
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  ForbiddenException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ParentAbsenceService } from './parent-absence.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------
const TENANT = 'tenant-aaa';
const CHILD_ID = 'child-111';
const PARENT_ID = 'parent-111';
const REPORT_ID = 'report-001';

const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);
const TODAY_STR = TODAY.toISOString().slice(0, 10);

const TOMORROW = new Date(TODAY);
TOMORROW.setDate(TOMORROW.getDate() + 1);
const TOMORROW_STR = TOMORROW.toISOString().slice(0, 10);

const YESTERDAY = new Date(TODAY);
YESTERDAY.setDate(YESTERDAY.getDate() - 1);
const YESTERDAY_STR = YESTERDAY.toISOString().slice(0, 10);

function makeReport(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REPORT_ID,
    tenantId: TENANT,
    childId: CHILD_ID,
    parentId: PARENT_ID,
    date: new Date(`${TOMORROW_STR}T00:00:00.000Z`),
    reason: 'sick',
    reportedAt: new Date(),
    cancelledAt: null,
    cancelledByParentId: null,
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Prisma mock type
// ------------------------------------------------------------------
type PrismaMock = {
  parentAbsenceReport: {
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
  };
  child: {
    findFirst: jest.Mock;
  };
};

function makePrismaMock(): PrismaMock {
  return {
    parentAbsenceReport: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    child: {
      findFirst: jest.fn(),
    },
  };
}

function makeAuditMock() {
  return {
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
    logAction: jest.fn().mockResolvedValue(undefined),
  };
}

let prismaMock: PrismaMock;

// ------------------------------------------------------------------
// Suite
// ------------------------------------------------------------------
describe('ParentAbsenceService', () => {
  let service: ParentAbsenceService;
  let auditMock: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    prismaMock = makePrismaMock();
    auditMock = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParentAbsenceService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: AuditLogService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ParentAbsenceService>(ParentAbsenceService);
  });

  afterEach(() => jest.clearAllMocks());

  // ------------------------------------------------------------------
  // 1. reportAbsence — happy path
  // ------------------------------------------------------------------
  it('1. reportAbsence — creates report for a future date', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findUnique.mockResolvedValue(null);
    const created = makeReport();
    prismaMock.parentAbsenceReport.create.mockResolvedValue(created);

    const result = await service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
      date: TOMORROW_STR,
      reason: 'sick',
    });

    expect(result.id).toBe(REPORT_ID);
    expect(result.date).toBe(TOMORROW_STR);
    expect(result.reason).toBe('sick');
    expect(result.cancelledAt).toBeNull();
    expect(auditMock.logCreate).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 2. reportAbsence — rejects past date
  // ------------------------------------------------------------------
  it('2. reportAbsence — rejects past date', async () => {
    await expect(
      service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
        date: YESTERDAY_STR,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.child.findFirst).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 3. reportAbsence — today is accepted
  // ------------------------------------------------------------------
  it('3. reportAbsence — accepts today', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findUnique.mockResolvedValue(null);
    const created = makeReport({
      date: new Date(`${TODAY_STR}T00:00:00.000Z`),
    });
    prismaMock.parentAbsenceReport.create.mockResolvedValue(created);

    await expect(
      service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, { date: TODAY_STR }),
    ).resolves.toBeDefined();
  });

  // ------------------------------------------------------------------
  // 4. reportAbsence — rejects unowned child
  // ------------------------------------------------------------------
  it('4. reportAbsence — rejects unowned child → ForbiddenException', async () => {
    prismaMock.child.findFirst.mockResolvedValue(null);

    await expect(
      service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
        date: TOMORROW_STR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prismaMock.parentAbsenceReport.create).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 5. reportAbsence — conflicts with active report → ConflictException
  // ------------------------------------------------------------------
  it('5. reportAbsence — conflicts with active report → ConflictException', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findUnique.mockResolvedValue(
      makeReport(), // cancelledAt: null → active
    );

    await expect(
      service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
        date: TOMORROW_STR,
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prismaMock.parentAbsenceReport.create).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 6. reportAbsence — replaces a cancelled report
  // ------------------------------------------------------------------
  it('6. reportAbsence — replaces a cancelled report', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    // Existing row but cancelled
    prismaMock.parentAbsenceReport.findUnique.mockResolvedValue(
      makeReport({ cancelledAt: new Date() }),
    );
    prismaMock.parentAbsenceReport.delete.mockResolvedValue(undefined);
    const created = makeReport({ id: 'report-002' });
    prismaMock.parentAbsenceReport.create.mockResolvedValue(created);

    const result = await service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
      date: TOMORROW_STR,
    });

    expect(prismaMock.parentAbsenceReport.delete).toHaveBeenCalledTimes(1);
    expect(prismaMock.parentAbsenceReport.create).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('report-002');
  });

  // ------------------------------------------------------------------
  // 7. listAbsences — happy path
  // ------------------------------------------------------------------
  it('7. listAbsences — returns reports', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findMany.mockResolvedValue([
      makeReport(),
      makeReport({ id: 'report-002' }),
    ]);

    const result = await service.listAbsences(TENANT, PARENT_ID, CHILD_ID);

    expect(result.total).toBe(2);
    expect(result.reports).toHaveLength(2);
  });

  // ------------------------------------------------------------------
  // 8. listAbsences — rejects unowned child
  // ------------------------------------------------------------------
  it('8. listAbsences — rejects unowned child → ForbiddenException', async () => {
    prismaMock.child.findFirst.mockResolvedValue(null);

    await expect(
      service.listAbsences(TENANT, PARENT_ID, CHILD_ID),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // ------------------------------------------------------------------
  // 9. cancelAbsence — happy path
  // ------------------------------------------------------------------
  it('9. cancelAbsence — soft-deletes via cancelledAt', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findFirst.mockResolvedValue(
      makeReport(), // date = TOMORROW, cancelledAt = null
    );
    prismaMock.parentAbsenceReport.update.mockResolvedValue(undefined);

    await expect(
      service.cancelAbsence(TENANT, PARENT_ID, CHILD_ID, REPORT_ID),
    ).resolves.toBeUndefined();

    expect(prismaMock.parentAbsenceReport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REPORT_ID },
        data: expect.objectContaining({
          cancelledAt: expect.any(Date),
          cancelledByParentId: PARENT_ID,
        }),
      }),
    );
    expect(auditMock.logAction).toHaveBeenCalledTimes(1);
  });

  // ------------------------------------------------------------------
  // 10. cancelAbsence — already cancelled → BadRequestException
  // ------------------------------------------------------------------
  it('10. cancelAbsence — already cancelled → BadRequestException', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findFirst.mockResolvedValue(
      makeReport({ cancelledAt: new Date() }),
    );

    await expect(
      service.cancelAbsence(TENANT, PARENT_ID, CHILD_ID, REPORT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.parentAbsenceReport.update).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 11. cancelAbsence — past date → BadRequestException
  // ------------------------------------------------------------------
  it('11. cancelAbsence — past date report → BadRequestException', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findFirst.mockResolvedValue(
      makeReport({
        date: new Date(`${YESTERDAY_STR}T00:00:00.000Z`),
        cancelledAt: null,
      }),
    );

    await expect(
      service.cancelAbsence(TENANT, PARENT_ID, CHILD_ID, REPORT_ID),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prismaMock.parentAbsenceReport.update).not.toHaveBeenCalled();
  });

  // ------------------------------------------------------------------
  // 12. cancelAbsence — 404 for unknown report
  // ------------------------------------------------------------------
  it('12. cancelAbsence — unknown report → NotFoundException', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findFirst.mockResolvedValue(null);

    await expect(
      service.cancelAbsence(TENANT, PARENT_ID, CHILD_ID, REPORT_ID),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  // ------------------------------------------------------------------
  // 13. getActiveReportsForDate — excludes cancelled
  // ------------------------------------------------------------------
  it('13. getActiveReportsForDate — returns only non-cancelled rows', async () => {
    const rows = [
      {
        id: 'r1',
        childId: CHILD_ID,
        parentId: PARENT_ID,
        reason: 'sick',
        reportedAt: new Date(),
      },
    ];
    prismaMock.parentAbsenceReport.findMany.mockResolvedValue(rows);

    const result = await service.getActiveReportsForDate(TENANT, TODAY_STR);

    expect(prismaMock.parentAbsenceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cancelledAt: null }),
      }),
    );
    expect(result).toHaveLength(1);
  });

  // ------------------------------------------------------------------
  // 14. getActiveReportForChild — returns null when no active report
  // ------------------------------------------------------------------
  it('14. getActiveReportForChild — returns null when no active report', async () => {
    prismaMock.parentAbsenceReport.findFirst.mockResolvedValue(null);

    const result = await service.getActiveReportForChild(
      TENANT,
      CHILD_ID,
      TOMORROW_STR,
    );

    expect(result).toBeNull();
  });

  // ------------------------------------------------------------------
  // 15. audit log: reportAbsence passes childId + date to logCreate
  // ------------------------------------------------------------------
  it('15. audit log carries childId and date on create', async () => {
    prismaMock.child.findFirst.mockResolvedValue({ id: CHILD_ID });
    prismaMock.parentAbsenceReport.findUnique.mockResolvedValue(null);
    prismaMock.parentAbsenceReport.create.mockResolvedValue(makeReport());

    await service.reportAbsence(TENANT, PARENT_ID, CHILD_ID, {
      date: TOMORROW_STR,
      reason: 'fever',
    });

    expect(auditMock.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT,
        entityType: 'ParentAbsenceReport',
        afterValue: expect.objectContaining({
          childId: CHILD_ID,
          date: TOMORROW_STR,
          via: 'parent-portal',
        }),
      }),
    );
  });
});

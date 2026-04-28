/**
 * AttendanceService — unit tests
 *
 * Coverage:
 *  1.  markAttendance — creates new record and writes audit logCreate
 *  2.  markAttendance — upserts existing record and writes audit logUpdate
 *  3.  markAttendance — rejects future date
 *  4.  markAttendance — rejects unknown child (tenant isolation: tenant B cannot mark tenant A child)
 *  5.  markAttendance — rejects invalid departureAt < arrivalAt
 *  6.  bulkMarkAttendance — happy path, returns { marked: N }
 *  7.  bulkMarkAttendance — rejects cross-tenant childId → 400 listing offending IDs
 *  8.  list — filters by date and returns total + records
 *  9.  findByDate — returns records with child join
 * 10.  findByChild — defaults last 90 days
 * 11.  findByChild — tenant B cannot read tenant A child → NotFoundException
 * 12.  classGroupDailyReport — returns status counts and empty parentPreReports when all children marked
 * 13.  classGroupDailyReport — unknown classGroup → NotFoundException
 * 23.  classGroupDailyReport — surfaces pre-reports for unmarked children in the group
 * 24.  classGroupDailyReport — does NOT surface pre-reports for children in OTHER groups
 * 14.  updateAttendance — patches status and writes audit logUpdate
 * 15.  updateAttendance — rejects departureAt < arrivalAt
 * 16.  updateAttendance — unknown record → NotFoundException
 * 17.  deleteAttendance — hard-deletes and writes logAction(DELETE)
 * 18.  deleteAttendance — unknown record → NotFoundException
 * 19.  todaySummary — counts statuses and computes unmarkedCount
 * 20.  parentChildAttendance — happy path
 * 21.  parentChildAttendance — parent attempts another parent's child → ForbiddenException
 * 22.  parentChildSummary — returns monthly counts
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { AttendanceStatus, Prisma } from '@prisma/client';
import { AttendanceService } from './attendance.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------
const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const CHILD_A = 'child-a1';
const CHILD_B = 'child-b1'; // belongs to TENANT_B
const PARENT_A = 'parent-a1';
const PARENT_B = 'parent-b1';
const USER_ID = 'user-001';
const GROUP_ID = 'group-001';
const RECORD_ID = 'record-001';

const TODAY = new Date();
TODAY.setUTCHours(0, 0, 0, 0);
const TODAY_STR = TODAY.toISOString().slice(0, 10);

const YESTERDAY = new Date(TODAY);
YESTERDAY.setDate(YESTERDAY.getDate() - 1);
const YESTERDAY_STR = YESTERDAY.toISOString().slice(0, 10);

const FUTURE = new Date(TODAY);
FUTURE.setDate(FUTURE.getDate() + 1);
const FUTURE_STR = FUTURE.toISOString().slice(0, 10);

function makeRecord(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: RECORD_ID,
    tenantId: TENANT_A,
    childId: CHILD_A,
    classGroupId: GROUP_ID,
    date: new Date(`${TODAY_STR}T00:00:00.000Z`),
    status: AttendanceStatus.PRESENT,
    arrivalAt: null,
    departureAt: null,
    note: null,
    markedById: USER_ID,
    markedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ------------------------------------------------------------------
// Prisma mock
// ------------------------------------------------------------------
type PrismaMock = {
  attendanceRecord: {
    create: jest.Mock;
    update: jest.Mock;
    upsert: jest.Mock;
    delete: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    findUnique: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
  };
  child: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
  };
  classGroup: {
    findFirst: jest.Mock;
  };
  // Parent absence pre-reports — added for backlog #9 integration
  parentAbsenceReport: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function makePrismaMock(): PrismaMock {
  const m: PrismaMock = {
    attendanceRecord: {
      create: jest.fn(),
      update: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
    child: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    classGroup: {
      findFirst: jest.fn(),
    },
    parentAbsenceReport: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: PrismaMock) => Promise<unknown>) => fn(m)),
  };
  return m;
}

function makeAuditMock() {
  return {
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
    logDelete: jest.fn().mockResolvedValue(undefined),
    logAction: jest.fn().mockResolvedValue(undefined),
  };
}

let mock: PrismaMock;

// ------------------------------------------------------------------
// Suite
// ------------------------------------------------------------------
describe('AttendanceService', () => {
  let service: AttendanceService;
  let auditMock: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    mock = makePrismaMock();
    auditMock = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceService,
        { provide: PrismaService, useValue: mock },
        { provide: AuditLogService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<AttendanceService>(AttendanceService);
  });

  afterEach(() => jest.clearAllMocks());

  // ----------------------------------------------------------------
  // 1. markAttendance — create new record
  // ----------------------------------------------------------------
  it('markAttendance creates new record and calls auditLog.logCreate', async () => {
    mock.child.findFirst.mockResolvedValue({
      id: CHILD_A,
      classGroupId: GROUP_ID,
    });
    mock.attendanceRecord.findUnique.mockResolvedValue(null);
    const record = makeRecord();
    mock.attendanceRecord.create.mockResolvedValue(record);

    const result = await service.markAttendance(TENANT_A, USER_ID, {
      childId: CHILD_A,
      date: TODAY_STR,
      status: AttendanceStatus.PRESENT,
    });

    expect(result.id).toBe(RECORD_ID);
    expect(mock.attendanceRecord.create).toHaveBeenCalledTimes(1);
    expect(auditMock.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        entityType: 'AttendanceRecord',
        entityId: RECORD_ID,
      }),
    );
  });

  // ----------------------------------------------------------------
  // 2. markAttendance — upsert existing
  // ----------------------------------------------------------------
  it('markAttendance updates existing record and calls auditLog.logUpdate', async () => {
    const existing = makeRecord({ status: AttendanceStatus.ABSENT });
    mock.child.findFirst.mockResolvedValue({
      id: CHILD_A,
      classGroupId: GROUP_ID,
    });
    mock.attendanceRecord.findUnique.mockResolvedValue(existing);
    const updated = makeRecord({ status: AttendanceStatus.PRESENT });
    mock.attendanceRecord.update.mockResolvedValue(updated);

    const result = await service.markAttendance(TENANT_A, USER_ID, {
      childId: CHILD_A,
      date: TODAY_STR,
      status: AttendanceStatus.PRESENT,
    });

    expect(result.status).toBe(AttendanceStatus.PRESENT);
    expect(mock.attendanceRecord.update).toHaveBeenCalledTimes(1);
    expect(auditMock.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'AttendanceRecord',
        beforeValue: expect.objectContaining({
          status: AttendanceStatus.ABSENT,
        }),
        afterValue: expect.objectContaining({
          status: AttendanceStatus.PRESENT,
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 3. markAttendance — future date rejected
  // ----------------------------------------------------------------
  it('markAttendance rejects future date', async () => {
    await expect(
      service.markAttendance(TENANT_A, USER_ID, {
        childId: CHILD_A,
        date: FUTURE_STR,
        status: AttendanceStatus.PRESENT,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // 4. markAttendance — tenant isolation: tenant B child → 404
  // ----------------------------------------------------------------
  it('markAttendance throws NotFoundException for child not in tenant', async () => {
    mock.child.findFirst.mockResolvedValue(null); // tenant B child not found in tenant A

    await expect(
      service.markAttendance(TENANT_A, USER_ID, {
        childId: CHILD_B,
        date: TODAY_STR,
        status: AttendanceStatus.PRESENT,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // 5. markAttendance — departureAt < arrivalAt rejected
  // ----------------------------------------------------------------
  it('markAttendance rejects departureAt before arrivalAt', async () => {
    mock.child.findFirst.mockResolvedValue({
      id: CHILD_A,
      classGroupId: null,
    });
    mock.attendanceRecord.findUnique.mockResolvedValue(null);

    await expect(
      service.markAttendance(TENANT_A, USER_ID, {
        childId: CHILD_A,
        date: TODAY_STR,
        status: AttendanceStatus.PRESENT,
        arrivalAt: `${TODAY_STR}T09:00:00.000Z`,
        departureAt: `${TODAY_STR}T07:00:00.000Z`,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // 6. bulkMarkAttendance — happy path
  // ----------------------------------------------------------------
  it('bulkMarkAttendance marks all records and returns { marked, date }', async () => {
    mock.child.findMany.mockResolvedValue([
      { id: CHILD_A, classGroupId: GROUP_ID },
    ]);
    mock.attendanceRecord.upsert.mockResolvedValue(makeRecord());
    mock.auditLog.create.mockResolvedValue({});

    const result = await service.bulkMarkAttendance(TENANT_A, USER_ID, {
      date: TODAY_STR,
      records: [{ childId: CHILD_A, status: AttendanceStatus.PRESENT }],
    });

    expect(result.marked).toBe(1);
    expect(result.date).toBe(TODAY_STR);
    expect(mock.attendanceRecord.upsert).toHaveBeenCalledTimes(1);
  });

  // ----------------------------------------------------------------
  // 7. bulkMarkAttendance — cross-tenant child → 400
  // ----------------------------------------------------------------
  it('bulkMarkAttendance rejects cross-tenant childId', async () => {
    mock.child.findMany.mockResolvedValue([]); // CHILD_B not owned by TENANT_A

    await expect(
      service.bulkMarkAttendance(TENANT_A, USER_ID, {
        date: TODAY_STR,
        records: [{ childId: CHILD_B, status: AttendanceStatus.PRESENT }],
      }),
    ).rejects.toThrow(BadRequestException);

    const err = await service
      .bulkMarkAttendance(TENANT_A, USER_ID, {
        date: TODAY_STR,
        records: [{ childId: CHILD_B, status: AttendanceStatus.PRESENT }],
      })
      .catch((e: BadRequestException) => e);
    expect((err as BadRequestException).message).toContain(CHILD_B);
  });

  // ----------------------------------------------------------------
  // 8. list — filters by date
  // ----------------------------------------------------------------
  it('list returns total and records filtered by date', async () => {
    const record = makeRecord();
    mock.attendanceRecord.findMany.mockResolvedValue([
      {
        ...record,
        child: { firstName: 'Alice', lastName: 'Smith' },
        classGroup: { name: 'Butterflies' },
      },
    ]);
    mock.attendanceRecord.count.mockResolvedValue(1);

    const result = await service.list(TENANT_A, { date: TODAY_STR });

    expect(result.total).toBe(1);
    expect(result.records).toHaveLength(1);
    expect(mock.attendanceRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          date: new Date(`${TODAY_STR}T00:00:00.000Z`),
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 9. findByDate — returns records with child join
  // ----------------------------------------------------------------
  it('findByDate returns records for the given date', async () => {
    mock.attendanceRecord.findMany.mockResolvedValue([
      {
        ...makeRecord(),
        child: { firstName: 'Bob', lastName: 'Jones' },
        classGroup: null,
      },
    ]);
    // parentAbsenceReport.findMany returns [] by default (via makePrismaMock)

    const result = await service.findByDate(TENANT_A, TODAY_STR);
    // findByDate now returns AdminDayViewDto: { date, records[], parentPreReports[] }
    expect(result.records).toHaveLength(1);
    expect(result.records[0].child?.firstName).toBe('Bob');
    expect(result.parentPreReports).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 10. findByChild — defaults last 90 days
  // ----------------------------------------------------------------
  it('findByChild calls findMany with gte date 90 days ago when no from/to given', async () => {
    mock.child.findFirst.mockResolvedValue({ id: CHILD_A });
    mock.attendanceRecord.findMany.mockResolvedValue([]);

    await service.findByChild(TENANT_A, CHILD_A);

    const callArg = mock.attendanceRecord.findMany.mock.calls[0][0] as {
      where: { date: { gte: Date } };
    };
    const gteDate = callArg.where.date.gte;
    const daysAgo = Math.round(
      (Date.now() - gteDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    expect(daysAgo).toBeGreaterThanOrEqual(89);
    expect(daysAgo).toBeLessThanOrEqual(91);
  });

  // ----------------------------------------------------------------
  // 11. findByChild — tenant isolation: tenant B child → NotFoundException
  // ----------------------------------------------------------------
  it('findByChild throws NotFoundException for child not in tenant', async () => {
    mock.child.findFirst.mockResolvedValue(null);

    await expect(service.findByChild(TENANT_B, CHILD_A)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ----------------------------------------------------------------
  // 12. classGroupDailyReport — returns status counts and empty parentPreReports when all children marked
  // ----------------------------------------------------------------
  it('classGroupDailyReport returns summary with counts and empty parentPreReports when all marked', async () => {
    mock.classGroup.findFirst.mockResolvedValue({
      id: GROUP_ID,
      name: 'Butterflies',
    });
    // Two children in the group; both are marked — no pre-reports expected
    mock.attendanceRecord.findMany.mockResolvedValue([
      {
        ...makeRecord({ childId: CHILD_A, status: AttendanceStatus.PRESENT }),
        child: { firstName: 'A', lastName: 'B' },
        classGroup: { name: 'Butterflies' },
      },
      {
        ...makeRecord({
          id: 'record-002',
          childId: 'child-a2',
          status: AttendanceStatus.ABSENT,
        }),
        child: { firstName: 'C', lastName: 'D' },
        classGroup: { name: 'Butterflies' },
      },
    ]);
    // child.findMany returns the group's children (both already marked)
    mock.child.findMany.mockResolvedValue([
      { id: CHILD_A },
      { id: 'child-a2' },
    ]);
    // parentAbsenceReport.findMany defaults to [] (no pre-reports)

    const result = await service.classGroupDailyReport(
      TENANT_A,
      GROUP_ID,
      TODAY_STR,
    );

    expect(result.presentCount).toBe(1);
    expect(result.absentCount).toBe(1);
    expect(result.records).toHaveLength(2);
    expect(result.parentPreReports).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // 13. classGroupDailyReport — unknown group → NotFoundException
  // ----------------------------------------------------------------
  it('classGroupDailyReport throws NotFoundException for unknown group', async () => {
    mock.classGroup.findFirst.mockResolvedValue(null);

    await expect(
      service.classGroupDailyReport(TENANT_A, 'no-such-group', TODAY_STR),
    ).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // 23. classGroupDailyReport — surfaces pre-reports for unmarked children
  // ----------------------------------------------------------------
  it('classGroupDailyReport surfaces parentPreReports for unmarked group children', async () => {
    const CHILD_UNMARKED = 'child-unmarked-1';
    const PARENT_ID = 'parent-001';
    const REPORT_ID = 'report-001';
    const REPORTED_AT = new Date();

    mock.classGroup.findFirst.mockResolvedValue({
      id: GROUP_ID,
      name: 'Butterflies',
    });
    // Only CHILD_A has an attendance record; CHILD_UNMARKED does not
    mock.attendanceRecord.findMany.mockResolvedValue([
      {
        ...makeRecord({ childId: CHILD_A, status: AttendanceStatus.PRESENT }),
        child: { firstName: 'A', lastName: 'B' },
        classGroup: { name: 'Butterflies' },
      },
    ]);
    // group has two children
    mock.child.findMany.mockResolvedValue([
      { id: CHILD_A },
      { id: CHILD_UNMARKED },
    ]);
    // CHILD_UNMARKED has an active pre-report
    mock.parentAbsenceReport.findMany.mockResolvedValue([
      {
        id: REPORT_ID,
        childId: CHILD_UNMARKED,
        parentId: PARENT_ID,
        reason: 'Sick with fever',
        reportedAt: REPORTED_AT,
      },
    ]);

    const result = await service.classGroupDailyReport(
      TENANT_A,
      GROUP_ID,
      TODAY_STR,
    );

    expect(result.parentPreReports).toHaveLength(1);
    expect(result.parentPreReports[0].reportId).toBe(REPORT_ID);
    expect(result.parentPreReports[0].childId).toBe(CHILD_UNMARKED);
    expect(result.parentPreReports[0].reason).toBe('Sick with fever');
    expect(result.parentPreReports[0].reportedAt).toBe(
      REPORTED_AT.toISOString(),
    );
    // Verify the query was scoped to ONLY the unmarked child from this group
    expect(mock.parentAbsenceReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          childId: { in: [CHILD_UNMARKED] },
          cancelledAt: null,
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 24. classGroupDailyReport — pre-reports for OTHER group children excluded
  // ----------------------------------------------------------------
  it('classGroupDailyReport does NOT query pre-reports for children in other groups', async () => {
    // Group contains only CHILD_A; CHILD_B is in a different group.
    // Even if CHILD_B has an active pre-report, it must never appear here.
    mock.classGroup.findFirst.mockResolvedValue({
      id: GROUP_ID,
      name: 'Butterflies',
    });
    // CHILD_A is marked
    mock.attendanceRecord.findMany.mockResolvedValue([
      {
        ...makeRecord({ childId: CHILD_A, status: AttendanceStatus.PRESENT }),
        child: { firstName: 'A', lastName: 'B' },
        classGroup: { name: 'Butterflies' },
      },
    ]);
    // Group only has CHILD_A (CHILD_B belongs to another group)
    mock.child.findMany.mockResolvedValue([{ id: CHILD_A }]);
    // parentAbsenceReport.findMany should NOT be called (no unmarked children in group)

    const result = await service.classGroupDailyReport(
      TENANT_A,
      GROUP_ID,
      TODAY_STR,
    );

    expect(result.parentPreReports).toHaveLength(0);
    // parentAbsenceReport.findMany should never be called when unmarkedGroupChildIds is empty
    expect(mock.parentAbsenceReport.findMany).not.toHaveBeenCalled();
  });

  // ----------------------------------------------------------------
  // 14. updateAttendance — patches status, writes logUpdate
  // ----------------------------------------------------------------
  it('updateAttendance patches status and writes audit logUpdate', async () => {
    const existing = makeRecord({ status: AttendanceStatus.ABSENT });
    mock.attendanceRecord.findFirst.mockResolvedValue(existing);
    const updated = makeRecord({ status: AttendanceStatus.EXCUSED });
    mock.attendanceRecord.update.mockResolvedValue(updated);

    const result = await service.updateAttendance(
      TENANT_A,
      RECORD_ID,
      USER_ID,
      {
        status: AttendanceStatus.EXCUSED,
      },
    );

    expect(result.status).toBe(AttendanceStatus.EXCUSED);
    expect(auditMock.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'AttendanceRecord',
        entityId: RECORD_ID,
        beforeValue: expect.objectContaining({
          status: AttendanceStatus.ABSENT,
        }),
        afterValue: expect.objectContaining({
          status: AttendanceStatus.EXCUSED,
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 15. updateAttendance — departureAt < arrivalAt rejected
  // ----------------------------------------------------------------
  it('updateAttendance rejects departureAt before arrivalAt', async () => {
    const existing = makeRecord({
      arrivalAt: null,
      departureAt: null,
    });
    mock.attendanceRecord.findFirst.mockResolvedValue(existing);

    await expect(
      service.updateAttendance(TENANT_A, RECORD_ID, USER_ID, {
        arrivalAt: `${TODAY_STR}T10:00:00.000Z`,
        departureAt: `${TODAY_STR}T08:00:00.000Z`,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // 16. updateAttendance — unknown record → NotFoundException
  // ----------------------------------------------------------------
  it('updateAttendance throws NotFoundException when record not found', async () => {
    mock.attendanceRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.updateAttendance(TENANT_A, 'no-such', USER_ID, {
        status: AttendanceStatus.LATE,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // 17. deleteAttendance — hard-deletes and writes logAction(DELETE)
  // ----------------------------------------------------------------
  it('deleteAttendance hard-deletes record and writes audit DELETE', async () => {
    mock.attendanceRecord.findFirst.mockResolvedValue(makeRecord());
    mock.attendanceRecord.delete.mockResolvedValue({});

    await service.deleteAttendance(TENANT_A, RECORD_ID, USER_ID);

    expect(mock.attendanceRecord.delete).toHaveBeenCalledWith({
      where: { id: RECORD_ID },
    });
    expect(auditMock.logAction).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'AttendanceRecord',
        entityId: RECORD_ID,
        action: 'DELETE',
      }),
    );
  });

  // ----------------------------------------------------------------
  // 18. deleteAttendance — unknown record → NotFoundException
  // ----------------------------------------------------------------
  it('deleteAttendance throws NotFoundException when record not found', async () => {
    mock.attendanceRecord.findFirst.mockResolvedValue(null);

    await expect(
      service.deleteAttendance(TENANT_A, 'no-such', USER_ID),
    ).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // 19. todaySummary — counts statuses and computes unmarkedCount
  // ----------------------------------------------------------------
  it('todaySummary returns correct counts and unmarkedCount', async () => {
    mock.attendanceRecord.groupBy.mockResolvedValue([
      { status: AttendanceStatus.PRESENT, _count: { _all: 5 } },
      { status: AttendanceStatus.ABSENT, _count: { _all: 2 } },
    ]);
    mock.child.count.mockResolvedValue(10); // 10 active children
    // attendanceRecord.findMany is used to build the markedChildIds set
    mock.attendanceRecord.findMany.mockResolvedValue([
      { childId: 'c1' },
      { childId: 'c2' },
      { childId: 'c3' },
      { childId: 'c4' },
      { childId: 'c5' },
      { childId: 'c6' },
      { childId: 'c7' },
    ]);
    // parentAbsenceReport.findMany returns [] by default (via makePrismaMock)

    const result = await service.todaySummary(TENANT_A);

    expect(result.presentCount).toBe(5);
    expect(result.absentCount).toBe(2);
    expect(result.lateCount).toBe(0);
    expect(result.excusedCount).toBe(0);
    expect(result.earlyPickupCount).toBe(0);
    expect(result.unmarkedCount).toBe(3); // 10 active - 7 marked
    expect(result.reportedAbsentCount).toBe(0); // no pre-reports
  });

  // ----------------------------------------------------------------
  // 20. parentChildAttendance — happy path
  // ----------------------------------------------------------------
  it('parentChildAttendance returns records for parent-owned child', async () => {
    mock.child.findFirst.mockResolvedValue({ id: CHILD_A });
    mock.attendanceRecord.findMany.mockResolvedValue([
      { ...makeRecord(), classGroup: null },
    ]);

    const result = await service.parentChildAttendance(
      TENANT_A,
      PARENT_A,
      CHILD_A,
    );

    expect(result).toHaveLength(1);
    expect(mock.child.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ parentId: PARENT_A, id: CHILD_A }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 21. parentChildAttendance — wrong parent → ForbiddenException
  // ----------------------------------------------------------------
  it('parentChildAttendance throws ForbiddenException for wrong parent', async () => {
    mock.child.findFirst.mockResolvedValue(null); // PARENT_B does not own CHILD_A

    await expect(
      service.parentChildAttendance(TENANT_A, PARENT_B, CHILD_A),
    ).rejects.toThrow(ForbiddenException);
  });

  // ----------------------------------------------------------------
  // 22. parentChildSummary — returns monthly counts
  // ----------------------------------------------------------------
  it('parentChildSummary returns monthly attendance counts', async () => {
    mock.child.findFirst.mockResolvedValue({ id: CHILD_A });
    mock.attendanceRecord.groupBy.mockResolvedValue([
      { status: AttendanceStatus.PRESENT, _count: { _all: 18 } },
      { status: AttendanceStatus.ABSENT, _count: { _all: 2 } },
    ]);

    const result = await service.parentChildSummary(
      TENANT_A,
      PARENT_A,
      CHILD_A,
    );

    expect(result.presentDays).toBe(18);
    expect(result.absentDays).toBe(2);
    expect(result.lateDays).toBe(0);
    expect(result.totalSchoolDays).toBe(20);
  });
});

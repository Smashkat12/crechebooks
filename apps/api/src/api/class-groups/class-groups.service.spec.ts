/**
 * ClassGroupsService — unit tests
 *
 * Coverage:
 *  1. findAll — returns active groups with child counts
 *  2. findAll ?includeInactive — passes isActive filter correctly
 *  3. findOne — happy path returns group + childCount
 *  4. findOne — tenant-B cannot read tenant-A record → NotFoundException
 *  5. create — creates group and writes audit log
 *  6. create — P2002 unique constraint → ConflictException
 *  7. create — ageMin > ageMax → BadRequestException
 *  8. update — patches mutable fields, writes audit log with before/after
 *  9. update — name conflict on update → ConflictException
 * 10. remove — soft-deletes and writes audit log
 * 11. remove — group not found in tenant → NotFoundException
 * 12. assignChildren — happy path
 * 13. assignChildren — cross-tenant childId filtered → BadRequestException
 * 14. unassignChild — sets classGroupId = null, writes audit log
 * 15. findChildren — returns only children in this tenant/group
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ClassGroupsService } from './class-groups.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';

// ------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------
const TENANT_A = 'tenant-aaa';
const TENANT_B = 'tenant-bbb';
const GROUP_ID = 'group-001';
const CHILD_ID_A = 'child-a1';
const CHILD_ID_B = 'child-b1'; // belongs to TENANT_B
const USER_ID = 'user-001';

const makeGroup = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: GROUP_ID,
  tenantId: TENANT_A,
  name: 'Butterflies',
  code: 'BF',
  description: null,
  ageMinMonths: 12,
  ageMaxMonths: 24,
  capacity: 15,
  displayOrder: 0,
  isActive: true,
  deletedAt: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ...overrides,
});

// ------------------------------------------------------------------
// Mock factories
// ------------------------------------------------------------------
type PrismaMock = {
  classGroup: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  child: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    count: jest.Mock;
    groupBy: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  auditLog: {
    create: jest.Mock;
  };
  $transaction: jest.Mock;
};

function makePrismaMock(): PrismaMock {
  const m: PrismaMock = {
    classGroup: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    child: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    $transaction: jest.fn((fn: (tx: PrismaMock) => Promise<unknown>) => fn(m)),
  };
  return m;
}

let mock: PrismaMock;

function makeAuditMock() {
  return {
    logCreate: jest.fn().mockResolvedValue(undefined),
    logUpdate: jest.fn().mockResolvedValue(undefined),
    logDelete: jest.fn().mockResolvedValue(undefined),
    logAction: jest.fn().mockResolvedValue(undefined),
  };
}

// ------------------------------------------------------------------
// Test suite
// ------------------------------------------------------------------
describe('ClassGroupsService', () => {
  let service: ClassGroupsService;
  let auditMock: ReturnType<typeof makeAuditMock>;

  beforeEach(async () => {
    mock = makePrismaMock();
    auditMock = makeAuditMock();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassGroupsService,
        { provide: PrismaService, useValue: mock },
        { provide: AuditLogService, useValue: auditMock },
      ],
    }).compile();

    service = module.get<ClassGroupsService>(ClassGroupsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ----------------------------------------------------------------
  // 1. findAll — active groups + child counts
  // ----------------------------------------------------------------
  it('findAll returns active groups with child counts', async () => {
    const group = makeGroup();
    mock.classGroup.findMany.mockResolvedValue([group]);
    mock.classGroup.count.mockResolvedValue(1);
    mock.child.groupBy.mockResolvedValue([
      { classGroupId: GROUP_ID, _count: { _all: 3 } },
    ]);

    const result = await service.findAll(TENANT_A, false);

    expect(result).toHaveLength(1);
    expect(result[0].childCount).toBe(3);
    expect(mock.classGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          deletedAt: null,
          isActive: true,
        }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 2. findAll includeInactive — no isActive filter
  // ----------------------------------------------------------------
  it('findAll includeInactive omits isActive from where', async () => {
    mock.classGroup.findMany.mockResolvedValue([]);
    mock.classGroup.count.mockResolvedValue(0);
    mock.child.groupBy.mockResolvedValue([]);

    await service.findAll(TENANT_A, true);

    const callArg = mock.classGroup.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(callArg.where).not.toHaveProperty('isActive');
  });

  // ----------------------------------------------------------------
  // 3. findOne — happy path
  // ----------------------------------------------------------------
  it('findOne returns group with childCount', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    mock.child.count.mockResolvedValue(5);

    const result = await service.findOne(TENANT_A, GROUP_ID);
    expect(result.id).toBe(GROUP_ID);
    expect(result.childCount).toBe(5);
  });

  // ----------------------------------------------------------------
  // 4. findOne — tenant isolation: tenant B sees nothing
  // ----------------------------------------------------------------
  it('findOne throws NotFoundException when tenant does not own group', async () => {
    // tenant B queries: classGroup.findFirst returns null (wrong tenantId)
    mock.classGroup.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_B, GROUP_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ----------------------------------------------------------------
  // 5. create — happy path
  // ----------------------------------------------------------------
  it('create writes group and calls auditLog.logCreate', async () => {
    const created = makeGroup();
    mock.classGroup.create.mockResolvedValue(created);

    const result = await service.create(TENANT_A, USER_ID, {
      name: 'Butterflies',
      ageMinMonths: 12,
      ageMaxMonths: 24,
    });

    expect(result.id).toBe(GROUP_ID);
    expect(result.childCount).toBe(0);
    expect(auditMock.logCreate).toHaveBeenCalledTimes(1);
    expect(auditMock.logCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        userId: USER_ID,
        entityType: 'ClassGroup',
        entityId: GROUP_ID,
      }),
    );
  });

  // ----------------------------------------------------------------
  // 6. create — P2002 unique → ConflictException
  // ----------------------------------------------------------------
  it('create throws ConflictException on P2002 (duplicate name)', async () => {
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '7.0.0',
    });
    mock.classGroup.create.mockRejectedValue(err);

    await expect(
      service.create(TENANT_A, USER_ID, { name: 'Butterflies' }),
    ).rejects.toThrow(ConflictException);
  });

  // ----------------------------------------------------------------
  // 7. create — ageMin > ageMax → BadRequestException
  // ----------------------------------------------------------------
  it('create throws BadRequestException when ageMinMonths > ageMaxMonths', async () => {
    await expect(
      service.create(TENANT_A, USER_ID, {
        name: 'Test',
        ageMinMonths: 24,
        ageMaxMonths: 12,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // 8. update — patches fields and writes audit log
  // ----------------------------------------------------------------
  it('update patches name and writes audit log with before/after', async () => {
    const before = makeGroup();
    const after = makeGroup({ name: 'Updated Name' });
    mock.classGroup.findFirst.mockResolvedValue(before);
    mock.classGroup.update.mockResolvedValue(after);
    mock.child.count.mockResolvedValue(2);

    const result = await service.update(TENANT_A, GROUP_ID, USER_ID, {
      name: 'Updated Name',
    });

    expect(result.name).toBe('Updated Name');
    expect(result.childCount).toBe(2);
    expect(auditMock.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_A,
        entityType: 'ClassGroup',
        entityId: GROUP_ID,
        beforeValue: expect.objectContaining({ name: 'Butterflies' }),
        afterValue: expect.objectContaining({ name: 'Updated Name' }),
      }),
    );
  });

  // ----------------------------------------------------------------
  // 9. update — name conflict → ConflictException
  // ----------------------------------------------------------------
  it('update throws ConflictException on P2002', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    const err = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '7.0.0',
    });
    mock.classGroup.update.mockRejectedValue(err);

    await expect(
      service.update(TENANT_A, GROUP_ID, USER_ID, { name: 'Conflict' }),
    ).rejects.toThrow(ConflictException);
  });

  // ----------------------------------------------------------------
  // 10. remove — soft-delete
  // ----------------------------------------------------------------
  it('remove sets deletedAt and writes audit log', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    mock.classGroup.update.mockResolvedValue({});

    await service.remove(TENANT_A, GROUP_ID, USER_ID);

    expect(mock.classGroup.update).toHaveBeenCalledWith({
      where: { id: GROUP_ID },
      data: expect.objectContaining({ deletedAt: expect.any(Date) }),
    });
    expect(auditMock.logAction).toHaveBeenCalledTimes(1);
    // Confirm the historical-link decision is captured in the changeSummary
    const call = auditMock.logAction.mock.calls[0][0] as {
      changeSummary: string;
    };
    expect(call.changeSummary).toMatch(/historical link preserved/);
  });

  // ----------------------------------------------------------------
  // 11. remove — group not in tenant → NotFoundException
  // ----------------------------------------------------------------
  it('remove throws NotFoundException when group not found in tenant', async () => {
    mock.classGroup.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_A, 'no-such', USER_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ----------------------------------------------------------------
  // 12. assignChildren — happy path
  // ----------------------------------------------------------------
  it('assignChildren updates children and writes audit log', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    mock.child.findMany.mockResolvedValue([{ id: CHILD_ID_A }]);
    mock.child.updateMany.mockResolvedValue({ count: 1 });
    mock.auditLog.create.mockResolvedValue({});

    const result = await service.assignChildren(
      TENANT_A,
      GROUP_ID,
      [CHILD_ID_A],
      USER_ID,
    );

    expect(result.assigned).toBe(1);
    expect(mock.child.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: [CHILD_ID_A] },
          tenantId: TENANT_A,
        }),
        data: { classGroupId: GROUP_ID },
      }),
    );
  });

  // ----------------------------------------------------------------
  // 13. assignChildren — cross-tenant child → BadRequestException
  // ----------------------------------------------------------------
  it('assignChildren rejects cross-tenant childIds', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    // TENANT_B's child is not returned by the tenant-scoped findMany
    mock.child.findMany.mockResolvedValue([]); // no owned children found

    await expect(
      service.assignChildren(TENANT_A, GROUP_ID, [CHILD_ID_B], USER_ID),
    ).rejects.toThrow(BadRequestException);
  });

  // ----------------------------------------------------------------
  // 14. unassignChild — sets classGroupId = null
  // ----------------------------------------------------------------
  it('unassignChild nulls classGroupId and writes audit log', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    mock.child.findFirst.mockResolvedValue({
      id: CHILD_ID_A,
      classGroupId: GROUP_ID,
    });
    mock.child.update.mockResolvedValue({});

    await service.unassignChild(TENANT_A, GROUP_ID, CHILD_ID_A, USER_ID);

    expect(mock.child.update).toHaveBeenCalledWith({
      where: { id: CHILD_ID_A },
      data: { classGroupId: null },
    });
    expect(auditMock.logUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'Child',
        entityId: CHILD_ID_A,
        afterValue: { classGroupId: null },
      }),
    );
  });

  // ----------------------------------------------------------------
  // 15. findChildren — tenant-scoped
  // ----------------------------------------------------------------
  it('findChildren returns children scoped to tenant and group', async () => {
    mock.classGroup.findFirst.mockResolvedValue(makeGroup());
    mock.child.findMany.mockResolvedValue([
      {
        id: CHILD_ID_A,
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: new Date('2024-01-01'),
        gender: 'FEMALE',
        isActive: true,
        classGroupId: GROUP_ID,
      },
    ]);

    const result = await service.findChildren(TENANT_A, GROUP_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(CHILD_ID_A);
    expect(mock.child.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          classGroupId: GROUP_ID,
          tenantId: TENANT_A,
          deletedAt: null,
        }),
      }),
    );
  });
});

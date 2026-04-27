/**
 * AttendanceController — unit tests
 *
 * Coverage:
 *  1. POST /  → mark delegates to service.markAttendance
 *  2. POST /bulk → bulkMark delegates to service.bulkMarkAttendance
 *  3. GET /  → list delegates with filter params
 *  4. GET /summary/today → todaySummary delegates
 *  5. GET /by-date/:date → byDate delegates
 *  6. GET /child/:childId → childHistory delegates with from/to
 *  7. GET /class-group/:id/by-date/:date → classGroupDailyReport delegates
 *  8. PATCH /:id → update delegates to service.updateAttendance
 *  9. DELETE /:id → remove delegates to service.deleteAttendance
 */

import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceStatus } from '@prisma/client';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';

const TENANT_ID = 'tenant-aaa';
const USER_ID = 'user-001';
const CHILD_ID = 'child-c1';
const GROUP_ID = 'group-001';
const RECORD_ID = 'record-001';
const TODAY_STR = new Date().toISOString().slice(0, 10);

const mockUser = {
  id: USER_ID,
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
};

function makeServiceMock() {
  return {
    markAttendance: jest.fn().mockResolvedValue({ id: RECORD_ID }),
    bulkMarkAttendance: jest
      .fn()
      .mockResolvedValue({ marked: 1, date: TODAY_STR }),
    list: jest.fn().mockResolvedValue({ total: 0, records: [] }),
    todaySummary: jest.fn().mockResolvedValue({
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      earlyPickupCount: 0,
      unmarkedCount: 0,
    }),
    findByDate: jest.fn().mockResolvedValue([]),
    findByChild: jest.fn().mockResolvedValue([]),
    classGroupDailyReport: jest.fn().mockResolvedValue({
      classGroupId: GROUP_ID,
      classGroupName: 'Butterflies',
      date: TODAY_STR,
      presentCount: 0,
      absentCount: 0,
      lateCount: 0,
      excusedCount: 0,
      earlyPickupCount: 0,
      records: [],
    }),
    updateAttendance: jest.fn().mockResolvedValue({ id: RECORD_ID }),
    deleteAttendance: jest.fn().mockResolvedValue(undefined),
  };
}

describe('AttendanceController', () => {
  let controller: AttendanceController;
  let svc: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    svc = makeServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AttendanceController],
      providers: [{ provide: AttendanceService, useValue: svc }],
    }).compile();

    controller = module.get<AttendanceController>(AttendanceController);
  });

  afterEach(() => jest.clearAllMocks());

  // ----------------------------------------------------------------
  // 1. POST /
  // ----------------------------------------------------------------
  it('mark delegates to service.markAttendance with tenantId and userId', async () => {
    const dto = {
      childId: CHILD_ID,
      date: TODAY_STR,
      status: AttendanceStatus.PRESENT,
    };
    const result = await controller.mark(mockUser as never, dto as never);

    expect(svc.markAttendance).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
    expect(result).toMatchObject({ id: RECORD_ID });
  });

  // ----------------------------------------------------------------
  // 2. POST /bulk
  // ----------------------------------------------------------------
  it('bulkMark delegates to service.bulkMarkAttendance', async () => {
    const dto = {
      date: TODAY_STR,
      records: [{ childId: CHILD_ID, status: AttendanceStatus.PRESENT }],
    };
    const result = await controller.bulkMark(mockUser as never, dto as never);

    expect(svc.bulkMarkAttendance).toHaveBeenCalledWith(
      TENANT_ID,
      USER_ID,
      dto,
    );
    expect(result).toMatchObject({ marked: 1 });
  });

  // ----------------------------------------------------------------
  // 3. GET /
  // ----------------------------------------------------------------
  it('list delegates to service.list with all filter params', async () => {
    const result = await controller.list(
      mockUser as never,
      undefined,
      '2026-04-01',
      '2026-04-30',
      GROUP_ID,
      CHILD_ID,
      AttendanceStatus.LATE,
    );

    expect(svc.list).toHaveBeenCalledWith(TENANT_ID, {
      date: undefined,
      from: '2026-04-01',
      to: '2026-04-30',
      classGroupId: GROUP_ID,
      childId: CHILD_ID,
      status: AttendanceStatus.LATE,
    });
    expect(result).toMatchObject({ total: 0 });
  });

  // ----------------------------------------------------------------
  // 4. GET /summary/today
  // ----------------------------------------------------------------
  it('todaySummary delegates to service.todaySummary', async () => {
    const result = await controller.todaySummary(mockUser as never);
    expect(svc.todaySummary).toHaveBeenCalledWith(TENANT_ID);
    expect(result).toHaveProperty('unmarkedCount');
  });

  // ----------------------------------------------------------------
  // 5. GET /by-date/:date
  // ----------------------------------------------------------------
  it('byDate delegates to service.findByDate', async () => {
    await controller.byDate(mockUser as never, TODAY_STR);
    expect(svc.findByDate).toHaveBeenCalledWith(TENANT_ID, TODAY_STR);
  });

  // ----------------------------------------------------------------
  // 6. GET /child/:childId
  // ----------------------------------------------------------------
  it('childHistory delegates to service.findByChild with from/to', async () => {
    await controller.childHistory(
      mockUser as never,
      CHILD_ID,
      '2026-04-01',
      '2026-04-27',
    );
    expect(svc.findByChild).toHaveBeenCalledWith(
      TENANT_ID,
      CHILD_ID,
      '2026-04-01',
      '2026-04-27',
    );
  });

  // ----------------------------------------------------------------
  // 7. GET /class-group/:id/by-date/:date
  // ----------------------------------------------------------------
  it('classGroupDailyReport delegates to service', async () => {
    const result = await controller.classGroupDailyReport(
      mockUser as never,
      GROUP_ID,
      TODAY_STR,
    );
    expect(svc.classGroupDailyReport).toHaveBeenCalledWith(
      TENANT_ID,
      GROUP_ID,
      TODAY_STR,
    );
    expect(result).toMatchObject({ classGroupId: GROUP_ID });
  });

  // ----------------------------------------------------------------
  // 8. PATCH /:id
  // ----------------------------------------------------------------
  it('update delegates to service.updateAttendance', async () => {
    const dto = { status: AttendanceStatus.EXCUSED };
    await controller.update(mockUser as never, RECORD_ID, dto as never);
    expect(svc.updateAttendance).toHaveBeenCalledWith(
      TENANT_ID,
      RECORD_ID,
      USER_ID,
      dto,
    );
  });

  // ----------------------------------------------------------------
  // 9. DELETE /:id
  // ----------------------------------------------------------------
  it('remove delegates to service.deleteAttendance', async () => {
    await controller.remove(mockUser as never, RECORD_ID);
    expect(svc.deleteAttendance).toHaveBeenCalledWith(
      TENANT_ID,
      RECORD_ID,
      USER_ID,
    );
  });
});

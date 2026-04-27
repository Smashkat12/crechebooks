/**
 * ClassGroupsController — unit tests
 *
 * Coverage:
 *  1. GET /  → delegates to service.findAll with tenantId + includeInactive
 *  2. GET /:id  → delegates to service.findOne
 *  3. POST /   → delegates to service.create (HTTP 201)
 *  4. PATCH /:id  → delegates to service.update
 *  5. DELETE /:id → delegates to service.remove (HTTP 204)
 *  6. POST /:id/children → delegates to service.assignChildren
 *  7. DELETE /:id/children/:childId → delegates to service.unassignChild
 *  8. GET /:id/children → delegates to service.findChildren
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ClassGroupsController } from './class-groups.controller';
import { ClassGroupsService } from './class-groups.service';

const TENANT_ID = 'tenant-aaa';
const GROUP_ID = 'group-001';
const CHILD_ID = 'child-c1';
const USER_ID = 'user-001';

// Minimal IUser mock
const mockUser = {
  id: USER_ID,
  tenantId: TENANT_ID,
  email: 'admin@test.com',
  role: 'ADMIN',
};

function makeServiceMock() {
  return {
    findAll: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: GROUP_ID, childCount: 0 }),
    create: jest.fn().mockResolvedValue({ id: GROUP_ID, childCount: 0 }),
    update: jest.fn().mockResolvedValue({ id: GROUP_ID, childCount: 0 }),
    remove: jest.fn().mockResolvedValue(undefined),
    assignChildren: jest.fn().mockResolvedValue({ assigned: 1 }),
    unassignChild: jest.fn().mockResolvedValue(undefined),
    findChildren: jest.fn().mockResolvedValue([]),
  };
}

describe('ClassGroupsController', () => {
  let controller: ClassGroupsController;
  let svc: ReturnType<typeof makeServiceMock>;

  beforeEach(async () => {
    svc = makeServiceMock();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClassGroupsController],
      providers: [{ provide: ClassGroupsService, useValue: svc }],
    }).compile();

    controller = module.get<ClassGroupsController>(ClassGroupsController);
  });

  afterEach(() => jest.clearAllMocks());

  // ----------------------------------------------------------------
  // 1. GET /
  // ----------------------------------------------------------------
  it('findAll delegates to service with tenantId and includeInactive=false', async () => {
    await controller.findAll(mockUser as never, false);
    expect(svc.findAll).toHaveBeenCalledWith(TENANT_ID, false);
  });

  it('findAll passes includeInactive=true when requested', async () => {
    await controller.findAll(mockUser as never, true);
    expect(svc.findAll).toHaveBeenCalledWith(TENANT_ID, true);
  });

  // ----------------------------------------------------------------
  // 2. GET /:id
  // ----------------------------------------------------------------
  it('findOne delegates to service.findOne', async () => {
    const result = await controller.findOne(mockUser as never, GROUP_ID);
    expect(svc.findOne).toHaveBeenCalledWith(TENANT_ID, GROUP_ID);
    expect(result).toMatchObject({ id: GROUP_ID });
  });

  // ----------------------------------------------------------------
  // 3. POST /
  // ----------------------------------------------------------------
  it('create delegates to service.create with tenantId and userId', async () => {
    const dto = { name: 'Butterflies' };
    await controller.create(mockUser as never, dto as never);
    expect(svc.create).toHaveBeenCalledWith(TENANT_ID, USER_ID, dto);
  });

  // ----------------------------------------------------------------
  // 4. PATCH /:id
  // ----------------------------------------------------------------
  it('update delegates to service.update', async () => {
    const dto = { name: 'Updated' };
    await controller.update(mockUser as never, GROUP_ID, dto as never);
    expect(svc.update).toHaveBeenCalledWith(TENANT_ID, GROUP_ID, USER_ID, dto);
  });

  // ----------------------------------------------------------------
  // 5. DELETE /:id
  // ----------------------------------------------------------------
  it('remove delegates to service.remove', async () => {
    await controller.remove(mockUser as never, GROUP_ID);
    expect(svc.remove).toHaveBeenCalledWith(TENANT_ID, GROUP_ID, USER_ID);
  });

  // ----------------------------------------------------------------
  // 6. POST /:id/children
  // ----------------------------------------------------------------
  it('assignChildren delegates to service.assignChildren', async () => {
    const dto = { childIds: [CHILD_ID] };
    const result = await controller.assignChildren(
      mockUser as never,
      GROUP_ID,
      dto as never,
    );
    expect(svc.assignChildren).toHaveBeenCalledWith(
      TENANT_ID,
      GROUP_ID,
      [CHILD_ID],
      USER_ID,
    );
    expect(result).toEqual({ assigned: 1 });
  });

  // ----------------------------------------------------------------
  // 7. DELETE /:id/children/:childId
  // ----------------------------------------------------------------
  it('unassignChild delegates to service.unassignChild', async () => {
    await controller.unassignChild(mockUser as never, GROUP_ID, CHILD_ID);
    expect(svc.unassignChild).toHaveBeenCalledWith(
      TENANT_ID,
      GROUP_ID,
      CHILD_ID,
      USER_ID,
    );
  });

  // ----------------------------------------------------------------
  // 8. GET /:id/children
  // ----------------------------------------------------------------
  it('findChildren delegates to service.findChildren', async () => {
    await controller.findChildren(mockUser as never, GROUP_ID);
    expect(svc.findChildren).toHaveBeenCalledWith(TENANT_ID, GROUP_ID);
  });
});

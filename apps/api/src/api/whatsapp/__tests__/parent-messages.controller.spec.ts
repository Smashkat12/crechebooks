/**
 * ParentMessagesController — unit tests
 * Item #12 — Step 4
 *
 * Coverage:
 *  1.  GET / — own thread returned for authenticated parent
 *  2.  GET / — tenant isolation: only own tenant messages in query
 *  3.  GET / — pagination params forwarded
 *  4.  GET / — response omits admin-only fields (readByUserId, adminReadAt)
 */

import { Test, TestingModule } from '@nestjs/testing';
import { CanActivate } from '@nestjs/common';
import { MessageDirection } from '@prisma/client';
import { ParentMessagesController } from '../parent-messages.controller';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { ParentAuthGuard } from '../../auth/guards/parent-auth.guard';
import type { ParentSession } from '../../auth/decorators/current-parent.decorator';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_A = 'parent-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function makeSession(overrides: Partial<ParentSession> = {}): ParentSession {
  return {
    id: 'session-1',
    parentId: PARENT_A,
    tenantId: TENANT_A,
    parent: {
      id: PARENT_A,
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
      tenantId: TENANT_A,
    },
    ...overrides,
  };
}

const MOCK_MESSAGES = [
  {
    id: 'msg-001',
    parentId: PARENT_A,
    direction: MessageDirection.INBOUND,
    body: 'Hi',
    templateName: null,
    mediaUrls: null,
    status: 'PENDING',
    wamid: null,
    createdAt: new Date('2026-04-27T08:00:00Z'),
    sentAt: null,
    deliveredAt: null,
    readAt: null,
  },
  {
    id: 'msg-002',
    parentId: PARENT_A,
    direction: MessageDirection.OUTBOUND,
    body: null,
    templateName: 'cb_invoice',
    mediaUrls: null,
    status: 'SENT',
    wamid: 'SMXXXX',
    createdAt: new Date('2026-04-27T09:00:00Z'),
    sentAt: new Date('2026-04-27T09:00:05Z'),
    deliveredAt: null,
    readAt: null,
  },
];

// ---------------------------------------------------------------------------
// Prisma stub
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    whatsAppMessage: {
      findMany: jest.fn().mockResolvedValue(MOCK_MESSAGES),
      count: jest.fn().mockResolvedValue(MOCK_MESSAGES.length),
    },
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let controller: ParentMessagesController;
let prisma: ReturnType<typeof makePrisma>;

// No-op guard: in controller unit tests the guard logic is not under test.
const mockParentAuthGuard: CanActivate = { canActivate: () => true };

beforeEach(async () => {
  prisma = makePrisma();

  const module: TestingModule = await Test.createTestingModule({
    controllers: [ParentMessagesController],
    providers: [{ provide: PrismaService, useValue: prisma }],
  })
    .overrideGuard(ParentAuthGuard)
    .useValue(mockParentAuthGuard)
    .compile();

  controller = module.get(ParentMessagesController);
});

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ParentMessagesController.getOwnThread', () => {
  it('1. returns own conversation thread', async () => {
    const session = makeSession();
    const result = await controller.getOwnThread(session, {});

    expect(result.messages).toEqual(MOCK_MESSAGES);
    expect(result.total).toBe(2);
  });

  it('2. query scoped to tenantId + parentId', async () => {
    const session = makeSession();
    await controller.getOwnThread(session, {});

    const findCall = prisma.whatsAppMessage.findMany.mock.calls[0][0];
    expect(findCall.where.tenantId).toBe(TENANT_A);
    expect(findCall.where.parentId).toBe(PARENT_A);
  });

  it('3. pagination params forwarded correctly', async () => {
    const session = makeSession();
    await controller.getOwnThread(session, { limit: 20, offset: 40 });

    const findCall = prisma.whatsAppMessage.findMany.mock.calls[0][0];
    expect(findCall.take).toBe(20);
    expect(findCall.skip).toBe(40);
  });

  it('4. select clause excludes admin-only fields', async () => {
    const session = makeSession();
    await controller.getOwnThread(session, {});

    const findCall = prisma.whatsAppMessage.findMany.mock.calls[0][0];
    expect(findCall.select).toBeDefined();
    expect(findCall.select.readByUserId).toBeUndefined();
    expect(findCall.select.adminReadAt).toBeUndefined();
    // But these should be included
    expect(findCall.select.id).toBe(true);
    expect(findCall.select.direction).toBe(true);
    expect(findCall.select.body).toBe(true);
  });
});

describe('ParentMessagesController — parent isolation', () => {
  it('5. different parent session does not see first parent messages', async () => {
    const OTHER_PARENT = 'parent-other-bbbb-bbbb-bbbbbbbbbbbb';
    const session = makeSession({ parentId: OTHER_PARENT });

    // Simulate empty result for other parent
    prisma.whatsAppMessage.findMany.mockResolvedValue([]);
    prisma.whatsAppMessage.count.mockResolvedValue(0);

    const result = await controller.getOwnThread(session, {});

    expect(result.messages).toHaveLength(0);
    const findCall = prisma.whatsAppMessage.findMany.mock.calls[0][0];
    // Query must be scoped to OTHER_PARENT
    expect(findCall.where.parentId).toBe(OTHER_PARENT);
  });
});

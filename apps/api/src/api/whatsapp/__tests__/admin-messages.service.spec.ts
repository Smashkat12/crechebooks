/**
 * AdminMessagesService — unit tests
 * Item #12 — Step 3
 *
 * Coverage:
 *  1.  listThreads — returns threads with snippet + unreadCount
 *  2.  listThreads — tenant isolation (only own tenant's messages)
 *  3.  getThread — known parent → paginated messages
 *  4.  getThread — unknown parent → NotFoundException
 *  5.  reply — within 24h window → sends + persists OUTBOUND row
 *  6.  reply — outside 24h window → 422 with requiresTemplate
 *  7.  reply — no inbound at all → 422 with requiresTemplate
 *  8.  markRead — known message → sets isRead + adminReadAt
 *  9.  markRead — cross-tenant message → NotFoundException
 * 10.  markAllRead — marks all inbound unread for parent as read
 * 11.  listUnknown — returns inbound rows with parentId=null
 * 12.  linkParent — links message + other messages from same phone
 * 13.  linkParent — cross-tenant parent → NotFoundException
 */

import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MessageDirection, WhatsAppMessageStatus } from '@prisma/client';
import { AdminMessagesService } from '../admin-messages.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { WhatsAppProviderService } from '../../../integrations/whatsapp/services/whatsapp-provider.service';
import { TwilioContentService } from '../../../integrations/whatsapp/services/twilio-content.service';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_A = 'tenant-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'tenant-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_A = 'parent-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ADMIN_ID = 'admin-user-id';
const MSG_ID = 'msg-id-001';

const NOW = new Date('2026-04-27T10:00:00Z');
const WITHIN_24H = new Date(NOW.getTime() - 2 * 60 * 60 * 1000); // 2h ago
const OUTSIDE_24H = new Date(NOW.getTime() - 25 * 60 * 60 * 1000); // 25h ago

function makeMsg(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: MSG_ID,
    tenantId: TENANT_A,
    parentId: PARENT_A,
    direction: MessageDirection.INBOUND,
    body: 'Hello',
    fromPhone: '+27821234567',
    isRead: false,
    createdAt: WITHIN_24H,
    templateName: null,
    status: WhatsAppMessageStatus.PENDING,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Prisma stub
// ---------------------------------------------------------------------------

function makePrisma() {
  return {
    whatsAppMessage: {
      groupBy: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    parent: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
}

function makeAuditLog() {
  return { logAction: jest.fn().mockResolvedValue(undefined) };
}

function makeProvider() {
  return {
    sendMessage: jest.fn().mockResolvedValue({
      success: true,
      messageId: 'SM_twilio_sid',
    }),
  };
}

function makeTwilioContent() {
  return {
    sendContentMessage: jest.fn().mockResolvedValue({
      success: true,
      messageSid: 'SM_content_sid',
    }),
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: AdminMessagesService;
let prisma: ReturnType<typeof makePrisma>;
let auditLog: ReturnType<typeof makeAuditLog>;
let provider: ReturnType<typeof makeProvider>;
let twilioContent: ReturnType<typeof makeTwilioContent>;

beforeEach(async () => {
  jest.useFakeTimers().setSystemTime(NOW);

  prisma = makePrisma();
  auditLog = makeAuditLog();
  provider = makeProvider();
  twilioContent = makeTwilioContent();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AdminMessagesService,
      { provide: PrismaService, useValue: prisma },
      { provide: AuditLogService, useValue: auditLog },
      { provide: WhatsAppProviderService, useValue: provider },
      { provide: TwilioContentService, useValue: twilioContent },
    ],
  }).compile();

  service = module.get(AdminMessagesService);
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. listThreads
// ---------------------------------------------------------------------------

describe('listThreads', () => {
  it('1. returns threads with snippet and unreadCount', async () => {
    prisma.whatsAppMessage.groupBy
      .mockResolvedValueOnce([
        { parentId: PARENT_A, _max: { createdAt: WITHIN_24H } },
      ])
      .mockResolvedValueOnce([{ parentId: PARENT_A }]); // total count

    prisma.whatsAppMessage.findFirst.mockResolvedValue(makeMsg());
    prisma.whatsAppMessage.count.mockResolvedValue(3);
    prisma.parent.findUnique.mockResolvedValue({
      firstName: 'Alice',
      lastName: 'Smith',
    });

    const result = await service.listThreads(TENANT_A, 50, 0);

    expect(result.threads).toHaveLength(1);
    expect(result.threads[0].parentId).toBe(PARENT_A);
    expect(result.threads[0].parentName).toBe('Alice Smith');
    expect(result.threads[0].unreadCount).toBe(3);
    expect(result.threads[0].lastMessageSnippet).toBe('Hello');
  });

  it('2. tenant isolation — groupBy scoped to tenantId', async () => {
    prisma.whatsAppMessage.groupBy
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.listThreads(TENANT_B, 50, 0);

    const groupByCall = prisma.whatsAppMessage.groupBy.mock.calls[0][0];
    expect(groupByCall.where.tenantId).toBe(TENANT_B);
  });
});

// ---------------------------------------------------------------------------
// 2. getThread
// ---------------------------------------------------------------------------

describe('getThread', () => {
  it('3. known parent → returns paginated messages with parent metadata', async () => {
    prisma.parent.findUnique.mockResolvedValue({
      id: PARENT_A,
      tenantId: TENANT_A,
      firstName: 'Alice',
      lastName: 'Smith',
      phone: '+27821234567',
      whatsapp: '+27821234567',
    });
    prisma.whatsAppMessage.findMany.mockResolvedValue([makeMsg()]);
    prisma.whatsAppMessage.count.mockResolvedValue(1);

    const result = await service.getThread(TENANT_A, PARENT_A, 100, 0, 'asc');

    expect(result.messages).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(result.parent.id).toBe(PARENT_A);
    expect(result.parent.firstName).toBe('Alice');
    expect(result.parent.lastName).toBe('Smith');
    expect(result.parent.phone).toBe('+27821234567');
    expect(result.parent.whatsapp).toBe('+27821234567');
  });

  it('4. unknown parent → NotFoundException', async () => {
    prisma.parent.findUnique.mockResolvedValue(null);

    await expect(
      service.getThread(TENANT_A, 'non-existent', 100, 0, 'asc'),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// 3. reply
// ---------------------------------------------------------------------------

describe('reply', () => {
  beforeEach(() => {
    prisma.parent.findUnique
      .mockResolvedValueOnce({ id: PARENT_A, tenantId: TENANT_A }) // assertParent
      .mockResolvedValueOnce({ whatsapp: '+27821234567', phone: null }); // phone lookup
  });

  it('5. within 24h window → sends + persists OUTBOUND row', async () => {
    // Last inbound was 2h ago → inside window
    prisma.whatsAppMessage.findFirst.mockResolvedValue({
      createdAt: WITHIN_24H,
    });
    prisma.whatsAppMessage.create.mockResolvedValue(makeMsg());

    const result = await service.reply(
      TENANT_A,
      PARENT_A,
      ADMIN_ID,
      'Here are your fees',
    );

    expect(provider.sendMessage).toHaveBeenCalledWith(
      '+27821234567',
      'Here are your fees',
      { tenantId: TENANT_A },
    );
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: MessageDirection.OUTBOUND,
          tenantId: TENANT_A,
          parentId: PARENT_A,
        }),
      }),
    );
    expect(result.message).toBeDefined();
  });

  it('6. outside 24h window → 422 UnprocessableEntityException', async () => {
    // Last inbound was 25h ago → outside window
    prisma.whatsAppMessage.findFirst.mockResolvedValue({
      createdAt: OUTSIDE_24H,
    });

    await expect(
      service.reply(TENANT_A, PARENT_A, ADMIN_ID, 'Hi'),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('7. no inbound messages at all → 422', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);

    await expect(
      service.reply(TENANT_A, PARENT_A, ADMIN_ID, 'Hi'),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});

// ---------------------------------------------------------------------------
// 4. markRead
// ---------------------------------------------------------------------------

describe('markRead', () => {
  it('8. known message → marks isRead + adminReadAt', async () => {
    prisma.whatsAppMessage.findUnique.mockResolvedValue(makeMsg());
    prisma.whatsAppMessage.update.mockResolvedValue({
      ...makeMsg(),
      isRead: true,
    });

    const updated = await service.markRead(TENANT_A, MSG_ID, ADMIN_ID);

    expect(prisma.whatsAppMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MSG_ID },
        data: expect.objectContaining({
          isRead: true,
          readByUserId: ADMIN_ID,
        }),
      }),
    );
    expect(updated.isRead).toBe(true);
    expect(auditLog.logAction).toHaveBeenCalled();
  });

  it('9. cross-tenant message → NotFoundException', async () => {
    prisma.whatsAppMessage.findUnique.mockResolvedValue({
      ...makeMsg(),
      tenantId: TENANT_B, // different tenant
    });

    await expect(service.markRead(TENANT_A, MSG_ID, ADMIN_ID)).rejects.toThrow(
      NotFoundException,
    );
  });
});

// ---------------------------------------------------------------------------
// 5. markAllRead
// ---------------------------------------------------------------------------

describe('markAllRead', () => {
  it('10. bulk-marks all inbound unread for parent as read', async () => {
    prisma.parent.findUnique.mockResolvedValue({
      id: PARENT_A,
      tenantId: TENANT_A,
    });
    prisma.whatsAppMessage.updateMany.mockResolvedValue({ count: 5 });

    const result = await service.markAllRead(TENANT_A, PARENT_A, ADMIN_ID);

    expect(result.count).toBe(5);
    expect(prisma.whatsAppMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          parentId: PARENT_A,
          direction: MessageDirection.INBOUND,
          isRead: false,
        }),
        data: expect.objectContaining({ isRead: true }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// 6. listUnknown
// ---------------------------------------------------------------------------

describe('listUnknown', () => {
  it('11. returns inbound rows with parentId=null', async () => {
    const unknownMsg = makeMsg({ parentId: null });
    prisma.whatsAppMessage.findMany.mockResolvedValue([unknownMsg]);
    prisma.whatsAppMessage.count.mockResolvedValue(1);

    const result = await service.listUnknown(TENANT_A, 50, 0);

    expect(result.messages).toHaveLength(1);
    expect(result.total).toBe(1);
    const findCall = prisma.whatsAppMessage.findMany.mock.calls[0][0];
    expect(findCall.where.parentId).toBeNull();
    expect(findCall.where.direction).toBe(MessageDirection.INBOUND);
  });
});

// ---------------------------------------------------------------------------
// 7. linkParent
// ---------------------------------------------------------------------------

describe('linkParent', () => {
  it('12. links message + other messages from same phone', async () => {
    prisma.parent.findUnique.mockResolvedValue({
      id: PARENT_A,
      tenantId: TENANT_A,
    });
    prisma.whatsAppMessage.findUnique.mockResolvedValue({
      id: MSG_ID,
      tenantId: TENANT_A,
      fromPhone: '+27821234567',
    });
    prisma.whatsAppMessage.update.mockResolvedValue({});
    prisma.whatsAppMessage.updateMany.mockResolvedValue({ count: 2 });

    const result = await service.linkParent(
      TENANT_A,
      MSG_ID,
      PARENT_A,
      ADMIN_ID,
    );

    // 1 (primary) + 2 (bulk) = 3
    expect(result.updated).toBe(3);
    expect(auditLog.logAction).toHaveBeenCalled();
  });

  it('13. cross-tenant parent → NotFoundException', async () => {
    // Parent exists but in TENANT_B
    prisma.parent.findUnique.mockResolvedValue({
      id: PARENT_A,
      tenantId: TENANT_B,
    });

    await expect(
      service.linkParent(TENANT_A, MSG_ID, PARENT_A, ADMIN_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

// ---------------------------------------------------------------------------
// 8. check24hWindow (internal, tested via reply above; unit test directly)
// ---------------------------------------------------------------------------

describe('check24hWindow', () => {
  it('within window → allowed=true', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({
      createdAt: WITHIN_24H,
    });
    const result = await service.check24hWindow(TENANT_A, PARENT_A);
    expect(result.allowed).toBe(true);
    expect(result.lastInboundAt).toEqual(WITHIN_24H);
  });

  it('outside window → allowed=false', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue({
      createdAt: OUTSIDE_24H,
    });
    const result = await service.check24hWindow(TENANT_A, PARENT_A);
    expect(result.allowed).toBe(false);
  });

  it('no inbound messages → allowed=false, lastInboundAt=null', async () => {
    prisma.whatsAppMessage.findFirst.mockResolvedValue(null);
    const result = await service.check24hWindow(TENANT_A, PARENT_A);
    expect(result.allowed).toBe(false);
    expect(result.lastInboundAt).toBeNull();
  });
});

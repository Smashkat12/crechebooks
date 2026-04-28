/**
 * InboundMessagePersistenceService — unit tests
 * Item #12 — Step 2
 *
 * Coverage:
 *  1.  persist — known parent matched → row with parentId
 *  2.  persist — unknown number → row with parentId=null
 *  3.  persist — multi-match → auto-picks newest parent, logs warn
 *  4.  persist — media items → calls reupload, stores s3Key
 *  5.  persist — media reupload fails → fallback to original URL, row still saved
 *  6.  persist — sets direction=INBOUND, body, fromPhone, wamid
 *  7.  persist — no media → mediaUrls=JsonNull
 */

import { Test, TestingModule } from '@nestjs/testing';
import { InboundMessagePersistenceService } from '../inbound-message-persistence.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { StorageService } from '../../../integrations/storage/storage.service';
import { MessageDirection } from '@prisma/client';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARENT_ID_A = 'parent-a-id';
const PARENT_ID_B = 'parent-b-id';
const TWILIO_SID = 'SM1234567890abcdef';
const FROM_PHONE = '+27821234567';
const BODY = 'Hello, what are my outstanding fees?';
const S3_KEY = `tenants/${TENANT_ID}/whatsapp-media/some-file.jpg`;

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

function makePrismaStub() {
  return {
    parent: {
      findMany: jest.fn(),
    },
    whatsAppMessage: {
      create: jest.fn(),
    },
  };
}

function makeStorageStub() {
  return {
    buildKey: jest.fn().mockReturnValue(S3_KEY),
    putObject: jest.fn().mockResolvedValue({ key: S3_KEY, etag: '"abc"' }),
  };
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let service: InboundMessagePersistenceService;
let prisma: ReturnType<typeof makePrismaStub>;
let storage: ReturnType<typeof makeStorageStub>;

beforeEach(async () => {
  prisma = makePrismaStub();
  storage = makeStorageStub();

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      InboundMessagePersistenceService,
      { provide: PrismaService, useValue: prisma },
      { provide: StorageService, useValue: storage },
    ],
  }).compile();

  service = module.get(InboundMessagePersistenceService);
});

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Helper — default create mock
// ---------------------------------------------------------------------------

function setCreateReturn(id = 'msg-id-1') {
  prisma.whatsAppMessage.create.mockResolvedValue({ id });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InboundMessagePersistenceService.persist', () => {
  it('1. known parent matched — row created with parentId', async () => {
    prisma.parent.findMany.mockResolvedValue([
      { id: PARENT_ID_A, firstName: 'Alice', lastName: 'Smith' },
    ]);
    setCreateReturn();

    const id = await service.persist(
      TENANT_ID,
      FROM_PHONE,
      BODY,
      TWILIO_SID,
      [],
    );

    expect(id).toBe('msg-id-1');
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: PARENT_ID_A,
          direction: MessageDirection.INBOUND,
          body: BODY,
          fromPhone: FROM_PHONE,
          wamid: TWILIO_SID,
        }),
      }),
    );
  });

  it('2. unknown number — row created with parentId=undefined (null)', async () => {
    prisma.parent.findMany.mockResolvedValue([]);
    setCreateReturn('msg-unknown');

    const id = await service.persist(
      TENANT_ID,
      FROM_PHONE,
      BODY,
      TWILIO_SID,
      [],
    );

    expect(id).toBe('msg-unknown');
    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          parentId: undefined, // null ?? undefined → undefined for Prisma optional
          direction: MessageDirection.INBOUND,
        }),
      }),
    );
  });

  it('3. multi-match — auto-picks first (newest) parent', async () => {
    prisma.parent.findMany.mockResolvedValue([
      { id: PARENT_ID_A, firstName: 'Alice', lastName: 'Smith' },
      { id: PARENT_ID_B, firstName: 'Bob', lastName: 'Jones' },
    ]);
    setCreateReturn();

    await service.persist(TENANT_ID, FROM_PHONE, BODY, TWILIO_SID, []);

    expect(prisma.whatsAppMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ parentId: PARENT_ID_A }),
      }),
    );
  });

  it('4. media items — calls storage.buildKey + putObject, stores s3Key', async () => {
    prisma.parent.findMany.mockResolvedValue([
      { id: PARENT_ID_A, firstName: 'Alice', lastName: 'Smith' },
    ]);
    setCreateReturn();

    // Mock fetch to return fake image bytes
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(4)),
    });

    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'authtest';

    const mediaItem = {
      url: 'https://api.twilio.com/media/img.jpg',
      contentType: 'image/jpeg',
    };

    await service.persist(TENANT_ID, FROM_PHONE, BODY, TWILIO_SID, [mediaItem]);

    expect(storage.buildKey).toHaveBeenCalledWith(
      TENANT_ID,
      'whatsapp-media',
      expect.stringMatching(/\.jpg$/),
    );
    expect(storage.putObject).toHaveBeenCalled();

    // mediaUrls should contain the item with s3Key
    const createCall = prisma.whatsAppMessage.create.mock.calls[0][0];
    const mediaUrls = createCall.data.mediaUrls as Array<{
      url: string;
      s3Key: string;
    }>;
    expect(Array.isArray(mediaUrls)).toBe(true);
    expect(mediaUrls[0].s3Key).toBe(S3_KEY);

    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('5. media reupload failure — row still saved with fallback original URL', async () => {
    prisma.parent.findMany.mockResolvedValue([]);
    setCreateReturn('msg-fallback');

    // Make fetch fail
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
    });

    process.env.TWILIO_ACCOUNT_SID = 'ACtest';
    process.env.TWILIO_AUTH_TOKEN = 'authtest';

    const mediaItem = {
      url: 'https://api.twilio.com/media/img.jpg',
      contentType: 'image/jpeg',
    };

    const id = await service.persist(TENANT_ID, FROM_PHONE, '', TWILIO_SID, [
      mediaItem,
    ]);

    // Row still created — non-fatal
    expect(id).toBe('msg-fallback');
    const createCall = prisma.whatsAppMessage.create.mock.calls[0][0];
    const mediaUrls = createCall.data.mediaUrls as Array<{
      url: string;
      s3Key?: string;
    }>;
    expect(Array.isArray(mediaUrls)).toBe(true);
    // Fallback: original URL, no s3Key
    expect(mediaUrls[0].url).toBe(mediaItem.url);
    expect(mediaUrls[0].s3Key).toBeUndefined();

    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
  });

  it('6. body / direction / fromPhone / wamid set correctly on row', async () => {
    prisma.parent.findMany.mockResolvedValue([]);
    setCreateReturn();

    await service.persist(TENANT_ID, FROM_PHONE, BODY, TWILIO_SID, []);

    const data = prisma.whatsAppMessage.create.mock.calls[0][0].data;
    expect(data.direction).toBe(MessageDirection.INBOUND);
    expect(data.body).toBe(BODY);
    expect(data.fromPhone).toBe(FROM_PHONE);
    expect(data.wamid).toBe(TWILIO_SID);
  });

  it('7. no media — mediaUrls is Prisma.JsonNull (not array)', async () => {
    prisma.parent.findMany.mockResolvedValue([]);
    setCreateReturn();

    await service.persist(TENANT_ID, FROM_PHONE, BODY, TWILIO_SID, []);

    const data = prisma.whatsAppMessage.create.mock.calls[0][0].data;
    // Prisma.JsonNull is a symbol-like object, not an array
    expect(Array.isArray(data.mediaUrls)).toBe(false);
  });
});

/**
 * AUDIT-PAY-04: PaymentReceiptService — S3 persistence unit tests
 *
 * Covers:
 *  1. First call: generates PDF, uploads to S3, upserts DB row, returns signed URL
 *  2. Second call: serves from DB pointer (no PDF generation)
 *  3. PDF generation failure: DB insert is NOT reached
 *  4. Missing payment: throws NotFoundException
 *  5. Cross-tenant isolation: DB pointer with mismatched tenantId returns null
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentReceiptService } from '../payment-receipt.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../../integrations/storage/storage.service';
import { AuditLogService } from '../audit-log.service';
import { StorageKind } from '../../../integrations/storage/storage.types';
import { NotFoundException } from '../../../shared/exceptions';

// ---------------------------------------------------------------------------
// Minimal stubs
// ---------------------------------------------------------------------------

const TENANT_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const PAYMENT_ID = 'bbbbbbbb-0000-0000-0000-000000000002';
const OTHER_TENANT_ID = 'cccccccc-0000-0000-0000-000000000003';
const S3_KEY = `tenants/${TENANT_ID}/payment-receipts/REC-2026-00001.pdf`;
const SIGNED_URL = 'https://s3.example.com/signed?token=abc';

const basePayment = {
  id: PAYMENT_ID,
  tenantId: TENANT_ID,
  amountCents: 150000,
  paymentDate: new Date('2026-04-30'),
  reference: 'REF123',
  invoice: {
    invoiceNumber: 'INV-2026-001',
    parent: {
      firstName: 'Jane',
      middleName: null,
      lastName: 'Smith',
      email: 'jane@example.com',
    },
    child: {
      firstName: 'Tom',
      middleName: null,
      lastName: 'Smith',
    },
  },
};

const baseTenant = {
  id: TENANT_ID,
  name: 'Elle Elephant ECD',
  tradingName: 'Elle Elephant',
  addressLine1: '1 Test St',
  addressLine2: null,
  city: 'Cape Town',
  province: 'WC',
  postalCode: '8001',
  vatNumber: null,
  phone: '0211234567',
  email: 'info@elle.co.za',
};

function makePrismaStub(overrides: {
  paymentReceiptFindUnique?: unknown;
  paymentReceiptCount?: number;
  paymentReceiptUpsert?: unknown;
  /** Pass explicit null to simulate "not found". Omit key to use basePayment. */
  paymentFindFirst?: unknown;
  tenantFindUnique?: unknown;
}) {
  // 'in' operator distinguishes "key not passed" from "key passed as null"
  const paymentResult =
    'paymentFindFirst' in overrides ? overrides.paymentFindFirst : basePayment;

  return {
    paymentReceipt: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.paymentReceiptFindUnique ?? null),
      count: jest.fn().mockResolvedValue(overrides.paymentReceiptCount ?? 0),
      upsert: jest.fn().mockResolvedValue(overrides.paymentReceiptUpsert ?? {}),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(paymentResult),
    },
    tenant: {
      findUnique: jest
        .fn()
        .mockResolvedValue(overrides.tenantFindUnique ?? baseTenant),
    },
  };
}

function makeStorageStub(overrides: {
  buildKey?: string;
  putObject?: unknown;
  createPresignedDownloadUrl?: string;
  getObjectStream?: unknown;
}) {
  return {
    buildKey: jest.fn().mockReturnValue(overrides.buildKey ?? S3_KEY),
    putObject: jest.fn().mockResolvedValue({ key: S3_KEY, etag: 'etag123' }),
    createPresignedDownloadUrl: jest
      .fn()
      .mockResolvedValue(overrides.createPresignedDownloadUrl ?? SIGNED_URL),
    getObjectStream: jest
      .fn()
      .mockResolvedValue(overrides.getObjectStream ?? { pipe: jest.fn() }),
  };
}

const auditStub = {
  logAction: jest.fn().mockResolvedValue({}),
};

// ---------------------------------------------------------------------------
// Helper to build service under test
// ---------------------------------------------------------------------------

async function buildService(
  prismaOverrides: Parameters<typeof makePrismaStub>[0],
  storageOverrides: Parameters<typeof makeStorageStub>[0] = {},
): Promise<{
  service: PaymentReceiptService;
  prisma: ReturnType<typeof makePrismaStub>;
  storage: ReturnType<typeof makeStorageStub>;
}> {
  const prisma = makePrismaStub(prismaOverrides);
  const storage = makeStorageStub(storageOverrides);

  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PaymentReceiptService,
      { provide: PrismaService, useValue: prisma },
      { provide: StorageService, useValue: storage },
      { provide: AuditLogService, useValue: auditStub },
    ],
  }).compile();

  return { service: module.get(PaymentReceiptService), prisma, storage };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PaymentReceiptService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. First call — generates, uploads, persists, returns URL
  // -------------------------------------------------------------------------
  describe('getOrGenerateReceipt — cache miss', () => {
    it('generates PDF, uploads to S3, upserts DB row, returns signed URL', async () => {
      const { service, prisma, storage } = await buildService({
        paymentReceiptFindUnique: null, // no existing pointer
        paymentReceiptCount: 0,
      });

      const result = await service.getOrGenerateReceipt(
        TENANT_ID,
        PAYMENT_ID,
        'user-1',
      );

      // Must have fetched the payment
      expect(prisma.payment.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: PAYMENT_ID, tenantId: TENANT_ID },
        }),
      );

      // Must have uploaded to S3
      expect(storage.putObject).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.PaymentReceipt,
        expect.stringContaining('payment-receipts'),
        expect.any(Buffer),
        'application/pdf',
      );

      // Must have persisted the DB pointer
      expect(prisma.paymentReceipt.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { paymentId: PAYMENT_ID },
          create: expect.objectContaining({
            paymentId: PAYMENT_ID,
            tenantId: TENANT_ID,
          }),
        }),
      );

      // Must return the signed URL
      expect(result.downloadUrl).toBe(SIGNED_URL);
      expect(result.cached).toBe(false);
      expect(result.receiptNumber).toMatch(/^REC-\d{4}-\d{5}$/);
    });
  });

  // -------------------------------------------------------------------------
  // 2. Second call — serves from S3 cache without regenerating
  // -------------------------------------------------------------------------
  describe('getOrGenerateReceipt — cache hit', () => {
    it('returns persisted signed URL without uploading or generating PDF', async () => {
      const { service, prisma, storage } = await buildService({
        paymentReceiptFindUnique: {
          id: 'receipt-row-id',
          paymentId: PAYMENT_ID,
          tenantId: TENANT_ID,
          s3Key: S3_KEY,
          createdAt: new Date(),
        },
      });

      const result = await service.getOrGenerateReceipt(
        TENANT_ID,
        PAYMENT_ID,
        'user-1',
      );

      // Must NOT have fetched the payment (no PDF generation)
      expect(prisma.payment.findFirst).not.toHaveBeenCalled();

      // Must NOT have uploaded anything
      expect(storage.putObject).not.toHaveBeenCalled();

      // Must NOT have upserted the DB row
      expect(prisma.paymentReceipt.upsert).not.toHaveBeenCalled();

      // Must have generated a signed URL for the cached key
      expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.PaymentReceipt,
        S3_KEY,
      );

      expect(result.downloadUrl).toBe(SIGNED_URL);
      expect(result.cached).toBe(true);
      expect(result.s3Key).toBe(S3_KEY);
    });
  });

  // -------------------------------------------------------------------------
  // 3. PDF generation failure — DB is not reached
  // -------------------------------------------------------------------------
  describe('generateReceipt — PDF failure', () => {
    it('does not upsert DB row when S3 upload fails', async () => {
      const { service, prisma, storage } = await buildService(
        {
          paymentReceiptFindUnique: null,
          paymentReceiptCount: 0,
        },
        { buildKey: S3_KEY },
      );

      // Make S3 upload throw
      storage.putObject.mockRejectedValueOnce(
        new Error('S3 connection refused'),
      );

      await expect(
        service.generateReceipt(TENANT_ID, PAYMENT_ID, 'user-1'),
      ).rejects.toThrow('S3 connection refused');

      // DB upsert must NOT have been called
      expect(prisma.paymentReceipt.upsert).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // 4. Missing payment — throws NotFoundException
  // -------------------------------------------------------------------------
  describe('generateReceipt — missing payment', () => {
    it('throws NotFoundException when payment does not exist', async () => {
      const { service } = await buildService({
        paymentFindFirst: null,
      });

      await expect(
        service.generateReceipt(TENANT_ID, 'nonexistent-payment-id', 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // -------------------------------------------------------------------------
  // 5. Cross-tenant isolation in findReceiptByPaymentId
  // -------------------------------------------------------------------------
  describe('findReceiptByPaymentId — cross-tenant guard', () => {
    it('returns null when DB row belongs to a different tenant', async () => {
      const { service } = await buildService({
        paymentReceiptFindUnique: {
          id: 'receipt-row-id',
          paymentId: PAYMENT_ID,
          tenantId: OTHER_TENANT_ID, // different tenant
          s3Key: S3_KEY,
          createdAt: new Date(),
        },
      });

      const result = await service.findReceiptByPaymentId(
        TENANT_ID,
        PAYMENT_ID,
      );

      expect(result).toBeNull();
    });

    it('returns receipt info when tenantId matches', async () => {
      const { service } = await buildService({
        paymentReceiptFindUnique: {
          id: 'receipt-row-id',
          paymentId: PAYMENT_ID,
          tenantId: TENANT_ID,
          s3Key: S3_KEY,
          createdAt: new Date(),
        },
      });

      const result = await service.findReceiptByPaymentId(
        TENANT_ID,
        PAYMENT_ID,
      );

      expect(result).not.toBeNull();
      expect(result!.s3Key).toBe(S3_KEY);
      expect(result!.receiptNumber).toBe('REC-2026-00001');
    });
  });

  // -------------------------------------------------------------------------
  // 6. streamReceipt delegates to StorageService
  // -------------------------------------------------------------------------
  describe('streamReceipt', () => {
    it('calls storage.getObjectStream with correct args', async () => {
      const mockStream = { pipe: jest.fn() };
      const { service, storage } = await buildService(
        {},
        { getObjectStream: mockStream },
      );

      const stream = await service.streamReceipt(TENANT_ID, S3_KEY);

      expect(storage.getObjectStream).toHaveBeenCalledWith(
        TENANT_ID,
        StorageKind.PaymentReceipt,
        S3_KEY,
      );
      expect(stream).toBe(mockStream);
    });
  });
});

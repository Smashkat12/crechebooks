import { Test, TestingModule } from '@nestjs/testing';
import { PaymentAttachmentJanitorJob } from '../payment-attachment-janitor.job';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { StorageKind } from '../../integrations/storage/storage.types';
import { PaymentAttachmentKind, PaymentAttachmentStatus } from '@prisma/client';

// Minimal stub rows that match the fields selected by the job
const makeRow = (
  overrides: Partial<{
    id: string;
    tenantId: string;
    s3Key: string;
    filename: string;
    kind: PaymentAttachmentKind;
    uploadedAt: Date;
  }> = {},
) => ({
  id: 'attach-1',
  tenantId: 'tenant-abc',
  s3Key: 'tenants/tenant-abc/proof-of-payments/file.pdf',
  filename: 'receipt.pdf',
  kind: PaymentAttachmentKind.PROOF_OF_PAYMENT,
  uploadedAt: new Date('2025-01-01T00:00:00Z'),
  ...overrides,
});

describe('PaymentAttachmentJanitorJob', () => {
  let job: PaymentAttachmentJanitorJob;
  let prisma: jest.Mocked<Pick<PrismaService, 'paymentAttachment'>>;
  let storageService: jest.Mocked<StorageService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const mockPrisma = {
      paymentAttachment: {
        findMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockStorageService = {
      deleteObject: jest.fn(),
    };

    const mockAuditLogService = {
      logDelete: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentAttachmentJanitorJob,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    job = module.get<PaymentAttachmentJanitorJob>(PaymentAttachmentJanitorJob);
    prisma = module.get(PrismaService);
    storageService = module.get(StorageService);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('purgeOrphanAttachments', () => {
    it('happy path: 3 stale PENDING rows → S3 deleted, audit logged, DB deleted, summary correct', async () => {
      const rows = [
        makeRow({
          id: 'a1',
          tenantId: 'tenant-1',
          s3Key: 'tenants/tenant-1/proof-of-payments/a.pdf',
        }),
        makeRow({
          id: 'a2',
          tenantId: 'tenant-1',
          s3Key: 'tenants/tenant-1/proof-of-payments/b.pdf',
        }),
        makeRow({
          id: 'a3',
          tenantId: 'tenant-2',
          s3Key: 'tenants/tenant-2/proof-of-payments/c.pdf',
        }),
      ];

      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue(rows);
      (storageService.deleteObject as jest.Mock).mockResolvedValue(undefined);
      (auditLogService.logDelete as jest.Mock).mockResolvedValue({} as never);
      (prisma.paymentAttachment.delete as jest.Mock).mockResolvedValue(
        {} as never,
      );

      const result = await job.purgeOrphanAttachments();

      expect(result).toEqual({ scanned: 3, deleted: 3, s3Errors: 0 });

      // Verify findMany queried for PENDING + cutoff
      expect(prisma.paymentAttachment.findMany).toHaveBeenCalledTimes(1);
      const findArgs = (prisma.paymentAttachment.findMany as jest.Mock).mock
        .calls[0][0];
      expect(findArgs.where.reviewStatus).toBe(PaymentAttachmentStatus.PENDING);
      expect(findArgs.where.uploadedAt.lt).toBeInstanceOf(Date);

      // S3 deleted for each row with correct tenantId and StorageKind
      expect(storageService.deleteObject).toHaveBeenCalledTimes(3);
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        'tenant-1',
        StorageKind.ProofOfPayment,
        'tenants/tenant-1/proof-of-payments/a.pdf',
      );

      // Audit logged for each row
      expect(auditLogService.logDelete).toHaveBeenCalledTimes(3);
      const auditCall = (auditLogService.logDelete as jest.Mock).mock
        .calls[0][0];
      expect(auditCall.entityType).toBe('PaymentAttachment');
      expect(auditCall.agentId).toBe('payment-attachment-janitor');
      expect(auditCall.userId).toBeUndefined();

      // DB row deleted for each
      expect(prisma.paymentAttachment.delete).toHaveBeenCalledTimes(3);
      expect(prisma.paymentAttachment.delete).toHaveBeenCalledWith({
        where: { id: 'a1' },
      });
    });

    it('S3 failure: row with S3 error → S3 error counted, DB row NOT deleted, continues to next row', async () => {
      const rows = [
        makeRow({
          id: 'fail-1',
          tenantId: 'tenant-A',
          s3Key: 'tenants/tenant-A/proof-of-payments/fail.pdf',
        }),
        makeRow({
          id: 'ok-2',
          tenantId: 'tenant-B',
          s3Key: 'tenants/tenant-B/proof-of-payments/ok.pdf',
        }),
      ];

      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue(rows);
      (storageService.deleteObject as jest.Mock)
        .mockRejectedValueOnce(new Error('S3 NoSuchBucket'))
        .mockResolvedValueOnce(undefined);
      (auditLogService.logDelete as jest.Mock).mockResolvedValue({} as never);
      (prisma.paymentAttachment.delete as jest.Mock).mockResolvedValue(
        {} as never,
      );

      const result = await job.purgeOrphanAttachments();

      expect(result).toEqual({ scanned: 2, deleted: 1, s3Errors: 1 });

      // S3 attempted for both
      expect(storageService.deleteObject).toHaveBeenCalledTimes(2);

      // DB delete only for the row that succeeded in S3
      expect(prisma.paymentAttachment.delete).toHaveBeenCalledTimes(1);
      expect(prisma.paymentAttachment.delete).toHaveBeenCalledWith({
        where: { id: 'ok-2' },
      });

      // Audit logged only for the successful row
      expect(auditLogService.logDelete).toHaveBeenCalledTimes(1);
      const auditCall = (auditLogService.logDelete as jest.Mock).mock
        .calls[0][0];
      expect(auditCall.entityId).toBe('ok-2');
    });

    it('no-rows case: returns {0, 0, 0} with no S3/DB/audit calls', async () => {
      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await job.purgeOrphanAttachments();

      expect(result).toEqual({ scanned: 0, deleted: 0, s3Errors: 0 });
      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(auditLogService.logDelete).not.toHaveBeenCalled();
      expect(prisma.paymentAttachment.delete).not.toHaveBeenCalled();
    });

    it('outer error (findMany throws): returns {0, 0, 0} and does not rethrow', async () => {
      (prisma.paymentAttachment.findMany as jest.Mock).mockRejectedValue(
        new Error('DB connection lost'),
      );

      const result = await job.purgeOrphanAttachments();

      expect(result).toEqual({ scanned: 0, deleted: 0, s3Errors: 0 });
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });
  });
});

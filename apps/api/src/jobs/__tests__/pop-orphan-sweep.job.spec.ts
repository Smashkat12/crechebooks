import { Test, TestingModule } from '@nestjs/testing';
import { PopOrphanSweepJob, OrphanSweepSummary } from '../pop-orphan-sweep.job';
import { PrismaService } from '../../database/prisma/prisma.service';
import { StorageService } from '../../integrations/storage/storage.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { StorageKind } from '../../integrations/storage/storage.types';

const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const OLD_DATE = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25h ago — orphan-eligible
const RECENT_DATE = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1h ago — not eligible

const makeS3Object = (key: string, lastModified: Date = OLD_DATE) => ({
  key,
  lastModified,
});

describe('PopOrphanSweepJob', () => {
  let job: PopOrphanSweepJob;
  let prisma: jest.Mocked<Pick<PrismaService, 'paymentAttachment'>>;
  let storageService: jest.Mocked<
    Pick<StorageService, 'listObjectsWithPrefix' | 'deleteObject'>
  >;
  let auditLogService: jest.Mocked<Pick<AuditLogService, 'logAction'>>;

  beforeEach(async () => {
    const mockPrisma = {
      paymentAttachment: {
        findMany: jest.fn(),
      },
    };

    const mockStorage = {
      listObjectsWithPrefix: jest.fn(),
      deleteObject: jest.fn(),
    };

    const mockAudit = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PopOrphanSweepJob,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: AuditLogService, useValue: mockAudit },
      ],
    }).compile();

    job = module.get<PopOrphanSweepJob>(PopOrphanSweepJob);
    prisma = module.get(PrismaService);
    storageService = module.get(StorageService);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('runSweep (dryRun=false)', () => {
    it('happy path: 2 orphan objects deleted, 1 registered skipped, 1 too-recent skipped', async () => {
      const registeredKey = `tenants/${TENANT_A}/proof-of-payments/reg-file.pdf`;
      const orphanKey1 = `tenants/${TENANT_A}/proof-of-payments/orphan-1.pdf`;
      const orphanKey2 = `tenants/${TENANT_B}/proof-of-payments/orphan-2.pdf`;
      const recentKey = `tenants/${TENANT_A}/proof-of-payments/recent.pdf`;

      (storageService.listObjectsWithPrefix as jest.Mock).mockResolvedValue([
        // Non-PoP object — should be filtered out
        makeS3Object(`tenants/${TENANT_A}/payslips/other.pdf`),
        makeS3Object(registeredKey), // registered — skip
        makeS3Object(orphanKey1), // orphan — delete
        makeS3Object(orphanKey2), // orphan — delete
        makeS3Object(recentKey, RECENT_DATE), // too recent — skip
      ]);

      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue([
        { s3Key: registeredKey },
      ]);

      (storageService.deleteObject as jest.Mock).mockResolvedValue(undefined);
      (auditLogService.logAction as jest.Mock).mockResolvedValue({});

      const result: OrphanSweepSummary = await job.runSweep({ dryRun: false });

      // scanned = 3 (PoP objects only: registered + orphan1 + orphan2 + recent)
      expect(result).toEqual({
        scanned: 4,
        orphans: 2,
        deleted: 2,
        s3Errors: 0,
      });

      // listObjectsWithPrefix called with 'tenants/'
      expect(storageService.listObjectsWithPrefix).toHaveBeenCalledTimes(1);
      expect(storageService.listObjectsWithPrefix).toHaveBeenCalledWith(
        'tenants/',
      );

      // deleteObject called for orphans only
      expect(storageService.deleteObject).toHaveBeenCalledTimes(2);
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        TENANT_A,
        StorageKind.ProofOfPayment,
        orphanKey1,
      );
      expect(storageService.deleteObject).toHaveBeenCalledWith(
        TENANT_B,
        StorageKind.ProofOfPayment,
        orphanKey2,
      );

      // audit logged for each deleted orphan
      expect(auditLogService.logAction).toHaveBeenCalledTimes(2);
      const auditCall = (auditLogService.logAction as jest.Mock).mock
        .calls[0][0];
      expect(auditCall.agentId).toBe('pop-orphan-sweep');
      expect(auditCall.entityType).toBe('S3OrphanObject');
      expect(auditCall.entityId).toBe(orphanKey1);
    });

    it('dry-run: orphans counted but not deleted or audit-logged', async () => {
      const orphanKey = `tenants/${TENANT_A}/proof-of-payments/orphan.pdf`;

      (storageService.listObjectsWithPrefix as jest.Mock).mockResolvedValue([
        makeS3Object(orphanKey),
      ]);

      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue([]);

      const result = await job.runSweep({ dryRun: true });

      expect(result).toEqual({
        scanned: 1,
        orphans: 1,
        deleted: 0,
        s3Errors: 0,
      });
      expect(storageService.deleteObject).not.toHaveBeenCalled();
      expect(auditLogService.logAction).not.toHaveBeenCalled();
    });

    it('S3 delete error: s3Errors incremented, DB audit NOT called for failed key, processing continues', async () => {
      const failKey = `tenants/${TENANT_A}/proof-of-payments/fail.pdf`;
      const okKey = `tenants/${TENANT_B}/proof-of-payments/ok.pdf`;

      (storageService.listObjectsWithPrefix as jest.Mock).mockResolvedValue([
        makeS3Object(failKey),
        makeS3Object(okKey),
      ]);

      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue([]);

      (storageService.deleteObject as jest.Mock)
        .mockRejectedValueOnce(new Error('AccessDenied'))
        .mockResolvedValueOnce(undefined);

      (auditLogService.logAction as jest.Mock).mockResolvedValue({});

      const result = await job.runSweep({ dryRun: false });

      expect(result).toEqual({
        scanned: 2,
        orphans: 2,
        deleted: 1,
        s3Errors: 1,
      });
      expect(storageService.deleteObject).toHaveBeenCalledTimes(2);
      // audit only for the successful delete
      expect(auditLogService.logAction).toHaveBeenCalledTimes(1);
      const call = (auditLogService.logAction as jest.Mock).mock.calls[0][0];
      expect(call.entityId).toBe(okKey);
    });

    it('no S3 objects: returns zero summary, no DB query', async () => {
      (storageService.listObjectsWithPrefix as jest.Mock).mockResolvedValue([]);

      const result = await job.runSweep({ dryRun: false });

      expect(result).toEqual({
        scanned: 0,
        orphans: 0,
        deleted: 0,
        s3Errors: 0,
      });
      // DB not queried when no PoP objects found
      expect(prisma.paymentAttachment.findMany).not.toHaveBeenCalled();
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });

    it('outer error (listObjectsWithPrefix throws): returns zero summary and does not rethrow', async () => {
      (storageService.listObjectsWithPrefix as jest.Mock).mockRejectedValue(
        new Error('S3 connection timeout'),
      );

      const result = await job.runSweep({ dryRun: false });

      expect(result).toEqual({
        scanned: 0,
        orphans: 0,
        deleted: 0,
        s3Errors: 0,
      });
      expect(storageService.deleteObject).not.toHaveBeenCalled();
    });

    it('audit failure is non-fatal: delete succeeds, summary counts delete even if audit throws', async () => {
      const orphanKey = `tenants/${TENANT_A}/proof-of-payments/audit-fail.pdf`;

      (storageService.listObjectsWithPrefix as jest.Mock).mockResolvedValue([
        makeS3Object(orphanKey),
      ]);
      (prisma.paymentAttachment.findMany as jest.Mock).mockResolvedValue([]);
      (storageService.deleteObject as jest.Mock).mockResolvedValue(undefined);
      (auditLogService.logAction as jest.Mock).mockRejectedValue(
        new Error('DB unavailable'),
      );

      const result = await job.runSweep({ dryRun: false });

      // deleted=1 even though audit failed
      expect(result).toEqual({
        scanned: 1,
        orphans: 1,
        deleted: 1,
        s3Errors: 0,
      });
    });
  });
});

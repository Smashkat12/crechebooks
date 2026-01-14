import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SarsSubmissionRepository } from '../../../src/database/repositories/sars-submission.repository';
import { CreateSarsSubmissionDto } from '../../../src/database/dto/sars-submission.dto';
import {
  SubmissionType,
  SubmissionStatus,
} from '../../../src/database/entities/sars-submission.entity';
import {
  NotFoundException,
  ConflictException,
  BusinessException,
} from '../../../src/shared/exceptions';
import { Tenant, User } from '@prisma/client';

describe('SarsSubmissionRepository', () => {
  let repository: SarsSubmissionRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

  // Real test data - South African SARS submission
  const testVat201Data: CreateSarsSubmissionDto = {
    tenantId: '', // Will be set in beforeEach
    submissionType: SubmissionType.VAT201,
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    deadline: new Date('2025-02-25'), // VAT due 25th of following month
    outputVatCents: 450000, // R4,500.00 output VAT
    inputVatCents: 180000, // R1,800.00 input VAT
    netVatCents: 270000, // R2,700.00 net VAT payable
    documentData: {
      lineItems: [{ description: 'School fees', amount: 3000000, vat: 450000 }],
    },
    notes: 'Monthly VAT return for January 2025',
  };

  const testEmp201Data: CreateSarsSubmissionDto = {
    tenantId: '', // Will be set in beforeEach
    submissionType: SubmissionType.EMP201,
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    deadline: new Date('2025-02-07'), // EMP201 due 7th of following month
    totalPayeCents: 248000, // R2,480.00 PAYE
    totalUifCents: 31000, // R310.00 UIF (employee + employer)
    totalSdlCents: 15500, // R155.00 SDL
    documentData: {
      employeeCount: 2,
      totalGross: 3100000,
    },
    notes: 'Monthly EMP201 for January 2025',
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, SarsSubmissionRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<SarsSubmissionRepository>(SarsSubmissionRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - sars_submissions and reconciliations depend on tenant and user!
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.statementLine.deleteMany({});
    await prisma.statement.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.creditBalance.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.categorizationMetric.deleteMany({});
    await prisma.categorizationJournal.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.calculationItemCache.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
        taxStatus: 'VAT_REGISTERED',
        vatNumber: '4123456789',
      },
    });

    // Create test user for submission tracking
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|test${Date.now()}`,
        email: `admin${Date.now()}@littlestars.co.za`,
        name: 'Test Admin',
        role: 'OWNER',
      },
    });

    // Update test data with created IDs
    testVat201Data.tenantId = testTenant.id;
    testEmp201Data.tenantId = testTenant.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create VAT201 submission with all fields', async () => {
      const submission = await repository.create(testVat201Data);

      expect(submission.id).toBeDefined();
      expect(submission.tenantId).toBe(testTenant.id);
      expect(submission.submissionType).toBe(SubmissionType.VAT201);
      expect(submission.outputVatCents).toBe(450000);
      expect(submission.inputVatCents).toBe(180000);
      expect(submission.netVatCents).toBe(270000);
      expect(submission.status).toBe(SubmissionStatus.DRAFT);
      expect(submission.isFinalized).toBe(false);
      expect(submission.submittedAt).toBeNull();
      expect(submission.submittedBy).toBeNull();
      expect(submission.sarsReference).toBeNull();
      expect(submission.documentData).toEqual(testVat201Data.documentData);
      expect(submission.notes).toBe(testVat201Data.notes);
      expect(submission.createdAt).toBeInstanceOf(Date);
    });

    it('should create EMP201 submission with payroll tax fields', async () => {
      const submission = await repository.create(testEmp201Data);

      expect(submission.id).toBeDefined();
      expect(submission.submissionType).toBe(SubmissionType.EMP201);
      expect(submission.totalPayeCents).toBe(248000);
      expect(submission.totalUifCents).toBe(31000);
      expect(submission.totalSdlCents).toBe(15500);
      expect(submission.outputVatCents).toBeNull();
      expect(submission.inputVatCents).toBeNull();
      expect(submission.netVatCents).toBeNull();
    });

    it('should create IRP5 submission', async () => {
      const irp5Data: CreateSarsSubmissionDto = {
        tenantId: testTenant.id,
        submissionType: SubmissionType.IRP5,
        periodStart: new Date('2025-03-01'),
        periodEnd: new Date('2026-02-28'),
        deadline: new Date('2026-05-31'),
        documentData: { taxYear: '2026', employeeCertificates: [] },
      };

      const submission = await repository.create(irp5Data);

      expect(submission.submissionType).toBe(SubmissionType.IRP5);
      expect(submission.status).toBe(SubmissionStatus.DRAFT);
    });

    it('should create submission with minimum required fields', async () => {
      const minimalData: CreateSarsSubmissionDto = {
        tenantId: testTenant.id,
        submissionType: SubmissionType.VAT201,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        deadline: new Date('2025-03-25'),
      };

      const submission = await repository.create(minimalData);

      expect(submission.id).toBeDefined();
      expect(submission.outputVatCents).toBeNull();
      expect(submission.inputVatCents).toBeNull();
      expect(submission.netVatCents).toBeNull();
      expect(submission.documentData).toEqual({});
      expect(submission.notes).toBeNull();
    });

    it('should default status to DRAFT', async () => {
      const submission = await repository.create(testVat201Data);
      expect(submission.status).toBe(SubmissionStatus.DRAFT);
    });

    it('should default isFinalized to false', async () => {
      const submission = await repository.create(testVat201Data);
      expect(submission.isFinalized).toBe(false);
    });

    it('should throw ConflictException for duplicate (tenantId, type, periodStart)', async () => {
      await repository.create(testVat201Data);

      await expect(repository.create(testVat201Data)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should allow same period for different submission types', async () => {
      await repository.create(testVat201Data);
      const emp201 = await repository.create(testEmp201Data);

      expect(emp201.id).toBeDefined();
    });

    it('should allow same type for different periods', async () => {
      await repository.create(testVat201Data);

      const nextMonth: CreateSarsSubmissionDto = {
        ...testVat201Data,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        deadline: new Date('2025-03-25'),
      };

      const submission = await repository.create(nextMonth);
      expect(submission.id).toBeDefined();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreateSarsSubmissionDto = {
        ...testVat201Data,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find submission by id', async () => {
      const created = await repository.create(testVat201Data);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.submissionType).toBe(SubmissionType.VAT201);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenantAndPeriod', () => {
    it('should find submission by unique key', async () => {
      await repository.create(testVat201Data);

      const found = await repository.findByTenantAndPeriod(
        testTenant.id,
        SubmissionType.VAT201,
        testVat201Data.periodStart,
      );

      expect(found).not.toBeNull();
      expect(found?.submissionType).toBe(SubmissionType.VAT201);
    });

    it('should return null when not found', async () => {
      const found = await repository.findByTenantAndPeriod(
        testTenant.id,
        SubmissionType.VAT201,
        new Date('2024-01-01'),
      );

      expect(found).toBeNull();
    });

    it('should distinguish between submission types', async () => {
      await repository.create(testVat201Data);
      await repository.create(testEmp201Data);

      const vat = await repository.findByTenantAndPeriod(
        testTenant.id,
        SubmissionType.VAT201,
        testVat201Data.periodStart,
      );

      const emp = await repository.findByTenantAndPeriod(
        testTenant.id,
        SubmissionType.EMP201,
        testEmp201Data.periodStart,
      );

      expect(vat?.submissionType).toBe(SubmissionType.VAT201);
      expect(emp?.submissionType).toBe(SubmissionType.EMP201);
    });
  });

  describe('findByTenantId', () => {
    it('should return all submissions for tenant', async () => {
      await repository.create(testVat201Data);
      await repository.create(testEmp201Data);

      const submissions = await repository.findByTenantId(testTenant.id);

      expect(submissions).toHaveLength(2);
    });

    it('should filter by submissionType', async () => {
      await repository.create(testVat201Data);
      await repository.create(testEmp201Data);

      const vat201Only = await repository.findByTenantId(testTenant.id, {
        submissionType: SubmissionType.VAT201,
      });

      expect(vat201Only).toHaveLength(1);
      expect(vat201Only[0].submissionType).toBe(SubmissionType.VAT201);
    });

    it('should filter by status', async () => {
      const submission = await repository.create(testVat201Data);
      await repository.markAsReady(submission.id);
      await repository.create(testEmp201Data);

      const ready = await repository.findByTenantId(testTenant.id, {
        status: SubmissionStatus.READY,
      });

      expect(ready).toHaveLength(1);
      expect(ready[0].status).toBe(SubmissionStatus.READY);
    });

    it('should filter by isFinalized', async () => {
      const submission = await repository.create(testVat201Data);
      await repository.markAsReady(submission.id);
      await repository.submit(submission.id, { submittedBy: testUser.id });
      await repository.acknowledge(submission.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(submission.id);

      await repository.create(testEmp201Data);

      const finalized = await repository.findByTenantId(testTenant.id, {
        isFinalized: true,
      });

      expect(finalized).toHaveLength(1);
      expect(finalized[0].isFinalized).toBe(true);
    });

    it('should order by periodStart descending', async () => {
      await repository.create(testVat201Data);
      await repository.create({
        ...testVat201Data,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        deadline: new Date('2025-03-25'),
      });

      const submissions = await repository.findByTenantId(testTenant.id);

      expect(submissions[0].periodStart.getMonth()).toBe(1); // February
      expect(submissions[1].periodStart.getMonth()).toBe(0); // January
    });
  });

  describe('findUpcomingDeadlines', () => {
    it('should find submissions with upcoming deadlines', async () => {
      // Create submission with deadline in next 7 days
      const now = new Date();
      const upcomingDeadline = new Date();
      upcomingDeadline.setDate(now.getDate() + 5);

      await repository.create({
        ...testVat201Data,
        deadline: upcomingDeadline,
      });

      const upcoming = await repository.findUpcomingDeadlines(7);

      expect(upcoming.length).toBeGreaterThanOrEqual(1);
    });

    it('should not include finalized submissions', async () => {
      const now = new Date();
      const upcomingDeadline = new Date();
      upcomingDeadline.setDate(now.getDate() + 5);

      const submission = await repository.create({
        ...testVat201Data,
        deadline: upcomingDeadline,
      });
      await repository.markAsReady(submission.id);
      await repository.submit(submission.id, { submittedBy: testUser.id });
      await repository.acknowledge(submission.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(submission.id);

      const upcoming = await repository.findUpcomingDeadlines(7);

      expect(upcoming.find((s) => s.id === submission.id)).toBeUndefined();
    });

    it('should not include already submitted submissions', async () => {
      const now = new Date();
      const upcomingDeadline = new Date();
      upcomingDeadline.setDate(now.getDate() + 5);

      const submission = await repository.create({
        ...testVat201Data,
        deadline: upcomingDeadline,
      });
      await repository.markAsReady(submission.id);
      await repository.submit(submission.id, { submittedBy: testUser.id });

      const upcoming = await repository.findUpcomingDeadlines(7);

      expect(upcoming.find((s) => s.id === submission.id)).toBeUndefined();
    });

    it('should order by deadline ascending', async () => {
      const now = new Date();
      const deadline1 = new Date();
      deadline1.setDate(now.getDate() + 7);
      const deadline2 = new Date();
      deadline2.setDate(now.getDate() + 3);

      await repository.create({
        ...testVat201Data,
        deadline: deadline1,
      });
      await repository.create({
        ...testEmp201Data,
        deadline: deadline2,
      });

      const upcoming = await repository.findUpcomingDeadlines(10);

      if (upcoming.length >= 2) {
        expect(upcoming[0].deadline.getTime()).toBeLessThanOrEqual(
          upcoming[1].deadline.getTime(),
        );
      }
    });
  });

  describe('update', () => {
    it('should update submission fields', async () => {
      const created = await repository.create(testVat201Data);

      const updated = await repository.update(created.id, {
        outputVatCents: 500000,
        notes: 'Updated notes',
      });

      expect(updated.outputVatCents).toBe(500000);
      expect(updated.notes).toBe('Updated notes');
      expect(updated.inputVatCents).toBe(180000); // Unchanged
    });

    it('should update documentData', async () => {
      const created = await repository.create(testVat201Data);

      const newDocumentData = { updated: true, items: [] };
      const updated = await repository.update(created.id, {
        documentData: newDocumentData,
      });

      expect(updated.documentData).toEqual(newDocumentData);
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          notes: 'test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if submission is finalized', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(
        repository.update(created.id, { notes: 'test' }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('markAsReady', () => {
    it('should transition DRAFT to READY', async () => {
      const created = await repository.create(testVat201Data);
      expect(created.status).toBe(SubmissionStatus.DRAFT);

      const ready = await repository.markAsReady(created.id);

      expect(ready.status).toBe(SubmissionStatus.READY);
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.markAsReady('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not DRAFT', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);

      await expect(repository.markAsReady(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw BusinessException if finalized', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      // Create new draft to try marking as ready on finalized
      const newDraft = await repository.create({
        ...testVat201Data,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
        deadline: new Date('2025-03-25'),
      });

      // Update to finalized via direct prisma (simulating data state)
      await prisma.sarsSubmission.update({
        where: { id: newDraft.id },
        data: { isFinalized: true },
      });

      await expect(repository.markAsReady(newDraft.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('submit', () => {
    it('should transition READY to SUBMITTED and set submitter', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);

      const submitted = await repository.submit(created.id, {
        submittedBy: testUser.id,
      });

      expect(submitted.status).toBe(SubmissionStatus.SUBMITTED);
      expect(submitted.submittedAt).toBeInstanceOf(Date);
      expect(submitted.submittedBy).toBe(testUser.id);
    });

    it('should set sarsReference if provided', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);

      const submitted = await repository.submit(created.id, {
        submittedBy: testUser.id,
        sarsReference: 'INITIAL-REF-001',
      });

      expect(submitted.sarsReference).toBe('INITIAL-REF-001');
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.submit('00000000-0000-0000-0000-000000000000', {
          submittedBy: testUser.id,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not READY', async () => {
      const created = await repository.create(testVat201Data);
      // Still DRAFT

      await expect(
        repository.submit(created.id, { submittedBy: testUser.id }),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw NotFoundException for non-existent submitter', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);

      await expect(
        repository.submit(created.id, {
          submittedBy: '00000000-0000-0000-0000-000000000000',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if finalized', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(
        repository.submit(created.id, { submittedBy: testUser.id }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('acknowledge', () => {
    it('should transition SUBMITTED to ACKNOWLEDGED and set sarsReference', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });

      const acknowledged = await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-VAT-00001',
      });

      expect(acknowledged.status).toBe(SubmissionStatus.ACKNOWLEDGED);
      expect(acknowledged.sarsReference).toBe('SARS-2025-VAT-00001');
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.acknowledge('00000000-0000-0000-0000-000000000000', {
          sarsReference: 'REF',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not SUBMITTED', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      // Still READY, not SUBMITTED

      await expect(
        repository.acknowledge(created.id, { sarsReference: 'REF' }),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('finalize', () => {
    it('should set isFinalized to true', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });

      const finalized = await repository.finalize(created.id);

      expect(finalized.isFinalized).toBe(true);
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.finalize('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not ACKNOWLEDGED', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      // Still SUBMITTED, not ACKNOWLEDGED

      await expect(repository.finalize(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw BusinessException if already finalized', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(repository.finalize(created.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('delete', () => {
    it('should delete existing DRAFT submission', async () => {
      const created = await repository.create(testVat201Data);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent submission', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not DRAFT', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw BusinessException if finalized', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('calculateVatTotals', () => {
    it('should calculate VAT totals for period', async () => {
      const submission1 = await repository.create(testVat201Data);
      await repository.markAsReady(submission1.id);

      const submission2 = await repository.create({
        ...testVat201Data,
        periodStart: new Date('2025-01-16'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-25'),
        outputVatCents: 200000,
        inputVatCents: 80000,
        netVatCents: 120000,
      });
      await repository.markAsReady(submission2.id);

      const totals = await repository.calculateVatTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalOutputVat).toBe(450000 + 200000);
      expect(totals.totalInputVat).toBe(180000 + 80000);
      expect(totals.totalNetVat).toBe(270000 + 120000);
    });

    it('should exclude DRAFT submissions from totals', async () => {
      await repository.create(testVat201Data); // DRAFT

      const readySubmission = await repository.create({
        ...testVat201Data,
        periodStart: new Date('2025-01-16'),
        periodEnd: new Date('2025-01-31'),
        deadline: new Date('2025-02-25'),
        outputVatCents: 200000,
        inputVatCents: 80000,
        netVatCents: 120000,
      });
      await repository.markAsReady(readySubmission.id);

      const totals = await repository.calculateVatTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      // Only ready submission counted
      expect(totals.totalOutputVat).toBe(200000);
    });

    it('should return zeros when no VAT201 submissions', async () => {
      await repository.create(testEmp201Data); // EMP201, not VAT201

      const totals = await repository.calculateVatTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalOutputVat).toBe(0);
      expect(totals.totalInputVat).toBe(0);
      expect(totals.totalNetVat).toBe(0);
    });
  });

  describe('calculatePayrollTaxTotals', () => {
    it('should calculate payroll tax totals for period', async () => {
      const submission1 = await repository.create(testEmp201Data);
      await repository.markAsReady(submission1.id);

      const totals = await repository.calculatePayrollTaxTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalPaye).toBe(248000);
      expect(totals.totalUif).toBe(31000);
      expect(totals.totalSdl).toBe(15500);
    });

    it('should exclude DRAFT submissions', async () => {
      await repository.create(testEmp201Data); // DRAFT

      const totals = await repository.calculatePayrollTaxTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalPaye).toBe(0);
    });

    it('should return zeros when no EMP201 submissions', async () => {
      await repository.create(testVat201Data); // VAT201, not EMP201

      const totals = await repository.calculatePayrollTaxTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalPaye).toBe(0);
      expect(totals.totalUif).toBe(0);
      expect(totals.totalSdl).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('should not return submissions from other tenants', async () => {
      await repository.create(testVat201Data);

      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@creche.co.za`,
        },
      });

      const submissions = await repository.findByTenantId(otherTenant.id);

      expect(submissions).toHaveLength(0);
    });
  });

  describe('status transitions', () => {
    it('should handle full DRAFT -> READY -> SUBMITTED -> ACKNOWLEDGED workflow', async () => {
      const created = await repository.create(testVat201Data);
      expect(created.status).toBe(SubmissionStatus.DRAFT);

      const ready = await repository.markAsReady(created.id);
      expect(ready.status).toBe(SubmissionStatus.READY);

      const submitted = await repository.submit(created.id, {
        submittedBy: testUser.id,
      });
      expect(submitted.status).toBe(SubmissionStatus.SUBMITTED);
      expect(submitted.submittedAt).toBeInstanceOf(Date);
      expect(submitted.submittedBy).toBe(testUser.id);

      const acknowledged = await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-VAT-00001',
      });
      expect(acknowledged.status).toBe(SubmissionStatus.ACKNOWLEDGED);
      expect(acknowledged.sarsReference).toBe('SARS-2025-VAT-00001');
    });

    it('should allow finalization after acknowledgment', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });

      const finalized = await repository.finalize(created.id);
      expect(finalized.isFinalized).toBe(true);
    });
  });

  describe('date handling', () => {
    it('should store periodStart, periodEnd, and deadline correctly', async () => {
      const submission = await repository.create(testVat201Data);

      // Compare dates without time portion (Prisma @db.Date strips time)
      const periodStart = new Date(submission.periodStart);
      const periodEnd = new Date(submission.periodEnd);
      const deadline = new Date(submission.deadline);

      expect(periodStart.getFullYear()).toBe(2025);
      expect(periodStart.getMonth()).toBe(0); // January
      expect(periodStart.getDate()).toBe(1);
      expect(periodEnd.getDate()).toBe(31);
      expect(deadline.getMonth()).toBe(1); // February
      expect(deadline.getDate()).toBe(25);
    });

    it('should store submittedAt correctly', async () => {
      const submission = await repository.create(testVat201Data);
      await repository.markAsReady(submission.id);

      const beforeSubmit = new Date();
      const submitted = await repository.submit(submission.id, {
        submittedBy: testUser.id,
      });
      const afterSubmit = new Date();

      expect(submitted.submittedAt).toBeInstanceOf(Date);
      expect(submitted.submittedAt!.getTime()).toBeGreaterThanOrEqual(
        beforeSubmit.getTime() - 1000, // Allow 1 second margin
      );
      expect(submitted.submittedAt!.getTime()).toBeLessThanOrEqual(
        afterSubmit.getTime() + 1000,
      );
    });
  });

  describe('JSONB documentData handling', () => {
    it('should store and retrieve complex documentData', async () => {
      const complexData = {
        lineItems: [
          { code: '001', description: 'School fees', amount: 3000000 },
          { code: '002', description: 'Transport', amount: 500000 },
        ],
        metadata: {
          preparedBy: 'John Doe',
          reviewedBy: 'Jane Smith',
          version: 2,
        },
        attachments: ['file1.pdf', 'file2.xlsx'],
      };

      const submission = await repository.create({
        ...testVat201Data,
        documentData: complexData,
      });

      expect(submission.documentData).toEqual(complexData);
    });

    it('should default to empty object when not provided', async () => {
      const submission = await repository.create({
        tenantId: testTenant.id,
        submissionType: SubmissionType.VAT201,
        periodStart: new Date('2025-03-01'),
        periodEnd: new Date('2025-03-31'),
        deadline: new Date('2025-04-25'),
      });

      expect(submission.documentData).toEqual({});
    });

    it('should update documentData preserving structure', async () => {
      const created = await repository.create(testVat201Data);

      const updatedData = {
        ...testVat201Data.documentData,
        newField: 'added',
      };

      const updated = await repository.update(created.id, {
        documentData: updatedData,
      });

      expect(updated.documentData).toEqual(updatedData);
    });
  });

  describe('immutability after finalization', () => {
    it('should prevent updates after finalization', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(
        repository.update(created.id, { notes: 'Changed after finalized' }),
      ).rejects.toThrow(BusinessException);
    });

    it('should prevent deletion after finalization', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(repository.delete(created.id)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should prevent re-submission after finalization', async () => {
      const created = await repository.create(testVat201Data);
      await repository.markAsReady(created.id);
      await repository.submit(created.id, { submittedBy: testUser.id });
      await repository.acknowledge(created.id, {
        sarsReference: 'SARS-2025-001',
      });
      await repository.finalize(created.id);

      await expect(
        repository.submit(created.id, { submittedBy: testUser.id }),
      ).rejects.toThrow(BusinessException);
    });
  });
});

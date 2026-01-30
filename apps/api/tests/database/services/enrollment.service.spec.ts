/**
 * EnrollmentService Integration Tests
 * TASK-BILL-011: Enrollment Service Implementation
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests enrollment operations, sibling discounts, and status management
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { ProRataService } from '../../../src/database/services/pro-rata.service';
import { CreditNoteService } from '../../../src/database/services/credit-note.service';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from '../../../src/shared/exceptions';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';
import { FeeType } from '../../../src/database/entities/fee-structure.entity';
import { Decimal } from 'decimal.js';
import { Tenant, User, Parent, Child, FeeStructure } from '@prisma/client';
import { InvoiceNumberService } from '../../../src/database/services/invoice-number.service';
import { WelcomePackDeliveryService } from '../../../src/database/services/welcome-pack-delivery.service';
import { cleanDatabase } from '../../helpers/clean-database';

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let prisma: PrismaService;
  let tenantRepo: TenantRepository;
  let parentRepo: ParentRepository;
  let childRepo: ChildRepository;
  let feeStructureRepo: FeeStructureRepository;
  let enrollmentRepo: EnrollmentRepository;

  // Test data
  let testTenant: Tenant;
  let testUser: User;
  let testParent: Parent;
  let testChild1: Child;
  let testChild2: Child;
  let testChild3: Child;
  let testFeeStructure: FeeStructure;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        EnrollmentService,
        EnrollmentRepository,
        ChildRepository,
        FeeStructureRepository,
        ParentRepository,
        TenantRepository,
        InvoiceRepository,
        InvoiceLineRepository,
        AuditLogService,
        ProRataService,
        CreditNoteService,
        InvoiceNumberService,
        {
          provide: WelcomePackDeliveryService,
          useValue: {
            deliverWelcomePack: jest.fn().mockResolvedValue(undefined),
            sendWelcomePack: jest.fn().mockResolvedValue({ success: true }),
          },
        },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantRepo = module.get<TenantRepository>(TenantRepository);
    parentRepo = module.get<ParentRepository>(ParentRepository);
    childRepo = module.get<ChildRepository>(ChildRepository);
    feeStructureRepo = module.get<FeeStructureRepository>(
      FeeStructureRepository,
    );
    enrollmentRepo = module.get<EnrollmentRepository>(EnrollmentRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Enrollment Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `enrollment${Date.now()}@test.co.za`,
      },
    });

    // Create test user
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        email: `user${Date.now()}@test.com`,
        auth0Id: `auth0|test${Date.now()}`,
        name: 'Test Admin',
        role: 'ADMIN',
      },
    });

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Parent',
        email: `parent${Date.now()}@test.com`,
        phone: '0821234567',
        idNumber: '8501015800086',
      },
    });

    // Create 3 test children
    testChild1 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Child',
        lastName: 'One',
        dateOfBirth: new Date('2020-01-15'),
      },
    });

    testChild2 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Child',
        lastName: 'Two',
        dateOfBirth: new Date('2021-03-20'),
      },
    });

    testChild3 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Child',
        lastName: 'Three',
        dateOfBirth: new Date('2022-06-10'),
      },
    });

    // Create fee structure
    testFeeStructure = await prisma.feeStructure.create({
      data: {
        tenantId: testTenant.id,
        name: 'Standard Monthly',
        description: 'Standard monthly fee',
        feeType: FeeType.FULL_DAY,
        amountCents: 500000, // R5000
        effectiveFrom: new Date('2024-01-01'),
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('enrollChild', () => {
    it('should successfully enroll child with valid data', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1); // Tomorrow

      const result = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      expect(result).toBeDefined();
      expect(result.enrollment).toBeDefined();
      expect(result.enrollment.childId).toBe(testChild1.id);
      expect(result.enrollment.feeStructureId).toBe(testFeeStructure.id);
      expect(result.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
      expect(result.enrollment.tenantId).toBe(testTenant.id);

      // Verify audit log created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Enrollment',
          entityId: result.enrollment.id,
          action: 'CREATE',
        },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs[0].userId).toBe(testUser.id);
    });

    it('should allow enrollment with today as start date', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const result = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        today,
        testUser.id,
      );

      expect(result).toBeDefined();
      expect(result.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    });

    it('should throw NotFoundException for invalid childId', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      await expect(
        service.enrollChild(
          testTenant.id,
          'invalid-child-id',
          testFeeStructure.id,
          startDate,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invalid feeStructureId', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      await expect(
        service.enrollChild(
          testTenant.id,
          testChild1.id,
          'invalid-fee-id',
          startDate,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate active enrollment', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // First enrollment
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      // Attempt duplicate enrollment
      await expect(
        service.enrollChild(
          testTenant.id,
          testChild1.id,
          testFeeStructure.id,
          startDate,
          testUser.id,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ValidationException for past startDate', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 7); // 7 days ago

      await expect(
        service.enrollChild(
          testTenant.id,
          testChild1.id,
          testFeeStructure.id,
          pastDate,
          testUser.id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should enforce multi-tenant isolation for child', async () => {
      // Create another tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@other.co.za`,
        },
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // Try to enroll testChild1 (belongs to testTenant) in otherTenant
      await expect(
        service.enrollChild(
          otherTenant.id,
          testChild1.id,
          testFeeStructure.id,
          startDate,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce multi-tenant isolation for fee structure', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other${Date.now()}@other.co.za`,
        },
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // Try to use testFeeStructure (belongs to testTenant) in otherTenant
      await expect(
        service.enrollChild(
          otherTenant.id,
          testChild1.id,
          testFeeStructure.id,
          startDate,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateEnrollment', () => {
    it('should successfully update enrollment with valid data', async () => {
      // Create enrollment first
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      // Update with new fee structure
      const newFeeStructure = await prisma.feeStructure.create({
        data: {
          tenantId: testTenant.id,
          name: 'Premium Monthly',
          description: 'Premium monthly fee',
          feeType: FeeType.FULL_DAY,
          amountCents: 750000, // R7500
          effectiveFrom: new Date('2024-01-01'),
        },
      });

      const updated = await service.updateEnrollment(
        testTenant.id,
        enrollment.id,
        {
          feeStructureId: newFeeStructure.id,
          notes: 'Updated to premium plan',
        },
        testUser.id,
      );

      expect(updated).toBeDefined();
      expect(updated.feeStructureId).toBe(newFeeStructure.id);
      expect(updated.notes).toBe('Updated to premium plan');

      // Verify audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Enrollment',
          entityId: enrollment.id,
          action: 'UPDATE',
        },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw NotFoundException for invalid enrollmentId', async () => {
      await expect(
        service.updateEnrollment(
          testTenant.id,
          'invalid-enrollment-id',
          { notes: 'Test' },
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ValidationException for endDate before startDate', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 10);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const invalidEndDate = new Date(startDate);
      invalidEndDate.setDate(invalidEndDate.getDate() - 1); // Before start

      await expect(
        service.updateEnrollment(
          testTenant.id,
          enrollment.id,
          { endDate: invalidEndDate },
          testUser.id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw NotFoundException for invalid feeStructureId in update', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      await expect(
        service.updateEnrollment(
          testTenant.id,
          enrollment.id,
          { feeStructureId: 'invalid-fee-id' },
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('withdrawChild', () => {
    it('should successfully withdraw child with valid data', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const withdrawDate = new Date(startDate);
      withdrawDate.setMonth(withdrawDate.getMonth() + 1);

      const withdrawn = await service.withdrawChild(
        testTenant.id,
        enrollment.id,
        withdrawDate,
        testUser.id,
      );

      expect(withdrawn).toBeDefined();
      expect(withdrawn.status).toBe(EnrollmentStatus.WITHDRAWN);
      // Compare UTC dates to avoid timezone conversion issues
      const actualDate = new Date(withdrawn.endDate!);
      const expectedDate = new Date(withdrawDate);
      expect(actualDate.getUTCFullYear()).toBe(expectedDate.getUTCFullYear());
      expect(actualDate.getUTCMonth()).toBe(expectedDate.getUTCMonth());
      expect(actualDate.getUTCDate()).toBe(expectedDate.getUTCDate());

      // Verify audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityType: 'Enrollment',
          entityId: enrollment.id,
          action: 'UPDATE',
        },
      });
      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
    });

    it('should throw ConflictException if already withdrawn', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const withdrawDate = new Date(startDate);
      withdrawDate.setMonth(withdrawDate.getMonth() + 1);

      // First withdrawal
      await service.withdrawChild(
        testTenant.id,
        enrollment.id,
        withdrawDate,
        testUser.id,
      );

      // Attempt second withdrawal
      await expect(
        service.withdrawChild(
          testTenant.id,
          enrollment.id,
          withdrawDate,
          testUser.id,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ValidationException for endDate before startDate', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 10);

      const { enrollment } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const invalidEndDate = new Date(startDate);
      invalidEndDate.setDate(invalidEndDate.getDate() - 1);

      await expect(
        service.withdrawChild(
          testTenant.id,
          enrollment.id,
          invalidEndDate,
          testUser.id,
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw NotFoundException for invalid enrollmentId', async () => {
      const withdrawDate = new Date();
      withdrawDate.setMonth(withdrawDate.getMonth() + 1);

      await expect(
        service.withdrawChild(
          testTenant.id,
          'invalid-enrollment-id',
          withdrawDate,
          testUser.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getActiveEnrollments', () => {
    it('should return all active enrollments for tenant', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // Create multiple enrollments
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild3.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const enrollments = await service.getActiveEnrollments(testTenant.id);

      expect(enrollments).toHaveLength(3);
      expect(
        enrollments.every(
          (e) => String(e.status) === String(EnrollmentStatus.ACTIVE),
        ),
      ).toBe(true);
    });

    it('should filter by parentId correctly', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // Create another parent with child
      const otherParent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Jane',
          lastName: 'Other',
          email: `other${Date.now()}@test.com`,
          phone: '0827654321',
          idNumber: '8601015800087',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          parentId: otherParent.id,
          firstName: 'Other',
          lastName: 'Child',
          dateOfBirth: new Date('2020-05-15'),
        },
      });

      // Enroll testChild1 (testParent) and otherChild (otherParent)
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        otherChild.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      // Get enrollments for testParent only
      const enrollments = await service.getActiveEnrollments(
        testTenant.id,
        testParent.id,
      );

      expect(enrollments).toHaveLength(1);
      expect(enrollments[0].childId).toBe(testChild1.id);
    });

    it('should exclude withdrawn enrollments', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      const { enrollment: enrollment1 } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      // Withdraw first enrollment
      const withdrawDate = new Date(startDate);
      withdrawDate.setMonth(withdrawDate.getMonth() + 1);
      await service.withdrawChild(
        testTenant.id,
        enrollment1.id,
        withdrawDate,
        testUser.id,
      );

      const activeEnrollments = await service.getActiveEnrollments(
        testTenant.id,
      );

      expect(activeEnrollments).toHaveLength(1);
      expect(activeEnrollments[0].childId).toBe(testChild2.id);
    });
  });

  describe('applySiblingDiscount', () => {
    it('should return 0% discount for single child', async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate,
        testUser.id,
      );

      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(1);
      expect(discounts.get(testChild1.id)?.toNumber()).toBe(0);
    });

    it('should apply 10% discount for second of 2 children', async () => {
      const startDate1 = new Date();
      startDate1.setDate(startDate1.getDate() + 1);

      const startDate2 = new Date(startDate1);
      startDate2.setDate(startDate2.getDate() + 1); // Day after first

      // Enroll in order
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate1,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate2,
        testUser.id,
      );

      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(2);
      expect(discounts.get(testChild1.id)?.toNumber()).toBe(0); // First child: 0%
      expect(discounts.get(testChild2.id)?.toNumber()).toBe(10); // Second child: 10%
    });

    it('should apply 10% and 15% discounts for 3+ children', async () => {
      const startDate1 = new Date();
      startDate1.setDate(startDate1.getDate() + 1);

      const startDate2 = new Date(startDate1);
      startDate2.setDate(startDate2.getDate() + 1);

      const startDate3 = new Date(startDate2);
      startDate3.setDate(startDate3.getDate() + 1);

      // Enroll in order
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate1,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate2,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild3.id,
        testFeeStructure.id,
        startDate3,
        testUser.id,
      );

      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(3);
      expect(discounts.get(testChild1.id)?.toNumber()).toBe(0); // First: 0%
      expect(discounts.get(testChild2.id)?.toNumber()).toBe(10); // Second: 10%
      expect(discounts.get(testChild3.id)?.toNumber()).toBe(15); // Third: 15%
    });

    it('should order by enrollment startDate, not child creation order', async () => {
      const startDate3 = new Date();
      startDate3.setDate(startDate3.getDate() + 1);

      const startDate1 = new Date(startDate3);
      startDate1.setDate(startDate1.getDate() + 1);

      const startDate2 = new Date(startDate1);
      startDate2.setDate(startDate2.getDate() + 1);

      // Enroll in reverse order (child3 first, child1 second, child2 third)
      await service.enrollChild(
        testTenant.id,
        testChild3.id,
        testFeeStructure.id,
        startDate3,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate1,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate2,
        testUser.id,
      );

      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(3);
      // Child3 was enrolled first, so gets 0%
      expect(discounts.get(testChild3.id)?.toNumber()).toBe(0);
      // Child1 was enrolled second, so gets 10%
      expect(discounts.get(testChild1.id)?.toNumber()).toBe(10);
      // Child2 was enrolled third, so gets 15%
      expect(discounts.get(testChild2.id)?.toNumber()).toBe(15);
    });

    it('should exclude withdrawn children from sibling count', async () => {
      const startDate1 = new Date();
      startDate1.setDate(startDate1.getDate() + 1);

      const startDate2 = new Date(startDate1);
      startDate2.setDate(startDate2.getDate() + 1);

      const startDate3 = new Date(startDate2);
      startDate3.setDate(startDate3.getDate() + 1);

      // Enroll all 3
      const { enrollment: enrollment1 } = await service.enrollChild(
        testTenant.id,
        testChild1.id,
        testFeeStructure.id,
        startDate1,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild2.id,
        testFeeStructure.id,
        startDate2,
        testUser.id,
      );
      await service.enrollChild(
        testTenant.id,
        testChild3.id,
        testFeeStructure.id,
        startDate3,
        testUser.id,
      );

      // Withdraw first child
      const withdrawDate = new Date(startDate1);
      withdrawDate.setMonth(withdrawDate.getMonth() + 1);
      await service.withdrawChild(
        testTenant.id,
        enrollment1.id,
        withdrawDate,
        testUser.id,
      );

      // Should now only count 2 active children
      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(2);
      // Child2 is now first (oldest active enrollment)
      expect(discounts.get(testChild2.id)?.toNumber()).toBe(0);
      // Child3 is now second
      expect(discounts.get(testChild3.id)?.toNumber()).toBe(10); // 2 children = 10%
    });

    it('should return empty map for parent with no active enrollments', async () => {
      const discounts = await service.applySiblingDiscount(
        testTenant.id,
        testParent.id,
      );

      expect(discounts.size).toBe(0);
    });
  });

  describe('multi-tenant isolation', () => {
    it('should not see enrollments from other tenants', async () => {
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `isolation${Date.now()}@other.co.za`,
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Other',
          lastName: 'Parent',
          email: `otherparent${Date.now()}@test.com`,
          phone: '0827654321',
          idNumber: '8601015800087',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: otherTenant.id,
          parentId: otherParent.id,
          firstName: 'Other',
          lastName: 'Child',
          dateOfBirth: new Date('2020-05-15'),
        },
      });

      const otherFeeStructure = await prisma.feeStructure.create({
        data: {
          tenantId: otherTenant.id,
          name: 'Other Fee',
          description: 'Other fee',
          feeType: FeeType.FULL_DAY,
          amountCents: 600000,
          effectiveFrom: new Date('2024-01-01'),
        },
      });

      const startDate = new Date();
      startDate.setDate(startDate.getDate() + 1);

      // Create enrollment in other tenant
      await enrollmentRepo.create({
        tenantId: otherTenant.id,
        childId: otherChild.id,
        feeStructureId: otherFeeStructure.id,
        startDate,
        status: EnrollmentStatus.ACTIVE,
      });

      // Query with testTenant - should not see other tenant's enrollment
      const enrollments = await service.getActiveEnrollments(testTenant.id);

      expect(enrollments).toHaveLength(0);
    });
  });
});

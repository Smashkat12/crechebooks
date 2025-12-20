import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayrollRepository } from '../../../src/database/repositories/payroll.repository';
import { CreatePayrollDto } from '../../../src/database/dto/payroll.dto';
import { PayrollStatus } from '../../../src/database/entities/payroll.entity';
import { EmploymentType, PayFrequency } from '../../../src/database/entities/staff.entity';
import {
  NotFoundException,
  ConflictException,
  BusinessException,
} from '../../../src/shared/exceptions';
import { Tenant, Staff } from '@prisma/client';

describe('PayrollRepository', () => {
  let repository: PayrollRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testStaff: Staff;

  // Real test data - South African payroll
  const testPayrollData: CreatePayrollDto = {
    tenantId: '', // Will be set in beforeEach
    staffId: '', // Will be set in beforeEach
    payPeriodStart: new Date('2025-01-01'),
    payPeriodEnd: new Date('2025-01-31'),
    basicSalaryCents: 1500000, // R15,000.00
    overtimeCents: 50000, // R500.00
    bonusCents: 0,
    otherEarningsCents: 0,
    grossSalaryCents: 1550000, // R15,500.00
    payeCents: 248000, // R2,480.00 PAYE
    uifEmployeeCents: 15500, // R155.00
    uifEmployerCents: 15500, // R155.00
    otherDeductionsCents: 0,
    netSalaryCents: 1286500, // R12,865.00
    medicalAidCreditCents: 34700, // R347.00 for 3 members
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayrollRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<PayrollRepository>(PayrollRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.sarsSubmission.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
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
      },
    });

    // Create test staff
    testStaff = await prisma.staff.create({
      data: {
        tenantId: testTenant.id,
        employeeNumber: 'EMP-001',
        firstName: 'Thabo',
        lastName: 'Modise',
        idNumber: '8501015800084',
        taxNumber: '1234567890',
        email: 'thabo@littlestars.co.za',
        phone: '+27821234567',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2024-01-15'),
        employmentType: EmploymentType.PERMANENT,
        payFrequency: PayFrequency.MONTHLY,
        basicSalaryCents: 1500000,
        bankName: 'First National Bank',
        bankAccount: '62123456789',
        bankBranchCode: '250655',
        medicalAidMembers: 3,
      },
    });

    // Update test data with created IDs
    testPayrollData.tenantId = testTenant.id;
    testPayrollData.staffId = testStaff.id;
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create payroll with all fields', async () => {
      const payroll = await repository.create(testPayrollData);

      expect(payroll.id).toBeDefined();
      expect(payroll.tenantId).toBe(testTenant.id);
      expect(payroll.staffId).toBe(testStaff.id);
      expect(payroll.basicSalaryCents).toBe(1500000);
      expect(payroll.overtimeCents).toBe(50000);
      expect(payroll.grossSalaryCents).toBe(1550000);
      expect(payroll.payeCents).toBe(248000);
      expect(payroll.uifEmployeeCents).toBe(15500);
      expect(payroll.uifEmployerCents).toBe(15500);
      expect(payroll.netSalaryCents).toBe(1286500);
      expect(payroll.medicalAidCreditCents).toBe(34700);
      expect(payroll.status).toBe(PayrollStatus.DRAFT);
      expect(payroll.paymentDate).toBeNull();
      expect(payroll.createdAt).toBeInstanceOf(Date);
    });

    it('should create payroll with minimum required fields', async () => {
      const minimalData: CreatePayrollDto = {
        tenantId: testTenant.id,
        staffId: testStaff.id,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
        basicSalaryCents: 1500000,
        grossSalaryCents: 1500000,
        payeCents: 240000,
        uifEmployeeCents: 15000,
        uifEmployerCents: 15000,
        netSalaryCents: 1245000,
      };

      const payroll = await repository.create(minimalData);

      expect(payroll.id).toBeDefined();
      expect(payroll.overtimeCents).toBe(0);
      expect(payroll.bonusCents).toBe(0);
      expect(payroll.otherEarningsCents).toBe(0);
      expect(payroll.otherDeductionsCents).toBe(0);
      expect(payroll.medicalAidCreditCents).toBe(0);
    });

    it('should default status to DRAFT', async () => {
      const payroll = await repository.create(testPayrollData);
      expect(payroll.status).toBe(PayrollStatus.DRAFT);
    });

    it('should throw ConflictException for duplicate period per staff', async () => {
      await repository.create(testPayrollData);

      await expect(repository.create(testPayrollData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      const invalidData: CreatePayrollDto = {
        ...testPayrollData,
        staffId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const invalidData: CreatePayrollDto = {
        ...testPayrollData,
        tenantId: '00000000-0000-0000-0000-000000000000',
      };

      await expect(repository.create(invalidData)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findById', () => {
    it('should find payroll by id', async () => {
      const created = await repository.create(testPayrollData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.netSalaryCents).toBe(testPayrollData.netSalaryCents);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
      );
      expect(found).toBeNull();
    });
  });

  describe('findByTenantStaffPeriod', () => {
    it('should find payroll by unique key', async () => {
      await repository.create(testPayrollData);

      const found = await repository.findByTenantStaffPeriod(
        testTenant.id,
        testStaff.id,
        testPayrollData.payPeriodStart,
      );

      expect(found).not.toBeNull();
      expect(found?.staffId).toBe(testStaff.id);
    });

    it('should return null when not found', async () => {
      const found = await repository.findByTenantStaffPeriod(
        testTenant.id,
        testStaff.id,
        new Date('2024-01-01'),
      );

      expect(found).toBeNull();
    });
  });

  describe('findByStaffId', () => {
    it('should return all payroll for staff', async () => {
      // Create multiple payroll records
      await repository.create(testPayrollData);
      await repository.create({
        ...testPayrollData,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
      });

      const payrolls = await repository.findByStaffId(testStaff.id);

      expect(payrolls).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const payroll1 = await repository.create(testPayrollData);
      await repository.create({
        ...testPayrollData,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
      });

      // Approve one
      await repository.approve(payroll1.id);

      const approved = await repository.findByStaffId(testStaff.id, {
        status: PayrollStatus.APPROVED,
      });

      expect(approved).toHaveLength(1);
      expect(approved[0].status).toBe(PayrollStatus.APPROVED);
    });

    it('should order by payPeriodStart descending', async () => {
      await repository.create(testPayrollData);
      await repository.create({
        ...testPayrollData,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
      });

      const payrolls = await repository.findByStaffId(testStaff.id);

      expect(payrolls[0].payPeriodStart.getMonth()).toBe(1); // February
      expect(payrolls[1].payPeriodStart.getMonth()).toBe(0); // January
    });
  });

  describe('findByTenantId', () => {
    it('should return all payroll for tenant', async () => {
      await repository.create(testPayrollData);

      const payrolls = await repository.findByTenantId(testTenant.id);

      expect(payrolls).toHaveLength(1);
    });

    it('should filter by staffId', async () => {
      // Create another staff
      const otherStaff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Lerato',
          lastName: 'Dlamini',
          idNumber: '9001015800088',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-03-01'),
          employmentType: EmploymentType.PERMANENT,
          basicSalaryCents: 1200000,
        },
      });

      await repository.create(testPayrollData);
      await repository.create({
        ...testPayrollData,
        staffId: otherStaff.id,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
      });

      const filtered = await repository.findByTenantId(testTenant.id, {
        staffId: testStaff.id,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].staffId).toBe(testStaff.id);
    });

    it('should filter by status', async () => {
      const payroll = await repository.create(testPayrollData);
      await repository.approve(payroll.id);

      const drafts = await repository.findByTenantId(testTenant.id, {
        status: PayrollStatus.DRAFT,
      });
      const approved = await repository.findByTenantId(testTenant.id, {
        status: PayrollStatus.APPROVED,
      });

      expect(drafts).toHaveLength(0);
      expect(approved).toHaveLength(1);
    });
  });

  describe('findByPeriod', () => {
    it('should find payroll within period range', async () => {
      await repository.create(testPayrollData);
      await repository.create({
        ...testPayrollData,
        payPeriodStart: new Date('2025-02-01'),
        payPeriodEnd: new Date('2025-02-28'),
      });

      const payrolls = await repository.findByPeriod(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(payrolls).toHaveLength(1);
    });

    it('should return empty when no payroll in range', async () => {
      await repository.create(testPayrollData);

      const payrolls = await repository.findByPeriod(
        testTenant.id,
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      );

      expect(payrolls).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update payroll fields', async () => {
      const created = await repository.create(testPayrollData);

      const updated = await repository.update(created.id, {
        overtimeCents: 100000, // R1000
      });

      expect(updated.overtimeCents).toBe(100000);
      expect(updated.basicSalaryCents).toBe(1500000); // Unchanged
    });

    it('should throw NotFoundException for non-existent payroll', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', {
          overtimeCents: 100000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if status is PAID', async () => {
      const created = await repository.create(testPayrollData);
      await repository.approve(created.id);
      await repository.markAsPaid(created.id, new Date('2025-01-25'));

      await expect(
        repository.update(created.id, { overtimeCents: 100000 }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('approve', () => {
    it('should transition DRAFT to APPROVED', async () => {
      const created = await repository.create(testPayrollData);
      expect(created.status).toBe(PayrollStatus.DRAFT);

      const approved = await repository.approve(created.id);

      expect(approved.status).toBe(PayrollStatus.APPROVED);
    });

    it('should throw NotFoundException for non-existent payroll', async () => {
      await expect(
        repository.approve('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not DRAFT', async () => {
      const created = await repository.create(testPayrollData);
      await repository.approve(created.id);

      await expect(repository.approve(created.id)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('markAsPaid', () => {
    it('should transition APPROVED to PAID and set paymentDate', async () => {
      const created = await repository.create(testPayrollData);
      await repository.approve(created.id);

      const paymentDate = new Date('2025-01-25');
      const paid = await repository.markAsPaid(created.id, paymentDate);

      expect(paid.status).toBe(PayrollStatus.PAID);
      expect(paid.paymentDate).toEqual(paymentDate);
    });

    it('should throw NotFoundException for non-existent payroll', async () => {
      await expect(
        repository.markAsPaid(
          '00000000-0000-0000-0000-000000000000',
          new Date(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException if not APPROVED', async () => {
      const created = await repository.create(testPayrollData);

      await expect(
        repository.markAsPaid(created.id, new Date()),
      ).rejects.toThrow(BusinessException);
    });

    it('should not allow paying DRAFT', async () => {
      const created = await repository.create(testPayrollData);
      // Don't approve - stays DRAFT

      await expect(
        repository.markAsPaid(created.id, new Date()),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('delete', () => {
    it('should delete existing payroll', async () => {
      const created = await repository.create(testPayrollData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent payroll', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if status is PAID', async () => {
      const created = await repository.create(testPayrollData);
      await repository.approve(created.id);
      await repository.markAsPaid(created.id, new Date('2025-01-25'));

      await expect(repository.delete(created.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('calculatePeriodTotals', () => {
    it('should calculate totals for period', async () => {
      const payroll1 = await repository.create(testPayrollData);
      await repository.approve(payroll1.id);

      const payroll2 = await repository.create({
        ...testPayrollData,
        payPeriodStart: new Date('2025-01-16'),
        payPeriodEnd: new Date('2025-01-31'),
        grossSalaryCents: 800000,
        payeCents: 120000,
        uifEmployeeCents: 8000,
        uifEmployerCents: 8000,
        netSalaryCents: 672000,
      });
      await repository.approve(payroll2.id);

      // Create another staff to have a second payroll
      const otherStaff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Lerato',
          lastName: 'Dlamini',
          idNumber: '9001015800088',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-03-01'),
          employmentType: EmploymentType.PERMANENT,
          basicSalaryCents: 1200000,
        },
      });

      // We already have two payrolls for testStaff - use unique period for other staff
      const payroll3 = await repository.create({
        ...testPayrollData,
        staffId: otherStaff.id,
      });
      await repository.approve(payroll3.id);

      const totals = await repository.calculatePeriodTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      expect(totals.totalGross).toBe(1550000 + 800000 + 1550000);
      expect(totals.totalPaye).toBe(248000 + 120000 + 248000);
      expect(totals.totalUifEmployee).toBe(15500 + 8000 + 15500);
      expect(totals.totalUifEmployer).toBe(15500 + 8000 + 15500);
    });

    it('should exclude DRAFT payroll from totals', async () => {
      // Create DRAFT payroll
      await repository.create(testPayrollData);

      // Create another staff for APPROVED payroll
      const otherStaff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Lerato',
          lastName: 'Dlamini',
          idNumber: '9001015800088',
          dateOfBirth: new Date('1990-01-01'),
          startDate: new Date('2024-03-01'),
          employmentType: EmploymentType.PERMANENT,
          basicSalaryCents: 1200000,
        },
      });

      // Create and approve payroll for other staff
      const approvedPayroll = await repository.create({
        ...testPayrollData,
        staffId: otherStaff.id,
      });
      await repository.approve(approvedPayroll.id);

      const totals = await repository.calculatePeriodTotals(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31'),
      );

      // Only approved payroll counted
      expect(totals.totalGross).toBe(1550000);
    });

    it('should return zeros when no payroll in period', async () => {
      const totals = await repository.calculatePeriodTotals(
        testTenant.id,
        new Date('2024-01-01'),
        new Date('2024-12-31'),
      );

      expect(totals.totalGross).toBe(0);
      expect(totals.totalPaye).toBe(0);
      expect(totals.totalUifEmployee).toBe(0);
      expect(totals.totalUifEmployer).toBe(0);
      expect(totals.totalNet).toBe(0);
    });
  });

  describe('tenant isolation', () => {
    it('should not return payroll from other tenants', async () => {
      await repository.create(testPayrollData);

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

      const payrolls = await repository.findByTenantId(otherTenant.id);

      expect(payrolls).toHaveLength(0);
    });
  });

  describe('all PayrollStatus values', () => {
    it('should handle DRAFT, APPROVED, PAID transitions', async () => {
      const created = await repository.create(testPayrollData);
      expect(created.status).toBe(PayrollStatus.DRAFT);

      const approved = await repository.approve(created.id);
      expect(approved.status).toBe(PayrollStatus.APPROVED);

      const paid = await repository.markAsPaid(created.id, new Date('2025-01-25'));
      expect(paid.status).toBe(PayrollStatus.PAID);
    });
  });

  describe('date handling', () => {
    it('should store payPeriodStart and payPeriodEnd correctly', async () => {
      const payroll = await repository.create(testPayrollData);

      expect(payroll.payPeriodStart.getFullYear()).toBe(2025);
      expect(payroll.payPeriodStart.getMonth()).toBe(0); // January
      expect(payroll.payPeriodStart.getDate()).toBe(1);
      expect(payroll.payPeriodEnd.getDate()).toBe(31);
    });

    it('should store paymentDate correctly', async () => {
      const payroll = await repository.create(testPayrollData);
      await repository.approve(payroll.id);

      const paid = await repository.markAsPaid(payroll.id, new Date('2025-01-25'));

      expect(paid.paymentDate?.getDate()).toBe(25);
    });
  });
});

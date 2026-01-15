import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { CreateStaffDto } from '../../../src/database/dto/staff.dto';
import {
  EmploymentType,
  PayFrequency,
} from '../../../src/database/entities/staff.entity';
import {
  NotFoundException,
  ConflictException,
} from '../../../src/shared/exceptions';
import { Tenant } from '@prisma/client';

describe('StaffRepository', () => {
  let repository: StaffRepository;
  let prisma: PrismaService;
  let tenant: Tenant;
  let otherTenant: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, StaffRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<StaffRepository>(StaffRepository);

    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database in exact order
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

    // Create test tenants
    tenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Daycare',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27211234567',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    otherTenant = await prisma.tenant.create({
      data: {
        name: 'Bright Beginnings',
        addressLine1: '456 Other Road',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27217654321',
        email: `other${Date.now()}@brightbeginnings.co.za`,
      },
    });
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  const createTestStaffData = (): CreateStaffDto => ({
    tenantId: tenant.id,
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
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(repository).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create staff with all fields', async () => {
      const data = createTestStaffData();
      const staff = await repository.create(data);

      expect(staff).toBeDefined();
      expect(staff.id).toBeDefined();
      expect(staff.tenantId).toBe(tenant.id);
      expect(staff.employeeNumber).toBe('EMP-001');
      expect(staff.firstName).toBe('Thabo');
      expect(staff.lastName).toBe('Modise');
      expect(staff.idNumber).toBe('8501015800084');
      expect(staff.taxNumber).toBe('1234567890');
      expect(staff.email).toBe('thabo@littlestars.co.za');
      expect(staff.phone).toBe('+27821234567');
      expect(staff.dateOfBirth).toEqual(new Date('1985-01-01'));
      expect(staff.startDate).toEqual(new Date('2024-01-15'));
      expect(staff.employmentType).toBe(EmploymentType.PERMANENT);
      expect(staff.payFrequency).toBe(PayFrequency.MONTHLY);
      expect(staff.basicSalaryCents).toBe(1500000);
      expect(staff.bankName).toBe('First National Bank');
      expect(staff.bankAccount).toBe('62123456789');
      expect(staff.bankBranchCode).toBe('250655');
      expect(staff.medicalAidMembers).toBe(3);
      expect(staff.isActive).toBe(true);
      expect(staff.endDate).toBeNull();
      expect(staff.createdAt).toBeDefined();
      expect(staff.updatedAt).toBeDefined();
    });

    it('should create staff with minimum required fields', async () => {
      const minimalData: CreateStaffDto = {
        tenantId: tenant.id,
        employeeNumber: 'EMP-002',
        firstName: 'Zanele',
        lastName: 'Nkosi',
        idNumber: '9203126543087',
        email: 'zanele@littlestars.co.za',
        phone: '+27829876543',
        dateOfBirth: new Date('1992-03-12'),
        startDate: new Date('2024-02-01'),
        employmentType: EmploymentType.CASUAL,
        basicSalaryCents: 500000,
      };

      const staff = await repository.create(minimalData);

      expect(staff).toBeDefined();
      expect(staff.id).toBeDefined();
      expect(staff.firstName).toBe('Zanele');
      expect(staff.lastName).toBe('Nkosi');
      expect(staff.taxNumber).toBeNull();
      expect(staff.bankName).toBeNull();
      expect(staff.bankAccount).toBeNull();
      expect(staff.bankBranchCode).toBeNull();
    });

    it('should auto-generate UUID', async () => {
      const data = createTestStaffData();
      const staff = await repository.create(data);

      expect(staff.id).toBeDefined();
      expect(staff.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should default payFrequency to MONTHLY', async () => {
      const data = createTestStaffData();
      delete (data as any).payFrequency;

      const staff = await repository.create(data);

      expect(staff.payFrequency).toBe(PayFrequency.MONTHLY);
    });

    it('should default medicalAidMembers to 0', async () => {
      const data = createTestStaffData();
      delete (data as any).medicalAidMembers;

      const staff = await repository.create(data);

      expect(staff.medicalAidMembers).toBe(0);
    });

    it('should default isActive to true', async () => {
      const data = createTestStaffData();
      const staff = await repository.create(data);

      expect(staff.isActive).toBe(true);
    });

    it('should throw ConflictException for duplicate idNumber per tenant', async () => {
      const data = createTestStaffData();
      await repository.create(data);

      const duplicateData = {
        ...data,
        employeeNumber: 'EMP-002',
        email: 'different@littlestars.co.za',
      };

      await expect(repository.create(duplicateData)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      const data = createTestStaffData();
      data.tenantId = '00000000-0000-0000-0000-000000000000';

      await expect(repository.create(data)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should find staff by id', async () => {
      const data = createTestStaffData();
      const created = await repository.create(data);

      const found = await repository.findById(created.id, tenant.id);

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.firstName).toBe('Thabo');
      expect(found?.lastName).toBe('Modise');
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById(
        '00000000-0000-0000-0000-000000000000',
        tenant.id,
      );

      expect(found).toBeNull();
    });
  });

  describe('findByIdNumber', () => {
    it('should find staff by tenant and idNumber', async () => {
      const data = createTestStaffData();
      const created = await repository.create(data);

      const found = await repository.findByIdNumber(tenant.id, '8501015800084');

      expect(found).toBeDefined();
      expect(found?.id).toBe(created.id);
      expect(found?.idNumber).toBe('8501015800084');
    });

    it('should return null for non-existent idNumber', async () => {
      const found = await repository.findByIdNumber(tenant.id, '9999999999999');

      expect(found).toBeNull();
    });
  });

  describe('findByTenantId', () => {
    beforeEach(async () => {
      // Create multiple staff members
      await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-001',
        firstName: 'Thabo',
        lastName: 'Modise',
        idNumber: '8501015800084',
        email: 'thabo@littlestars.co.za',
        employmentType: EmploymentType.PERMANENT,
        payFrequency: PayFrequency.MONTHLY,
      });

      await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-002',
        firstName: 'Zanele',
        lastName: 'Nkosi',
        idNumber: '9203126543087',
        email: 'zanele@littlestars.co.za',
        employmentType: EmploymentType.CONTRACT,
        payFrequency: PayFrequency.WEEKLY,
      });

      await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-003',
        firstName: 'Sipho',
        lastName: 'Dlamini',
        idNumber: '7809157890123',
        email: 'sipho@littlestars.co.za',
        employmentType: EmploymentType.CASUAL,
        payFrequency: PayFrequency.DAILY,
      });

      // Create inactive staff with CONTRACT type (not PERMANENT)
      const inactive = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-004',
        firstName: 'Nomsa',
        lastName: 'Zulu',
        idNumber: '8612258765432',
        email: 'nomsa@littlestars.co.za',
        employmentType: EmploymentType.CONTRACT,
      });
      await repository.deactivate(inactive.id, tenant.id);
    });

    it('should return all staff for tenant', async () => {
      const staff = await repository.findByTenantId(tenant.id);

      expect(staff).toHaveLength(4);
      expect(staff[0].lastName).toBe('Dlamini'); // Alphabetical order
      expect(staff[1].lastName).toBe('Modise');
      expect(staff[2].lastName).toBe('Nkosi');
      expect(staff[3].lastName).toBe('Zulu');
    });

    it('should filter by isActive', async () => {
      const activeStaff = await repository.findByTenantId(tenant.id, {
        isActive: true,
      });

      expect(activeStaff).toHaveLength(3);
      expect(activeStaff.every((s) => s.isActive)).toBe(true);

      const inactiveStaff = await repository.findByTenantId(tenant.id, {
        isActive: false,
      });

      expect(inactiveStaff).toHaveLength(1);
      expect(inactiveStaff[0].firstName).toBe('Nomsa');
    });

    it('should filter by employmentType', async () => {
      // Filter by employmentType AND isActive to exclude inactive Nomsa
      const permanent = await repository.findByTenantId(tenant.id, {
        employmentType: EmploymentType.PERMANENT,
        isActive: true,
      });

      expect(permanent).toHaveLength(1);
      expect(permanent[0].firstName).toBe('Thabo');

      const contract = await repository.findByTenantId(tenant.id, {
        employmentType: EmploymentType.CONTRACT,
        isActive: true,
      });

      expect(contract).toHaveLength(1);
      expect(contract[0].firstName).toBe('Zanele');

      const casual = await repository.findByTenantId(tenant.id, {
        employmentType: EmploymentType.CASUAL,
        isActive: true,
      });

      expect(casual).toHaveLength(1);
      expect(casual[0].firstName).toBe('Sipho');
    });

    it('should filter by payFrequency', async () => {
      const monthly = await repository.findByTenantId(tenant.id, {
        payFrequency: PayFrequency.MONTHLY,
      });

      expect(monthly).toHaveLength(2); // Thabo + Nomsa (default)
      expect(monthly.some((s) => s.firstName === 'Thabo')).toBe(true);

      const weekly = await repository.findByTenantId(tenant.id, {
        payFrequency: PayFrequency.WEEKLY,
      });

      expect(weekly).toHaveLength(1);
      expect(weekly[0].firstName).toBe('Zanele');

      const daily = await repository.findByTenantId(tenant.id, {
        payFrequency: PayFrequency.DAILY,
      });

      expect(daily).toHaveLength(1);
      expect(daily[0].firstName).toBe('Sipho');
    });

    it('should filter by search term (name, idNumber, employeeNumber)', async () => {
      // Search by first name
      const byFirstName = await repository.findByTenantId(tenant.id, {
        search: 'Thabo',
      });
      expect(byFirstName).toHaveLength(1);
      expect(byFirstName[0].firstName).toBe('Thabo');

      // Search by last name
      const byLastName = await repository.findByTenantId(tenant.id, {
        search: 'Nkosi',
      });
      expect(byLastName).toHaveLength(1);
      expect(byLastName[0].lastName).toBe('Nkosi');

      // Search by ID number
      const byIdNumber = await repository.findByTenantId(tenant.id, {
        search: '8501015800084',
      });
      expect(byIdNumber).toHaveLength(1);
      expect(byIdNumber[0].idNumber).toBe('8501015800084');

      // Search by employee number
      const byEmployeeNumber = await repository.findByTenantId(tenant.id, {
        search: 'EMP-002',
      });
      expect(byEmployeeNumber).toHaveLength(1);
      expect(byEmployeeNumber[0].employeeNumber).toBe('EMP-002');

      // Case insensitive search
      const caseInsensitive = await repository.findByTenantId(tenant.id, {
        search: 'sipho',
      });
      expect(caseInsensitive).toHaveLength(1);
      expect(caseInsensitive[0].firstName).toBe('Sipho');
    });

    it('should order by lastName, firstName', async () => {
      // Create two staff with same last name
      await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-005',
        firstName: 'Amanda',
        lastName: 'Modise',
        idNumber: '9005051234567',
        email: 'amanda@littlestars.co.za',
      });

      const staff = await repository.findByTenantId(tenant.id, {
        search: 'Modise',
      });

      expect(staff).toHaveLength(2);
      expect(staff[0].firstName).toBe('Amanda'); // A before T
      expect(staff[1].firstName).toBe('Thabo');
    });
  });

  describe('findActiveByTenantId', () => {
    it('should return only active staff', async () => {
      const active1 = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-001',
        idNumber: '8501015800084',
        email: 'active1@littlestars.co.za',
      });

      const active2 = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-002',
        idNumber: '9203126543087',
        email: 'active2@littlestars.co.za',
      });

      const inactive = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-003',
        idNumber: '7809157890123',
        email: 'inactive@littlestars.co.za',
      });
      await repository.deactivate(inactive.id, tenant.id);

      const activeStaff = await repository.findActiveByTenantId(tenant.id);

      expect(activeStaff).toHaveLength(2);
      expect(activeStaff.every((s) => s.isActive)).toBe(true);
      expect(activeStaff.some((s) => s.id === active1.id)).toBe(true);
      expect(activeStaff.some((s) => s.id === active2.id)).toBe(true);
      expect(activeStaff.some((s) => s.id === inactive.id)).toBe(false);
    });

    it('should return empty array when no active staff', async () => {
      const staff = await repository.create(createTestStaffData());
      await repository.deactivate(staff.id, tenant.id);

      const activeStaff = await repository.findActiveByTenantId(tenant.id);

      expect(activeStaff).toHaveLength(0);
    });
  });

  describe('update', () => {
    it('should update staff fields', async () => {
      const staff = await repository.create(createTestStaffData());

      const updated = await repository.update(staff.id, tenant.id, {
        firstName: 'Thabo Updated',
        phone: '+27829999999',
        basicSalaryCents: 2000000,
      });

      expect(updated.firstName).toBe('Thabo Updated');
      expect(updated.phone).toBe('+27829999999');
      expect(updated.basicSalaryCents).toBe(2000000);
      expect(updated.lastName).toBe('Modise'); // Unchanged
    });

    it('should update employment type', async () => {
      const staff = await repository.create({
        ...createTestStaffData(),
        employmentType: EmploymentType.CONTRACT,
      });

      const updated = await repository.update(staff.id, tenant.id, {
        employmentType: EmploymentType.PERMANENT,
      });

      expect(updated.employmentType).toBe(EmploymentType.PERMANENT);
    });

    it('should update salary', async () => {
      const staff = await repository.create(createTestStaffData());

      const updated = await repository.update(staff.id, tenant.id, {
        basicSalaryCents: 2500000,
      });

      expect(updated.basicSalaryCents).toBe(2500000);
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', tenant.id, {
          firstName: 'Test',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for duplicate idNumber', async () => {
      const staff1 = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-001',
        idNumber: '8501015800084',
        email: 'staff1@littlestars.co.za',
      });

      const staff2 = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-002',
        idNumber: '9203126543087',
        email: 'staff2@littlestars.co.za',
      });

      await expect(
        repository.update(staff2.id, tenant.id, {
          idNumber: '8501015800084', // Duplicate of staff1
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deactivate', () => {
    it('should set isActive to false', async () => {
      const staff = await repository.create(createTestStaffData());

      const deactivated = await repository.deactivate(staff.id, tenant.id);

      expect(deactivated.isActive).toBe(false);
    });

    it('should set endDate', async () => {
      const staff = await repository.create(createTestStaffData());
      const today = new Date();

      const deactivated = await repository.deactivate(staff.id, tenant.id);

      expect(deactivated.endDate).toBeDefined();
      // Compare UTC components to avoid timezone conversion issues
      const endDate = new Date(deactivated.endDate!);
      expect(endDate.getUTCFullYear()).toBe(today.getUTCFullYear());
      expect(endDate.getUTCMonth()).toBe(today.getUTCMonth());
      expect(endDate.getUTCDate()).toBe(today.getUTCDate());
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      await expect(
        repository.deactivate(
          '00000000-0000-0000-0000-000000000000',
          tenant.id,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('delete', () => {
    it('should delete existing staff', async () => {
      const staff = await repository.create(createTestStaffData());

      await repository.delete(staff.id, tenant.id);

      const found = await repository.findById(staff.id, tenant.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent staff', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000', tenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException if staff has payroll records', async () => {
      const staff = await repository.create(createTestStaffData());

      // Create a payroll record for this staff using correct schema fields
      await prisma.payroll.create({
        data: {
          staffId: staff.id,
          tenantId: tenant.id,
          payPeriodStart: new Date('2024-01-01'),
          payPeriodEnd: new Date('2024-01-31'),
          basicSalaryCents: 1500000,
          grossSalaryCents: 1500000,
          payeCents: 200000,
          uifEmployeeCents: 15000,
          uifEmployerCents: 15000,
          netSalaryCents: 1285000,
        },
      });

      await expect(repository.delete(staff.id, tenant.id)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('tenant isolation', () => {
    it('should not return staff from other tenants', async () => {
      // Create staff for tenant 1
      await repository.create({
        ...createTestStaffData(),
        tenantId: tenant.id,
      });

      // Create staff for tenant 2
      await repository.create({
        ...createTestStaffData(),
        tenantId: otherTenant.id,
        employeeNumber: 'EMP-999',
        idNumber: '7512258765432',
        email: 'other@brightbeginnings.co.za',
      });

      const tenant1Staff = await repository.findByTenantId(tenant.id);
      const tenant2Staff = await repository.findByTenantId(otherTenant.id);

      expect(tenant1Staff).toHaveLength(1);
      expect(tenant2Staff).toHaveLength(1);
      expect(tenant1Staff[0].tenantId).toBe(tenant.id);
      expect(tenant2Staff[0].tenantId).toBe(otherTenant.id);
    });
  });

  describe('date handling', () => {
    it('should store dateOfBirth correctly', async () => {
      const dateOfBirth = new Date('1985-01-01');
      const staff = await repository.create({
        ...createTestStaffData(),
        dateOfBirth,
      });

      expect(staff.dateOfBirth).toEqual(dateOfBirth);
    });

    it('should store startDate and endDate correctly', async () => {
      const startDate = new Date('2024-01-15');
      const staff = await repository.create({
        ...createTestStaffData(),
        startDate,
      });

      expect(staff.startDate).toEqual(startDate);
      expect(staff.endDate).toBeNull();

      const deactivated = await repository.deactivate(staff.id, tenant.id);
      expect(deactivated.endDate).toBeDefined();
      expect(deactivated.endDate).toBeInstanceOf(Date);
    });
  });

  describe('all EmploymentType values', () => {
    it('should handle PERMANENT, CONTRACT, CASUAL', async () => {
      const permanent = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-001',
        idNumber: '8501015800084',
        email: 'perm@littlestars.co.za',
        employmentType: EmploymentType.PERMANENT,
      });

      const contract = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-002',
        idNumber: '9203126543087',
        email: 'cont@littlestars.co.za',
        employmentType: EmploymentType.CONTRACT,
      });

      const casual = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-003',
        idNumber: '7809157890123',
        email: 'cas@littlestars.co.za',
        employmentType: EmploymentType.CASUAL,
      });

      expect(permanent.employmentType).toBe(EmploymentType.PERMANENT);
      expect(contract.employmentType).toBe(EmploymentType.CONTRACT);
      expect(casual.employmentType).toBe(EmploymentType.CASUAL);
    });
  });

  describe('all PayFrequency values', () => {
    it('should handle MONTHLY, WEEKLY, DAILY, HOURLY', async () => {
      const monthly = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-001',
        idNumber: '8501015800084',
        email: 'monthly@littlestars.co.za',
        payFrequency: PayFrequency.MONTHLY,
      });

      const weekly = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-002',
        idNumber: '9203126543087',
        email: 'weekly@littlestars.co.za',
        payFrequency: PayFrequency.WEEKLY,
      });

      const daily = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-003',
        idNumber: '7809157890123',
        email: 'daily@littlestars.co.za',
        payFrequency: PayFrequency.DAILY,
      });

      const hourly = await repository.create({
        ...createTestStaffData(),
        employeeNumber: 'EMP-004',
        idNumber: '8612258765432',
        email: 'hourly@littlestars.co.za',
        payFrequency: PayFrequency.HOURLY,
      });

      expect(monthly.payFrequency).toBe(PayFrequency.MONTHLY);
      expect(weekly.payFrequency).toBe(PayFrequency.WEEKLY);
      expect(daily.payFrequency).toBe(PayFrequency.DAILY);
      expect(hourly.payFrequency).toBe(PayFrequency.HOURLY);
    });
  });
});

/**
 * Irp5Service Integration Tests
 * TASK-SARS-016
 *
 * Tests IRP5 certificate generation with real database
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayeService } from '../../../src/database/services/paye.service';
import { Irp5Service } from '../../../src/database/services/irp5.service';
import {
  PayrollStatus,
  EmploymentType,
  PayFrequency,
} from '@prisma/client';
import { Tenant, Staff } from '@prisma/client';

describe('Irp5Service', () => {
  let service: Irp5Service;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testStaff: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayeService, Irp5Service],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<Irp5Service>(Irp5Service);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.sarsSubmission.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.reconciliation.deleteMany({});
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
        name: 'IRP5 Test Creche',
        tradingName: 'Happy Kids Creche',
        registrationNumber: '1234567ABC',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `irp5-test-${Date.now()}@test.co.za`,
      },
    });

    // Create test staff member
    testStaff = await prisma.staff.create({
      data: {
        tenantId: testTenant.id,
        employeeNumber: 'EMP001',
        firstName: 'John',
        lastName: 'Smith',
        idNumber: '8501015800083',
        taxNumber: '1234567890',
        dateOfBirth: new Date('1985-01-01'),
        startDate: new Date('2020-01-01'),
        employmentType: EmploymentType.PERMANENT,
        payFrequency: PayFrequency.MONTHLY,
        basicSalaryCents: 2000000, // R20,000
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateIrp5', () => {
    it('should generate IRP5 for full year employment', async () => {
      // Create 12 months of payroll (March 2024 - Feb 2025 for tax year 2025)
      const payrolls = [];
      for (let i = 0; i < 12; i++) {
        const month = (2 + i) % 12; // Start from March (month 2)
        const year = i < 10 ? 2024 : 2025; // March-Dec 2024, Jan-Feb 2025

        payrolls.push({
          tenantId: testTenant.id,
          staffId: testStaff.id,
          payPeriodStart: new Date(year, month, 1),
          payPeriodEnd: new Date(year, month + 1, 0),
          basicSalaryCents: 2000000,
          overtimeCents: 0,
          bonusCents: 0,
          otherEarningsCents: 0,
          grossSalaryCents: 2000000,
          payeCents: 250000, // R2,500
          uifEmployeeCents: 17712, // Capped
          uifEmployerCents: 17712,
          otherDeductionsCents: 0,
          netSalaryCents: 1732288,
          medicalAidCreditCents: 36400, // R364
          status: PayrollStatus.PAID,
        });
      }

      await prisma.payroll.createMany({ data: payrolls });

      const certificate = await service.generateIrp5({
        staffId: testStaff.id,
        taxYear: '2025',
      });

      expect(certificate).toBeDefined();
      expect(certificate.taxYear).toBe('2025');
      expect(certificate.staffId).toBe(testStaff.id);

      // Check totals (12 months)
      expect(certificate.fields.code3601Cents).toBe(24000000); // R240,000 basic
      expect(certificate.fields.code3696Cents).toBe(3000000); // R30,000 PAYE
      expect(certificate.fields.code3810Cents).toBe(212544); // R2,125.44 UIF
      expect(certificate.fields.code3615Cents).toBe(24000000); // R240,000 total

      expect(certificate.taxPeriod.periodsWorked).toBe(12);
    });

    it('should generate IRP5 for mid-year start', async () => {
      // Create 8 months of payroll (July 2024 - Feb 2025)
      const payrolls = [];
      for (let i = 0; i < 8; i++) {
        const month = (6 + i) % 12; // Start from July (month 6)
        const year = i < 6 ? 2024 : 2025; // July-Dec 2024, Jan-Feb 2025

        payrolls.push({
          tenantId: testTenant.id,
          staffId: testStaff.id,
          payPeriodStart: new Date(year, month, 1),
          payPeriodEnd: new Date(year, month + 1, 0),
          basicSalaryCents: 1500000, // R15,000
          overtimeCents: 0,
          bonusCents: 0,
          otherEarningsCents: 0,
          grossSalaryCents: 1500000,
          payeCents: 150000,
          uifEmployeeCents: 15000,
          uifEmployerCents: 15000,
          otherDeductionsCents: 0,
          netSalaryCents: 1335000,
          medicalAidCreditCents: 0,
          status: PayrollStatus.PAID,
        });
      }

      await prisma.payroll.createMany({ data: payrolls });

      const certificate = await service.generateIrp5({
        staffId: testStaff.id,
        taxYear: '2025',
      });

      expect(certificate.fields.code3601Cents).toBe(12000000); // R120,000 (8 months)
      expect(certificate.taxPeriod.periodsWorked).toBe(8);
    });

    it('should include bonus in IRP5', async () => {
      // Create payroll with bonus
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff.id,
            payPeriodStart: new Date(2024, 2, 1), // March 2024
            payPeriodEnd: new Date(2024, 2, 31),
            basicSalaryCents: 2000000,
            overtimeCents: 0,
            bonusCents: 0,
            otherEarningsCents: 0,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732288,
            medicalAidCreditCents: 0,
            status: PayrollStatus.PAID,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff.id,
            payPeriodStart: new Date(2024, 11, 1), // December 2024
            payPeriodEnd: new Date(2024, 11, 31),
            basicSalaryCents: 2000000,
            overtimeCents: 0,
            bonusCents: 1000000, // R10,000 bonus
            otherEarningsCents: 0,
            grossSalaryCents: 3000000, // R30,000 with bonus
            payeCents: 450000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 2532288,
            medicalAidCreditCents: 0,
            status: PayrollStatus.PAID,
          },
        ],
      });

      const certificate = await service.generateIrp5({
        staffId: testStaff.id,
        taxYear: '2025',
      });

      expect(certificate.fields.code3601Cents).toBe(4000000); // R40,000 basic
      expect(certificate.fields.code3606Cents).toBe(1000000); // R10,000 bonus
      expect(certificate.fields.code3615Cents).toBe(5000000); // R50,000 total
    });

    it('should throw error for invalid tax year format', async () => {
      await expect(
        service.generateIrp5({
          staffId: testStaff.id,
          taxYear: '25', // Invalid format
        }),
      ).rejects.toThrow('Invalid tax year format');
    });

    it('should throw error for non-existent staff', async () => {
      await expect(
        service.generateIrp5({
          staffId: 'non-existent-id',
          taxYear: '2025',
        }),
      ).rejects.toThrow('not found');
    });

    it('should throw error for no paid payrolls', async () => {
      await expect(
        service.generateIrp5({
          staffId: testStaff.id,
          taxYear: '2025',
        }),
      ).rejects.toThrow('No paid payroll records');
    });

    it('should only include paid payrolls', async () => {
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff.id,
            payPeriodStart: new Date(2024, 2, 1),
            payPeriodEnd: new Date(2024, 2, 31),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732288,
            medicalAidCreditCents: 0,
            status: PayrollStatus.PAID,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff.id,
            payPeriodStart: new Date(2024, 3, 1),
            payPeriodEnd: new Date(2024, 3, 30),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732288,
            medicalAidCreditCents: 0,
            status: PayrollStatus.APPROVED, // Not paid
          },
        ],
      });

      const certificate = await service.generateIrp5({
        staffId: testStaff.id,
        taxYear: '2025',
      });

      // Only 1 paid payroll
      expect(certificate.taxPeriod.periodsWorked).toBe(1);
      expect(certificate.fields.code3601Cents).toBe(2000000);
    });
  });

  describe('getTaxYearDates', () => {
    it('should return correct dates for tax year 2025', () => {
      const { startDate, endDate } = service.getTaxYearDates('2025');

      expect(startDate.getFullYear()).toBe(2024);
      expect(startDate.getMonth()).toBe(2); // March
      expect(startDate.getDate()).toBe(1);

      expect(endDate.getFullYear()).toBe(2025);
      expect(endDate.getMonth()).toBe(1); // February
      expect(endDate.getDate()).toBe(28); // 2025 is not a leap year
    });

    it('should handle leap year correctly', () => {
      const { endDate } = service.getTaxYearDates('2024');

      expect(endDate.getFullYear()).toBe(2024);
      expect(endDate.getMonth()).toBe(1); // February
      expect(endDate.getDate()).toBe(29); // 2024 is a leap year
    });

    it('should return correct dates for tax year 2026', () => {
      const { startDate, endDate } = service.getTaxYearDates('2026');

      expect(startDate.getFullYear()).toBe(2025);
      expect(startDate.getMonth()).toBe(2); // March
      expect(startDate.getDate()).toBe(1);

      expect(endDate.getFullYear()).toBe(2026);
      expect(endDate.getMonth()).toBe(1); // February
    });
  });

  describe('isLeapYear', () => {
    it('should identify leap years correctly', () => {
      expect(service.isLeapYear(2024)).toBe(true);
      expect(service.isLeapYear(2025)).toBe(false);
      expect(service.isLeapYear(2000)).toBe(true); // Divisible by 400
      expect(service.isLeapYear(1900)).toBe(false); // Divisible by 100 but not 400
    });
  });

  describe('calculateYtd', () => {
    it('should aggregate YTD totals correctly', () => {
      const payrolls = [
        {
          basicSalaryCents: 2000000,
          overtimeCents: 50000,
          bonusCents: 0,
          otherEarningsCents: 10000,
          grossSalaryCents: 2060000,
          payeCents: 250000,
          uifEmployeeCents: 17712,
          medicalAidCreditCents: 36400,
        },
        {
          basicSalaryCents: 2000000,
          overtimeCents: 30000,
          bonusCents: 500000,
          otherEarningsCents: 0,
          grossSalaryCents: 2530000,
          payeCents: 350000,
          uifEmployeeCents: 17712,
          medicalAidCreditCents: 36400,
        },
      ];

      const ytd = service.calculateYtd(payrolls);

      expect(ytd.totalBasicCents).toBe(4000000);
      expect(ytd.totalOvertimeCents).toBe(80000);
      expect(ytd.totalBonusCents).toBe(500000);
      expect(ytd.totalOtherEarningsCents).toBe(10000);
      expect(ytd.totalGrossCents).toBe(4590000);
      expect(ytd.totalPayeCents).toBe(600000);
      expect(ytd.totalUifCents).toBe(35424);
      expect(ytd.totalMedicalCreditsCents).toBe(72800);
      expect(ytd.periodCount).toBe(2);
    });
  });

  describe('populateFields', () => {
    it('should populate IRP5 fields correctly', () => {
      const ytd = {
        totalBasicCents: 24000000,
        totalOvertimeCents: 100000,
        totalBonusCents: 500000,
        totalOtherEarningsCents: 50000,
        totalGrossCents: 24650000,
        totalPayeCents: 3000000,
        totalUifCents: 212544,
        totalMedicalCreditsCents: 436800,
        periodCount: 12,
      };

      const fields = service.populateFields(ytd);

      expect(fields.code3601Cents).toBe(24000000);
      expect(fields.code3602Cents).toBe(100000);
      expect(fields.code3605Cents).toBe(50000);
      expect(fields.code3606Cents).toBe(500000);
      expect(fields.code3615Cents).toBe(24650000);
      expect(fields.code3696Cents).toBe(3000000);
      expect(fields.code3714Cents).toBe(436800);
      expect(fields.code3810Cents).toBe(212544);
    });
  });

  describe('validateForSubmission', () => {
    it('should pass validation for valid certificate', async () => {
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff.id,
          payPeriodStart: new Date(2024, 2, 1),
          payPeriodEnd: new Date(2024, 2, 31),
          basicSalaryCents: 2000000,
          grossSalaryCents: 2000000,
          payeCents: 250000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
          netSalaryCents: 1732288,
          status: PayrollStatus.PAID,
        },
      });

      const certificate = await service.generateIrp5({
        staffId: testStaff.id,
        taxYear: '2025',
      });

      const result = service.validateForSubmission(certificate);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing tax number', async () => {
      // Create staff without tax number
      const staffNoTax = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          employeeNumber: 'EMP002',
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '9002025800084',
          taxNumber: null, // No tax number
          dateOfBirth: new Date('1990-02-02'),
          startDate: new Date('2021-06-01'),
          employmentType: EmploymentType.PERMANENT,
          payFrequency: PayFrequency.MONTHLY,
          basicSalaryCents: 1500000,
        },
      });

      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: staffNoTax.id,
          payPeriodStart: new Date(2024, 2, 1),
          payPeriodEnd: new Date(2024, 2, 31),
          basicSalaryCents: 1500000,
          grossSalaryCents: 1500000,
          payeCents: 150000,
          uifEmployeeCents: 15000,
          uifEmployerCents: 15000,
          netSalaryCents: 1335000,
          status: PayrollStatus.PAID,
        },
      });

      const certificate = await service.generateIrp5({
        staffId: staffNoTax.id,
        taxYear: '2025',
      });

      const result = service.validateForSubmission(certificate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('tax number'))).toBe(true);
    });

    it('should detect field inconsistency', () => {
      const certificate = {
        certificateId: 'test',
        tenantId: 'test',
        staffId: 'test',
        taxYear: '2025',
        employeeDetails: {
          employeeNumber: 'EMP001',
          firstName: 'John',
          lastName: 'Smith',
          idNumber: '8501015800083',
          taxNumber: '1234567890',
          dateOfBirth: new Date('1985-01-01'),
        },
        employerDetails: {
          name: 'Test',
          payeReference: '1234567ABC',
          registrationNumber: '1234567ABC',
        },
        taxPeriod: {
          startDate: new Date(),
          endDate: new Date(),
          periodsWorked: 12,
        },
        fields: {
          code3601Cents: 100000,
          code3602Cents: 0,
          code3605Cents: 0,
          code3606Cents: 0,
          code3615Cents: 200000, // Mismatch!
          code3696Cents: 20000,
          code3701Cents: 0,
          code3702Cents: 0,
          code3713Cents: 0,
          code3714Cents: 0,
          code3810Cents: 1000,
        },
        totalRemunerationCents: 200000,
        totalPayeCents: 20000,
        totalUifCents: 1000,
        generatedAt: new Date(),
      };

      const result = service.validateForSubmission(certificate);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('does not match'))).toBe(true);
    });
  });

  describe('generateBulkIrp5', () => {
    it('should generate certificates for multiple employees', async () => {
      // Create second staff member
      const testStaff2 = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          employeeNumber: 'EMP002',
          firstName: 'Jane',
          lastName: 'Doe',
          idNumber: '9002025800084',
          taxNumber: '0987654321',
          dateOfBirth: new Date('1990-02-02'),
          startDate: new Date('2021-06-01'),
          employmentType: EmploymentType.PERMANENT,
          payFrequency: PayFrequency.MONTHLY,
          basicSalaryCents: 1500000,
        },
      });

      // Create payrolls for both
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff.id,
            payPeriodStart: new Date(2024, 2, 1),
            payPeriodEnd: new Date(2024, 2, 31),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732288,
            status: PayrollStatus.PAID,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff2.id,
            payPeriodStart: new Date(2024, 2, 1),
            payPeriodEnd: new Date(2024, 2, 31),
            basicSalaryCents: 1500000,
            grossSalaryCents: 1500000,
            payeCents: 150000,
            uifEmployeeCents: 15000,
            uifEmployerCents: 15000,
            netSalaryCents: 1335000,
            status: PayrollStatus.PAID,
          },
        ],
      });

      const certificates = await service.generateBulkIrp5(testTenant.id, '2025');

      expect(certificates).toHaveLength(2);
      expect(certificates[0].staffId).toBeDefined();
      expect(certificates[1].staffId).toBeDefined();
    });
  });
});

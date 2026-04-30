/**
 * Emp201Service Integration Tests
 * TASK-SARS-015
 *
 * Tests EMP201 generation with real database
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PayeService } from '../../../src/database/services/paye.service';
import { UifService } from '../../../src/database/services/uif.service';
import { Emp201Service } from '../../../src/database/services/emp201.service';
import {
  PayrollStatus,
  SubmissionStatus,
  EmploymentType,
  PayFrequency,
} from '@prisma/client';
import { Tenant, Staff } from '@prisma/client';
import type { EMP201_CONSTANTS as _EMP201_CONSTANTS } from '../../../src/database/constants/emp201.constants';
import { cleanDatabase } from '../../helpers/clean-database';

describe('Emp201Service', () => {
  let service: Emp201Service;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testStaff1: Staff;
  let testStaff2: Staff;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, PayeService, UifService, Emp201Service],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<Emp201Service>(Emp201Service);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant with PAYE reference
    testTenant = await prisma.tenant.create({
      data: {
        name: 'EMP201 Test Creche',
        tradingName: 'Happy Kids Creche',
        registrationNumber: '1234567ABC', // PAYE reference
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `emp201-test-${Date.now()}@test.co.za`,
      },
    });

    // Create first test staff member
    testStaff1 = await prisma.staff.create({
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

    // Create second test staff member (no tax number)
    testStaff2 = await prisma.staff.create({
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
        basicSalaryCents: 1500000, // R15,000
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateEmp201', () => {
    it('should generate EMP201 for single employee', async () => {
      // Create payroll for single employee
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff1.id,
          payPeriodStart: new Date(2025, 0, 1),
          payPeriodEnd: new Date(2025, 0, 31),
          basicSalaryCents: 2000000,
          overtimeCents: 0,
          bonusCents: 0,
          otherEarningsCents: 0,
          grossSalaryCents: 2000000, // R20,000
          payeCents: 250000, // R2,500
          uifEmployeeCents: 17712, // Capped at R177.12
          uifEmployerCents: 17712, // Capped at R177.12
          otherDeductionsCents: 0,
          netSalaryCents: 1732576,
          status: PayrollStatus.APPROVED,
        },
      });

      const submission = await service.generateEmp201({
        tenantId: testTenant.id,
        periodMonth: '2025-01',
      });

      expect(submission).toBeDefined();
      expect(submission.submissionType).toBe('EMP201');
      expect(submission.status).toBe(SubmissionStatus.DRAFT);
      expect(submission.totalPayeCents).toBe(250000);
      expect(submission.totalUifCents).toBe(35424); // R354.24

      const documentData = submission.documentData as any;
      expect(documentData.summary.employeeCount).toBe(1);
      expect(documentData.summary.totalGrossRemunerationCents).toBe(2000000);
    });

    it('should generate EMP201 for multiple employees', async () => {
      // Create payroll for both employees
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff1.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732576,
            status: PayrollStatus.APPROVED,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff2.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 1500000,
            grossSalaryCents: 1500000,
            payeCents: 150000,
            uifEmployeeCents: 15000,
            uifEmployerCents: 15000,
            netSalaryCents: 1335000,
            status: PayrollStatus.APPROVED,
          },
        ],
      });

      const submission = await service.generateEmp201({
        tenantId: testTenant.id,
        periodMonth: '2025-01',
      });

      const documentData = submission.documentData as any;
      expect(documentData.summary.employeeCount).toBe(2);
      expect(documentData.summary.totalGrossRemunerationCents).toBe(3500000); // R35,000
      expect(documentData.summary.totalPayeCents).toBe(400000); // R4,000
      expect(documentData.summary.totalUifCents).toBe(65424); // R654.24

      // SDL exempt: R35,000/month × 12 = R420,000/year < R500,000 threshold
      expect(documentData.summary.totalSdlCents).toBe(0);
      expect(documentData.sdlApplicable).toBe(false);

      // Total due = PAYE + UIF (no SDL - exempt)
      expect(documentData.summary.totalDueCents).toBe(465424); // R4,654.24
    });

    it('should include validation issues for missing tax number', async () => {
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff2.id, // Staff without tax number
          payPeriodStart: new Date(2025, 0, 1),
          payPeriodEnd: new Date(2025, 0, 31),
          basicSalaryCents: 1500000,
          grossSalaryCents: 1500000,
          payeCents: 150000,
          uifEmployeeCents: 15000,
          uifEmployerCents: 15000,
          netSalaryCents: 1335000,
          status: PayrollStatus.APPROVED,
        },
      });

      const submission = await service.generateEmp201({
        tenantId: testTenant.id,
        periodMonth: '2025-01',
      });

      const documentData = submission.documentData as any;
      expect(documentData.validationIssues.length).toBeGreaterThan(0);
      expect(
        documentData.validationIssues.some((i: string) =>
          i.includes('Missing tax number'),
        ),
      ).toBe(true);
    });

    it('should throw error for invalid period format', async () => {
      await expect(
        service.generateEmp201({
          tenantId: testTenant.id,
          periodMonth: '2025/01', // Wrong format
        }),
      ).rejects.toThrow('Invalid period format');
    });

    it('should throw error for non-existent tenant', async () => {
      await expect(
        service.generateEmp201({
          tenantId: 'non-existent-id',
          periodMonth: '2025-01',
        }),
      ).rejects.toThrow('not found');
    });

    it('should throw error for period with no payroll', async () => {
      await expect(
        service.generateEmp201({
          tenantId: testTenant.id,
          periodMonth: '2025-01',
        }),
      ).rejects.toThrow('No approved payroll records');
    });

    it('should only include approved payrolls', async () => {
      // Create one approved and one draft payroll
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff1.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732576,
            status: PayrollStatus.APPROVED,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff2.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 1500000,
            grossSalaryCents: 1500000,
            payeCents: 150000,
            uifEmployeeCents: 15000,
            uifEmployerCents: 15000,
            netSalaryCents: 1335000,
            status: PayrollStatus.DRAFT, // Not approved
          },
        ],
      });

      const submission = await service.generateEmp201({
        tenantId: testTenant.id,
        periodMonth: '2025-01',
      });

      const documentData = submission.documentData as any;
      expect(documentData.summary.employeeCount).toBe(1); // Only approved
      expect(documentData.summary.totalGrossRemunerationCents).toBe(2000000);
    });
  });

  describe('aggregatePayroll', () => {
    it('should aggregate payroll totals correctly', async () => {
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff1.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732576,
            status: PayrollStatus.APPROVED,
          },
          {
            tenantId: testTenant.id,
            staffId: testStaff2.id,
            payPeriodStart: new Date(2025, 0, 1),
            payPeriodEnd: new Date(2025, 0, 31),
            basicSalaryCents: 1500000,
            grossSalaryCents: 1500000,
            payeCents: 150000,
            uifEmployeeCents: 15000,
            uifEmployerCents: 15000,
            netSalaryCents: 1335000,
            status: PayrollStatus.APPROVED,
          },
        ],
      });

      const summary = await service.aggregatePayroll(testTenant.id, '2025-01');

      expect(summary.employeeCount).toBe(2);
      expect(summary.totalGrossRemunerationCents).toBe(3500000);
      expect(summary.totalPayeCents).toBe(400000);
      expect(summary.totalUifEmployeeCents).toBe(32712);
      expect(summary.totalUifEmployerCents).toBe(32712);
      expect(summary.totalUifCents).toBe(65424);
    });
  });

  // calculateSdl DB integration tests — AUDIT-TAX-07
  // These require a running DB; pure unit tests are in src/database/services/__tests__/emp201-sdl.service.spec.ts
  describe('calculateSdl', () => {
    it('should calculate SDL as 1% of gross payroll for above-threshold employer', async () => {
      // Seed 12 months of R100,000 payroll = R1.2M rolling annual (above R500k)
      for (let i = 0; i < 12; i++) {
        await prisma.payroll.create({
          data: {
            tenantId: testTenant.id,
            staffId: testStaff1.id,
            payPeriodStart: new Date(2024, i, 1),
            payPeriodEnd: new Date(2024, i + 1, 0),
            basicSalaryCents: 10000000,
            grossSalaryCents: 10000000, // R100,000/month
            payeCents: 0,
            uifEmployeeCents: 0,
            uifEmployerCents: 0,
            netSalaryCents: 10000000,
            status: PayrollStatus.APPROVED,
          },
        });
      }

      const result = await service.calculateSdl(
        testTenant.id,
        '2024-12',
        10000000,
      );
      expect(result.sdlApplicable).toBe(true);
      expect(result.sdlCents).toBe(100000); // 1% of R100,000
    });

    it('should exempt SDL for small employers (SDLA §4(b))', async () => {
      // Only R3,000 payroll in period — rolling 12m well below R500k
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff1.id,
          payPeriodStart: new Date(2025, 0, 1),
          payPeriodEnd: new Date(2025, 0, 31),
          basicSalaryCents: 300000,
          grossSalaryCents: 300000, // R3,000
          payeCents: 0,
          uifEmployeeCents: 0,
          uifEmployerCents: 0,
          netSalaryCents: 300000,
          status: PayrollStatus.APPROVED,
        },
      });

      const result = await service.calculateSdl(
        testTenant.id,
        '2025-01',
        300000,
      );
      expect(result.sdlApplicable).toBe(false);
      expect(result.sdlCents).toBe(0);
    });

    it('should exempt at exactly R500k annual boundary (SDLA §4(b))', async () => {
      // Exactly R500,000 rolling annual — exempt (<=, not strictly <)
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff1.id,
          payPeriodStart: new Date(2025, 0, 1),
          payPeriodEnd: new Date(2025, 0, 31),
          basicSalaryCents: 50000000,
          grossSalaryCents: 50000000, // exactly R500,000
          payeCents: 0,
          uifEmployeeCents: 0,
          uifEmployerCents: 0,
          netSalaryCents: 50000000,
          status: PayrollStatus.APPROVED,
        },
      });

      const result = await service.calculateSdl(
        testTenant.id,
        '2025-01',
        50000000,
      );
      expect(result.sdlApplicable).toBe(false);
      expect(result.sdlCents).toBe(0);
      expect(result.rollingAnnualGrossCents).toBe(50000000);
    });
  });

  describe('validateEmployeeData', () => {
    it('should return no issues for valid employees', () => {
      const employees = [
        {
          staffId: 'test-id',
          employeeNumber: 'EMP001',
          fullName: 'John Smith',
          idNumber: '8501015800083',
          taxNumber: '1234567890',
          grossRemunerationCents: 2000000,
          payeCents: 250000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
        },
      ];

      const issues = service.validateEmployeeData(employees);
      expect(issues.length).toBe(0);
    });

    it('should flag invalid ID number', () => {
      const employees = [
        {
          staffId: 'test-id',
          employeeNumber: 'EMP001',
          fullName: 'John Smith',
          idNumber: '12345', // Too short
          taxNumber: '1234567890',
          grossRemunerationCents: 2000000,
          payeCents: 250000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
        },
      ];

      const issues = service.validateEmployeeData(employees);
      expect(issues.some((i) => i.includes('Invalid ID number'))).toBe(true);
    });

    it('should warn about missing tax number', () => {
      const employees = [
        {
          staffId: 'test-id',
          employeeNumber: 'EMP001',
          fullName: 'John Smith',
          idNumber: '8501015800083',
          taxNumber: null,
          grossRemunerationCents: 2000000,
          payeCents: 250000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
        },
      ];

      const issues = service.validateEmployeeData(employees);
      expect(issues.some((i) => i.includes('Missing tax number'))).toBe(true);
    });

    it('should flag negative amounts', () => {
      const employees = [
        {
          staffId: 'test-id',
          employeeNumber: 'EMP001',
          fullName: 'John Smith',
          idNumber: '8501015800083',
          taxNumber: '1234567890',
          grossRemunerationCents: -100, // Negative
          payeCents: 250000,
          uifEmployeeCents: 17712,
          uifEmployerCents: 17712,
        },
      ];

      const issues = service.validateEmployeeData(employees);
      expect(issues.some((i) => i.includes('Negative gross'))).toBe(true);
    });
  });

  describe('validateSubmission', () => {
    it('should pass validation for valid document', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        payeReference: '1234567ABC',
        tradingName: 'Test Creche',
        periodMonth: '2025-01',
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 0, 31),
        summary: {
          employeeCount: 1,
          totalGrossRemunerationCents: 2000000,
          totalPayeCents: 250000,
          totalUifEmployeeCents: 17712,
          totalUifEmployerCents: 17712,
          totalUifCents: 35424,
          totalSdlCents: 20000,
          totalDueCents: 305424,
        },
        employees: [{} as any],
        validationIssues: [],
        sdlApplicable: true,
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for no employees', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        payeReference: '1234567ABC',
        tradingName: 'Test Creche',
        periodMonth: '2025-01',
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 0, 31),
        summary: {
          employeeCount: 0,
          totalGrossRemunerationCents: 0,
          totalPayeCents: 0,
          totalUifEmployeeCents: 0,
          totalUifEmployerCents: 0,
          totalUifCents: 0,
          totalSdlCents: 0,
          totalDueCents: 0,
        },
        employees: [],
        validationIssues: [],
        sdlApplicable: false,
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No employees in submission');
    });

    it('should warn for missing PAYE reference', () => {
      const document = {
        submissionId: 'test-id',
        tenantId: testTenant.id,
        payeReference: null, // Missing
        tradingName: 'Test Creche',
        periodMonth: '2025-01',
        periodStart: new Date(2025, 0, 1),
        periodEnd: new Date(2025, 0, 31),
        summary: {
          employeeCount: 1,
          totalGrossRemunerationCents: 2000000,
          totalPayeCents: 250000,
          totalUifEmployeeCents: 17712,
          totalUifEmployerCents: 17712,
          totalUifCents: 35424,
          totalSdlCents: 20000,
          totalDueCents: 305424,
        },
        employees: [{} as any],
        validationIssues: [],
        sdlApplicable: true,
        generatedAt: new Date(),
      };

      const result = service.validateSubmission(document);
      expect(result.warnings.some((w) => w.includes('PAYE reference'))).toBe(
        true,
      );
    });
  });
});

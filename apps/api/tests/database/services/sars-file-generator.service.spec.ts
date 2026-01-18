/**
 * SarsFileGeneratorService Tests
 * TASK-SARS-035: Replace Mock eFiling with File Generation
 *
 * Tests CSV file generation for SARS EMP201 and EMP501 submissions.
 * Uses SimplePay as the source of truth for payroll data.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { SarsFileGeneratorService } from '../../../src/database/services/sars-file-generator.service';
import { SimplePayTaxService } from '../../../src/integrations/simplepay/simplepay-tax.service';
import {
  Tenant,
  Staff,
  EmploymentType,
  PayFrequency,
  SimplePaySyncStatus,
} from '@prisma/client';

// CRLF constant for validation
const CRLF = '\r\n';

describe('SarsFileGeneratorService', () => {
  let service: SarsFileGeneratorService;
  let prisma: PrismaService;
  let simplePayTaxService: jest.Mocked<SimplePayTaxService>;
  let testTenant: Tenant;
  let testStaff1: Staff;
  let testStaff2: Staff;

  // Mock SimplePay data
  const mockEmp201Data = {
    period: '2025-01',
    total_paye: 15000.0,
    total_sdl: 3500.0,
    total_uif_employer: 1770.0,
    total_uif_employee: 1770.0,
    total_eti: 500.0,
    employees_count: 5,
  };

  const mockIrp5Records = [
    {
      tax_year: 2025,
      employee_id: 'emp-1',
      certificate_number: 'IRP5-2025-001',
      gross_remuneration: 240000.0,
      paye_deducted: 30000.0,
    },
  ];

  beforeAll(async () => {
    // Create mock for SimplePayTaxService
    const mockSimplePayTaxService = {
      fetchEmp201: jest.fn(),
      fetchIrp5Certificates: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        SarsFileGeneratorService,
        {
          provide: SimplePayTaxService,
          useValue: mockSimplePayTaxService,
        },
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<SarsFileGeneratorService>(SarsFileGeneratorService);
    simplePayTaxService = module.get(SimplePayTaxService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();

    // Set up default mock responses
    simplePayTaxService.fetchEmp201.mockResolvedValue(mockEmp201Data);
    simplePayTaxService.fetchIrp5Certificates.mockResolvedValue(
      mockIrp5Records,
    );

    // Clean database in FK order
    await prisma.vatAdjustment.deleteMany({});
    await prisma.sarsSubmission.deleteMany({});
    await prisma.reminder.deleteMany({});
    await prisma.bankStatementMatch.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.payrollJournalLine.deleteMany({});
    await prisma.payrollJournal.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.payRunSync.deleteMany({});
    await prisma.leaveRequest.deleteMany({});
    await prisma.payrollAdjustment.deleteMany({});
    await prisma.simplePayEmployeeMapping.deleteMany({});
    await prisma.employeeSetupLog.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
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
    await prisma.userTenantRole.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.invoiceNumberCounter.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test tenant with PAYE reference
    testTenant = await prisma.tenant.create({
      data: {
        name: 'SARS File Test Creche',
        tradingName: 'Happy Kids Creche',
        registrationNumber: '7123456789', // PAYE reference
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `sars-file-test-${Date.now()}@test.co.za`,
      },
    });

    // Create test staff members
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
        basicSalaryCents: 2000000,
        isActive: true,
      },
    });

    testStaff2 = await prisma.staff.create({
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
        isActive: true,
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateEmp201Csv', () => {
    it('should call SimplePayTaxService.fetchEmp201() with correct parameters', async () => {
      await service.generateEmp201Csv(testTenant.id, 2025, 1);

      expect(simplePayTaxService.fetchEmp201).toHaveBeenCalledTimes(1);
      expect(simplePayTaxService.fetchEmp201).toHaveBeenCalledWith(
        testTenant.id,
        expect.any(Date),
      );

      // Verify the date is correct (January 2025)
      const calledDate = simplePayTaxService.fetchEmp201.mock.calls[0][1];
      expect(calledDate.getFullYear()).toBe(2025);
      expect(calledDate.getMonth()).toBe(0); // January is month 0
    });

    it('should generate valid CSV format with header and data lines', async () => {
      const result = await service.generateEmp201Csv(testTenant.id, 2025, 1);

      expect(result.content).toBeDefined();
      expect(result.filename).toBe('EMP201_7123456789_2025_01.csv');
      expect(result.contentType).toBe('text/csv');

      // Parse CSV lines
      const lines = result.content.split(CRLF);

      // Header line
      expect(lines[0]).toBe('EMP201,2025,1,7123456789,MONTHLY,0');

      // Data lines
      expect(lines[1]).toBe('PAYE_PAID,15000.00');
      expect(lines[2]).toBe('UIF_PAID,3540.00'); // 1770 + 1770
      expect(lines[3]).toBe('SDL_PAID,3500.00');
      expect(lines[4]).toBe('ETI_CLAIMED,500.00');
      expect(lines[5]).toBe('TOTAL_PAID,21540.00'); // 15000 + 3540 + 3500 - 500 = 21540
      expect(lines[6]).toBe('EMPLOYEE_COUNT,5');
    });

    it('should use CRLF line endings throughout the file', async () => {
      const result = await service.generateEmp201Csv(testTenant.id, 2025, 1);

      // Check that content contains CRLF (not just LF)
      expect(result.content).toContain(CRLF);

      // Check that file ends with CRLF
      expect(result.content.endsWith(CRLF)).toBe(true);

      // Verify no bare LF characters (all LF should be preceded by CR)
      const lines = result.content.split(CRLF);
      for (const line of lines.slice(0, -1)) {
        // Exclude empty last element after split
        expect(line).not.toContain('\n');
        expect(line).not.toContain('\r');
      }
    });

    it('should format amounts with 2 decimal places', async () => {
      simplePayTaxService.fetchEmp201.mockResolvedValue({
        ...mockEmp201Data,
        total_paye: 12345.6, // Only 1 decimal place
        total_sdl: 100, // No decimal places
      });

      const result = await service.generateEmp201Csv(testTenant.id, 2025, 1);
      const lines = result.content.split(CRLF);

      expect(lines[1]).toBe('PAYE_PAID,12345.60'); // Should have .60
      expect(lines[3]).toBe('SDL_PAID,100.00'); // Should have .00
    });

    it('should throw BadRequestException for invalid tax period < 1', async () => {
      await expect(
        service.generateEmp201Csv(testTenant.id, 2025, 0),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for invalid tax period > 12', async () => {
      await expect(
        service.generateEmp201Csv(testTenant.id, 2025, 13),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for non-existent tenant', async () => {
      await expect(
        service.generateEmp201Csv('non-existent-id', 2025, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle SimplePay service errors gracefully', async () => {
      simplePayTaxService.fetchEmp201.mockRejectedValue(
        new Error('SimplePay API error: Connection timeout'),
      );

      await expect(
        service.generateEmp201Csv(testTenant.id, 2025, 1),
      ).rejects.toThrow('SimplePay');
    });

    it('should use UNKNOWN for PAYE reference when tenant has none', async () => {
      // Create tenant without registration number
      const tenantNoRef = await prisma.tenant.create({
        data: {
          name: 'No Ref Tenant',
          addressLine1: '456 Test Ave',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27215551234',
          email: `no-ref-${Date.now()}@test.co.za`,
        },
      });

      const result = await service.generateEmp201Csv(tenantNoRef.id, 2025, 1);

      expect(result.content).toContain('UNKNOWN');
      expect(result.filename).toBe('EMP201_UNKNOWN_2025_01.csv');
    });

    it('should pad single-digit tax periods to 2 digits in filename', async () => {
      const result = await service.generateEmp201Csv(testTenant.id, 2025, 3);

      expect(result.filename).toBe('EMP201_7123456789_2025_03.csv');
    });
  });

  describe('generateEmp501Csv', () => {
    beforeEach(async () => {
      // Create SimplePay mappings for staff members
      await prisma.simplePayEmployeeMapping.create({
        data: {
          tenantId: testTenant.id,
          staffId: testStaff1.id,
          simplePayEmployeeId: 'sp-emp-001',
          syncStatus: SimplePaySyncStatus.SYNCED,
        },
      });

      // Create payroll records for UIF calculation
      await prisma.payroll.createMany({
        data: [
          {
            tenantId: testTenant.id,
            staffId: testStaff1.id,
            payPeriodStart: new Date('2025-03-01'),
            payPeriodEnd: new Date('2025-03-31'),
            basicSalaryCents: 2000000,
            grossSalaryCents: 2000000,
            payeCents: 250000,
            uifEmployeeCents: 17712,
            uifEmployerCents: 17712,
            netSalaryCents: 1732576,
            status: 'APPROVED',
          },
        ],
      });
    });

    it('should call SimplePayTaxService.fetchIrp5Certificates() for mapped employees', async () => {
      await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      expect(simplePayTaxService.fetchIrp5Certificates).toHaveBeenCalledWith(
        testTenant.id,
        testStaff1.id,
        2025,
      );
    });

    it('should generate valid CSV format with header, employees, and summary', async () => {
      const result = await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      expect(result.content).toBeDefined();
      expect(result.filename).toBe('EMP501_7123456789_2025.csv');
      expect(result.contentType).toBe('text/csv');

      const lines = result.content.split(CRLF);

      // Header line
      expect(lines[0]).toBe('EMP501,2025-03-01,2026-02-28,7123456789');

      // Should have employee records
      expect(result.content).toContain('EMPLOYEE,');

      // Should have summary lines
      expect(result.content).toContain('SUMMARY,TOTAL_GROSS,');
      expect(result.content).toContain('SUMMARY,TOTAL_PAYE,');
    });

    it('should use CRLF line endings throughout the file', async () => {
      const result = await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      expect(result.content).toContain(CRLF);
      expect(result.content.endsWith(CRLF)).toBe(true);
    });

    it('should skip employees without SimplePay mapping', async () => {
      // testStaff2 has no mapping, should be skipped
      const result = await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      // Should not contain testStaff2's data
      expect(result.content).not.toContain(testStaff2.idNumber);
      expect(result.content).not.toContain('Doe');
    });

    it('should throw BadRequestException for non-existent tenant', async () => {
      await expect(
        service.generateEmp501Csv(
          'non-existent-id',
          '2025-03-01',
          '2026-02-28',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle SimplePay service errors gracefully for IRP5 fetch', async () => {
      simplePayTaxService.fetchIrp5Certificates.mockRejectedValue(
        new Error('SimplePay API error'),
      );

      // Should not throw, but log warning and skip employee
      const result = await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      // Should still generate a valid CSV with summary
      expect(result.content).toContain('SUMMARY,TOTAL_GROSS,0.00');
    });

    it('should calculate correct totals from employee data', async () => {
      const result = await service.generateEmp501Csv(
        testTenant.id,
        '2025-03-01',
        '2026-02-28',
      );

      const lines = result.content.split(CRLF);

      // Find summary lines
      const totalGrossLine = lines.find((l) =>
        l.startsWith('SUMMARY,TOTAL_GROSS,'),
      );
      const totalPayeLine = lines.find((l) =>
        l.startsWith('SUMMARY,TOTAL_PAYE,'),
      );

      expect(totalGrossLine).toBe('SUMMARY,TOTAL_GROSS,240000.00');
      expect(totalPayeLine).toBe('SUMMARY,TOTAL_PAYE,30000.00');
    });
  });

  describe('CSV Format Validation', () => {
    it('should produce consistent output for same input', async () => {
      const result1 = await service.generateEmp201Csv(testTenant.id, 2025, 1);
      const result2 = await service.generateEmp201Csv(testTenant.id, 2025, 1);

      expect(result1.content).toBe(result2.content);
      expect(result1.filename).toBe(result2.filename);
    });

    it('should handle zero values correctly', async () => {
      simplePayTaxService.fetchEmp201.mockResolvedValue({
        period: '2025-01',
        total_paye: 0,
        total_sdl: 0,
        total_uif_employer: 0,
        total_uif_employee: 0,
        total_eti: 0,
        employees_count: 0,
      });

      const result = await service.generateEmp201Csv(testTenant.id, 2025, 1);
      const lines = result.content.split(CRLF);

      expect(lines[1]).toBe('PAYE_PAID,0.00');
      expect(lines[2]).toBe('UIF_PAID,0.00');
      expect(lines[3]).toBe('SDL_PAID,0.00');
      expect(lines[4]).toBe('ETI_CLAIMED,0.00');
      expect(lines[5]).toBe('TOTAL_PAID,0.00');
      expect(lines[6]).toBe('EMPLOYEE_COUNT,0');
    });

    it('should handle large values without scientific notation', async () => {
      simplePayTaxService.fetchEmp201.mockResolvedValue({
        period: '2025-01',
        total_paye: 12345678.99,
        total_sdl: 1234567.89,
        total_uif_employer: 123456.78,
        total_uif_employee: 123456.78,
        total_eti: 12345.67,
        employees_count: 1000,
      });

      const result = await service.generateEmp201Csv(testTenant.id, 2025, 1);

      expect(result.content).toContain('12345678.99');
      expect(result.content).not.toContain('e+');
      expect(result.content).not.toContain('E+');
    });
  });
});

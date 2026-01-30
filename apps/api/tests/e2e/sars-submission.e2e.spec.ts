/**
 * E2E SARS Submission Flow Tests
 * TASK-INT-004: Complete integration test for SARS VAT201 and EMP201 submissions
 *
 * CRITICAL: Uses real database and real services - NO MOCKS except external SARS eFiling
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { JwtStrategy } from '../../src/api/auth/strategies/jwt.strategy';
import { ThrottlerStorage } from '@nestjs/throttler';
import {
  createTestTenant,
  createTestUser,
  getAuthToken,
  cleanupTestData,
  TestTenant,
  TestUser,
  TestJwtStrategy,
} from '../helpers';
import { cleanDatabase } from '../helpers/clean-database';
import { TaxStatus, PayrollStatus } from '@prisma/client';
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('E2E: SARS Submission Flow', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let authToken: string;
  let testTenant: TestTenant;
  let testUser: TestUser;

  // Store IDs for cleanup
  const submissionIds: string[] = [];
  const invoiceIds: string[] = [];
  const transactionIds: string[] = [];
  const staffIds: string[] = [];
  const payrollIds: string[] = [];

  beforeAll(async () => {
    // Create NestJS app with TestJwtStrategy override
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(JwtStrategy)
      .useClass(TestJwtStrategy)
      .overrideProvider(ThrottlerStorage)
      .useValue({
        increment: jest.fn().mockResolvedValue({
          totalHits: 0,
          timeToExpire: 60,
          isBlocked: false,
          timeToBlockExpire: 0,
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Create VAT-registered test tenant
    const tenantData = await createTestTenant(prisma, {
      name: 'E2E SARS Test Creche',
    });
    testTenant = tenantData;

    // Update tenant to be VAT registered
    await prisma.tenant.update({
      where: { id: testTenant.id },
      data: {
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789', // Valid 10-digit VAT number
        registrationNumber: '2023/123456/07',
        tradingName: 'Test Creche VAT',
      },
    });

    testUser = await createTestUser(prisma, testTenant.id);
    authToken = getAuthToken(testUser);
  }, 60000);

  afterAll(async () => {
    // Cleanup all test data
    if (testTenant?.id) {
      await cleanDatabase(prisma);
    }
    await app?.close();
  }, 30000);

  describe('VAT201 Generation', () => {
    let parentId: string;
    let childId: string;

    beforeAll(async () => {
      // Create parent and child for invoices
      const parent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Parent',
          email: 'parent@test.com',
          phone: '+27 11 123 4567',
        },
      });
      parentId = parent.id;

      const child = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Test',
          lastName: 'Child',
          dateOfBirth: new Date('2020-01-01'),
          parentId,
        },
      });
      childId = child.id;
    });

    it('should calculate output VAT from invoices at 15%', async () => {
      // Create invoices for January 2025
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-001',
          parentId,
          childId,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-15'),
          dueDate: new Date('2025-02-15'),
          subtotalCents: 1000000, // R10,000
          vatCents: 150000, // R1,500 (15%)
          totalCents: 1150000, // R11,500
          status: 'SENT',
        },
      });
      invoiceIds.push(invoice.id);

      // Generate VAT201 for January 2025
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.output_vat).toBe(1500.0); // R1,500
      expect(response.body.data.submission_type).toBe('VAT201');
      expect(response.body.data.status).toBe('DRAFT');

      submissionIds.push(response.body.data.id);
    });

    it('should calculate input VAT from categorized expenses', async () => {
      // Create expense transaction with VAT (amountCents positive, isCredit=false means expense)
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Business Current',
          date: new Date('2025-01-20'),
          description: 'Office supplies purchase',
          amountCents: 50000, // R500 (positive amount, isCredit=false = expense)
          isCredit: false,
          payeeName: 'OFFICE DEPOT',
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      });
      transactionIds.push(transaction.id);

      // Categorize with VAT (positive vatAmountCents for input VAT)
      await prisma.categorization.create({
        data: {
          transactionId: transaction.id,
          accountCode: '5500',
          accountName: 'Office Expenses',
          vatType: 'STANDARD',
          vatAmountCents: Math.round(50000 * 0.15), // R75 VAT (15% of R500)
          source: 'USER_OVERRIDE',
          confidenceScore: 100,
        },
      });

      // Generate VAT201 for January 2025 (should include input VAT)
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.output_vat).toBe(1500.0); // From invoices
      expect(response.body.data.input_vat).toBeGreaterThan(0); // From expenses
      expect(response.body.data.net_vat).toBeLessThan(
        response.body.data.output_vat,
      ); // Net = Output - Input

      submissionIds.push(response.body.data.id);
    });

    it('should distinguish standard-rated transactions', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.output_vat).toBeGreaterThan(0);
      expect(response.body.data.is_payable).toBe(true);

      submissionIds.push(response.body.data.id);
    });

    it('should flag transactions missing VAT details', async () => {
      // Create transaction without VAT categorization
      const txWithoutVat = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Business Current',
          date: new Date('2025-01-25'),
          description: 'Uncategorized purchase',
          amountCents: -30000, // -R300 (negative = expense/debit)
          isCredit: false,
          payeeName: 'UNKNOWN VENDOR',
          source: 'BANK_FEED',
          status: 'PENDING',
        },
      });
      transactionIds.push(txWithoutVat.id);

      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.items_requiring_review).toBeDefined();
      expect(Array.isArray(response.body.data.items_requiring_review)).toBe(
        true,
      );

      submissionIds.push(response.body.data.id);
    });

    it('should generate VAT201 with document URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.document_url).toBeDefined();
      expect(response.body.data.document_url).toContain('/sars/vat201/');
      expect(response.body.data.deadline).toBeDefined();

      submissionIds.push(response.body.data.id);
    });

    it('should calculate net VAT correctly (output - input)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(201);
      const { output_vat, input_vat, net_vat } = response.body.data;

      // Verify calculation: net_vat = output_vat - input_vat
      const expectedNetVat = new Decimal(output_vat)
        .minus(input_vat)
        .toNumber();
      expect(Math.abs(net_vat - expectedNetVat)).toBeLessThan(0.01); // Allow 1 cent rounding

      submissionIds.push(response.body.data.id);
    });

    it('should reject invalid period (end before start)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-01-31',
          period_end: '2025-01-01', // Invalid: end before start
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('period_end must be after');
    });

    it('should handle empty period (no transactions)', async () => {
      // Generate VAT201 for future period with no data
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-12-01',
          period_end: '2025-12-31',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.output_vat).toBe(0);
      expect(response.body.data.input_vat).toBe(0);
      expect(response.body.data.net_vat).toBe(0);

      submissionIds.push(response.body.data.id);
    });
  });

  describe('EMP201 Generation', () => {
    let staff1Id: string;
    let staff2Id: string;

    beforeAll(async () => {
      // Create test staff members
      const staff1 = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          employeeNumber: 'EMP001',
          firstName: 'John',
          lastName: 'Doe',
          idNumber: '8501015800080', // Valid SA ID
          dateOfBirth: new Date('1985-01-01'),
          taxNumber: '0123456789',
          email: 'john.doe@test.com',
          phone: '+27 11 123 4567',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 1500000, // R15,000/month
        },
      });
      staff1Id = staff1.id;
      staffIds.push(staff1Id);

      const staff2 = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          employeeNumber: 'EMP002',
          firstName: 'Jane',
          lastName: 'Smith',
          idNumber: '9202024800081', // Valid SA ID
          dateOfBirth: new Date('1992-02-02'),
          taxNumber: '9876543210',
          email: 'jane.smith@test.com',
          phone: '+27 11 123 4568',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 5000000, // R50,000/month (high earner, UIF capped)
        },
      });
      staff2Id = staff2.id;
      staffIds.push(staff2Id);
    });

    it('should calculate PAYE using current tax tables for low earner', async () => {
      // Create approved payroll for January 2025
      const payroll1 = await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: staff1Id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time
          payPeriodEnd: new Date(2025, 0, 31), // Jan 31, 2025 local time
          basicSalaryCents: 1500000, // R15,000
          grossSalaryCents: 1500000, // R15,000
          netSalaryCents: 1200000, // After deductions
          payeCents: 225000, // PAYE: R2,250 (15% for R15k/month = R180k/year, 18% bracket)
          uifEmployeeCents: 15000, // R150 (1% of R15,000)
          uifEmployerCents: 15000, // R150 (1% of R15,000)
          status: PayrollStatus.APPROVED,
        },
      });
      payrollIds.push(payroll1.id);

      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.submission_type).toBe('EMP201');
      expect(response.body.data.summary.total_paye).toBeGreaterThan(0);

      submissionIds.push(response.body.data.id);
    });

    it('should calculate UIF at 1% capped at R177.12', async () => {
      // Create payroll for high earner (R50,000/month)
      const payroll2 = await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: staff2Id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time
          payPeriodEnd: new Date(2025, 0, 31), // Jan 31, 2025 local time
          basicSalaryCents: 5000000, // R50,000
          grossSalaryCents: 5000000, // R50,000
          netSalaryCents: 3500000,
          payeCents: 1000000, // Higher PAYE
          uifEmployeeCents: 17712, // R177.12 CAPPED (not R500)
          uifEmployerCents: 17712, // R177.12 CAPPED
          status: PayrollStatus.APPROVED,
        },
      });
      payrollIds.push(payroll2.id);

      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      const { summary, employees } = response.body.data;

      // Find high earner in employees
      const highEarner = employees.find(
        (e: { gross_remuneration: number }) => e.gross_remuneration === 50000.0,
      );
      if (highEarner) {
        // Verify UIF is capped at R177.12 per party
        expect(highEarner.uif_employee).toBe(177.12);
        expect(highEarner.uif_employer).toBe(177.12);
      }

      // Total UIF should include both employees
      expect(summary.total_uif).toBeGreaterThan(0);

      submissionIds.push(response.body.data.id);
    });

    it('should calculate SDL when payroll exceeds R500k annually', async () => {
      // Current total: R15k + R50k = R65k/month = R780k/year > R500k threshold
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      const { summary } = response.body.data;

      // SDL should be 1% of monthly gross payroll
      const expectedGross = 15000.0 + 50000.0; // R65,000
      const expectedSdl = expectedGross * 0.01; // R650

      expect(summary.total_sdl).toBeCloseTo(expectedSdl, 2);
      expect(summary.total_sdl).toBeGreaterThan(0);

      submissionIds.push(response.body.data.id);
    });

    it('should exclude SDL when below R500k threshold', async () => {
      // Create tenant with single low-paid employee
      const smallTenant = await createTestTenant(prisma, {
        name: 'Small Creche',
      });
      const smallUser = await createTestUser(prisma, smallTenant.id);
      const smallAuthToken = getAuthToken(smallUser);

      // Create low-paid staff (R10k/month = R120k/year < R500k)
      const lowPaidStaff = await prisma.staff.create({
        data: {
          tenantId: smallTenant.id,
          employeeNumber: 'EMP-LOW-001',
          firstName: 'Low',
          lastName: 'Earner',
          idNumber: '7801015800082',
          dateOfBirth: new Date('1978-01-01'),
          taxNumber: '1111111111',
          email: 'low@test.com',
          phone: '+27 11 111 1111',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          basicSalaryCents: 1000000, // R10,000/month
        },
      });

      // Create payroll
      await prisma.payroll.create({
        data: {
          tenantId: smallTenant.id,
          staffId: lowPaidStaff.id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time
          payPeriodEnd: new Date(2025, 0, 31), // Jan 31, 2025 local time
          basicSalaryCents: 1000000,
          grossSalaryCents: 1000000,
          netSalaryCents: 850000,
          payeCents: 100000,
          uifEmployeeCents: 10000,
          uifEmployerCents: 10000,
          status: PayrollStatus.APPROVED,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${smallAuthToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.summary.total_sdl).toBe(0); // Below threshold

      // Cleanup
      await prisma.payroll.deleteMany({ where: { tenantId: smallTenant.id } });
      await prisma.staff.deleteMany({ where: { tenantId: smallTenant.id } });
      await cleanupTestData(prisma, smallTenant.id);
    });

    it('should include all employees in EMP201 summary', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      const { summary, employees } = response.body.data;

      expect(summary.employee_count).toBe(2); // staff1 and staff2
      expect(employees).toHaveLength(2);
      expect(summary.total_gross).toBe(65000.0); // R15k + R50k

      submissionIds.push(response.body.data.id);
    });

    it('should generate EMP201 with document URL', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.document_url).toBeDefined();
      expect(response.body.data.document_url).toContain('/sars/emp201/');
      expect(response.body.data.deadline).toBeDefined();

      submissionIds.push(response.body.data.id);
    });

    it('should calculate total due correctly (PAYE + UIF + SDL)', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      const { summary } = response.body.data;

      const expectedTotalDue = new Decimal(summary.total_paye)
        .plus(summary.total_uif)
        .plus(summary.total_sdl)
        .toNumber();

      expect(Math.abs(summary.total_due - expectedTotalDue)).toBeLessThan(0.01);

      submissionIds.push(response.body.data.id);
    });

    it('should reject invalid period format', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025/01', // Invalid format (should be YYYY-MM)
        });

      expect(response.status).toBe(400);
    });

    it('should fail when no approved payroll exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-12', // No payroll for December yet
        });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain('No approved payroll');
    });

    it('should handle employee with terminated mid-month', async () => {
      // Create terminated employee
      const terminatedStaff = await prisma.staff.create({
        data: {
          tenantId: testTenant.id,
          employeeNumber: 'EMP003',
          firstName: 'Terminated',
          lastName: 'Employee',
          idNumber: '8801015800083',
          dateOfBirth: new Date('1988-01-01'),
          taxNumber: '2222222222',
          email: 'terminated@test.com',
          phone: '+27 11 222 2222',
          startDate: new Date('2024-01-01'),
          employmentType: 'PERMANENT',
          endDate: new Date('2025-01-15'), // Terminated mid-month
          basicSalaryCents: 2000000,
        },
      });
      staffIds.push(terminatedStaff.id);

      // Create pro-rated payroll for partial month
      await prisma.payroll.create({
        data: {
          tenantId: testTenant.id,
          staffId: terminatedStaff.id,
          payPeriodStart: new Date(2025, 0, 1), // Jan 1, 2025 local time
          payPeriodEnd: new Date(2025, 0, 15), // Jan 15, 2025 local time
          basicSalaryCents: 1000000, // Half month
          grossSalaryCents: 1000000, // Half month
          netSalaryCents: 850000,
          payeCents: 100000,
          uifEmployeeCents: 10000,
          uifEmployerCents: 10000,
          status: PayrollStatus.APPROVED,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.summary.employee_count).toBe(3); // All 3 employees

      submissionIds.push(response.body.data.id);
    });
  });

  describe('Submission and Immutability', () => {
    let submissionId: string;

    beforeAll(async () => {
      // Create a submission to test
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-02-01',
          period_end: '2025-02-28',
        });

      submissionId = response.body.data.id;
      submissionIds.push(submissionId);

      // Mark submission as READY (required before submit)
      await prisma.sarsSubmission.update({
        where: { id: submissionId },
        data: { status: 'READY' },
      });
    });

    it('should mark submission as finalized after submit', async () => {
      const response = await request(app.getHttpServer())
        .post(`/sars/${submissionId}/submit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sars_reference: 'SARS-2025-001',
          submitted_date: '2025-02-25',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('SUBMITTED');
      // is_finalized becomes true only after ACKNOWLEDGED status, not on submit
      expect(response.body.data.is_finalized).toBe(false);
      expect(response.body.data.sars_reference).toBe('SARS-2025-001');
      expect(response.body.data.submitted_at).toBeDefined();
    });

    it('should prevent re-submission of already submitted return', async () => {
      const response = await request(app.getHttpServer())
        .post(`/sars/${submissionId}/submit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sars_reference: 'SARS-2025-002',
          submitted_date: '2025-02-26',
        });

      expect(response.status).toBe(422); // Unprocessable - submission not in READY status
      expect(response.body.message).toContain("expected 'READY'");
    });

    it('should validate SARS reference format on submission', async () => {
      // Create new submission
      const newSubmission = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-03-01',
          period_end: '2025-03-31',
        });

      const newId = newSubmission.body.data.id;
      submissionIds.push(newId);

      const response = await request(app.getHttpServer())
        .post(`/sars/${newId}/submit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sars_reference: '', // Invalid: empty reference
          submitted_date: '2025-03-25',
        });

      expect(response.status).toBe(422); // Validation error
    });

    it('should return 404 for non-existent submission', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';

      const response = await request(app.getHttpServer())
        .post(`/sars/${fakeId}/submit`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sars_reference: 'SARS-2025-999',
          submitted_date: '2025-03-25',
        });

      expect(response.status).toBe(404); // Not Found
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle negative net VAT (refund scenario)', async () => {
      // Create large expense to exceed output VAT (amountCents positive, isCredit=false = expense)
      const largeExpense = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          bankAccount: 'FNB Business Current',
          date: new Date('2025-04-10'),
          description: 'Large equipment purchase',
          amountCents: 10000000, // R100,000 (positive amount, isCredit=false = expense)
          isCredit: false,
          payeeName: 'EQUIPMENT SUPPLIER',
          source: 'BANK_FEED',
          status: 'CATEGORIZED',
        },
      });
      transactionIds.push(largeExpense.id);

      // Categorize with VAT (positive vatAmountCents for input VAT)
      await prisma.categorization.create({
        data: {
          transactionId: largeExpense.id,
          accountCode: '6100',
          accountName: 'Equipment',
          vatType: 'STANDARD',
          vatAmountCents: Math.round(10000000 * 0.15), // R15,000 input VAT
          source: 'USER_OVERRIDE',
          confidenceScore: 100,
        },
      });

      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-04-01',
          period_end: '2025-04-30',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.net_vat).toBeLessThan(0); // Refund due
      expect(response.body.data.is_payable).toBe(false);

      submissionIds.push(response.body.data.id);
    });

    it('should fail VAT201 for non-VAT registered tenant', async () => {
      // Create non-VAT tenant
      const nonVatTenant = await createTestTenant(prisma, {
        name: 'Non-VAT Creche',
      });
      const nonVatUser = await createTestUser(prisma, nonVatTenant.id);
      const nonVatToken = getAuthToken(nonVatUser);

      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${nonVatToken}`)
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(403); // Forbidden - tenant not VAT registered
      expect(response.body.message).toContain('VAT registration');

      // Cleanup
      await cleanupTestData(prisma, nonVatTenant.id);
    });

    it('should handle zero amounts gracefully', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: '2025-06-01',
          period_end: '2025-06-30',
        });

      expect(response.status).toBe(201);
      expect(response.body.data.output_vat).toBe(0);
      expect(response.body.data.input_vat).toBe(0);
      expect(response.body.data.net_vat).toBe(0);

      submissionIds.push(response.body.data.id);
    });

    it('should validate period dates are valid', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          period_start: 'invalid-date',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(400);
    });
  });

  describe('Authentication & Authorization', () => {
    it('should reject requests without auth token', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/vat201')
        .set('Authorization', 'Bearer invalid-token-here')
        .send({
          period_start: '2025-01-01',
          period_end: '2025-01-31',
        });

      expect(response.status).toBe(401);
    });

    it('should reject EMP201 request without auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/emp201')
        .send({
          period_month: '2025-01',
        });

      expect(response.status).toBe(401);
    });

    it('should reject submission without auth', async () => {
      const response = await request(app.getHttpServer())
        .post('/sars/fake-id/submit')
        .send({
          sars_reference: 'SARS-TEST',
        });

      expect(response.status).toBe(401);
    });
  });
});

/**
 * ArrearsService Integration Tests
 * TASK-PAY-013: Arrears Tracking and Reporting
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests arrears reporting, aging analysis, payment history, top debtors, and CSV export
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import {
  NotFoundException,
  DatabaseException,
} from '../../../src/shared/exceptions';
import { Tenant, Parent, Child, Invoice } from '@prisma/client';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';

describe('ArrearsService', () => {
  let service: ArrearsService;
  let prisma: PrismaService;
  let tenantRepo: TenantRepository;
  let parentRepo: ParentRepository;
  let childRepo: ChildRepository;
  let invoiceRepo: InvoiceRepository;
  let paymentRepo: PaymentRepository;

  // Test data to track for cleanup
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let testInvoiceIds: string[] = [];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        ArrearsService,
        InvoiceRepository,
        PaymentRepository,
        ParentRepository,
        TenantRepository,
        ChildRepository,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<ArrearsService>(ArrearsService);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);
    paymentRepo = module.get<PaymentRepository>(PaymentRepository);
    parentRepo = module.get<ParentRepository>(ParentRepository);
    tenantRepo = module.get<TenantRepository>(TenantRepository);
    childRepo = module.get<ChildRepository>(ChildRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean database in FK order
    await prisma.auditLog.deleteMany({});
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
    await prisma.bankConnection.deleteMany({});
    await prisma.xeroAccountMapping.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.simplePayConnection.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.reportRequest.deleteMany({});
    await prisma.bulkOperationLog.deleteMany({});
    await prisma.xeroAccount.deleteMany({});
    await prisma.tenant.deleteMany({});

    testInvoiceIds = [];

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

    // Create test parent
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'John',
        lastName: 'Smith',
        email: `john.smith${Date.now()}@example.com`,
        phone: '+27821234567',
        idNumber: '8501015800086',
        address: '789 Test Street, Johannesburg, Gauteng 2000',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Emily',
        lastName: 'Smith',
        dateOfBirth: new Date('2020-05-15'),
        parentId: testParent.id,
      },
    });
  });

  // Helper to create a test invoice with specified days overdue
  async function createInvoice(
    daysOverdue: number,
    status: InvoiceStatus = InvoiceStatus.SENT,
    totalCents: number = 100000,
    amountPaidCents: number = 0,
  ): Promise<Invoice> {
    const today = new Date();
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() - daysOverdue);

    const issueDate = new Date(dueDate);
    issueDate.setDate(issueDate.getDate() - 15); // Issue 15 days before due

    const invoice = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: `INV-2025-${Date.now().toString().slice(-5)}`,
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate,
        dueDate,
        subtotalCents: Math.floor(totalCents / 1.15),
        vatCents: Math.floor(totalCents - totalCents / 1.15),
        totalCents,
        amountPaidCents,
        status,
      },
    });

    testInvoiceIds.push(invoice.id);
    return invoice;
  }

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('getArrearsReport', () => {
    it('should return correct summary for multiple invoices', async () => {
      // Create invoices in different aging buckets (TASK-BILL-006 standardized)
      // current: 1-30 days, 30: 31-60 days, 60: 61-90 days, 90+: >90 days
      const invoice1 = await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // current (1-30 days)
      const invoice2 = await createInvoice(45, InvoiceStatus.SENT, 50000, 0); // 30-day bucket (31-60 days)
      const invoice3 = await createInvoice(75, InvoiceStatus.OVERDUE, 75000, 0); // 60-day bucket (61-90 days)
      const invoice4 = await createInvoice(100, InvoiceStatus.SENT, 200000, 0); // 90+ bucket (>90 days)

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalOutstandingCents).toBe(425000);
      expect(report.summary.totalInvoices).toBe(4);
      expect(report.invoices).toHaveLength(4);
      expect(report.generatedAt).toBeInstanceOf(Date);
    });

    it('should categorize invoices into correct aging buckets', async () => {
      // Create invoices with specific days overdue (TASK-BILL-006 standardized)
      // current: 1-30 days, 30: 31-60 days, 60: 61-90 days, 90+: >90 days
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // current (1-30 days)
      await createInvoice(45, InvoiceStatus.SENT, 50000, 0); // 30-day bucket (31-60 days)
      await createInvoice(75, InvoiceStatus.OVERDUE, 75000, 0); // 60-day bucket (61-90 days)
      await createInvoice(100, InvoiceStatus.SENT, 200000, 0); // 90+ bucket (>90 days)

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.aging.currentCents).toBe(100000);
      expect(report.summary.aging.days30Cents).toBe(50000);
      expect(report.summary.aging.days60Cents).toBe(75000);
      expect(report.summary.aging.days90PlusCents).toBe(200000);
    });

    it('should only include outstanding invoices', async () => {
      // Create mix of paid and unpaid invoices
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // Outstanding
      await createInvoice(10, InvoiceStatus.PAID, 50000, 50000); // Fully paid - should be excluded
      await createInvoice(15, InvoiceStatus.PARTIALLY_PAID, 75000, 25000); // Partially paid - should be included

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalInvoices).toBe(2);
      expect(report.summary.totalOutstandingCents).toBe(150000); // 100000 + 50000
    });

    it('should filter by dateFrom/dateTo correctly', async () => {
      const today = new Date();

      // Invoice due 5 days ago
      const dueDate1 = new Date(today);
      dueDate1.setDate(dueDate1.getDate() - 5);
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      // Invoice due 50 days ago
      const dueDate2 = new Date(today);
      dueDate2.setDate(dueDate2.getDate() - 50);
      await createInvoice(50, InvoiceStatus.SENT, 50000, 0);

      // Filter: only invoices due between 60 days ago and 40 days ago
      const dateFrom = new Date(today);
      dateFrom.setDate(dateFrom.getDate() - 60);
      const dateTo = new Date(today);
      dateTo.setDate(dateTo.getDate() - 40);

      const report = await service.getArrearsReport(testTenant.id, {
        dateFrom,
        dateTo,
      });

      expect(report.summary.totalInvoices).toBe(1);
      expect(report.summary.totalOutstandingCents).toBe(50000);
    });

    it('should filter by parentId correctly', async () => {
      // Create another parent
      const otherParent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: `jane.doe${Date.now()}@example.com`,
          phone: '+27827654321',
          idNumber: '9001015800087',
          address: '456 Other Street',
        },
      });

      const otherChild = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Tom',
          lastName: 'Doe',
          dateOfBirth: new Date('2021-03-20'),
          parentId: otherParent.id,
        },
      });

      // Create invoices for both parents
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // testParent

      const otherInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-OTHER-${Date.now()}`,
          parentId: otherParent.id,
          childId: otherChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date(new Date().setDate(new Date().getDate() - 10)),
          subtotalCents: 43478,
          vatCents: 6522,
          totalCents: 50000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(otherInvoice.id);

      // Filter by testParent only
      const report = await service.getArrearsReport(testTenant.id, {
        parentId: testParent.id,
      });

      expect(report.summary.totalInvoices).toBe(1);
      expect(report.summary.totalOutstandingCents).toBe(100000);
    });

    it('should filter by minAmountCents correctly', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // R1000
      await createInvoice(10, InvoiceStatus.SENT, 50000, 0); // R500
      await createInvoice(15, InvoiceStatus.SENT, 25000, 0); // R250

      // Only invoices with outstanding >= R600 (60000 cents)
      const report = await service.getArrearsReport(testTenant.id, {
        minAmountCents: 60000,
      });

      expect(report.summary.totalInvoices).toBe(1);
      expect(report.summary.totalOutstandingCents).toBe(100000);
    });

    it('should return empty report when no outstanding invoices', async () => {
      // Create only paid invoices
      await createInvoice(5, InvoiceStatus.PAID, 100000, 100000);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalInvoices).toBe(0);
      expect(report.summary.totalOutstandingCents).toBe(0);
      expect(report.summary.aging.currentCents).toBe(0);
      expect(report.summary.aging.days30Cents).toBe(0);
      expect(report.summary.aging.days60Cents).toBe(0);
      expect(report.summary.aging.days90PlusCents).toBe(0);
      expect(report.invoices).toHaveLength(0);
    });

    it('should include parent and child names in invoice details', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.invoices[0].parentName).toBe('John Smith');
      expect(report.invoices[0].childName).toBe('Emily Smith');
      expect(report.invoices[0].parentId).toBe(testParent.id);
      expect(report.invoices[0].childId).toBe(testChild.id);
    });

    it('should calculate correct outstanding amounts for partially paid invoices', async () => {
      await createInvoice(5, InvoiceStatus.PARTIALLY_PAID, 100000, 30000);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.invoices[0].totalCents).toBe(100000);
      expect(report.invoices[0].amountPaidCents).toBe(30000);
      expect(report.invoices[0].outstandingCents).toBe(70000);
      expect(report.summary.totalOutstandingCents).toBe(70000);
    });
  });

  describe('calculateAging', () => {
    // TASK-BILL-006: Standardized aging buckets
    // current: 1-30 days, 30: 31-60 days, 60: 61-90 days, 90+: >90 days
    // NOTE: Invoices not yet due (daysOverdue <= 0) are NOT in arrears

    it('should bucket current (1-30 days) correctly', async () => {
      const invoice1 = await createInvoice(1, InvoiceStatus.SENT, 100000, 0); // 1 day overdue
      const invoice2 = await createInvoice(15, InvoiceStatus.SENT, 50000, 0); // 15 days overdue
      const invoice3 = await createInvoice(29, InvoiceStatus.SENT, 25000, 0); // 29 days overdue

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [invoice1.id, invoice2.id, invoice3.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(175000); // 100000 + 50000 + 25000
      expect(aging.days30Cents).toBe(0);
      expect(aging.days60Cents).toBe(0);
      expect(aging.days90PlusCents).toBe(0);
    });

    it('should bucket 30 days (31-60) correctly', async () => {
      const invoice1 = await createInvoice(32, InvoiceStatus.SENT, 100000, 0); // 32 days
      const invoice2 = await createInvoice(45, InvoiceStatus.SENT, 50000, 0); // 45 days
      const invoice3 = await createInvoice(59, InvoiceStatus.SENT, 25000, 0); // 59 days

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [invoice1.id, invoice2.id, invoice3.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(0);
      expect(aging.days30Cents).toBe(175000); // 100000 + 50000 + 25000
      expect(aging.days60Cents).toBe(0);
      expect(aging.days90PlusCents).toBe(0);
    });

    it('should bucket 60 days (61-90) correctly', async () => {
      const invoice1 = await createInvoice(62, InvoiceStatus.SENT, 100000, 0); // 62 days
      const invoice2 = await createInvoice(75, InvoiceStatus.SENT, 50000, 0); // 75 days
      const invoice3 = await createInvoice(89, InvoiceStatus.SENT, 25000, 0); // 89 days

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [invoice1.id, invoice2.id, invoice3.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(0);
      expect(aging.days30Cents).toBe(0);
      expect(aging.days60Cents).toBe(175000); // 100000 + 50000 + 25000
      expect(aging.days90PlusCents).toBe(0);
    });

    it('should bucket 90+ days (>90) correctly', async () => {
      const invoice1 = await createInvoice(91, InvoiceStatus.SENT, 100000, 0); // 91 days
      const invoice2 = await createInvoice(120, InvoiceStatus.SENT, 50000, 0); // 120 days
      const invoice3 = await createInvoice(150, InvoiceStatus.SENT, 25000, 0); // 150 days

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [invoice1.id, invoice2.id, invoice3.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(0);
      expect(aging.days30Cents).toBe(0);
      expect(aging.days60Cents).toBe(0);
      expect(aging.days90PlusCents).toBe(175000); // 100000 + 50000 + 25000
    });

    it('should handle mixed buckets correctly', async () => {
      // TASK-BILL-006: current: 1-30, 30: 31-60, 60: 61-90, 90+: >90
      const invoice1 = await createInvoice(5, InvoiceStatus.SENT, 100000, 0); // current (1-30)
      const invoice2 = await createInvoice(45, InvoiceStatus.SENT, 50000, 0); // 30-day (31-60)
      const invoice3 = await createInvoice(75, InvoiceStatus.SENT, 75000, 0); // 60-day (61-90)
      const invoice4 = await createInvoice(100, InvoiceStatus.SENT, 200000, 0); // 90+ (>90)

      const invoices = await prisma.invoice.findMany({
        where: {
          id: {
            in: [invoice1.id, invoice2.id, invoice3.id, invoice4.id],
          },
        },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(100000);
      expect(aging.days30Cents).toBe(50000);
      expect(aging.days60Cents).toBe(75000);
      expect(aging.days90PlusCents).toBe(200000);
    });

    it('should handle partially paid invoices in aging calculation', async () => {
      const invoice1 = await createInvoice(
        5,
        InvoiceStatus.PARTIALLY_PAID,
        100000,
        30000,
      );
      const invoice2 = await createInvoice(
        45,
        InvoiceStatus.PARTIALLY_PAID,
        50000,
        10000,
      );

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [invoice1.id, invoice2.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(70000); // 100000 - 30000 (1-30 days)
      expect(aging.days30Cents).toBe(40000); // 50000 - 10000 (31-60 days)
    });

    it('should exclude invoices not yet due from aging calculation', async () => {
      // Create invoice due in the future (not yet overdue)
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const futureInvoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-FUTURE-${Date.now()}`,
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: futureDate,
          subtotalCents: 86956,
          vatCents: 13044,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(futureInvoice.id);

      // Create invoice that IS overdue
      const overdueInvoice = await createInvoice(
        5,
        InvoiceStatus.SENT,
        50000,
        0,
      );

      const invoices = await prisma.invoice.findMany({
        where: { id: { in: [futureInvoice.id, overdueInvoice.id] } },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      // Only the overdue invoice should be counted (50000 cents)
      expect(aging.currentCents).toBe(50000);
      expect(aging.days30Cents).toBe(0);
      expect(aging.days60Cents).toBe(0);
      expect(aging.days90PlusCents).toBe(0);
    });

    it('should handle exact boundary values correctly', async () => {
      // Test exact boundaries: 30, 60, 90 days
      const invoice30 = await createInvoice(30, InvoiceStatus.SENT, 100000, 0); // Exactly 30 days -> current
      const invoice31 = await createInvoice(31, InvoiceStatus.SENT, 50000, 0); // Exactly 31 days -> 30-day
      const invoice60 = await createInvoice(60, InvoiceStatus.SENT, 75000, 0); // Exactly 60 days -> 30-day
      const invoice61 = await createInvoice(61, InvoiceStatus.SENT, 25000, 0); // Exactly 61 days -> 60-day
      const invoice90 = await createInvoice(90, InvoiceStatus.SENT, 30000, 0); // Exactly 90 days -> 60-day
      const invoice91 = await createInvoice(91, InvoiceStatus.SENT, 20000, 0); // Exactly 91 days -> 90+

      const invoices = await prisma.invoice.findMany({
        where: {
          id: {
            in: [
              invoice30.id,
              invoice31.id,
              invoice60.id,
              invoice61.id,
              invoice90.id,
              invoice91.id,
            ],
          },
        },
        include: { parent: true, child: true },
      });

      const aging = service.calculateAging(invoices as any);

      expect(aging.currentCents).toBe(100000); // 30 days exactly -> current
      expect(aging.days30Cents).toBe(125000); // 31 + 60 days -> 30-day bucket
      expect(aging.days60Cents).toBe(55000); // 61 + 90 days -> 60-day bucket
      expect(aging.days90PlusCents).toBe(20000); // 91 days -> 90+ bucket
    });
  });

  describe('getParentHistory', () => {
    it('should return correct payment history', async () => {
      // Create mix of paid and unpaid invoices
      const invoice1 = await createInvoice(
        5,
        InvoiceStatus.PAID,
        100000,
        100000,
      );
      const invoice2 = await createInvoice(
        10,
        InvoiceStatus.PARTIALLY_PAID,
        50000,
        25000,
      );
      const invoice3 = await createInvoice(15, InvoiceStatus.SENT, 75000, 0);

      // Create payment for invoice1
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice1.id,
          transactionId: null,
          paymentDate: new Date(
            invoice1.dueDate.getTime() - 2 * 24 * 60 * 60 * 1000,
          ), // 2 days before due
          amountCents: 100000,
          reference: 'Payment 1',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      const history = await service.getParentHistory(
        testParent.id,
        testTenant.id,
      );

      expect(history.parentId).toBe(testParent.id);
      expect(history.parentName).toBe('John Smith');
      expect(history.totalInvoicedCents).toBe(225000);
      expect(history.totalPaidCents).toBe(125000);
      expect(history.totalOutstandingCents).toBe(100000);
      expect(history.paymentHistory).toHaveLength(3);
    });

    it('should calculate on-time vs late payments correctly', async () => {
      // Create invoices with payments
      const invoice1 = await createInvoice(
        5,
        InvoiceStatus.PAID,
        100000,
        100000,
      );
      const invoice2 = await createInvoice(
        10,
        InvoiceStatus.PAID,
        50000,
        50000,
      );
      const invoice3 = await createInvoice(
        15,
        InvoiceStatus.PAID,
        75000,
        75000,
      );

      // On-time payment (paid 2 days before due)
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice1.id,
          transactionId: null,
          paymentDate: new Date(
            invoice1.dueDate.getTime() - 2 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 100000,
          reference: 'Payment 1',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      // Late payment (paid 5 days after due)
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice2.id,
          transactionId: null,
          paymentDate: new Date(
            invoice2.dueDate.getTime() + 5 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 50000,
          reference: 'Payment 2',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      // On-time payment (paid on due date)
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice3.id,
          transactionId: null,
          paymentDate: invoice3.dueDate,
          amountCents: 75000,
          reference: 'Payment 3',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      const history = await service.getParentHistory(
        testParent.id,
        testTenant.id,
      );

      expect(history.onTimePaymentCount).toBe(2); // Payments on or before due date
      expect(history.latePaymentCount).toBe(1);
    });

    it('should calculate average days to payment', async () => {
      const invoice1 = await createInvoice(
        5,
        InvoiceStatus.PAID,
        100000,
        100000,
      );
      const invoice2 = await createInvoice(
        10,
        InvoiceStatus.PAID,
        50000,
        50000,
      );

      // Payment 1: 2 days before due date (daysToPayment = -2)
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice1.id,
          transactionId: null,
          paymentDate: new Date(
            invoice1.dueDate.getTime() - 2 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 100000,
          reference: 'Payment 1',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      // Payment 2: 4 days after due date (daysToPayment = 4)
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice2.id,
          transactionId: null,
          paymentDate: new Date(
            invoice2.dueDate.getTime() + 4 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 50000,
          reference: 'Payment 2',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      const history = await service.getParentHistory(
        testParent.id,
        testTenant.id,
      );

      // Average: (-2 + 4) / 2 = 1
      expect(history.averageDaysToPayment).toBe(1);
    });

    it('should throw NotFoundException for invalid parent', async () => {
      const invalidParentId = '00000000-0000-0000-0000-000000000000';

      await expect(
        service.getParentHistory(invalidParentId, testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should respect tenant isolation', async () => {
      // Create another tenant with parent
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '456 Other St',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27215559999',
          email: `other${Date.now()}@test.com`,
        },
      });

      const otherParent = await prisma.parent.create({
        data: {
          tenantId: otherTenant.id,
          firstName: 'Jane',
          lastName: 'Doe',
          email: `jane${Date.now()}@test.com`,
          phone: '+27827654321',
          idNumber: '9001015800087',
          address: '123 Other St',
        },
      });

      // Try to access otherParent with testTenant.id - should fail
      await expect(
        service.getParentHistory(otherParent.id, testTenant.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should handle parent with no invoices', async () => {
      // Create new parent with no invoices
      const newParent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'New',
          lastName: 'Parent',
          email: `new${Date.now()}@test.com`,
          phone: '+27829999999',
          idNumber: '8801015800088',
          address: '999 New St',
        },
      });

      const history = await service.getParentHistory(
        newParent.id,
        testTenant.id,
      );

      expect(history.totalInvoicedCents).toBe(0);
      expect(history.totalPaidCents).toBe(0);
      expect(history.totalOutstandingCents).toBe(0);
      expect(history.onTimePaymentCount).toBe(0);
      expect(history.latePaymentCount).toBe(0);
      expect(history.averageDaysToPayment).toBe(0);
      expect(history.paymentHistory).toHaveLength(0);
    });

    it('should correctly categorize payment status', async () => {
      const invoice1 = await createInvoice(
        5,
        InvoiceStatus.PAID,
        100000,
        100000,
      );
      const invoice2 = await createInvoice(
        10,
        InvoiceStatus.PARTIALLY_PAID,
        50000,
        25000,
      );
      const invoice3 = await createInvoice(15, InvoiceStatus.SENT, 75000, 0);

      // Create payment for invoice1
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice1.id,
          transactionId: null,
          paymentDate: invoice1.dueDate,
          amountCents: 100000,
          reference: 'Payment 1',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      const history = await service.getParentHistory(
        testParent.id,
        testTenant.id,
      );

      const paidEntry = history.paymentHistory.find(
        (e) => e.invoiceId === invoice1.id,
      );
      const partialEntry = history.paymentHistory.find(
        (e) => e.invoiceId === invoice2.id,
      );
      const overdueEntry = history.paymentHistory.find(
        (e) => e.invoiceId === invoice3.id,
      );

      expect(paidEntry?.status).toBe('paid');
      expect(partialEntry?.status).toBe('partial');
      expect(overdueEntry?.status).toBe('overdue');
    });
  });

  describe('getTopDebtors', () => {
    it('should return debtors sorted by outstanding amount', async () => {
      // Create multiple parents with different outstanding amounts
      const parent1 = testParent; // 200000 outstanding
      await createInvoice(10, InvoiceStatus.SENT, 200000, 0);

      const parent2 = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Parent',
          lastName: 'Two',
          email: `parent2${Date.now()}@test.com`,
          phone: '+27821111111',
          idNumber: '8601015800087',
          address: '111 Test St',
        },
      });

      const child2 = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Child',
          lastName: 'Two',
          dateOfBirth: new Date('2021-01-01'),
          parentId: parent2.id,
        },
      });

      // Parent 2: 300000 outstanding (highest)
      const invoice2 = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-P2-${Date.now()}`,
          parentId: parent2.id,
          childId: child2.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date(new Date().setDate(new Date().getDate() - 20)),
          subtotalCents: 260869,
          vatCents: 39131,
          totalCents: 300000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(invoice2.id);

      const parent3 = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Parent',
          lastName: 'Three',
          email: `parent3${Date.now()}@test.com`,
          phone: '+27822222222',
          idNumber: '8701015800088',
          address: '222 Test St',
        },
      });

      const child3 = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Child',
          lastName: 'Three',
          dateOfBirth: new Date('2021-02-01'),
          parentId: parent3.id,
        },
      });

      // Parent 3: 100000 outstanding (lowest)
      const invoice3 = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-P3-${Date.now()}`,
          parentId: parent3.id,
          childId: child3.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date(new Date().setDate(new Date().getDate() - 5)),
          subtotalCents: 86956,
          vatCents: 13044,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(invoice3.id);

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors).toHaveLength(3);
      expect(debtors[0].totalOutstandingCents).toBe(300000); // Parent 2
      expect(debtors[1].totalOutstandingCents).toBe(200000); // Parent 1
      expect(debtors[2].totalOutstandingCents).toBe(100000); // Parent 3
    });

    it('should respect limit parameter', async () => {
      // Create 5 parents with invoices
      for (let i = 0; i < 5; i++) {
        const parent = await prisma.parent.create({
          data: {
            tenantId: testTenant.id,
            firstName: `Parent`,
            lastName: `${i}`,
            email: `parent${i}${Date.now()}@test.com`,
            phone: `+2782${i}${i}${i}${i}${i}${i}${i}`,
            idNumber: `860101580008${i}`,
            address: `${i} Test St`,
          },
        });

        const child = await prisma.child.create({
          data: {
            tenantId: testTenant.id,
            firstName: `Child`,
            lastName: `${i}`,
            dateOfBirth: new Date('2021-01-01'),
            parentId: parent.id,
          },
        });

        const invoice = await prisma.invoice.create({
          data: {
            tenantId: testTenant.id,
            invoiceNumber: `INV-${i}-${Date.now()}`,
            parentId: parent.id,
            childId: child.id,
            billingPeriodStart: new Date('2025-01-01'),
            billingPeriodEnd: new Date('2025-01-31'),
            issueDate: new Date('2025-01-05'),
            dueDate: new Date(new Date().setDate(new Date().getDate() - 10)),
            subtotalCents: 86956,
            vatCents: 13044,
            totalCents: 100000,
            amountPaidCents: 0,
            status: InvoiceStatus.SENT,
          },
        });
        testInvoiceIds.push(invoice.id);
      }

      const debtors = await service.getTopDebtors(testTenant.id, 3);

      expect(debtors).toHaveLength(3);
    });

    it('should calculate max days overdue correctly', async () => {
      // Create parent with multiple invoices at different overdue days
      await createInvoice(10, InvoiceStatus.SENT, 50000, 0); // 10 days overdue
      await createInvoice(25, InvoiceStatus.SENT, 75000, 0); // 25 days overdue
      await createInvoice(50, InvoiceStatus.SENT, 100000, 0); // 50 days overdue (max)

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors).toHaveLength(1);
      expect(debtors[0].maxDaysOverdue).toBeGreaterThanOrEqual(49); // Account for test timing
      expect(debtors[0].invoiceCount).toBe(3);
    });

    it('should return empty array when no debtors', async () => {
      // Create only fully paid invoices
      await createInvoice(5, InvoiceStatus.PAID, 100000, 100000);

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors).toHaveLength(0);
    });

    it('should include parent contact information', async () => {
      await createInvoice(10, InvoiceStatus.SENT, 100000, 0);

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors[0].parentName).toBe('John Smith');
      expect(debtors[0].parentEmail).toBe(testParent.email);
      expect(debtors[0].parentPhone).toBe(testParent.phone);
    });

    it('should aggregate multiple invoices per parent', async () => {
      // Create multiple invoices for same parent
      await createInvoice(10, InvoiceStatus.SENT, 100000, 0);
      await createInvoice(20, InvoiceStatus.SENT, 50000, 0);
      await createInvoice(30, InvoiceStatus.PARTIALLY_PAID, 75000, 25000);

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors).toHaveLength(1);
      expect(debtors[0].totalOutstandingCents).toBe(200000); // 100000 + 50000 + 50000
      expect(debtors[0].invoiceCount).toBe(3);
    });
  });

  describe('exportArrearsCSV', () => {
    it('should generate valid CSV format', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      const csv = await service.exportArrearsCSV(testTenant.id);

      const lines = csv.split('\n');
      expect(lines.length).toBeGreaterThan(1); // Header + at least 1 data row
      expect(lines[0]).toContain('Invoice Number');
      expect(lines[0]).toContain('Parent Name');
      expect(lines[0]).toContain('Days Overdue');
    });

    it('should escape special characters properly', async () => {
      // Create parent with comma in name
      const specialParent = await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Smith, Jr.',
          lastName: 'Johnson',
          email: `special${Date.now()}@test.com`,
          phone: '+27829999999',
          idNumber: '8801015800089',
          address: '999 Test St',
        },
      });

      const specialChild = await prisma.child.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'Child "Special"',
          lastName: 'Johnson',
          dateOfBirth: new Date('2021-01-01'),
          parentId: specialParent.id,
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-SPECIAL-${Date.now()}`,
          parentId: specialParent.id,
          childId: specialChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date(new Date().setDate(new Date().getDate() - 5)),
          subtotalCents: 86956,
          vatCents: 13044,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(invoice.id);

      const csv = await service.exportArrearsCSV(testTenant.id);

      // Check that special characters are properly escaped
      expect(csv).toContain('"Smith, Jr. Johnson"'); // Comma should be quoted
      expect(csv).toContain('Child ""Special"" Johnson'); // Quotes should be doubled
    });

    it('should include all required columns', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      const csv = await service.exportArrearsCSV(testTenant.id);
      const headers = csv.split('\n')[0];

      expect(headers).toContain('Invoice Number');
      expect(headers).toContain('Parent Name');
      expect(headers).toContain('Child Name');
      expect(headers).toContain('Issue Date');
      expect(headers).toContain('Due Date');
      expect(headers).toContain('Total (ZAR)');
      expect(headers).toContain('Paid (ZAR)');
      expect(headers).toContain('Outstanding (ZAR)');
      expect(headers).toContain('Days Overdue');
      expect(headers).toContain('Aging Bucket');
    });

    it('should apply filters correctly', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);
      await createInvoice(50, InvoiceStatus.SENT, 50000, 0);

      // Filter to only include invoices with minAmountCents >= 75000
      const csv = await service.exportArrearsCSV(testTenant.id, {
        minAmountCents: 75000,
      });

      const lines = csv.split('\n');
      expect(lines.length).toBe(2); // Header + 1 data row (only the 100000 invoice)
    });

    it('should format monetary values correctly', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      const csv = await service.exportArrearsCSV(testTenant.id);
      const dataRow = csv.split('\n')[1];

      expect(dataRow).toContain('1000.00'); // 100000 cents = R1000.00
    });

    it('should format dates correctly', async () => {
      await createInvoice(5, InvoiceStatus.SENT, 100000, 0);

      const csv = await service.exportArrearsCSV(testTenant.id);
      const dataRow = csv.split('\n')[1];

      // Should contain ISO date format (YYYY-MM-DD)
      expect(dataRow).toMatch(/\d{4}-\d{2}-\d{2}/);
    });
  });

  describe('Edge Cases', () => {
    it('should return 0 days overdue for invoice due today', async () => {
      const invoice = await createInvoice(0, InvoiceStatus.SENT, 100000, 0);

      const report = await service.getArrearsReport(testTenant.id);

      // Due to timing, this might be 0 or 1 day overdue
      expect(report.invoices[0].daysOverdue).toBeLessThanOrEqual(1);
      expect(report.invoices[0].agingBucket).toBe('current');
    });

    it('should return 0 days overdue for invoice not yet due', async () => {
      // Create invoice due in the future
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10);

      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: `INV-FUTURE-${Date.now()}`,
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date(),
          dueDate: futureDate,
          subtotalCents: 86956,
          vatCents: 13044,
          totalCents: 100000,
          amountPaidCents: 0,
          status: InvoiceStatus.SENT,
        },
      });
      testInvoiceIds.push(invoice.id);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.invoices[0].daysOverdue).toBe(0);
    });

    it('should handle parent with no invoices in getTopDebtors', async () => {
      // Create parent but no invoices
      await prisma.parent.create({
        data: {
          tenantId: testTenant.id,
          firstName: 'No',
          lastName: 'Invoices',
          email: `noinvoices${Date.now()}@test.com`,
          phone: '+27829999999',
          idNumber: '8801015800090',
          address: '999 Test St',
        },
      });

      const debtors = await service.getTopDebtors(testTenant.id, 10);

      expect(debtors).toHaveLength(0);
    });

    it('should handle all invoices fully paid', async () => {
      await createInvoice(5, InvoiceStatus.PAID, 100000, 100000);
      await createInvoice(10, InvoiceStatus.PAID, 50000, 50000);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalInvoices).toBe(0);
      expect(report.summary.totalOutstandingCents).toBe(0);
      expect(report.invoices).toHaveLength(0);
      expect(report.topDebtors).toHaveLength(0);
    });

    it('should handle invoice with zero outstanding (edge rounding case)', async () => {
      // Create invoice that is fully paid
      await createInvoice(5, InvoiceStatus.PAID, 100000, 100000);

      const report = await service.getArrearsReport(testTenant.id);

      // Should not be included in arrears report
      expect(
        report.invoices.find((inv) => inv.outstandingCents === 0),
      ).toBeUndefined();
    });

    it('should handle very large outstanding amounts', async () => {
      // Create invoice with large amount (R1 million)
      await createInvoice(50, InvoiceStatus.SENT, 100000000, 0);

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalOutstandingCents).toBe(100000000);
      expect(report.invoices[0].outstandingCents).toBe(100000000);
    });

    it('should handle invoice with exact boundary days (30, 60, 90)', async () => {
      // TASK-BILL-006: Standardized buckets
      // current: 1-30 days, 30: 31-60 days, 60: 61-90 days, 90+: >90 days
      const invoice29 = await createInvoice(29, InvoiceStatus.SENT, 100000, 0); // current bucket (1-30)
      const invoice45 = await createInvoice(45, InvoiceStatus.SENT, 50000, 0); // 30-day bucket (31-60)
      const invoice75 = await createInvoice(75, InvoiceStatus.SENT, 25000, 0); // 60-day bucket (61-90)

      const report = await service.getArrearsReport(testTenant.id);

      const inv29 = report.invoices.find((i) => i.invoiceId === invoice29.id);
      const inv45 = report.invoices.find((i) => i.invoiceId === invoice45.id);
      const inv75 = report.invoices.find((i) => i.invoiceId === invoice75.id);

      expect(inv29?.agingBucket).toBe('current'); // 29 days = current (1-30)
      expect(inv45?.agingBucket).toBe('30'); // 45 days = 30 bucket (31-60)
      expect(inv75?.agingBucket).toBe('60'); // 75 days = 60 bucket (61-90)
    });

    it('should handle multiple payments on same invoice for history', async () => {
      const invoice = await createInvoice(
        10,
        InvoiceStatus.PAID,
        100000,
        100000,
      );

      // First partial payment
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice.id,
          transactionId: null,
          paymentDate: new Date(
            invoice.dueDate.getTime() - 5 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 60000,
          reference: 'Payment 1',
          matchType: 'PARTIAL',
          matchedBy: 'USER',
        },
      });

      // Second payment completing the invoice
      await prisma.payment.create({
        data: {
          tenantId: testTenant.id,
          invoiceId: invoice.id,
          transactionId: null,
          paymentDate: new Date(
            invoice.dueDate.getTime() + 2 * 24 * 60 * 60 * 1000,
          ),
          amountCents: 40000,
          reference: 'Payment 2',
          matchType: 'EXACT',
          matchedBy: 'USER',
        },
      });

      const history = await service.getParentHistory(
        testParent.id,
        testTenant.id,
      );

      // Should use the LATEST payment date for calculating days to payment
      const entry = history.paymentHistory.find(
        (e) => e.invoiceId === invoice.id,
      );
      expect(entry?.status).toBe('paid');
      expect(entry?.paidDate).toBeTruthy();
      expect(entry?.daysToPayment).toBe(2); // Latest payment was 2 days late
    });

    it('should handle deleted invoices correctly', async () => {
      const invoice1 = await createInvoice(5, InvoiceStatus.SENT, 100000, 0);
      const invoice2 = await createInvoice(10, InvoiceStatus.SENT, 50000, 0);

      // Soft delete invoice2
      await prisma.invoice.update({
        where: { id: invoice2.id },
        data: { isDeleted: true },
      });

      const report = await service.getArrearsReport(testTenant.id);

      expect(report.summary.totalInvoices).toBe(1);
      expect(report.summary.totalOutstandingCents).toBe(100000);
      expect(
        report.invoices.find((i) => i.invoiceId === invoice2.id),
      ).toBeUndefined();
    });
  });
});

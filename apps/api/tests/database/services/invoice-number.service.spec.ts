/**
 * InvoiceNumberService Integration Tests
 * TASK-BILL-003: Atomic Invoice Number Generation
 *
 * CRITICAL: Uses REAL database transactions, no mocks
 * Tests concurrent invoice number generation to verify race condition fix
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceNumberService } from '../../../src/database/services/invoice-number.service';
import { Tenant } from '@prisma/client';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';

describe('InvoiceNumberService', () => {
  let service: InvoiceNumberService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testTenant2: Tenant;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, InvoiceNumberService],
    }).compile();

    service = module.get<InvoiceNumberService>(InvoiceNumberService);
    prisma = module.get<PrismaService>(PrismaService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean up in FK order
    await prisma.invoiceNumberCounter.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    const timestamp = Date.now();

    // Create test tenants
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Invoice Number Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `invnum${timestamp}@test.co.za`,
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDayOfMonth: 1,
        invoiceDueDays: 7,
      },
    });

    testTenant2 = await prisma.tenant.create({
      data: {
        name: 'Second Test Creche',
        addressLine1: '456 Other Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27215559999',
        email: `invnum2${timestamp}@test.co.za`,
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDayOfMonth: 1,
        invoiceDueDays: 7,
      },
    });
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('generateNextNumber', () => {
    it('should generate first invoice number as INV-YYYY-001', async () => {
      const invoiceNumber = await service.generateNextNumber(
        testTenant.id,
        2026,
      );
      expect(invoiceNumber).toBe('INV-2026-001');
    });

    it('should increment invoice numbers sequentially', async () => {
      const num1 = await service.generateNextNumber(testTenant.id, 2026);
      const num2 = await service.generateNextNumber(testTenant.id, 2026);
      const num3 = await service.generateNextNumber(testTenant.id, 2026);

      expect(num1).toBe('INV-2026-001');
      expect(num2).toBe('INV-2026-002');
      expect(num3).toBe('INV-2026-003');
    });

    it('should maintain separate sequences per year', async () => {
      // Generate numbers for 2025
      const num2025a = await service.generateNextNumber(testTenant.id, 2025);
      const num2025b = await service.generateNextNumber(testTenant.id, 2025);

      // Generate numbers for 2026
      const num2026a = await service.generateNextNumber(testTenant.id, 2026);
      const num2026b = await service.generateNextNumber(testTenant.id, 2026);

      expect(num2025a).toBe('INV-2025-001');
      expect(num2025b).toBe('INV-2025-002');
      expect(num2026a).toBe('INV-2026-001');
      expect(num2026b).toBe('INV-2026-002');
    });

    it('should maintain separate sequences per tenant', async () => {
      const tenant1Num = await service.generateNextNumber(testTenant.id, 2026);
      const tenant2Num = await service.generateNextNumber(testTenant2.id, 2026);

      expect(tenant1Num).toBe('INV-2026-001');
      expect(tenant2Num).toBe('INV-2026-001');
    });

    it('should generate UNIQUE numbers under concurrent access', async () => {
      // TASK-BILL-003: Critical test - ensures atomic increment prevents duplicates
      const CONCURRENT_COUNT = 20;
      const year = 2026;

      // Launch many concurrent requests
      const promises = Array(CONCURRENT_COUNT)
        .fill(null)
        .map(() => service.generateNextNumber(testTenant.id, year));

      const results = await Promise.all(promises);

      // All numbers should be unique
      const uniqueNumbers = new Set(results);
      if (uniqueNumbers.size !== CONCURRENT_COUNT) {
        const duplicates = results.filter((n, i) => results.indexOf(n) !== i);
        throw new Error(
          `Expected ${CONCURRENT_COUNT} unique numbers but got ${uniqueNumbers.size}. ` +
            `Duplicates found: ${duplicates.join(', ')}`,
        );
      }
      expect(uniqueNumbers.size).toBe(CONCURRENT_COUNT);

      // Numbers should be in expected range
      for (const num of results) {
        const match = num.match(/^INV-2026-(\d+)$/);
        expect(match).toBeTruthy();
        const seq = parseInt(match![1], 10);
        expect(seq).toBeGreaterThanOrEqual(1);
        expect(seq).toBeLessThanOrEqual(CONCURRENT_COUNT);
      }
    });

    it('should work within transactions', async () => {
      // Use a transaction to generate numbers
      const result = await prisma.$transaction(async (tx) => {
        const num1 = await service.generateNextNumber(testTenant.id, 2026, tx);
        const num2 = await service.generateNextNumber(testTenant.id, 2026, tx);
        return { num1, num2 };
      });

      expect(result.num1).toBe('INV-2026-001');
      expect(result.num2).toBe('INV-2026-002');

      // Verify counter was updated
      const counter = await prisma.invoiceNumberCounter.findUnique({
        where: {
          tenantId_year: { tenantId: testTenant.id, year: 2026 },
        },
      });
      expect(counter?.currentValue).toBe(2);
    });

    it('should reuse numbers after transaction rollback (no gaps)', async () => {
      // Generate first number
      const num1 = await service.generateNextNumber(testTenant.id, 2026);
      expect(num1).toBe('INV-2026-001');

      // Start transaction, generate number, then rollback
      try {
        await prisma.$transaction(async (tx) => {
          const numInTx = await service.generateNextNumber(
            testTenant.id,
            2026,
            tx,
          );
          expect(numInTx).toBe('INV-2026-002');
          // Force rollback
          throw new Error('Rollback test');
        });
      } catch (e) {
        // Expected
      }

      // After rollback, the counter increment is also rolled back
      // So the next number should be 002 again (reused)
      // This is expected PostgreSQL transactional behavior with
      // INSERT ON CONFLICT - the whole operation is rolled back
      const num2Again = await service.generateNextNumber(testTenant.id, 2026);
      expect(num2Again).toBe('INV-2026-002');
    });
  });

  describe('reserveNumbers', () => {
    it('should reserve multiple numbers atomically', async () => {
      const reservation = await service.reserveNumbers(testTenant.id, 2026, 5);

      expect(reservation.startSequence).toBe(1);
      expect(reservation.endSequence).toBe(5);
      expect(reservation.invoiceNumbers).toEqual([
        'INV-2026-001',
        'INV-2026-002',
        'INV-2026-003',
        'INV-2026-004',
        'INV-2026-005',
      ]);
    });

    it('should continue sequence after reservation', async () => {
      // Reserve first batch
      await service.reserveNumbers(testTenant.id, 2026, 3);

      // Generate single number should continue from 4
      const nextNum = await service.generateNextNumber(testTenant.id, 2026);
      expect(nextNum).toBe('INV-2026-004');
    });

    it('should handle concurrent reservations without overlap', async () => {
      // TASK-BILL-003: Critical test for batch atomicity
      const RESERVATION_SIZE = 10;
      const CONCURRENT_RESERVATIONS = 5;

      const promises = Array(CONCURRENT_RESERVATIONS)
        .fill(null)
        .map(() =>
          service.reserveNumbers(testTenant.id, 2026, RESERVATION_SIZE),
        );

      const reservations = await Promise.all(promises);

      // Collect all reserved numbers
      const allNumbers: string[] = [];
      for (const res of reservations) {
        allNumbers.push(...res.invoiceNumbers);
      }

      // All numbers should be unique
      const uniqueNumbers = new Set(allNumbers);
      expect(uniqueNumbers.size).toBe(
        RESERVATION_SIZE * CONCURRENT_RESERVATIONS,
      );

      // Ranges should not overlap
      for (let i = 0; i < reservations.length; i++) {
        for (let j = i + 1; j < reservations.length; j++) {
          const res1 = reservations[i];
          const res2 = reservations[j];
          // Either res1 ends before res2 starts, or res2 ends before res1 starts
          const noOverlap =
            res1.endSequence < res2.startSequence ||
            res2.endSequence < res1.startSequence;
          expect(noOverlap).toBe(true);
        }
      }
    });

    it('should reject non-positive count', async () => {
      await expect(
        service.reserveNumbers(testTenant.id, 2026, 0),
      ).rejects.toThrow();
      await expect(
        service.reserveNumbers(testTenant.id, 2026, -1),
      ).rejects.toThrow();
    });

    it('should work within transactions', async () => {
      const result = await prisma.$transaction(async (tx) => {
        return service.reserveNumbers(testTenant.id, 2026, 3, tx);
      });

      expect(result.invoiceNumbers).toHaveLength(3);
      expect(result.startSequence).toBe(1);
      expect(result.endSequence).toBe(3);
    });
  });

  describe('peekNextSequential', () => {
    it('should return 1 for new tenant/year', async () => {
      const next = await service.peekNextSequential(testTenant.id, 2026);
      expect(next).toBe(1);
    });

    it('should return correct next value after generation', async () => {
      await service.generateNextNumber(testTenant.id, 2026);
      await service.generateNextNumber(testTenant.id, 2026);

      const next = await service.peekNextSequential(testTenant.id, 2026);
      expect(next).toBe(3);
    });

    it('should not increment the counter', async () => {
      await service.peekNextSequential(testTenant.id, 2026);
      await service.peekNextSequential(testTenant.id, 2026);
      await service.peekNextSequential(testTenant.id, 2026);

      const next = await service.peekNextSequential(testTenant.id, 2026);
      expect(next).toBe(1); // Still 1 because peek doesn't increment
    });
  });

  describe('formatInvoiceNumber', () => {
    it('should format with 3-digit padding', () => {
      expect(service.formatInvoiceNumber(2026, 1)).toBe('INV-2026-001');
      expect(service.formatInvoiceNumber(2026, 42)).toBe('INV-2026-042');
      expect(service.formatInvoiceNumber(2026, 999)).toBe('INV-2026-999');
    });

    it('should extend beyond 3 digits when needed', () => {
      expect(service.formatInvoiceNumber(2026, 1000)).toBe('INV-2026-1000');
      expect(service.formatInvoiceNumber(2026, 12345)).toBe('INV-2026-12345');
    });
  });

  describe('parseInvoiceNumber', () => {
    it('should parse valid invoice numbers', () => {
      const result = service.parseInvoiceNumber('INV-2026-001');
      expect(result).toEqual({ year: 2026, sequence: 1 });
    });

    it('should parse numbers with different padding', () => {
      expect(service.parseInvoiceNumber('INV-2025-42')).toEqual({
        year: 2025,
        sequence: 42,
      });
      expect(service.parseInvoiceNumber('INV-2024-12345')).toEqual({
        year: 2024,
        sequence: 12345,
      });
    });

    it('should return null for invalid formats', () => {
      expect(service.parseInvoiceNumber('invalid')).toBeNull();
      expect(service.parseInvoiceNumber('INV-2026')).toBeNull();
      expect(service.parseInvoiceNumber('2026-001')).toBeNull();
      expect(service.parseInvoiceNumber('')).toBeNull();
    });
  });

  describe('getCurrentValue', () => {
    it('should return 0 for new tenant/year', async () => {
      const value = await service.getCurrentValue(testTenant.id, 2026);
      expect(value).toBe(0);
    });

    it('should return correct current value after generation', async () => {
      await service.generateNextNumber(testTenant.id, 2026);
      await service.generateNextNumber(testTenant.id, 2026);
      await service.generateNextNumber(testTenant.id, 2026);

      const value = await service.getCurrentValue(testTenant.id, 2026);
      expect(value).toBe(3);
    });
  });

  describe('Integration with existing invoice data', () => {
    it('should continue from existing counter value', async () => {
      // Manually set counter to simulate existing data
      await prisma.invoiceNumberCounter.create({
        data: {
          tenantId: testTenant.id,
          year: 2026,
          currentValue: 50,
        },
      });

      const nextNum = await service.generateNextNumber(testTenant.id, 2026);
      expect(nextNum).toBe('INV-2026-051');
    });
  });
});

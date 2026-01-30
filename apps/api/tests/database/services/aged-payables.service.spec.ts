/**
 * Aged Payables Service Unit Tests
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @description Unit tests for the aged payables placeholder service.
 * Tests that the service returns proper empty structures since
 * bills/suppliers module is not in scope.
 *
 * CRITICAL: Uses real data, NO mock data.
 * CRITICAL: Tests should verify structure, not fabricate data.
 */

import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AgedPayablesService,
  type AgedPayablesReport,
} from '../../../src/database/services/aged-payables.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { BusinessException } from '../../../src/shared/exceptions';
import { cleanDatabase } from '../../helpers/clean-database';

describe('AgedPayablesService', () => {
  let service: AgedPayablesService;
  let prisma: PrismaService;
  let tenantRepo: TenantRepository;

  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AgedPayablesService, PrismaService, TenantRepository],
    }).compile();

    service = module.get<AgedPayablesService>(AgedPayablesService);
    prisma = module.get<PrismaService>(PrismaService);
    tenantRepo = module.get<TenantRepository>(TenantRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create test tenant
    const tenant = await tenantRepo.create({
      name: 'Aged Payables Test Creche',
      email: `aged-payables-test-${Date.now()}@example.com`,
      phone: '0211234567',
      addressLine1: '123 Test Street',
      city: 'Cape Town',
      province: 'Western Cape',
      postalCode: '8001',
    });
    testTenantId = tenant.id;
  });

  describe('generateAgedPayablesReport', () => {
    it('should return proper empty structure with all buckets', async () => {
      const asOfDate = new Date('2025-01-15');

      const result = await service.generateAgedPayablesReport(
        testTenantId,
        asOfDate,
      );

      // Verify structure
      expect(result.tenantId).toBe(testTenantId);
      expect(result.asOfDate).toEqual(asOfDate);
      expect(result.generatedAt).toBeInstanceOf(Date);

      // Verify all aging buckets exist
      expect(result.aging.current).toBeDefined();
      expect(result.aging.thirtyDays).toBeDefined();
      expect(result.aging.sixtyDays).toBeDefined();
      expect(result.aging.ninetyDays).toBeDefined();
      expect(result.aging.overNinety).toBeDefined();

      // Verify bucket structure
      expect(result.aging.current.count).toBe(0);
      expect(result.aging.current.totalCents).toBe(0);
      expect(Array.isArray(result.aging.current.suppliers)).toBe(true);
      expect(result.aging.current.suppliers.length).toBe(0);
    });

    it('should return empty summary with zeros', async () => {
      const asOfDate = new Date('2025-01-15');

      const result = await service.generateAgedPayablesReport(
        testTenantId,
        asOfDate,
      );

      // Verify summary has zeros, never null
      expect(result.summary.totalOutstanding).toBe(0);
      expect(result.summary.totalSuppliers).toBe(0);
      expect(result.summary.oldestBillDays).toBe(0);
      expect(result.summary.averagePaymentDays).toBe(0);
    });

    it('should throw error when tenantId is missing', async () => {
      const asOfDate = new Date('2025-01-15');

      await expect(
        service.generateAgedPayablesReport('', asOfDate),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw error when asOfDate is invalid', async () => {
      const invalidDate = new Date('invalid');

      await expect(
        service.generateAgedPayablesReport(testTenantId, invalidDate),
      ).rejects.toThrow(BusinessException);
    });

    it('should work with different tenants (tenant isolation)', async () => {
      // Create another tenant
      const tenant2 = await tenantRepo.create({
        name: 'Other Creche',
        email: `other-test-${Date.now()}@example.com`,
        phone: '0219876543',
        addressLine1: '456 Other Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2000',
      });

      const asOfDate = new Date('2025-01-15');

      // Both tenants should get independent empty reports
      const result1 = await service.generateAgedPayablesReport(
        testTenantId,
        asOfDate,
      );
      const result2 = await service.generateAgedPayablesReport(
        tenant2.id,
        asOfDate,
      );

      expect(result1.tenantId).toBe(testTenantId);
      expect(result2.tenantId).toBe(tenant2.id);
      expect(result1.tenantId).not.toBe(result2.tenantId);

      // Cleanup
      await prisma.tenant.delete({ where: { id: tenant2.id } });
    });
  });

  describe('getSupplierAgingDetail', () => {
    it('should return null as feature is not implemented', async () => {
      const asOfDate = new Date('2025-01-15');

      const result = await service.getSupplierAgingDetail(
        testTenantId,
        'some-supplier-id',
        asOfDate,
      );

      expect(result).toBeNull();
    });
  });

  describe('getAllSuppliersAging', () => {
    it('should return empty array as feature is not implemented', async () => {
      const asOfDate = new Date('2025-01-15');

      const result = await service.getAllSuppliersAging(testTenantId, asOfDate);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });
  });

  describe('isFeatureAvailable', () => {
    it('should return false as feature is not implemented', () => {
      expect(service.isFeatureAvailable()).toBe(false);
    });
  });

  describe('getFeatureMessage', () => {
    it('should return informative message about future availability', () => {
      const message = service.getFeatureMessage();

      expect(typeof message).toBe('string');
      expect(message.length).toBeGreaterThan(0);
      expect(message.toLowerCase()).toContain('supplier');
    });
  });
});

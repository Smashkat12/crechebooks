/**
 * VatAdjustmentService Integration Tests
 * TASK-SARS-002: VAT201 Adjustment Fields (7-13)
 *
 * CRITICAL: Uses REAL database, no mocks
 * Tests VAT adjustment creation, voiding, and aggregation
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { VatAdjustmentService } from '../../../src/database/services/vat-adjustment.service';
import { VatAdjustmentType, TaxStatus } from '@prisma/client';
import { Tenant, VatAdjustment, User } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

describe('VatAdjustmentService', () => {
  let service: VatAdjustmentService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testUser: User;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, VatAdjustmentService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<VatAdjustmentService>(VatAdjustmentService);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);

    // Create VAT-registered test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'VAT Adjustment Test Creche',
        tradingName: 'VAT Adj Test',
        taxStatus: TaxStatus.VAT_REGISTERED,
        vatNumber: '4123456789',
        addressLine1: '123 Adjustment Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `vat-adj-test-${Date.now()}@test.co.za`,
      },
    });

    // Create test user for createdBy field
    testUser = await prisma.user.create({
      data: {
        tenantId: testTenant.id,
        auth0Id: `auth0|vatadj-${Date.now()}`,
        email: `user-${Date.now()}@test.co.za`,
        name: 'Test User',
        role: 'ADMIN',
      },
    });
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });
  });

  describe('createAdjustment', () => {
    it('should create a VAT adjustment entry', async () => {
      const adjustment = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 150000, // R1500
        adjustmentDate: new Date('2025-01-15'),
        description: 'Bad debt write-off for Invoice INV-001',
        reference: 'INV-001',
        createdBy: testUser.id,
      });

      expect(adjustment).toBeDefined();
      expect(adjustment.id).toBeDefined();
      expect(adjustment.tenantId).toBe(testTenant.id);
      expect(adjustment.adjustmentType).toBe(
        VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
      );
      expect(adjustment.amountCents).toBe(150000);
      expect(adjustment.isVoided).toBe(false);
    });

    it('should reject negative amounts', async () => {
      await expect(
        service.createAdjustment({
          tenantId: testTenant.id,
          adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
          amountCents: -10000,
          adjustmentDate: new Date('2025-01-15'),
          description: 'Invalid negative amount',
          createdBy: testUser.id,
        }),
      ).rejects.toThrow('Amount must be positive');
    });

    it('should reject amounts below minimum threshold', async () => {
      await expect(
        service.createAdjustment({
          tenantId: testTenant.id,
          adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
          amountCents: 50, // R0.50, below R1 minimum
          adjustmentDate: new Date('2025-01-15'),
          description: 'Too small',
          createdBy: testUser.id,
        }),
      ).rejects.toThrow('Amount must be at least');
    });

    it('should reject future dates', async () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);

      await expect(
        service.createAdjustment({
          tenantId: testTenant.id,
          adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
          amountCents: 10000,
          adjustmentDate: futureDate,
          description: 'Future dated adjustment',
          createdBy: testUser.id,
        }),
      ).rejects.toThrow('Adjustment date cannot be in the future');
    });

    it('should reject empty description', async () => {
      await expect(
        service.createAdjustment({
          tenantId: testTenant.id,
          adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
          amountCents: 10000,
          adjustmentDate: new Date('2025-01-15'),
          description: '',
          createdBy: testUser.id,
        }),
      ).rejects.toThrow('Description is required');
    });

    it('should create all adjustment types', async () => {
      const types: VatAdjustmentType[] = [
        VatAdjustmentType.CHANGE_IN_USE_OUTPUT,
        VatAdjustmentType.CHANGE_IN_USE_INPUT,
        VatAdjustmentType.OTHER_OUTPUT,
        VatAdjustmentType.OTHER_INPUT,
        VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        VatAdjustmentType.BAD_DEBTS_RECOVERED,
        VatAdjustmentType.CAPITAL_GOODS_SCHEME,
      ];

      for (const type of types) {
        const adjustment = await service.createAdjustment({
          tenantId: testTenant.id,
          adjustmentType: type,
          amountCents: 10000,
          adjustmentDate: new Date('2025-01-15'),
          description: `Test ${type}`,
          createdBy: testUser.id,
        });

        expect(adjustment.adjustmentType).toBe(type);
      }
    });
  });

  describe('voidAdjustment', () => {
    it('should void an existing adjustment', async () => {
      const adjustment = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 150000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'To be voided',
        createdBy: testUser.id,
      });

      const voided = await service.voidAdjustment({
        adjustmentId: adjustment.id,
        tenantId: testTenant.id,
        voidedBy: testUser.id,
        voidReason: 'Entered in error',
      });

      expect(voided.isVoided).toBe(true);
      expect(voided.voidedBy).toBe(testUser.id);
      expect(voided.voidReason).toBe('Entered in error');
      expect(voided.voidedAt).toBeDefined();
    });

    it('should reject voiding non-existent adjustment', async () => {
      await expect(
        service.voidAdjustment({
          adjustmentId: 'non-existent-id',
          tenantId: testTenant.id,
          voidedBy: testUser.id,
          voidReason: 'Test',
        }),
      ).rejects.toThrow('VAT adjustment not found');
    });

    it('should reject double-voiding', async () => {
      const adjustment = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 10000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Will be voided twice',
        createdBy: testUser.id,
      });

      await service.voidAdjustment({
        adjustmentId: adjustment.id,
        tenantId: testTenant.id,
        voidedBy: testUser.id,
        voidReason: 'First void',
      });

      await expect(
        service.voidAdjustment({
          adjustmentId: adjustment.id,
          tenantId: testTenant.id,
          voidedBy: testUser.id,
          voidReason: 'Second void',
        }),
      ).rejects.toThrow('already voided');
    });
  });

  describe('getAdjustmentsForPeriod', () => {
    it('should aggregate adjustments by type', async () => {
      // Create adjustments of different types
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000, // R1000
        adjustmentDate: new Date('2025-01-15'),
        description: 'Bad debt 1',
        createdBy: testUser.id,
      });

      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 50000, // R500
        adjustmentDate: new Date('2025-01-20'),
        description: 'Bad debt 2',
        createdBy: testUser.id,
      });

      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_RECOVERED,
        amountCents: 25000, // R250
        adjustmentDate: new Date('2025-01-25'),
        description: 'Recovered debt',
        createdBy: testUser.id,
      });

      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 75000, // R750
        adjustmentDate: new Date('2025-01-28'),
        description: 'Other output adjustment',
        createdBy: testUser.id,
      });

      const aggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(aggregation.adjustmentCount).toBe(4);
      expect(aggregation.field11BadDebtsWrittenOffCents).toBe(150000); // R1000 + R500
      expect(aggregation.field12BadDebtsRecoveredCents).toBe(25000); // R250
      expect(aggregation.field9OtherOutputCents).toBe(75000); // R750
      expect(aggregation.field7ChangeInUseOutputCents).toBe(0);
      expect(aggregation.field8ChangeInUseInputCents).toBe(0);
      expect(aggregation.field10OtherInputCents).toBe(0);
      expect(aggregation.field13CapitalGoodsSchemeCents).toBe(0);
    });

    it('should exclude voided adjustments', async () => {
      const activeAdj = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Active',
        createdBy: testUser.id,
      });

      const voidedAdj = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 50000,
        adjustmentDate: new Date('2025-01-20'),
        description: 'Will be voided',
        createdBy: testUser.id,
      });

      await service.voidAdjustment({
        adjustmentId: voidedAdj.id,
        tenantId: testTenant.id,
        voidedBy: testUser.id,
        voidReason: 'Error',
      });

      const aggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(aggregation.adjustmentCount).toBe(1);
      expect(aggregation.field11BadDebtsWrittenOffCents).toBe(100000);
    });

    it('should filter by date range', async () => {
      // January adjustment
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'January',
        createdBy: testUser.id,
      });

      // February adjustment
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 200000,
        adjustmentDate: new Date('2025-02-15'),
        description: 'February',
        createdBy: testUser.id,
      });

      const janAggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(janAggregation.adjustmentCount).toBe(1);
      expect(janAggregation.field11BadDebtsWrittenOffCents).toBe(100000);

      const febAggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-02-01'),
        periodEnd: new Date('2025-02-28'),
      });

      expect(febAggregation.adjustmentCount).toBe(1);
      expect(febAggregation.field11BadDebtsWrittenOffCents).toBe(200000);
    });

    it('should return zero for periods with no adjustments', async () => {
      const aggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(aggregation.adjustmentCount).toBe(0);
      expect(aggregation.field7ChangeInUseOutputCents).toBe(0);
      expect(aggregation.field8ChangeInUseInputCents).toBe(0);
      expect(aggregation.field9OtherOutputCents).toBe(0);
      expect(aggregation.field10OtherInputCents).toBe(0);
      expect(aggregation.field11BadDebtsWrittenOffCents).toBe(0);
      expect(aggregation.field12BadDebtsRecoveredCents).toBe(0);
      expect(aggregation.field13CapitalGoodsSchemeCents).toBe(0);
    });

    it('should reject invalid date range', async () => {
      await expect(
        service.getAdjustmentsForPeriod({
          tenantId: testTenant.id,
          periodStart: new Date('2025-02-01'),
          periodEnd: new Date('2025-01-01'), // End before start
        }),
      ).rejects.toThrow('Period start date must be before');
    });
  });

  describe('listAdjustmentsForPeriod', () => {
    it('should return all adjustments including voided', async () => {
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Active',
        createdBy: testUser.id,
      });

      const toVoid = await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 50000,
        adjustmentDate: new Date('2025-01-20'),
        description: 'Voided',
        createdBy: testUser.id,
      });

      await service.voidAdjustment({
        adjustmentId: toVoid.id,
        tenantId: testTenant.id,
        voidedBy: testUser.id,
        voidReason: 'Error',
      });

      const list = await service.listAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(list).toHaveLength(2);
    });

    it('should order by date descending', async () => {
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-10'),
        description: 'Earlier',
        createdBy: testUser.id,
      });

      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 50000,
        adjustmentDate: new Date('2025-01-20'),
        description: 'Later',
        createdBy: testUser.id,
      });

      const list = await service.listAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(list[0].description).toBe('Later');
      expect(list[1].description).toBe('Earlier');
    });
  });

  describe('calculateNetAdjustmentEffect', () => {
    it('should calculate positive net effect for output adjustments', () => {
      const aggregation = {
        field7ChangeInUseOutputCents: 10000,
        field8ChangeInUseInputCents: 0,
        field9OtherOutputCents: 5000,
        field10OtherInputCents: 0,
        field11BadDebtsWrittenOffCents: 0,
        field12BadDebtsRecoveredCents: 3000,
        field13CapitalGoodsSchemeCents: 0,
        adjustmentCount: 3,
      };

      const netEffect = service.calculateNetAdjustmentEffect(aggregation);
      // 10000 + 5000 + 3000 = 18000 (increases VAT payable)
      expect(netEffect).toBe(18000);
    });

    it('should calculate negative net effect for bad debts written off', () => {
      const aggregation = {
        field7ChangeInUseOutputCents: 0,
        field8ChangeInUseInputCents: 0,
        field9OtherOutputCents: 0,
        field10OtherInputCents: 0,
        field11BadDebtsWrittenOffCents: 15000,
        field12BadDebtsRecoveredCents: 0,
        field13CapitalGoodsSchemeCents: 0,
        adjustmentCount: 1,
      };

      const netEffect = service.calculateNetAdjustmentEffect(aggregation);
      // -15000 (decreases VAT payable)
      expect(netEffect).toBe(-15000);
    });

    it('should calculate combined effect correctly', () => {
      const aggregation = {
        field7ChangeInUseOutputCents: 20000, // +20000
        field8ChangeInUseInputCents: 5000, // +5000 (reduces input claim)
        field9OtherOutputCents: 10000, // +10000
        field10OtherInputCents: 3000, // +3000 (reduces input claim)
        field11BadDebtsWrittenOffCents: 15000, // -15000
        field12BadDebtsRecoveredCents: 8000, // +8000
        field13CapitalGoodsSchemeCents: 2000, // +2000
        adjustmentCount: 7,
      };

      const netEffect = service.calculateNetAdjustmentEffect(aggregation);
      // Output: 20000 + 10000 + 8000 - 15000 = 23000
      // Input: 5000 + 3000 = 8000
      // Capital: 2000
      // Total: 23000 + 8000 + 2000 = 33000
      expect(netEffect).toBe(33000);
    });
  });

  describe('getFieldNumber', () => {
    it('should return correct field number for each adjustment type', () => {
      expect(
        service.getFieldNumber(VatAdjustmentType.CHANGE_IN_USE_OUTPUT),
      ).toBe(7);
      expect(
        service.getFieldNumber(VatAdjustmentType.CHANGE_IN_USE_INPUT),
      ).toBe(8);
      expect(service.getFieldNumber(VatAdjustmentType.OTHER_OUTPUT)).toBe(9);
      expect(service.getFieldNumber(VatAdjustmentType.OTHER_INPUT)).toBe(10);
      expect(
        service.getFieldNumber(VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF),
      ).toBe(11);
      expect(
        service.getFieldNumber(VatAdjustmentType.BAD_DEBTS_RECOVERED),
      ).toBe(12);
      expect(
        service.getFieldNumber(VatAdjustmentType.CAPITAL_GOODS_SCHEME),
      ).toBe(13);
    });
  });

  describe('validateAdjustment', () => {
    it('should pass valid adjustment', () => {
      const result = service.validateAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Valid adjustment',
        invoiceId: 'inv-123',
        createdBy: testUser.id,
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should warn for bad debts without invoice reference', () => {
      const result = service.validateAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Bad debt without invoice',
        createdBy: testUser.id,
      });

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain(
        'Bad debts written off should reference an invoice for audit trail',
      );
    });

    it('should warn for large amounts', () => {
      const result = service.validateAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 15000000, // R150,000
        adjustmentDate: new Date('2025-01-15'),
        description: 'Large adjustment',
        createdBy: testUser.id,
      });

      expect(result.isValid).toBe(true);
      expect(
        result.warnings.some((w) => w.includes('Large adjustment amount')),
      ).toBe(true);
    });

    it('should error for missing required fields', () => {
      const result = service.validateAdjustment({
        tenantId: '',
        adjustmentType: VatAdjustmentType.OTHER_OUTPUT,
        amountCents: 10000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Test',
        createdBy: '',
      });

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Tenant ID is required');
      expect(result.errors).toContain('Created by user ID is required');
    });
  });

  describe('Tenant Isolation', () => {
    it('should not include adjustments from other tenants', async () => {
      // Create second tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          taxStatus: TaxStatus.VAT_REGISTERED,
          vatNumber: '9876543210',
          addressLine1: '456 Other Street',
          city: 'Cape Town',
          province: 'Western Cape',
          postalCode: '8001',
          phone: '+27211234567',
          email: `other-adj-${Date.now()}@test.co.za`,
        },
      });

      const otherUser = await prisma.user.create({
        data: {
          tenantId: otherTenant.id,
          auth0Id: `auth0|other-${Date.now()}`,
          email: `other-user-${Date.now()}@test.co.za`,
          name: 'Other User',
          role: 'ADMIN',
        },
      });

      // Create adjustment for test tenant
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 100000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Test tenant adjustment',
        createdBy: testUser.id,
      });

      // Create adjustment for other tenant
      await service.createAdjustment({
        tenantId: otherTenant.id,
        adjustmentType: VatAdjustmentType.BAD_DEBTS_WRITTEN_OFF,
        amountCents: 200000,
        adjustmentDate: new Date('2025-01-15'),
        description: 'Other tenant adjustment',
        createdBy: otherUser.id,
      });

      // Query for test tenant only
      const aggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      expect(aggregation.adjustmentCount).toBe(1);
      expect(aggregation.field11BadDebtsWrittenOffCents).toBe(100000);
    });
  });

  describe('Decimal Precision', () => {
    it('should maintain precision for large amounts', async () => {
      // Create multiple large adjustments
      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.CAPITAL_GOODS_SCHEME,
        amountCents: 99999999, // R999,999.99
        adjustmentDate: new Date('2025-01-15'),
        description: 'Large 1',
        createdBy: testUser.id,
      });

      await service.createAdjustment({
        tenantId: testTenant.id,
        adjustmentType: VatAdjustmentType.CAPITAL_GOODS_SCHEME,
        amountCents: 99999999, // R999,999.99
        adjustmentDate: new Date('2025-01-16'),
        description: 'Large 2',
        createdBy: testUser.id,
      });

      const aggregation = await service.getAdjustmentsForPeriod({
        tenantId: testTenant.id,
        periodStart: new Date('2025-01-01'),
        periodEnd: new Date('2025-01-31'),
      });

      // Should sum correctly without floating point errors
      expect(aggregation.field13CapitalGoodsSchemeCents).toBe(199999998);
    });
  });
});

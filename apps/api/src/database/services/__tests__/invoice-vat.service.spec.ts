/**
 * Invoice VAT Service Tests
 * TASK-BILL-018: VAT Calculation for VAT-Registered Creches
 *
 * Tests cover:
 * - VAT calculation for registered tenants
 * - No VAT for non-registered tenants
 * - Registration date handling
 * - Threshold monitoring (approaching, imminent, exceeded)
 * - VAT registration process
 * - Turnover tracking
 */

import { Test, TestingModule } from '@nestjs/testing';
import Decimal from 'decimal.js';
import { InvoiceVatService } from '../invoice-vat.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantRepository } from '../../repositories/tenant.repository';
import { AuditLogService } from '../audit-log.service';
import {
  TaxStatus,
  VatThresholdAlertLevel,
} from '../../entities/tenant.entity';
import { ValidationException } from '../../../shared/exceptions';

describe('InvoiceVatService', () => {
  let service: InvoiceVatService;
  let prismaService: jest.Mocked<PrismaService>;
  let tenantRepo: jest.Mocked<TenantRepository>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockTenantVatRegistered = {
    id: 'tenant-vat',
    name: 'VAT Registered Creche',
    taxStatus: TaxStatus.VAT_REGISTERED,
    vatNumber: '4123456789',
    vatRegistrationDate: new Date('2024-01-01'),
    cumulativeTurnoverCents: BigInt(50_000_000), // R500,000
    email: 'vat@creche.co.za',
  };

  const mockTenantNotRegistered = {
    id: 'tenant-no-vat',
    name: 'Non-VAT Creche',
    taxStatus: TaxStatus.NOT_REGISTERED,
    vatNumber: null,
    vatRegistrationDate: null,
    cumulativeTurnoverCents: BigInt(30_000_000), // R300,000
    email: 'novat@creche.co.za',
  };

  beforeEach(async () => {
    const mockPrismaService = {
      tenant: {
        update: jest.fn(),
      },
    };

    const mockTenantRepo = {
      findById: jest.fn(),
    };

    const mockAuditLogService = {
      logUpdate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceVatService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TenantRepository, useValue: mockTenantRepo },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<InvoiceVatService>(InvoiceVatService);
    prismaService = module.get(PrismaService);
    tenantRepo = module.get(TenantRepository);
    auditLogService = module.get(AuditLogService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateInvoiceVat', () => {
    it('should calculate 15% VAT for VAT-registered tenant', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantVatRegistered as never);

      const result = await service.calculateInvoiceVat(
        'tenant-vat',
        new Decimal(100000), // R1000.00
        new Date('2025-01-15'), // After registration date
      );

      expect(result.isVatRegistered).toBe(true);
      expect(result.vatApplied).toBe(true);
      expect(result.vatRate).toBe(15);
      expect(result.subtotal.toNumber()).toBe(100000);
      expect(result.vatAmount.toNumber()).toBe(15000); // 15% of R1000
      expect(result.total.toNumber()).toBe(115000);
    });

    it('should NOT apply VAT for non-registered tenant', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);

      const result = await service.calculateInvoiceVat(
        'tenant-no-vat',
        new Decimal(100000), // R1000.00
        new Date('2025-01-15'),
      );

      expect(result.isVatRegistered).toBe(false);
      expect(result.vatApplied).toBe(false);
      expect(result.vatRate).toBe(0);
      expect(result.subtotal.toNumber()).toBe(100000);
      expect(result.vatAmount.toNumber()).toBe(0);
      expect(result.total.toNumber()).toBe(100000);
    });

    it('should NOT apply VAT before registration date', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantVatRegistered as never);

      const result = await service.calculateInvoiceVat(
        'tenant-vat',
        new Decimal(100000),
        new Date('2023-12-15'), // Before registration date (2024-01-01)
      );

      expect(result.isVatRegistered).toBe(true);
      expect(result.vatApplied).toBe(false);
      expect(result.vatRate).toBe(0);
      expect(result.vatAmount.toNumber()).toBe(0);
      expect(result.total.toNumber()).toBe(100000);
    });

    it('should apply VAT on exact registration date', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantVatRegistered as never);

      const result = await service.calculateInvoiceVat(
        'tenant-vat',
        new Decimal(100000),
        new Date('2024-01-01'), // Exact registration date
      );

      expect(result.vatApplied).toBe(true);
      expect(result.vatRate).toBe(15);
      expect(result.vatAmount.toNumber()).toBe(15000);
    });

    it("should use banker's rounding for VAT calculation", async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantVatRegistered as never);

      // Amount that causes rounding: R33.33 -> VAT = R4.9995 -> rounds to R5.00
      const result = await service.calculateInvoiceVat(
        'tenant-vat',
        new Decimal(3333), // R33.33
        new Date('2025-01-15'),
      );

      // 3333 * 0.15 = 499.95, banker's rounds to 500
      expect(result.vatAmount.toNumber()).toBe(500);
      expect(result.total.toNumber()).toBe(3833);
    });

    it('should handle legacy VAT-registered tenant without registration date', async () => {
      const legacyTenant = {
        ...mockTenantVatRegistered,
        vatRegistrationDate: null, // No date set
      };
      tenantRepo.findById.mockResolvedValue(legacyTenant as never);

      const result = await service.calculateInvoiceVat(
        'tenant-vat',
        new Decimal(100000),
        new Date('2025-01-15'),
      );

      expect(result.vatApplied).toBe(true); // Should apply for legacy
      expect(result.vatRate).toBe(15);
    });

    it('should throw error if tenant not found', async () => {
      tenantRepo.findById.mockResolvedValue(null);

      await expect(
        service.calculateInvoiceVat(
          'nonexistent',
          new Decimal(100000),
          new Date(),
        ),
      ).rejects.toThrow('Tenant nonexistent not found');
    });
  });

  describe('checkVatThreshold', () => {
    it('should return NONE alert for turnover below R800,000', async () => {
      tenantRepo.findById.mockResolvedValue({
        ...mockTenantNotRegistered,
        cumulativeTurnoverCents: BigInt(50_000_000), // R500,000
      } as never);

      const result = await service.checkVatThreshold('tenant-no-vat');

      expect(result.alertLevel).toBe(VatThresholdAlertLevel.NONE);
      expect(result.percentToThreshold).toBe(50);
      expect(result.message).toContain('below VAT registration threshold');
    });

    it('should return APPROACHING alert for turnover R800,000-R950,000', async () => {
      tenantRepo.findById.mockResolvedValue({
        ...mockTenantNotRegistered,
        cumulativeTurnoverCents: BigInt(85_000_000), // R850,000
      } as never);

      const result = await service.checkVatThreshold('tenant-no-vat');

      expect(result.alertLevel).toBe(VatThresholdAlertLevel.APPROACHING);
      expect(result.percentToThreshold).toBe(85);
      expect(result.message).toContain(
        'remaining until VAT registration threshold',
      );
    });

    it('should return IMMINENT alert for turnover R950,000-R1,000,000', async () => {
      tenantRepo.findById.mockResolvedValue({
        ...mockTenantNotRegistered,
        cumulativeTurnoverCents: BigInt(97_000_000), // R970,000
      } as never);

      const result = await service.checkVatThreshold('tenant-no-vat');

      expect(result.alertLevel).toBe(VatThresholdAlertLevel.IMMINENT);
      expect(result.percentToThreshold).toBe(97);
      expect(result.message).toContain('Consider registering now');
    });

    it('should return EXCEEDED alert for turnover >= R1,000,000', async () => {
      tenantRepo.findById.mockResolvedValue({
        ...mockTenantNotRegistered,
        cumulativeTurnoverCents: BigInt(105_000_000), // R1,050,000
      } as never);

      const result = await service.checkVatThreshold('tenant-no-vat');

      expect(result.alertLevel).toBe(VatThresholdAlertLevel.EXCEEDED);
      expect(result.percentToThreshold).toBe(105);
      expect(result.message).toContain('CRITICAL');
      expect(result.message).toContain('mandatory');
    });

    it('should return correct threshold value', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);

      const result = await service.checkVatThreshold('tenant-no-vat');

      expect(result.thresholdCents).toBe(BigInt(100_000_000)); // R1,000,000
    });
  });

  describe('registerForVat', () => {
    it('should register tenant for VAT with valid number', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);
      prismaService.tenant.update.mockResolvedValue({} as never);
      auditLogService.logUpdate.mockResolvedValue(undefined);

      await service.registerForVat(
        'tenant-no-vat',
        '4123456789',
        new Date('2025-02-01'),
        'user-123',
      );

      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-no-vat' },
        data: {
          taxStatus: TaxStatus.VAT_REGISTERED,
          vatNumber: '4123456789',
          vatRegistrationDate: new Date('2025-02-01'),
        },
      });

      expect(auditLogService.logUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-no-vat',
          entityType: 'Tenant',
          changeSummary: 'VAT registration activated',
        }),
      );
    });

    it('should clean VAT number (remove non-digits)', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);
      prismaService.tenant.update.mockResolvedValue({} as never);
      auditLogService.logUpdate.mockResolvedValue(undefined);

      await service.registerForVat(
        'tenant-no-vat',
        '412-345-6789', // With dashes
        new Date('2025-02-01'),
      );

      expect(prismaService.tenant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            vatNumber: '4123456789', // Cleaned
          }),
        }),
      );
    });

    it('should reject invalid VAT number (wrong length)', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);

      await expect(
        service.registerForVat(
          'tenant-no-vat',
          '123456', // Too short
          new Date('2025-02-01'),
        ),
      ).rejects.toThrow(ValidationException);
    });

    it('should throw error if tenant not found', async () => {
      tenantRepo.findById.mockResolvedValue(null);

      await expect(
        service.registerForVat(
          'nonexistent',
          '4123456789',
          new Date('2025-02-01'),
        ),
      ).rejects.toThrow('Tenant nonexistent not found');
    });
  });

  describe('updateTurnover', () => {
    it('should increment cumulative turnover', async () => {
      tenantRepo.findById.mockResolvedValue({
        ...mockTenantNotRegistered,
        cumulativeTurnoverCents: BigInt(50_000_000), // After update
      } as never);
      prismaService.tenant.update.mockResolvedValue({} as never);

      const result = await service.updateTurnover('tenant-no-vat', 1000000); // R10,000

      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-no-vat' },
        data: {
          cumulativeTurnoverCents: {
            increment: BigInt(1000000),
          },
        },
      });

      // Should return threshold status
      expect(result).toHaveProperty('alertLevel');
      expect(result).toHaveProperty('currentTurnoverCents');
    });
  });

  describe('resetTurnover', () => {
    it('should reset turnover to zero', async () => {
      tenantRepo.findById.mockResolvedValue(mockTenantNotRegistered as never);
      prismaService.tenant.update.mockResolvedValue({} as never);
      auditLogService.logUpdate.mockResolvedValue(undefined);

      await service.resetTurnover('tenant-no-vat', 'user-123');

      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tenant-no-vat' },
        data: {
          cumulativeTurnoverCents: BigInt(0),
        },
      });

      expect(auditLogService.logUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          changeSummary: 'Annual turnover reset for new financial year',
        }),
      );
    });
  });

  describe('calculateVatFromExclusive', () => {
    it('should calculate 15% VAT from exclusive amount', () => {
      expect(service.calculateVatFromExclusive(100000)).toBe(15000); // R1000 -> R150 VAT
      expect(service.calculateVatFromExclusive(50000)).toBe(7500); // R500 -> R75 VAT
    });

    it("should use banker's rounding", () => {
      // 3333 * 0.15 = 499.95 -> rounds to 500 (banker's)
      expect(service.calculateVatFromExclusive(3333)).toBe(500);
    });
  });

  describe('extractVatFromInclusive', () => {
    it('should extract VAT from inclusive amount', () => {
      // R115 inclusive = R100 exclusive + R15 VAT
      expect(service.extractVatFromInclusive(11500)).toBe(1500);
    });

    it("should use banker's rounding", () => {
      // R100 inclusive: 100 / 1.15 = 86.9565... -> 87, VAT = 13
      expect(service.extractVatFromInclusive(10000)).toBe(1304); // 10000 - 8696 = 1304
    });
  });

  describe('getVatRate', () => {
    it('should return 15', () => {
      expect(service.getVatRate()).toBe(15);
    });
  });

  describe('getVatThresholdRand', () => {
    it('should return 1,000,000', () => {
      expect(service.getVatThresholdRand()).toBe(1_000_000);
    });
  });
});

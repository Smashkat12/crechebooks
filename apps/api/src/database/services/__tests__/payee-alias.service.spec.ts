/**
 * PayeeAliasService Unit Tests
 * TASK-TRANS-018: Enable Payee Alias Matching in Categorization
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PayeeAliasService } from '../payee-alias.service';
import { PayeePatternRepository } from '../../repositories/payee-pattern.repository';
import { PayeeVariationDetectorService } from '../payee-variation-detector.service';
import {
  BusinessException,
  NotFoundException,
} from '../../../shared/exceptions';
import { PayeePattern } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('PayeeAliasService', () => {
  let service: PayeeAliasService;
  let patternRepo: jest.Mocked<PayeePatternRepository>;
  let variationDetector: jest.Mocked<PayeeVariationDetectorService>;

  const mockTenantId = 'tenant-123';
  const mockPattern: PayeePattern = {
    id: 'pattern-1',
    tenantId: mockTenantId,
    payeePattern: 'WOOLWORTHS',
    payeeAliases: ['WOOLWORTHS SANDTON', 'W/WORTHS'],
    defaultAccountCode: '5100',
    defaultAccountName: 'Groceries',
    confidenceBoost: new Decimal(10),
    matchCount: 5,
    isRecurring: false,
    isActive: true,
    source: 'MANUAL',
    expectedAmountCents: null,
    amountVariancePercent: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(async () => {
    const mockPatternRepo = {
      findByTenant: jest.fn(),
      findByPayeeName: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    const mockVariationDetector = {
      detectVariations: jest.fn().mockResolvedValue([]),
      findAllPotentialGroups: jest.fn().mockResolvedValue([]),
      normalize: jest.fn((name: string) => name.toUpperCase().trim()),
      calculateSimilarity: jest
        .fn()
        .mockReturnValue({ score: 0, method: 'fuzzy' }),
      getSuggestedAliases: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayeeAliasService,
        {
          provide: PayeePatternRepository,
          useValue: mockPatternRepo,
        },
        {
          provide: PayeeVariationDetectorService,
          useValue: mockVariationDetector,
        },
      ],
    }).compile();

    service = module.get<PayeeAliasService>(PayeeAliasService);
    patternRepo = module.get(PayeePatternRepository);
    variationDetector = module.get(PayeeVariationDetectorService);
  });

  describe('resolveAlias', () => {
    it('should return canonical name for exact match', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      const result = await service.resolveAlias(mockTenantId, 'WOOLWORTHS');

      expect(result).toBe('WOOLWORTHS');
      expect(patternRepo.findByTenant).toHaveBeenCalledWith(mockTenantId, {});
    });

    it('should resolve alias to canonical name', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      const result = await service.resolveAlias(
        mockTenantId,
        'WOOLWORTHS SANDTON',
      );

      expect(result).toBe('WOOLWORTHS');
    });

    it('should be case-insensitive', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      const result = await service.resolveAlias(
        mockTenantId,
        'woolworths sandton',
      );

      expect(result).toBe('WOOLWORTHS');
    });

    it('should handle special characters in alias', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      const result = await service.resolveAlias(mockTenantId, 'W/WORTHS');

      expect(result).toBe('WOOLWORTHS');
    });

    it('should return original name if no alias found', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      const result = await service.resolveAlias(mockTenantId, 'CHECKERS');

      expect(result).toBe('CHECKERS');
    });

    it('should return empty string for empty input', async () => {
      const result = await service.resolveAlias(mockTenantId, '');

      expect(result).toBe('');
      expect(patternRepo.findByTenant).not.toHaveBeenCalled();
    });
  });

  describe('createAlias', () => {
    it('should create new alias for existing pattern', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);
      patternRepo.findByPayeeName.mockResolvedValue(mockPattern);
      patternRepo.update.mockResolvedValue({
        ...mockPattern,
        payeeAliases: [...(mockPattern.payeeAliases as string[]), 'WOOLIES'],
      });

      const result = await service.createAlias(
        mockTenantId,
        'WOOLIES',
        'WOOLWORTHS',
      );

      expect(result.alias).toBe('WOOLIES');
      expect(result.canonicalName).toBe('WOOLWORTHS');
      expect(patternRepo.update).toHaveBeenCalledWith(mockPattern.id, {
        payeeAliases: ['WOOLWORTHS SANDTON', 'W/WORTHS', 'WOOLIES'],
      });
    });

    it('should create new pattern if canonical name does not exist', async () => {
      patternRepo.findByTenant.mockResolvedValue([]);
      patternRepo.findByPayeeName.mockResolvedValue(null);
      patternRepo.create.mockResolvedValue({
        ...mockPattern,
        id: 'new-pattern',
        payeePattern: 'CHECKERS',
        payeeAliases: [],
      });
      patternRepo.update.mockResolvedValue({
        ...mockPattern,
        id: 'new-pattern',
        payeePattern: 'CHECKERS',
        payeeAliases: ['CHECKERS HYPER'],
      });

      const result = await service.createAlias(
        mockTenantId,
        'CHECKERS HYPER',
        'CHECKERS',
      );

      expect(result.alias).toBe('CHECKERS HYPER');
      expect(result.canonicalName).toBe('CHECKERS');
      expect(patternRepo.create).toHaveBeenCalled();
    });

    it('should prevent duplicate aliases', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      await expect(
        service.createAlias(mockTenantId, 'WOOLWORTHS SANDTON', 'WOOLWORTHS'),
      ).rejects.toThrow(BusinessException);
    });

    it('should prevent alias that matches a canonical name', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);

      await expect(
        service.createAlias(mockTenantId, 'WOOLWORTHS', 'CHECKERS'),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw error for empty alias', async () => {
      await expect(
        service.createAlias(mockTenantId, '', 'WOOLWORTHS'),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw error for empty canonical name', async () => {
      await expect(
        service.createAlias(mockTenantId, 'WOOLIES', ''),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('getAliases', () => {
    it('should return all aliases for canonical name', async () => {
      patternRepo.findByPayeeName.mockResolvedValue(mockPattern);

      const result = await service.getAliases(mockTenantId, 'WOOLWORTHS');

      expect(result).toHaveLength(2);
      expect(result[0].alias).toBe('WOOLWORTHS SANDTON');
      expect(result[0].canonicalName).toBe('WOOLWORTHS');
      expect(result[1].alias).toBe('W/WORTHS');
    });

    it('should return empty array if pattern not found', async () => {
      patternRepo.findByPayeeName.mockResolvedValue(null);

      const result = await service.getAliases(mockTenantId, 'UNKNOWN');

      expect(result).toEqual([]);
    });

    it('should return empty array if no aliases exist', async () => {
      patternRepo.findByPayeeName.mockResolvedValue({
        ...mockPattern,
        payeeAliases: [],
      });

      const result = await service.getAliases(mockTenantId, 'WOOLWORTHS');

      expect(result).toEqual([]);
    });
  });

  describe('deleteAlias', () => {
    it('should delete an alias', async () => {
      patternRepo.findById.mockResolvedValue(mockPattern);
      patternRepo.update.mockResolvedValue({
        ...mockPattern,
        payeeAliases: ['WOOLWORTHS SANDTON'],
      });

      await service.deleteAlias(mockTenantId, 'pattern-1:W/WORTHS');

      expect(patternRepo.update).toHaveBeenCalledWith('pattern-1', {
        payeeAliases: ['WOOLWORTHS SANDTON'],
      });
    });

    it('should be case-insensitive when deleting', async () => {
      patternRepo.findById.mockResolvedValue(mockPattern);
      patternRepo.update.mockResolvedValue({
        ...mockPattern,
        payeeAliases: ['WOOLWORTHS SANDTON'],
      });

      await service.deleteAlias(mockTenantId, 'pattern-1:w/worths');

      expect(patternRepo.update).toHaveBeenCalledWith('pattern-1', {
        payeeAliases: ['WOOLWORTHS SANDTON'],
      });
    });

    it('should handle aliases with colons', async () => {
      const patternWithColon = {
        ...mockPattern,
        payeeAliases: ['STORE:BRANCH1'],
      };
      patternRepo.findById.mockResolvedValue(patternWithColon);
      patternRepo.update.mockResolvedValue({
        ...patternWithColon,
        payeeAliases: [],
      });

      await service.deleteAlias(mockTenantId, 'pattern-1:STORE:BRANCH1');

      expect(patternRepo.update).toHaveBeenCalledWith('pattern-1', {
        payeeAliases: [],
      });
    });

    it('should throw error for invalid alias ID format', async () => {
      await expect(
        service.deleteAlias(mockTenantId, 'invalid'),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw error if pattern not found', async () => {
      patternRepo.findById.mockResolvedValue(null);

      await expect(
        service.deleteAlias(mockTenantId, 'unknown:ALIAS'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw error if alias not found', async () => {
      patternRepo.findById.mockResolvedValue(mockPattern);

      await expect(
        service.deleteAlias(mockTenantId, 'pattern-1:NONEXISTENT'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation', async () => {
      patternRepo.findById.mockResolvedValue({
        ...mockPattern,
        tenantId: 'different-tenant',
      });

      await expect(
        service.deleteAlias(mockTenantId, 'pattern-1:W/WORTHS'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findSimilar', () => {
    const mockPatterns: PayeePattern[] = [
      mockPattern,
      {
        ...mockPattern,
        id: 'pattern-2',
        payeePattern: 'WOOLWORTH',
        payeeAliases: [],
      },
      {
        ...mockPattern,
        id: 'pattern-3',
        payeePattern: 'SPAR',
        payeeAliases: [],
      },
    ];

    it('should find similar payee names using Levenshtein distance', async () => {
      patternRepo.findByTenant.mockResolvedValue(mockPatterns);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'WOLWORTHS',
          payeeB: 'WOOLWORTHS',
          similarity: 0.9,
          matchType: 'fuzzy',
          confidence: 90,
          normalizedA: 'WOLWORTHS',
          normalizedB: 'WOOLWORTHS',
        },
      ]);

      const result = await service.findSimilar(mockTenantId, 'WOLWORTHS');

      expect(result).toContain('WOOLWORTHS');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return results sorted by similarity', async () => {
      patternRepo.findByTenant.mockResolvedValue(mockPatterns);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'WOOLWRTHS',
          payeeB: 'WOOLWORTHS',
          similarity: 0.95,
          matchType: 'fuzzy',
          confidence: 95,
          normalizedA: 'WOOLWRTHS',
          normalizedB: 'WOOLWORTHS',
        },
        {
          payeeA: 'WOOLWRTHS',
          payeeB: 'WOOLWORTH',
          similarity: 0.85,
          matchType: 'fuzzy',
          confidence: 85,
          normalizedA: 'WOOLWRTHS',
          normalizedB: 'WOOLWORTH',
        },
      ]);

      const result = await service.findSimilar(mockTenantId, 'WOOLWRTHS');

      // "WOOLWORTHS" should be first (higher confidence)
      expect(result[0]).toBe('WOOLWORTHS');
    });

    it('should check aliases for similarity', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'WOOLWORTHS SNTON',
          payeeB: 'WOOLWORTHS SANDTON',
          similarity: 0.88,
          matchType: 'fuzzy',
          confidence: 88,
          normalizedA: 'WOOLWORTHS SNTON',
          normalizedB: 'WOOLWORTHS SANDTON',
        },
      ]);

      const result = await service.findSimilar(
        mockTenantId,
        'WOOLWORTHS SNTON',
      );

      expect(result).toContain('WOOLWORTHS');
    });

    it('should not return dissimilar names', async () => {
      patternRepo.findByTenant.mockResolvedValue(mockPatterns);
      variationDetector.detectVariations.mockResolvedValue([]);

      const result = await service.findSimilar(mockTenantId, 'CHECKERS');

      expect(result).not.toContain('WOOLWORTHS');
      expect(result).not.toContain('SPAR');
    });

    it('should return empty array for empty input', async () => {
      const result = await service.findSimilar(mockTenantId, '');

      expect(result).toEqual([]);
      expect(variationDetector.detectVariations).not.toHaveBeenCalled();
    });

    it('should handle special characters in search', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'W/WRTHS',
          payeeB: 'W/WORTHS',
          similarity: 0.85,
          matchType: 'fuzzy',
          confidence: 85,
          normalizedA: 'W WRTHS',
          normalizedB: 'W WORTHS',
        },
      ]);

      const result = await service.findSimilar(mockTenantId, 'W/WRTHS');

      expect(result).toContain('WOOLWORTHS');
    });
  });

  describe('Levenshtein distance calculation', () => {
    it('should calculate distance for identical strings', async () => {
      patternRepo.findByTenant.mockResolvedValue([mockPattern]);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'WOOLWORTHS',
          payeeB: 'WOOLWORTHS',
          similarity: 1.0,
          matchType: 'exact',
          confidence: 100,
          normalizedA: 'WOOLWORTHS',
          normalizedB: 'WOOLWORTHS',
        },
      ]);

      const result = await service.findSimilar(mockTenantId, 'WOOLWORTHS');

      expect(result).toContain('WOOLWORTHS');
    });

    it('should calculate distance for single character difference', async () => {
      const pattern = {
        ...mockPattern,
        payeePattern: 'WOOLWORTH',
      };
      patternRepo.findByTenant.mockResolvedValue([pattern]);
      variationDetector.detectVariations.mockResolvedValue([
        {
          payeeA: 'WOOLWORTHS',
          payeeB: 'WOOLWORTH',
          similarity: 0.9,
          matchType: 'fuzzy',
          confidence: 90,
          normalizedA: 'WOOLWORTHS',
          normalizedB: 'WOOLWORTH',
        },
      ]);

      const result = await service.findSimilar(mockTenantId, 'WOOLWORTHS');

      expect(result).toContain('WOOLWORTH');
    });

    it('should handle empty strings', async () => {
      const result = await service.findSimilar(mockTenantId, '');

      expect(result).toEqual([]);
    });
  });
});

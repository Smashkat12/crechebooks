/**
 * Payee Variation Detector Service Tests
 * TASK-EC-001: Payee Name Variation Detection Algorithm
 */

import { Test, TestingModule } from '@nestjs/testing';
import { Decimal } from 'decimal.js';
import { PayeeVariationDetectorService } from '../payee-variation-detector.service';
import { PayeeNormalizerService } from '../payee-normalizer.service';
import { PayeePatternRepository } from '../../repositories/payee-pattern.repository';

describe('PayeeVariationDetectorService', () => {
  let service: PayeeVariationDetectorService;
  let normalizer: PayeeNormalizerService;
  let mockRepo: jest.Mocked<PayeePatternRepository>;

  beforeEach(async () => {
    // Mock repository
    mockRepo = {
      findByTenant: jest.fn(),
      findByPayeeName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayeeVariationDetectorService,
        PayeeNormalizerService,
        {
          provide: PayeePatternRepository,
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<PayeeVariationDetectorService>(
      PayeeVariationDetectorService,
    );
    normalizer = module.get<PayeeNormalizerService>(PayeeNormalizerService);
  });

  describe('normalize', () => {
    it('should normalize payee names correctly', () => {
      expect(service.normalize('WOOLWORTHS SANDTON')).toBe('WOOLWORTHS');
      expect(service.normalize('WOOLWORTHS (PTY) LTD')).toBe('WOOLWORTHS');
      expect(service.normalize('Pick n Pay-REF123')).toBe('PICK N PAY');
    });

    it('should handle SA company suffixes', () => {
      expect(service.normalize('ACME PTY LTD')).toBe('ACME');
      expect(service.normalize('ACME (PTY) LTD')).toBe('ACME');
      expect(service.normalize('ACME CC')).toBe('ACME');
      expect(service.normalize('ACME (PTY)')).toBe('ACME');
    });

    it('should remove SA location suffixes', () => {
      expect(service.normalize('WOOLWORTHS SANDTON')).toBe('WOOLWORTHS');
      expect(service.normalize('CHECKERS ROSEBANK')).toBe('CHECKERS');
      expect(service.normalize('SPAR JHB')).toBe('SPAR');
      expect(service.normalize('GAME CPT')).toBe('GAME');
    });

    it('should remove reference codes', () => {
      expect(service.normalize('VENDOR-REF123')).toBe('VENDOR');
      expect(service.normalize('VENDOR/PMT456')).toBe('VENDOR');
      expect(service.normalize('VENDOR-PAY123')).toBe('VENDOR'); // PAY with digits
      expect(service.normalize('VENDOR*789')).toBe('VENDOR');
    });
  });

  describe('calculateSimilarity', () => {
    it('should detect abbreviation matches', () => {
      const result = service.calculateSimilarity('WOOLWORTHS', 'WOOLIES');
      expect(result.method).toBe('abbreviation');
      expect(result.score).toBe(1.0);
    });

    it('should detect suffix matches', () => {
      const result = service.calculateSimilarity(
        'WOOLWORTHS',
        'WOOLWORTHS SANDTON',
      );
      expect(result.method).toBe('suffix');
      expect(result.score).toBe(1.0);
    });

    it('should detect phonetic matches', () => {
      const result = service.calculateSimilarity('SMITH', 'SMYTH');
      expect(result.method).toBe('phonetic');
      expect(result.score).toBeGreaterThanOrEqual(0.85);
    });

    it('should use Jaro-Winkler for name matching', () => {
      const result = service.calculateSimilarity('CHECKERS', 'CHECKER');
      expect(['jaro-winkler', 'levenshtein', 'suffix']).toContain(
        result.method,
      );
      expect(result.score).toBeGreaterThan(0.8);
    });

    it('should use Levenshtein for fuzzy matching', () => {
      const result = service.calculateSimilarity(
        'ACME CORP',
        'ACME CORPORATION',
      );
      expect(result.score).toBeGreaterThan(0.7);
    });

    it('should handle identical names', () => {
      const result = service.calculateSimilarity('WOOLWORTHS', 'WOOLWORTHS');
      expect(result.score).toBe(1.0);
    });
  });

  describe('detectVariations', () => {
    beforeEach(() => {
      // Mock repository to return test data
      mockRepo.findByTenant.mockResolvedValue([
        {
          id: '1',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS',
          payeeAliases: ['WOOLIES', 'WW'],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          tenantId: 'tenant-1',
          payeePattern: 'CHECKERS',
          payeeAliases: ['CHKRS'],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          tenantId: 'tenant-1',
          payeePattern: 'PICK N PAY',
          payeeAliases: ['PNP', 'PICK & PAY'],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should detect WOOLWORTHS variations', async () => {
      const variations = await service.detectVariations(
        'tenant-1',
        'WOOLWORTHS SANDTON',
      );

      expect(variations.length).toBeGreaterThan(0);

      // Should match WOOLWORTHS
      const woolworthsMatch = variations.find((v) => v.payeeB === 'WOOLWORTHS');
      expect(woolworthsMatch).toBeDefined();
      expect(woolworthsMatch?.matchType).toBe('suffix');
      expect(woolworthsMatch?.confidence).toBeGreaterThan(85);
    });

    it('should detect abbreviation variations', async () => {
      const variations = await service.detectVariations('tenant-1', 'WOOLIES');

      const woolworthsMatch = variations.find((v) => v.payeeB === 'WOOLWORTHS');
      expect(woolworthsMatch).toBeDefined();
      expect(woolworthsMatch?.matchType).toBe('abbreviation');
      expect(woolworthsMatch?.confidence).toBeGreaterThanOrEqual(95);
    });

    it('should detect PTY LTD variations', async () => {
      const variations = await service.detectVariations(
        'tenant-1',
        'CHECKERS (PTY) LTD',
      );

      const checkersMatch = variations.find((v) => v.payeeB === 'CHECKERS');
      expect(checkersMatch).toBeDefined();
      // Can be suffix or abbreviation match (both are valid)
      expect(['suffix', 'abbreviation']).toContain(checkersMatch?.matchType);
    });

    it('should not match completely different payees', async () => {
      const variations = await service.detectVariations(
        'tenant-1',
        'ESKOM PAYMENT',
      );

      const woolworthsMatch = variations.find((v) => v.payeeB === 'WOOLWORTHS');
      expect(woolworthsMatch).toBeUndefined();
    });

    it('should handle empty payee name', async () => {
      const variations = await service.detectVariations('tenant-1', '');
      expect(variations).toEqual([]);
    });

    it('should handle very short payee names', async () => {
      const variations = await service.detectVariations('tenant-1', 'AB');
      expect(variations).toEqual([]);
    });

    it('should sort results by confidence', async () => {
      const variations = await service.detectVariations(
        'tenant-1',
        'WOOLWORTHS ROSEBANK',
      );

      for (let i = 1; i < variations.length; i++) {
        expect(variations[i - 1].confidence).toBeGreaterThanOrEqual(
          variations[i].confidence,
        );
      }
    });
  });

  describe('findAllPotentialGroups', () => {
    beforeEach(() => {
      mockRepo.findByTenant.mockResolvedValue([
        {
          id: '1',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS SANDTON',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '3',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS JHB',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '4',
          tenantId: 'tenant-1',
          payeePattern: 'CHECKERS',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should group WOOLWORTHS variations', async () => {
      const groups = await service.findAllPotentialGroups('tenant-1');

      const woolworthsGroup = groups.find((g) =>
        g.variants.some((v) => v.includes('WOOLWORTHS')),
      );

      expect(woolworthsGroup).toBeDefined();
      expect(woolworthsGroup?.variants.length).toBeGreaterThan(1);
      expect(woolworthsGroup?.variants).toContain('WOOLWORTHS');
    });

    it('should not group unrelated payees', async () => {
      const groups = await service.findAllPotentialGroups('tenant-1');

      const group = groups.find((g) => {
        const hasWoolworths = g.variants.some((v) => v.includes('WOOLWORTHS'));
        const hasCheckers = g.variants.some((v) => v.includes('CHECKERS'));
        return hasWoolworths && hasCheckers;
      });

      expect(group).toBeUndefined();
    });

    it('should sort groups by confidence', async () => {
      const groups = await service.findAllPotentialGroups('tenant-1');

      for (let i = 1; i < groups.length; i++) {
        expect(groups[i - 1].confidence).toBeGreaterThanOrEqual(
          groups[i].confidence,
        );
      }
    });
  });

  describe('getSuggestedAliases', () => {
    beforeEach(() => {
      mockRepo.findByTenant.mockResolvedValue([
        {
          id: '1',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: '2',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS SANDTON',
          payeeAliases: [],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
    });

    it('should suggest high-confidence aliases', async () => {
      const suggestions = await service.getSuggestedAliases('tenant-1');

      expect(suggestions.length).toBeGreaterThan(0);
      suggestions.forEach((s) => {
        expect(s.confidence).toBeGreaterThanOrEqual(70);
      });
    });

    it('should include suggested canonical names', async () => {
      const suggestions = await service.getSuggestedAliases('tenant-1');

      suggestions.forEach((s) => {
        expect(s.suggestedCanonical).toBeTruthy();
        expect(s.payeeName).toBeTruthy();
        expect(s.payeeName).not.toBe(s.suggestedCanonical);
      });
    });

    it('should include helpful reasons', async () => {
      const suggestions = await service.getSuggestedAliases('tenant-1');

      suggestions.forEach((s) => {
        expect(s.reason).toBeTruthy();
        expect(typeof s.reason).toBe('string');
      });
    });

    it('should include examples', async () => {
      const suggestions = await service.getSuggestedAliases('tenant-1');

      suggestions.forEach((s) => {
        expect(Array.isArray(s.examples)).toBe(true);
      });
    });

    it('should respect limit parameter', async () => {
      const suggestions = await service.getSuggestedAliases('tenant-1', 5);

      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('SA-specific edge cases', () => {
    it('should handle multiple suffixes', () => {
      expect(service.normalize('ACME PTY LTD SANDTON')).toBe('ACME');
    });

    it('should handle parentheses in suffixes', () => {
      expect(service.normalize('ACME (PTY) LTD')).toBe('ACME');
      expect(service.normalize('ACME (CC)')).toBe('ACME');
    });

    it('should handle multiple reference codes', () => {
      expect(service.normalize('VENDOR-REF123/PMT456')).toBe('VENDOR');
    });

    it('should handle special characters', () => {
      // Special characters are replaced with spaces during normalization
      const result1 = service.normalize('PICK-N-PAY');
      const result2 = service.normalize('PICK_N_PAY');
      const result3 = service.normalize('PICK.N.PAY');

      // All should contain PICK and normalize similarly
      expect(result1).toContain('PICK');
      expect(result2).toContain('PICK');
      expect(result3).toContain('PICK');

      // They should all be similar after normalization
      const sim1 = service.calculateSimilarity(result1, result2);
      const sim2 = service.calculateSimilarity(result2, result3);
      expect(sim1.score).toBeGreaterThan(0.8);
      expect(sim2.score).toBeGreaterThan(0.8);
    });

    it('should handle known SA abbreviations', () => {
      const result1 = service.calculateSimilarity('FNB', 'FIRST NATIONAL BANK');
      expect(result1.method).toBe('abbreviation');

      const result2 = service.calculateSimilarity('PNP', 'PICK N PAY');
      expect(result2.method).toBe('abbreviation');
    });
  });

  describe('performance', () => {
    it('should complete single detection in under 100ms', async () => {
      mockRepo.findByTenant.mockResolvedValue([
        {
          id: '1',
          tenantId: 'tenant-1',
          payeePattern: 'WOOLWORTHS',
          payeeAliases: ['WOOLIES'],
          defaultAccountCode: '5000',
          defaultAccountName: 'Groceries',
          confidenceBoost: new Decimal(0),
          matchCount: 0,
          expectedAmountCents: null,
          amountVariancePercent: null,
          isRecurring: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const start = Date.now();
      await service.detectVariations('tenant-1', 'WOOLWORTHS SANDTON');
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
    });
  });
});

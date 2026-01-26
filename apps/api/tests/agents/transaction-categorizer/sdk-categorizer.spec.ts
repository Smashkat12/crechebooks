/**
 * SDK Categorizer Tests
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * Tests for SdkCategorizer class: categorize(), parseCategorizationResponse(),
 * model routing, VAT validation, confidence clamping, and ruvector integration.
 *
 * CRITICAL: Uses mocks for executeSdkInference — NEVER makes real API calls.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SdkCategorizer } from '../../../src/agents/transaction-categorizer/sdk-categorizer';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import { RuvectorService } from '../../../src/agents/sdk/ruvector.service';

describe('SdkCategorizer', () => {
  let sdkCategorizer: SdkCategorizer;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              ANTHROPIC_API_KEY: 'test-key',
              SDK_DISABLED: 'false',
            }),
          ],
        }),
      ],
      providers: [
        SdkCategorizer,
        SdkAgentFactory,
        SdkConfigService,
        {
          provide: RuvectorService,
          useValue: {
            isAvailable: jest.fn().mockReturnValue(false),
            generateEmbedding: jest.fn(),
            searchSimilar: jest.fn(),
          },
        },
      ],
    }).compile();

    sdkCategorizer = module.get(SdkCategorizer);
  });

  describe('categorize()', () => {
    it('should return structured categorization result', async () => {
      // Mock the SDK inference to return a valid JSON response
      jest.spyOn(sdkCategorizer, 'executeSdkInference').mockResolvedValue(
        JSON.stringify({
          accountCode: '5200',
          accountName: 'Food & Catering Costs',
          vatType: 'STANDARD',
          confidence: 88,
          reasoning:
            'Woolworths is a grocery retailer, categorized as food expense',
        }),
      );

      const result = await sdkCategorizer.categorize(
        {
          tenantId: 'tenant-123',
          payeeName: 'Woolworths',
          description: 'Groceries for meals',
          amountCents: 250000,
          isCredit: false,
        },
        'tenant-123',
      );

      expect(result.accountCode).toBe('5200');
      expect(result.accountName).toBe('Food & Catering Costs');
      expect(result.vatType).toBe('STANDARD');
      expect(result.confidence).toBe(88);
      expect(result.source).toBe('LLM');
      expect(result.reasoning).toContain('grocery');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(result.model).toBe('haiku'); // normal amount, description present
    });

    it('should handle JSON wrapped in markdown code blocks', async () => {
      jest
        .spyOn(sdkCategorizer, 'executeSdkInference')
        .mockResolvedValue(
          '```json\n{"accountCode": "6600", "accountName": "Bank Charges", "vatType": "NO_VAT", "confidence": 99, "reasoning": "Bank fee"}\n```',
        );

      const result = await sdkCategorizer.categorize(
        {
          tenantId: 't1',
          payeeName: 'FNB',
          description: 'Service fee monthly charge',
          amountCents: 5000,
          isCredit: false,
        },
        't1',
      );

      expect(result.accountCode).toBe('6600');
      expect(result.vatType).toBe('NO_VAT');
    });

    it('should throw on malformed response', async () => {
      jest
        .spyOn(sdkCategorizer, 'executeSdkInference')
        .mockResolvedValue('Sorry, I cannot categorize this transaction.');

      await expect(
        sdkCategorizer.categorize(
          {
            tenantId: 't1',
            payeeName: 'Unknown',
            description: 'Some description text',
            amountCents: 100,
            isCredit: false,
          },
          't1',
        ),
      ).rejects.toThrow('SDK response parsing failed');
    });

    it('should clamp confidence to 0-100', async () => {
      jest.spyOn(sdkCategorizer, 'executeSdkInference').mockResolvedValue(
        JSON.stringify({
          accountCode: '4000',
          accountName: 'Tuition Fees',
          vatType: 'EXEMPT',
          confidence: 150, // Over 100
          reasoning: 'test',
        }),
      );

      const result = await sdkCategorizer.categorize(
        {
          tenantId: 't1',
          payeeName: 'Parent',
          description: 'Monthly tuition fee payment',
          amountCents: 500000,
          isCredit: true,
        },
        't1',
      );

      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should clamp negative confidence to 0', async () => {
      jest.spyOn(sdkCategorizer, 'executeSdkInference').mockResolvedValue(
        JSON.stringify({
          accountCode: '4000',
          accountName: 'Tuition Fees',
          vatType: 'EXEMPT',
          confidence: -10,
          reasoning: 'test',
        }),
      );

      const result = await sdkCategorizer.categorize(
        {
          tenantId: 't1',
          payeeName: 'Parent',
          description: 'Monthly fee payment',
          amountCents: 500000,
          isCredit: true,
        },
        't1',
      );

      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });

    it('should cache successful reasoning in ReasoningBank', async () => {
      jest.spyOn(sdkCategorizer, 'executeSdkInference').mockResolvedValue(
        JSON.stringify({
          accountCode: '6100',
          accountName: 'Utilities - Electricity',
          vatType: 'STANDARD',
          confidence: 90,
          reasoning: 'Eskom electricity payment',
        }),
      );

      // First call - should hit LLM
      const result1 = await sdkCategorizer.categorize(
        {
          tenantId: 't1',
          payeeName: 'ESKOM',
          description: 'Electricity bill payment',
          amountCents: 150000,
          isCredit: false,
        },
        't1',
      );
      expect(result1.accountCode).toBe('6100');

      // Second call with same payee - should hit ReasoningBank cache
      const result2 = await sdkCategorizer.categorize(
        {
          tenantId: 't1',
          payeeName: 'ESKOM',
          description: 'Electricity bill payment',
          amountCents: 150000,
          isCredit: false,
        },
        't1',
      );

      expect(result2.accountCode).toBe('6100');
      // executeSdkInference should only have been called once (first call)
      // Second call should use the cache
      expect(sdkCategorizer.executeSdkInference).toHaveBeenCalledTimes(1);
    });
  });

  describe('routeModel()', () => {
    it('should route to haiku for normal transactions', () => {
      const model = sdkCategorizer.routeModel({
        tenantId: 't1',
        payeeName: 'Woolworths',
        description: 'Groceries',
        amountCents: 250000, // R2,500
        isCredit: false,
      });

      expect(model).toBe('haiku');
    });

    it('should route to sonnet for high-value transactions', () => {
      const model = sdkCategorizer.routeModel({
        tenantId: 't1',
        payeeName: 'Big Purchase',
        description: 'Equipment purchase',
        amountCents: 6000000, // R60,000 (> R50,000 threshold)
        isCredit: false,
      });

      expect(model).toBe('sonnet');
    });

    it('should route to sonnet for ambiguous descriptions', () => {
      const model = sdkCategorizer.routeModel({
        tenantId: 't1',
        payeeName: 'Unknown',
        description: 'Pay', // < 5 chars
        amountCents: 5000,
        isCredit: false,
      });

      expect(model).toBe('sonnet');
    });

    it('should route to sonnet when no description', () => {
      const model = sdkCategorizer.routeModel({
        tenantId: 't1',
        payeeName: 'Unknown',
        amountCents: 5000,
        isCredit: false,
      });

      expect(model).toBe('sonnet');
    });
  });

  describe('parseCategorizationResponse()', () => {
    it('should parse valid JSON response', () => {
      const result = sdkCategorizer.parseCategorizationResponse(
        JSON.stringify({
          accountCode: '5200',
          accountName: 'Food & Catering Costs',
          vatType: 'STANDARD',
          confidence: 88,
          reasoning: 'Grocery purchase',
        }),
      );

      expect(result.accountCode).toBe('5200');
      expect(result.accountName).toBe('Food & Catering Costs');
      expect(result.vatType).toBe('STANDARD');
      expect(result.confidence).toBe(88);
    });

    it('should extract JSON from markdown code blocks', () => {
      const result = sdkCategorizer.parseCategorizationResponse(
        'Here is the result:\n```json\n{"accountCode": "6600", "accountName": "Bank Charges", "vatType": "NO_VAT", "confidence": 99, "reasoning": "Bank fee"}\n```\nDone.',
      );

      expect(result.accountCode).toBe('6600');
      expect(result.vatType).toBe('NO_VAT');
    });

    it('should throw on missing JSON', () => {
      expect(() =>
        sdkCategorizer.parseCategorizationResponse('No JSON here at all.'),
      ).toThrow('SDK response parsing failed');
    });

    it('should throw on missing accountCode', () => {
      expect(() =>
        sdkCategorizer.parseCategorizationResponse(
          JSON.stringify({
            accountCode: '',
            accountName: 'Test',
            vatType: 'STANDARD',
            confidence: 50,
            reasoning: 'test',
          }),
        ),
      ).toThrow('SDK response parsing failed');
    });
  });

  describe('validateVatType()', () => {
    it('should validate STANDARD', () => {
      expect(sdkCategorizer.validateVatType('STANDARD')).toBe('STANDARD');
    });

    it('should validate ZERO_RATED', () => {
      expect(sdkCategorizer.validateVatType('ZERO_RATED')).toBe('ZERO_RATED');
    });

    it('should validate EXEMPT', () => {
      expect(sdkCategorizer.validateVatType('EXEMPT')).toBe('EXEMPT');
    });

    it('should validate NO_VAT', () => {
      expect(sdkCategorizer.validateVatType('NO_VAT')).toBe('NO_VAT');
    });

    it('should handle lowercase input', () => {
      expect(sdkCategorizer.validateVatType('exempt')).toBe('EXEMPT');
    });

    it('should handle mixed case', () => {
      expect(sdkCategorizer.validateVatType('Zero_Rated')).toBe('ZERO_RATED');
    });

    it('should handle hyphens', () => {
      expect(sdkCategorizer.validateVatType('zero-rated')).toBe('ZERO_RATED');
    });

    it('should default invalid types to STANDARD', () => {
      expect(sdkCategorizer.validateVatType('invalid')).toBe('STANDARD');
    });

    it('should default empty string to STANDARD', () => {
      expect(sdkCategorizer.validateVatType('')).toBe('STANDARD');
    });
  });

  describe('searchSimilarCategorizations()', () => {
    let ruvectorService: RuvectorService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            load: [
              () => ({
                ANTHROPIC_API_KEY: 'test-key',
                SDK_DISABLED: 'false',
                RUVECTOR_ENABLED: 'true',
              }),
            ],
          }),
        ],
        providers: [
          SdkCategorizer,
          SdkAgentFactory,
          SdkConfigService,
          {
            provide: RuvectorService,
            useValue: {
              isAvailable: jest.fn().mockReturnValue(true),
              generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
              searchSimilar: jest.fn().mockResolvedValue([]),
            },
          },
        ],
      }).compile();

      sdkCategorizer = module.get(SdkCategorizer);
      ruvectorService = module.get(RuvectorService);
    });

    it('should return null when ruvector is not available', async () => {
      jest.spyOn(ruvectorService, 'isAvailable').mockReturnValue(false);

      const result = await sdkCategorizer.searchSimilarCategorizations(
        'Electricity payment',
        'tenant-1',
      );

      expect(result).toBeNull();
    });

    it('should return null when no strong matches found', async () => {
      jest.spyOn(ruvectorService, 'searchSimilar').mockResolvedValue([
        { id: '1', score: 0.7, metadata: {} }, // Below 0.85 threshold
      ]);

      const result = await sdkCategorizer.searchSimilarCategorizations(
        'Random payment',
        'tenant-1',
      );

      expect(result).toBeNull();
    });

    it('should return result for strong semantic match', async () => {
      jest.spyOn(ruvectorService, 'searchSimilar').mockResolvedValue([
        {
          id: '1',
          score: 0.92,
          metadata: {
            accountCode: '6100',
            accountName: 'Utilities - Electricity',
            vatType: 'STANDARD',
          },
        },
      ]);

      const result = await sdkCategorizer.searchSimilarCategorizations(
        'Eskom electricity',
        'tenant-1',
      );

      expect(result).not.toBeNull();
      expect(result!.accountCode).toBe('6100');
      expect(result!.accountName).toBe('Utilities - Electricity');
      expect(result!.vatType).toBe('STANDARD');
      expect(result!.confidence).toBe(92); // 0.92 * 100
      expect(result!.source).toBe('LLM');
      expect(result!.model).toBe('ruvector-hnsw');
    });

    it('should handle ruvector errors gracefully', async () => {
      jest
        .spyOn(ruvectorService, 'generateEmbedding')
        .mockRejectedValue(new Error('Embedding failed'));

      const result = await sdkCategorizer.searchSimilarCategorizations(
        'Test',
        'tenant-1',
      );

      expect(result).toBeNull();
    });
  });

  describe('executeSdkInference()', () => {
    it('should throw when agentic-flow is not installed', async () => {
      await expect(
        sdkCategorizer.executeSdkInference(
          {
            description: 'test',
            prompt: 'test',
            tools: [],
            model: 'haiku',
          },
          'categorize this',
          'tenant-1',
          'haiku',
        ),
      ).rejects.toThrow('SDK inference not available');
    });
  });

  describe('getAgentDefinition()', () => {
    it('should return agent definition with system prompt', () => {
      const definition = sdkCategorizer.getAgentDefinition('tenant-1');

      expect(definition.prompt).toContain('South African');
      expect(definition.prompt).toContain('Section 12(h)');
      expect(definition.prompt).toContain('accountCode');
      expect(definition.model).toBeDefined();
      expect(definition.tools).toBeDefined();
    });
  });
});

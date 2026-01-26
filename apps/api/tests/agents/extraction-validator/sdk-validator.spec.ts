/**
 * SDK Semantic Validator Tests
 * TASK-SDK-006: ExtractionValidatorAgent SDK Enhancement (Semantic Validation)
 *
 * Tests for LLM-powered semantic validation of parsed bank statements.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SdkSemanticValidator } from '../../../src/agents/extraction-validator/sdk-validator';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import {
  ParsedBankStatement,
  ParsedBankTransaction,
} from '../../../src/database/entities/bank-statement-match.entity';
import {
  ExtractionValidatorAgent,
  BalanceReconciler,
  AmountSanityChecker,
  ExtractionDecisionLogger,
} from '../../../src/agents/extraction-validator';
import type {
  SemanticValidationResult,
  SanitizedStatementSummary,
} from '../../../src/agents/extraction-validator/interfaces/sdk-validator.interface';

// ─────────────────────────────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────────────────────────────

const TENANT_ID = 'test-tenant-sdk-006';

function createStatement(
  overrides: Partial<{
    accountNumber: string;
    openingBalance: number;
    closingBalance: number;
    periodStart: Date;
    periodEnd: Date;
    transactions: Array<{
      amountCents: number;
      isCredit: boolean;
      description?: string;
      date?: Date;
    }>;
  }> = {},
): ParsedBankStatement {
  const defaultTx = [
    {
      amountCents: 10000,
      isCredit: true,
      description: 'EFT DEPOSIT',
    },
  ];

  return {
    statementPeriod: {
      start: overrides.periodStart ?? new Date('2024-01-01'),
      end: overrides.periodEnd ?? new Date('2024-01-31'),
    },
    accountNumber: overrides.accountNumber ?? '63061274808',
    openingBalanceCents: overrides.openingBalance ?? 0,
    closingBalanceCents: overrides.closingBalance ?? 10000,
    transactions: (overrides.transactions ?? defaultTx).map((t) => ({
      date: t.date ?? new Date('2024-01-15'),
      description: t.description ?? 'Test transaction',
      amountCents: t.amountCents,
      isCredit: t.isCredit,
    })),
  };
}

function createManyTransactions(count: number): Array<{
  amountCents: number;
  isCredit: boolean;
  description: string;
  date: Date;
}> {
  return Array.from({ length: count }, (_, i) => ({
    amountCents: (i + 1) * 100,
    isCredit: i % 2 === 0,
    description: `Transaction ${String(i + 1)} description text`,
    date: new Date(2024, 0, (i % 28) + 1),
  }));
}

// ─────────────────────────────────────────────────────────────────────
// SdkSemanticValidator unit tests
// ─────────────────────────────────────────────────────────────────────

describe('SdkSemanticValidator', () => {
  let validator: SdkSemanticValidator;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      providers: [SdkSemanticValidator, SdkAgentFactory, SdkConfigService],
    }).compile();

    validator = module.get<SdkSemanticValidator>(SdkSemanticValidator);
  });

  describe('validate()', () => {
    it('should return a SemanticValidationResult', async () => {
      const statement = createStatement();
      const result = await validator.validate(statement, TENANT_ID);

      expect(result).toBeDefined();
      expect(typeof result.isSemanticValid).toBe('boolean');
      expect(typeof result.semanticConfidence).toBe('number');
      expect(result.semanticConfidence).toBeGreaterThanOrEqual(0);
      expect(result.semanticConfidence).toBeLessThanOrEqual(100);
      expect(result.documentType).toBeDefined();
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.summary).toBe('string');
    });

    it('should return fallback valid result (SDK unavailable)', async () => {
      const statement = createStatement();
      const result = await validator.validate(statement, TENANT_ID);

      // Fallback returns default valid result
      expect(result.isSemanticValid).toBe(true);
      expect(result.documentType).toBe('bank_statement');
      expect(result.issues).toEqual([]);
      expect(result.semanticConfidence).toBe(75);
    });
  });

  describe('sanitizeForLlm()', () => {
    it('should mask account numbers', () => {
      const statement = createStatement({ accountNumber: '63061274808' });
      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.maskedAccountNumber).toBe('******4808');
      expect(sanitised.maskedAccountNumber).not.toContain('6306127');
    });

    it('should mask short account numbers', () => {
      const statement = createStatement({ accountNumber: '1234' });
      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.maskedAccountNumber).toBe('******1234');
    });

    it('should mask very short account numbers', () => {
      const statement = createStatement({ accountNumber: '12' });
      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.maskedAccountNumber).toBe('******12');
    });

    it('should truncate descriptions to 80 characters', () => {
      const longDescription =
        'A'.repeat(100) + ' this part should be truncated by the sanitizer';
      const statement = createStatement({
        transactions: [
          {
            amountCents: 1000,
            isCredit: true,
            description: longDescription,
          },
        ],
      });

      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.sampleTransactions[0].description.length).toBeLessThanOrEqual(83); // 80 + "..."
      expect(sanitised.sampleTransactions[0].description).toContain('...');
    });

    it('should not truncate short descriptions', () => {
      const statement = createStatement({
        transactions: [
          {
            amountCents: 1000,
            isCredit: true,
            description: 'Short desc',
          },
        ],
      });

      const sanitised = validator.sanitizeForLlm(statement);
      expect(sanitised.sampleTransactions[0].description).toBe('Short desc');
    });

    it('should format amounts as Rands', () => {
      const statement = createStatement({
        openingBalance: 100050,
        closingBalance: 200075,
      });

      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.openingBalanceRands).toBe('R 1000.50');
      expect(sanitised.closingBalanceRands).toBe('R 2000.75');
    });

    it('should compute total credits and debits', () => {
      const statement = createStatement({
        transactions: [
          { amountCents: 10000, isCredit: true },
          { amountCents: 20000, isCredit: true },
          { amountCents: 5000, isCredit: false },
        ],
      });

      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.totalCreditsRands).toBe('R 300.00');
      expect(sanitised.totalDebitsRands).toBe('R 50.00');
    });

    it('should include period dates when available', () => {
      const statement = createStatement({
        periodStart: new Date('2024-03-01'),
        periodEnd: new Date('2024-03-31'),
      });

      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.periodStart).toContain('2024-03-01');
      expect(sanitised.periodEnd).toContain('2024-03-31');
    });

    it('should set bankName and accountType to Unknown', () => {
      const statement = createStatement();
      const sanitised = validator.sanitizeForLlm(statement);

      expect(sanitised.bankName).toBe('Unknown');
      expect(sanitised.accountType).toBe('Unknown');
    });
  });

  describe('sampleTransactions()', () => {
    it('should return all transactions if <= 20', () => {
      const transactions: ParsedBankTransaction[] = Array.from(
        { length: 15 },
        (_, i) => ({
          date: new Date(2024, 0, i + 1),
          description: `Tx ${String(i)}`,
          amountCents: (i + 1) * 100,
          isCredit: i % 2 === 0,
        }),
      );

      const sampled = validator.sampleTransactions(transactions);

      expect(sampled).toHaveLength(15);
    });

    it('should return exactly 20 transactions if > 20', () => {
      const transactions: ParsedBankTransaction[] = Array.from(
        { length: 50 },
        (_, i) => ({
          date: new Date(2024, 0, (i % 28) + 1),
          description: `Tx ${String(i)}`,
          amountCents: (i + 1) * 100,
          isCredit: i % 2 === 0,
        }),
      );

      const sampled = validator.sampleTransactions(transactions);

      expect(sampled).toHaveLength(20);
    });

    it('should include first 5 and last 5 transactions', () => {
      const transactions: ParsedBankTransaction[] = Array.from(
        { length: 50 },
        (_, i) => ({
          date: new Date(2024, 0, (i % 28) + 1),
          description: `Tx-${String(i)}`,
          amountCents: (i + 1) * 100,
          isCredit: i % 2 === 0,
        }),
      );

      const sampled = validator.sampleTransactions(transactions);

      // First 5 should be the head
      for (let i = 0; i < 5; i++) {
        expect(sampled[i].description).toBe(`Tx-${String(i)}`);
      }

      // Last 5 should be the tail
      for (let i = 0; i < 5; i++) {
        const tailIdx = sampled.length - 5 + i;
        expect(sampled[tailIdx].description).toBe(`Tx-${String(45 + i)}`);
      }
    });

    it('should return empty array for empty input', () => {
      const sampled = validator.sampleTransactions([]);
      expect(sampled).toHaveLength(0);
    });

    it('should handle exactly 20 transactions', () => {
      const transactions: ParsedBankTransaction[] = Array.from(
        { length: 20 },
        (_, i) => ({
          date: new Date(2024, 0, (i % 28) + 1),
          description: `Tx ${String(i)}`,
          amountCents: (i + 1) * 100,
          isCredit: i % 2 === 0,
        }),
      );

      const sampled = validator.sampleTransactions(transactions);
      expect(sampled).toHaveLength(20);
    });
  });

  describe('parseValidationResponse()', () => {
    it('should parse valid JSON response', () => {
      const response = JSON.stringify({
        isSemanticValid: true,
        semanticConfidence: 85,
        documentType: 'bank_statement',
        issues: [],
        summary: 'Statement is semantically valid.',
      });

      const result = validator.parseValidationResponse(response);

      expect(result.isSemanticValid).toBe(true);
      expect(result.semanticConfidence).toBe(85);
      expect(result.documentType).toBe('bank_statement');
      expect(result.issues).toEqual([]);
      expect(result.summary).toBe('Statement is semantically valid.');
    });

    it('should handle markdown code blocks', () => {
      const response = `Here is the analysis:
\`\`\`json
{
  "isSemanticValid": false,
  "semanticConfidence": 40,
  "documentType": "credit_card",
  "issues": [
    {
      "severity": "ERROR",
      "code": "WRONG_DOCUMENT_TYPE",
      "description": "This appears to be a credit card statement, not a bank statement"
    }
  ],
  "summary": "Document type mismatch detected."
}
\`\`\``;

      const result = validator.parseValidationResponse(response);

      expect(result.isSemanticValid).toBe(false);
      expect(result.semanticConfidence).toBe(40);
      expect(result.documentType).toBe('credit_card');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('WRONG_DOCUMENT_TYPE');
    });

    it('should handle malformed JSON gracefully', () => {
      const response = 'This is not valid JSON at all {{{broken';

      const result = validator.parseValidationResponse(response);

      // Should return default result on parse failure
      expect(result.isSemanticValid).toBe(true);
      expect(result.documentType).toBe('bank_statement');
      expect(result.semanticConfidence).toBe(75);
    });

    it('should detect wrong document type', () => {
      const response = JSON.stringify({
        isSemanticValid: false,
        semanticConfidence: 30,
        documentType: 'investment',
        issues: [
          {
            severity: 'ERROR',
            code: 'WRONG_DOCUMENT_TYPE',
            description: 'Document appears to be an investment statement',
          },
        ],
        summary: 'Wrong document type.',
      });

      const result = validator.parseValidationResponse(response);

      expect(result.isSemanticValid).toBe(false);
      expect(result.documentType).toBe('investment');
      expect(result.issues[0].code).toBe('WRONG_DOCUMENT_TYPE');
    });

    it('should flag OCR corruption issues', () => {
      const response = JSON.stringify({
        isSemanticValid: false,
        semanticConfidence: 25,
        documentType: 'unknown',
        issues: [
          {
            severity: 'ERROR',
            code: 'OCR_CORRUPTION',
            description: 'Multiple transaction descriptions contain gibberish',
          },
          {
            severity: 'WARNING',
            code: 'DESCRIPTION_GIBBERISH',
            description: 'Descriptions appear to be random characters',
          },
        ],
        summary: 'Severe OCR corruption detected.',
      });

      const result = validator.parseValidationResponse(response);

      expect(result.isSemanticValid).toBe(false);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].code).toBe('OCR_CORRUPTION');
      expect(result.issues[1].code).toBe('DESCRIPTION_GIBBERISH');
    });

    it('should detect duplicate transactions', () => {
      const response = JSON.stringify({
        isSemanticValid: false,
        semanticConfidence: 45,
        documentType: 'bank_statement',
        issues: [
          {
            severity: 'ERROR',
            code: 'DUPLICATE_TRANSACTIONS',
            description: '5 pairs of duplicate transactions found',
          },
        ],
        summary: 'Duplicate transactions detected.',
      });

      const result = validator.parseValidationResponse(response);

      expect(result.issues[0].code).toBe('DUPLICATE_TRANSACTIONS');
    });

    it('should clamp confidence to 0-100', () => {
      const responseHigh = JSON.stringify({
        isSemanticValid: true,
        semanticConfidence: 150,
        documentType: 'bank_statement',
        issues: [],
        summary: 'High confidence.',
      });

      const resultHigh = validator.parseValidationResponse(responseHigh);
      expect(resultHigh.semanticConfidence).toBe(100);

      const responseLow = JSON.stringify({
        isSemanticValid: false,
        semanticConfidence: -20,
        documentType: 'bank_statement',
        issues: [],
        summary: 'Low confidence.',
      });

      const resultLow = validator.parseValidationResponse(responseLow);
      expect(resultLow.semanticConfidence).toBe(0);
    });

    it('should handle missing fields gracefully', () => {
      const response = JSON.stringify({});

      const result = validator.parseValidationResponse(response);

      expect(result.isSemanticValid).toBe(true); // Default
      expect(result.semanticConfidence).toBe(50); // Default for missing
      expect(result.documentType).toBe('unknown');
      expect(result.issues).toEqual([]);
    });

    it('should filter out invalid issue entries', () => {
      const response = JSON.stringify({
        isSemanticValid: true,
        semanticConfidence: 80,
        documentType: 'bank_statement',
        issues: [
          { severity: 'INFO', code: 'FOREIGN_CURRENCY', description: 'Valid issue' },
          { severity: 'INVALID', code: 'NONEXISTENT', description: 'Invalid issue' },
          'not an object',
          null,
          { severity: 'WARNING', code: 'SUSPICIOUS_AMOUNTS', description: 'Another valid' },
        ],
        summary: 'Mixed issues.',
      });

      const result = validator.parseValidationResponse(response);

      // Only the two valid issues should pass
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].code).toBe('FOREIGN_CURRENCY');
      expect(result.issues[1].code).toBe('SUSPICIOUS_AMOUNTS');
    });

    it('should handle unknown document type', () => {
      const response = JSON.stringify({
        isSemanticValid: true,
        semanticConfidence: 60,
        documentType: 'crypto_statement',
        issues: [],
        summary: 'Unknown type.',
      });

      const result = validator.parseValidationResponse(response);
      expect(result.documentType).toBe('unknown');
    });
  });

  describe('buildValidationPrompt()', () => {
    it('should build a prompt with all summary fields', () => {
      const summary: SanitizedStatementSummary = {
        bankName: 'FNB',
        accountType: 'Cheque',
        maskedAccountNumber: '******4808',
        openingBalanceRands: 'R 0.00',
        closingBalanceRands: 'R 100.00',
        transactionCount: 1,
        periodStart: '2024-01-01T00:00:00.000Z',
        periodEnd: '2024-01-31T00:00:00.000Z',
        sampleTransactions: [
          {
            index: 0,
            date: '2024-01-15',
            description: 'EFT DEPOSIT',
            amountRands: 'R 100.00',
            type: 'credit',
          },
        ],
        totalCreditsRands: 'R 100.00',
        totalDebitsRands: 'R 0.00',
      };

      const prompt = validator.buildValidationPrompt(summary);

      expect(prompt).toContain('******4808');
      expect(prompt).toContain('FNB');
      expect(prompt).toContain('R 0.00');
      expect(prompt).toContain('R 100.00');
      expect(prompt).toContain('EFT DEPOSIT');
      expect(prompt).toContain('CREDIT');
      expect(prompt).toContain('Respond with JSON only');
    });
  });

  describe('getAgentDefinition()', () => {
    it('should return an agent definition with semantic prompt', () => {
      const def = validator.getAgentDefinition(TENANT_ID);

      expect(def).toBeDefined();
      expect(def.prompt).toContain('semantic validator');
      expect(def.description).toContain('extracted');
      expect(Array.isArray(def.tools)).toBe(true);
      expect(def.model).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Integration tests: ExtractionValidatorAgent with SdkSemanticValidator
// ─────────────────────────────────────────────────────────────────────

describe('ExtractionValidatorAgent + SdkSemanticValidator integration', () => {
  const TENANT_ID = 'test-tenant-integration';

  describe('with SdkSemanticValidator injected', () => {
    let agent: ExtractionValidatorAgent;
    let sdkValidator: SdkSemanticValidator;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [
          ExtractionValidatorAgent,
          BalanceReconciler,
          AmountSanityChecker,
          ExtractionDecisionLogger,
          SdkSemanticValidator,
          SdkAgentFactory,
          SdkConfigService,
        ],
      }).compile();

      agent = module.get<ExtractionValidatorAgent>(ExtractionValidatorAgent);
      sdkValidator = module.get<SdkSemanticValidator>(SdkSemanticValidator);
    });

    it('should add +5 confidence when semantic validation passes', async () => {
      // Mock the SDK validator to return a passing result
      jest.spyOn(sdkValidator, 'validate').mockResolvedValue({
        isSemanticValid: true,
        semanticConfidence: 85,
        documentType: 'bank_statement',
        issues: [],
        summary: 'Valid statement.',
      });

      // Create a perfect statement (100 base points)
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Base confidence = 100 (40+20+15+15+10), semantic +5 = 105, clamped to 100
      expect(result.confidence).toBeLessThanOrEqual(100);
      expect(result.confidence).toBeGreaterThanOrEqual(95); // At least 95+5 clamped
      expect(result.semanticValidation).toBeDefined();
      expect(result.semanticValidation?.isSemanticValid).toBe(true);
    });

    it('should subtract -10 confidence when semantic validation fails', async () => {
      // Mock the SDK validator to return a failing result
      jest.spyOn(sdkValidator, 'validate').mockResolvedValue({
        isSemanticValid: false,
        semanticConfidence: 30,
        documentType: 'credit_card',
        issues: [
          {
            severity: 'ERROR',
            code: 'WRONG_DOCUMENT_TYPE',
            description: 'Not a bank statement',
          },
        ],
        summary: 'Wrong document type.',
      });

      // Create a perfect statement (100 base points)
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Base confidence = 100 (40+20+15+15+10), semantic -10 = 90
      expect(result.confidence).toBe(90);
      expect(result.flags).toContainEqual(
        expect.objectContaining({
          code: 'SEMANTIC_WRONG_DOCUMENT_TYPE',
        }),
      );
      expect(result.semanticValidation).toBeDefined();
      expect(result.semanticValidation?.isSemanticValid).toBe(false);
    });

    it('should not affect confidence if LLM throws an error', async () => {
      // Mock the SDK validator to throw
      jest.spyOn(sdkValidator, 'validate').mockRejectedValue(
        new Error('LLM service unavailable'),
      );

      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Base confidence = 100, no semantic adjustment
      expect(result.confidence).toBe(100);
      expect(result.semanticValidation).toBeUndefined();
    });

    it('should not adjust confidence when semantic valid but low confidence', async () => {
      // Semantic valid but confidence < 70 -> no bonus
      jest.spyOn(sdkValidator, 'validate').mockResolvedValue({
        isSemanticValid: true,
        semanticConfidence: 50,
        documentType: 'bank_statement',
        issues: [],
        summary: 'Low confidence pass.',
      });

      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Base = 100, no semantic adjustment (valid but conf < 70)
      expect(result.confidence).toBe(100);
    });

    it('should clamp confidence to 0 when penalty exceeds base', async () => {
      // Mock failing semantic validation
      jest.spyOn(sdkValidator, 'validate').mockResolvedValue({
        isSemanticValid: false,
        semanticConfidence: 10,
        documentType: 'unknown',
        issues: [
          {
            severity: 'ERROR',
            code: 'OCR_CORRUPTION',
            description: 'Severe corruption',
          },
        ],
        summary: 'Corrupted document.',
      });

      // Create a statement that only gets 0 base points
      // (all checks fail except maybe transaction count)
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 999999999, // Wrong - will fail balance reconciliation
        transactions: [
          {
            amountCents: 999999999999,
            isCredit: true,
            description: '12,345.67',
          },
        ],
        periodStart: new Date('2024-01-01'),
        periodEnd: new Date('2024-01-31'),
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Confidence should be >= 0 (clamped)
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('without SdkSemanticValidator (not injected)', () => {
    let agent: ExtractionValidatorAgent;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ExtractionValidatorAgent,
          BalanceReconciler,
          AmountSanityChecker,
          ExtractionDecisionLogger,
          // Note: SdkSemanticValidator NOT provided
        ],
      }).compile();

      agent = module.get<ExtractionValidatorAgent>(ExtractionValidatorAgent);
    });

    it('should work normally without semantic validator', async () => {
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBe(100);
      expect(result.semanticValidation).toBeUndefined();
    });
  });

  describe('validateAndCorrect() is NOT affected', () => {
    let agent: ExtractionValidatorAgent;
    let sdkValidator: SdkSemanticValidator;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [ConfigModule.forRoot({ isGlobal: true })],
        providers: [
          ExtractionValidatorAgent,
          BalanceReconciler,
          AmountSanityChecker,
          ExtractionDecisionLogger,
          SdkSemanticValidator,
          SdkAgentFactory,
          SdkConfigService,
        ],
      }).compile();

      agent = module.get<ExtractionValidatorAgent>(ExtractionValidatorAgent);
      sdkValidator = module.get<SdkSemanticValidator>(SdkSemanticValidator);
    });

    it('should call validate() internally (which includes semantic check) but not change correction logic', async () => {
      jest.spyOn(sdkValidator, 'validate').mockResolvedValue({
        isSemanticValid: true,
        semanticConfidence: 90,
        documentType: 'bank_statement',
        issues: [],
        summary: 'Valid.',
      });

      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const validated = await agent.validateAndCorrect(
        statement,
        TENANT_ID,
        false,
      );

      expect(validated.validation).toBeDefined();
      expect(validated.validation.isValid).toBe(true);
      // validateAndCorrect delegates to validate(), so semantic check runs
      expect(validated.validation.semanticValidation).toBeDefined();
    });
  });

  describe('thresholds are unchanged', () => {
    let agent: ExtractionValidatorAgent;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          ExtractionValidatorAgent,
          BalanceReconciler,
          AmountSanityChecker,
          ExtractionDecisionLogger,
        ],
      }).compile();

      agent = module.get<ExtractionValidatorAgent>(ExtractionValidatorAgent);
    });

    it('should still require confidence >= 90 and reconciliation for auto-accept', async () => {
      // 85 points (all pass except balance = 0 points)
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 99999, // Wrong
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      // Balance reconciliation fails, so isValid = false even if confidence were 90+
      expect(result.isValid).toBe(false);
      expect(result.balanceReconciled).toBe(false);
    });

    it('should auto-accept when confidence >= 90 and balance reconciled', async () => {
      const statement = createStatement({
        openingBalance: 0,
        closingBalance: 10000,
        transactions: [{ amountCents: 10000, isCredit: true }],
      });

      const result = await agent.validate(statement, TENANT_ID);

      expect(result.isValid).toBe(true);
      expect(result.confidence).toBeGreaterThanOrEqual(90);
      expect(result.balanceReconciled).toBe(true);
    });
  });
});

/**
 * Categorizer Prompt Tests
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * Tests for CATEGORIZER_SYSTEM_PROMPT content and buildTenantPromptContext().
 */
import {
  CATEGORIZER_SYSTEM_PROMPT,
  buildTenantPromptContext,
} from '../../../src/agents/transaction-categorizer/categorizer-prompt';

describe('CATEGORIZER_SYSTEM_PROMPT', () => {
  it('should contain Section 12(h) VAT exemption reference', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Section 12(h)');
  });

  it('should contain all account code ranges', () => {
    // Assets
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('1000');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Bank Account');

    // Liabilities
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('2000');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Accounts Payable');

    // Equity
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('3000');

    // Revenue
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('4000');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Tuition Fees');

    // Cost of Sales
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('5000');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Salaries');

    // Operating Expenses
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('6000');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('6600');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Bank Charges');

    // Suspense
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('9999');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Suspense');
  });

  it('should contain JSON output format instructions', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('"accountCode"');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('"accountName"');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('"vatType"');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('"confidence"');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('"reasoning"');
  });

  it('should contain VAT type values', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('STANDARD');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('ZERO_RATED');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('EXEMPT');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('NO_VAT');
  });

  it('should instruct LLM to use MCP tools first', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('get_patterns');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('get_history');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('FIRST');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('SECOND');
  });

  it('should mention SA-specific domain knowledge', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('South African');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('creche');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('15%');
  });

  it('should contain confidence scoring guidelines', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('95-100');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('85-94');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('75-84');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('60-74');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('Below 60');
  });

  it('should contain important rules about cents', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('CENTS');
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('integers');
  });

  it('should warn about never returning 9999', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain(
      'NEVER return account code 9999',
    );
  });

  it('should mention bank charges rule', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain(
      'Bank charges are ALWAYS account 6600',
    );
  });

  it('should mention salary rule', () => {
    expect(CATEGORIZER_SYSTEM_PROMPT).toContain('5000, not 6000');
  });
});

describe('buildTenantPromptContext()', () => {
  it('should add auto-apply threshold', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 85,
    });

    expect(context).toContain('Auto-apply threshold: 85%');
  });

  it('should add business type when provided', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 80,
      businessType: 'Creche / ECD Centre',
    });

    expect(context).toContain('Business type: Creche / ECD Centre');
  });

  it('should not add business type when not provided', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 80,
    });

    expect(context).not.toContain('Business type');
  });

  it('should add custom account codes when provided', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 80,
      customAccountCodes: [
        {
          code: '4050',
          name: 'Aftercare Fees',
          description: 'Income from aftercare program',
        },
        {
          code: '5050',
          name: 'Art Supplies',
          description: 'Crafts and art materials',
        },
      ],
    });

    expect(context).toContain('Custom Account Codes');
    expect(context).toContain('4050');
    expect(context).toContain('Aftercare Fees');
    expect(context).toContain('5050');
    expect(context).toContain('Art Supplies');
  });

  it('should not add custom codes section when empty', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 80,
      customAccountCodes: [],
    });

    expect(context).not.toContain('Custom Account Codes');
  });

  it('should contain tenant-specific context header', () => {
    const context = buildTenantPromptContext({
      autoApplyThreshold: 80,
    });

    expect(context).toContain('TENANT-SPECIFIC CONTEXT');
  });
});

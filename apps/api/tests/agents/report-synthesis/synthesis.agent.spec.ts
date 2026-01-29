/**
 * Report Synthesis Agent Tests
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * Tests the ReportSynthesisAgent with:
 * - SDK success path (mocked Claude)
 * - Fallback path (SDK unavailable)
 * - Error handling (SDK throws)
 *
 * CRITICAL: Uses mocked Claude client but real assertions
 */
import 'dotenv/config';

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { ReportSynthesisAgent } from '../../../src/agents/report-synthesis/synthesis.agent';
import { SynthesisDecisionLogger } from '../../../src/agents/report-synthesis/decision-logger';
import { SdkAgentFactory } from '../../../src/agents/sdk/sdk-agent.factory';
import { SdkConfigService } from '../../../src/agents/sdk/sdk-config';
import {
  ClaudeClientService,
  ClaudeResponse,
} from '../../../src/agents/sdk/claude-client.service';
import {
  ReportType,
  IncomeStatementData,
  BalanceSheetData,
  AgedReceivablesData,
  AIInsights,
} from '../../../src/agents/report-synthesis/interfaces/synthesis.interface';

describe('ReportSynthesisAgent', () => {
  let agent: ReportSynthesisAgent;
  let claudeClient: jest.Mocked<ClaudeClientService>;
  let configService: SdkConfigService;
  let decisionLogger: jest.Mocked<SynthesisDecisionLogger>;

  // Mock income statement data
  const mockIncomeStatement: IncomeStatementData = {
    periodStart: new Date('2025-01-01'),
    periodEnd: new Date('2025-01-31'),
    income: {
      tuitionFeesCents: 5000000, // R50,000
      subsidiesCents: 1000000, // R10,000
      otherIncomeCents: 500000, // R5,000
      totalCents: 6500000, // R65,000
    },
    expenses: {
      salariesCents: 4000000, // R40,000
      rentCents: 500000, // R5,000
      utilitiesCents: 200000, // R2,000
      foodCents: 300000, // R3,000
      suppliesCents: 100000, // R1,000
      otherExpensesCents: 200000, // R2,000
      totalCents: 5300000, // R53,000
    },
    netProfitCents: 1200000, // R12,000
    profitMarginPercent: 18.46,
  };

  // Mock balance sheet data
  const mockBalanceSheet: BalanceSheetData = {
    asOfDate: new Date('2025-01-31'),
    assets: {
      cashCents: 2000000, // R20,000
      accountsReceivableCents: 1500000, // R15,000
      prepaidExpensesCents: 100000, // R1,000
      fixedAssetsCents: 500000, // R5,000
      totalCents: 4100000, // R41,000
    },
    liabilities: {
      accountsPayableCents: 500000, // R5,000
      deferredRevenueCents: 1000000, // R10,000
      loansPayableCents: 0,
      totalCents: 1500000, // R15,000
    },
    equity: {
      retainedEarningsCents: 2600000, // R26,000
      capitalCents: 0,
      totalCents: 2600000, // R26,000
    },
  };

  // Mock aged receivables data
  const mockAgedReceivables: AgedReceivablesData = {
    asOfDate: new Date('2025-01-31'),
    currentCents: 500000, // R5,000
    days30Cents: 300000, // R3,000
    days60Cents: 200000, // R2,000
    days90Cents: 100000, // R1,000
    days120PlusCents: 50000, // R500
    totalCents: 1150000, // R11,500
    topDebtors: [
      { name: 'Parent A', amountCents: 300000, daysOutstanding: 45 },
      { name: 'Parent B', amountCents: 200000, daysOutstanding: 75 },
    ],
  };

  // Valid Claude response
  const validClaudeResponse: AIInsights = {
    executiveSummary:
      'The creche is performing well with a healthy profit margin of 18.46%. Revenue is strong with tuition fees making up the bulk of income.',
    keyFindings: [
      {
        category: 'profitability',
        finding: 'Strong profit margin of 18.46%',
        impact: 'positive',
        severity: 'low',
      },
      {
        category: 'expense',
        finding: 'Staff costs at 75% of expenses are above typical range',
        impact: 'negative',
        severity: 'medium',
      },
    ],
    trends: [
      {
        metric: 'Revenue',
        direction: 'stable',
        percentageChange: 0,
        timeframe: 'month-over-month',
        interpretation: 'Consistent revenue generation',
      },
    ],
    anomalies: [],
    recommendations: [
      {
        priority: 'medium',
        category: 'efficiency',
        action: 'Review staffing levels for optimization',
        expectedImpact: 'Reduce costs by 5-10%',
        timeline: 'next quarter',
      },
    ],
    confidenceScore: 85,
    generatedAt: new Date(),
    source: 'SDK',
  };

  beforeEach(async () => {
    // Create mocks
    const mockClaudeClient = {
      isAvailable: jest.fn().mockReturnValue(true),
      sendMessage: jest.fn().mockResolvedValue({
        content: JSON.stringify(validClaudeResponse),
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 500, outputTokens: 300 },
        stopReason: 'end_turn',
      } as ClaudeResponse),
    };

    const mockDecisionLogger = {
      logSynthesis: jest.fn().mockResolvedValue(undefined),
      logError: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        ReportSynthesisAgent,
        SdkAgentFactory,
        SdkConfigService,
        {
          provide: ClaudeClientService,
          useValue: mockClaudeClient,
        },
        {
          provide: SynthesisDecisionLogger,
          useValue: mockDecisionLogger,
        },
      ],
    }).compile();

    agent = module.get<ReportSynthesisAgent>(ReportSynthesisAgent);
    claudeClient = module.get(ClaudeClientService);
    configService = module.get<SdkConfigService>(SdkConfigService);
    decisionLogger = module.get(SynthesisDecisionLogger);
  });

  describe('getAgentDefinition', () => {
    it('should return a valid agent definition', () => {
      const definition = agent.getAgentDefinition('tenant-123');

      expect(definition.description).toContain('financial reports');
      expect(definition.prompt).toContain('South African');
      expect(definition.tools).toEqual([]);
      expect(definition.model).toBeDefined();
    });
  });

  describe('synthesizeReport - SDK success path', () => {
    it('should generate AI insights when SDK is available', async () => {
      // Mock SDK availability
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('SDK');
      expect(result.data.executiveSummary).toBeDefined();
      expect(result.data.executiveSummary.length).toBeGreaterThan(0);
      expect(result.data.keyFindings.length).toBeGreaterThan(0);
      expect(result.data.confidenceScore).toBeGreaterThan(0);
      expect(result.data.confidenceScore).toBeLessThanOrEqual(100);
      expect(result.data.generatedAt).toBeInstanceOf(Date);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify Claude was called
      expect(claudeClient.sendMessage).toHaveBeenCalledTimes(1);
      expect(claudeClient.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'sonnet',
          temperature: 0.3,
          maxTokens: 2048,
        }),
      );
    });

    it('should log the decision after synthesis', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);

      await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(decisionLogger.logSynthesis).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-123',
          reportType: ReportType.INCOME_STATEMENT,
          source: 'SDK',
          confidenceScore: expect.any(Number),
          findingsCount: expect.any(Number),
          recommendationsCount: expect.any(Number),
          anomaliesCount: expect.any(Number),
          durationMs: expect.any(Number),
        }),
      );
    });

    it('should include model information in SDK response', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.model).toBe('claude-sonnet-4-20250514');
    });
  });

  describe('synthesizeReport - fallback path', () => {
    it('should fallback when SDK is unavailable', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.confidenceScore).toBe(50); // Lower confidence for fallback
      expect(result.data.executiveSummary).toContain('R65000.00'); // Income in rands
      expect(result.data.executiveSummary).toContain('R53000.00'); // Expenses in rands
      expect(claudeClient.sendMessage).not.toHaveBeenCalled();
    });

    it('should generate findings for profitable income statement', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.data.keyFindings.length).toBeGreaterThan(0);
      const profitFinding = result.data.keyFindings.find(
        (f) => f.category === 'profitability',
      );
      expect(profitFinding).toBeDefined();
      expect(profitFinding?.impact).toBe('positive');
    });

    it('should generate warnings for high staff costs', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      const expenseFinding = result.data.keyFindings.find(
        (f) => f.category === 'expense' && f.severity === 'medium',
      );
      expect(expenseFinding).toBeDefined();
    });

    it('should handle loss-making income statement', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const lossMakingStatement: IncomeStatementData = {
        ...mockIncomeStatement,
        netProfitCents: -500000, // R5,000 loss
        profitMarginPercent: -7.69,
      };

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        lossMakingStatement,
        [],
        'tenant-123',
      );

      expect(result.data.executiveSummary).toContain('loss');
      const profitFinding = result.data.keyFindings.find(
        (f) => f.category === 'profitability',
      );
      expect(profitFinding?.impact).toBe('negative');
      expect(profitFinding?.severity).toBe('high');

      // Should have cost reduction recommendation
      const costRec = result.data.recommendations.find(
        (r) => r.category === 'cost_reduction',
      );
      expect(costRec).toBeDefined();
      expect(costRec?.priority).toBe('high');
    });
  });

  describe('synthesizeReport - error handling', () => {
    it('should fallback when Claude throws an error', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      claudeClient.sendMessage.mockRejectedValue(new Error('API rate limited'));

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.confidenceScore).toBe(50);
    });

    it('should fallback when Claude returns invalid JSON', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      claudeClient.sendMessage.mockResolvedValue({
        content: 'This is not valid JSON',
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: 'end_turn',
      });

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
    });

    it('should fallback when Claude returns incomplete response', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      claudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: 'Test',
          // Missing required fields
        }),
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 100, outputTokens: 50 },
        stopReason: 'end_turn',
      });

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
    });

    it('should handle Claude response with markdown code blocks', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      claudeClient.sendMessage.mockResolvedValue({
        content: '```json\n' + JSON.stringify(validClaudeResponse) + '\n```',
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 500, outputTokens: 300 },
        stopReason: 'end_turn',
      });

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('SDK');
      expect(result.data.executiveSummary).toBe(
        validClaudeResponse.executiveSummary,
      );
    });
  });

  describe('synthesizeReport - balance sheet', () => {
    it('should analyze balance sheet correctly', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.BALANCE_SHEET,
        mockBalanceSheet,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.executiveSummary).toContain('Balance sheet');
      expect(result.data.executiveSummary).toContain('R41000.00'); // Total assets
    });

    it('should detect liquidity issues', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const lowLiquiditySheet: BalanceSheetData = {
        ...mockBalanceSheet,
        assets: {
          ...mockBalanceSheet.assets,
          cashCents: 100000, // Only R1,000 cash
          accountsReceivableCents: 200000, // R2,000 receivables
        },
        liabilities: {
          ...mockBalanceSheet.liabilities,
          accountsPayableCents: 1000000, // R10,000 payables
          totalCents: 2000000, // R20,000 total liabilities
        },
      };

      const result = await agent.synthesizeReport(
        ReportType.BALANCE_SHEET,
        lowLiquiditySheet,
        [],
        'tenant-123',
      );

      const riskFinding = result.data.keyFindings.find(
        (f) => f.category === 'risk' && f.severity === 'high',
      );
      expect(riskFinding).toBeDefined();
      expect(riskFinding?.finding).toContain('Current ratio');
    });
  });

  describe('synthesizeReport - aged receivables', () => {
    it('should analyze aged receivables correctly', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.AGED_RECEIVABLES,
        mockAgedReceivables,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.executiveSummary).toContain('Aged receivables');
      expect(result.data.executiveSummary).toContain('R11500.00'); // Total
    });

    it('should flag seriously overdue accounts', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.AGED_RECEIVABLES,
        mockAgedReceivables,
        [],
        'tenant-123',
      );

      const criticalFinding = result.data.keyFindings.find(
        (f) => f.severity === 'critical',
      );
      expect(criticalFinding).toBeDefined();
      expect(criticalFinding?.finding).toContain('90+ days');
    });

    it('should recommend bad debt provision for old accounts', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.AGED_RECEIVABLES,
        mockAgedReceivables,
        [],
        'tenant-123',
      );

      const badDebtRec = result.data.recommendations.find((r) =>
        r.action.includes('bad debt'),
      );
      expect(badDebtRec).toBeDefined();
    });
  });

  describe('synthesizeReport - generic fallback', () => {
    it('should handle unsupported report types gracefully', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.CASH_FLOW,
        {
          periodStart: new Date(),
          periodEnd: new Date(),
          operatingActivities: {
            netIncomeCents: 0,
            depreciationCents: 0,
            receivablesChangeCents: 0,
            payablesChangeCents: 0,
            netCashCents: 0,
          },
          investingActivities: {
            assetPurchasesCents: 0,
            assetSalesCents: 0,
            netCashCents: 0,
          },
          financingActivities: {
            loanProceedsCents: 0,
            loanRepaymentsCents: 0,
            netCashCents: 0,
          },
          netCashChangeCents: 0,
          openingBalanceCents: 0,
          closingBalanceCents: 0,
        },
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.confidenceScore).toBe(30); // Very low for generic
      expect(result.data.executiveSummary).toContain('CASH FLOW');
    });
  });

  describe('isSdkAvailable', () => {
    it('should return true when SDK is enabled', () => {
      jest.spyOn(configService, 'isEnabled').mockReturnValue(true);

      const available = agent.isSdkAvailable();

      expect(available).toBe(true);
    });

    it('should return false when SDK is disabled', () => {
      jest.spyOn(configService, 'isEnabled').mockReturnValue(false);

      const available = agent.isSdkAvailable();

      expect(available).toBe(false);
    });
  });
});

describe('SynthesisDecisionLogger', () => {
  let logger: SynthesisDecisionLogger;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SynthesisDecisionLogger],
    }).compile();

    logger = module.get<SynthesisDecisionLogger>(SynthesisDecisionLogger);
  });

  it('should log synthesis without throwing', async () => {
    // This should not throw even if file operations fail
    await expect(
      logger.logSynthesis({
        tenantId: 'test-tenant',
        reportType: ReportType.INCOME_STATEMENT,
        source: 'SDK',
        model: 'claude-sonnet-4-20250514',
        confidenceScore: 85,
        findingsCount: 3,
        recommendationsCount: 2,
        anomaliesCount: 0,
        durationMs: 1500,
      }),
    ).resolves.not.toThrow();
  });

  it('should log errors without throwing', async () => {
    await expect(
      logger.logError({
        tenantId: 'test-tenant',
        reportType: ReportType.INCOME_STATEMENT,
        error: 'API rate limited',
        fellBackToRules: true,
      }),
    ).resolves.not.toThrow();
  });
});

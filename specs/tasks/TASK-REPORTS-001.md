<task_spec id="TASK-REPORTS-001" version="2.0">

<metadata>
  <title>AI Report Synthesis Agent</title>
  <status>ready</status>
  <phase>reports-enhancement</phase>
  <layer>foundation</layer>
  <sequence>801</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-REPORTS-AI-INSIGHTS</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SDK-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>12 hours</estimated_effort>
  <last_updated>2026-01-29</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The CrecheBooks reports page displays basic financial data but provides no intelligent
  analysis or insights. Users must manually interpret numbers without AI assistance.
  The existing SDK infrastructure (from TASK-SDK-001) provides the foundation for
  Claude integration, but no report-specific agent exists.

  **Gap Analysis:**
  - No AI agent for financial report analysis
  - No executive summary generation capability
  - No trend detection or anomaly alerting
  - No actionable recommendations based on data
  - PDFs are static data dumps without intelligence

  **Technology Stack:**
  - Runtime: NestJS (Node.js)
  - AI: Claude via Requesty (ANTHROPIC_BASE_URL=https://router.requesty.ai/v1)
  - SDK: Existing BaseSdkAgent pattern, ClaudeClientService
  - ORM: Prisma
  - Database: PostgreSQL
  - Package Manager: pnpm
  - Language: TypeScript (strict mode)
  - Testing: Jest

  **Files to Create:**
  - `apps/api/src/agents/report-synthesis/synthesis.agent.ts`
  - `apps/api/src/agents/report-synthesis/synthesis.module.ts`
  - `apps/api/src/agents/report-synthesis/interfaces/synthesis.interface.ts`
  - `apps/api/src/agents/report-synthesis/prompts/report-prompts.ts`
  - `apps/api/src/agents/report-synthesis/decision-logger.ts`
  - `apps/api/src/agents/report-synthesis/index.ts`
  - `apps/api/tests/agents/report-synthesis/synthesis.agent.spec.ts`

  **Files to Modify:**
  - `apps/api/src/agents/index.ts` — ADD ReportSynthesisModule export
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS — Follow These Exactly

  ### 1. Extend BaseSdkAgent
  The agent MUST extend the existing BaseSdkAgent and use executeWithFallback:
  ```typescript
  import { BaseSdkAgent, SdkAgentFactory, SdkConfigService } from '../sdk';
  import { ClaudeClientService } from '../sdk/claude-client.service';

  @Injectable()
  export class ReportSynthesisAgent extends BaseSdkAgent {
    constructor(
      factory: SdkAgentFactory,
      config: SdkConfigService,
      private readonly claudeClient: ClaudeClientService,
      private readonly prisma: PrismaService,
      @Optional() private readonly decisionLogger?: DecisionLogger,
    ) {
      super(factory, config, 'ReportSynthesisAgent');
    }

    getAgentDefinition(tenantId: string): AgentDefinition {
      return {
        description: 'Analyzes financial reports and generates AI insights',
        prompt: this.buildSystemPrompt(tenantId),
        tools: [], // Pure analysis, no tool calls needed
        model: this.config.getModelForAgent('report-synthesis'),
      };
    }

    async synthesizeReport(
      reportType: ReportType,
      reportData: IncomeStatement | BalanceSheet | any,
      historicalData: any[],
      tenantId: string,
    ): Promise<SdkExecutionResult<AIInsights>> {
      const start = Date.now();

      const result = await this.executeWithFallback(
        async () => this.sdkSynthesize(reportType, reportData, historicalData, tenantId),
        async () => this.fallbackSynthesize(reportData),
      );

      await this.logDecision(tenantId, reportType, result, Date.now() - start);
      return result;
    }
  }
  ```

  ### 2. AI Insights Interface
  ```typescript
  export interface AIInsights {
    executiveSummary: string;
    keyFindings: KeyFinding[];
    trends: TrendAnalysis[];
    anomalies: AnomalyDetection[];
    recommendations: Recommendation[];
    confidenceScore: number;
    generatedAt: Date;
    model?: string;
    source: 'SDK' | 'FALLBACK';
  }

  export interface KeyFinding {
    category: 'revenue' | 'expense' | 'profitability' | 'cash_flow' | 'risk';
    finding: string;
    impact: 'positive' | 'negative' | 'neutral';
    severity: 'low' | 'medium' | 'high' | 'critical';
  }

  export interface TrendAnalysis {
    metric: string;
    direction: 'increasing' | 'decreasing' | 'stable' | 'volatile';
    percentageChange: number;
    timeframe: string;
    interpretation: string;
  }

  export interface AnomalyDetection {
    type: 'spike' | 'drop' | 'pattern_break' | 'outlier';
    description: string;
    severity: 'low' | 'medium' | 'high';
    affectedMetric: string;
    expectedValue: number;
    actualValue: number;
    possibleCauses: string[];
  }

  export interface Recommendation {
    priority: 'high' | 'medium' | 'low';
    category: 'cost_reduction' | 'revenue_growth' | 'risk_mitigation' | 'compliance' | 'efficiency';
    action: string;
    expectedImpact: string;
    timeline: string;
  }
  ```

  ### 3. System Prompt for SA Financial Analysis
  ```typescript
  private buildSystemPrompt(tenantId: string): string {
    return `You are a South African financial analyst specializing in creche and pre-school bookkeeping.

Your role is to analyze financial reports and provide actionable insights for creche owners and managers.

CRITICAL RULES:
- All amounts are in ZAR (South African Rand)
- Amounts are stored as cents integers, display as rands (divide by 100)
- Tax year runs March to February
- Focus on SARS compliance (South African Revenue Service)
- Use South African accounting terminology
- Be concise but thorough
- Prioritize cash flow and sustainability
- Flag SARS compliance risks

ANALYSIS FRAMEWORK:
1. Executive Summary: 2-3 paragraphs highlighting key findings
2. Key Findings: Categorized observations with impact assessment
3. Trends: Month-over-month and year-over-year changes with interpretation
4. Anomalies: Unusual patterns that need attention with possible causes
5. Recommendations: Prioritized action items with expected impact and timeline

OUTPUT FORMAT:
Respond with valid JSON matching the AIInsights interface. Do not include markdown code blocks.`;
  }
  ```

  ### 4. Fallback Pattern for Graceful Degradation
  ```typescript
  private async fallbackSynthesize(reportData: any): Promise<AIInsights> {
    // Rule-based analysis when Claude is unavailable
    const totalIncome = reportData.income?.totalCents ?? 0;
    const totalExpenses = reportData.expenses?.totalCents ?? 0;
    const netProfit = totalIncome - totalExpenses;
    const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

    return {
      executiveSummary: this.generateBasicSummary(totalIncome, totalExpenses, netProfit),
      keyFindings: this.detectBasicFindings(reportData),
      trends: [], // No historical analysis in fallback
      anomalies: this.detectBasicAnomalies(reportData),
      recommendations: this.generateBasicRecommendations(profitMargin),
      confidenceScore: 50, // Lower confidence for rule-based
      generatedAt: new Date(),
      source: 'FALLBACK',
    };
  }

  private generateBasicSummary(income: number, expenses: number, profit: number): string {
    const incomeRands = (income / 100).toFixed(2);
    const expensesRands = (expenses / 100).toFixed(2);
    const profitRands = (profit / 100).toFixed(2);
    const status = profit >= 0 ? 'profitable' : 'operating at a loss';

    return `For the reporting period, the creche generated R${incomeRands} in income against R${expensesRands} in expenses, resulting in a ${status} position of R${Math.abs(parseFloat(profitRands)).toFixed(2)}.`;
  }
  ```

  ### 5. Decision Logging (Audit Trail)
  ```typescript
  private async logDecision(
    tenantId: string,
    reportType: ReportType,
    result: SdkExecutionResult<AIInsights>,
    durationMs: number,
  ): Promise<void> {
    if (!this.decisionLogger) return;

    try {
      await this.decisionLogger.log({
        timestamp: new Date().toISOString(),
        agentType: 'report-synthesis',
        tenantId,
        reportType,
        source: result.source,
        model: result.model,
        confidenceScore: result.data.confidenceScore,
        findingsCount: result.data.keyFindings.length,
        recommendationsCount: result.data.recommendations.length,
        anomaliesCount: result.data.anomalies.length,
        durationMs,
      });
    } catch (error) {
      // Non-blocking - log but don't fail
      this.logger.warn(`Failed to log decision: ${error}`);
    }
  }
  ```

  ### 6. NestJS Module Configuration
  ```typescript
  import { Module, forwardRef } from '@nestjs/common';
  import { SdkAgentModule } from '../sdk';
  import { PrismaModule } from '../../database/prisma/prisma.module';
  import { ReportSynthesisAgent } from './synthesis.agent';
  import { DecisionLogger } from './decision-logger';

  @Module({
    imports: [
      forwardRef(() => SdkAgentModule),
      PrismaModule,
    ],
    providers: [
      ReportSynthesisAgent,
      DecisionLogger,
    ],
    exports: [ReportSynthesisAgent],
  })
  export class ReportSynthesisModule {}
  ```

  ### 7. Testing Pattern (Mock Claude)
  ```typescript
  describe('ReportSynthesisAgent', () => {
    let agent: ReportSynthesisAgent;
    let claudeClient: jest.Mocked<ClaudeClientService>;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          ReportSynthesisAgent,
          {
            provide: ClaudeClientService,
            useValue: { sendMessage: jest.fn() },
          },
          // ... other mocks
        ],
      }).compile();

      agent = module.get(ReportSynthesisAgent);
      claudeClient = module.get(ClaudeClientService);
    });

    it('should generate AI insights when SDK available', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(true);
      claudeClient.sendMessage.mockResolvedValue({
        content: JSON.stringify({
          executiveSummary: 'Test summary',
          keyFindings: [],
          trends: [],
          anomalies: [],
          recommendations: [],
          confidenceScore: 85,
        }),
        model: 'claude-sonnet-4-20250514',
        usage: { inputTokens: 100, outputTokens: 200 },
      });

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('SDK');
      expect(result.data.executiveSummary).toContain('Test summary');
    });

    it('should fallback when SDK unavailable', async () => {
      jest.spyOn(agent, 'isSdkAvailable').mockReturnValue(false);

      const result = await agent.synthesizeReport(
        ReportType.INCOME_STATEMENT,
        mockIncomeStatement,
        [],
        'tenant-123',
      );

      expect(result.source).toBe('FALLBACK');
      expect(result.data.confidenceScore).toBe(50);
    });
  });
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<context>
  ## Business Context

  CrecheBooks serves South African creche (daycare) businesses. Financial reports help
  owners understand their business health, but raw numbers require interpretation.

  AI-powered insights transform static reports into actionable intelligence:
  - Executive summaries save time for busy creche owners
  - Trend detection identifies seasonal patterns (school holidays, year-end)
  - Anomaly alerts catch unusual expenses or revenue drops early
  - Recommendations provide expert-level financial guidance

  ## SA Compliance Notes
  - All monetary values stored as integers (cents)
  - VAT: STANDARD (15%), ZERO_RATED, EXEMPT (education under Section 12(h))
  - Tax year: March 1 to February 28/29
  - SARS compliance reminders should be included in recommendations

  ## Model Selection
  - Use 'sonnet' model for report synthesis (complex reasoning needed)
  - Temperature: 0.3 (some creativity for narratives, but consistent structure)
  - Max tokens: 2048 (comprehensive analysis)
</context>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create ReportSynthesisAgent extending BaseSdkAgent
    - Implement synthesizeReport() with executeWithFallback pattern
    - Create AIInsights interface and related types
    - Build system prompt for SA financial analysis
    - Implement rule-based fallback for graceful degradation
    - Create DecisionLogger for audit trail
    - Create ReportSynthesisModule as NestJS module
    - Unit tests with mocked Claude client
    - Support all 6 report types (Income Statement, Balance Sheet, Cash Flow, VAT, Aged Receivables, Aged Payables)
    - Barrel export index.ts
  </in_scope>

  <out_of_scope>
    - API endpoints (TASK-REPORTS-002)
    - PDF generation with AI (TASK-REPORTS-003)
    - Frontend components (TASK-REPORTS-004)
    - Missing report services (TASK-REPORTS-005)
    - Real-time streaming of insights
    - Multi-language support
    - Custom prompts per tenant
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify module structure exists
ls -la apps/api/src/agents/report-synthesis/
ls -la apps/api/src/agents/report-synthesis/interfaces/
ls -la apps/api/src/agents/report-synthesis/prompts/

# 2. Verify build succeeds
cd apps/api && pnpm run build

# 3. Run report synthesis tests
pnpm test -- --testPathPattern="report-synthesis" --runInBand

# 4. Run ALL existing tests to confirm no regressions
pnpm test -- --runInBand

# 5. Lint check
pnpm run lint

# 6. TypeScript strict check (no `any` usage)
grep -rn ": any" apps/api/src/agents/report-synthesis/ && echo "FAIL: found 'any' type" || echo "PASS: no 'any' types"

# 7. Verify interfaces exported
grep "AIInsights" apps/api/src/agents/report-synthesis/index.ts

# 8. Verify agent extends BaseSdkAgent
grep "extends BaseSdkAgent" apps/api/src/agents/report-synthesis/synthesis.agent.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `ReportSynthesisAgent` created extending `BaseSdkAgent`
  - [ ] `synthesizeReport()` method uses `executeWithFallback` pattern
  - [ ] `AIInsights` interface defined with all required fields
  - [ ] `KeyFinding`, `TrendAnalysis`, `AnomalyDetection`, `Recommendation` interfaces defined
  - [ ] System prompt includes SA-specific financial context
  - [ ] Fallback synthesis generates basic insights without Claude
  - [ ] `DecisionLogger` logs all synthesis decisions to JSONL
  - [ ] `ReportSynthesisModule` created with proper imports/exports
  - [ ] Barrel export `index.ts` exports all public types and classes
  - [ ] Unit tests for SDK success path (mocked Claude)
  - [ ] Unit tests for fallback path (SDK unavailable)
  - [ ] Unit tests for error handling (SDK throws)
  - [ ] Test coverage >= 85% for synthesis agent
  - [ ] Zero `any` types in code
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
  - [ ] All existing tests still pass
</definition_of_done>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<anti_patterns>
  ## NEVER Do These

  - **NEVER use `any` type** — use proper TypeScript types or `unknown`
  - **NEVER hardcode API keys** — always use environment variables
  - **NEVER make SDK the only path** — always provide fallback
  - **NEVER use `npm`** — all commands must use `pnpm`
  - **NEVER make real API calls in tests** — always mock ClaudeClientService
  - **NEVER use floating-point for monetary values** — always use integer cents
  - **NEVER skip decision logging** — all results must be audited
  - **NEVER use temperature > 0.5** — keep outputs consistent for financial data
  - **NEVER return unvalidated JSON from Claude** — parse and validate structure
  - **NEVER block on logging failures** — catch and continue
</anti_patterns>

</task_spec>

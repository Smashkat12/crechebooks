<task_spec id="TASK-REPORTS-002" version="2.0">

<metadata>
  <title>Reports API Module</title>
  <status>ready</status>
  <phase>reports-enhancement</phase>
  <layer>logic</layer>
  <sequence>802</sequence>
  <priority>P0-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-REPORTS-API</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-REPORTS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-29</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The reports page has no dedicated API endpoints for fetching report data for dashboard
  display. Current implementation only has export endpoints that return file downloads,
  not JSON for UI rendering. No endpoint exists for generating AI insights.

  **Gap Analysis:**
  - No `/reports/:type/data` endpoint for dashboard JSON
  - No `/reports/:type/insights` endpoint for AI analysis
  - Export endpoints exist but need AI insights integration
  - No chart-ready data transformation
  - No historical data comparison

  **Files to Create:**
  - `apps/api/src/modules/reports/reports.controller.ts`
  - `apps/api/src/modules/reports/reports.service.ts`
  - `apps/api/src/modules/reports/reports.module.ts`
  - `apps/api/src/modules/reports/dto/report-data.dto.ts`
  - `apps/api/src/modules/reports/dto/ai-insights.dto.ts`
  - `apps/api/src/modules/reports/dto/export-report.dto.ts`
  - `apps/api/tests/modules/reports/reports.controller.spec.ts`
  - `apps/api/tests/modules/reports/reports.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/app.module.ts` — IMPORT ReportsModule
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Controller Endpoints
  ```typescript
  @Controller('reports')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiTags('Reports')
  export class ReportsController {
    constructor(private readonly reportsService: ReportsService) {}

    @Get(':type/data')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Get report data for dashboard display' })
    async getReportData(
      @Param('type') type: ReportType,
      @Query() query: ReportQueryDto,
      @TenantId() tenantId: string,
    ): Promise<ReportDataResponse> {
      return this.reportsService.getReportData(type, query.start, query.end, tenantId);
    }

    @Post(':type/insights')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Generate AI insights for report' })
    async generateInsights(
      @Param('type') type: ReportType,
      @Body() body: InsightsRequestDto,
      @TenantId() tenantId: string,
    ): Promise<AIInsightsResponse> {
      return this.reportsService.generateInsights(type, body.reportData, tenantId);
    }

    @Get(':type/export')
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
    @UseGuards(RolesGuard)
    @ApiOperation({ summary: 'Export report as PDF or Excel' })
    async exportReport(
      @Param('type') type: ReportType,
      @Query() query: ExportQueryDto,
      @TenantId() tenantId: string,
      @Res() res: Response,
    ): Promise<void> {
      const buffer = await this.reportsService.exportReport(
        type,
        query.start,
        query.end,
        query.format,
        query.includeInsights,
        tenantId,
      );
      // Stream response...
    }
  }
  ```

  ### 2. Report Data Response Structure
  ```typescript
  export class ReportDataResponseDto {
    @ApiProperty()
    type: ReportType;

    @ApiProperty()
    tenantId: string;

    @ApiProperty()
    period: { start: string; end: string };

    @ApiProperty()
    generatedAt: string;

    @ApiProperty()
    summary: ReportSummaryDto;

    @ApiProperty({ type: [ReportSectionDto] })
    sections: ReportSectionDto[];

    @ApiProperty()
    chartData: ChartDataDto;

    @ApiProperty({ type: [HistoricalDataPointDto] })
    historical: HistoricalDataPointDto[];
  }

  export class ChartDataDto {
    @ApiProperty({ type: [MonthlyTrendPointDto] })
    monthlyTrend: MonthlyTrendPointDto[];

    @ApiProperty({ type: [CategoryBreakdownDto] })
    expenseBreakdown: CategoryBreakdownDto[];

    @ApiProperty({ type: [ComparisonPointDto] })
    monthlyComparison: ComparisonPointDto[];

    @ApiProperty({ type: [ProfitMarginPointDto] })
    profitMargin: ProfitMarginPointDto[];
  }
  ```

  ### 3. Service Implementation
  ```typescript
  @Injectable()
  export class ReportsService {
    constructor(
      private readonly financialReportService: FinancialReportService,
      private readonly reportSynthesisAgent: ReportSynthesisAgent,
      private readonly prisma: PrismaService,
      @Inject(CACHE_MANAGER) private cacheManager: Cache,
    ) {}

    async getReportData(
      type: ReportType,
      start: Date,
      end: Date,
      tenantId: string,
    ): Promise<ReportDataResponse> {
      // Check cache first
      const cacheKey = `report:${tenantId}:${type}:${start}:${end}`;
      const cached = await this.cacheManager.get<ReportDataResponse>(cacheKey);
      if (cached) return cached;

      // Generate report data
      const rawData = await this.fetchRawData(type, start, end, tenantId);
      const chartData = this.prepareChartData(rawData, type);
      const historical = await this.fetchHistoricalData(type, start, tenantId);

      const response: ReportDataResponse = {
        type,
        tenantId,
        period: { start: start.toISOString(), end: end.toISOString() },
        generatedAt: new Date().toISOString(),
        summary: this.calculateSummary(rawData),
        sections: rawData.sections || [],
        chartData,
        historical,
      };

      // Cache for 5 minutes
      await this.cacheManager.set(cacheKey, response, 5 * 60 * 1000);
      return response;
    }

    async generateInsights(
      type: ReportType,
      reportData: any,
      tenantId: string,
    ): Promise<AIInsightsResponse> {
      // Check cache first (10 minute TTL for expensive AI calls)
      const cacheKey = `insights:${tenantId}:${type}:${reportData.period?.start}`;
      const cached = await this.cacheManager.get<AIInsightsResponse>(cacheKey);
      if (cached) return cached;

      const historical = await this.fetchHistoricalData(type, new Date(reportData.period.start), tenantId);
      const result = await this.reportSynthesisAgent.synthesizeReport(
        type,
        reportData,
        historical,
        tenantId,
      );

      const response: AIInsightsResponse = {
        success: true,
        data: result.data,
        source: result.source,
        model: result.model,
      };

      await this.cacheManager.set(cacheKey, response, 10 * 60 * 1000);
      return response;
    }
  }
  ```

  ### 4. Chart Data Preparation
  ```typescript
  private prepareChartData(rawData: any, type: ReportType): ChartDataDto {
    return {
      monthlyTrend: this.buildMonthlyTrend(rawData),
      expenseBreakdown: this.buildExpenseBreakdown(rawData),
      monthlyComparison: this.buildComparison(rawData),
      profitMargin: this.buildProfitMargin(rawData),
    };
  }

  private buildMonthlyTrend(rawData: any): MonthlyTrendPointDto[] {
    // Transform data for line chart
    // X: month, Y: income/expenses
    return rawData.monthlyBreakdown?.map((m: any) => ({
      month: m.month,
      income: m.incomeCents,
      expenses: m.expensesCents,
    })) ?? [];
  }

  private buildExpenseBreakdown(rawData: any): CategoryBreakdownDto[] {
    // Transform for pie chart
    return rawData.expenses?.breakdown?.map((e: any) => ({
      category: e.accountName,
      amount: e.amountCents,
      percentage: (e.amountCents / rawData.expenses.totalCents) * 100,
    })) ?? [];
  }
  ```

  ### 5. Module Configuration
  ```typescript
  @Module({
    imports: [
      CacheModule.register({
        ttl: 5 * 60 * 1000, // 5 minutes default
      }),
      PrismaModule,
      ReportSynthesisModule,
      DatabaseModule, // For FinancialReportService
    ],
    controllers: [ReportsController],
    providers: [ReportsService],
    exports: [ReportsService],
  })
  export class ReportsModule {}
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Create ReportsController with 3 endpoints (data, insights, export)
    - Create ReportsService with data fetching, AI insights, export logic
    - Create ReportsModule with proper imports/exports
    - DTOs for all request/response types
    - Cache integration (5 min for data, 10 min for AI insights)
    - Chart data transformation for frontend
    - Historical data fetching (12 months)
    - Unit tests for controller and service
    - Swagger documentation
  </in_scope>

  <out_of_scope>
    - AI agent implementation (TASK-REPORTS-001)
    - PDF generation enhancement (TASK-REPORTS-003)
    - Frontend components (TASK-REPORTS-004)
    - Missing report types (TASK-REPORTS-005)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<verification_commands>
```bash
# 1. Verify module structure
ls -la apps/api/src/modules/reports/
ls -la apps/api/src/modules/reports/dto/

# 2. Build check
cd apps/api && pnpm run build

# 3. Run module tests
pnpm test -- --testPathPattern="modules/reports" --runInBand

# 4. Lint check
pnpm run lint

# 5. Verify endpoints documented
grep "@ApiOperation" apps/api/src/modules/reports/reports.controller.ts

# 6. Verify module imported in app.module
grep "ReportsModule" apps/api/src/app.module.ts
```
</verification_commands>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `ReportsController` with `GET /reports/:type/data` endpoint
  - [ ] `ReportsController` with `POST /reports/:type/insights` endpoint
  - [ ] `ReportsController` with `GET /reports/:type/export` endpoint
  - [ ] `ReportsService` with `getReportData()` method
  - [ ] `ReportsService` with `generateInsights()` method
  - [ ] `ReportsService` with `exportReport()` method
  - [ ] Cache integration for data (5 min) and insights (10 min)
  - [ ] Chart data transformation for frontend
  - [ ] Historical data fetching (12 months comparison)
  - [ ] All DTOs with Swagger decorators
  - [ ] `ReportsModule` created and imported in `app.module.ts`
  - [ ] Unit tests for controller (mock service)
  - [ ] Unit tests for service (mock dependencies)
  - [ ] Test coverage >= 80%
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER expose raw database entities** — use DTOs
  - **NEVER skip tenant isolation** — always include tenantId in queries
  - **NEVER call AI without caching** — expensive operation
  - **NEVER use `any` for API responses** — fully typed DTOs
  - **NEVER skip Swagger documentation** — all endpoints documented
</anti_patterns>

</task_spec>

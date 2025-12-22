<task_spec id="TASK-RECON-032" version="3.0">

<metadata>
  <title>Financial Reports Endpoint</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>57</sequence>
  <implements>
    <requirement_ref>REQ-RECON-005</requirement_ref>
    <requirement_ref>REQ-RECON-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-013</task_ref>
    <task_ref status="complete">TASK-RECON-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Add GET /reports/income-statement endpoint to ReconciliationModule (created in TASK-RECON-031).
Uses FinancialReportService.generateIncomeStatement() from src/database/services/financial-report.service.ts.
Generates Income Statement (Profit & Loss) for a specified period, showing revenue breakdown,
expense categories, and net profit. The same controller will handle balance sheet and trial balance
in future enhancements.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use jest.spyOn() with real interface types</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API DTOs use snake_case (e.g., period_start, net_profit, total_income)</rule>
  <rule>Internal service DTOs use camelCase (e.g., periodStart, netProfitCents, totalCents)</rule>
  <rule>API response amounts in Rands, internal amounts in cents (divide by 100)</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>~1520 tests (1510 + TASK-RECON-031 tests)</test_count>
  <prerequisite>TASK-RECON-031 must be completed first (creates ReconciliationModule)</prerequisite>
  <pattern_reference>Use src/api/sars/sars.controller.ts generateVat201 method as reference</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/database/services/financial-report.service.ts" purpose="Financial report service (TASK-RECON-013)">
    Key method:
    ```typescript
    async generateIncomeStatement(
      tenantId: string,
      periodStart: Date,
      periodEnd: Date,
    ): Promise<IncomeStatement>

    // IncomeStatement (from src/database/dto/financial-report.dto.ts):
    interface IncomeStatement {
      tenantId: string;
      period: { start: Date; end: Date };
      income: {
        totalCents: number;
        totalRands: number;
        breakdown: AccountBreakdown[];
      };
      expenses: {
        totalCents: number;
        totalRands: number;
        breakdown: AccountBreakdown[];
      };
      netProfitCents: number;
      netProfitRands: number;
      generatedAt: Date;
    }

    interface AccountBreakdown {
      accountCode: string;
      accountName: string;
      amountCents: number;
      amountRands: number;
    }
    ```
    Throws BusinessException if periodStart > periodEnd.
    PDF/Excel export throws BusinessException NOT_IMPLEMENTED (future enhancement).
  </file>
  <file path="src/database/dto/financial-report.dto.ts" purpose="Internal DTOs (camelCase)">
    Contains IncomeStatement, BalanceSheet, TrialBalance, AccountBreakdown, ReportFormat.
  </file>
  <file path="src/database/repositories/invoice.repository.ts" purpose="Used by FinancialReportService">
    Used internally for income calculations from paid invoices.
  </file>
  <file path="src/api/reconciliation/reconciliation.controller.ts" purpose="Controller from TASK-RECON-031">
    Will add getIncomeStatement method to this controller (or create separate ReportsController).
  </file>
  <file path="src/api/reconciliation/reconciliation.module.ts" purpose="Module from TASK-RECON-031">
    Will add FinancialReportService and InvoiceRepository to providers.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="src/api/reconciliation/dto/income-statement.dto.ts">
    API DTOs for Income Statement endpoint.

    ```typescript
    /**
     * Income Statement DTOs
     * TASK-RECON-032: Financial Reports Endpoint
     *
     * API DTOs for Income Statement (Profit & Loss) endpoint.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
    import { IsDateString, IsEnum, IsOptional } from 'class-validator';

    export class ApiIncomeStatementQueryDto {
      @ApiProperty({
        description: 'Start date of reporting period (YYYY-MM-DD)',
        example: '2025-01-01',
      })
      @IsDateString()
      period_start!: string;

      @ApiProperty({
        description: 'End date of reporting period (YYYY-MM-DD)',
        example: '2025-01-31',
      })
      @IsDateString()
      period_end!: string;

      @ApiPropertyOptional({
        description: 'Output format',
        enum: ['json', 'pdf', 'excel'],
        default: 'json',
      })
      @IsOptional()
      @IsEnum(['json', 'pdf', 'excel'])
      format?: 'json' | 'pdf' | 'excel';
    }

    export class ApiAccountBreakdownDto {
      @ApiProperty({ example: '4000', description: 'Account code' })
      account_code!: string;

      @ApiProperty({ example: 'School Fees', description: 'Account name' })
      account_name!: string;

      @ApiProperty({ example: 150000.00, description: 'Amount in Rands' })
      amount!: number;
    }

    export class ApiIncomeSectionDto {
      @ApiProperty({ example: 154500.00, description: 'Total income (Rands)' })
      total!: number;

      @ApiProperty({ type: [ApiAccountBreakdownDto], description: 'Breakdown by account' })
      breakdown!: ApiAccountBreakdownDto[];
    }

    export class ApiExpenseSectionDto {
      @ApiProperty({ example: 85200.00, description: 'Total expenses (Rands)' })
      total!: number;

      @ApiProperty({ type: [ApiAccountBreakdownDto], description: 'Breakdown by account' })
      breakdown!: ApiAccountBreakdownDto[];
    }

    export class ApiPeriodDto {
      @ApiProperty({ example: '2025-01-01' })
      start!: string;

      @ApiProperty({ example: '2025-01-31' })
      end!: string;
    }

    export class ApiIncomeStatementDataDto {
      @ApiProperty({ type: ApiPeriodDto })
      period!: ApiPeriodDto;

      @ApiProperty({ type: ApiIncomeSectionDto })
      income!: ApiIncomeSectionDto;

      @ApiProperty({ type: ApiExpenseSectionDto })
      expenses!: ApiExpenseSectionDto;

      @ApiProperty({ example: 69300.00, description: 'Net profit (income - expenses) in Rands' })
      net_profit!: number;

      @ApiProperty({ example: '2025-01-31T14:30:00.000Z', description: 'Report generation timestamp' })
      generated_at!: string;

      @ApiPropertyOptional({
        example: '/reports/income-statement/uuid/download',
        description: 'Present if format is pdf or excel',
      })
      document_url?: string;
    }

    export class ApiIncomeStatementResponseDto {
      @ApiProperty({ example: true })
      success!: boolean;

      @ApiProperty({ type: ApiIncomeStatementDataDto })
      data!: ApiIncomeStatementDataDto;
    }
    ```
  </file>

  <file path="tests/api/reconciliation/reports.controller.spec.ts">
    Controller unit tests for income statement endpoint using jest.spyOn() - NO MOCK DATA.

    Test coverage (minimum 10 tests):
    1. GET /reports/income-statement with valid period returns 200
    2. Transforms API snake_case to service camelCase (period_start → periodStart)
    3. Converts Date to ISO date string in response (period.start, period.end)
    4. Response uses snake_case field names (net_profit, not netProfit)
    5. Calculates net_profit correctly (income.total - expenses.total)
    6. Returns breakdown arrays with account_code and account_name
    7. Works for ADMIN users same as OWNER
    8. Works for ACCOUNTANT role
    9. Works for VIEWER role (read-only reports)
    10. Propagates BusinessException when period_end before period_start
    11. Returns generated_at as ISO timestamp
    12. format=json returns full data structure (default)

    Pattern: Use tests/api/sars/sars.controller.spec.ts as reference.
    All providers must be included even if not called directly (for DI).
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/reconciliation/reconciliation.controller.ts">
    Add getIncomeStatement method OR create separate ReportsController.

    Option A: Add to existing controller (simpler):
    ```typescript
    // Add to imports:
    import { Get, Query } from '@nestjs/common';
    import { FinancialReportService } from '../../database/services/financial-report.service';
    import {
      ApiReconcileDto, ApiReconciliationResponseDto,
      ApiIncomeStatementQueryDto, ApiIncomeStatementResponseDto,
    } from './dto';

    // Add to constructor:
    constructor(
      private readonly reconciliationService: ReconciliationService,
      private readonly financialReportService: FinancialReportService,
    ) {}

    // Add method:
    @Get('income-statement')
    @HttpCode(200)
    @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
    @UseGuards(JwtAuthGuard, RolesGuard)
    @ApiOperation({ summary: 'Generate Income Statement (Profit & Loss)' })
    @ApiResponse({ status: 200, type: ApiIncomeStatementResponseDto })
    @ApiResponse({ status: 400, description: 'Invalid date format or period_end before period_start' })
    @ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, ACCOUNTANT, or VIEWER role' })
    @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
    async getIncomeStatement(
      @Query() query: ApiIncomeStatementQueryDto,
      @CurrentUser() user: IUser,
    ): Promise<ApiIncomeStatementResponseDto> {
      this.logger.log(
        `Income Statement: tenant=${user.tenantId}, period=${query.period_start} to ${query.period_end}`
      );

      // Transform API snake_case to service camelCase
      const periodStart = new Date(query.period_start);
      const periodEnd = new Date(query.period_end);

      const report = await this.financialReportService.generateIncomeStatement(
        user.tenantId,
        periodStart,
        periodEnd,
      );

      this.logger.log(
        `Income Statement generated: income=${report.income.totalCents}c, expenses=${report.expenses.totalCents}c`
      );

      // Transform service camelCase to API snake_case
      const response: ApiIncomeStatementResponseDto = {
        success: true,
        data: {
          period: {
            start: report.period.start.toISOString().slice(0, 10), // YYYY-MM-DD
            end: report.period.end.toISOString().slice(0, 10),
          },
          income: {
            total: report.income.totalRands,
            breakdown: report.income.breakdown.map(b => ({
              account_code: b.accountCode,
              account_name: b.accountName,
              amount: b.amountRands,
            })),
          },
          expenses: {
            total: report.expenses.totalRands,
            breakdown: report.expenses.breakdown.map(b => ({
              account_code: b.accountCode,
              account_name: b.accountName,
              amount: b.amountRands,
            })),
          },
          net_profit: report.netProfitRands,
          generated_at: report.generatedAt.toISOString(),
        },
      };

      // Future: handle pdf/excel format by adding document_url
      if (query.format === 'pdf' || query.format === 'excel') {
        // For now, just return the data - PDF/Excel export is NOT_IMPLEMENTED in service
        response.data.document_url = `/reports/income-statement/download?format=${query.format}`;
      }

      return response;
    }
    ```

    Option B: Create separate ReportsController at /reports (more RESTful):
    ```typescript
    @Controller('reports')
    @ApiTags('Reports')
    @ApiBearerAuth('JWT-auth')
    export class ReportsController {
      // Same implementation as above
    }
    ```
    Then add to reconciliation.module.ts controllers array.
  </file>

  <file path="src/api/reconciliation/reconciliation.module.ts">
    Add FinancialReportService and InvoiceRepository to providers.

    ```typescript
    import { FinancialReportService } from '../../database/services/financial-report.service';
    import { InvoiceRepository } from '../../database/repositories/invoice.repository';

    @Module({
      imports: [PrismaModule],
      controllers: [ReconciliationController], // or add ReportsController
      providers: [
        ReconciliationService,
        ReconciliationRepository,
        FinancialReportService,
        InvoiceRepository, // Required by FinancialReportService
      ],
    })
    export class ReconciliationModule {}
    ```
  </file>

  <file path="src/api/reconciliation/dto/index.ts">
    Add Income Statement DTO exports.

    ```typescript
    export * from './reconcile.dto';
    export * from './reconciliation-response.dto';
    export * from './income-statement.dto';
    ```
  </file>
</files_to_modify>

<test_requirements>
  <requirement>Use jest.spyOn() to verify FinancialReportService.generateIncomeStatement() calls</requirement>
  <requirement>Create mock IUser objects with real UserRole from @prisma/client</requirement>
  <requirement>Return typed IncomeStatement objects (not mock data)</requirement>
  <requirement>Verify DTO transformation (snake_case API to camelCase service)</requirement>
  <requirement>Verify Date formatting (ISO date string in response)</requirement>
  <requirement>Verify amounts are in Rands (use totalRands from service)</requirement>
  <requirement>Test error propagation (BusinessException)</requirement>
  <requirement>Minimum 10 tests for this endpoint</requirement>
</test_requirements>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test tests/api/reconciliation/reports.controller.spec.ts - all tests pass</step>
  <step>npm run test - all tests pass (previous ~1520 + ~10 new)</step>
</verification_steps>

<error_handling>
  FinancialReportService throws BusinessException if periodStart > periodEnd - let it propagate.
  FinancialReportService.exportPDF/exportExcel throw BusinessException NOT_IMPLEMENTED - let it propagate.
  DO NOT catch and wrap errors. Errors must propagate with their original messages for debugging.
</error_handling>

<implementation_notes>
  1. The service already provides amounts in both cents (amountCents) and Rands (amountRands).
  2. Use totalRands and amountRands from service response (already divided by 100).
  3. The format query parameter accepts 'json', 'pdf', 'excel' - default is 'json'.
  4. PDF/Excel export is NOT_IMPLEMENTED in service - controller should handle gracefully.
  5. VIEWER role can access reports (read-only, unlike reconciliation which requires ACCOUNTANT+).
  6. Period dates should be formatted as YYYY-MM-DD in response (slice(0, 10) from ISO string).
  7. Income comes from paid invoices (school fees), expenses from categorized transactions.
</implementation_notes>

<south_african_context>
  <currency>ZAR (South African Rand)</currency>
  <timezone>Africa/Johannesburg (SAST, UTC+2)</timezone>
  <accounting_standards>GAAP for Small Entities</accounting_standards>
  <vat_rate>15%</vat_rate>
  <primary_income>School Fees (account code 4000)</primary_income>
  <typical_expenses>Salaries, Utilities, Food, Educational Materials</typical_expenses>
</south_african_context>

</task_spec>

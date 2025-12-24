<task_spec id="TASK-RECON-033" version="1.0">

<metadata>
  <title>Balance Sheet API Endpoint</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>110</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-RECON-006</requirement_ref>
    <critical_issue_ref>CRIT-007</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-005</task_ref>
    <task_ref status="COMPLETE">TASK-RECON-006</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use financial reporting and API design thinking.
This task involves:
1. REST endpoint for Balance Sheet
2. Assets, Liabilities, Equity calculation
3. IFRS for SMEs compliance
4. PDF/Excel export
5. Date-based reporting
</reasoning_mode>

<context>
CRITICAL GAP: No Balance Sheet API endpoint exists.

REQ-RECON-006 specifies: "Generate Balance Sheet report."

This task creates the REST endpoint to serve Balance Sheet data and export options.
</context>

<current_state>
## Codebase State
- ReconciliationController exists
- Income Statement endpoint exists
- BalanceSheetService may exist (needs verification)
- No @Get('balance-sheet') endpoint

## What Exists
- Transaction categorization
- Account/category structure
- Decimal.js for calculations
</current_state>

<input_context_files>
  <file purpose="controller">apps/api/src/modules/reconciliation/reconciliation.controller.ts</file>
  <file purpose="income_statement">apps/api/src/database/services/income-statement.service.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<scope>
  <in_scope>
    - @Get('balance-sheet') endpoint
    - BalanceSheetService with calculation logic
    - Assets, Liabilities, Equity structure
    - Date range query parameters
    - PDF export via PDFKit
    - Excel export via ExcelJS
  </in_scope>
  <out_of_scope>
    - UI components (Web layer)
    - Multi-currency support
    - Comparative periods (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/modules/reconciliation/reconciliation.controller.ts">
      @Controller('reconciliation')
      export class ReconciliationController {
        @Get('balance-sheet')
        async getBalanceSheet(
          @Query('asAtDate') asAtDate: string,
          @Headers('x-tenant-id') tenantId: string
        ): Promise<BalanceSheetResponse>;

        @Get('balance-sheet/export')
        async exportBalanceSheet(
          @Query('asAtDate') asAtDate: string,
          @Query('format') format: 'pdf' | 'xlsx',
          @Headers('x-tenant-id') tenantId: string,
          @Res() res: Response
        ): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/database/services/balance-sheet.service.ts">
      @Injectable()
      export class BalanceSheetService {
        async generate(tenantId: string, asAtDate: Date): Promise<BalanceSheet>;
        async exportToPdf(balanceSheet: BalanceSheet): Promise<Buffer>;
        async exportToExcel(balanceSheet: BalanceSheet): Promise<Buffer>;

        private calculateAssets(tenantId: string, asAtDate: Date): Promise<AssetSection>;
        private calculateLiabilities(tenantId: string, asAtDate: Date): Promise<LiabilitySection>;
        private calculateEquity(tenantId: string, asAtDate: Date): Promise<EquitySection>;
      }
    </signature>
    <signature file="apps/api/src/database/dto/balance-sheet.dto.ts">
      export interface BalanceSheet {
        asAtDate: Date;
        tenantId: string;
        assets: AssetSection;
        liabilities: LiabilitySection;
        equity: EquitySection;
        totalAssets: Decimal;
        totalLiabilitiesAndEquity: Decimal;
        isBalanced: boolean;
      }

      export interface AssetSection {
        current: LineItem[];
        nonCurrent: LineItem[];
        total: Decimal;
      }

      export interface LineItem {
        account: string;
        description: string;
        amount: Decimal;
      }
    </signature>
  </signatures>

  <constraints>
    - Use Decimal.js with banker's rounding for all calculations
    - Follow IFRS for SMEs presentation
    - Assets = Liabilities + Equity (must balance)
    - PDF includes CrecheBooks branding
    - Excel includes formulas for verification
    - All amounts in ZAR
  </constraints>

  <verification>
    - GET /api/reconciliation/balance-sheet returns data
    - Accounting equation balances
    - PDF export generates valid document
    - Excel export with formulas
    - All amounts use banker's rounding
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/balance-sheet.service.ts">Balance sheet service</file>
  <file path="apps/api/src/database/dto/balance-sheet.dto.ts">DTOs</file>
  <file path="apps/api/src/database/services/__tests__/balance-sheet.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/modules/reconciliation/reconciliation.controller.ts">Add endpoints</file>
  <file path="apps/api/src/modules/reconciliation/reconciliation.module.ts">Import service</file>
</files_to_modify>

<validation_criteria>
  <criterion>Endpoint returns balance sheet data</criterion>
  <criterion>Accounting equation balanced</criterion>
  <criterion>PDF export works</criterion>
  <criterion>Excel export with formulas</criterion>
  <criterion>Banker's rounding applied</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="balance-sheet" --verbose</command>
</test_commands>

</task_spec>

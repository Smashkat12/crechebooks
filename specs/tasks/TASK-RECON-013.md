<task_spec id="TASK-RECON-013" version="1.0">

<metadata>
  <title>Financial Report Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>36</sequence>
  <implements>
    <requirement_ref>REQ-RECON-005</requirement_ref>
    <requirement_ref>REQ-RECON-006</requirement_ref>
    <requirement_ref>REQ-RECON-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-002</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the FinancialReportService which generates formal financial
reports for the creche: Income Statement (Profit & Loss), Balance Sheet, and
Trial Balance. Reports are grouped by account codes from the Chart of Accounts
and formatted according to South African accounting standards (IFRS for SMEs).
The service supports multi-format export (JSON, PDF, Excel) for different
stakeholder needs. These reports enable compliance, decision-making, and audits.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#ReconciliationService</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="invoice_entity">src/database/entities/invoice.entity.ts</file>
  <file purpose="categorization_entity">src/database/entities/categorization.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-002 completed (Categorization entity exists)</check>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>Transaction repository available</check>
  <check>Invoice repository available</check>
  <check>Chart of Accounts defined</check>
  <check>NestJS service infrastructure in place</check>
</prerequisites>

<scope>
  <in_scope>
    - Create FinancialReportService class
    - Implement generateIncomeStatement() method
    - Implement generateBalanceSheet() method
    - Implement generateTrialBalance() method
    - Implement exportPDF() method
    - Implement exportExcel() method
    - Group transactions by account codes
    - Format per SA accounting standards (IFRS for SMEs)
    - Calculate totals, subtotals, and net profit/loss
    - Create report DTOs (IncomeStatementDto, BalanceSheetDto, TrialBalanceDto)
    - Support date range filtering
    - Unit tests for report service
  </in_scope>
  <out_of_scope>
    - Chart of Accounts management (separate task)
    - Reconciliation logic (TASK-RECON-011)
    - Discrepancy detection (TASK-RECON-012)
    - Cash Flow Statement (future enhancement)
    - Budget vs Actual reports (future enhancement)
    - API endpoints
    - UI components
    - Email delivery of reports
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/reconciliation/financial-report.service.ts">
      @Injectable()
      export class FinancialReportService {
        constructor(
          private transactionRepo: TransactionRepository,
          private invoiceRepo: InvoiceRepository,
          private categorizationRepo: CategorizationRepository
        ) {}

        async generateIncomeStatement(
          periodStart: Date,
          periodEnd: Date,
          tenantId: string
        ): Promise&lt;IncomeStatement&gt; {
          // 1. Get all income transactions (categorized as income accounts)
          // 2. Get all expense transactions (categorized as expense accounts)
          // 3. Group by account code
          // 4. Calculate totals
          // 5. Calculate net profit (income - expenses)
          // 6. Format per IFRS for SMEs
        }

        async generateBalanceSheet(
          asOfDate: Date,
          tenantId: string
        ): Promise&lt;BalanceSheet&gt; {
          // 1. Get all transactions up to asOfDate
          // 2. Calculate assets, liabilities, equity
          // 3. Group by account code
          // 4. Verify accounting equation (Assets = Liabilities + Equity)
          // 5. Format per IFRS for SMEs
        }

        async generateTrialBalance(
          asOfDate: Date,
          tenantId: string
        ): Promise&lt;TrialBalance&gt; {
          // 1. Get all account balances as of date
          // 2. List debits and credits
          // 3. Verify debits = credits
          // 4. Format per SA standards
        }

        async exportPDF(
          report: IncomeStatement | BalanceSheet | TrialBalance
        ): Promise&lt;Buffer&gt; {
          // Generate PDF document
        }

        async exportExcel(
          report: IncomeStatement | BalanceSheet | TrialBalance
        ): Promise&lt;Buffer&gt; {
          // Generate Excel spreadsheet
        }
      }
    </signature>
    <signature file="src/core/reconciliation/dto/financial-report.dto.ts">
      export class IncomeStatement {
        period: { start: Date; end: Date };
        income: {
          total: number;
          breakdown: AccountBreakdown[];
        };
        expenses: {
          total: number;
          breakdown: AccountBreakdown[];
        };
        netProfit: number;
        generatedAt: Date;
      }

      export class BalanceSheet {
        asOfDate: Date;
        assets: {
          total: number;
          current: AccountBreakdown[];
          nonCurrent: AccountBreakdown[];
        };
        liabilities: {
          total: number;
          current: AccountBreakdown[];
          nonCurrent: AccountBreakdown[];
        };
        equity: {
          total: number;
          breakdown: AccountBreakdown[];
        };
        generatedAt: Date;
      }

      export class TrialBalance {
        asOfDate: Date;
        accounts: TrialBalanceAccount[];
        totals: {
          debits: number;
          credits: number;
        };
        isBalanced: boolean;
        generatedAt: Date;
      }

      export class AccountBreakdown {
        accountCode: string;
        accountName: string;
        amount: number;
      }

      export class TrialBalanceAccount {
        accountCode: string;
        accountName: string;
        debit: number;
        credit: number;
      }

      export enum ReportFormat {
        JSON = 'JSON',
        PDF = 'PDF',
        EXCEL = 'EXCEL'
      }
    </signature>
  </signatures>

  <constraints>
    - Must NOT use 'any' type anywhere
    - Must follow NestJS service patterns
    - Must validate all inputs using class-validator
    - Must adhere to IFRS for SMEs standards
    - All monetary values in rands (decimals allowed for display)
    - Must store amounts as cents internally
    - Account grouping must match Chart of Accounts structure
    - Income Statement: Revenue - Expenses = Net Profit
    - Balance Sheet: Assets = Liabilities + Equity
    - Trial Balance: Total Debits = Total Credits
    - Date ranges must be validated (start <= end)
    - Must handle periods with no transactions
    - Reports must include generation timestamp
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - Income statement calculates net profit correctly
    - Income statement groups accounts correctly
    - Balance sheet balances (Assets = Liabilities + Equity)
    - Trial balance balances (Debits = Credits)
    - Reports format per SA accounting standards
    - PDF export generates valid PDF
    - Excel export generates valid XLSX
    - Service handles empty periods gracefully
    - All DTOs have proper validation decorators
  </verification>
</definition_of_done>

<pseudo_code>
DTOs (src/core/reconciliation/dto/financial-report.dto.ts):
  export enum ReportFormat:
    JSON = 'JSON'
    PDF = 'PDF'
    EXCEL = 'EXCEL'

  export class AccountBreakdown:
    accountCode: string
    accountName: string
    amount: number

  export class IncomeStatement:
    period: { start: Date; end: Date }
    income: {
      total: number
      breakdown: AccountBreakdown[]
    }
    expenses: {
      total: number
      breakdown: AccountBreakdown[]
    }
    netProfit: number
    generatedAt: Date

  export class BalanceSheet:
    asOfDate: Date
    assets: {
      total: number
      current: AccountBreakdown[]
      nonCurrent: AccountBreakdown[]
    }
    liabilities: {
      total: number
      current: AccountBreakdown[]
      nonCurrent: AccountBreakdown[]
    }
    equity: {
      total: number
      breakdown: AccountBreakdown[]
    }
    generatedAt: Date

  export class TrialBalanceAccount:
    accountCode: string
    accountName: string
    debit: number
    credit: number

  export class TrialBalance:
    asOfDate: Date
    accounts: TrialBalanceAccount[]
    totals: { debits: number; credits: number }
    isBalanced: boolean
    generatedAt: Date

Service (src/core/reconciliation/financial-report.service.ts):
  @Injectable()
  export class FinancialReportService:
    constructor(
      private transactionRepo: TransactionRepository,
      private invoiceRepo: InvoiceRepository,
      private categorizationRepo: CategorizationRepository,
      private logger: LoggerService
    )

    async generateIncomeStatement(
      periodStart: Date,
      periodEnd: Date,
      tenantId: string
    ): Promise<IncomeStatement>
      // Validate period
      if (periodStart > periodEnd):
        throw BadRequestException("Start date must be before end date")

      // Get all transactions in period with categorization
      transactions = await transactionRepo.findByPeriodWithCategories(
        tenantId,
        periodStart,
        periodEnd
      )

      // Get all invoices in period (income)
      invoices = await invoiceRepo.findByPeriod(
        tenantId,
        periodStart,
        periodEnd,
        { status: [PAID, PARTIALLY_PAID] }
      )

      // Group income
      incomeMap = new Map<string, AccountBreakdown>()

      // Add invoice income
      for each invoice in invoices:
        accountCode = '4000' // School Fees income account
        if (!incomeMap.has(accountCode)):
          incomeMap.set(accountCode, {
            accountCode,
            accountName: 'School Fees',
            amount: 0
          })

        breakdown = incomeMap.get(accountCode)
        breakdown.amount += invoice.amountPaid / 100 // Convert cents to rands

      // Group expenses
      expenseMap = new Map<string, AccountBreakdown>()

      for each tx in transactions:
        if (!tx.categorization):
          continue

        accountCode = tx.categorization.accountCode

        // Check if income or expense (account codes 4000-4999 = income)
        if (accountCode.startsWith('4')):
          if (!incomeMap.has(accountCode)):
            incomeMap.set(accountCode, {
              accountCode,
              accountName: tx.categorization.accountName,
              amount: 0
            })
          breakdown = incomeMap.get(accountCode)
          breakdown.amount += Math.abs(tx.amountCents / 100)

        // Account codes 5000-8999 = expenses
        else if (accountCode.startsWith('5') ||
                 accountCode.startsWith('6') ||
                 accountCode.startsWith('7') ||
                 accountCode.startsWith('8')):
          if (!expenseMap.has(accountCode)):
            expenseMap.set(accountCode, {
              accountCode,
              accountName: tx.categorization.accountName,
              amount: 0
            })
          breakdown = expenseMap.get(accountCode)
          breakdown.amount += Math.abs(tx.amountCents / 100)

      // Calculate totals
      incomeBreakdown = Array.from(incomeMap.values())
      expenseBreakdown = Array.from(expenseMap.values())

      totalIncome = incomeBreakdown.reduce((sum, acc) => sum + acc.amount, 0)
      totalExpenses = expenseBreakdown.reduce((sum, acc) => sum + acc.amount, 0)
      netProfit = totalIncome - totalExpenses

      // Build report
      report = {
        period: { start: periodStart, end: periodEnd },
        income: {
          total: totalIncome,
          breakdown: incomeBreakdown.sort((a, b) => a.accountCode.localeCompare(b.accountCode))
        },
        expenses: {
          total: totalExpenses,
          breakdown: expenseBreakdown.sort((a, b) => a.accountCode.localeCompare(b.accountCode))
        },
        netProfit,
        generatedAt: new Date()
      }

      logger.log(`Generated Income Statement for ${tenantId}: Net Profit = R${netProfit}`)

      return report

    async generateBalanceSheet(
      asOfDate: Date,
      tenantId: string
    ): Promise<BalanceSheet>
      // Get all transactions up to date
      transactions = await transactionRepo.findUpToDateWithCategories(
        tenantId,
        asOfDate
      )

      // Get outstanding invoices (accounts receivable)
      outstandingInvoices = await invoiceRepo.findOutstanding(tenantId, asOfDate)
      accountsReceivable = outstandingInvoices.reduce(
        (sum, inv) => sum + (inv.total - inv.amountPaid),
        0
      ) / 100

      // Calculate asset accounts (1000-1999)
      currentAssets = []
      nonCurrentAssets = []

      // Add cash (from bank balance)
      cashBalance = await calculateCashBalance(transactions)
      currentAssets.push({
        accountCode: '1100',
        accountName: 'Bank Account',
        amount: cashBalance
      })

      // Add accounts receivable
      if (accountsReceivable > 0):
        currentAssets.push({
          accountCode: '1200',
          accountName: 'Accounts Receivable',
          amount: accountsReceivable
        })

      // Group asset transactions
      for each tx in transactions:
        if (!tx.categorization):
          continue

        accountCode = tx.categorization.accountCode
        if (accountCode.startsWith('1')):
          isCurrentAsset = (parseInt(accountCode) >= 1000 && parseInt(accountCode) < 1500)
          targetArray = isCurrentAsset ? currentAssets : nonCurrentAssets

          existing = targetArray.find(a => a.accountCode === accountCode)
          if (!existing):
            targetArray.push({
              accountCode,
              accountName: tx.categorization.accountName,
              amount: tx.amountCents / 100
            })
          else:
            existing.amount += tx.amountCents / 100

      // Calculate liability accounts (2000-2999)
      currentLiabilities = []
      nonCurrentLiabilities = []

      // TODO: Add accounts payable, loans, etc.

      // Calculate equity accounts (3000-3999)
      equityBreakdown = []

      // Retained earnings = Net Profit (from Income Statement)
      // For now, calculate from transaction history

      // Calculate totals
      totalAssets =
        currentAssets.reduce((sum, a) => sum + a.amount, 0) +
        nonCurrentAssets.reduce((sum, a) => sum + a.amount, 0)

      totalLiabilities =
        currentLiabilities.reduce((sum, l) => sum + l.amount, 0) +
        nonCurrentLiabilities.reduce((sum, l) => sum + l.amount, 0)

      totalEquity = totalAssets - totalLiabilities

      equityBreakdown.push({
        accountCode: '3100',
        accountName: 'Retained Earnings',
        amount: totalEquity
      })

      report = {
        asOfDate,
        assets: {
          total: totalAssets,
          current: currentAssets,
          nonCurrent: nonCurrentAssets
        },
        liabilities: {
          total: totalLiabilities,
          current: currentLiabilities,
          nonCurrent: nonCurrentLiabilities
        },
        equity: {
          total: totalEquity,
          breakdown: equityBreakdown
        },
        generatedAt: new Date()
      }

      // Verify accounting equation
      if (Math.abs((totalAssets) - (totalLiabilities + totalEquity)) > 0.01):
        logger.warn("Balance Sheet does not balance!")

      return report

    async generateTrialBalance(
      asOfDate: Date,
      tenantId: string
    ): Promise<TrialBalance>
      // Get all accounts with balances
      transactions = await transactionRepo.findUpToDateWithCategories(
        tenantId,
        asOfDate
      )

      accountBalances = new Map<string, TrialBalanceAccount>()

      for each tx in transactions:
        if (!tx.categorization):
          continue

        accountCode = tx.categorization.accountCode

        if (!accountBalances.has(accountCode)):
          accountBalances.set(accountCode, {
            accountCode,
            accountName: tx.categorization.accountName,
            debit: 0,
            credit: 0
          })

        account = accountBalances.get(accountCode)

        // Debit accounts: Assets (1xxx), Expenses (5xxx-8xxx)
        // Credit accounts: Liabilities (2xxx), Equity (3xxx), Income (4xxx)

        if (accountCode.startsWith('1') ||
            accountCode.startsWith('5') ||
            accountCode.startsWith('6') ||
            accountCode.startsWith('7') ||
            accountCode.startsWith('8')):
          account.debit += Math.abs(tx.amountCents / 100)
        else:
          account.credit += Math.abs(tx.amountCents / 100)

      accounts = Array.from(accountBalances.values())
        .sort((a, b) => a.accountCode.localeCompare(b.accountCode))

      totalDebits = accounts.reduce((sum, acc) => sum + acc.debit, 0)
      totalCredits = accounts.reduce((sum, acc) => sum + acc.credit, 0)
      isBalanced = Math.abs(totalDebits - totalCredits) < 0.01

      report = {
        asOfDate,
        accounts,
        totals: {
          debits: totalDebits,
          credits: totalCredits
        },
        isBalanced,
        generatedAt: new Date()
      }

      if (!isBalanced):
        logger.warn(`Trial Balance does not balance: Debits=${totalDebits}, Credits=${totalCredits}`)

      return report

    async exportPDF(report: any, reportType: string): Promise<Buffer>
      // TODO: Implement PDF generation using library like pdfmake or puppeteer
      // For now, throw not implemented
      throw new Error("PDF export not yet implemented")

    async exportExcel(report: any, reportType: string): Promise<Buffer>
      // TODO: Implement Excel generation using library like exceljs
      // For now, throw not implemented
      throw new Error("Excel export not yet implemented")

    private async calculateCashBalance(transactions: Transaction[]): Promise<number>
      balance = 0
      for each tx in transactions:
        if (tx.is_credit):
          balance += tx.amountCents / 100
        else:
          balance -= tx.amountCents / 100
      return balance
</pseudo_code>

<files_to_create>
  <file path="src/core/reconciliation/financial-report.service.ts">FinancialReportService class</file>
  <file path="src/core/reconciliation/dto/financial-report.dto.ts">Financial report DTOs</file>
  <file path="tests/core/reconciliation/financial-report.service.spec.ts">Service unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/reconciliation/reconciliation.module.ts">Register FinancialReportService as provider</file>
  <file path="src/core/reconciliation/dto/index.ts">Export financial report DTOs</file>
  <file path="src/database/repositories/transaction.repository.ts">Add findByPeriodWithCategories and findUpToDateWithCategories methods</file>
  <file path="src/database/repositories/invoice.repository.ts">Add findByPeriod and findOutstanding methods</file>
</files_to_modify>

<validation_criteria>
  <criterion>Income statement calculates total income correctly</criterion>
  <criterion>Income statement calculates total expenses correctly</criterion>
  <criterion>Income statement calculates net profit correctly (income - expenses)</criterion>
  <criterion>Income statement groups transactions by account code</criterion>
  <criterion>Balance sheet calculates total assets correctly</criterion>
  <criterion>Balance sheet calculates total liabilities correctly</criterion>
  <criterion>Balance sheet calculates total equity correctly</criterion>
  <criterion>Balance sheet balances (Assets = Liabilities + Equity)</criterion>
  <criterion>Trial balance lists all accounts with balances</criterion>
  <criterion>Trial balance calculates total debits correctly</criterion>
  <criterion>Trial balance calculates total credits correctly</criterion>
  <criterion>Trial balance verifies debits = credits</criterion>
  <criterion>Reports format per SA accounting standards (IFRS for SMEs)</criterion>
  <criterion>Service handles periods with no transactions</criterion>
  <criterion>All monetary values displayed in rands (cents internally)</criterion>
  <criterion>Reports include generation timestamp</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "FinancialReportService"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

<task_spec id="TASK-AGENT-004" version="1.0">

<metadata>
  <title>SARS Calculation Agent</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>40</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-011</task_ref>
    <task_ref>TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task implements the SARS Calculation agent, a specialized Claude Code subagent that
calculates monthly tax submissions for South African creches. The agent handles PAYE
(Pay-As-You-Earn), UIF (Unemployment Insurance Fund), and VAT calculations using official
2025 SARS tax tables. Due to the critical nature of tax calculations, this agent operates
with L2 autonomy (draft for review) and ALWAYS requires human review before submission.
The agent flags any uncertainties or edge cases and provides detailed calculation breakdowns
for verification.
</context>

<input_context_files>
  <file purpose="agent_definition">specs/technical/architecture.md#sars_agent</file>
  <file purpose="calculation_logic">specs/logic/sars-logic.md</file>
  <file purpose="tax_tables">.claude/context/sars_tables_2025.json</file>
  <file purpose="requirements">specs/requirements/sars.md</file>
  <file purpose="autonomy_level">specs/constitution.md#autonomy_levels</file>
</input_context_files>

<prerequisites>
  <check>TASK-AGENT-001 completed (.claude/ structure and SARS tables exist)</check>
  <check>TASK-SARS-011 completed (SARS service implemented)</check>
  <check>PostgreSQL MCP server configured and accessible</check>
  <check>Payroll and transaction data available</check>
  <check>2025 SARS tax tables loaded and verified</check>
</prerequisites>

<scope>
  <in_scope>
    - Create agent definition in src/agents/sars-agent/
    - Implement skills file: calculate-sars.md
    - PAYE calculation using 2025 tax brackets and rebates
    - UIF calculation (1% employee + 1% employer)
    - VAT calculation (15% standard rate)
    - Integration with MCP tools:
      - mcp__postgres__query (fetch payroll/transaction data)
    - Detailed calculation breakdown generation
    - ALWAYS require human review (L2 autonomy)
    - Flag uncertainties:
      - Missing employee tax numbers
      - Unusual deduction amounts
      - Threshold crossings (VAT registration)
    - Generate EMP201 and VAT201 draft returns
    - Validate calculations against SARS rules
  </in_scope>
  <out_of_scope>
    - Actual eFiling submission (manual process)
    - Payroll data entry (TASK-SARS-001)
    - Employee tax certificate generation (future)
    - Postgres MCP server implementation (TASK-MCP-002)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/agents/sars-agent/sars.agent.ts">
      export class SarsAgent {
        async calculatePAYE(
          period: TaxPeriod,
          payrollData: PayrollRecord[]
        ): Promise&lt;PAYECalculation&gt;;

        async calculateUIF(
          period: TaxPeriod,
          payrollData: PayrollRecord[]
        ): Promise&lt;UIFCalculation&gt;;

        async calculateVAT(
          period: TaxPeriod,
          transactions: Transaction[]
        ): Promise&lt;VATCalculation&gt;;

        async generateEMP201(
          period: TaxPeriod
        ): Promise&lt;EMP201Return&gt;;

        async generateVAT201(
          period: TaxPeriod
        ): Promise&lt;VAT201Return&gt;;

        private validateCalculation(
          calculation: TaxCalculation
        ): ValidationResult;

        private flagUncertainties(
          data: any,
          calculation: TaxCalculation
        ): UncertaintyFlag[];
      }
    </signature>
    <signature file=".claude/agents/sars-agent/calculate-sars.md">
      # Calculate SARS Submissions Skill

      ## Context
      [Load 2025 tax tables, payroll data, transaction data]

      ## PAYE Algorithm
      1. Load employee payroll records for period
      2. Apply tax brackets and rebates
      3. Calculate PAYE per employee
      4. Sum total PAYE for period
      5. Validate against thresholds
      6. Flag missing tax numbers

      ## UIF Algorithm
      1. Calculate 1% employee contribution (capped at R177.12/month)
      2. Calculate 1% employer contribution (capped at R177.12/month)
      3. Sum total UIF

      ## VAT Algorithm
      1. Sum input VAT (purchases)
      2. Sum output VAT (sales/invoices)
      3. Calculate net VAT (output - input)
      4. Check if below/above registration threshold

      ## CRITICAL: ALWAYS require human review before submission

      ## MCP Tools
      - mcp__postgres__query
    </signature>
    <signature file="src/agents/sars-agent/calculators/paye-calculator.ts">
      export class PAYECalculator {
        calculate(
          annualizedIncome: Decimal,
          taxTables: PAYETaxTables
        ): PAYEResult;

        private findTaxBracket(
          income: Decimal,
          brackets: TaxBracket[]
        ): TaxBracket;

        private applyRebates(
          tax: Decimal,
          rebates: Rebates
        ): Decimal;
      }
    </signature>
  </signatures>

  <constraints>
    - MUST use 2025 SARS tax tables exactly as published
    - MUST ALWAYS require human review (L2 autonomy)
    - MUST flag ALL uncertainties and edge cases
    - MUST use Decimal.js for all monetary calculations
    - MUST implement banker's rounding (ROUND_HALF_EVEN)
    - MUST validate employee tax numbers (10-digit format)
    - MUST cap UIF at R177.12 per month per employee
    - MUST check VAT registration threshold (R1M annual turnover)
    - MUST generate audit trail for all calculations
    - MUST NOT submit directly to SARS (export draft only)
  </constraints>

  <verification>
    - PAYE calculations match SARS examples for test cases
    - UIF correctly capped at R177.12/month per employee
    - VAT calculation matches manual verification
    - Agent flags missing employee tax numbers
    - Agent flags unusual deduction amounts
    - All calculations use banker's rounding
    - EMP201 draft return format valid
    - VAT201 draft return format valid
    - Human review always required (no auto-submission)
  </verification>
</definition_of_done>

<pseudo_code>
Agent Structure:
  src/agents/sars-agent/
    sars.agent.ts               # Main agent class
    calculators/
      paye-calculator.ts        # PAYE calculation logic
      uif-calculator.ts         # UIF calculation logic
      vat-calculator.ts         # VAT calculation logic
    validators/
      tax-number-validator.ts   # Validate SA tax numbers
      calculation-validator.ts  # Validate calculation results
    formatters/
      emp201-formatter.ts       # Format EMP201 return
      vat201-formatter.ts       # Format VAT201 return
    sars.module.ts              # NestJS module
    sars.service.ts             # Service for API layer

PAYE Calculation:
  async function calculatePAYE(period, payrollData):
    # 1. Load 2025 tax tables
    taxTables = await loadTaxTables('.claude/context/sars_tables_2025.json')

    # 2. Calculate PAYE per employee
    employeePAYE = []
    uncertainties = []

    for employee in payrollData:
      # Validate tax number
      if not isValidTaxNumber(employee.taxNumber):
        uncertainties.push({
          type: 'missing_tax_number',
          employee: employee.name,
          message: 'Employee tax number missing or invalid'
        })

      # Annualize gross income for tax bracket lookup
      annualIncome = employee.grossSalary.times(12)

      # Find applicable tax bracket
      bracket = findTaxBracket(annualIncome, taxTables.paye.taxBrackets)

      # Calculate annual tax
      taxableAmount = annualIncome.minus(bracket.threshold)
      annualTax = new Decimal(bracket.threshold).plus(
        taxableAmount.times(bracket.rate)
      )

      # Apply rebates (primary only for simplicity)
      annualTaxAfterRebate = annualTax.minus(taxTables.paye.rebates.primary)

      # Convert to monthly PAYE
      monthlyPAYE = annualTaxAfterRebate.dividedBy(12).round(2, Decimal.ROUND_HALF_EVEN)

      # Ensure non-negative
      monthlyPAYE = Decimal.max(monthlyPAYE, 0)

      employeePAYE.push({
        employeeId: employee.id,
        employeeName: employee.name,
        taxNumber: employee.taxNumber,
        grossSalary: employee.grossSalary,
        annualizedIncome: annualIncome,
        taxBracket: bracket,
        annualTax: annualTax,
        rebate: taxTables.paye.rebates.primary,
        monthlyPAYE: monthlyPAYE
      })

    # 3. Sum total PAYE
    totalPAYE = employeePAYE.reduce((sum, emp) =>
      sum.plus(emp.monthlyPAYE), new Decimal(0)
    )

    # 4. Return result with detailed breakdown
    return {
      period: period,
      employees: employeePAYE,
      totalPAYE: totalPAYE,
      uncertainties: uncertainties,
      requiresReview: true, # ALWAYS true
      breakdown: generatePAYEBreakdown(employeePAYE)
    }

UIF Calculation:
  async function calculateUIF(period, payrollData):
    # 1. Load UIF tables
    uifTables = await loadTaxTables('.claude/context/sars_tables_2025.json')
    UIF_RATE = uifTables.uif.rate # 0.01 (1%)
    MAX_MONTHLY = uifTables.uif.maxMonthlyEarnings # R17,712.00 in cents

    # 2. Calculate UIF per employee
    employeeUIF = []

    for employee in payrollData:
      # Cap earnings at R17,712
      cappedEarnings = Decimal.min(
        employee.grossSalary,
        Money.fromCents(MAX_MONTHLY)
      )

      # Employee contribution (1%)
      employeeContribution = cappedEarnings.times(UIF_RATE)
        .round(2, Decimal.ROUND_HALF_EVEN)

      # Employer contribution (1%)
      employerContribution = cappedEarnings.times(UIF_RATE)
        .round(2, Decimal.ROUND_HALF_EVEN)

      employeeUIF.push({
        employeeId: employee.id,
        employeeName: employee.name,
        grossSalary: employee.grossSalary,
        cappedEarnings: cappedEarnings,
        employeeContribution: employeeContribution,
        employerContribution: employerContribution,
        totalContribution: employeeContribution.plus(employerContribution)
      })

    # 3. Sum totals
    totalEmployeeUIF = employeeUIF.reduce((sum, emp) =>
      sum.plus(emp.employeeContribution), new Decimal(0)
    )
    totalEmployerUIF = employeeUIF.reduce((sum, emp) =>
      sum.plus(emp.employerContribution), new Decimal(0)
    )
    totalUIF = totalEmployeeUIF.plus(totalEmployerUIF)

    return {
      period: period,
      employees: employeeUIF,
      totalEmployeeUIF: totalEmployeeUIF,
      totalEmployerUIF: totalEmployerUIF,
      totalUIF: totalUIF,
      requiresReview: true
    }

VAT Calculation:
  async function calculateVAT(period, transactions):
    # 1. Load VAT rate
    vatTables = await loadTaxTables('.claude/context/sars_tables_2025.json')
    VAT_RATE = vatTables.vat.rate # 0.15
    REG_THRESHOLD = vatTables.vat.registrationThreshold # R1M in cents

    # 2. Query transactions for period
    outputTransactions = await mcpPostgresQuery(`
      SELECT * FROM transactions
      WHERE tenant_id = ? AND type = 'INVOICE'
      AND date BETWEEN ? AND ?
    `, [tenantId, period.startDate, period.endDate])

    inputTransactions = await mcpPostgresQuery(`
      SELECT * FROM transactions
      WHERE tenant_id = ? AND type = 'EXPENSE'
      AND date BETWEEN ? AND ?
    `, [tenantId, period.startDate, period.endDate])

    # 3. Calculate output VAT (sales)
    outputVAT = outputTransactions.reduce((sum, tx) => {
      vatAmount = tx.totalAmount.minus(tx.totalAmount.dividedBy(1.15))
        .round(2, Decimal.ROUND_HALF_EVEN)
      return sum.plus(vatAmount)
    }, new Decimal(0))

    # 4. Calculate input VAT (purchases)
    inputVAT = inputTransactions.reduce((sum, tx) => {
      vatAmount = tx.vatAmount || new Decimal(0)
      return sum.plus(vatAmount)
    }, new Decimal(0))

    # 5. Net VAT
    netVAT = outputVAT.minus(inputVAT)

    # 6. Check registration threshold
    annualTurnover = await calculateAnnualTurnover(tenantId)
    requiresRegistration = annualTurnover.greaterThan(Money.fromCents(REG_THRESHOLD))

    # 7. Flag uncertainties
    uncertainties = []
    if requiresRegistration:
      uncertainties.push({
        type: 'vat_registration_threshold',
        message: `Annual turnover R${annualTurnover.dividedBy(100).toFixed(2)} exceeds threshold`
      })

    return {
      period: period,
      outputVAT: outputVAT,
      inputVAT: inputVAT,
      netVAT: netVAT,
      annualTurnover: annualTurnover,
      requiresRegistration: requiresRegistration,
      uncertainties: uncertainties,
      requiresReview: true
    }

Generate EMP201:
  async function generateEMP201(period):
    payeCalc = await calculatePAYE(period, payrollData)
    uifCalc = await calculateUIF(period, payrollData)

    return {
      taxPeriod: formatTaxPeriod(period), # e.g., "202501" for Jan 2025
      paye: {
        totalEmployees: payeCalc.employees.length,
        totalPAYE: Money.toCents(payeCalc.totalPAYE),
        breakdown: payeCalc.breakdown
      },
      uif: {
        totalEmployeeUIF: Money.toCents(uifCalc.totalEmployeeUIF),
        totalEmployerUIF: Money.toCents(uifCalc.totalEmployerUIF),
        totalUIF: Money.toCents(uifCalc.totalUIF)
      },
      total: Money.toCents(
        payeCalc.totalPAYE.plus(uifCalc.totalUIF)
      ),
      uncertainties: [...payeCalc.uncertainties],
      requiresReview: true,
      generatedAt: new Date().toISOString()
    }

Tax Number Validation:
  function isValidTaxNumber(taxNumber):
    if not taxNumber:
      return false

    # SA tax numbers are 10 digits
    if not /^\d{10}$/.test(taxNumber):
      return false

    # Additional Luhn algorithm validation can be added
    return true
</pseudo_code>

<files_to_create>
  <file path="src/agents/sars-agent/sars.agent.ts">Main SARS agent class</file>
  <file path="src/agents/sars-agent/calculators/paye-calculator.ts">PAYE calculation logic</file>
  <file path="src/agents/sars-agent/calculators/uif-calculator.ts">UIF calculation logic</file>
  <file path="src/agents/sars-agent/calculators/vat-calculator.ts">VAT calculation logic</file>
  <file path="src/agents/sars-agent/validators/tax-number-validator.ts">Tax number validation</file>
  <file path="src/agents/sars-agent/validators/calculation-validator.ts">Validate calculation results</file>
  <file path="src/agents/sars-agent/formatters/emp201-formatter.ts">EMP201 return formatter</file>
  <file path="src/agents/sars-agent/formatters/vat201-formatter.ts">VAT201 return formatter</file>
  <file path="src/agents/sars-agent/sars.module.ts">NestJS module definition</file>
  <file path="src/agents/sars-agent/sars.service.ts">Service layer for API integration</file>
  <file path=".claude/agents/sars-agent/calculate-sars.md">Agent skill documentation</file>
  <file path="src/agents/sars-agent/interfaces/sars.interface.ts">TypeScript interfaces</file>
  <file path="tests/agents/sars-agent/paye-calculator.spec.ts">PAYE calculator tests</file>
  <file path="tests/agents/sars-agent/uif-calculator.spec.ts">UIF calculator tests</file>
  <file path="tests/agents/sars-agent/vat-calculator.spec.ts">VAT calculator tests</file>
  <file path="tests/agents/sars-agent/sars.agent.spec.ts">Agent integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">
    Import SarsModule
  </file>
  <file path="src/modules/sars/sars.service.ts">
    Inject and use SarsAgentService for calculations
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>PAYE calculations match official SARS examples (5 test cases)</criterion>
  <criterion>UIF correctly capped at R177.12/month per employee</criterion>
  <criterion>VAT calculation accuracy verified against manual calculations</criterion>
  <criterion>Agent always requires human review (requiresReview = true)</criterion>
  <criterion>Agent flags missing/invalid tax numbers</criterion>
  <criterion>Agent flags VAT registration threshold crossings</criterion>
  <criterion>All calculations use banker's rounding (ROUND_HALF_EVEN)</criterion>
  <criterion>EMP201 format matches SARS specification</criterion>
  <criterion>VAT201 format matches SARS specification</criterion>
  <criterion>Unit tests achieve >95% code coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- sars-agent</command>
  <command>npm run test:e2e -- agents/sars</command>
  <command>npm run lint</command>
  <command>npm run build</command>
</test_commands>

</task_spec>

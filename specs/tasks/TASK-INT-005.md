<task_spec id="TASK-INT-005" version="1.0">

<metadata>
  <title>E2E Reconciliation Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>62</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-032</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This is the FINAL end-to-end integration test for the CrecheBooks system. It tests
the complete bank reconciliation workflow including period selection, transaction
matching, discrepancy identification, and financial report generation. This test
MUST use real data from all previous flows (transactions, invoices, payments) to
validate the critical balance formula: Opening Balance + Money In - Money Out =
Closing Balance. This is the ultimate validation that the entire system maintains
financial integrity and accuracy.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#reconciliation_endpoints</file>
  <file purpose="requirements">specs/requirements/REQ-RECON.md</file>
  <file purpose="reconciliation_rules">specs/business-rules/reconciliation.md</file>
  <file purpose="test_data">specs/technical/test-data-requirements.md</file>
</input_context_files>

<prerequisites>
  <check>All Phase 3 reconciliation tasks completed</check>
  <check>Database with complete transaction history from previous tests</check>
  <check>Invoices and payments properly recorded</check>
  <check>Xero MCP mock server running</check>
  <check>Bank statement data for comparison</check>
</prerequisites>

<scope>
  <in_scope>
    - E2E test: Period selection and balance validation
    - E2E test: Match bank transactions to Xero transactions
    - E2E test: Identify discrepancies (in bank not Xero, vice versa)
    - E2E test: Balance formula validation (opening + in - out = closing)
    - E2E test: Mark matched transactions as reconciled
    - E2E test: Generate reconciliation report
    - E2E test: Income statement generation
    - E2E test: Balance sheet validation
    - Edge case: Reconciliation with discrepancies
    - Edge case: Unreconciled items from previous period
    - Edge case: Manual Xero entries not in bank
  </in_scope>
  <out_of_scope>
    - Real Xero integration (use mock)
    - Multi-currency reconciliation
    - Cash flow statement (future phase)
    - Budget vs actual reporting
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="tests/e2e/reconciliation-flow.e2e.spec.ts">
      describe('E2E: Reconciliation Flow', () => {
        it('validates opening balance matches previous closing');
        it('matches all bank transactions to Xero');
        it('identifies discrepancies correctly');
        it('validates balance formula (opening + in - out = closing)');
        it('marks matched transactions as reconciled');
        it('generates reconciliation report with details');
        it('generates income statement with accurate totals');
        it('handles discrepancies with clear explanations');
        it('prevents re-reconciliation of same period');
      });
    </signature>
  </signatures>

  <constraints>
    - MUST use real database with actual transaction data
    - MUST use real reconciliation logic (not mocked)
    - Balance formula MUST be exact to 2 decimal places
    - Discrepancies MUST be identified with reasons
    - Income statement MUST match reconciliation totals
    - Reconciled transactions MUST NOT be editable
    - NO mocks for internal services (ReconciliationService)
  </constraints>

  <verification>
    - npm run test:e2e -- reconciliation-flow.e2e.spec.ts passes
    - Balance formula validates correctly
    - All discrepancies identified and explained
    - Income statement totals match ledger
    - Reconciled transactions immutable
    - Report generation includes all required details
    - Financial integrity maintained across all flows
  </verification>
</definition_of_done>

<pseudo_code>
Test Setup:
  beforeAll:
    await app.init()
    testTenant = await createTestTenant({ vat_registered: true })
    testUser = await createTestUser(testTenant, 'OWNER')
    authToken = await getAuthToken(testUser)

    # Set up complete financial scenario for January 2025
    bankAccount = 'TEST-BANK-001'
    openingBalance = 50000.00 # R50,000 opening

    xeroMock = await startXeroMockServer()

Test Flow 1: Complete Financial Cycle Setup
  # Create comprehensive transaction set
  parent = await db.parent.create({
    data: { tenant_id: testTenant.id, first_name: 'John', last_name: 'Smith' }
  })

  # Enroll children and generate invoices
  child1 = await createChildWithEnrollment(parent.id, 3000_00)
  child2 = await createChildWithEnrollment(parent.id, 2000_00)

  await POST /invoices/generate { billing_month: '2025-01' }

  invoices = await db.invoice.findMany({
    where: { tenant_id: testTenant.id, billing_month: '2025-01' }
  })

  # Total invoiced (income)
  totalIncome = invoices.reduce((sum, inv) => sum + inv.total_cents, 0) / 100

  # Create bank transactions for invoice payments (money in)
  for (const invoice of invoices) {
    await db.transaction.create({
      data: {
        tenant_id: testTenant.id,
        bank_account: bankAccount,
        date: new Date('2025-01-10'),
        description: `Payment ${invoice.invoice_number}`,
        reference: invoice.invoice_number,
        payee_name: 'SMITH J',
        amount: invoice.total_cents / 100,
        is_credit: true,
        status: 'CATEGORIZED',
        is_reconciled: false,
        source: 'CSV_IMPORT'
      }
    })
  }

  # Create expense transactions (money out)
  expenses = [
    { description: 'Salaries', amount: -15000.00, account: '6500' },
    { description: 'Food supplies', amount: -3500.00, account: '6100' },
    { description: 'Utilities', amount: -2000.00, account: '6600' },
    { description: 'Rent', amount: -10000.00, account: '6800' },
    { description: 'Office supplies', amount: -1200.00, account: '6300' }
  ]

  totalExpenses = 0

  for (const expense of expenses) {
    await db.transaction.create({
      data: {
        tenant_id: testTenant.id,
        bank_account: bankAccount,
        date: new Date('2025-01-15'),
        description: expense.description,
        amount: expense.amount,
        is_credit: false,
        status: 'CATEGORIZED',
        is_reconciled: false,
        categorization: {
          account_code: expense.account,
          vat_type: 'STANDARD'
        },
        source: 'CSV_IMPORT'
      }
    })
    totalExpenses += Math.abs(expense.amount)
  }

  # Calculate expected closing balance
  expectedClosing = openingBalance + totalIncome - totalExpenses

  console.log(`Opening: R${openingBalance}`)
  console.log(`Income: R${totalIncome}`)
  console.log(`Expenses: R${totalExpenses}`)
  console.log(`Expected Closing: R${expectedClosing}`)

Test Flow 2: Perfect Reconciliation (No Discrepancies)
  # Run reconciliation for January 2025
  reconResponse = POST /reconciliation
    body: {
      bank_account: bankAccount,
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      opening_balance: openingBalance,
      closing_balance: expectedClosing
    }

  expect(reconResponse.status).toBe(201)

  recon = reconResponse.data
  expect(recon.status).toBe('RECONCILED')
  expect(recon.opening_balance).toBe(openingBalance)
  expect(recon.closing_balance).toBe(expectedClosing)

  # Verify calculated balance matches
  expect(recon.calculated_balance).toBeCloseTo(expectedClosing, 2)
  expect(recon.discrepancy).toBeCloseTo(0, 2)

  # Verify all transactions matched
  expect(recon.matched_count).toBe(invoices.length + expenses.length)
  expect(recon.unmatched_count).toBe(0)

  # Verify transactions marked as reconciled
  reconciledTxs = await db.transaction.findMany({
    where: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      is_reconciled: true
    }
  })

  expect(reconciledTxs.length).toBe(recon.matched_count)

Test Flow 3: Reconciliation with Discrepancies
  # Create new period with discrepancies (February 2025)
  febOpeningBalance = expectedClosing

  # Add transaction in bank but not in Xero (import issue)
  bankOnlyTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      date: new Date('2025-02-05'),
      description: 'Mystery deposit',
      amount: 500.00,
      is_credit: true,
      status: 'PENDING', # Not categorized yet
      is_reconciled: false,
      source: 'CSV_IMPORT'
    }
  })

  # Add manual Xero entry not in bank (pending transaction)
  xeroOnlyTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      date: new Date('2025-02-10'),
      description: 'Pending supplier payment',
      amount: -750.00,
      is_credit: false,
      status: 'CATEGORIZED',
      is_reconciled: false,
      source: 'MANUAL_ENTRY',
      is_in_xero: true,
      is_in_bank: false # Flag for testing
    }
  })

  # Calculate what closing SHOULD be (if both were included)
  febClosing = febOpeningBalance + 500.00 - 750.00

  # Run reconciliation
  febRecon = POST /reconciliation
    body: {
      bank_account: bankAccount,
      period_start: '2025-02-01',
      period_end: '2025-02-28',
      opening_balance: febOpeningBalance,
      closing_balance: febClosing
    }

  expect(febRecon.status).toBe(200) # Success but with discrepancies
  expect(febRecon.data.status).toBe('DISCREPANCY')

  # Verify discrepancies identified
  expect(febRecon.data.discrepancies.length).toBe(2)

  # Discrepancy 1: In bank, not in Xero
  bankDisc = febRecon.data.discrepancies.find(d =>
    d.type === 'IN_BANK_NOT_XERO'
  )
  expect(bankDisc).toBeDefined()
  expect(bankDisc.transaction_id).toBe(bankOnlyTx.id)
  expect(bankDisc.amount).toBe(500.00)
  expect(bankDisc.description).toContain('Mystery deposit')

  # Discrepancy 2: In Xero, not in bank
  xeroDisc = febRecon.data.discrepancies.find(d =>
    d.type === 'IN_XERO_NOT_BANK'
  )
  expect(xeroDisc).toBeDefined()
  expect(xeroDisc.transaction_id).toBe(xeroOnlyTx.id)
  expect(xeroDisc.amount).toBe(-750.00)
  expect(xeroDisc.description).toContain('Pending supplier payment')

Test Flow 4: Balance Formula Validation
  # Verify the critical formula: opening + in - out = closing

  # Get all credits (money in) for January
  januaryCredits = await db.transaction.findMany({
    where: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      date: { gte: '2025-01-01', lte: '2025-01-31' },
      is_credit: true,
      is_reconciled: true
    }
  })

  totalCredits = januaryCredits.reduce((sum, tx) =>
    sum + tx.amount_cents, 0
  ) / 100

  # Get all debits (money out)
  januaryDebits = await db.transaction.findMany({
    where: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      date: { gte: '2025-01-01', lte: '2025-01-31' },
      is_credit: false,
      is_reconciled: true
    }
  })

  totalDebits = Math.abs(januaryDebits.reduce((sum, tx) =>
    sum + tx.amount_cents, 0
  ) / 100)

  # Formula validation
  calculatedClosing = openingBalance + totalCredits - totalDebits

  expect(calculatedClosing).toBeCloseTo(expectedClosing, 2)

  # Verify reconciliation record matches
  janRecon = await db.reconciliation.findFirst({
    where: {
      tenant_id: testTenant.id,
      bank_account: bankAccount,
      period_start: '2025-01-01'
    }
  })

  expect(janRecon.opening_balance_cents / 100).toBe(openingBalance)
  expect(janRecon.total_credits_cents / 100).toBeCloseTo(totalCredits, 2)
  expect(janRecon.total_debits_cents / 100).toBeCloseTo(totalDebits, 2)
  expect(janRecon.closing_balance_cents / 100).toBeCloseTo(expectedClosing, 2)

Test Flow 5: Income Statement Generation
  # Generate income statement for January 2025
  incomeStmt = GET /reports/income-statement
    params: {
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      format: 'json'
    }

  expect(incomeStmt.status).toBe(200)

  report = incomeStmt.data

  # Verify income section
  expect(report.income.total).toBeCloseTo(totalIncome, 2)

  schoolFeesIncome = report.income.breakdown.find(item =>
    item.account.includes('School Fees')
  )
  expect(schoolFeesIncome).toBeDefined()
  expect(schoolFeesIncome.amount).toBeCloseTo(totalIncome, 2)

  # Verify expense section
  expect(report.expenses.total).toBeCloseTo(totalExpenses, 2)

  for (const expense of expenses) {
    matchingExpense = report.expenses.breakdown.find(item =>
      item.account.includes(expense.description)
    )
    # May be aggregated, so check exists
    expect(report.expenses.breakdown.some(item =>
      Math.abs(item.amount - Math.abs(expense.amount)) < 0.01
    )).toBe(true)
  }

  # Verify net profit
  expectedProfit = totalIncome - totalExpenses
  expect(report.net_profit).toBeCloseTo(expectedProfit, 2)

Test Flow 6: Balance Sheet Validation
  # Balance sheet as of end of January
  balanceSheet = GET /reports/balance-sheet
    params: {
      as_of_date: '2025-01-31',
      format: 'json'
    }

  expect(balanceSheet.status).toBe(200)

  bs = balanceSheet.data

  # Verify bank account balance
  bankAsset = bs.assets.current.find(a =>
    a.account.includes('Bank')
  )
  expect(bankAsset.amount).toBeCloseTo(expectedClosing, 2)

  # Verify accounts receivable (unpaid invoices)
  unpaidInvoices = await db.invoice.findMany({
    where: {
      tenant_id: testTenant.id,
      status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] }
    }
  })

  totalAR = unpaidInvoices.reduce((sum, inv) =>
    sum + (inv.total_cents - inv.amount_paid_cents), 0
  ) / 100

  arAsset = bs.assets.current.find(a =>
    a.account.includes('Accounts Receivable')
  )
  expect(arAsset.amount).toBeCloseTo(totalAR, 2)

  # Verify equity section includes profit
  retainedEarnings = bs.equity.find(e =>
    e.account.includes('Retained Earnings')
  )
  expect(retainedEarnings.amount).toBeCloseTo(expectedProfit, 2)

Test Flow 7: Prevent Re-Reconciliation
  # Attempt to reconcile January again
  duplicateRecon = POST /reconciliation
    body: {
      bank_account: bankAccount,
      period_start: '2025-01-01',
      period_end: '2025-01-31',
      opening_balance: openingBalance,
      closing_balance: expectedClosing
    }

  expect(duplicateRecon.status).toBe(409)
  expect(duplicateRecon.error.message).toContain('already reconciled')

Test Flow 8: Reconciled Transactions Immutability
  # Attempt to edit reconciled transaction
  reconciledTx = reconciledTxs[0]

  editAttempt = PUT /transactions/{reconciledTx.id}/categorize
    body: {
      account_code: '9999' # Try to change
    }

  expect(editAttempt.status).toBe(409)
  expect(editAttempt.error.message).toContain('reconciled')

  # Verify transaction unchanged
  unchangedTx = await db.transaction.findUnique({
    where: { id: reconciledTx.id }
  })

  expect(unchangedTx.categorization.account_code).toBe(
    reconciledTx.categorization.account_code
  )

Test Flow 9: Monthly Rollover Validation
  # Verify February opening equals January closing
  marchRecon = POST /reconciliation
    body: {
      bank_account: bankAccount,
      period_start: '2025-03-01',
      period_end: '2025-03-31',
      opening_balance: febClosing, # Should equal Feb closing
      closing_balance: febClosing + 1000 # Some activity
    }

  # System should validate opening matches previous closing
  # If mismatched, should warn user

  # Get previous reconciliation
  previousRecon = await db.reconciliation.findFirst({
    where: {
      bank_account: bankAccount,
      period_end: '2025-02-28'
    }
  })

  if (previousRecon && previousRecon.closing_balance_cents / 100 !== febClosing) {
    expect(marchRecon.data.warnings).toContain(
      'Opening balance does not match previous period closing'
    )
  }

Test Flow 10: Comprehensive Financial Integrity Check
  # Final validation: Entire system maintains balance

  # Get all reconciliations
  allRecons = await db.reconciliation.findMany({
    where: { tenant_id: testTenant.id },
    orderBy: { period_start: 'asc' }
  })

  # Chain validation
  for (let i = 0; i < allRecons.length - 1; i++) {
    current = allRecons[i]
    next = allRecons[i + 1]

    # Current closing should equal next opening
    expect(current.closing_balance_cents).toBe(next.opening_balance_cents)
  }

  # Verify all invoices accounted for
  allInvoices = await db.invoice.findMany({
    where: { tenant_id: testTenant.id }
  })

  totalInvoiced = allInvoices.reduce((sum, inv) =>
    sum + inv.total_cents, 0
  ) / 100

  # Verify all payments accounted for
  allPayments = await db.payment.findMany({
    where: { tenant_id: testTenant.id }
  })

  totalPaid = allPayments.reduce((sum, pay) =>
    sum + pay.amount_cents, 0
  ) / 100

  # Outstanding = Invoiced - Paid
  outstanding = totalInvoiced - totalPaid

  # Should match AR from balance sheet
  expect(outstanding).toBeCloseTo(totalAR, 2)

  console.log('\n=== FINANCIAL INTEGRITY VERIFIED ===')
  console.log(`Total Invoiced: R${totalInvoiced.toFixed(2)}`)
  console.log(`Total Paid: R${totalPaid.toFixed(2)}`)
  console.log(`Outstanding AR: R${outstanding.toFixed(2)}`)
  console.log(`All reconciliations balanced: ✓`)
  console.log(`System integrity: PASS`)

Test Teardown:
  afterAll:
    await xeroMock.stop()
    await db.reconciliation.deleteMany({ tenant_id: testTenant.id })
    await db.payment.deleteMany({ tenant_id: testTenant.id })
    await db.transaction.deleteMany({ tenant_id: testTenant.id })
    await db.invoice.deleteMany({ tenant_id: testTenant.id })
    await db.enrollment.deleteMany({ tenant_id: testTenant.id })
    await db.child.deleteMany({ tenant_id: testTenant.id })
    await db.parent.deleteMany({ tenant_id: testTenant.id })
    await db.tenant.delete({ where: { id: testTenant.id } })
    await app.close()

    console.log('\n🎉 ALL 62 TASKS COMPLETE - SYSTEM VALIDATED 🎉')
</pseudo_code>

<files_to_create>
  <file path="tests/e2e/reconciliation-flow.e2e.spec.ts">Complete E2E test suite</file>
  <file path="tests/fixtures/reconciliation/bank-statements-full-month.csv">Complete month bank data</file>
  <file path="tests/helpers/balance-validators.ts">Balance formula validation helpers</file>
  <file path="tests/helpers/financial-integrity-checker.ts">System-wide integrity validation</file>
  <file path="tests/e2e/INTEGRATION_SUMMARY.md">Summary of all integration tests</file>
</files_to_create>

<files_to_modify>
  <!-- No existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>All test cases pass without skips or failures</criterion>
  <criterion>Balance formula validates exactly (opening + in - out = closing)</criterion>
  <criterion>All discrepancies identified with clear explanations</criterion>
  <criterion>Reconciled transactions are immutable</criterion>
  <criterion>Cannot re-reconcile same period</criterion>
  <criterion>Income statement totals match reconciliation</criterion>
  <criterion>Balance sheet assets equal liabilities + equity</criterion>
  <criterion>Period rollovers maintain continuity</criterion>
  <criterion>System-wide financial integrity verified</criterion>
  <criterion>All 62 tasks successfully validated</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- reconciliation-flow.e2e.spec.ts</command>
  <command>npm run test:e2e -- reconciliation-flow.e2e.spec.ts --verbose</command>
  <command>npm run test:e2e -- --verbose</command>
</test_commands>

</task_spec>

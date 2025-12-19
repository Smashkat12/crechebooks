<task_spec id="TASK-INT-004" version="1.0">

<metadata>
  <title>E2E SARS Submission Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>61</sequence>
  <implements>
    <requirement_ref>REQ-SARS-003</requirement_ref>
    <requirement_ref>REQ-SARS-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This is a complete end-to-end integration test for the SARS tax submission workflow.
It tests the entire user journey from data collection through calculations, document
generation, review, and final submission for both VAT201 and EMP201 forms. This test
MUST use real data and real system components - no mocks except for the SARS eFiling
service itself. The test validates complex tax calculations, immutability after
submission, and proper handling of various VAT scenarios (standard, zero-rated, exempt).
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#sars_endpoints</file>
  <file purpose="requirements">specs/requirements/REQ-SARS.md</file>
  <file purpose="tax_rules">specs/business-rules/sars-tax-calculations.md</file>
  <file purpose="test_data">specs/technical/test-data-requirements.md</file>
</input_context_files>

<prerequisites>
  <check>All Phase 3 SARS tasks completed</check>
  <check>Database seeded with test tenant (VAT registered)</check>
  <check>Invoices and transactions with VAT data</check>
  <check>Payroll records for EMP201 testing</check>
  <check>SARS agent accessible for calculations</check>
  <check>Current tax tables loaded (PAYE, UIF, SDL rates)</check>
</prerequisites>

<scope>
  <in_scope>
    - E2E test: VAT201 data collection (output and input VAT)
    - E2E test: VAT201 calculations with distinctions (standard, zero-rated, exempt)
    - E2E test: VAT201 document generation
    - E2E test: VAT201 review and approval flow
    - E2E test: VAT201 submission and immutability
    - E2E test: EMP201 payroll data collection
    - E2E test: EMP201 calculations (PAYE, UIF, SDL)
    - E2E test: EMP201 document generation
    - E2E test: EMP201 submission and immutability
    - Edge case: Missing VAT details flagged for review
    - Edge case: Attempt to edit submitted return (must fail)
    - Edge case: Zero-rated vs exempt distinction
  </in_scope>
  <out_of_scope>
    - Real SARS eFiling integration (use mock)
    - IRP5/IT3 certificate generation
    - Annual tax submissions
    - Tax amendments (future phase)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="tests/e2e/sars-submission.e2e.spec.ts">
      describe('E2E: SARS Submission Flow', () => {
        it('generates VAT201 with correct output VAT');
        it('calculates input VAT from categorized expenses');
        it('distinguishes zero-rated and exempt supplies');
        it('flags transactions missing VAT details');
        it('generates VAT201 PDF document');
        it('prevents editing after submission');
        it('generates EMP201 with PAYE calculations');
        it('calculates UIF with proper capping');
        it('generates EMP201 PDF document');
        it('marks submission as finalized (immutable)');
      });
    </signature>
  </signatures>

  <constraints>
    - MUST use real database (not in-memory)
    - MUST use real SARS agent for calculations (not mocked)
    - VAT calculations MUST be exact to 2 decimal places
    - PAYE calculations MUST use current tax tables
    - UIF MUST be capped at legislated maximum
    - Submitted returns MUST be immutable (database constraint)
    - Zero-rated vs exempt MUST be clearly distinguished
    - NO mocks for internal services (SarsService, calculations)
  </constraints>

  <verification>
    - npm run test:e2e -- sars-submission.e2e.spec.ts passes
    - VAT calculations match manual verification
    - PAYE calculations match SARS tax tables
    - Generated PDFs contain all required information
    - Immutability enforced at database level
    - Attempt to edit submitted return throws error
    - Zero-rated and exempt items correctly classified
  </verification>
</definition_of_done>

<pseudo_code>
Test Setup:
  beforeAll:
    await app.init()
    testTenant = await createTestTenant({
      vat_registered: true,
      vat_number: 'VAT4123456789',
      vat_rate: 0.15,
      registration_date: '2024-01-01'
    })
    testUser = await createTestUser(testTenant, 'OWNER')
    authToken = await getAuthToken(testUser)

    # Seed tax tables
    await seedTaxTables({
      year: 2025,
      paye_brackets: [...], # Current SARS tax brackets
      uif_rate: 0.01, # 1% employee + 1% employer
      uif_cap_monthly: 17712_00, # R177.12 max per month
      sdl_rate: 0.01, # 1% of total payroll
      sdl_threshold: 500000_00 # R500k annual payroll threshold
    })

Test Flow 1: VAT201 - Data Collection
  # Create invoices (output VAT)
  parent = await db.parent.create({
    data: { tenant_id: testTenant.id, first_name: 'Test', last_name: 'Parent' }
  })

  child = await createChildWithEnrollment(parent.id, 3000_00)

  # Generate invoices for January 2025
  await POST /invoices/generate { billing_month: '2025-01' }

  invoices = await db.invoice.findMany({
    where: {
      tenant_id: testTenant.id,
      billing_month: '2025-01'
    }
  })

  # Mark all as sent (output tax applicable)
  await db.invoice.updateMany({
    where: { id: { in: invoices.map(i => i.id) } },
    data: { status: 'SENT' }
  })

  # Calculate expected output VAT
  totalInvoiced = invoices.reduce((sum, inv) => sum + inv.subtotal_cents, 0)
  expectedOutputVat = Math.round(totalInvoiced * 0.15) / 100

Test Flow 2: VAT201 - Input VAT from Expenses
  # Create categorized expense transactions with VAT

  # Standard-rated expense
  standardExpense = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-10'),
      description: 'Office supplies (VAT inclusive)',
      amount: -1150.00, # R1000 + R150 VAT
      is_credit: false,
      status: 'CATEGORIZED',
      categorization: {
        account_code: '6300',
        vat_type: 'STANDARD',
        vat_amount_cents: 150_00
      }
    }
  })

  # Zero-rated expense (exports, basic foods)
  zeroRatedExpense = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-15'),
      description: 'Brown bread and vegetables',
      amount: -500.00,
      is_credit: false,
      status: 'CATEGORIZED',
      categorization: {
        account_code: '6100',
        vat_type: 'ZERO_RATED',
        vat_amount_cents: 0
      }
    }
  })

  # Exempt expense (financial services)
  exemptExpense = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-20'),
      description: 'Bank charges',
      amount: -100.00,
      is_credit: false,
      status: 'CATEGORIZED',
      categorization: {
        account_code: '6700',
        vat_type: 'EXEMPT',
        vat_amount_cents: 0
      }
    }
  })

  # Expense missing VAT details (should be flagged)
  missingVatExpense = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-25'),
      description: 'Supplier payment - no VAT number',
      amount: -2300.00,
      is_credit: false,
      status: 'CATEGORIZED',
      categorization: {
        account_code: '6200',
        vat_type: 'STANDARD',
        vat_amount_cents: null # Missing!
      }
    }
  })

  expectedInputVat = 150.00 # Only from standard-rated expense

Test Flow 3: VAT201 Generation
  # Generate VAT201 for January 2025
  vat201Response = POST /sars/vat201
    body: {
      period_start: '2025-01-01',
      period_end: '2025-01-31'
    }

  expect(vat201Response.status).toBe(201)

  vat201 = vat201Response.data
  expect(vat201.submission_type).toBe('VAT201')
  expect(vat201.period).toBe('2025-01')
  expect(vat201.status).toBe('DRAFT')

  # Verify calculations
  expect(vat201.output_vat).toBeCloseTo(expectedOutputVat, 2)
  expect(vat201.input_vat).toBeCloseTo(expectedInputVat, 2)

  netVat = expectedOutputVat - expectedInputVat
  expect(vat201.net_vat).toBeCloseTo(netVat, 2)

  # Verify items flagged for review
  expect(vat201.items_requiring_review.length).toBe(1)
  flaggedItem = vat201.items_requiring_review[0]
  expect(flaggedItem.transaction_id).toBe(missingVatExpense.id)
  expect(flaggedItem.issue).toContain('Missing VAT')

Test Flow 4: VAT201 Document Verification
  # Retrieve generated document
  documentResponse = GET /sars/vat201/{vat201.id}/document

  expect(documentResponse.status).toBe(200)
  expect(documentResponse.headers['content-type']).toBe('application/pdf')

  # Verify document stored in database
  submission = await db.sarsSubmission.findUnique({
    where: { id: vat201.id },
    include: { line_items: true }
  })

  expect(submission.document_path).toBeDefined()
  expect(submission.line_items.length).toBeGreaterThan(0)

  # Verify line items breakdown
  standardSupplies = submission.line_items.find(li =>
    li.description === 'Standard-rated supplies'
  )
  expect(standardSupplies.amount_cents).toBe(totalInvoiced)
  expect(standardSupplies.vat_cents).toBe(Math.round(expectedOutputVat * 100))

  zeroRatedSupplies = submission.line_items.find(li =>
    li.description === 'Zero-rated supplies'
  )
  expect(zeroRatedSupplies.amount_cents).toBe(0) # No zero-rated income

  exemptSupplies = submission.line_items.find(li =>
    li.description === 'Exempt supplies'
  )
  expect(exemptSupplies.amount_cents).toBe(0) # No exempt income

Test Flow 5: VAT201 Submission and Immutability
  # Mark as ready for submission
  await db.sarsSubmission.update({
    where: { id: vat201.id },
    data: { status: 'READY' }
  })

  # Submit to SARS
  submitResponse = POST /sars/{vat201.id}/submit
    body: {
      sars_reference: 'SARS-REF-12345',
      submitted_date: '2025-02-07'
    }

  expect(submitResponse.status).toBe(200)
  expect(submitResponse.data.status).toBe('SUBMITTED')
  expect(submitResponse.data.is_finalized).toBe(true)

  # Verify immutability - attempt to edit should fail
  editAttempt = await db.sarsSubmission.update({
    where: { id: vat201.id },
    data: { net_vat_cents: 0 } # Try to change calculation
  }).catch(error => error)

  expect(editAttempt).toBeInstanceOf(Error)
  expect(editAttempt.message).toContain('immutable')

  # Verify cannot submit again
  resubmitAttempt = POST /sars/{vat201.id}/submit
    body: { submitted_date: '2025-02-08' }

  expect(resubmitAttempt.status).toBe(409)
  expect(resubmitAttempt.error.message).toContain('Already submitted')

Test Flow 6: EMP201 - Payroll Data Setup
  # Create employees
  employee1 = await db.employee.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'Jane',
      last_name: 'Teacher',
      id_number: '8505120123084',
      tax_number: 'TAX1234567890',
      monthly_salary_cents: 15000_00, # R15,000
      uif_eligible: true,
      start_date: '2024-06-01'
    }
  })

  employee2 = await db.employee.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'John',
      last_name: 'Assistant',
      id_number: '9203155678091',
      tax_number: 'TAX9876543210',
      monthly_salary_cents: 8000_00, # R8,000
      uif_eligible: true,
      start_date: '2024-09-01'
    }
  })

  # Create payroll records for January 2025
  payroll1 = await db.payroll.create({
    data: {
      tenant_id: testTenant.id,
      employee_id: employee1.id,
      pay_period: '2025-01',
      gross_salary_cents: 15000_00,
      paye_cents: null, # To be calculated
      uif_employee_cents: null,
      uif_employer_cents: null,
      net_pay_cents: null
    }
  })

  payroll2 = await db.payroll.create({
    data: {
      tenant_id: testTenant.id,
      employee_id: employee2.id,
      pay_period: '2025-01',
      gross_salary_cents: 8000_00,
      paye_cents: null,
      uif_employee_cents: null,
      uif_employer_cents: null,
      net_pay_cents: null
    }
  })

Test Flow 7: EMP201 Generation with Calculations
  # Generate EMP201 for January 2025
  emp201Response = POST /sars/emp201
    body: {
      period_month: '2025-01'
    }

  expect(emp201Response.status).toBe(201)

  emp201 = emp201Response.data
  expect(emp201.submission_type).toBe('EMP201')
  expect(emp201.period).toBe('2025-01')
  expect(emp201.status).toBe('DRAFT')
  expect(emp201.employee_count).toBe(2)

  # Verify PAYE calculations
  # Employee 1: R15,000/month = R180,000/year
  # Tax bracket (2025): R95,750 - R365,000 @ 31% - R14,975
  # Monthly: (180000 * 0.31 - 14975) / 12 = R3,434.58
  expectedPaye1 = 3434.58

  # Employee 2: R8,000/month = R96,000/year
  # Tax bracket: R95,750 - R365,000 @ 31% - R14,975
  # Monthly: (96000 * 0.31 - 14975) / 12 = R1,230.83
  expectedPaye2 = 1230.83

  totalPaye = expectedPaye1 + expectedPaye2
  expect(emp201.total_paye).toBeCloseTo(totalPaye, 2)

  # Verify UIF calculations (1% employee + 1% employer, capped)
  # Employee 1: R15,000 * 0.01 = R150 (employee) + R150 (employer) = R300
  uif1 = 150.00 * 2

  # Employee 2: R8,000 * 0.01 = R80 + R80 = R160
  uif2 = 80.00 * 2

  totalUif = uif1 + uif2
  expect(emp201.total_uif).toBeCloseTo(totalUif, 2)

  # Verify SDL (Skills Development Levy)
  # Only applies if annual payroll > R500k
  # Total monthly: R23,000, annual: R276,000 (below threshold)
  expect(emp201.total_sdl).toBe(0)

  # Verify payroll records updated
  updatedPayroll1 = await db.payroll.findUnique({ where: { id: payroll1.id } })
  expect(updatedPayroll1.paye_cents / 100).toBeCloseTo(expectedPaye1, 2)
  expect(updatedPayroll1.uif_employee_cents / 100).toBe(150.00)
  expect(updatedPayroll1.uif_employer_cents / 100).toBe(150.00)

Test Flow 8: EMP201 with SDL Calculation
  # Add high-earning employee to trigger SDL
  employee3 = await db.employee.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'Executive',
      last_name: 'Director',
      id_number: '7512105432198',
      tax_number: 'TAX5555555555',
      monthly_salary_cents: 30000_00, # R30,000
      uif_eligible: false, # High earners often opt out
      start_date: '2024-01-01'
    }
  })

  await db.payroll.create({
    data: {
      tenant_id: testTenant.id,
      employee_id: employee3.id,
      pay_period: '2025-01',
      gross_salary_cents: 30000_00
    }
  })

  # Re-generate EMP201 with all employees
  # Total monthly now: R53,000, annual: R636,000 (above R500k threshold)
  emp201v2Response = POST /sars/emp201
    body: {
      period_month: '2025-01'
    }

  emp201v2 = emp201v2Response.data

  # SDL: 1% of total payroll
  expectedSdl = 53000 * 0.01
  expect(emp201v2.total_sdl).toBeCloseTo(expectedSdl, 2)

Test Flow 9: EMP201 Document and Submission
  # Retrieve EMP201 document
  emp201Doc = GET /sars/emp201/{emp201v2.id}/document

  expect(emp201Doc.status).toBe(200)
  expect(emp201Doc.headers['content-type']).toBe('application/pdf')

  # Mark as ready and submit
  await db.sarsSubmission.update({
    where: { id: emp201v2.id },
    data: { status: 'READY' }
  })

  submitEmp = POST /sars/{emp201v2.id}/submit
    body: {
      sars_reference: 'EMP-REF-67890',
      submitted_date: '2025-02-07'
    }

  expect(submitEmp.status).toBe(200)
  expect(submitEmp.data.is_finalized).toBe(true)

  # Verify immutability
  finalSubmission = await db.sarsSubmission.findUnique({
    where: { id: emp201v2.id }
  })

  expect(finalSubmission.status).toBe('SUBMITTED')
  expect(finalSubmission.is_finalized).toBe(true)
  expect(finalSubmission.submitted_at).toBeDefined()

Test Flow 10: Edge Case - UIF Capping
  # Create employee with salary above UIF cap
  # UIF calculated on first R17,712/month only
  highEarner = await db.employee.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'High',
      last_name: 'Earner',
      monthly_salary_cents: 50000_00, # R50,000
      uif_eligible: true
    }
  })

  await db.payroll.create({
    data: {
      tenant_id: testTenant.id,
      employee_id: highEarner.id,
      pay_period: '2025-02',
      gross_salary_cents: 50000_00
    }
  })

  # Generate EMP201 for February
  febEmp201 = POST /sars/emp201
    body: { period_month: '2025-02' }

  # Verify UIF capped at R177.12 per month (R17,712 * 1%)
  # Employee + Employer = R177.12 * 2 = R354.24
  febPayroll = await db.payroll.findFirst({
    where: { employee_id: highEarner.id, pay_period: '2025-02' }
  })

  expect(febPayroll.uif_employee_cents / 100).toBe(177.12)
  expect(febPayroll.uif_employer_cents / 100).toBe(177.12)

Test Flow 11: Audit Trail Verification
  # Verify all submissions have audit trail
  allSubmissions = await db.sarsSubmission.findMany({
    where: { tenant_id: testTenant.id },
    include: { audit_logs: true }
  })

  for (const submission of allSubmissions) {
    # Created log
    createLog = submission.audit_logs.find(log => log.action === 'CREATED')
    expect(createLog).toBeDefined()

    if (submission.status === 'SUBMITTED') {
      # Submitted log
      submitLog = submission.audit_logs.find(log => log.action === 'SUBMITTED')
      expect(submitLog).toBeDefined()
      expect(submitLog.user_id).toBe(testUser.id)
      expect(submitLog.details).toContain('SARS reference')
    }
  }

Test Teardown:
  afterAll:
    await db.payroll.deleteMany({ tenant_id: testTenant.id })
    await db.employee.deleteMany({ tenant_id: testTenant.id })
    await db.sarsSubmission.deleteMany({ tenant_id: testTenant.id })
    await db.transaction.deleteMany({ tenant_id: testTenant.id })
    await db.invoice.deleteMany({ tenant_id: testTenant.id })
    await db.tenant.delete({ where: { id: testTenant.id } })
    await app.close()
</pseudo_code>

<files_to_create>
  <file path="tests/e2e/sars-submission.e2e.spec.ts">Complete E2E test suite</file>
  <file path="tests/fixtures/sars/tax-tables-2025.json">Current SARS tax tables</file>
  <file path="tests/helpers/sars-calculators.ts">Expected calculation helpers</file>
  <file path="tests/helpers/payroll-generators.ts">Test payroll data creation</file>
  <file path="tests/fixtures/sars/vat-scenarios.json">Various VAT test scenarios</file>
</files_to_create>

<files_to_modify>
  <!-- No existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>All test cases pass without skips or failures</criterion>
  <criterion>VAT calculations match manual verification to 2 decimals</criterion>
  <criterion>PAYE calculations match SARS tax tables</criterion>
  <criterion>UIF properly capped at R177.12 per month</criterion>
  <criterion>SDL only applied when threshold exceeded</criterion>
  <criterion>Zero-rated and exempt correctly distinguished</criterion>
  <criterion>Missing VAT details flagged for review</criterion>
  <criterion>Submitted returns are immutable (database enforced)</criterion>
  <criterion>Generated PDFs contain all required information</criterion>
  <criterion>Audit trail complete for all submissions</criterion>
  <criterion>Cannot resubmit already submitted return</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- sars-submission.e2e.spec.ts</command>
  <command>npm run test:e2e -- sars-submission.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>

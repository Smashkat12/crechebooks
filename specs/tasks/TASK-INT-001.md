<task_spec id="TASK-INT-001" version="1.0">

<metadata>
  <title>E2E Transaction Categorization Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>58</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This is a complete end-to-end integration test for the transaction categorization workflow.
It tests the entire user journey from importing bank statements through AI-powered
categorization, manual corrections, pattern learning, and final synchronization with Xero.
This test MUST use real data and real system components - no mocks or stubs allowed except
for external services (bank APIs, Xero). The test validates the 95% accuracy target and
ensures all edge cases are properly handled.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#transaction_endpoints</file>
  <file purpose="test_data">specs/technical/test-data-requirements.md</file>
  <file purpose="requirements">specs/requirements/REQ-TRANS.md</file>
  <file purpose="service_contracts">specs/technical/api-contracts.md#component_contracts</file>
</input_context_files>

<prerequisites>
  <check>All Phase 3 transaction tasks completed</check>
  <check>Database seeded with test tenant and Chart of Accounts</check>
  <check>Claude Code agent accessible for AI categorization</check>
  <check>Xero MCP mock server running for sync operations</check>
  <check>Test CSV files with diverse transaction scenarios</check>
</prerequisites>

<scope>
  <in_scope>
    - E2E test: CSV import → parsing → storage
    - E2E test: AI categorization with confidence scoring
    - E2E test: Manual corrections and pattern creation
    - E2E test: Split transactions with VAT allocation
    - E2E test: Xero synchronization of categorized transactions
    - Edge case: Blank/minimal descriptions
    - Edge case: Duplicate transaction detection
    - Edge case: Split transaction validation
    - Performance: Batch categorization of 100+ transactions
    - Accuracy validation: 95% auto-categorization target
  </in_scope>
  <out_of_scope>
    - Real Xero integration (use mock)
    - Real bank API integration (use test files)
    - Unit tests for individual components (covered in Phase 2/3)
    - Performance optimization (future phase)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="tests/e2e/transaction-flow.e2e.spec.ts">
      describe('E2E: Transaction Categorization Flow', () => {
        it('imports CSV with diverse transactions');
        it('AI categorizes with 95%+ confidence on known patterns');
        it('flags low-confidence for manual review');
        it('learns from manual corrections');
        it('handles blank descriptions gracefully');
        it('detects and prevents duplicates');
        it('validates split transaction amounts');
        it('syncs categorized transactions to Xero');
      });
    </signature>
  </signatures>

  <constraints>
    - MUST use real database (not in-memory)
    - MUST use real Claude Code agent (not mocked)
    - MUST test with minimum 100 transactions
    - MUST achieve 95% auto-categorization rate on second run (after learning)
    - MUST complete full flow in under 5 minutes
    - Split transaction amounts MUST equal parent transaction
    - Duplicate detection MUST be 100% accurate
    - NO mocks for internal services (TransactionService, AI agent)
  </constraints>

  <verification>
    - npm run test:e2e -- transaction-flow.e2e.spec.ts passes
    - Test creates real database records
    - Test makes real AI categorization calls
    - Test output shows categorization statistics
    - 95% accuracy achieved on pattern-trained data
    - All edge cases properly handled with clear error messages
    - Xero mock receives correct sync payloads
  </verification>
</definition_of_done>

<pseudo_code>
Test Setup:
  beforeAll:
    await app.init()
    testTenant = await createTestTenant({ vat_registered: true })
    testUser = await createTestUser(testTenant, 'OWNER')
    authToken = await getAuthToken(testUser)
    chartOfAccounts = await seedChartOfAccounts(testTenant)
    xeroMock = await startXeroMockServer()

Test Flow 1: Basic Import and Categorization
  # Step 1: Import CSV
  testFile = loadTestData('transactions/diverse-100.csv')
  response = POST /transactions/import
    headers: { Authorization: `Bearer ${authToken}` }
    body: { file: testFile, source: 'CSV_IMPORT', bank_account: 'TEST-BANK-001' }

  expect(response.status).toBe(202)
  importId = response.data.import_id

  # Wait for import processing
  await waitForImportComplete(importId, timeout: 30000)

  # Verify import
  transactions = GET /transactions?page=1&limit=100
  expect(transactions.data.length).toBe(100)
  expect(transactions.data.every(t => t.status === 'PENDING')).toBe(true)

  # Step 2: Trigger AI Categorization
  categorizeResponse = POST /transactions/categorize/batch
    body: { transaction_ids: [], force_recategorize: false }

  expect(categorizeResponse.status).toBe(202)
  jobId = categorizeResponse.data.job_id

  # Wait for categorization
  await waitForJobComplete(jobId, timeout: 120000)

  # Verify categorization results
  categorized = GET /transactions?status=CATEGORIZED
  reviewRequired = GET /transactions?status=REVIEW_REQUIRED

  expect(categorized.meta.total + reviewRequired.meta.total).toBe(100)

  # Calculate accuracy (first run, no patterns)
  autoRate = categorized.meta.total / 100
  expect(autoRate).toBeGreaterThan(0.70) # At least 70% on first run

Test Flow 2: Manual Correction and Pattern Learning
  # Step 3: Manual correction of low-confidence transaction
  reviewTx = reviewRequired.data[0]

  correctionResponse = PUT /transactions/{reviewTx.id}/categorize
    body: {
      account_code: '6100', # Food and Provisions
      create_pattern: true
    }

  expect(correctionResponse.status).toBe(200)
  expect(correctionResponse.data.pattern_created).toBe(true)

  # Verify pattern stored in database
  pattern = await db.payeePattern.findOne({
    payee_name: reviewTx.payee_name,
    tenant_id: testTenant.id
  })
  expect(pattern).toBeDefined()
  expect(pattern.account_code).toBe('6100')

Test Flow 3: Split Transaction
  # Step 4: Create split transaction
  splitTx = transactions.data.find(t => t.amount < 0 && Math.abs(t.amount) > 1000)

  splitResponse = PUT /transactions/{splitTx.id}/categorize
    body: {
      is_split: true,
      splits: [
        { account_code: '6100', amount: Math.abs(splitTx.amount) * 0.6, vat_type: 'STANDARD' },
        { account_code: '6200', amount: Math.abs(splitTx.amount) * 0.4, vat_type: 'ZERO_RATED' }
      ]
    }

  expect(splitResponse.status).toBe(200)

  # Verify split stored correctly
  splits = await db.transactionSplit.findMany({ transaction_id: splitTx.id })
  expect(splits.length).toBe(2)
  totalSplit = splits.reduce((sum, s) => sum + s.amount, 0)
  expect(Math.abs(totalSplit - Math.abs(splitTx.amount))).toBeLessThan(0.01) # Rounding tolerance

Test Flow 4: Edge Cases
  # Edge Case 1: Blank description
  blankTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date(),
      description: '',
      payee_name: '',
      amount: -50.00,
      status: 'PENDING'
    }
  })

  categorizeBlank = POST /transactions/categorize/batch
    body: { transaction_ids: [blankTx.id] }

  await waitForJobComplete(categorizeBlank.data.job_id)

  blankResult = GET /transactions/{blankTx.id}
  expect(blankResult.data.status).toBe('REVIEW_REQUIRED')
  expect(blankResult.data.categorization.confidence_score).toBeLessThan(80)

  # Edge Case 2: Duplicate detection
  duplicate = POST /transactions/import
    body: { file: testFile, source: 'CSV_IMPORT', bank_account: 'TEST-BANK-001' }

  await waitForImportComplete(duplicate.data.import_id)

  duplicateCount = GET /transactions?is_duplicate=true
  expect(duplicateCount.meta.total).toBe(100)

  # Edge Case 3: Invalid split (amounts don't match)
  invalidSplit = PUT /transactions/{splitTx.id}/categorize
    body: {
      is_split: true,
      splits: [
        { account_code: '6100', amount: 100 },
        { account_code: '6200', amount: 50 } # Total 150, but tx is different
      ]
    }

  expect(invalidSplit.status).toBe(400)
  expect(invalidSplit.error.code).toBe('VALIDATION_ERROR')
  expect(invalidSplit.error.message).toContain('Split amounts')

Test Flow 5: Xero Synchronization
  # Step 5: Verify Xero sync
  categorizedTx = categorized.data[0]

  # Check Xero mock received sync request
  xeroRequests = xeroMock.getRequests()
  syncRequest = xeroRequests.find(r =>
    r.path === '/BankTransactions' &&
    r.body.some(t => t.Reference === categorizedTx.id)
  )

  expect(syncRequest).toBeDefined()
  expect(syncRequest.body[0].LineItems[0].AccountCode).toBe(
    categorizedTx.categorization.account_code
  )

Test Flow 6: Pattern Learning Validation (Re-run)
  # Step 6: Import similar transactions to test pattern learning
  similarFile = loadTestData('transactions/similar-patterns-50.csv')

  rerunImport = POST /transactions/import
    body: { file: similarFile, source: 'CSV_IMPORT', bank_account: 'TEST-BANK-002' }

  await waitForImportComplete(rerunImport.data.import_id)

  rerunCategorize = POST /transactions/categorize/batch
  await waitForJobComplete(rerunCategorize.data.job_id)

  # Verify improved accuracy with learned patterns
  rerunCategorized = GET /transactions?status=CATEGORIZED&bank_account=TEST-BANK-002
  rerunAccuracy = rerunCategorized.meta.total / 50

  expect(rerunAccuracy).toBeGreaterThanOrEqual(0.95) # 95% target achieved

Performance Test:
  # Test batch categorization performance
  startTime = Date.now()
  batchCategorize = POST /transactions/categorize/batch
    body: { transaction_ids: transactions.data.map(t => t.id) }

  await waitForJobComplete(batchCategorize.data.job_id)
  duration = Date.now() - startTime

  expect(duration).toBeLessThan(300000) # 5 minutes for 100 transactions

Test Teardown:
  afterAll:
    await xeroMock.stop()
    await db.transaction.deleteMany({ tenant_id: testTenant.id })
    await db.tenant.delete({ where: { id: testTenant.id } })
    await app.close()
</pseudo_code>

<files_to_create>
  <file path="tests/e2e/transaction-flow.e2e.spec.ts">Complete E2E test suite</file>
  <file path="tests/fixtures/transactions/diverse-100.csv">Test CSV with 100 diverse transactions</file>
  <file path="tests/fixtures/transactions/similar-patterns-50.csv">Test CSV for pattern validation</file>
  <file path="tests/helpers/xero-mock.ts">Xero API mock server helper</file>
  <file path="tests/helpers/wait-for-job.ts">Job completion polling utility</file>
  <file path="tests/helpers/test-data-generators.ts">Test data creation helpers</file>
</files_to_create>

<files_to_modify>
  <!-- No existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>All test cases pass without skips or failures</criterion>
  <criterion>Test uses real database with actual data persistence</criterion>
  <criterion>AI categorization makes real API calls (not mocked)</criterion>
  <criterion>95% auto-categorization accuracy achieved on second run</criterion>
  <criterion>Duplicate detection catches all 100 re-imported transactions</criterion>
  <criterion>Split transaction validation prevents invalid amounts</criterion>
  <criterion>Blank description handled gracefully without errors</criterion>
  <criterion>Xero mock receives correctly formatted sync payloads</criterion>
  <criterion>Test completes in under 5 minutes</criterion>
  <criterion>Clear error messages for all failure scenarios</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- transaction-flow.e2e.spec.ts</command>
  <command>npm run test:e2e -- transaction-flow.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>

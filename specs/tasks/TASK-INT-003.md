<task_spec id="TASK-INT-003" version="1.0">

<metadata>
  <title>E2E Payment Matching Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>60</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-032</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This is a complete end-to-end integration test for the payment matching and allocation workflow.
It tests the entire user journey from bank statement import through AI-powered payment matching
to invoices, manual allocation for complex cases, partial payments, overpayments, and arrears
tracking. This test MUST use real data and real system components - no mocks except for
external services (Xero). The test validates various matching scenarios including exact matches,
fuzzy matches, and edge cases like overpayments and multiple invoice allocations.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#payment_endpoints</file>
  <file purpose="requirements">specs/requirements/REQ-PAY.md</file>
  <file purpose="matching_rules">specs/business-rules/payment-matching.md</file>
  <file purpose="test_data">specs/technical/test-data-requirements.md</file>
</input_context_files>

<prerequisites>
  <check>All Phase 3 payment tasks completed</check>
  <check>Database seeded with test tenant and invoices</check>
  <check>Claude Code agent accessible for AI matching</check>
  <check>Xero MCP mock server running</check>
  <check>Test bank statements with various payment scenarios</check>
</prerequisites>

<scope>
  <in_scope>
    - E2E test: Bank import of credit transactions
    - E2E test: AI payment matching with confidence scoring
    - E2E test: Exact match (100% confidence, auto-apply)
    - E2E test: High confidence match (80-99%, auto-apply)
    - E2E test: Low confidence match (requires review)
    - E2E test: Manual allocation to single invoice
    - E2E test: Manual allocation split across multiple invoices
    - E2E test: Partial payment handling
    - E2E test: Overpayment allocation
    - E2E test: Arrears tracking and reporting
    - Edge case: Payment without reference
    - Edge case: Payment amount doesn't match any invoice
    - Edge case: Multiple possible matches
  </in_scope>
  <out_of_scope>
    - Real Xero integration (use mock)
    - Credit note generation
    - Refund processing
    - Payment plan management
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="tests/e2e/payment-matching.e2e.spec.ts">
      describe('E2E: Payment Matching Flow', () => {
        it('imports bank statement with credit transactions');
        it('auto-matches exact reference and amount');
        it('auto-matches high-confidence fuzzy match');
        it('flags low-confidence for manual review');
        it('manually allocates payment to single invoice');
        it('splits payment across multiple invoices');
        it('handles partial payment correctly');
        it('handles overpayment with unallocated balance');
        it('generates accurate arrears report');
      });
    </signature>
  </signatures>

  <constraints>
    - MUST use real database (not in-memory)
    - MUST use real Claude Code agent (not mocked)
    - Exact matches MUST be 100% confidence
    - Auto-apply threshold MUST be 80%+ confidence
    - Allocations MUST NOT exceed transaction amount
    - Partial payment MUST update invoice to PARTIALLY_PAID
    - Full payment MUST update invoice to PAID
    - Arrears aging MUST be accurate to the day
    - NO mocks for internal services (PaymentService, AI agent)
  </constraints>

  <verification>
    - npm run test:e2e -- payment-matching.e2e.spec.ts passes
    - Exact matches applied automatically without review
    - High confidence matches applied automatically
    - Low confidence matches queued for review
    - Manual allocations persist correctly
    - Invoice status transitions are correct
    - Arrears report calculations are accurate
    - Xero mock receives correct payment allocation data
  </verification>
</definition_of_done>

<pseudo_code>
Test Setup:
  beforeAll:
    await app.init()
    testTenant = await createTestTenant({ vat_registered: true })
    testUser = await createTestUser(testTenant, 'OWNER')
    authToken = await getAuthToken(testUser)

    # Create parent
    parent = await db.parent.create({
      data: {
        tenant_id: testTenant.id,
        first_name: 'John',
        last_name: 'Smith',
        email: 'john@test.com',
        phone: '+27821234567'
      }
    })

    # Create children and enrollments
    child1 = await createChildWithEnrollment(parent.id, 3000_00)
    child2 = await createChildWithEnrollment(parent.id, 2000_00)

    # Generate invoices
    await POST /invoices/generate { billing_month: '2025-01' }

    invoices = await db.invoice.findMany({
      where: { tenant_id: testTenant.id },
      include: { child: true }
    })

    invoice1 = invoices.find(i => i.child_id === child1.id)
    invoice2 = invoices.find(i => i.child_id === child2.id)

    # Set invoices to SENT status
    await db.invoice.updateMany({
      where: { id: { in: invoices.map(i => i.id) } },
      data: { status: 'SENT' }
    })

    xeroMock = await startXeroMockServer()

Test Flow 1: Exact Match (Auto-Apply)
  # Import bank statement with exact match
  # Payment with correct invoice reference and exact amount
  exactMatchTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-05'),
      description: `Payment ${invoice1.invoice_number}`,
      reference: invoice1.invoice_number,
      payee_name: 'SMITH J',
      amount: invoice1.total_cents / 100, # Exact amount as decimal
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  # Trigger payment matching
  matchResponse = POST /payments/match
    body: { transaction_ids: [exactMatchTx.id] }

  expect(matchResponse.status).toBe(200)
  expect(matchResponse.data.auto_matched).toBe(1)
  expect(matchResponse.data.requires_review).toBe(0)

  # Verify match details
  match = matchResponse.data.matches[0]
  expect(match.transaction_id).toBe(exactMatchTx.id)
  expect(match.invoice_id).toBe(invoice1.id)
  expect(match.match_type).toBe('EXACT')
  expect(match.confidence).toBe(100)
  expect(match.auto_applied).toBe(true)

  # Verify payment created in database
  payment = await db.payment.findFirst({
    where: { transaction_id: exactMatchTx.id }
  })

  expect(payment).toBeDefined()
  expect(payment.invoice_id).toBe(invoice1.id)
  expect(payment.amount_cents).toBe(invoice1.total_cents)

  # Verify invoice status updated
  updatedInvoice1 = await db.invoice.findUnique({ where: { id: invoice1.id } })
  expect(updatedInvoice1.status).toBe('PAID')
  expect(updatedInvoice1.amount_paid_cents).toBe(invoice1.total_cents)

Test Flow 2: High Confidence Fuzzy Match (Auto-Apply)
  # Payment with partial reference match and exact amount
  fuzzyMatchTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-06'),
      description: `School fees Jan`,
      reference: invoice2.invoice_number.substring(0, 8), # Partial ref
      payee_name: 'J SMITH', # Slightly different name
      amount: invoice2.total_cents / 100,
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  matchResponse2 = POST /payments/match
    body: { transaction_ids: [fuzzyMatchTx.id] }

  expect(matchResponse2.status).toBe(200)
  expect(matchResponse2.data.auto_matched).toBe(1)

  match2 = matchResponse2.data.matches[0]
  expect(match2.confidence).toBeGreaterThanOrEqual(80)
  expect(match2.confidence).toBeLessThan(100)
  expect(match2.auto_applied).toBe(true)

  # Verify invoice paid
  updatedInvoice2 = await db.invoice.findUnique({ where: { id: invoice2.id } })
  expect(updatedInvoice2.status).toBe('PAID')

Test Flow 3: Low Confidence Match (Manual Review Required)
  # Create another invoice
  parent2 = await db.parent.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@test.com'
    }
  })

  child3 = await createChildWithEnrollment(parent2.id, 2500_00)
  await POST /invoices/generate { billing_month: '2025-01' }

  invoice3 = await db.invoice.findFirst({
    where: { child_id: child3.id }
  })

  await db.invoice.update({
    where: { id: invoice3.id },
    data: { status: 'SENT' }
  })

  # Payment with ambiguous match (no reference, different name)
  lowConfidenceTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-07'),
      description: 'EFT',
      reference: '',
      payee_name: 'UNKNOWN',
      amount: 2500.00,
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  matchResponse3 = POST /payments/match
    body: { transaction_ids: [lowConfidenceTx.id] }

  expect(matchResponse3.status).toBe(200)
  expect(matchResponse3.data.auto_matched).toBe(0)
  expect(matchResponse3.data.requires_review).toBe(1)

  review = matchResponse3.data.review_required[0]
  expect(review.transaction_id).toBe(lowConfidenceTx.id)
  expect(review.suggested_matches.length).toBeGreaterThan(0)

  # Verify first suggestion is invoice3 (amount match)
  topMatch = review.suggested_matches[0]
  expect(topMatch.invoice_id).toBe(invoice3.id)
  expect(topMatch.confidence).toBeLessThan(80)
  expect(topMatch.match_reason).toContain('Amount matches')

Test Flow 4: Manual Allocation to Single Invoice
  # User reviews and manually allocates
  manualAllocation = POST /payments
    body: {
      transaction_id: lowConfidenceTx.id,
      allocations: [
        {
          invoice_id: invoice3.id,
          amount: 2500.00
        }
      ]
    }

  expect(manualAllocation.status).toBe(201)
  expect(manualAllocation.data.payments.length).toBe(1)
  expect(manualAllocation.data.payments[0].invoice_status).toBe('PAID')
  expect(manualAllocation.data.unallocated_amount).toBe(0)

  # Verify payment and invoice updated
  payment3 = await db.payment.findFirst({
    where: { transaction_id: lowConfidenceTx.id }
  })

  expect(payment3.invoice_id).toBe(invoice3.id)
  expect(payment3.amount_cents).toBe(2500_00)

  updatedInvoice3 = await db.invoice.findUnique({ where: { id: invoice3.id } })
  expect(updatedInvoice3.status).toBe('PAID')

Test Flow 5: Partial Payment
  # Create another invoice
  child4 = await createChildWithEnrollment(parent2.id, 3500_00)
  await POST /invoices/generate { billing_month: '2025-01' }

  invoice4 = await db.invoice.findFirst({
    where: { child_id: child4.id }
  })

  await db.invoice.update({
    where: { id: invoice4.id },
    data: { status: 'SENT' }
  })

  # Partial payment transaction
  partialTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-08'),
      description: `Partial payment ${invoice4.invoice_number}`,
      reference: invoice4.invoice_number,
      payee_name: 'DOE J',
      amount: 1500.00, # Less than invoice total
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  # AI should match but recognize partial payment
  matchPartial = POST /payments/match
    body: { transaction_ids: [partialTx.id] }

  expect(matchPartial.status).toBe(200)
  expect(matchPartial.data.auto_matched).toBe(1)

  matchDetails = matchPartial.data.matches[0]
  expect(matchDetails.match_type).toBe('PARTIAL')

  # Verify invoice marked as PARTIALLY_PAID
  partialInvoice = await db.invoice.findUnique({ where: { id: invoice4.id } })
  expect(partialInvoice.status).toBe('PARTIALLY_PAID')
  expect(partialInvoice.amount_paid_cents).toBe(1500_00)

  outstanding = partialInvoice.total_cents - partialInvoice.amount_paid_cents
  expect(outstanding).toBe(2000_00)

Test Flow 6: Split Payment Across Multiple Invoices
  # Create two more invoices
  child5 = await createChildWithEnrollment(parent.id, 1000_00)
  child6 = await createChildWithEnrollment(parent.id, 1500_00)
  await POST /invoices/generate { billing_month: '2025-01' }

  invoice5 = await db.invoice.findFirst({ where: { child_id: child5.id } })
  invoice6 = await db.invoice.findFirst({ where: { child_id: child6.id } })

  await db.invoice.updateMany({
    where: { id: { in: [invoice5.id, invoice6.id] } },
    data: { status: 'SENT' }
  })

  # Single payment for both invoices
  multiPaymentTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-09'),
      description: 'Payment for both kids',
      reference: '',
      payee_name: 'SMITH J',
      amount: 2500.00, # Exactly invoice5 + invoice6
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  # Manual allocation to both invoices
  splitAllocation = POST /payments
    body: {
      transaction_id: multiPaymentTx.id,
      allocations: [
        { invoice_id: invoice5.id, amount: 1000.00 },
        { invoice_id: invoice6.id, amount: 1500.00 }
      ]
    }

  expect(splitAllocation.status).toBe(201)
  expect(splitAllocation.data.payments.length).toBe(2)
  expect(splitAllocation.data.unallocated_amount).toBe(0)

  # Verify both invoices paid
  paidInvoice5 = await db.invoice.findUnique({ where: { id: invoice5.id } })
  paidInvoice6 = await db.invoice.findUnique({ where: { id: invoice6.id } })

  expect(paidInvoice5.status).toBe('PAID')
  expect(paidInvoice6.status).toBe('PAID')

Test Flow 7: Overpayment Handling
  # Create invoice
  child7 = await createChildWithEnrollment(parent.id, 2000_00)
  await POST /invoices/generate { billing_month: '2025-01' }

  invoice7 = await db.invoice.findFirst({ where: { child_id: child7.id } })
  await db.invoice.update({
    where: { id: invoice7.id },
    data: { status: 'SENT' }
  })

  # Overpayment transaction
  overpaymentTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-10'),
      description: `Payment ${invoice7.invoice_number}`,
      reference: invoice7.invoice_number,
      payee_name: 'SMITH J',
      amount: 2500.00, # R500 more than invoice
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  # Allocate full invoice amount
  overpayAllocation = POST /payments
    body: {
      transaction_id: overpaymentTx.id,
      allocations: [
        { invoice_id: invoice7.id, amount: 2000.00 }
      ]
    }

  expect(overpayAllocation.status).toBe(201)
  expect(overpayAllocation.data.payments[0].invoice_status).toBe('PAID')
  expect(overpayAllocation.data.unallocated_amount).toBe(500.00)

  # Verify unallocated amount stored
  updatedTx = await db.transaction.findUnique({ where: { id: overpaymentTx.id } })
  expect(updatedTx.allocated_amount_cents).toBe(2000_00)
  expect(updatedTx.unallocated_amount_cents).toBe(500_00)

Test Flow 8: Edge Case - Allocation Exceeds Transaction
  # Create invoice
  child8 = await createChildWithEnrollment(parent.id, 3000_00)
  await POST /invoices/generate { billing_month: '2025-01' }

  invoice8 = await db.invoice.findFirst({ where: { child_id: child8.id } })
  await db.invoice.update({ where: { id: invoice8.id }, data: { status: 'SENT' } })

  smallPaymentTx = await db.transaction.create({
    data: {
      tenant_id: testTenant.id,
      date: new Date('2025-01-11'),
      description: 'Small payment',
      amount: 1000.00,
      is_credit: true,
      status: 'PENDING',
      source: 'CSV_IMPORT'
    }
  })

  # Attempt to allocate more than transaction amount
  invalidAllocation = POST /payments
    body: {
      transaction_id: smallPaymentTx.id,
      allocations: [
        { invoice_id: invoice8.id, amount: 1500.00 } # Exceeds transaction
      ]
    }

  expect(invalidAllocation.status).toBe(400)
  expect(invalidAllocation.error.code).toBe('VALIDATION_ERROR')
  expect(invalidAllocation.error.message).toContain('exceeds transaction amount')

Test Flow 9: Arrears Tracking and Reporting
  # Create overdue invoices
  overdueParent = await db.parent.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'Late',
      last_name: 'Payer',
      email: 'late@test.com'
    }
  })

  child9 = await createChildWithEnrollment(overdueParent.id, 3000_00)

  # Create invoices for 3 months back (overdue)
  oldInvoice1 = await db.invoice.create({
    data: {
      tenant_id: testTenant.id,
      child_id: child9.id,
      invoice_number: 'INV-2024-090',
      issue_date: new Date('2024-10-01'),
      due_date: new Date('2024-10-08'),
      subtotal_cents: 3000_00,
      vat_cents: 450_00,
      total_cents: 3450_00,
      amount_paid_cents: 0,
      status: 'OVERDUE',
      billing_month: '2024-10'
    }
  })

  oldInvoice2 = await db.invoice.create({
    data: {
      tenant_id: testTenant.id,
      child_id: child9.id,
      invoice_number: 'INV-2024-120',
      issue_date: new Date('2024-11-01'),
      due_date: new Date('2024-11-08'),
      subtotal_cents: 3000_00,
      vat_cents: 450_00,
      total_cents: 3450_00,
      amount_paid_cents: 1000_00, # Partial payment
      status: 'OVERDUE',
      billing_month: '2024-11'
    }
  })

  # Get arrears report
  arrearsReport = GET /arrears

  expect(arrearsReport.status).toBe(200)

  summary = arrearsReport.data.summary
  expect(summary.total_outstanding).toBeGreaterThan(0)

  # Verify aging buckets
  aging = summary.aging
  expect(aging.days_90_plus).toBeGreaterThan(0) # Oct invoice
  expect(aging.days_60).toBeGreaterThan(0) # Nov invoice

  # Verify top debtors
  topDebtors = arrearsReport.data.top_debtors
  latePayer = topDebtors.find(d => d.parent_id === overdueParent.id)

  expect(latePayer).toBeDefined()
  expect(latePayer.outstanding).toBe(
    (oldInvoice1.total_cents - oldInvoice1.amount_paid_cents) / 100 +
    (oldInvoice2.total_cents - oldInvoice2.amount_paid_cents) / 100
  )
  expect(latePayer.oldest_invoice_date).toBe('2024-10-01')

Test Flow 10: Xero Synchronization
  # Verify Xero mock received payment allocation requests
  xeroRequests = xeroMock.getRequests()
  paymentRequests = xeroRequests.filter(r =>
    r.method === 'POST' && r.path.includes('/Payments')
  )

  expect(paymentRequests.length).toBeGreaterThan(0)

  # Verify payment data format
  payment1Xero = paymentRequests.find(r =>
    r.body.Invoice.InvoiceID === invoice1.xero_id
  )

  expect(payment1Xero).toBeDefined()
  expect(payment1Xero.body.Amount).toBe(invoice1.total_cents / 100)

Test Teardown:
  afterAll:
    await xeroMock.stop()
    await db.payment.deleteMany({ tenant_id: testTenant.id })
    await db.transaction.deleteMany({ tenant_id: testTenant.id })
    await db.invoice.deleteMany({ tenant_id: testTenant.id })
    await db.enrollment.deleteMany({ tenant_id: testTenant.id })
    await db.child.deleteMany({ tenant_id: testTenant.id })
    await db.parent.deleteMany({ tenant_id: testTenant.id })
    await db.tenant.delete({ where: { id: testTenant.id } })
    await app.close()
</pseudo_code>

<files_to_create>
  <file path="tests/e2e/payment-matching.e2e.spec.ts">Complete E2E test suite</file>
  <file path="tests/fixtures/payments/bank-statements.csv">Test bank statements with various scenarios</file>
  <file path="tests/helpers/invoice-generators.ts">Helper to create test invoices</file>
  <file path="tests/helpers/payment-scenarios.ts">Predefined payment matching scenarios</file>
</files_to_create>

<files_to_modify>
  <!-- No existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>All test cases pass without skips or failures</criterion>
  <criterion>Exact matches applied automatically with 100% confidence</criterion>
  <criterion>High confidence matches (80%+) applied automatically</criterion>
  <criterion>Low confidence matches queued for review</criterion>
  <criterion>Manual allocations cannot exceed transaction amount</criterion>
  <criterion>Partial payments update invoice to PARTIALLY_PAID</criterion>
  <criterion>Full payments update invoice to PAID</criterion>
  <criterion>Split allocations sum correctly</criterion>
  <criterion>Overpayments track unallocated amount</criterion>
  <criterion>Arrears report aging calculations accurate to the day</criterion>
  <criterion>Xero receives correctly formatted payment data</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- payment-matching.e2e.spec.ts</command>
  <command>npm run test:e2e -- payment-matching.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>

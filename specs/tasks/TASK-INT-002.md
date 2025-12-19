<task_spec id="TASK-INT-002" version="1.0">

<metadata>
  <title>E2E Billing Cycle Flow</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>59</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This is a complete end-to-end integration test for the monthly billing cycle workflow.
It tests the entire user journey from child enrollment through invoice generation,
pro-rata calculations, sibling discounts, VAT calculations, multi-channel delivery
(email and WhatsApp), and payment receipt. This test MUST use real data and real
system components - no mocks except for external services (email, WhatsApp, Xero).
The test validates complex calculations including mid-month enrollments and multiple
discount scenarios.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#invoice_endpoints</file>
  <file purpose="requirements">specs/requirements/REQ-BILL.md</file>
  <file purpose="billing_rules">specs/business-rules/billing-calculations.md</file>
  <file purpose="test_data">specs/technical/test-data-requirements.md</file>
</input_context_files>

<prerequisites>
  <check>All Phase 3 billing tasks completed</check>
  <check>Database seeded with test tenant (VAT registered)</check>
  <check>Fee structures defined (Full Day, Half Day, After-care)</check>
  <check>Email MCP mock server running</check>
  <check>WhatsApp MCP mock server running</check>
  <check>Xero MCP mock server running</check>
  <check>PDF generation service accessible</check>
</prerequisites>

<scope>
  <in_scope>
    - E2E test: Child enrollment with fee structure
    - E2E test: Monthly invoice generation for all active enrollments
    - E2E test: Pro-rata calculation for mid-month enrollment
    - E2E test: Sibling discount calculation (2+ children)
    - E2E test: VAT calculation at 15%
    - E2E test: Ad-hoc charge inclusion
    - E2E test: Email delivery with PDF attachment
    - E2E test: WhatsApp delivery with payment link
    - E2E test: Payment receipt and invoice status update
    - Edge case: Mid-month start (pro-rata)
    - Edge case: Mid-month withdrawal (pro-rata)
    - Edge case: Invalid email address handling
  </in_scope>
  <out_of_scope>
    - Real email/WhatsApp integration (use mocks)
    - Real Xero integration (use mock)
    - Credit note generation (future phase)
    - Payment plan setup (future phase)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="tests/e2e/billing-cycle.e2e.spec.ts">
      describe('E2E: Billing Cycle Flow', () => {
        it('enrolls children with different fee structures');
        it('generates monthly invoices with correct amounts');
        it('calculates pro-rata for mid-month enrollment');
        it('applies sibling discount correctly');
        it('calculates VAT at 15%');
        it('includes ad-hoc charges in invoice');
        it('delivers invoices via email with PDF');
        it('delivers invoices via WhatsApp');
        it('handles failed deliveries gracefully');
        it('updates invoice status on payment receipt');
      });
    </signature>
  </signatures>

  <constraints>
    - MUST use real database (not in-memory)
    - MUST use real calculation logic (not mocked)
    - Pro-rata MUST be exact to the day
    - Sibling discount MUST be 10% on 2nd child, 15% on 3rd+
    - VAT MUST be exactly 15% of subtotal
    - All monetary calculations MUST use Decimal.js
    - NO rounding errors allowed (test to 2 decimal places)
    - Delivery failures MUST NOT block other deliveries
    - Invoice status transitions MUST be atomic
  </constraints>

  <verification>
    - npm run test:e2e -- billing-cycle.e2e.spec.ts passes
    - All calculations match expected values exactly
    - Email mock receives correctly formatted messages
    - WhatsApp mock receives correctly formatted messages
    - Xero mock receives correct invoice data
    - Failed deliveries logged with clear reasons
    - Invoice status transitions are correct
  </verification>
</definition_of_done>

<pseudo_code>
Test Setup:
  beforeAll:
    await app.init()
    testTenant = await createTestTenant({
      vat_registered: true,
      vat_rate: 0.15,
      sibling_discount_2nd: 0.10,
      sibling_discount_3rd_plus: 0.15
    })
    testUser = await createTestUser(testTenant, 'OWNER')
    authToken = await getAuthToken(testUser)

    # Create fee structures
    fullDayFee = await createFeeStructure(testTenant, {
      name: 'Full Day',
      amount: 3000_00, # R3000 in cents
      billing_frequency: 'MONTHLY'
    })

    halfDayFee = await createFeeStructure(testTenant, {
      name: 'Half Day',
      amount: 2000_00, # R2000 in cents
      billing_frequency: 'MONTHLY'
    })

    # Start mock servers
    emailMock = await startEmailMockServer()
    whatsappMock = await startWhatsAppMockServer()
    xeroMock = await startXeroMockServer()

Test Flow 1: Enrollment Setup
  # Create parent and children
  parent1 = await db.parent.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'John',
      last_name: 'Smith',
      email: 'john.smith@test.com',
      phone: '+27821234567',
      preferred_contact: 'EMAIL'
    }
  })

  # Enroll first child (Full Day)
  child1Response = POST /children
    body: {
      parent_id: parent1.id,
      first_name: 'Emily',
      last_name: 'Smith',
      date_of_birth: '2020-03-15',
      fee_structure_id: fullDayFee.id,
      start_date: '2025-01-01' # Full month
    }

  expect(child1Response.status).toBe(201)
  child1 = child1Response.data.child

  # Enroll second child (Half Day) - sibling discount applies
  child2Response = POST /children
    body: {
      parent_id: parent1.id,
      first_name: 'Oliver',
      last_name: 'Smith',
      date_of_birth: '2021-08-20',
      fee_structure_id: halfDayFee.id,
      start_date: '2025-01-01'
    }

  expect(child2Response.status).toBe(201)
  child2 = child2Response.data.child

  # Enroll third child mid-month (pro-rata applies)
  child3Response = POST /children
    body: {
      parent_id: parent1.id,
      first_name: 'Sophie',
      last_name: 'Smith',
      date_of_birth: '2022-11-10',
      fee_structure_id: fullDayFee.id,
      start_date: '2025-01-15' # Mid-month
    }

  expect(child3Response.status).toBe(201)
  child3 = child3Response.data.child

Test Flow 2: Invoice Generation with Complex Calculations
  # Add ad-hoc charge for first child
  adhocCharge = await db.adhocCharge.create({
    data: {
      tenant_id: testTenant.id,
      child_id: child1.id,
      description: 'Extra art supplies',
      amount: 250_00, # R250
      charge_date: '2025-01-10',
      status: 'PENDING'
    }
  })

  # Generate invoices for January 2025
  generateResponse = POST /invoices/generate
    body: {
      billing_month: '2025-01',
      include_adhoc: true
    }

  expect(generateResponse.status).toBe(201)
  invoicesCreated = generateResponse.data.invoices_created
  expect(invoicesCreated).toBe(3) # One per child

  # Verify invoices in database
  invoices = await db.invoice.findMany({
    where: { tenant_id: testTenant.id, billing_month: '2025-01' },
    include: { line_items: true, child: true }
  })

  expect(invoices.length).toBe(3)

Test Flow 3: Detailed Calculation Verification
  # Invoice 1: Emily (Full Day, no discount, with ad-hoc)
  invoice1 = invoices.find(i => i.child_id === child1.id)

  expectedSubtotal1 = 3000 + 250 # Fee + ad-hoc
  expectedVat1 = Math.round(expectedSubtotal1 * 0.15 * 100) / 100
  expectedTotal1 = expectedSubtotal1 + expectedVat1

  expect(invoice1.subtotal_cents / 100).toBe(expectedSubtotal1)
  expect(invoice1.vat_cents / 100).toBe(expectedVat1)
  expect(invoice1.total_cents / 100).toBe(expectedTotal1)
  expect(invoice1.line_items.length).toBe(2) # Fee + ad-hoc

  # Invoice 2: Oliver (Half Day, 10% sibling discount)
  invoice2 = invoices.find(i => i.child_id === child2.id)

  baseFee2 = 2000
  discountAmount2 = Math.round(baseFee2 * 0.10 * 100) / 100 # 10% sibling discount
  discountedFee2 = baseFee2 - discountAmount2
  expectedVat2 = Math.round(discountedFee2 * 0.15 * 100) / 100
  expectedTotal2 = discountedFee2 + expectedVat2

  expect(invoice2.subtotal_cents / 100).toBe(discountedFee2)
  expect(invoice2.vat_cents / 100).toBe(expectedVat2)
  expect(invoice2.total_cents / 100).toBe(expectedTotal2)

  # Verify discount line item
  discountItem = invoice2.line_items.find(li => li.description.includes('Sibling'))
  expect(discountItem).toBeDefined()
  expect(discountItem.amount_cents).toBe(-(discountAmount2 * 100))

  # Invoice 3: Sophie (Full Day, 15% sibling discount, pro-rata)
  invoice3 = invoices.find(i => i.child_id === child3.id)

  # Pro-rata: started Jan 15, month has 31 days, so 17 days (15-31 inclusive)
  daysInMonth = 31
  daysEnrolled = 17
  proRataFee3 = Math.round((3000 * daysEnrolled / daysInMonth) * 100) / 100
  discountAmount3 = Math.round(proRataFee3 * 0.15 * 100) / 100 # 15% for 3rd child
  finalFee3 = proRataFee3 - discountAmount3
  expectedVat3 = Math.round(finalFee3 * 0.15 * 100) / 100
  expectedTotal3 = finalFee3 + expectedVat3

  expect(invoice3.subtotal_cents / 100).toBeCloseTo(finalFee3, 2)
  expect(invoice3.vat_cents / 100).toBeCloseTo(expectedVat3, 2)
  expect(invoice3.total_cents / 100).toBeCloseTo(expectedTotal3, 2)

  # Verify pro-rata and discount line items
  proRataItem = invoice3.line_items.find(li => li.description.includes('Pro-rata'))
  expect(proRataItem).toBeDefined()

  discountItem3 = invoice3.line_items.find(li => li.description.includes('Sibling'))
  expect(discountItem3).toBeDefined()

Test Flow 4: Multi-Channel Delivery
  # Update invoices to DRAFT status (ready to send)
  await db.invoice.updateMany({
    where: { id: { in: invoices.map(i => i.id) } },
    data: { status: 'DRAFT' }
  })

  # Send invoices via email
  sendEmailResponse = POST /invoices/send
    body: {
      invoice_ids: [invoice1.id, invoice2.id],
      delivery_method: 'EMAIL'
    }

  expect(sendEmailResponse.status).toBe(200)
  expect(sendEmailResponse.data.sent).toBe(2)
  expect(sendEmailResponse.data.failed).toBe(0)

  # Verify email mock received requests
  emailRequests = emailMock.getRequests()
  expect(emailRequests.length).toBe(2)

  emailForInvoice1 = emailRequests.find(r => r.body.includes(invoice1.invoice_number))
  expect(emailForInvoice1).toBeDefined()
  expect(emailForInvoice1.to).toBe(parent1.email)
  expect(emailForInvoice1.attachments[0].filename).toMatch(/\.pdf$/)

  # Send invoice via WhatsApp
  sendWhatsAppResponse = POST /invoices/send
    body: {
      invoice_ids: [invoice3.id],
      delivery_method: 'WHATSAPP'
    }

  expect(sendWhatsAppResponse.status).toBe(200)
  expect(sendWhatsAppResponse.data.sent).toBe(1)

  # Verify WhatsApp mock received request
  whatsappRequests = whatsappMock.getRequests()
  expect(whatsappRequests.length).toBe(1)
  expect(whatsappRequests[0].to).toBe(parent1.phone)
  expect(whatsappRequests[0].body).toContain(invoice3.invoice_number)
  expect(whatsappRequests[0].body).toContain('payment link')

Test Flow 5: Delivery Failure Handling
  # Create parent with invalid email
  parent2 = await db.parent.create({
    data: {
      tenant_id: testTenant.id,
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'invalid-email', # Invalid format
      phone: '+27821234568',
      preferred_contact: 'EMAIL'
    }
  })

  child4Response = POST /children
    body: {
      parent_id: parent2.id,
      first_name: 'Test',
      last_name: 'Child',
      date_of_birth: '2021-05-01',
      fee_structure_id: fullDayFee.id,
      start_date: '2025-01-01'
    }

  await POST /invoices/generate { billing_month: '2025-01' }

  invoice4 = await db.invoice.findFirst({
    where: { child_id: child4Response.data.child.id }
  })

  # Attempt to send with invalid email
  sendFailResponse = POST /invoices/send
    body: { invoice_ids: [invoice4.id], delivery_method: 'EMAIL' }

  expect(sendFailResponse.status).toBe(200)
  expect(sendFailResponse.data.sent).toBe(0)
  expect(sendFailResponse.data.failed).toBe(1)
  expect(sendFailResponse.data.failures[0].reason).toContain('Invalid email')

  # Verify invoice status NOT changed to SENT
  failedInvoice = await db.invoice.findUnique({ where: { id: invoice4.id } })
  expect(failedInvoice.status).toBe('DRAFT')
  expect(failedInvoice.delivery_status).toBe('FAILED')

Test Flow 6: Payment Receipt and Status Update
  # Simulate payment received for invoice 1
  # (This would typically come from payment matching, but we test directly)
  payment = await db.payment.create({
    data: {
      tenant_id: testTenant.id,
      invoice_id: invoice1.id,
      transaction_id: null, # Manual payment
      amount_cents: invoice1.total_cents,
      payment_date: new Date('2025-01-05'),
      payment_method: 'BANK_TRANSFER',
      created_by: testUser.id
    }
  })

  # Update invoice status
  await db.invoice.update({
    where: { id: invoice1.id },
    data: {
      amount_paid_cents: invoice1.total_cents,
      status: 'PAID'
    }
  })

  # Verify invoice marked as paid
  paidInvoice = GET /invoices/{invoice1.id}
  expect(paidInvoice.data.status).toBe('PAID')
  expect(paidInvoice.data.amount_paid).toBe(paidInvoice.data.total)

  # Simulate partial payment for invoice 2
  partialPayment = await db.payment.create({
    data: {
      tenant_id: testTenant.id,
      invoice_id: invoice2.id,
      amount_cents: Math.floor(invoice2.total_cents / 2),
      payment_date: new Date('2025-01-06'),
      payment_method: 'CASH',
      created_by: testUser.id
    }
  })

  await db.invoice.update({
    where: { id: invoice2.id },
    data: {
      amount_paid_cents: partialPayment.amount_cents,
      status: 'PARTIALLY_PAID'
    }
  })

  # Verify partial payment status
  partialInvoice = GET /invoices/{invoice2.id}
  expect(partialInvoice.data.status).toBe('PARTIALLY_PAID')
  expect(partialInvoice.data.amount_paid).toBe(partialInvoice.data.total / 2)

Test Flow 7: Xero Synchronization
  # Verify Xero mock received invoice creation requests
  xeroRequests = xeroMock.getRequests()
  invoiceCreationRequests = xeroRequests.filter(r =>
    r.method === 'POST' && r.path === '/Invoices'
  )

  expect(invoiceCreationRequests.length).toBeGreaterThanOrEqual(3)

  # Verify invoice 1 data format
  invoice1Xero = invoiceCreationRequests.find(r =>
    r.body.Reference === invoice1.invoice_number
  )

  expect(invoice1Xero).toBeDefined()
  expect(invoice1Xero.body.Type).toBe('ACCREC')
  expect(invoice1Xero.body.Total).toBe(invoice1.total_cents / 100)
  expect(invoice1Xero.body.LineItems.length).toBe(invoice1.line_items.length)

Test Teardown:
  afterAll:
    await emailMock.stop()
    await whatsappMock.stop()
    await xeroMock.stop()
    await db.payment.deleteMany({ tenant_id: testTenant.id })
    await db.invoice.deleteMany({ tenant_id: testTenant.id })
    await db.enrollment.deleteMany({ tenant_id: testTenant.id })
    await db.child.deleteMany({ tenant_id: testTenant.id })
    await db.parent.deleteMany({ tenant_id: testTenant.id })
    await db.tenant.delete({ where: { id: testTenant.id } })
    await app.close()
</pseudo_code>

<files_to_create>
  <file path="tests/e2e/billing-cycle.e2e.spec.ts">Complete E2E test suite</file>
  <file path="tests/helpers/email-mock.ts">Email service mock server</file>
  <file path="tests/helpers/whatsapp-mock.ts">WhatsApp service mock server</file>
  <file path="tests/helpers/billing-calculators.ts">Expected calculation helpers for verification</file>
  <file path="tests/fixtures/billing/test-scenarios.json">Predefined billing scenarios</file>
</files_to_create>

<files_to_modify>
  <!-- No existing files to modify -->
</files_to_modify>

<validation_criteria>
  <criterion>All test cases pass without skips or failures</criterion>
  <criterion>Pro-rata calculations exact to the day</criterion>
  <criterion>Sibling discounts applied correctly (10% 2nd, 15% 3rd+)</criterion>
  <criterion>VAT calculations exact to 2 decimal places</criterion>
  <criterion>Email delivery includes valid PDF attachment</criterion>
  <criterion>WhatsApp delivery includes payment link</criterion>
  <criterion>Failed deliveries don't block successful ones</criterion>
  <criterion>Invoice status transitions are atomic and correct</criterion>
  <criterion>Xero receives correctly formatted invoice data</criterion>
  <criterion>No rounding errors in any calculation</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test:e2e -- billing-cycle.e2e.spec.ts</command>
  <command>npm run test:e2e -- billing-cycle.e2e.spec.ts --verbose</command>
</test_commands>

</task_spec>

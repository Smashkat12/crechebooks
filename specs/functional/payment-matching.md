<functional_spec id="SPEC-PAY" version="1.0">

<metadata>
  <title>Payment Matching and Arrears Management</title>
  <status>approved</status>
  <owner>CrecheBooks Product Team</owner>
  <last_updated>2025-12-19</last_updated>
  <related_specs>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-RECON</spec_ref>
  </related_specs>
</metadata>

<overview>
The Payment Matching system automatically matches incoming bank payments to outstanding invoices and manages the arrears workflow. Using Claude Code AI agents, it intelligently matches payments using multiple factors (reference, amount, payer name) and handles real-world complexity like partial payments, combined family payments, and reference variations.

The system provides comprehensive arrears visibility with aging buckets, automated reminders on configurable schedules, and detailed parent payment histories. This reduces payment reconciliation from 2-3 hours of manual tracking to automatic processing with exception handling.
</overview>

<user_stories>

<story id="US-PAY-001" priority="must-have">
  <narrative>
    As a creche owner
    I want incoming bank payments automatically matched to outstanding invoices
    So that I don't have to manually reconcile each deposit
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-PAY-001a">
      <given>A payment is received with reference matching an invoice number</given>
      <when>The payment amount matches the invoice amount exactly</when>
      <then>The payment is automatically applied to the invoice</then>
    </criterion>
    <criterion id="AC-PAY-001b">
      <given>A payment is received that doesn't match exactly</given>
      <when>The system cannot make a confident match</when>
      <then>The payment is flagged for manual review with suggested matches</then>
    </criterion>
    <criterion id="AC-PAY-001c">
      <given>A parent makes a partial payment</given>
      <when>The payment is less than the invoice amount</when>
      <then>The payment is applied and the invoice shows remaining balance</then>
    </criterion>
    <criterion id="AC-PAY-001d">
      <given>A parent pays for multiple children with one payment</given>
      <when>The combined amount matches multiple invoices</when>
      <then>The system suggests splitting across invoices; owner can allocate</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-PAY-002" priority="must-have">
  <narrative>
    As a creche owner
    I want to see outstanding arrears at a glance
    So that I can follow up on late payments
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-PAY-002a">
      <given>I open the arrears dashboard</given>
      <when>I view the summary</when>
      <then>I see total arrears, aging buckets (30/60/90 days), and top debtors</then>
    </criterion>
    <criterion id="AC-PAY-002b">
      <given>I want to understand a specific parent's situation</given>
      <when>I click on a parent name</when>
      <then>I see their complete payment history and outstanding invoices</then>
    </criterion>
    <criterion id="AC-PAY-002c">
      <given>I need to share arrears information</given>
      <when>I click export</when>
      <then>I can download an arrears report as PDF or Excel</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-PAY-003" priority="should-have">
  <narrative>
    As a creche owner
    I want automated payment reminders sent to parents with overdue accounts
    So that I don't have to chase payments manually
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-PAY-003a">
      <given>I have configured reminder schedules</given>
      <when>An invoice becomes 7 days overdue</when>
      <then>A friendly reminder is automatically sent to the parent</then>
    </criterion>
    <criterion id="AC-PAY-003b">
      <given>I want professional reminder messages</given>
      <when>I access reminder settings</when>
      <then>I can customize reminder templates while maintaining professional tone</then>
    </criterion>
    <criterion id="AC-PAY-003c">
      <given>Multiple reminders have been sent without payment</given>
      <when>The 3rd reminder threshold is reached</when>
      <then>The account is escalated to me with alert for personal follow-up</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-PAY-001" story_ref="US-PAY-001" priority="must">
  <description>System matches incoming payments to outstanding invoices automatically</description>
  <rationale>Core payment automation saves manual reconciliation time</rationale>
</requirement>

<requirement id="REQ-PAY-002" story_ref="US-PAY-001" priority="must">
  <description>Matching uses reference, amount, and payer name as matching criteria</description>
  <rationale>Multiple factors increase matching accuracy</rationale>
</requirement>

<requirement id="REQ-PAY-003" story_ref="US-PAY-001" priority="must">
  <description>Exact matches (reference + amount) applied automatically without review</description>
  <rationale>High-confidence matches should not require human intervention</rationale>
</requirement>

<requirement id="REQ-PAY-004" story_ref="US-PAY-001" priority="must">
  <description>Ambiguous matches flagged for human review with suggested allocations</description>
  <rationale>Uncertain matches require human judgment for accuracy</rationale>
</requirement>

<requirement id="REQ-PAY-005" story_ref="US-PAY-001" priority="must">
  <description>Partial payments supported (multiple payments per invoice)</description>
  <rationale>Parents sometimes pay in installments</rationale>
</requirement>

<requirement id="REQ-PAY-006" story_ref="US-PAY-001" priority="should">
  <description>Combined payments supported (one payment allocated to multiple invoices)</description>
  <rationale>Families with multiple children often pay with one transfer</rationale>
</requirement>

<requirement id="REQ-PAY-007" story_ref="US-PAY-002" priority="must">
  <description>Arrears dashboard shows total, aging buckets (30/60/90 days), top debtors</description>
  <rationale>Clear visibility into arrears enables proactive management</rationale>
</requirement>

<requirement id="REQ-PAY-008" story_ref="US-PAY-002" priority="should">
  <description>Individual parent payment history viewable with all transactions</description>
  <rationale>Context needed for follow-up conversations</rationale>
</requirement>

<requirement id="REQ-PAY-009" story_ref="US-PAY-003" priority="should">
  <description>Automated payment reminders sent per configurable schedule</description>
  <rationale>Automation reduces manual chasing effort</rationale>
</requirement>

<requirement id="REQ-PAY-010" story_ref="US-PAY-003" priority="should">
  <description>Reminder templates customizable while maintaining professional tone</description>
  <rationale>Brand consistency with appropriate messaging</rationale>
</requirement>

<requirement id="REQ-PAY-011" story_ref="US-PAY-003" priority="should">
  <description>Escalation to owner after configurable number of reminders without payment</description>
  <rationale>Some situations require personal intervention</rationale>
</requirement>

<requirement id="REQ-PAY-012" story_ref="US-PAY-002" priority="should">
  <description>Arrears report exportable to PDF and Excel formats</description>
  <rationale>Sharing with accountants or board members</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-PAY-001" req_ref="REQ-PAY-002">
  <scenario>Payment amount doesn't match any invoice exactly</scenario>
  <expected_behavior>Fuzzy match on reference and payer name; suggest closest matches ranked by confidence; flag for review with match reasoning</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-002" req_ref="REQ-PAY-002">
  <scenario>Payment reference doesn't match any invoice number (e.g., parent uses child name)</scenario>
  <expected_behavior>Use amount + payer name as secondary matching; search for child name in reference; flag if match confidence below 70%</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-003" req_ref="REQ-PAY-005">
  <scenario>Payment is less than invoice amount (partial payment)</scenario>
  <expected_behavior>Apply payment to invoice; update invoice status to "partially paid"; show remaining balance R{outstanding}; allow future payments to complete</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-004" req_ref="REQ-PAY-005">
  <scenario>Multiple payments received from same parent on same day</scenario>
  <expected_behavior>Present allocation options: "Apply to oldest invoices first" or "Let me allocate manually"; default to oldest-first if auto-match enabled</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-005" req_ref="REQ-PAY-006">
  <scenario>One payment covers multiple children's invoices (family payment)</scenario>
  <expected_behavior>Detect total matches sum of family's outstanding invoices; suggest split allocation across children; allow manual adjustment before applying</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-006" req_ref="REQ-PAY-001">
  <scenario>Payment received for unknown parent (payer not in system)</scenario>
  <expected_behavior>Flag as "unallocated payment"; prompt to create new parent contact or match to existing; hold in suspense until resolved</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-007" req_ref="REQ-PAY-007">
  <scenario>Parent disputes amount owed, claims payment was made</scenario>
  <expected_behavior>Provide detailed payment history with dates, amounts, references; show invoice history; support adding notes/comments to record dispute details</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-008" req_ref="REQ-PAY-005">
  <scenario>Payment exceeds invoice amount (overpayment)</scenario>
  <expected_behavior>Apply to invoice; create credit balance on parent account; apply credit to next invoice or flag for refund decision</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-009" req_ref="REQ-PAY-009">
  <scenario>Reminder scheduled but parent already made payment (crossed in transit)</scenario>
  <expected_behavior>Check payment status before sending reminder; if payment received in last 3 days, skip reminder; send thank-you note instead if payment just received</expected_behavior>
</edge_case>

<edge_case id="EC-PAY-010" req_ref="REQ-PAY-003">
  <scenario>Payment received is a reversal/bounce/return</scenario>
  <expected_behavior>Detect reversal pattern (matching negative amount or R/D indicator); reverse the original allocation; restore invoice to unpaid; alert owner; flag parent account</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-PAY-001" http_code="404">
  <condition>Manual allocation attempted for non-existent invoice</condition>
  <message>Invoice {invoice_number} not found. It may have been deleted or paid in full.</message>
  <recovery>Refresh invoice list; show available invoices for allocation</recovery>
</error>

<error id="ERR-PAY-002" http_code="400">
  <condition>Allocation amount exceeds payment amount</condition>
  <message>Cannot allocate R{allocation} to invoices. Payment amount is only R{payment}. Remaining to allocate: R{remaining}.</message>
  <recovery>Show allocation summary; allow adjustment; validate totals</recovery>
</error>

<error id="ERR-PAY-003" http_code="409">
  <condition>Payment already allocated (duplicate allocation attempt)</condition>
  <message>This payment has already been allocated. View allocation details to make changes.</message>
  <recovery>Show current allocation; offer to view or modify existing allocation</recovery>
</error>

<error id="ERR-PAY-004" http_code="502">
  <condition>Xero sync failed when applying payment</condition>
  <message>Payment recorded locally but failed to sync with Xero. It will sync automatically when connection is restored.</message>
  <recovery>Queue for retry; show sync status; allow manual retry</recovery>
</error>

<error id="ERR-PAY-005" http_code="400">
  <condition>Reminder send attempted but no contact method available</condition>
  <message>Cannot send reminder to {parent_name}. No email or WhatsApp configured.</message>
  <recovery>Skip this parent; suggest updating contact; offer manual reminder text</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-PAY-001" type="unit" req_ref="REQ-PAY-003">
  <description>Exact match payment auto-applied</description>
  <inputs>Payment: R3,000, Reference: "INV-2024-001"; Invoice: INV-2024-001, Amount: R3,000</inputs>
  <expected>Payment automatically applied; invoice status: PAID</expected>
</test_case>

<test_case id="TC-PAY-002" type="unit" req_ref="REQ-PAY-005">
  <description>Partial payment applied correctly</description>
  <inputs>Payment: R1,500; Invoice: R3,000</inputs>
  <expected>Invoice status: PARTIALLY_PAID; Outstanding: R1,500</expected>
</test_case>

<test_case id="TC-PAY-003" type="unit" req_ref="REQ-PAY-006">
  <description>Combined payment split across invoices</description>
  <inputs>Payment: R6,000; Invoice 1: R3,000; Invoice 2: R3,000 (same parent)</inputs>
  <expected>Both invoices marked PAID; allocation recorded correctly</expected>
</test_case>

<test_case id="TC-PAY-004" type="integration" req_ref="REQ-PAY-002">
  <description>Claude Code agent matches by payer name when reference unclear</description>
  <steps>
    1. Create invoice for "John Smith" parent
    2. Import payment with reference "JOHN S SCHOOL FEES" and matching amount
    3. Run matching agent
  </steps>
  <expected>Match suggested with confidence > 70%; payer name match highlighted</expected>
</test_case>

<test_case id="TC-PAY-005" type="integration" req_ref="REQ-PAY-004">
  <description>Ambiguous payment flagged for review</description>
  <steps>
    1. Import payment with amount that matches multiple invoices
    2. Reference doesn't match any invoice number
    3. Run matching process
  </steps>
  <expected>Payment flagged; multiple suggested matches shown; requires human selection</expected>
</test_case>

<test_case id="TC-PAY-006" type="integration" req_ref="REQ-PAY-007">
  <description>Arrears dashboard shows correct aging</description>
  <steps>
    1. Create invoices with due dates 15, 45, and 95 days ago
    2. Leave all unpaid
    3. View arrears dashboard
  </steps>
  <expected>Three aging buckets populated correctly; totals accurate</expected>
</test_case>

<test_case id="TC-PAY-007" type="integration" req_ref="REQ-PAY-009">
  <description>Automated reminder sent on schedule</description>
  <steps>
    1. Create invoice with due date 7 days ago
    2. Configure 7-day reminder
    3. Run reminder job
    4. Check email sent
  </steps>
  <expected>Reminder email sent to parent; reminder logged</expected>
</test_case>

<test_case id="TC-PAY-008" type="e2e" story_ref="US-PAY-001">
  <description>Complete payment matching workflow</description>
  <steps>
    1. Generate invoices for 5 children
    2. Import bank statement with various payment patterns
    3. Verify auto-matches applied
    4. Review and resolve flagged payments
    5. Check all payments allocated
    6. Verify Xero sync
  </steps>
  <expected>All payments allocated; invoices updated; Xero synced</expected>
</test_case>

<test_case id="TC-PAY-009" type="unit" req_ref="REQ-PAY-012">
  <description>Arrears report export to PDF</description>
  <inputs>Arrears data with 10 parents; various amounts</inputs>
  <expected>PDF generated with header, summary, and detailed table</expected>
</test_case>

</test_plan>

</functional_spec>

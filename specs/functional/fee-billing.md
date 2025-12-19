<functional_spec id="SPEC-BILL" version="1.0">

<metadata>
  <title>Automated Fee Billing System</title>
  <status>approved</status>
  <owner>CrecheBooks Product Team</owner>
  <last_updated>2025-12-19</last_updated>
  <related_specs>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
  </related_specs>
</metadata>

<overview>
The Fee Billing system automates the generation, delivery, and tracking of school fee invoices for enrolled children. It integrates with Xero to create invoices as drafts for owner review before sending.

The system supports South African creche-specific billing needs including variable fee structures (full-day, half-day, sibling discounts), pro-rata calculations for mid-month enrollment changes, and multi-channel delivery (email, WhatsApp). This reduces invoice generation from 2-3 hours of manual work to under 5 minutes of review and approval.
</overview>

<user_stories>

<story id="US-BILL-001" priority="must-have">
  <narrative>
    As a creche owner
    I want monthly invoices automatically generated for all enrolled children
    So that I don't have to create invoices manually each month
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-BILL-001a">
      <given>I have configured invoice generation for the 1st of each month</given>
      <when>It is the 1st of the month at 6:00 AM</when>
      <then>Draft invoices are automatically generated for all enrolled children</then>
    </criterion>
    <criterion id="AC-BILL-001b">
      <given>An invoice has been generated</given>
      <when>I view the invoice</when>
      <then>It includes child name, parent details, fee breakdown, due date, and payment instructions</then>
    </criterion>
    <criterion id="AC-BILL-001c">
      <given>Invoices have been generated</given>
      <when>I view them in the system</when>
      <then>They appear as DRAFT status in both CrecheBooks and Xero</then>
    </criterion>
    <criterion id="AC-BILL-001d">
      <given>A child has sibling discounts, half-day fees, or ad-hoc charges</given>
      <when>Their invoice is generated</when>
      <then>All fees are correctly calculated and displayed as line items</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-BILL-002" priority="must-have">
  <narrative>
    As a creche owner
    I want invoices automatically sent to parents via their preferred channel
    So that parents receive invoices promptly without manual effort
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-BILL-002a">
      <given>I have approved a batch of invoices</given>
      <when>I click "Send All"</when>
      <then>Invoices are sent via each parent's preferred channel (email or WhatsApp)</then>
    </criterion>
    <criterion id="AC-BILL-002b">
      <given>An invoice has been sent</given>
      <when>I view the invoice status</when>
      <then>I can see the delivery status (sent, delivered, opened, failed)</then>
    </criterion>
    <criterion id="AC-BILL-002c">
      <given>An invoice delivery has failed</given>
      <when>I view my dashboard</when>
      <then>The failed delivery is prominently flagged for manual follow-up</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-BILL-003" priority="should-have">
  <narrative>
    As a creche owner
    I want to manage enrollment and fee structures in the system
    So that invoice generation reflects current attendance and pricing
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-BILL-003a">
      <given>I want to add a new child</given>
      <when>I complete the enrollment form</when>
      <then>The system stores child details, parent contact info, start date, and fee tier</then>
    </criterion>
    <criterion id="AC-BILL-003b">
      <given>I want to configure fee structures</given>
      <when>I access the fee configuration</when>
      <then>I can set monthly fees, registration fees, extras, and sibling discounts</then>
    </criterion>
    <criterion id="AC-BILL-003c">
      <given>A child enrolls or withdraws mid-month</given>
      <when>An invoice is generated</when>
      <then>The system calculates pro-rata fees correctly based on actual days</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-BILL-004" priority="should-have">
  <narrative>
    As a creche owner
    I want to add ad-hoc charges to a child's account
    So that I can bill for extra services (field trips, supplies, late pickups)
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-BILL-004a">
      <given>I want to add an extra charge</given>
      <when>I select a child and add an ad-hoc charge</when>
      <then>The charge is added to the next invoice or can be invoiced immediately</then>
    </criterion>
    <criterion id="AC-BILL-004b">
      <given>An ad-hoc charge has been added</given>
      <when>The invoice is generated</when>
      <then>The charge appears as a separate line item with description</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-BILL-001" story_ref="US-BILL-001" priority="must">
  <description>System generates monthly invoices for all enrolled children</description>
  <rationale>Core billing automation eliminates manual invoice creation</rationale>
</requirement>

<requirement id="REQ-BILL-002" story_ref="US-BILL-001" priority="must">
  <description>Invoice generation date configurable per creche (default: 1st of month)</description>
  <rationale>Different creches may have different billing cycles</rationale>
</requirement>

<requirement id="REQ-BILL-003" story_ref="US-BILL-001" priority="must">
  <description>Invoices created as DRAFT status in Xero for owner review</description>
  <rationale>Human approval required before sending; prevent erroneous invoices</rationale>
</requirement>

<requirement id="REQ-BILL-004" story_ref="US-BILL-001" priority="must">
  <description>Invoices include child name, parent details, fee breakdown, due date, payment instructions</description>
  <rationale>Complete information enables parent to understand and pay correctly</rationale>
</requirement>

<requirement id="REQ-BILL-005" story_ref="US-BILL-001" priority="must">
  <description>Variable fee structures supported: full-day, half-day, sibling discounts, extras</description>
  <rationale>Creches have diverse pricing models requiring flexibility</rationale>
</requirement>

<requirement id="REQ-BILL-006" story_ref="US-BILL-002" priority="must">
  <description>Invoices sent via email using Xero or custom templates</description>
  <rationale>Email is primary delivery channel for professional invoicing</rationale>
</requirement>

<requirement id="REQ-BILL-007" story_ref="US-BILL-002" priority="should">
  <description>WhatsApp invoice delivery via approved business API</description>
  <rationale>WhatsApp is preferred communication channel for many SA parents</rationale>
</requirement>

<requirement id="REQ-BILL-008" story_ref="US-BILL-002" priority="should">
  <description>Track invoice delivery status (sent, delivered, opened, failed)</description>
  <rationale>Visibility into delivery enables follow-up on failed deliveries</rationale>
</requirement>

<requirement id="REQ-BILL-009" story_ref="US-BILL-003" priority="must">
  <description>Enrollment register maintained with child, parent, start date, end date, fee tier</description>
  <rationale>Enrollment data is foundation for accurate invoice generation</rationale>
</requirement>

<requirement id="REQ-BILL-010" story_ref="US-BILL-003" priority="should">
  <description>Pro-rata fee calculation for mid-month enrollment changes</description>
  <rationale>Fair billing for partial month attendance</rationale>
</requirement>

<requirement id="REQ-BILL-011" story_ref="US-BILL-004" priority="should">
  <description>Ad-hoc charges can be added to child accounts</description>
  <rationale>Extras and one-time fees need billing mechanism</rationale>
</requirement>

<requirement id="REQ-BILL-012" story_ref="US-BILL-001" priority="must">
  <description>VAT calculated correctly on fee invoices based on creche VAT registration status</description>
  <rationale>Tax compliance requires accurate VAT calculation</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-BILL-001" req_ref="REQ-BILL-001">
  <scenario>Child enrolled mid-month (e.g., 15th of month)</scenario>
  <expected_behavior>Generate pro-rata invoice for remaining days; calculation shown as line item (e.g., "Monthly Fee (15 days of 30 days) R1,500.00"); next month full fee</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-002" req_ref="REQ-BILL-001">
  <scenario>Child withdrawn mid-month (e.g., leaves on 10th)</scenario>
  <expected_behavior>If invoice already sent, generate credit note for unused days; if invoice not sent, generate pro-rata final invoice; mark enrollment as ended</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-003" req_ref="REQ-BILL-005">
  <scenario>Sibling discount applied, but one sibling withdraws</scenario>
  <expected_behavior>Recalculate discount for remaining siblings from effective date; notify owner of discount change; do not retroactively change previous invoices</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-004" req_ref="REQ-BILL-006">
  <scenario>Parent email bounces (invalid address)</scenario>
  <expected_behavior>Mark delivery as "failed - invalid email"; flag for manual follow-up; suggest WhatsApp as alternative; retain invoice for re-send after correction</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-005" req_ref="REQ-BILL-007">
  <scenario>WhatsApp number is invalid or user has blocked business</scenario>
  <expected_behavior>Fall back to email delivery; log WhatsApp failure; notify owner; mark contact for verification</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-006" req_ref="REQ-BILL-009">
  <scenario>Duplicate enrollment entry detected (same child name, same parent)</scenario>
  <expected_behavior>Validation prevents save; display "A child with this name already exists for this parent. Did you mean to update the existing enrollment?"; offer merge option</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-007" req_ref="REQ-BILL-005">
  <scenario>Fee structure changes mid-year (e.g., annual increase)</scenario>
  <expected_behavior>Apply new fee from specified effective date; invoices before effective date use old fee; invoices after use new fee; do not retroactively modify sent invoices</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-008" req_ref="REQ-BILL-002">
  <scenario>Invoice generation date falls on weekend or public holiday</scenario>
  <expected_behavior>Generate on the configured date regardless (system runs 24/7); owner can review and send on next business day; no automatic adjustment</expected_behavior>
</edge_case>

<edge_case id="EC-BILL-009" req_ref="REQ-BILL-012">
  <scenario>Creche crosses VAT registration threshold mid-year</scenario>
  <expected_behavior>Alert owner when approaching R1M turnover; after registration confirmed, apply VAT to invoices from registration date; historical invoices unchanged</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-BILL-001" http_code="422">
  <condition>Invoice generation attempted but no children enrolled</condition>
  <message>No invoices generated. There are no children currently enrolled. Add children in the Enrollment section first.</message>
  <recovery>Redirect to enrollment; provide setup guide</recovery>
</error>

<error id="ERR-BILL-002" http_code="400">
  <condition>Fee structure not configured for child's tier</condition>
  <message>Cannot generate invoice for {child_name}. Fee tier "{tier}" has no configured fee amount.</message>
  <recovery>Highlight affected children; link to fee configuration; allow skip or batch fix</recovery>
</error>

<error id="ERR-BILL-003" http_code="502">
  <condition>Xero API unavailable when creating invoices</condition>
  <message>Unable to create invoices in Xero. Invoices saved locally and will sync when connection is restored.</message>
  <recovery>Save drafts locally; queue for sync; show sync status; allow manual retry</recovery>
</error>

<error id="ERR-BILL-004" http_code="400">
  <condition>Parent has no email or WhatsApp configured</condition>
  <message>Cannot send invoice to {parent_name}. No contact method configured. Please add email or WhatsApp number.</message>
  <recovery>Highlight affected invoices; link to parent contact edit; allow bulk skip</recovery>
</error>

<error id="ERR-BILL-005" http_code="409">
  <condition>Invoice already exists for this child and period</condition>
  <message>An invoice for {child_name} for {period} already exists. Would you like to view the existing invoice or create a credit note?</message>
  <recovery>Show existing invoice; offer credit note creation; prevent duplicate</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-BILL-001" type="unit" req_ref="REQ-BILL-001">
  <description>Invoice generation creates correct invoice data</description>
  <inputs>Child enrolled full-day at R3,000/month; no discounts</inputs>
  <expected>Invoice with one line item: "Monthly School Fee - R3,000.00"</expected>
</test_case>

<test_case id="TC-BILL-002" type="unit" req_ref="REQ-BILL-005">
  <description>Sibling discount calculated correctly</description>
  <inputs>Two children enrolled; second child has 10% sibling discount; base fee R3,000</inputs>
  <expected>Child 1: R3,000; Child 2: R2,700 (R3,000 - R300 discount)</expected>
</test_case>

<test_case id="TC-BILL-003" type="unit" req_ref="REQ-BILL-010">
  <description>Pro-rata calculation for mid-month enrollment</description>
  <inputs>Child enrolled on 15th of 30-day month; monthly fee R3,000</inputs>
  <expected>Invoice amount: R1,500 (16 days of 30 days); calculation shown in description</expected>
</test_case>

<test_case id="TC-BILL-004" type="unit" req_ref="REQ-BILL-012">
  <description>VAT calculation for VAT-registered creche</description>
  <inputs>Fee R3,000; VAT rate 15%; creche is VAT registered</inputs>
  <expected>Line item: R3,000; VAT: R450; Total: R3,450</expected>
</test_case>

<test_case id="TC-BILL-005" type="integration" req_ref="REQ-BILL-003">
  <description>Invoice created as draft in Xero</description>
  <steps>
    1. Generate invoice for enrolled child
    2. Sync to Xero
    3. Check invoice status in Xero
  </steps>
  <expected>Invoice exists in Xero with DRAFT status</expected>
</test_case>

<test_case id="TC-BILL-006" type="integration" req_ref="REQ-BILL-006">
  <description>Invoice sent via email successfully</description>
  <steps>
    1. Generate and approve invoice
    2. Trigger email send
    3. Check delivery status
  </steps>
  <expected>Email sent; delivery status updated to "sent"</expected>
</test_case>

<test_case id="TC-BILL-007" type="e2e" story_ref="US-BILL-001">
  <description>Complete monthly billing cycle</description>
  <steps>
    1. Configure 5 enrolled children with various fee tiers
    2. Trigger invoice generation
    3. Review draft invoices
    4. Approve and send
    5. Verify invoices in Xero
    6. Verify delivery statuses
  </steps>
  <expected>5 invoices created, synced to Xero, and delivered successfully</expected>
</test_case>

<test_case id="TC-BILL-008" type="performance" req_ref="REQ-BILL-001">
  <description>Invoice batch generation performance</description>
  <inputs>100 enrolled children with various fee structures</inputs>
  <expected>All invoices generated in under 60 seconds</expected>
</test_case>

</test_plan>

</functional_spec>

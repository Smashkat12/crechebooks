<functional_spec id="SPEC-SARS" version="1.0">

<metadata>
  <title>SARS Compliance Engine</title>
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
The SARS Compliance Engine calculates and generates South African tax submissions including VAT201 (Value Added Tax), EMP201 (employer monthly tax), and IRP5 (employee annual tax certificates). Using Claude Code AI agents, it processes categorized transactions and payroll data to produce submission-ready reports.

This is a high-stakes domain requiring human oversight. All SARS calculations operate at L2 (Collaborator) autonomy level - the agent prepares submissions but human review and approval is mandatory before any submission. The system tracks deadlines, sends reminders, and maintains complete audit trails for compliance.
</overview>

<user_stories>

<story id="US-SARS-001" priority="must-have">
  <narrative>
    As a creche owner
    I want VAT calculations and returns automatically prepared
    So that I submit accurate VAT201 returns on time
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-SARS-001a">
      <given>I have categorized transactions for the VAT period</given>
      <when>I generate a VAT report</when>
      <then>Output VAT (on invoices) and input VAT (on expenses) are calculated correctly</then>
    </criterion>
    <criterion id="AC-SARS-001b">
      <given>VAT calculations are complete</given>
      <when>I view the VAT201 draft</when>
      <then>The return is formatted according to SARS specifications</then>
    </criterion>
    <criterion id="AC-SARS-001c">
      <given>Some transactions are missing VAT details</given>
      <when>I generate the VAT report</when>
      <then>These items are flagged for review before finalizing</then>
    </criterion>
    <criterion id="AC-SARS-001d">
      <given>I need to review historical submissions</given>
      <when>I access VAT history</when>
      <then>I can view all past VAT201 returns with full details</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-SARS-002" priority="must-have">
  <narrative>
    As a creche owner
    I want PAYE and UIF calculations for my staff automatically prepared
    So that I submit accurate EMP201 returns on time
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-SARS-002a">
      <given>I have staff salaries recorded</given>
      <when>I generate the monthly payroll report</when>
      <then>PAYE is calculated per SARS tax tables for the current year</then>
    </criterion>
    <criterion id="AC-SARS-002b">
      <given>Staff salaries are processed</given>
      <when>I view UIF calculations</when>
      <then>Employee (1%) and employer (1%) contributions are correct, capped at R177.12 each</then>
    </criterion>
    <criterion id="AC-SARS-002c">
      <given>All payroll calculations are complete</given>
      <when>I generate EMP201</when>
      <then>The return is formatted according to SARS specifications</then>
    </criterion>
    <criterion id="AC-SARS-002d">
      <given>It is February (annual reconciliation)</given>
      <when>I generate IRP5 certificates</when>
      <then>Each employee has a correct IRP5 for the tax year</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-SARS-003" priority="should-have">
  <narrative>
    As a creche owner
    I want deadline reminders and submission tracking
    So that I never miss a SARS deadline
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-SARS-003a">
      <given>A SARS deadline is approaching</given>
      <when>It is 7 days before the deadline</when>
      <then>I receive a reminder notification</then>
    </criterion>
    <criterion id="AC-SARS-003b">
      <given>I have submitted a return</given>
      <when>I mark it as submitted</when>
      <then>The status is tracked and audit trail updated</then>
    </criterion>
    <criterion id="AC-SARS-003c">
      <given>It is 24 hours before deadline</given>
      <when>The return is not yet submitted</when>
      <then>I receive an urgent alert via SMS/email</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-SARS-001" story_ref="US-SARS-001" priority="must">
  <description>Calculate VAT output on school fee invoices</description>
  <rationale>Output VAT on sales is a regulatory requirement for VAT-registered creches</rationale>
</requirement>

<requirement id="REQ-SARS-002" story_ref="US-SARS-001" priority="must">
  <description>Calculate VAT input on categorized expenses with valid VAT invoices</description>
  <rationale>Input VAT claims reduce tax liability; requires valid documentation</rationale>
</requirement>

<requirement id="REQ-SARS-003" story_ref="US-SARS-001" priority="must">
  <description>Generate VAT201 return in SARS-compliant format</description>
  <rationale>Submission format must match SARS specifications for acceptance</rationale>
</requirement>

<requirement id="REQ-SARS-004" story_ref="US-SARS-001" priority="must">
  <description>Distinguish between zero-rated and VAT-exempt items</description>
  <rationale>Different tax treatments affect calculation and reporting</rationale>
</requirement>

<requirement id="REQ-SARS-005" story_ref="US-SARS-001" priority="should">
  <description>Flag expenses missing VAT invoice details (VAT number, address)</description>
  <rationale>Invalid invoices cannot be claimed for input VAT</rationale>
</requirement>

<requirement id="REQ-SARS-006" story_ref="US-SARS-002" priority="must">
  <description>Integrate payroll data (staff names, salaries, tax numbers)</description>
  <rationale>Payroll data is foundation for PAYE and UIF calculations</rationale>
</requirement>

<requirement id="REQ-SARS-007" story_ref="US-SARS-002" priority="must">
  <description>Calculate PAYE per current SARS tax tables with correct brackets and rebates</description>
  <rationale>Regulatory requirement; incorrect calculations result in penalties</rationale>
</requirement>

<requirement id="REQ-SARS-008" story_ref="US-SARS-002" priority="must">
  <description>Calculate UIF at statutory rates (1% employee, 1% employer, max R177.12 each)</description>
  <rationale>UIF contribution is mandatory for all employees</rationale>
</requirement>

<requirement id="REQ-SARS-009" story_ref="US-SARS-002" priority="must">
  <description>Generate EMP201 return in SARS-compliant format</description>
  <rationale>Monthly employer submission to SARS</rationale>
</requirement>

<requirement id="REQ-SARS-010" story_ref="US-SARS-002" priority="must">
  <description>Generate IRP5 certificates for each employee annually</description>
  <rationale>Employees need IRP5 for personal tax returns</rationale>
</requirement>

<requirement id="REQ-SARS-011" story_ref="US-SARS-003" priority="should">
  <description>Maintain SARS deadline calendar with automatic reminders</description>
  <rationale>Missed deadlines result in penalties and interest</rationale>
</requirement>

<requirement id="REQ-SARS-012" story_ref="US-SARS-003" priority="should">
  <description>Track submission status (draft, submitted, acknowledged)</description>
  <rationale>Audit trail for compliance verification</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-SARS-001" req_ref="REQ-SARS-002">
  <scenario>Expense invoice missing supplier VAT number</scenario>
  <expected_behavior>Flag expense as "VAT claim pending"; exclude from input VAT calculation; highlight for review; allow manual override with reason if supplier is not VAT registered</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-002" req_ref="REQ-SARS-004">
  <scenario>Uncertain if expense item is zero-rated or exempt</scenario>
  <expected_behavior>Flag for review with guidance: "Zero-rated items (0% VAT) can claim input VAT; Exempt items cannot claim. Common creche items: [guidance list]"; require human confirmation</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-003" req_ref="REQ-SARS-007">
  <scenario>SARS tax tables change mid-year (e.g., budget announcement)</scenario>
  <expected_behavior>System updated with new tables including effective date; calculations before effective date use old tables; calculations after use new tables; alert owner of change</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-004" req_ref="REQ-SARS-007">
  <scenario>Employee has income from multiple employers</scenario>
  <expected_behavior>Display warning: "Employee may have income from other sources. PAYE calculated based on this income only. Employee may need to apply for a tax directive."; suggest IRP3 process</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-005" req_ref="REQ-SARS-006">
  <scenario>Casual or temporary staff added (hourly/daily rates)</scenario>
  <expected_behavior>Support hourly and daily rate input; annualize for tax calculation per SARS guidelines; prorate based on days/hours worked; calculate tax correctly even for irregular income</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-006" req_ref="REQ-SARS-010">
  <scenario>Staff member leaves employment mid-year</scenario>
  <expected_behavior>Generate IRP5 for period of employment; include termination date; calculate final PAYE correctly; allow generation at termination or wait for year-end</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-007" req_ref="REQ-SARS-001">
  <scenario>Creche turnover approaching VAT registration threshold (R1M)</scenario>
  <expected_behavior>Track cumulative turnover; alert at R800K (approaching); alert at R950K (imminent); alert at R1M (must register); provide VAT registration guidance</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-008" req_ref="REQ-SARS-008">
  <scenario>Employee salary exceeds UIF contribution ceiling</scenario>
  <expected_behavior>Cap UIF contribution at maximum (R177.12 per month for employee and employer); display ceiling reached indicator; do not calculate on excess salary</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-009" req_ref="REQ-SARS-007">
  <scenario>Employee qualifies for medical aid tax credit</scenario>
  <expected_behavior>Capture medical aid member details; apply Section 6A credit; reduce PAYE by correct monthly amount per dependents; validate against SARS tables</expected_behavior>
</edge_case>

<edge_case id="EC-SARS-010" req_ref="REQ-SARS-003">
  <scenario>VAT201 submission fails due to SARS system error</scenario>
  <expected_behavior>Retain submission-ready document; log attempt; suggest alternative submission methods (eFiling direct, branch); track as "submission attempted"</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-SARS-001" http_code="422">
  <condition>VAT calculation attempted but no transactions categorized for period</condition>
  <message>No transactions found for the VAT period {period}. Please ensure transactions are imported and categorized first.</message>
  <recovery>Link to transaction import; show categorization status</recovery>
</error>

<error id="ERR-SARS-002" http_code="422">
  <condition>EMP201 calculation but no payroll data entered</condition>
  <message>No payroll data available for {month}. Please enter staff salaries before generating EMP201.</message>
  <recovery>Link to payroll entry; provide setup guidance</recovery>
</error>

<error id="ERR-SARS-003" http_code="400">
  <condition>Tax calculation uses outdated tax tables</condition>
  <message>Warning: Tax tables may be outdated. Current tables effective from {date}. Please verify you have the latest tax tables.</message>
  <recovery>Check for updates; manual override available; flag for accountant review</recovery>
</error>

<error id="ERR-SARS-004" http_code="400">
  <condition>Employee missing tax number (no IRP5 can be issued)</condition>
  <message>Cannot generate IRP5 for {employee}. Tax reference number is missing.</message>
  <recovery>Prompt to enter tax number; allow generation of draft for review; warn about compliance</recovery>
</error>

<error id="ERR-SARS-005" http_code="409">
  <condition>Attempt to modify finalized submission</condition>
  <message>This {submission_type} has been marked as submitted and cannot be modified. If corrections are needed, please create an amended return.</message>
  <recovery>Show original submission; offer amendment workflow; maintain audit trail</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-SARS-001" type="unit" req_ref="REQ-SARS-001">
  <description>VAT output calculation on invoices</description>
  <inputs>10 invoices totaling R100,000 excl VAT; VAT rate 15%</inputs>
  <expected>Output VAT: R15,000; Total incl VAT: R115,000</expected>
</test_case>

<test_case id="TC-SARS-002" type="unit" req_ref="REQ-SARS-002">
  <description>VAT input calculation on expenses</description>
  <inputs>Expenses totaling R50,000 incl VAT; all with valid VAT invoices</inputs>
  <expected>Input VAT: R6,521.74 (R50,000 * 15/115); claimable amount</expected>
</test_case>

<test_case id="TC-SARS-003" type="unit" req_ref="REQ-SARS-007">
  <description>PAYE calculation for standard employee</description>
  <inputs>Monthly salary: R25,000; No medical aid; Under 65</inputs>
  <expected>Annual equivalent: R300,000; Tax bracket: 26%; PAYE calculated correctly with rebates</expected>
</test_case>

<test_case id="TC-SARS-004" type="unit" req_ref="REQ-SARS-008">
  <description>UIF calculation with ceiling</description>
  <inputs>Monthly salary: R20,000</inputs>
  <expected>Employee UIF: R177.12 (capped); Employer UIF: R177.12 (capped)</expected>
</test_case>

<test_case id="TC-SARS-005" type="unit" req_ref="REQ-SARS-008">
  <description>UIF calculation below ceiling</description>
  <inputs>Monthly salary: R10,000</inputs>
  <expected>Employee UIF: R100.00 (1%); Employer UIF: R100.00 (1%)</expected>
</test_case>

<test_case id="TC-SARS-006" type="integration" req_ref="REQ-SARS-003">
  <description>VAT201 format validation</description>
  <steps>
    1. Generate VAT201 for test period
    2. Validate all required fields present
    3. Verify calculations match field specifications
  </steps>
  <expected>VAT201 document passes format validation</expected>
</test_case>

<test_case id="TC-SARS-007" type="integration" req_ref="REQ-SARS-009">
  <description>EMP201 format validation</description>
  <steps>
    1. Generate EMP201 with payroll data
    2. Validate PAYE, UIF, SDL fields
    3. Verify employee count and totals
  </steps>
  <expected>EMP201 document passes format validation</expected>
</test_case>

<test_case id="TC-SARS-008" type="integration" req_ref="REQ-SARS-010">
  <description>IRP5 generation for full year employee</description>
  <steps>
    1. Enter 12 months of salary data
    2. Generate IRP5
    3. Verify all income codes and tax calculations
  </steps>
  <expected>IRP5 contains correct annual totals; tax reconciles</expected>
</test_case>

<test_case id="TC-SARS-009" type="e2e" story_ref="US-SARS-001">
  <description>Complete VAT filing workflow</description>
  <steps>
    1. Import and categorize transactions
    2. Generate VAT201 draft
    3. Review flagged items
    4. Resolve issues
    5. Finalize and mark submitted
  </steps>
  <expected>VAT201 generated; all items resolved; audit trail complete</expected>
</test_case>

<test_case id="TC-SARS-010" type="unit" req_ref="REQ-SARS-011">
  <description>Deadline reminder generation</description>
  <inputs>Current date: 18th; VAT deadline: 25th</inputs>
  <expected>7-day reminder triggered; notification sent</expected>
</test_case>

</test_plan>

</functional_spec>

<functional_spec id="SPEC-RECON" version="1.0">

<metadata>
  <title>Intelligent Reconciliation System</title>
  <status>approved</status>
  <owner>CrecheBooks Product Team</owner>
  <last_updated>2025-12-19</last_updated>
  <related_specs>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
  </related_specs>
</metadata>

<overview>
The Reconciliation system automatically matches bank transactions with accounting records to ensure books balance correctly. It performs daily transaction matching, monthly bank reconciliation, and provides audit-ready financial reporting.

The system operates at L4 (Approver) autonomy for clear matches, automatically reconciling transactions that have matching amounts, dates, and references. Discrepancies are flagged for human review, ensuring accuracy while minimizing manual effort. Complete audit trails support both internal review and external audit requirements.
</overview>

<user_stories>

<story id="US-RECON-001" priority="must-have">
  <narrative>
    As a creche owner
    I want monthly bank reconciliation to happen automatically
    So that I know my books match my bank balance
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-RECON-001a">
      <given>Transactions have been imported and categorized</given>
      <when>I run the reconciliation process</when>
      <then>Matching transactions are automatically marked as reconciled</then>
    </criterion>
    <criterion id="AC-RECON-001b">
      <given>Reconciliation has completed</given>
      <when>There are unmatched transactions</when>
      <then>Discrepancies are clearly flagged with suggested resolutions</then>
    </criterion>
    <criterion id="AC-RECON-001c">
      <given>I view the reconciliation summary</given>
      <when>All transactions are reconciled</when>
      <then>Opening balance + transactions = closing balance (within R0.01)</then>
    </criterion>
    <criterion id="AC-RECON-001d">
      <given>Xero has transactions that aren't in the bank feed</given>
      <when>I review discrepancies</when>
      <then>These are flagged as potential manual entries needing verification</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-RECON-002" priority="should-have">
  <narrative>
    As a creche owner
    I want audit-ready financial statements
    So that I can satisfy auditor or investor requests quickly
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-RECON-002a">
      <given>I need to provide financial statements</given>
      <when>I request an Income Statement</when>
      <then>A Profit & Loss report is generated for the selected period</then>
    </criterion>
    <criterion id="AC-RECON-002b">
      <given>I need a Balance Sheet</given>
      <when>I request the Balance Sheet</when>
      <then>Assets, liabilities, and equity are correctly calculated and displayed</then>
    </criterion>
    <criterion id="AC-RECON-002c">
      <given>An auditor asks about a specific transaction</given>
      <when>I click on any line item</when>
      <then>I can drill down to source documents and full audit trail</then>
    </criterion>
    <criterion id="AC-RECON-002d">
      <given>I need SA-compliant reports</given>
      <when>Reports are generated</when>
      <then>Formatting follows South African accounting standards</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-RECON-003" priority="should-have">
  <narrative>
    As a creche owner
    I want a clear audit trail for all financial changes
    So that I can demonstrate compliance and track who made what changes
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-RECON-003a">
      <given>Any financial data is modified</given>
      <when>The change is saved</when>
      <then>An audit record captures timestamp, user, before value, after value</then>
    </criterion>
    <criterion id="AC-RECON-003b">
      <given>I want to review transaction history</given>
      <when>I view the audit log</when>
      <then>I can filter by date, user, transaction type, or amount</then>
    </criterion>
    <criterion id="AC-RECON-003c">
      <given>A reconciled transaction exists</given>
      <when>Someone tries to delete it</when>
      <then>The system prevents deletion; requires unreconcile first with reason</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-RECON-001" story_ref="US-RECON-001" priority="must">
  <description>Automatic bank reconciliation matching bank transactions to Xero records</description>
  <rationale>Core reconciliation automation ensures books balance</rationale>
</requirement>

<requirement id="REQ-RECON-002" story_ref="US-RECON-001" priority="must">
  <description>Matched transactions automatically marked as reconciled</description>
  <rationale>Clear status reduces manual tracking</rationale>
</requirement>

<requirement id="REQ-RECON-003" story_ref="US-RECON-001" priority="must">
  <description>Discrepancies flagged with type classification and suggested resolution</description>
  <rationale>Guided resolution reduces investigation time</rationale>
</requirement>

<requirement id="REQ-RECON-004" story_ref="US-RECON-001" priority="should">
  <description>Reconciliation summary shows opening balance, transactions, closing balance</description>
  <rationale>Traditional reconciliation format for verification</rationale>
</requirement>

<requirement id="REQ-RECON-005" story_ref="US-RECON-002" priority="should">
  <description>Income Statement (Profit & Loss) generated on demand</description>
  <rationale>Standard financial report for performance visibility</rationale>
</requirement>

<requirement id="REQ-RECON-006" story_ref="US-RECON-002" priority="should">
  <description>Balance Sheet generated on demand</description>
  <rationale>Standard financial report for financial position</rationale>
</requirement>

<requirement id="REQ-RECON-007" story_ref="US-RECON-002, US-RECON-003" priority="must">
  <description>Complete transaction audit trail maintained</description>
  <rationale>Compliance requirement; supports audits and dispute resolution</rationale>
</requirement>

<requirement id="REQ-RECON-008" story_ref="US-RECON-002" priority="should">
  <description>Reports formatted for South African accounting standards</description>
  <rationale>Local compliance and professional presentation</rationale>
</requirement>

<requirement id="REQ-RECON-009" story_ref="US-RECON-003" priority="must">
  <description>Audit log captures all financial data changes with full context</description>
  <rationale>Immutable audit trail for compliance</rationale>
</requirement>

<requirement id="REQ-RECON-010" story_ref="US-RECON-003" priority="must">
  <description>Reconciled transactions cannot be deleted without unreconcile process</description>
  <rationale>Data integrity protection</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-RECON-001" req_ref="REQ-RECON-001">
  <scenario>Bank closing balance doesn't match Xero closing balance</scenario>
  <expected_behavior>Display discrepancy amount prominently; list all unreconciled items; categorize as: "In bank, not in Xero", "In Xero, not in bank", "Amount mismatch"; suggest resolution for each</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-002" req_ref="REQ-RECON-003">
  <scenario>Duplicate transaction imported from bank feed</scenario>
  <expected_behavior>Detect duplicate (same date, amount, reference); flag for review with "Possible duplicate" warning; show both transactions; allow: keep both, delete one, or merge</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-003" req_ref="REQ-RECON-003">
  <scenario>Transaction exists in Xero but not in bank feed (manual entry)</scenario>
  <expected_behavior>Flag as "Manual entry - not in bank"; may be legitimate (cash transaction) or error; require classification: Cash, Journal Entry, or Error; if Error, allow reversal</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-004" req_ref="REQ-RECON-001">
  <scenario>Bank feed has lag - recent transactions not yet appearing</scenario>
  <expected_behavior>Display bank feed last updated timestamp; do not mark recent Xero transactions as discrepancies until feed catches up; show "Pending bank confirmation" status</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-005" req_ref="REQ-RECON-010">
  <scenario>User attempts to delete a reconciled transaction</scenario>
  <expected_behavior>Block deletion; display "This transaction has been reconciled and cannot be deleted. To remove it, first unreconcile (requires reason), then delete."; audit log captures attempt</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-006" req_ref="REQ-RECON-001">
  <scenario>Transaction date in bank differs from date in Xero (timing difference)</scenario>
  <expected_behavior>Match on amount and reference if dates within 3 business days; flag as "Timing difference" if matched; allow manual date adjustment with audit trail</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-007" req_ref="REQ-RECON-005">
  <scenario>Income statement period spans multiple financial years</scenario>
  <expected_behavior>Support cross-year reporting; clearly show year boundaries; ensure correct treatment of opening balances; warn if period seems unusual</expected_behavior>
</edge_case>

<edge_case id="EC-RECON-008" req_ref="REQ-RECON-007">
  <scenario>Audit trail grows very large (years of data)</scenario>
  <expected_behavior>Maintain full audit trail per retention policy (5 years); archive older data; ensure queries remain performant; support filtered searches</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-RECON-001" http_code="422">
  <condition>Reconciliation attempted but no transactions in period</condition>
  <message>No transactions found for {period}. Please ensure bank transactions are imported for this period.</message>
  <recovery>Show import status; link to bank import; suggest date range check</recovery>
</error>

<error id="ERR-RECON-002" http_code="422">
  <condition>Opening balance not set for reconciliation</condition>
  <message>Opening balance not configured. Please set the opening balance before running reconciliation.</message>
  <recovery>Prompt for opening balance entry; suggest using bank statement balance</recovery>
</error>

<error id="ERR-RECON-003" http_code="409">
  <condition>Attempt to unreconcile without reason</condition>
  <message>A reason is required to unreconcile this transaction. This ensures audit trail completeness.</message>
  <recovery>Present reason input field; require non-empty reason; log reason in audit</recovery>
</error>

<error id="ERR-RECON-004" http_code="502">
  <condition>Xero sync fails during reconciliation</condition>
  <message>Unable to sync with Xero. Reconciliation is based on locally stored data which may be outdated.</message>
  <recovery>Show last sync time; allow continue with warning; suggest retry sync first</recovery>
</error>

<error id="ERR-RECON-005" http_code="400">
  <condition>Report generation fails due to incomplete data</condition>
  <message>Cannot generate {report_type}. The following accounts have uncategorized transactions: {accounts}</message>
  <recovery>Link to uncategorized transactions; allow generation with warnings</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-RECON-001" type="unit" req_ref="REQ-RECON-001">
  <description>Exact match reconciliation</description>
  <inputs>Bank: R1,000 on 2025-01-15 "SUPPLIER A"; Xero: R1,000 on 2025-01-15 "SUPPLIER A"</inputs>
  <expected>Transactions matched and reconciled automatically</expected>
</test_case>

<test_case id="TC-RECON-002" type="unit" req_ref="REQ-RECON-003">
  <description>Discrepancy detection - amount mismatch</description>
  <inputs>Bank: R1,000; Xero: R1,050 (same date, same reference)</inputs>
  <expected>Flagged as "Amount mismatch - R50 difference"</expected>
</test_case>

<test_case id="TC-RECON-003" type="unit" req_ref="REQ-RECON-003">
  <description>Discrepancy detection - missing from bank</description>
  <inputs>Xero has transaction; Bank feed does not</inputs>
  <expected>Flagged as "In Xero, not in bank - possible manual entry"</expected>
</test_case>

<test_case id="TC-RECON-004" type="unit" req_ref="REQ-RECON-004">
  <description>Reconciliation summary calculation</description>
  <inputs>Opening: R10,000; Deposits: R5,000; Withdrawals: R3,000</inputs>
  <expected>Closing: R12,000; Summary matches bank statement</expected>
</test_case>

<test_case id="TC-RECON-005" type="integration" req_ref="REQ-RECON-005">
  <description>Income Statement generation</description>
  <steps>
    1. Categorize income and expense transactions
    2. Generate Income Statement for period
    3. Verify totals
  </steps>
  <expected>Income, Expenses, Net Profit calculated correctly; format correct</expected>
</test_case>

<test_case id="TC-RECON-006" type="integration" req_ref="REQ-RECON-006">
  <description>Balance Sheet generation</description>
  <steps>
    1. Set up accounts with balances
    2. Generate Balance Sheet
    3. Verify Assets = Liabilities + Equity
  </steps>
  <expected>Balance sheet balances; format per SA standards</expected>
</test_case>

<test_case id="TC-RECON-007" type="integration" req_ref="REQ-RECON-007">
  <description>Audit trail captures changes</description>
  <steps>
    1. Create transaction
    2. Modify transaction amount
    3. View audit log
  </steps>
  <expected>Audit log shows: create event, modify event with before/after values</expected>
</test_case>

<test_case id="TC-RECON-008" type="integration" req_ref="REQ-RECON-010">
  <description>Reconciled transaction deletion blocked</description>
  <steps>
    1. Reconcile a transaction
    2. Attempt to delete
    3. Verify block
    4. Unreconcile with reason
    5. Delete successfully
  </steps>
  <expected>Deletion blocked initially; succeeds after unreconcile; audit trail complete</expected>
</test_case>

<test_case id="TC-RECON-009" type="e2e" story_ref="US-RECON-001">
  <description>Complete monthly reconciliation workflow</description>
  <steps>
    1. Import bank statement (50 transactions)
    2. Run reconciliation
    3. Review discrepancies (expect ~5)
    4. Resolve each discrepancy
    5. Verify closing balance matches
    6. Generate reconciliation report
  </steps>
  <expected>All transactions reconciled; balance matches; report generated</expected>
</test_case>

<test_case id="TC-RECON-010" type="unit" req_ref="REQ-RECON-009">
  <description>Audit log filtering</description>
  <inputs>100 audit entries across different dates, users, types</inputs>
  <expected>Filter by date, user, and type returns correct subsets</expected>
</test_case>

</test_plan>

</functional_spec>

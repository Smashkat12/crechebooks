<functional_spec id="SPEC-TRANS" version="1.0">

<metadata>
  <title>Smart Transaction Categorization</title>
  <status>approved</status>
  <owner>CrecheBooks Product Team</owner>
  <last_updated>2025-12-19</last_updated>
  <related_specs>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
    <spec_ref>SPEC-RECON</spec_ref>
  </related_specs>
</metadata>

<overview>
The Transaction Categorization system automatically imports bank transactions and categorizes them to the appropriate Chart of Accounts categories using Claude Code AI agents. This is the foundational capability that enables accurate financial reporting, VAT calculations, and audit-ready records.

The system learns from user corrections to continuously improve accuracy, targeting 95%+ automatic categorization after a 3-month training period. Low-confidence categorizations are flagged for human review, ensuring accuracy while minimizing manual effort.
</overview>

<user_stories>

<story id="US-TRANS-001" priority="must-have">
  <narrative>
    As a creche owner
    I want my bank transactions automatically categorized to the correct expense accounts
    So that I don't spend hours manually entering each transaction
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-TRANS-001a">
      <given>The system has been trained for at least 3 months on my transaction patterns</given>
      <when>New bank transactions are imported</when>
      <then>At least 95% are automatically categorized without human intervention</then>
    </criterion>
    <criterion id="AC-TRANS-001b">
      <given>A transaction has been imported</given>
      <when>The AI categorization confidence is below 80%</when>
      <then>The transaction is flagged for review within 24 hours of import</then>
    </criterion>
    <criterion id="AC-TRANS-001c">
      <given>I am reviewing a flagged transaction</given>
      <when>I correct the categorization</when>
      <then>I can do so with 2 clicks (select category, confirm)</then>
    </criterion>
    <criterion id="AC-TRANS-001d">
      <given>A transaction has been categorized</given>
      <when>The sync process runs</when>
      <then>The category is synced to Xero within 5 minutes</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-TRANS-002" priority="must-have">
  <narrative>
    As a creche owner
    I want the system to learn my specific expense patterns
    So that recurring payments (rent, utilities, food suppliers) are always correctly categorized
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-TRANS-002a">
      <given>I have transactions from the same payee with consistent amounts</given>
      <when>Three or more transactions have the same pattern</when>
      <then>The system identifies this as a recurring transaction</then>
    </criterion>
    <criterion id="AC-TRANS-002b">
      <given>I have manually corrected a categorization for a specific payee</given>
      <when>Two corrections for the same payee pattern have been made</when>
      <then>Future transactions from that payee are automatically categorized</then>
    </criterion>
    <criterion id="AC-TRANS-002c">
      <given>I have a recurring utility bill</given>
      <when>The amount varies within +/-30% of historical average</when>
      <then>The system still correctly categorizes the transaction</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-TRANS-003" priority="should-have">
  <narrative>
    As a creche owner
    I want to see why the AI categorized a transaction a certain way
    So that I can trust the system and correct its reasoning if wrong
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-TRANS-003a">
      <given>I am viewing a categorized transaction</given>
      <when>I click on the categorization</when>
      <then>I see a confidence score (0-100%) and reasoning text explaining the decision</then>
    </criterion>
    <criterion id="AC-TRANS-003b">
      <given>A transaction has been categorized with less than 80% confidence</given>
      <when>The transaction appears in my dashboard</when>
      <then>It is automatically marked with a "needs review" indicator</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-TRANS-004" priority="should-have">
  <narrative>
    As a creche owner
    I want to split a single transaction across multiple expense categories
    So that I can accurately track expenses when one payment covers multiple items
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-TRANS-004a">
      <given>I am viewing a transaction</given>
      <when>I select "Split Transaction"</when>
      <then>I can allocate portions to different categories</then>
    </criterion>
    <criterion id="AC-TRANS-004b">
      <given>I am splitting a transaction</given>
      <when>I enter the split amounts</when>
      <then>The system validates that split amounts equal the transaction total</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-TRANS-005" priority="should-have">
  <narrative>
    As a creche owner
    I want to manage vendor aliases
    So that the same supplier appearing with different names is correctly grouped
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-TRANS-005a">
      <given>The system detects potential payee variations (e.g., "WOOLWORTHS", "WOOLIES")</given>
      <when>Transactions are being processed</when>
      <then>I am prompted to confirm if these should be grouped</then>
    </criterion>
    <criterion id="AC-TRANS-005b">
      <given>I have confirmed a payee grouping</given>
      <when>Future transactions from any alias are imported</when>
      <then>They are automatically associated with the primary payee</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-TRANS-001" story_ref="US-TRANS-001" priority="must">
  <description>System imports bank transactions via Yodlee bank feed, PDF upload (FNB format), or CSV upload</description>
  <rationale>Multiple import methods support different bank integrations and fallback options</rationale>
</requirement>

<requirement id="REQ-TRANS-002" story_ref="US-TRANS-001" priority="must">
  <description>Claude Code agents categorize transactions to Xero Chart of Accounts categories</description>
  <rationale>AI categorization is the core value proposition for time savings</rationale>
</requirement>

<requirement id="REQ-TRANS-003" story_ref="US-TRANS-001" priority="must">
  <description>System achieves 95% categorization accuracy after 3-month training period</description>
  <rationale>High accuracy required for user trust and financial accuracy</rationale>
</requirement>

<requirement id="REQ-TRANS-004" story_ref="US-TRANS-003" priority="must">
  <description>Categorizations with confidence below 80% are flagged for human review</description>
  <rationale>Human-in-loop for uncertain decisions ensures accuracy</rationale>
</requirement>

<requirement id="REQ-TRANS-005" story_ref="US-TRANS-002" priority="must">
  <description>User corrections train the categorization model for future accuracy</description>
  <rationale>Continuous learning improves accuracy over time</rationale>
</requirement>

<requirement id="REQ-TRANS-006" story_ref="US-TRANS-002" priority="should">
  <description>System detects recurring transaction patterns by payee, amount pattern, and frequency</description>
  <rationale>Recurring transactions should have highest confidence categorization</rationale>
</requirement>

<requirement id="REQ-TRANS-007" story_ref="US-TRANS-003" priority="should">
  <description>Each categorization displays confidence score and reasoning explanation</description>
  <rationale>Explainability builds user trust and enables correction</rationale>
</requirement>

<requirement id="REQ-TRANS-008" story_ref="US-TRANS-001" priority="must">
  <description>Bi-directional sync with Xero for categories and transactions</description>
  <rationale>Xero is source of truth; sync ensures consistency</rationale>
</requirement>

<requirement id="REQ-TRANS-009" story_ref="US-TRANS-004" priority="should">
  <description>Split transactions supported (one payment allocated to multiple categories)</description>
  <rationale>Real-world complexity requires split transaction support</rationale>
</requirement>

<requirement id="REQ-TRANS-010" story_ref="US-TRANS-005" priority="should">
  <description>Payee aliases managed to group same vendor with different names</description>
  <rationale>Improves categorization accuracy for common variations</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-TRANS-001" req_ref="REQ-TRANS-002">
  <scenario>Transaction description is blank or contains only gibberish characters</scenario>
  <expected_behavior>Flag for manual review with "unrecognized" status; suggest category based on amount/date patterns if similar transactions exist</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-002" req_ref="REQ-TRANS-010">
  <scenario>Payee name varies significantly (e.g., "WOOLWORTHS SANDTON" vs "WOOLIES" vs "WW FOODS")</scenario>
  <expected_behavior>Alias detection algorithm identifies potential matches; prompt user to confirm grouping; store confirmed aliases for future matching</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-003" req_ref="REQ-TRANS-006">
  <scenario>Recurring transaction amount changes by more than 50% from historical average</scenario>
  <expected_behavior>Flag for review even if payee matches; do not auto-categorize; alert may indicate pricing change or error</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-004" req_ref="REQ-TRANS-008">
  <scenario>Xero API is unavailable during sync attempt</scenario>
  <expected_behavior>Queue categorization locally with "pending sync" status; retry with exponential backoff (1min, 5min, 15min, 1hr, 6hr); alert owner if unsynced after 24 hours</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-005" req_ref="REQ-TRANS-009">
  <scenario>User attempts to split transaction but amounts don't equal total</scenario>
  <expected_behavior>Validation error prevents save; display message "Split amounts (R{total}) must equal transaction amount (R{expected})"; highlight discrepancy</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-006" req_ref="REQ-TRANS-002">
  <scenario>Transaction appears to be a reversal or refund of an earlier transaction</scenario>
  <expected_behavior>Detect matching amount (negative) and similar date/payee; link as reversal; suggest same category with opposite sign; flag for review if uncertain</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-007" req_ref="REQ-TRANS-003">
  <scenario>During first month of usage, all transactions have low confidence scores</scenario>
  <expected_behavior>Display "learning mode" indicator on dashboard; explain that accuracy improves with corrections; prioritize showing transactions for review; do not count toward accuracy metrics</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-008" req_ref="REQ-TRANS-001">
  <scenario>Duplicate transaction imported (same date, amount, description)</scenario>
  <expected_behavior>Detect potential duplicate; flag for review with "possible duplicate" warning; do not auto-categorize; allow user to confirm duplicate (delete) or mark as legitimate (keep both)</expected_behavior>
</edge_case>

<edge_case id="EC-TRANS-009" req_ref="REQ-TRANS-005">
  <scenario>User makes conflicting corrections (same payee categorized differently)</scenario>
  <expected_behavior>Present conflict to user: "You previously categorized [Payee] as [Category A]. Would you like to update all transactions or just this one?"; store user preference</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-TRANS-001" http_code="400">
  <condition>Bank file format not recognized or corrupted</condition>
  <message>Unable to read bank file. Please ensure the file is a valid CSV, PDF (FNB format), or OFX file.</message>
  <recovery>Show supported formats; provide template download; offer manual entry option</recovery>
</error>

<error id="ERR-TRANS-002" http_code="422">
  <condition>Transaction date is in the future</condition>
  <message>Transaction date {date} is in the future. Please check the file or correct the date.</message>
  <recovery>Highlight affected transactions; allow date correction</recovery>
</error>

<error id="ERR-TRANS-003" http_code="502">
  <condition>Xero sync failed after retries</condition>
  <message>Unable to sync with Xero. Your changes are saved locally and will sync automatically when connection is restored.</message>
  <recovery>Queue for retry; show sync status indicator; allow manual retry</recovery>
</error>

<error id="ERR-TRANS-004" http_code="429">
  <condition>Too many corrections in short period (potential abuse)</condition>
  <message>You have made {count} corrections today. Additional corrections require confirmation to prevent accidental changes.</message>
  <recovery>Require confirmation for each additional correction; alert admin if pattern continues</recovery>
</error>

<error id="ERR-TRANS-005" http_code="409">
  <condition>Category no longer exists in Xero Chart of Accounts</condition>
  <message>The category "{category}" no longer exists in Xero. Please select a different category.</message>
  <recovery>Refresh Chart of Accounts from Xero; show available categories; highlight affected transactions</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-TRANS-001" type="unit" req_ref="REQ-TRANS-001">
  <description>Bank file parser handles valid CSV format</description>
  <inputs>Valid FNB CSV file with 100 transactions</inputs>
  <expected>100 transactions parsed with correct date, amount, description fields</expected>
</test_case>

<test_case id="TC-TRANS-002" type="unit" req_ref="REQ-TRANS-001">
  <description>Bank file parser rejects invalid format</description>
  <inputs>Corrupted file, wrong format, empty file</inputs>
  <expected>Appropriate error returned for each case</expected>
</test_case>

<test_case id="TC-TRANS-003" type="integration" req_ref="REQ-TRANS-002">
  <description>Claude Code agent categorizes transaction correctly</description>
  <steps>
    1. Provide transaction with clear payee (e.g., "WOOLWORTHS SANDTON")
    2. Ensure payee pattern exists in training data
    3. Call categorization agent
    4. Verify correct category returned
  </steps>
  <expected>Category matches expected "Food and Provisions"; confidence >= 80%</expected>
</test_case>

<test_case id="TC-TRANS-004" type="integration" req_ref="REQ-TRANS-004">
  <description>Low confidence transactions flagged for review</description>
  <steps>
    1. Provide transaction with ambiguous description
    2. Call categorization agent
    3. Verify confidence is below 80%
    4. Check transaction is flagged
  </steps>
  <expected>Transaction appears in review queue with "needs review" status</expected>
</test_case>

<test_case id="TC-TRANS-005" type="integration" req_ref="REQ-TRANS-005">
  <description>User correction improves future categorization</description>
  <steps>
    1. Import transaction from new payee
    2. Correct categorization manually
    3. Import second transaction from same payee
    4. Verify automatic categorization matches correction
  </steps>
  <expected>Second transaction auto-categorized with high confidence to corrected category</expected>
</test_case>

<test_case id="TC-TRANS-006" type="integration" req_ref="REQ-TRANS-008">
  <description>Xero sync creates transaction in Xero</description>
  <steps>
    1. Categorize transaction locally
    2. Trigger sync
    3. Verify transaction appears in Xero with correct category
    4. Verify audit trail logged
  </steps>
  <expected>Transaction exists in Xero; category matches; sync log entry created</expected>
</test_case>

<test_case id="TC-TRANS-007" type="e2e" story_ref="US-TRANS-001">
  <description>Complete transaction import and categorization flow</description>
  <steps>
    1. Upload bank CSV file
    2. Wait for processing
    3. View categorized transactions
    4. Correct one flagged transaction
    5. Verify sync to Xero
    6. Verify correction affects future transactions
  </steps>
  <expected>All steps complete successfully; transactions in Xero; learning applied</expected>
</test_case>

<test_case id="TC-TRANS-008" type="unit" req_ref="REQ-TRANS-009">
  <description>Split transaction validation</description>
  <inputs>
    Transaction amount: R1000.00
    Split 1: R600.00 to "Food"
    Split 2: R500.00 to "Supplies"
  </inputs>
  <expected>Validation error: sum (R1100.00) exceeds transaction amount (R1000.00)</expected>
</test_case>

<test_case id="TC-TRANS-009" type="performance" req_ref="REQ-TRANS-003">
  <description>Categorization performance under load</description>
  <steps>
    1. Queue 1000 transactions for categorization
    2. Process concurrently
    3. Measure p95 latency
  </steps>
  <expected>p95 latency < 2 seconds per transaction</expected>
</test_case>

</test_plan>

</functional_spec>

<functional_spec id="SPEC-WEB" version="1.0">

<metadata>
  <title>CrecheBooks Web Application</title>
  <status>approved</status>
  <owner>CrecheBooks Development Team</owner>
  <last_updated>2025-12-22</last_updated>
  <related_specs>
    <spec_ref>SPEC-TRANS</spec_ref>
    <spec_ref>SPEC-BILL</spec_ref>
    <spec_ref>SPEC-PAY</spec_ref>
    <spec_ref>SPEC-SARS</spec_ref>
    <spec_ref>SPEC-RECON</spec_ref>
  </related_specs>
</metadata>

<overview>
The CrecheBooks Web Application is a responsive Next.js-based frontend that provides creche owners, administrators, and accountants with an intuitive interface to manage all bookkeeping operations. The application integrates with the NestJS API backend and provides real-time visibility into transactions, invoices, payments, and SARS compliance.

Key capabilities:
- Dashboard with financial overview and key metrics
- Transaction management with AI-assisted categorization
- Invoice generation, approval, and delivery
- Payment matching and arrears tracking
- SARS submission preparation (VAT201, EMP201)
- Bank reconciliation and financial reporting
</overview>

<user_stories>

<story id="US-WEB-01" priority="must-have">
  <narrative>
    As a creche owner
    I want to see a dashboard with key financial metrics
    So that I can quickly understand my creche's financial health
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I am logged in as an owner or admin</given>
      <when>I navigate to the dashboard</when>
      <then>I see total income, expenses, outstanding invoices, and bank balance for the current month</then>
    </criterion>
    <criterion id="AC-02">
      <given>I am on the dashboard</given>
      <when>I view the income chart</when>
      <then>I see a monthly trend of income vs expenses for the last 12 months</then>
    </criterion>
    <criterion id="AC-03">
      <given>I am on the dashboard</given>
      <when>I view the arrears widget</when>
      <then>I see the top 5 accounts with outstanding balances and days overdue</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-02" priority="must-have">
  <narrative>
    As a creche admin
    I want to view and categorize bank transactions
    So that I can keep accurate financial records
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Transactions page</given>
      <when>the page loads</when>
      <then>I see a paginated list of recent transactions with date, description, amount, and category</then>
    </criterion>
    <criterion id="AC-02">
      <given>I see transactions marked "Needs Review"</given>
      <when>I click on a transaction</when>
      <then>I see the AI-suggested category and can approve or change it</then>
    </criterion>
    <criterion id="AC-03">
      <given>I have selected a category</given>
      <when>I save the categorization</when>
      <then>The transaction is marked as categorized and synced to Xero</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-03" priority="must-have">
  <narrative>
    As a creche owner
    I want to generate and send monthly invoices
    So that parents can pay their fees on time
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Invoices page</given>
      <when>I click "Generate Monthly Invoices"</when>
      <then>I see a preview of all invoices to be generated with child names and amounts</then>
    </criterion>
    <criterion id="AC-02">
      <given>I have reviewed the invoice preview</given>
      <when>I approve the invoices</when>
      <then>Invoices are created in DRAFT status in Xero</then>
    </criterion>
    <criterion id="AC-03">
      <given>I have draft invoices</given>
      <when>I click "Send All" or individual send buttons</when>
      <then>Invoices are sent via email/WhatsApp as per parent preference</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-04" priority="must-have">
  <narrative>
    As a creche admin
    I want to match incoming payments to invoices
    So that I can track who has paid
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Payments page</given>
      <when>I view unmatched payments</when>
      <then>I see a list of bank credits with AI-suggested invoice matches</then>
    </criterion>
    <criterion id="AC-02">
      <given>I see a suggested match with high confidence</given>
      <when>I approve the match</when>
      <then>The payment is allocated to the invoice and both are updated</then>
    </criterion>
    <criterion id="AC-03">
      <given>The AI cannot find a match</given>
      <when>I manually search for the invoice</when>
      <then>I can select an invoice and allocate the payment manually</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-05" priority="must-have">
  <narrative>
    As a creche owner
    I want to view accounts in arrears
    So that I can follow up on outstanding payments
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Arrears page</given>
      <when>the page loads</when>
      <then>I see a list of parents with outstanding balances, sorted by days overdue</then>
    </criterion>
    <criterion id="AC-02">
      <given>I select an account in arrears</given>
      <when>I view the details</when>
      <then>I see all outstanding invoices and payment history</then>
    </criterion>
    <criterion id="AC-03">
      <given>I am viewing an arrears account</given>
      <when>I click "Send Reminder"</when>
      <then>A polite reminder is sent via email/WhatsApp</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-06" priority="must-have">
  <narrative>
    As a creche owner
    I want to prepare VAT and PAYE submissions
    So that I can comply with SARS requirements
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the SARS page</given>
      <when>I select a tax period</when>
      <then>I see calculated VAT201 or EMP201 values</then>
    </criterion>
    <criterion id="AC-02">
      <given>I have reviewed the calculations</given>
      <when>I approve the submission</when>
      <then>A downloadable file is generated for SARS eFiling</then>
    </criterion>
    <criterion id="AC-03">
      <given>The VAT calculation has discrepancies</given>
      <when>I view the breakdown</when>
      <then>I see line-by-line details of income, expenses, and VAT amounts</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-07" priority="should-have">
  <narrative>
    As a creche owner
    I want to reconcile bank statements
    So that my records match the bank
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Reconciliation page</given>
      <when>I select a bank account and period</when>
      <then>I see matched and unmatched transactions</then>
    </criterion>
    <criterion id="AC-02">
      <given>I see a discrepancy</given>
      <when>I view the details</when>
      <then>I can see which transactions are causing the difference</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-08" priority="should-have">
  <narrative>
    As an accountant
    I want to view financial reports
    So that I can advise the creche owner
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Reports page</given>
      <when>I select "Income Statement"</when>
      <then>I see income and expenses categorized by account code for the period</then>
    </criterion>
    <criterion id="AC-02">
      <given>I am viewing a report</given>
      <when>I click "Export"</when>
      <then>I can download the report as PDF or CSV</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-09" priority="must-have">
  <narrative>
    As a creche owner
    I want to manage parents and children enrollment
    So that invoicing is accurate
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Parents page</given>
      <when>I click "Add Parent"</when>
      <then>I can enter parent details and add their children</then>
    </criterion>
    <criterion id="AC-02">
      <given>I am adding a child</given>
      <when>I select a fee structure</when>
      <then>The monthly fee is calculated and displayed</then>
    </criterion>
    <criterion id="AC-03">
      <given>A child leaves the creche</given>
      <when>I mark them as exited</when>
      <then>They are excluded from future invoicing</then>
    </criterion>
  </acceptance_criteria>
</story>

<story id="US-WEB-10" priority="must-have">
  <narrative>
    As a creche owner
    I want to manage staff and payroll
    So that I can process salaries correctly
  </narrative>

  <acceptance_criteria>
    <criterion id="AC-01">
      <given>I navigate to the Staff page</given>
      <when>I view the staff list</when>
      <then>I see all active staff with their roles and salaries</then>
    </criterion>
    <criterion id="AC-02">
      <given>I click "Process Payroll"</given>
      <when>I select a month</when>
      <then>I see calculated PAYE, UIF, and net salary for each staff member</then>
    </criterion>
    <criterion id="AC-03">
      <given>I have reviewed payroll calculations</given>
      <when>I approve the payroll</when>
      <then>Payroll entries are recorded for EMP201 submission</then>
    </criterion>
  </acceptance_criteria>
</story>

</user_stories>

<requirements>

<requirement id="REQ-WEB-01" story_ref="US-WEB-01" priority="must">
  <description>Dashboard must display total income, expenses, outstanding invoices, and bank balance for the selected period</description>
  <rationale>Owners need immediate visibility into financial health</rationale>
</requirement>

<requirement id="REQ-WEB-02" story_ref="US-WEB-01" priority="must">
  <description>Dashboard must show income vs expense trend chart for 12 months</description>
  <rationale>Trend analysis helps with financial planning</rationale>
</requirement>

<requirement id="REQ-WEB-03" story_ref="US-WEB-02" priority="must">
  <description>Transaction list must support pagination, filtering by date/status, and sorting</description>
  <rationale>Users need to navigate large transaction volumes efficiently</rationale>
</requirement>

<requirement id="REQ-WEB-04" story_ref="US-WEB-02" priority="must">
  <description>Transaction categorization UI must show AI confidence score and reasoning</description>
  <rationale>Users need context to approve or override AI suggestions</rationale>
</requirement>

<requirement id="REQ-WEB-05" story_ref="US-WEB-03" priority="must">
  <description>Invoice generation must show preview before creation</description>
  <rationale>Prevents incorrect invoices being sent to parents</rationale>
</requirement>

<requirement id="REQ-WEB-06" story_ref="US-WEB-03" priority="must">
  <description>Invoice delivery must support email and WhatsApp based on parent preference</description>
  <rationale>South African parents prefer WhatsApp for communication</rationale>
</requirement>

<requirement id="REQ-WEB-07" story_ref="US-WEB-04" priority="must">
  <description>Payment matching must show AI-suggested matches with confidence scores</description>
  <rationale>Speeds up payment allocation while maintaining accuracy</rationale>
</requirement>

<requirement id="REQ-WEB-08" story_ref="US-WEB-05" priority="must">
  <description>Arrears list must show age analysis (30/60/90+ days)</description>
  <rationale>Helps prioritize collections efforts</rationale>
</requirement>

<requirement id="REQ-WEB-09" story_ref="US-WEB-06" priority="must">
  <description>SARS submission preview must match official VAT201/EMP201 formats</description>
  <rationale>Ensures accurate tax submissions</rationale>
</requirement>

<requirement id="REQ-WEB-10" story_ref="US-WEB-09" priority="must">
  <description>Pro-rata calculations must display for mid-month enrollments/exits</description>
  <rationale>Ensures fair billing for partial months</rationale>
</requirement>

<requirement id="REQ-WEB-11" story_ref="US-WEB-10" priority="must">
  <description>Payroll calculations must use current SARS tax tables and UIF rates</description>
  <rationale>Compliance with SA tax regulations</rationale>
</requirement>

<requirement id="REQ-WEB-12" priority="must">
  <description>All financial amounts must display in ZAR with 2 decimal places</description>
  <rationale>Standard South African currency formatting</rationale>
</requirement>

<requirement id="REQ-WEB-13" priority="must">
  <description>All dates must display in SAST (Africa/Johannesburg) timezone</description>
  <rationale>Local time relevance for South African users</rationale>
</requirement>

<requirement id="REQ-WEB-14" priority="must">
  <description>Application must be responsive and work on mobile devices</description>
  <rationale>Users may access on phones/tablets</rationale>
</requirement>

<requirement id="REQ-WEB-15" priority="must">
  <description>Dark mode support must be available</description>
  <rationale>User preference and accessibility</rationale>
</requirement>

</requirements>

<edge_cases>

<edge_case id="EC-WEB-01" req_ref="REQ-WEB-03">
  <scenario>User filters transactions but no results match</scenario>
  <expected_behavior>Display "No transactions found" message with suggestion to adjust filters</expected_behavior>
</edge_case>

<edge_case id="EC-WEB-02" req_ref="REQ-WEB-05">
  <scenario>No children are enrolled for invoice generation month</scenario>
  <expected_behavior>Display message "No active enrollments for this period"</expected_behavior>
</edge_case>

<edge_case id="EC-WEB-03" req_ref="REQ-WEB-07">
  <scenario>Payment amount exceeds total outstanding for a parent</scenario>
  <expected_behavior>Allow allocation with warning about overpayment; create credit note if needed</expected_behavior>
</edge_case>

<edge_case id="EC-WEB-04" req_ref="REQ-WEB-09">
  <scenario>VAT period has no transactions</scenario>
  <expected_behavior>Display nil return with zero values, still allow submission</expected_behavior>
</edge_case>

<edge_case id="EC-WEB-05" req_ref="REQ-WEB-10">
  <scenario>Child enrolled on last day of month</scenario>
  <expected_behavior>Calculate 1 day pro-rata correctly</expected_behavior>
</edge_case>

</edge_cases>

<error_states>

<error id="ERR-WEB-01" http_code="401">
  <condition>Session expired or invalid token</condition>
  <message>Your session has expired. Please log in again.</message>
  <recovery>Redirect to login page; preserve current URL for redirect after login</recovery>
</error>

<error id="ERR-WEB-02" http_code="403">
  <condition>User lacks permission for action</condition>
  <message>You don't have permission to perform this action.</message>
  <recovery>Display message; suggest contacting owner if needed</recovery>
</error>

<error id="ERR-WEB-03" http_code="500">
  <condition>API server error</condition>
  <message>Something went wrong. Please try again later.</message>
  <recovery>Show error boundary; offer retry button; log error details</recovery>
</error>

<error id="ERR-WEB-04">
  <condition>Network connection lost</condition>
  <message>Connection lost. Please check your internet connection.</message>
  <recovery>Show offline indicator; retry on reconnection</recovery>
</error>

<error id="ERR-WEB-05">
  <condition>Xero sync failed</condition>
  <message>Could not sync with Xero. Changes saved locally.</message>
  <recovery>Queue for retry; show pending sync indicator</recovery>
</error>

</error_states>

<test_plan>

<test_case id="TC-WEB-01" type="e2e" story_ref="US-WEB-01">
  <description>Dashboard displays correct financial metrics</description>
  <steps>
    1. Log in as owner
    2. Navigate to dashboard
    3. Verify income, expenses, outstanding amounts match API data
  </steps>
</test_case>

<test_case id="TC-WEB-02" type="e2e" story_ref="US-WEB-02">
  <description>Transaction categorization flow</description>
  <steps>
    1. Navigate to transactions
    2. Select uncategorized transaction
    3. View AI suggestion
    4. Approve category
    5. Verify transaction updated
  </steps>
</test_case>

<test_case id="TC-WEB-03" type="e2e" story_ref="US-WEB-03">
  <description>Invoice generation and sending</description>
  <steps>
    1. Navigate to invoices
    2. Generate monthly invoices
    3. Review preview
    4. Approve invoices
    5. Send invoices
    6. Verify sent status
  </steps>
</test_case>

<test_case id="TC-WEB-04" type="unit" req_ref="REQ-WEB-12">
  <description>Currency formatting displays correctly</description>
  <inputs>12345.67, -500.00, 0</inputs>
  <expected>R 12,345.67, -R 500.00, R 0.00</expected>
</test_case>

<test_case id="TC-WEB-05" type="unit" req_ref="REQ-WEB-14">
  <description>Responsive layout adapts to mobile viewport</description>
  <inputs>viewport widths: 320px, 768px, 1024px</inputs>
  <expected>Navigation collapses, tables scroll horizontally, buttons remain accessible</expected>
</test_case>

</test_plan>

</functional_spec>

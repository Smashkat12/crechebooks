# Product Requirements Document: CrecheBooks AI Bookkeeping System

**PRD ID**: PRD-2025-001
**Version**: 1.1
**Effective Date**: 2025-12-19
**Owner**: [Product Manager Name]
**Status**: Draft

---

## 1. Executive Summary

CrecheBooks is an AI-powered bookkeeping system designed specifically for South African creches and pre-schools. The system automates 90%+ of routine accounting tasks by integrating with Xero accounting software and leveraging **Claude Code CLI** as the multi-agent orchestration layer to process bank transactions, generate invoices, track school fees, calculate SARS submissions, and reconcile accounts.

**Key Architectural Decision**: The AI agent layer is built on **Claude Code (Anthropic's CLI tool)** rather than direct Claude API calls, providing significant cost savings through Claude Code's subscription-based pricing model while maintaining full access to Claude's reasoning capabilities.

**Expected Impact**:
- 90% reduction in manual bookkeeping time
- 99%+ transaction categorization accuracy
- Zero missed SARS submission deadlines
- 50% reduction in outstanding fee arrears through automated follow-up
- **60-80% cost reduction** compared to direct API implementation

---

## 2. Problem Statement

### Current State
South African creche and pre-school owners manage bookkeeping manually or with minimal software assistance:
- Bank statements downloaded as PDF files (primarily FNB) and transactions manually categorized in spreadsheets or Xero
- Parent invoices created individually each month using templates
- Fee payments tracked manually against bank deposits
- SARS submissions (VAT201, EMP201, UIF) calculated manually from multiple sources
- Account reconciliation done end-of-month with significant time investment

### Pain Points

| Pain Point | Impact | Frequency |
|------------|--------|-----------|
| Manual transaction categorization | 4-6 hours/month; error-prone | Daily/Weekly |
| Invoice generation | 2-3 hours/month; repetitive | Monthly |
| Fee payment tracking | 2-3 hours/month; missed payments | Daily |
| SARS calculations | 2-4 hours/month; compliance risk | Monthly/Bi-monthly |
| Account reconciliation | 2-3 hours/month; cash flow blind spots | Monthly |

### Opportunity
Automating these tasks enables creche owners to:
- Focus on child education and care rather than administration
- Improve cash flow through automated fee collection and follow-up
- Eliminate SARS compliance penalties through accurate, timely submissions
- Gain real-time financial visibility for better business decisions
- Scale operations without proportional administrative overhead

### Consequences of Not Solving
- Owners burn out from administrative burden
- Late or incorrect SARS submissions result in penalties
- Uncollected fees damage cash flow and sustainability
- Financial blind spots lead to poor business decisions
- Competitive disadvantage as more automated solutions emerge

---

## 3. Target Users and Personas

| Persona | Description | Goals | Pain Points | Usage Frequency |
|---------|-------------|-------|-------------|-----------------|
| Creche Owner-Operator | Small to medium creche (20-80 children); handles own admin | Minimize admin time; ensure compliance; improve cash flow | Time-poor; not accounting-trained; fears SARS penalties | Daily (5-10 min) |
| Creche Administrator | Dedicated admin staff at larger creche (80-200 children) | Efficient workflows; accurate records; easy reporting | Repetitive tasks; multiple data entry points; month-end pressure | Daily (30-60 min) |
| Creche Accountant | External bookkeeper managing multiple creches | Batch processing; consistent categorization; audit-ready reports | Different clients have different patterns; time to learn each business | Weekly per client |
| Regulatory Auditor | SARS auditor or financial auditor | Clear audit trail; accurate records; compliant submissions | Incomplete records; inconsistent categorization; missing documentation | Annually |

### Primary User Journey: Creche Owner-Operator

```
Trigger: Beginning of month / New bank transactions available

Journey Steps:
1. System automatically imports bank transactions from linked bank feed
2. Claude Code agents categorize transactions; flag any needing review
3. Owner reviews flagged items (typically <5%) in 2-3 minutes
4. System generates monthly parent invoices based on enrollment
5. Owner reviews/approves invoices; system sends via email/WhatsApp
6. System matches incoming payments to invoices automatically
7. System generates arrears report; optionally sends automated reminders
8. At SARS deadline, system generates submission-ready reports
9. Owner reviews and submits (or system submits if authorized)
10. Monthly reconciliation auto-completes; owner reviews dashboard

Success Criteria: Owner spends <60 minutes/month on bookkeeping tasks
```

---

## 4. Feature Description and User Stories

### Feature Overview

CrecheBooks provides five integrated capabilities:

1. **Smart Transaction Categorization**: Claude Code agents learn creche-specific expense patterns and auto-categorize bank transactions
2. **Automated Fee Billing**: Generates, sends, and tracks school fee invoices synced with Xero
3. **Payment Matching & Arrears**: Matches bank deposits to invoices; manages arrears workflow
4. **SARS Compliance Engine**: Calculates and generates VAT, PAYE, and UIF submissions
5. **Intelligent Reconciliation**: Auto-reconciles accounts; surfaces discrepancies

### User Stories

---

#### Domain: Transaction Categorization (TRANS)

**US-TRANS-001**: Priority: MUST
```
As a creche owner
I want my bank transactions automatically categorized to the correct expense accounts
So that I don't spend hours manually entering each transaction
```
**Acceptance Criteria**:
- [ ] AC-TRANS-001a: System achieves 95%+ auto-categorization accuracy after 3-month learning period
- [ ] AC-TRANS-001b: Uncategorized transactions are flagged for review within 24 hours of import
- [ ] AC-TRANS-001c: Owner can correct categorization with 2 clicks; system learns from correction
- [ ] AC-TRANS-001d: Categories sync bi-directionally with Xero Chart of Accounts

**US-TRANS-002**: Priority: MUST
```
As a creche owner
I want the system to learn my specific expense patterns
So that recurring payments (rent, utilities, food suppliers) are always correctly categorized
```
**Acceptance Criteria**:
- [ ] AC-TRANS-002a: System identifies recurring transactions by payee, amount pattern, and frequency
- [ ] AC-TRANS-002b: After 2 manual corrections for same payee, system auto-categorizes future transactions
- [ ] AC-TRANS-002c: System handles amount variations (e.g., utility bills varying +/-30%) intelligently

**US-TRANS-003**: Priority: SHOULD
```
As a creche owner
I want to see why the AI categorized a transaction a certain way
So that I can trust the system and correct its reasoning if wrong
```
**Acceptance Criteria**:
- [ ] AC-TRANS-003a: Each categorization shows confidence score and reasoning
- [ ] AC-TRANS-003b: Low-confidence (<80%) categorizations are automatically flagged for review

---

#### Domain: Fee Billing (BILL)

**US-BILL-001**: Priority: MUST
```
As a creche owner
I want monthly invoices automatically generated for all enrolled children
So that I don't have to create invoices manually each month
```
**Acceptance Criteria**:
- [ ] AC-BILL-001a: Invoices generated on configurable day of month (e.g., 1st)
- [ ] AC-BILL-001b: Invoice includes child name, parent details, fee breakdown, due date
- [ ] AC-BILL-001c: Invoice created as draft in Xero; owner can review before sending
- [ ] AC-BILL-001d: Supports variable fees (full-day vs half-day; sibling discounts; ad-hoc charges)

**US-BILL-002**: Priority: MUST
```
As a creche owner
I want invoices automatically sent to parents via their preferred channel
So that parents receive invoices promptly without manual effort
```
**Acceptance Criteria**:
- [ ] AC-BILL-002a: Invoices sent via email (primary) and/or WhatsApp (optional)
- [ ] AC-BILL-002b: Delivery status tracked (sent, delivered, opened, failed)
- [ ] AC-BILL-002c: Failed deliveries flagged for manual follow-up

**US-BILL-003**: Priority: SHOULD
```
As a creche owner
I want to manage enrollment and fee structures in the system
So that invoice generation reflects current attendance and pricing
```
**Acceptance Criteria**:
- [ ] AC-BILL-003a: System maintains enrollment register (child, parent, start date, end date, fee tier)
- [ ] AC-BILL-003b: Fee structures configurable (monthly fee, registration fee, extras)
- [ ] AC-BILL-003c: Mid-month enrollment/withdrawal calculates pro-rata fees

---

#### Domain: Payment Matching (PAY)

**US-PAY-001**: Priority: MUST
```
As a creche owner
I want incoming bank payments automatically matched to outstanding invoices
So that I don't have to manually reconcile each deposit
```
**Acceptance Criteria**:
- [ ] AC-PAY-001a: System matches payments using reference, amount, and payer name
- [ ] AC-PAY-001b: Exact matches applied automatically; partial/ambiguous matches flagged
- [ ] AC-PAY-001c: Multiple payments against one invoice supported (partial payments)
- [ ] AC-PAY-001d: One payment against multiple invoices supported (combined payments)

**US-PAY-002**: Priority: MUST
```
As a creche owner
I want to see outstanding arrears at a glance
So that I can follow up on late payments
```
**Acceptance Criteria**:
- [ ] AC-PAY-002a: Dashboard shows total arrears, aging buckets (30/60/90 days), top debtors
- [ ] AC-PAY-002b: Drill-down to individual parent shows payment history and outstanding invoices
- [ ] AC-PAY-002c: Arrears report exportable to PDF/Excel

**US-PAY-003**: Priority: SHOULD
```
As a creche owner
I want automated payment reminders sent to parents with overdue accounts
So that I don't have to chase payments manually
```
**Acceptance Criteria**:
- [ ] AC-PAY-003a: Configurable reminder schedule (e.g., 7 days, 14 days, 30 days overdue)
- [ ] AC-PAY-003b: Customizable reminder templates with professional, friendly tone
- [ ] AC-PAY-003c: Reminder history logged; escalation to owner after N reminders

---

#### Domain: SARS Compliance (SARS)

**US-SARS-001**: Priority: MUST
```
As a creche owner
I want VAT calculations and returns automatically prepared
So that I submit accurate VAT201 returns on time
```
**Acceptance Criteria**:
- [ ] AC-SARS-001a: System calculates output VAT (on fee invoices) and input VAT (on categorized expenses)
- [ ] AC-SARS-001b: VAT201 return generated in SARS-compliant format
- [ ] AC-SARS-001c: System flags items needing attention (missing VAT numbers, zero-rated vs exempt)
- [ ] AC-SARS-001d: Historical VAT returns accessible for audit

**US-SARS-002**: Priority: MUST
```
As a creche owner
I want PAYE and UIF calculations for my staff automatically prepared
So that I submit accurate EMP201 returns on time
```
**Acceptance Criteria**:
- [ ] AC-SARS-002a: System integrates with payroll data (staff, salaries, tax brackets)
- [ ] AC-SARS-002b: PAYE calculated per SARS tax tables for current year
- [ ] AC-SARS-002c: UIF calculated at statutory rates (employer + employee contributions)
- [ ] AC-SARS-002d: EMP201 return generated in SARS-compliant format
- [ ] AC-SARS-002e: IRP5 certificates generated for annual submission

**US-SARS-003**: Priority: SHOULD
```
As a creche owner
I want deadline reminders and submission tracking
So that I never miss a SARS deadline
```
**Acceptance Criteria**:
- [ ] AC-SARS-003a: System tracks all SARS deadlines (VAT: 25th monthly; EMP201: 7th monthly)
- [ ] AC-SARS-003b: Reminders sent 7 days, 3 days, and 1 day before deadline
- [ ] AC-SARS-003c: Submission status tracked (draft, submitted, acknowledged)

---

#### Domain: Reconciliation (RECON)

**US-RECON-001**: Priority: MUST
```
As a creche owner
I want monthly bank reconciliation to happen automatically
So that I know my books match my bank balance
```
**Acceptance Criteria**:
- [ ] AC-RECON-001a: System reconciles Xero bank account against imported transactions
- [ ] AC-RECON-001b: Matched transactions marked as reconciled automatically
- [ ] AC-RECON-001c: Discrepancies (unmatched transactions, duplicate entries) flagged
- [ ] AC-RECON-001d: Reconciliation summary shows opening balance, transactions, closing balance

**US-RECON-002**: Priority: SHOULD
```
As a creche owner
I want audit-ready financial statements
So that I can satisfy auditor or investor requests quickly
```
**Acceptance Criteria**:
- [ ] AC-RECON-002a: Income Statement (Profit & Loss) generated on demand
- [ ] AC-RECON-002b: Balance Sheet generated on demand
- [ ] AC-RECON-002c: All transactions traceable to source documents
- [ ] AC-RECON-002d: Reports formatted for South African accounting standards

---

## 5. Functional Requirements

### Transaction Categorization Domain

| ID | Description | Priority | Related Story | Rationale |
|----|-------------|----------|---------------|-----------|
| REQ-TRANS-001 | System imports bank transactions via Yodlee/bank feed, PDF upload (FNB format), or CSV upload | MUST | US-TRANS-001 | Foundation for all categorization |
| REQ-TRANS-002 | Claude Code agents categorize transactions to Xero Chart of Accounts categories | MUST | US-TRANS-001 | Core automation value |
| REQ-TRANS-003 | System achieves 95% categorization accuracy after training period | MUST | US-TRANS-001 | Target automation level |
| REQ-TRANS-004 | Low-confidence categorizations (<80%) flagged for human review | MUST | US-TRANS-003 | Human-in-loop for accuracy |
| REQ-TRANS-005 | User corrections train the categorization model | MUST | US-TRANS-002 | Continuous improvement |
| REQ-TRANS-006 | Recurring transaction patterns detected and auto-categorized | SHOULD | US-TRANS-002 | Reduces review burden |
| REQ-TRANS-007 | Categorization explainability shown for each transaction | SHOULD | US-TRANS-003 | Trust and verification |
| REQ-TRANS-008 | Bi-directional sync with Xero (categories, transactions) | MUST | US-TRANS-001 | Single source of truth |
| REQ-TRANS-009 | Split transactions supported (one payment, multiple categories) | SHOULD | US-TRANS-001 | Real-world complexity |
| REQ-TRANS-010 | Payee aliases managed (same vendor, different names) | SHOULD | US-TRANS-002 | Improves matching |

### Fee Billing Domain

| ID | Description | Priority | Related Story | Rationale |
|----|-------------|----------|---------------|-----------|
| REQ-BILL-001 | System generates monthly invoices for all enrolled children | MUST | US-BILL-001 | Core billing automation |
| REQ-BILL-002 | Invoice generation date configurable per creche | MUST | US-BILL-001 | Business flexibility |
| REQ-BILL-003 | Invoices created as drafts in Xero for review | MUST | US-BILL-001 | Human approval before sending |
| REQ-BILL-004 | Invoices include child name, parent, fee breakdown, due date, payment details | MUST | US-BILL-001 | Complete invoice content |
| REQ-BILL-005 | Variable fee structures supported (full-day, half-day, siblings, extras) | MUST | US-BILL-001 | Business model flexibility |
| REQ-BILL-006 | Invoices sent via email using Xero or custom templates | MUST | US-BILL-002 | Delivery mechanism |
| REQ-BILL-007 | WhatsApp invoice delivery via approved business API | SHOULD | US-BILL-002 | SA-specific channel |
| REQ-BILL-008 | Delivery status tracked (sent, delivered, failed) | SHOULD | US-BILL-002 | Visibility |
| REQ-BILL-009 | Enrollment register maintained with child/parent/fee details | MUST | US-BILL-003 | Data foundation |
| REQ-BILL-010 | Pro-rata fee calculation for mid-month changes | SHOULD | US-BILL-003 | Accurate billing |

### Payment Matching Domain

| ID | Description | Priority | Related Story | Rationale |
|----|-------------|----------|---------------|-----------|
| REQ-PAY-001 | System matches incoming payments to outstanding invoices | MUST | US-PAY-001 | Core matching automation |
| REQ-PAY-002 | Matching uses reference, amount, and payer name | MUST | US-PAY-001 | Multi-factor matching |
| REQ-PAY-003 | Exact matches applied automatically | MUST | US-PAY-001 | Zero-touch for clear matches |
| REQ-PAY-004 | Ambiguous matches flagged for human review | MUST | US-PAY-001 | Accuracy protection |
| REQ-PAY-005 | Partial payments supported (multiple payments per invoice) | MUST | US-PAY-001 | Real-world payment patterns |
| REQ-PAY-006 | Combined payments supported (one payment, multiple invoices) | SHOULD | US-PAY-001 | Family payments |
| REQ-PAY-007 | Arrears dashboard shows total, aging, top debtors | MUST | US-PAY-002 | Visibility |
| REQ-PAY-008 | Individual parent payment history viewable | SHOULD | US-PAY-002 | Follow-up context |
| REQ-PAY-009 | Automated payment reminders sent per configurable schedule | SHOULD | US-PAY-003 | Reduce manual chasing |
| REQ-PAY-010 | Reminder templates customizable | SHOULD | US-PAY-003 | Brand consistency |

### SARS Compliance Domain

| ID | Description | Priority | Related Story | Rationale |
|----|-------------|----------|---------------|-----------|
| REQ-SARS-001 | VAT output calculated on school fee invoices | MUST | US-SARS-001 | Regulatory requirement |
| REQ-SARS-002 | VAT input calculated on categorized expenses | MUST | US-SARS-001 | Regulatory requirement |
| REQ-SARS-003 | VAT201 return generated in SARS format | MUST | US-SARS-001 | Submission-ready output |
| REQ-SARS-004 | Zero-rated vs VAT-exempt items distinguished | MUST | US-SARS-001 | Correct calculation |
| REQ-SARS-005 | Missing VAT invoice details flagged | SHOULD | US-SARS-001 | Compliance completeness |
| REQ-SARS-006 | Payroll data integrated (staff, salaries) | MUST | US-SARS-002 | PAYE/UIF foundation |
| REQ-SARS-007 | PAYE calculated per current SARS tax tables | MUST | US-SARS-002 | Regulatory requirement |
| REQ-SARS-008 | UIF calculated at statutory rates | MUST | US-SARS-002 | Regulatory requirement |
| REQ-SARS-009 | EMP201 return generated in SARS format | MUST | US-SARS-002 | Submission-ready output |
| REQ-SARS-010 | IRP5 certificates generated annually | MUST | US-SARS-002 | Employee tax certificates |
| REQ-SARS-011 | SARS deadline calendar with reminders | SHOULD | US-SARS-003 | Prevent missed deadlines |
| REQ-SARS-012 | Submission status tracking | SHOULD | US-SARS-003 | Audit trail |

### Reconciliation Domain

| ID | Description | Priority | Related Story | Rationale |
|----|-------------|----------|---------------|-----------|
| REQ-RECON-001 | Bank reconciliation performed automatically | MUST | US-RECON-001 | Core reconciliation |
| REQ-RECON-002 | Matched transactions marked reconciled | MUST | US-RECON-001 | Clear status |
| REQ-RECON-003 | Discrepancies flagged for review | MUST | US-RECON-001 | Error detection |
| REQ-RECON-004 | Reconciliation summary with opening/closing balances | SHOULD | US-RECON-001 | Audit clarity |
| REQ-RECON-005 | Income Statement generated on demand | SHOULD | US-RECON-002 | Reporting |
| REQ-RECON-006 | Balance Sheet generated on demand | SHOULD | US-RECON-002 | Reporting |
| REQ-RECON-007 | Transaction audit trail maintained | MUST | US-RECON-002 | Compliance |

---

## 6. Non-Functional Requirements

### Performance

| ID | Category | Requirement | Metric | Target | Measurement |
|----|----------|-------------|--------|--------|-------------|
| NFR-PERF-001 | Latency | Transaction categorization response | p95 latency | <2 seconds per transaction | API metrics |
| NFR-PERF-002 | Latency | Invoice generation batch | Total time for 100 invoices | <60 seconds | Background job metrics |
| NFR-PERF-003 | Latency | Dashboard load | Time to interactive | <3 seconds | Frontend monitoring |
| NFR-PERF-004 | Throughput | Bank transaction import | Transactions per minute | 1000+ | Import job metrics |
| NFR-PERF-005 | Throughput | Concurrent users | Active sessions | 100 per creche; 10,000 total | Load testing |

### Reliability

| ID | Category | Requirement | Metric | Target | Measurement |
|----|----------|-------------|--------|--------|-------------|
| NFR-REL-001 | Availability | System uptime | Monthly uptime | 99.5% (3.6 hours downtime/month max) | Health checks |
| NFR-REL-002 | Data Durability | Transaction data | Recovery Point Objective | <1 hour | Backup frequency |
| NFR-REL-003 | Recovery | System restoration | Recovery Time Objective | <4 hours | DR testing |
| NFR-REL-004 | Integration | Xero API availability handling | Graceful degradation | Queue operations; retry within 24h | Integration monitoring |

### Security

| ID | Category | Requirement | Target | Enforcement |
|----|----------|-------------|--------|-------------|
| NFR-SEC-001 | Authentication | User authentication | OAuth 2.0 / OIDC | Auth0 or similar |
| NFR-SEC-002 | Authorization | Role-based access control | Owner, Admin, Viewer, Accountant roles | RBAC enforcement |
| NFR-SEC-003 | Encryption | Data in transit | TLS 1.2+ | SSL Labs A grade |
| NFR-SEC-004 | Encryption | Data at rest | AES-256 | Database encryption |
| NFR-SEC-005 | Data Privacy | POPIA compliance | Personal data handling | Privacy impact assessment |
| NFR-SEC-006 | API Security | Xero OAuth tokens | Secure storage; refresh handling | Secrets management |
| NFR-SEC-007 | Audit | Access logging | All data access logged | Audit trail |

### Compliance

| ID | Category | Requirement | Standard | Verification |
|----|----------|-------------|----------|--------------|
| NFR-COMP-001 | Data Protection | POPIA compliance | Protection of Personal Information Act | Annual audit |
| NFR-COMP-002 | Financial | Audit trail integrity | Generally Accepted Accounting Practice | Immutable logs |
| NFR-COMP-003 | Tax | SARS format compliance | Current SARS specifications | Annual validation |
| NFR-COMP-004 | Data Retention | Financial records | 5-year retention | Automated archival |

### Scalability

| ID | Category | Requirement | Target | Approach |
|----|----------|-------------|--------|----------|
| NFR-SCAL-001 | Tenants | Multi-tenant support | 1,000 creches | Database per tenant or row-level security |
| NFR-SCAL-002 | Data | Transaction volume per tenant | 10,000 transactions/year | Indexed queries; archival |
| NFR-SCAL-003 | AI | Claude Code task processing | 100 concurrent categorization requests | Queue-based processing |

---

## 7. Edge Cases

### Transaction Categorization Edge Cases

| ID | Related Req | Scenario | Expected Behavior |
|----|-------------|----------|------------------|
| EC-TRANS-001 | REQ-TRANS-002 | Transaction description is blank or gibberish | Flag for manual review; suggest based on amount/date patterns |
| EC-TRANS-002 | REQ-TRANS-002 | Payee name varies (e.g., "WOOLWORTHS" vs "WOOLIES" vs "WW") | Alias detection; prompt user to confirm grouping |
| EC-TRANS-003 | REQ-TRANS-006 | Recurring transaction amount changes significantly (>50%) | Flag for review; don't auto-categorize |
| EC-TRANS-004 | REQ-TRANS-008 | Xero API unavailable during sync | Queue locally; retry with exponential backoff; alert after 24h |
| EC-TRANS-005 | REQ-TRANS-009 | User wants to split but categories don't add to total | Validation error; require amounts to equal transaction total |
| EC-TRANS-006 | REQ-TRANS-002 | Transaction is a reversal/refund of earlier transaction | Detect and link; suggest same category with negative amount |
| EC-TRANS-007 | REQ-TRANS-003 | All transactions have low confidence in first month | Normal during learning; show "learning mode" indicator |

### Fee Billing Edge Cases

| ID | Related Req | Scenario | Expected Behavior |
|----|-------------|----------|------------------|
| EC-BILL-001 | REQ-BILL-001 | Child enrolled mid-month | Generate pro-rata invoice; clearly show calculation |
| EC-BILL-002 | REQ-BILL-001 | Child withdrawn mid-month | Generate pro-rata credit note or final invoice |
| EC-BILL-003 | REQ-BILL-005 | Sibling discount changes number of children | Recalculate discount for all siblings; notify owner |
| EC-BILL-004 | REQ-BILL-006 | Parent email bounces | Mark delivery failed; flag for manual follow-up; suggest alternative |
| EC-BILL-005 | REQ-BILL-007 | WhatsApp number invalid/blocked | Fall back to email; notify owner |
| EC-BILL-006 | REQ-BILL-009 | Duplicate child enrollment entry | Validation prevents duplicates; merge prompt if detected |
| EC-BILL-007 | REQ-BILL-004 | Fee structure changes mid-year | Apply new fees from specified date; don't retroactively change |

### Payment Matching Edge Cases

| ID | Related Req | Scenario | Expected Behavior |
|----|-------------|----------|------------------|
| EC-PAY-001 | REQ-PAY-002 | Payment amount doesn't match any invoice exactly | Fuzzy match on reference/name; suggest possible matches; flag for review |
| EC-PAY-002 | REQ-PAY-002 | Payment reference doesn't match invoice number | Use amount + payer name as secondary matching; flag if uncertain |
| EC-PAY-003 | REQ-PAY-005 | Payment is less than invoice (partial) | Apply to invoice; mark invoice as partially paid; show remaining balance |
| EC-PAY-004 | REQ-PAY-005 | Multiple payments from same parent on same day | Offer to apply to oldest invoices or let user allocate |
| EC-PAY-005 | REQ-PAY-006 | One payment covers siblings across multiple invoices | Suggest split; allow manual allocation |
| EC-PAY-006 | REQ-PAY-001 | Payment received for unknown parent | Flag as unallocated; prompt user to create parent or allocate |
| EC-PAY-007 | REQ-PAY-007 | Parent disputes amount owed | Show invoice + payment history; support notes/comments |

### SARS Compliance Edge Cases

| ID | Related Req | Scenario | Expected Behavior |
|----|-------------|----------|------------------|
| EC-SARS-001 | REQ-SARS-002 | Expense invoice missing VAT number | Flag for review; exclude from input VAT until resolved |
| EC-SARS-002 | REQ-SARS-004 | Unsure if item is zero-rated or exempt | Flag for review; provide guidance on common items |
| EC-SARS-003 | REQ-SARS-007 | SARS tax tables change mid-year | System updated with new tables; apply correct tables per period |
| EC-SARS-004 | REQ-SARS-007 | Staff member has multiple employers | Warn about potential under-withholding; recommend directive |
| EC-SARS-005 | REQ-SARS-006 | Casual/temporary staff added | Support hourly/daily rates; calculate tax correctly |
| EC-SARS-006 | REQ-SARS-010 | Staff leaves mid-year | Generate IRP5 for period worked; final payment calculations |
| EC-SARS-007 | REQ-SARS-001 | Creche below VAT registration threshold | Track turnover; alert when approaching R1M threshold |

### Reconciliation Edge Cases

| ID | Related Req | Scenario | Expected Behavior |
|----|-------------|----------|------------------|
| EC-RECON-001 | REQ-RECON-001 | Bank closing balance doesn't match Xero | Show discrepancy amount; list unreconciled items; suggest fixes |
| EC-RECON-002 | REQ-RECON-003 | Duplicate transaction imported | Detect duplicates; prompt to delete/merge; prevent double-counting |
| EC-RECON-003 | REQ-RECON-003 | Transaction in Xero not in bank (manual entry) | Flag for review; may be legitimate (cash) or error |
| EC-RECON-004 | REQ-RECON-001 | Bank feed lag (transactions appear late) | Handle gracefully; don't mark discrepancy until feed catches up |
| EC-RECON-005 | REQ-RECON-007 | User deletes transaction that was reconciled | Prevent deletion; require unreconcile first with reason |

---

## 8. Out of Scope

### Phase 1 Exclusions

- **Payroll processing**: Full payroll (leave, benefits, pay runs) - integrate with existing payroll software
- **Parent portal**: Self-service portal for parents to view invoices/make payments
- **Mobile app**: Native iOS/Android app (web-responsive only)
- **Multi-currency**: All transactions in South African Rand only
- **Advanced reporting**: Custom report builder; BI dashboards
- **Direct SARS submission**: API submission to SARS (manual upload required)
- **Banking integration (direct)**: Direct payment initiation; debit order management
- **Inventory management**: Stock tracking for supplies/consumables
- **Budget forecasting**: Cash flow projections; budget vs actual
- **Multi-branch**: Support for creche groups with multiple locations (single-location only)

### Future Phase Considerations (Phase 2+)

- Parent self-service portal with payment gateway integration
- Direct SARS eFiling API integration
- Multi-branch/franchise support
- Budgeting and forecasting module
- Integration with popular SA payroll systems (PaySpace, SimplePay)
- Mobile app for owner dashboard

---

## 9. Success Metrics

### Business Outcomes

| Metric | Baseline | Target | Measurement | Alert Threshold |
|--------|----------|--------|-------------|-----------------|
| Time spent on bookkeeping | 10-15 hours/month | <1 hour/month | User survey; activity tracking | >2 hours/month |
| Transaction auto-categorization rate | 0% | 90%+ | System metrics | <85% |
| Categorization accuracy | N/A | 99%+ (after training) | Correction rate | <95% |
| Invoice generation manual effort | 2-3 hours/month | <5 minutes/month | Time tracking | >15 minutes |
| Payment matching rate | 0% | 95%+ | System metrics | <90% |
| Outstanding arrears (30+ days) | Varies | 20% reduction | Financial reports | Increase >10% |
| SARS deadline compliance | Varies | 100% on-time | Submission tracking | Any missed deadline |

### Product Health

| Metric | Target | Measurement | Alert Threshold |
|--------|--------|-------------|-----------------|
| User activation rate | >80% complete setup within 7 days | Onboarding funnel | <60% |
| Daily active usage | >60% of users check dashboard weekly | Activity tracking | <40% |
| Feature adoption - Transaction categorization | >90% users | Feature usage | <70% |
| Feature adoption - Invoice automation | >80% users | Feature usage | <60% |
| Feature adoption - SARS reports | >70% users | Feature usage | <50% |
| NPS (Net Promoter Score) | >50 | Quarterly survey | <30 |
| Support tickets per user | <1/month | Support system | >3/month |
| Churn rate | <5% monthly | Subscription metrics | >10% |

---

## 10. Agent Implementation Details

### Key Architectural Decision: Claude Code CLI

**CrecheBooks uses Claude Code (Anthropic's CLI tool) as the AI agent layer instead of direct Claude API calls.**

**Rationale:**
1. **Cost Efficiency**: Claude Code's subscription-based model ($20/month Pro or $100/month Max) provides unlimited usage compared to per-token API pricing
2. **Built-in Tools**: Claude Code includes file operations, bash execution, web search, and MCP server integration out of the box
3. **Session Management**: Persistent context across sessions eliminates redundant API calls
4. **Audit Trail**: Built-in logging and decision tracking for compliance
5. **Human-in-the-Loop**: Native support for approval workflows and escalation

### Multi-Agent Architecture (Claude Code Based)

```
┌─────────────────────────────────────────────────────────────────────┐
│              CLAUDE CODE ORCHESTRATOR (Main Session)                 │
│  - Coordinates workflow via Task tool subagents                      │
│  - Manages state via .claude/context files                           │
│  - Handles escalations via AskUserQuestion tool                      │
└─────────────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ Transaction │ │   Billing   │ │   Payment   │ │    SARS     │
│Categorizer  │ │   Agent     │ │   Matcher   │ │   Agent     │
│ (Task tool) │ │ (Task tool) │ │ (Task tool) │ │ (Task tool) │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
         │              │              │              │
         └──────────────┴──────────────┴──────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   XERO MCP SERVER     │
                    │   (Integration Layer) │
                    └───────────────────────┘
```

### Claude Code Implementation Pattern

Each specialized agent is implemented as a Claude Code **Task tool subagent** with a focused prompt and constrained scope:

```yaml
Transaction Categorizer Agent:
  Implementation: Task tool with subagent_type="general-purpose"
  Prompt Template: |
    You are a Transaction Categorization agent for a South African creche.

    CONTEXT:
    - Chart of Accounts: [loaded from .claude/context/chart_of_accounts.json]
    - Historical patterns: [loaded from .claude/context/payee_patterns.json]
    - Transaction to categorize: [input transaction data]

    TASK:
    1. Analyze the transaction description and amount
    2. Match against known payee patterns
    3. Suggest category from Chart of Accounts
    4. Provide confidence score (0-100)
    5. If confidence <80%, flag for human review

    OUTPUT FORMAT:
    {
      "category": "string",
      "account_code": "string",
      "confidence": number,
      "reasoning": "string",
      "requires_review": boolean
    }

  Tools Available:
    - Read (access context files)
    - Grep (search patterns)
    - Xero MCP tools (via mcp__xero__)

  Constraints:
    - Cannot modify transactions directly
    - Must log all decisions to audit trail
    - Must escalate low-confidence items

Billing Agent:
  Implementation: Task tool with subagent_type="general-purpose"
  Prompt Template: |
    You are a Billing agent for a South African creche.

    CONTEXT:
    - Enrollment register: [loaded from database via MCP]
    - Fee structures: [loaded from .claude/context/fee_structures.json]
    - Invoice date: [configurable]

    TASK:
    1. Retrieve all active enrollments
    2. Calculate fees per child (including discounts)
    3. Generate draft invoices in Xero
    4. Return summary for owner approval

    CONSTRAINTS:
    - All invoices created as DRAFT (never auto-send)
    - Must handle pro-rata calculations correctly
    - VAT must be calculated per fee type

Payment Matcher Agent:
  Implementation: Task tool with subagent_type="general-purpose"
  Prompt Template: |
    You are a Payment Matching agent for a South African creche.

    CONTEXT:
    - Outstanding invoices: [from Xero MCP]
    - Incoming payment: [input payment data]

    TASK:
    1. Match payment to invoices using: reference, amount, payer name
    2. Apply exact matches automatically
    3. Flag ambiguous matches for review
    4. Handle partial/combined payments

    MATCHING PRIORITY:
    1. Exact reference match
    2. Amount + payer name match
    3. Amount + fuzzy reference match
    4. Amount-only match (flag for review)

SARS Agent:
  Implementation: Task tool with subagent_type="general-purpose"
  Prompt Template: |
    You are a SARS Compliance agent for a South African creche.

    CONTEXT:
    - Categorized transactions: [from database]
    - Payroll data: [from payroll integration]
    - Tax tables: [loaded from .claude/context/sars_tables_2025.json]

    TASK:
    1. Calculate VAT (output and input)
    2. Calculate PAYE per employee
    3. Calculate UIF contributions
    4. Generate submission-ready reports

    CONSTRAINTS:
    - ALL outputs require human review before submission
    - Flag any items needing clarification
    - Use current year tax tables only
```

### Agent Roles and Responsibilities

| Agent | Responsibility | Input | Output | Autonomy Level |
|-------|----------------|-------|--------|----------------|
| **Orchestrator** (Main Claude Code session) | Workflow coordination; task scheduling; escalation handling | Events, triggers, agent outputs | Task assignments, escalations | L3 (Consultant) |
| **Transaction Categorizer** (Task subagent) | Categorize bank transactions to Chart of Accounts | Bank transactions, historical patterns | Categorized transactions, confidence scores | L4 (Approver) for high confidence; L2 (Collaborator) for low confidence |
| **Billing Agent** (Task subagent) | Generate invoices based on enrollment and fee structures | Enrollment data, fee structures, date triggers | Draft invoices in Xero | L3 (Consultant) - drafts require approval |
| **Payment Matcher** (Task subagent) | Match incoming payments to outstanding invoices | Bank deposits, open invoices | Payment allocations, unmatched flags | L4 (Approver) for exact matches; L2 for ambiguous |
| **SARS Agent** (Task subagent) | Calculate and generate SARS submissions | Categorized transactions, payroll data, VAT invoices | VAT201, EMP201 drafts | L2 (Collaborator) - always human review |
| **Xero Integration** (MCP Server) | Bi-directional sync with Xero | CrecheBooks data | Xero API calls | L4 (Approver) - automated sync |

### Agent Autonomy Levels

Following the L1-L5 scale:

- **L1 (Operator)**: Agent proposes; human always approves before action
- **L2 (Collaborator)**: Agent and human jointly work; frequent interaction
- **L3 (Consultant)**: Agent acts on routine items; escalates significant decisions
- **L4 (Approver)**: Agent acts autonomously; human reviews outcomes
- **L5 (Observer)**: Fully autonomous; human monitors for anomalies

**Default Levels by Function:**

| Function | Autonomy Level | Rationale |
|----------|----------------|-----------|
| Transaction categorization (high confidence) | L4 | High accuracy expected; reversible |
| Transaction categorization (low confidence) | L2 | Needs human judgment |
| Invoice generation | L3 | Creates drafts; owner reviews before send |
| Invoice sending | L3 | Owner approves batch; system sends |
| Payment matching (exact) | L4 | Clear matches; reversible |
| Payment matching (ambiguous) | L2 | Financial accuracy critical |
| Arrears reminders | L3 | Follows configured rules; owner can override |
| SARS calculations | L2 | Regulatory risk; always human review |
| Bank reconciliation | L4 | Auto-reconcile clear items; flag discrepancies |

### Claude Code Configuration

**Required MCP Servers:**

```json
{
  "mcpServers": {
    "xero": {
      "command": "npx",
      "args": ["xero-mcp-server"],
      "env": {
        "XERO_CLIENT_ID": "${XERO_CLIENT_ID}",
        "XERO_CLIENT_SECRET": "${XERO_CLIENT_SECRET}"
      }
    },
    "postgres": {
      "command": "npx",
      "args": ["postgres-mcp-server"],
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      }
    },
    "email": {
      "command": "npx",
      "args": ["email-mcp-server"],
      "env": {
        "SMTP_HOST": "${SMTP_HOST}",
        "SMTP_USER": "${SMTP_USER}"
      }
    }
  }
}
```

**Claude Code Context Structure:**

```
.claude/
├── settings.json          # Claude Code settings
├── context/
│   ├── chart_of_accounts.json    # Xero CoA mapping
│   ├── payee_patterns.json       # Learned categorization patterns
│   ├── fee_structures.json       # Creche fee configuration
│   ├── sars_tables_2025.json     # Current SARS tax tables
│   └── tenant_config.json        # Per-creche configuration
├── skills/
│   ├── categorize-transaction.md
│   ├── generate-invoices.md
│   ├── match-payments.md
│   └── calculate-sars.md
└── logs/
    ├── decisions.jsonl           # Audit trail
    └── escalations.jsonl         # Human review queue
```

### Cost Comparison: Claude Code vs Direct API

| Scenario | Direct API Cost | Claude Code Cost | Savings |
|----------|-----------------|------------------|---------|
| Small creche (50 children, 200 transactions/month) | ~$50-100/month | $20/month (Pro) | 60-80% |
| Medium creche (150 children, 600 transactions/month) | ~$150-300/month | $20-100/month | 67-93% |
| Large creche (300 children, 1200 transactions/month) | ~$300-500/month | $100/month (Max) | 67-80% |
| Multi-tenant (100 creches) | ~$5,000-15,000/month | $2,000/month (Team) | 60-87% |

**Note**: Direct API costs assume ~1000-2000 tokens per categorization at $3/MTok input + $15/MTok output. Claude Code subscription provides unlimited usage within fair use policy.

### Agent Communication Contracts

```xml
<inter_agent_contracts>
  <contract id="CONTRACT-ORCH-CATEGORIZER">
    <from>Orchestrator (Main Session)</from>
    <to>Transaction Categorizer (Task Subagent)</to>
    <message_type>CategorizationRequest</message_type>
    <implementation>Task tool invocation with structured prompt</implementation>
    <schema>
      {
        "request_id": "uuid",
        "tenant_id": "creche-123",
        "transactions": [
          {
            "transaction_id": "xero-tx-456",
            "date": "2025-12-01",
            "description": "WOOLWORTHS SANDTON",
            "amount": -1250.00,
            "payee": "WOOLWORTHS"
          }
        ],
        "context": {
          "historical_patterns": true,
          "chart_of_accounts_version": "2025-01"
        }
      }
    </schema>
    <response>
      {
        "request_id": "uuid",
        "results": [
          {
            "transaction_id": "xero-tx-456",
            "category": "Food and Provisions",
            "account_code": "6100",
            "confidence": 0.92,
            "reasoning": "Matched payee pattern 'WOOLWORTHS' to historical Food category",
            "requires_review": false
          }
        ]
      }
    </response>
  </contract>

  <contract id="CONTRACT-CATEGORIZER-XERO">
    <from>Transaction Categorizer</from>
    <to>Xero MCP Server</to>
    <message_type>TransactionUpdate</message_type>
    <implementation>MCP tool call: mcp__xero__update_transaction</implementation>
    <schema>
      {
        "request_id": "uuid",
        "tenant_id": "creche-123",
        "updates": [
          {
            "transaction_id": "xero-tx-456",
            "account_code": "6100",
            "tracking_categories": []
          }
        ]
      }
    </schema>
  </contract>
</inter_agent_contracts>
```

---

## 11. Guardrails and Constraints

### Financial Accuracy Guardrails

| ID | Category | Constraint | Enforcement | Escalation |
|----|----------|-----------|-------------|------------|
| GUARD-FIN-001 | Calculations | All monetary calculations use decimal precision (2 decimal places; banker's rounding) | Code review; unit tests | Alert if rounding errors detected |
| GUARD-FIN-002 | Reconciliation | Bank balance must reconcile within R0.01 | Automated reconciliation check | Flag discrepancy to owner |
| GUARD-FIN-003 | VAT | VAT calculations must match Xero to within R0.01 | Automated verification | Block submission if discrepancy |
| GUARD-FIN-004 | Categorization | No transaction can be deleted; only recategorized with audit trail | Database constraint | Alert on deletion attempt |

### Data Integrity Guardrails

| ID | Category | Constraint | Enforcement | Escalation |
|----|----------|-----------|-------------|------------|
| GUARD-DATA-001 | Immutability | Finalized SARS submissions cannot be modified | Database constraint; versioning | Require new submission instead |
| GUARD-DATA-002 | Audit Trail | All changes to financial data logged with timestamp, user, before/after | Automatic logging via Claude Code | None (always active) |
| GUARD-DATA-003 | Data Isolation | Tenants cannot access each other's data | Row-level security; API validation | Security alert on violation attempt |
| GUARD-DATA-004 | Backup | Financial data backed up every 6 hours | Automated backup jobs | Alert if backup fails |

### AI Safety Guardrails (Claude Code Specific)

| ID | Category | Constraint | Enforcement | Escalation |
|----|----------|-----------|-------------|------------|
| GUARD-AI-001 | Confidence | Low-confidence (<80%) categorizations require human review | AskUserQuestion tool triggers review | Cannot proceed without review |
| GUARD-AI-002 | Learning | User corrections limited to 50/day to prevent adversarial training | Rate limiting in application layer | Alert owner; require reason |
| GUARD-AI-003 | Hallucination | Agent cannot create invoices for non-existent children | Enrollment validation via MCP | Reject; alert admin |
| GUARD-AI-004 | Scope | Agent cannot access or modify data outside assigned tenant | MCP server security; database constraints | Security alert |
| GUARD-AI-005 | Cost | Claude Code usage monitored; alert if session count exceeds limits | Session tracking | Throttle; alert ops team |
| GUARD-AI-006 | Context | All agent decisions logged to .claude/logs/decisions.jsonl | Claude Code built-in logging | Audit review |

### Compliance Guardrails

| ID | Category | Constraint | Enforcement | Escalation |
|----|----------|-----------|-------------|------------|
| GUARD-COMP-001 | POPIA | Personal data (parent/child names, contact details) encrypted at rest | Database encryption | None (always active) |
| GUARD-COMP-002 | POPIA | Personal data access logged | Automatic audit trail | None (always active) |
| GUARD-COMP-003 | SARS | Tax calculations must use current year's tax tables | Version-controlled tax tables in context | Alert if outdated tables detected |
| GUARD-COMP-004 | Retention | Financial records retained for 5 years minimum | Archival policy | Alert before deletion |

---

## 12. Risk and Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation | Contingency |
|------|-----------|--------|-----------|-------------|
| Xero API unavailable | Medium | High | Queue operations; retry with backoff; local caching | Manual Xero entry instructions |
| Claude Code service unavailable | Low | High | Queue tasks; fallback to rule-based processing | Manual categorization UI |
| AI categorization accuracy degrades | Low | High | Continuous monitoring; pattern retraining; human review threshold | Fall back to rule-based categorization |
| Bank feed delayed/unavailable | Medium | Medium | Support CSV import; show last-updated timestamp; warn users | Manual bank statement import |
| Data breach | Low | Critical | Encryption; access controls; security audits; penetration testing | Incident response plan; notification procedures |
| Incorrect SARS calculation | Low | High | Multiple validation layers; comparison to previous periods; human review | Amendment submission procedures |

### Business Risks

| Risk | Likelihood | Impact | Mitigation | Contingency |
|------|-----------|--------|-----------|-------------|
| SARS regulations change | Medium | High | Monitor SARS announcements; quarterly compliance review; flexible calculation engine | Manual workaround; rapid update deployment |
| Xero pricing/API changes | Low | Medium | Abstract Xero integration; design for multiple accounting platforms | Support alternative accounting software |
| Claude Code pricing changes | Low | Medium | Monitor Anthropic announcements; architecture supports API fallback | Migrate to API if subscription model changes |
| User adoption resistance | Medium | Medium | Intuitive UX; onboarding support; gradual automation rollout | Enhanced training; white-glove onboarding |
| Competitive alternative emerges | Medium | Medium | Focus on SA-specific needs; superior Xero integration; excellent support | Feature differentiation; pricing flexibility |

### Operational Risks

| Risk | Likelihood | Impact | Mitigation | Contingency |
|------|-----------|--------|-----------|-------------|
| Support volume exceeds capacity | Medium | Medium | Self-service help; in-app guidance; tiered support | Contract additional support; prioritize critical issues |
| Infrastructure cost overruns | Low | Medium | Usage monitoring; cost alerts; efficient architecture | Scaling optimization; user throttling |
| Key person dependency | Medium | Medium | Documentation; knowledge sharing; pair programming | Cross-training; contractor backup |

---

## 13. Human Oversight Checkpoints

### Workflow Checkpoints

| Checkpoint | Trigger | Human Action | Approval Required | SLA |
|-----------|---------|--------------|------------------|-----|
| Transaction Review | Low-confidence categorization | Review flagged items; correct or confirm | Yes (owner/admin) | Within 48 hours |
| Invoice Approval | Monthly invoice batch generated | Review draft invoices; approve for sending | Yes (owner) | Within 24 hours of generation |
| Payment Allocation Review | Ambiguous payment match | Select correct invoice(s) for allocation | Yes (owner/admin) | Within 48 hours |
| SARS Submission Review | Monthly/bi-monthly SARS deadline | Review generated submission; submit to SARS | Yes (owner/accountant) | 3 days before deadline |
| Reconciliation Review | Month-end reconciliation | Review discrepancies; resolve or document | Yes (owner/accountant) | Within 5 business days of month-end |

### Escalation Triggers

| Trigger | Condition | Escalation Target | Action Required |
|---------|-----------|-------------------|-----------------|
| Critical categorization error | User reports incorrect categorization affecting financials | Product team | Investigate; correct; retrain model |
| Invoice delivery failure | >10% invoice delivery failures | Owner + Support | Alternative delivery; contact verification |
| Payment mismatch accumulation | >20 unmatched payments older than 7 days | Owner | Manual review session |
| Reconciliation discrepancy | Discrepancy >R1,000 | Owner + Accountant | Immediate investigation |
| SARS deadline at risk | <24 hours to deadline; submission not reviewed | Owner (SMS/call) | Urgent attention required |

### Over-the-Loop Monitoring

| Monitor | Threshold | Action |
|---------|-----------|--------|
| Categorization accuracy | <90% over 7 days | Alert product team; investigate |
| Claude Code session errors | >5 consecutive failures | Alert ops; check Claude Code status |
| Xero sync failures | >5 consecutive failures | Alert ops; manual intervention |
| User-reported errors | >3 reports same issue | Escalate to engineering |
| Login anomalies | Unusual location/time | Security alert; require 2FA |

---

## 14. Success Criteria for Delivery

### Minimum Viable Product (MVP) Checklist

- [ ] **Transaction Categorization**
  - [ ] Bank feed import working (at least CSV; ideally Yodlee)
  - [ ] Claude Code agent categorization achieving 85%+ accuracy on test data
  - [ ] Low-confidence flagging functional
  - [ ] User correction feedback loop working
  - [ ] Xero sync for categorized transactions via MCP

- [ ] **Fee Billing**
  - [ ] Enrollment register with add/edit/remove children
  - [ ] Fee structure configuration (at least fixed monthly fee)
  - [ ] Monthly invoice generation in Xero via MCP
  - [ ] Email invoice delivery via Xero
  - [ ] Invoice status tracking (draft, sent, paid)

- [ ] **Payment Matching**
  - [ ] Payment import from bank feed
  - [ ] Claude Code agent matching by reference and amount
  - [ ] Partial payment support
  - [ ] Unmatched payment flagging
  - [ ] Arrears dashboard

- [ ] **SARS Compliance**
  - [ ] VAT calculation (output on invoices, input on expenses)
  - [ ] VAT201 report generation (printable format)
  - [ ] Basic PAYE calculation
  - [ ] EMP201 report generation (printable format)

- [ ] **Reconciliation**
  - [ ] Automatic reconciliation of matched transactions
  - [ ] Discrepancy flagging
  - [ ] Reconciliation status view

### Quality Gates

- [ ] **Testing**
  - [ ] Unit test coverage >80%
  - [ ] Integration tests for all Xero MCP interactions
  - [ ] End-to-end tests for core user journeys
  - [ ] Performance tests: 100 invoices in <60s; 1000 transactions in <5min

- [ ] **Security**
  - [ ] OWASP Top 10 vulnerabilities addressed
  - [ ] Penetration test completed; critical/high findings resolved
  - [ ] POPIA compliance review completed
  - [ ] Data encryption verified

- [ ] **Documentation**
  - [ ] User documentation for all features
  - [ ] Claude Code skill documentation
  - [ ] MCP server configuration guide
  - [ ] Runbook for common support scenarios
  - [ ] Architecture documentation

- [ ] **Operational Readiness**
  - [ ] Monitoring and alerting configured
  - [ ] Backup and recovery tested
  - [ ] Support escalation procedures documented
  - [ ] On-call rotation established

### Acceptance Testing

- [ ] 3 pilot creches complete full month-end cycle
- [ ] Average satisfaction score >4/5 from pilot users
- [ ] Zero critical bugs in pilot
- [ ] Time savings validated (>80% reduction from baseline)

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| **Claude Code** | Anthropic's official CLI tool for Claude, providing subscription-based access to Claude's capabilities with built-in tools for file operations, shell commands, and MCP integration |
| **Creche** | South African term for early childhood development centre / daycare / pre-school |
| **Chart of Accounts** | Structured list of expense and income categories used in accounting |
| **EMP201** | South African employer monthly tax submission (PAYE, UIF, SDL) |
| **IRP5** | South African employee tax certificate issued annually |
| **MCP** | Model Context Protocol - standard for connecting AI systems to external tools and data sources |
| **PAYE** | Pay As You Earn - income tax deducted from employee salaries |
| **POPIA** | Protection of Personal Information Act - South African data protection law |
| **SARS** | South African Revenue Service |
| **SDL** | Skills Development Levy (1% of payroll; not all creches liable) |
| **Task Subagent** | Claude Code's Task tool for spawning specialized agents for specific subtasks |
| **UIF** | Unemployment Insurance Fund (2% of salary; employer + employee contributions) |
| **VAT** | Value Added Tax (15% in South Africa) |
| **VAT201** | South African VAT return submitted monthly or bi-monthly |
| **Xero** | Cloud accounting software; CrecheBooks integrates as primary accounting system |
| **Yodlee** | Bank data aggregation service for importing bank feeds |

---

## Appendix B: South African Tax Reference

### VAT Thresholds and Rates (2025)

| Item | Value |
|------|-------|
| VAT Rate | 15% |
| Compulsory registration threshold | R1,000,000 turnover in 12 months |
| Voluntary registration threshold | R50,000 turnover in 12 months |
| VAT201 submission deadline | 25th of following month |

### PAYE Tax Tables (2025 Tax Year)

*Note: System must use official SARS tax tables; below is illustrative only*

| Taxable Income | Tax Rate |
|----------------|----------|
| R1 - R237,100 | 18% |
| R237,101 - R370,500 | 26% |
| R370,501 - R512,800 | 31% |
| R512,801 - R673,000 | 36% |
| R673,001 - R857,900 | 39% |
| R857,901 - R1,817,000 | 41% |
| R1,817,001+ | 45% |

### UIF Rates

| Contribution | Rate |
|--------------|------|
| Employee contribution | 1% of remuneration (max R177.12/month) |
| Employer contribution | 1% of remuneration (max R177.12/month) |
| Total UIF | 2% |
| EMP201 submission deadline | 7th of following month |

---

## Appendix C: Related Documents

- Technical Specification: CrecheBooks Architecture (to be created)
- Technical Specification: Xero MCP Server Integration (to be created)
- Technical Specification: Claude Code Agent Configuration (to be created)
- Database Schema: CrecheBooks Data Model (to be created)
- API Specification: CrecheBooks REST API (to be created)
- Security Assessment: POPIA Compliance (to be created)
- User Guide: CrecheBooks Owner Manual (to be created)

---

## Appendix D: Xero Integration Reference

### Required Xero Scopes

```
openid
profile
email
accounting.transactions
accounting.contacts
accounting.settings
accounting.attachments
```

### Key Xero API Endpoints (via MCP Server)

| Endpoint | Purpose | CrecheBooks Usage |
|----------|---------|-------------------|
| GET /BankTransactions | Retrieve bank transactions | Import for categorization |
| PUT /BankTransactions | Update bank transaction | Apply categorization |
| GET /Invoices | Retrieve invoices | Sync invoice status |
| PUT /Invoices | Create/update invoice | Generate parent invoices |
| POST /Invoices/{id}/Email | Email invoice | Send to parents |
| GET /Contacts | Retrieve contacts | Get parent details |
| PUT /Contacts | Create/update contact | Add new parents |
| GET /Accounts | Get Chart of Accounts | Categorization mapping |
| GET /Payments | Retrieve payments | Match payments |
| PUT /Payments | Create payment | Allocate payments to invoices |

### Rate Limits

- 60 API calls per minute per connection
- Daily call limit varies by Xero subscription

---

## Appendix E: Claude Code Integration Reference

### Claude Code vs API Comparison

| Feature | Claude Code CLI | Direct API |
|---------|-----------------|------------|
| Pricing Model | Subscription ($20-100/month) | Per-token ($3-15/MTok) |
| Session Persistence | Built-in | Manual implementation |
| Tool Calling | Native (Read, Write, Bash, Task, etc.) | Manual function calling |
| MCP Integration | Built-in | Manual implementation |
| Audit Logging | Built-in | Manual implementation |
| Human-in-the-Loop | AskUserQuestion tool | Custom UI required |
| Multi-agent | Task tool subagents | Manual orchestration |
| Context Management | Automatic summarization | Manual truncation |

### Claude Code Skills for CrecheBooks

Skills are defined in `.claude/skills/` directory:

```markdown
# categorize-transaction.md
---
name: Categorize Transaction
description: Categorize a bank transaction to Chart of Accounts
---

## Instructions
1. Load chart of accounts from context
2. Load historical payee patterns
3. Analyze transaction description
4. Match to most likely category
5. Return confidence score and reasoning

## Output Format
JSON with category, account_code, confidence, reasoning, requires_review
```

### Recommended Claude Code Configuration

```json
{
  "model": "claude-sonnet-4-20250514",
  "permissions": {
    "allow_read": true,
    "allow_write": true,
    "allow_bash": false,
    "allow_mcp": ["xero", "postgres", "email"]
  },
  "context": {
    "max_tokens": 100000,
    "auto_summarize": true
  }
}
```

---

## Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-12-19 | [PM Name] | Initial PRD creation |
| 1.1 | 2025-12-19 | [PM Name] | Updated AI agent layer to use Claude Code CLI instead of direct API calls for cost savings |

---

**Document Status**: Draft
**Next Review**: [Date]
**Approvers**: [Product Manager], [Technical Lead], [Compliance Officer]

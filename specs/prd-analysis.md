# PRD Analysis: CrecheBooks AI Bookkeeping System

## Document Reference
- **PRD ID**: PRD-2025-001
- **Analysis Date**: 2025-12-19
- **Analyst**: AI Agent
- **Status**: Complete

---

## Extracted User Types

| User Type | Description | Permission Level | Primary Goals |
|-----------|-------------|------------------|---------------|
| Creche Owner-Operator | Small to medium creche (20-80 children); handles own admin | Owner | Minimize admin time; ensure compliance; improve cash flow |
| Creche Administrator | Dedicated admin staff at larger creche (80-200 children) | Admin | Efficient workflows; accurate records; easy reporting |
| Creche Accountant | External bookkeeper managing multiple creches | Accountant | Batch processing; consistent categorization; audit-ready reports |
| Regulatory Auditor | SARS auditor or financial auditor | Viewer (Read-only) | Clear audit trail; accurate records; compliant submissions |
| Parent | Parent of enrolled child | None (external) | Receive invoices; make payments; view statement |

---

## User Journeys Identified

### Primary Journey: Monthly Bookkeeping Cycle (Owner-Operator)
1. **Bank Transaction Import**: System automatically imports bank transactions
2. **AI Categorization**: Claude Code agents categorize transactions
3. **Review Flagged Items**: Owner reviews flagged items (<5%)
4. **Invoice Generation**: System generates monthly parent invoices
5. **Invoice Approval & Delivery**: Owner approves; system sends via email/WhatsApp
6. **Payment Matching**: System matches incoming payments to invoices
7. **Arrears Management**: System generates reports; sends reminders
8. **SARS Submissions**: System generates submission-ready reports
9. **Monthly Reconciliation**: Auto-completes; owner reviews dashboard

### Secondary Journeys
1. **New Child Enrollment**: Add child, set up fee structure, create parent contact
2. **Mid-Month Changes**: Handle enrollment/withdrawal with pro-rata calculations
3. **Payment Investigation**: Investigate unmatched payments or disputes
4. **Year-End Processing**: Generate IRP5 certificates, annual reconciliation
5. **Audit Preparation**: Generate audit-ready reports and documentation

---

## Functional Domains

| Domain | Code | Description | Priority |
|--------|------|-------------|----------|
| Transaction Categorization | TRANS | Import and categorize bank transactions | MUST |
| Fee Billing | BILL | Generate, send, and track school fee invoices | MUST |
| Payment Matching | PAY | Match payments to invoices; manage arrears | MUST |
| SARS Compliance | SARS | Calculate and generate tax submissions | MUST |
| Reconciliation | RECON | Bank reconciliation and financial reporting | MUST |
| Enrollment Management | ENROLL | Child/parent registration and fee structures | MUST |
| User Management | USER | Authentication, authorization, multi-tenancy | MUST |
| Xero Integration | XERO | Bi-directional sync with Xero accounting | MUST |

---

## Requirements Extraction

### Transaction Categorization Domain (TRANS)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| REQ-TRANS-001 | Import bank transactions via Yodlee/bank feed, PDF upload, or CSV | MUST | Section 5 |
| REQ-TRANS-002 | Claude Code agents categorize transactions to Xero Chart of Accounts | MUST | Section 5 |
| REQ-TRANS-003 | Achieve 95% categorization accuracy after training period | MUST | Section 5 |
| REQ-TRANS-004 | Flag low-confidence (<80%) categorizations for human review | MUST | Section 5 |
| REQ-TRANS-005 | User corrections train the categorization model | MUST | Section 5 |
| REQ-TRANS-006 | Detect and auto-categorize recurring transaction patterns | SHOULD | Section 5 |
| REQ-TRANS-007 | Show categorization explainability (confidence + reasoning) | SHOULD | Section 5 |
| REQ-TRANS-008 | Bi-directional sync with Xero (categories, transactions) | MUST | Section 5 |
| REQ-TRANS-009 | Support split transactions (one payment, multiple categories) | SHOULD | Section 5 |
| REQ-TRANS-010 | Manage payee aliases (same vendor, different names) | SHOULD | Section 5 |

### Fee Billing Domain (BILL)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| REQ-BILL-001 | Generate monthly invoices for all enrolled children | MUST | Section 5 |
| REQ-BILL-002 | Configurable invoice generation date per creche | MUST | Section 5 |
| REQ-BILL-003 | Create invoices as drafts in Xero for review | MUST | Section 5 |
| REQ-BILL-004 | Include child name, parent, fee breakdown, due date, payment details | MUST | Section 5 |
| REQ-BILL-005 | Support variable fee structures (full-day, half-day, siblings, extras) | MUST | Section 5 |
| REQ-BILL-006 | Send invoices via email using Xero or custom templates | MUST | Section 5 |
| REQ-BILL-007 | WhatsApp invoice delivery via approved business API | SHOULD | Section 5 |
| REQ-BILL-008 | Track delivery status (sent, delivered, failed) | SHOULD | Section 5 |
| REQ-BILL-009 | Maintain enrollment register with child/parent/fee details | MUST | Section 5 |
| REQ-BILL-010 | Calculate pro-rata fees for mid-month changes | SHOULD | Section 5 |

### Payment Matching Domain (PAY)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| REQ-PAY-001 | Match incoming payments to outstanding invoices | MUST | Section 5 |
| REQ-PAY-002 | Match using reference, amount, and payer name | MUST | Section 5 |
| REQ-PAY-003 | Apply exact matches automatically | MUST | Section 5 |
| REQ-PAY-004 | Flag ambiguous matches for human review | MUST | Section 5 |
| REQ-PAY-005 | Support partial payments (multiple payments per invoice) | MUST | Section 5 |
| REQ-PAY-006 | Support combined payments (one payment, multiple invoices) | SHOULD | Section 5 |
| REQ-PAY-007 | Display arrears dashboard (total, aging, top debtors) | MUST | Section 5 |
| REQ-PAY-008 | View individual parent payment history | SHOULD | Section 5 |
| REQ-PAY-009 | Send automated payment reminders per schedule | SHOULD | Section 5 |
| REQ-PAY-010 | Customizable reminder templates | SHOULD | Section 5 |

### SARS Compliance Domain (SARS)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| REQ-SARS-001 | Calculate VAT output on school fee invoices | MUST | Section 5 |
| REQ-SARS-002 | Calculate VAT input on categorized expenses | MUST | Section 5 |
| REQ-SARS-003 | Generate VAT201 return in SARS format | MUST | Section 5 |
| REQ-SARS-004 | Distinguish zero-rated vs VAT-exempt items | MUST | Section 5 |
| REQ-SARS-005 | Flag missing VAT invoice details | SHOULD | Section 5 |
| REQ-SARS-006 | Integrate payroll data (staff, salaries) | MUST | Section 5 |
| REQ-SARS-007 | Calculate PAYE per current SARS tax tables | MUST | Section 5 |
| REQ-SARS-008 | Calculate UIF at statutory rates | MUST | Section 5 |
| REQ-SARS-009 | Generate EMP201 return in SARS format | MUST | Section 5 |
| REQ-SARS-010 | Generate IRP5 certificates annually | MUST | Section 5 |
| REQ-SARS-011 | SARS deadline calendar with reminders | SHOULD | Section 5 |
| REQ-SARS-012 | Track submission status (draft, submitted, acknowledged) | SHOULD | Section 5 |

### Reconciliation Domain (RECON)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| REQ-RECON-001 | Perform automatic bank reconciliation | MUST | Section 5 |
| REQ-RECON-002 | Mark matched transactions as reconciled | MUST | Section 5 |
| REQ-RECON-003 | Flag discrepancies for review | MUST | Section 5 |
| REQ-RECON-004 | Show reconciliation summary (opening/closing balances) | SHOULD | Section 5 |
| REQ-RECON-005 | Generate Income Statement on demand | SHOULD | Section 5 |
| REQ-RECON-006 | Generate Balance Sheet on demand | SHOULD | Section 5 |
| REQ-RECON-007 | Maintain transaction audit trail | MUST | Section 5 |

---

## Non-Functional Requirements

| ID | Category | Requirement | Metric | Source |
|----|----------|-------------|--------|--------|
| NFR-PERF-001 | Latency | Transaction categorization response | <2 seconds p95 | Section 6 |
| NFR-PERF-002 | Latency | Invoice generation batch (100 invoices) | <60 seconds | Section 6 |
| NFR-PERF-003 | Latency | Dashboard load | <3 seconds TTI | Section 6 |
| NFR-PERF-004 | Throughput | Bank transaction import | 1000+/minute | Section 6 |
| NFR-PERF-005 | Throughput | Concurrent users | 100 per creche; 10,000 total | Section 6 |
| NFR-REL-001 | Availability | System uptime | 99.5% monthly | Section 6 |
| NFR-REL-002 | Durability | Recovery Point Objective | <1 hour | Section 6 |
| NFR-REL-003 | Recovery | Recovery Time Objective | <4 hours | Section 6 |
| NFR-REL-004 | Integration | Xero unavailability handling | Queue + retry within 24h | Section 6 |
| NFR-SEC-001 | Authentication | User authentication | OAuth 2.0 / OIDC | Section 6 |
| NFR-SEC-002 | Authorization | RBAC | Owner, Admin, Viewer, Accountant | Section 6 |
| NFR-SEC-003 | Encryption | Data in transit | TLS 1.2+ | Section 6 |
| NFR-SEC-004 | Encryption | Data at rest | AES-256 | Section 6 |
| NFR-SEC-005 | Privacy | POPIA compliance | Personal data handling | Section 6 |
| NFR-SEC-006 | API Security | Xero OAuth tokens | Secure storage | Section 6 |
| NFR-SEC-007 | Audit | Access logging | All data access logged | Section 6 |
| NFR-COMP-001 | Data Protection | POPIA compliance | Annual audit | Section 6 |
| NFR-COMP-002 | Financial | Audit trail integrity | Immutable logs | Section 6 |
| NFR-COMP-003 | Tax | SARS format compliance | Annual validation | Section 6 |
| NFR-COMP-004 | Retention | Financial records | 5-year retention | Section 6 |
| NFR-SCAL-001 | Tenants | Multi-tenant support | 1,000 creches | Section 6 |
| NFR-SCAL-002 | Data | Transaction volume | 10,000 transactions/year per tenant | Section 6 |
| NFR-SCAL-003 | AI | Concurrent categorization | 100 requests | Section 6 |

---

## Edge Cases Identified

### Transaction Categorization

| ID | Related Req | Edge Case | Expected Behavior |
|----|-------------|-----------|-------------------|
| EC-TRANS-001 | REQ-TRANS-002 | Blank or gibberish description | Flag for review; suggest based on patterns |
| EC-TRANS-002 | REQ-TRANS-002 | Payee name variations (WOOLWORTHS vs WOOLIES) | Alias detection; prompt user confirmation |
| EC-TRANS-003 | REQ-TRANS-006 | Recurring transaction amount varies >50% | Flag for review; don't auto-categorize |
| EC-TRANS-004 | REQ-TRANS-008 | Xero API unavailable | Queue locally; retry with backoff |
| EC-TRANS-005 | REQ-TRANS-009 | Split amounts don't equal total | Validation error |
| EC-TRANS-006 | REQ-TRANS-002 | Transaction is reversal/refund | Detect and link; same category, negative |
| EC-TRANS-007 | REQ-TRANS-003 | All low confidence in first month | Show "learning mode" indicator |

### Fee Billing

| ID | Related Req | Edge Case | Expected Behavior |
|----|-------------|-----------|-------------------|
| EC-BILL-001 | REQ-BILL-001 | Child enrolled mid-month | Pro-rata invoice with calculation shown |
| EC-BILL-002 | REQ-BILL-001 | Child withdrawn mid-month | Pro-rata credit note or final invoice |
| EC-BILL-003 | REQ-BILL-005 | Sibling count changes | Recalculate discounts for all siblings |
| EC-BILL-004 | REQ-BILL-006 | Parent email bounces | Mark failed; flag for manual follow-up |
| EC-BILL-005 | REQ-BILL-007 | WhatsApp number invalid | Fall back to email; notify owner |
| EC-BILL-006 | REQ-BILL-009 | Duplicate enrollment entry | Validation prevents; merge prompt if detected |
| EC-BILL-007 | REQ-BILL-004 | Fee structure changes mid-year | Apply from specified date; no retroactive changes |

### Payment Matching

| ID | Related Req | Edge Case | Expected Behavior |
|----|-------------|-----------|-------------------|
| EC-PAY-001 | REQ-PAY-002 | Amount doesn't match any invoice | Fuzzy match on reference/name; flag |
| EC-PAY-002 | REQ-PAY-002 | Reference doesn't match invoice number | Secondary matching; flag if uncertain |
| EC-PAY-003 | REQ-PAY-005 | Partial payment | Apply to invoice; show remaining balance |
| EC-PAY-004 | REQ-PAY-005 | Multiple payments same day | Offer to apply to oldest or allocate |
| EC-PAY-005 | REQ-PAY-006 | One payment covers siblings | Suggest split; allow manual allocation |
| EC-PAY-006 | REQ-PAY-001 | Unknown parent | Flag as unallocated; prompt to create |
| EC-PAY-007 | REQ-PAY-007 | Parent disputes amount | Show history; support notes |

### SARS Compliance

| ID | Related Req | Edge Case | Expected Behavior |
|----|-------------|-----------|-------------------|
| EC-SARS-001 | REQ-SARS-002 | Expense missing VAT number | Flag; exclude until resolved |
| EC-SARS-002 | REQ-SARS-004 | Unsure if zero-rated or exempt | Flag; provide guidance |
| EC-SARS-003 | REQ-SARS-007 | Tax tables change mid-year | Apply correct tables per period |
| EC-SARS-004 | REQ-SARS-007 | Staff has multiple employers | Warn about under-withholding |
| EC-SARS-005 | REQ-SARS-006 | Casual/temporary staff | Support hourly/daily rates |
| EC-SARS-006 | REQ-SARS-010 | Staff leaves mid-year | Generate IRP5 for period worked |
| EC-SARS-007 | REQ-SARS-001 | Creche below VAT threshold | Track turnover; alert near R1M |

### Reconciliation

| ID | Related Req | Edge Case | Expected Behavior |
|----|-------------|-----------|-------------------|
| EC-RECON-001 | REQ-RECON-001 | Balance doesn't match | Show discrepancy; list unreconciled |
| EC-RECON-002 | REQ-RECON-003 | Duplicate transaction imported | Detect; prompt delete/merge |
| EC-RECON-003 | REQ-RECON-003 | Transaction in Xero not in bank | Flag; may be cash or error |
| EC-RECON-004 | REQ-RECON-001 | Bank feed lag | Handle gracefully; don't flag prematurely |
| EC-RECON-005 | REQ-RECON-007 | Delete reconciled transaction | Prevent; require unreconcile first |

---

## Open Questions for Stakeholders

1. **Bank Integration Priority**: Which banks beyond FNB need support in MVP?
2. **WhatsApp Business API**: Has the business been approved for WhatsApp Business API access?
3. **Payroll Integration**: Which payroll systems (PaySpace, SimplePay) need priority integration?
4. **VAT Registration**: What percentage of target creches are VAT registered?
5. **Multi-location Support**: How many creche groups have multiple locations (for Phase 2)?
6. **Offline Support**: Is offline capability required for areas with unreliable internet?
7. **Historical Data Migration**: How much historical data needs to be imported from existing systems?
8. **Language Support**: Is Afrikaans or other official languages required for invoices/reports?

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Functional Domains | 8 |
| User Stories | 14 |
| Functional Requirements | 46 |
| Non-Functional Requirements | 23 |
| Edge Cases Identified | 35 |
| Open Questions | 8 |

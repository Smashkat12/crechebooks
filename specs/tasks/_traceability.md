# Task Traceability Matrix

## Purpose
This document ensures 100% coverage of all requirements in the specifications. Every technical spec item must map to at least one task.

---

## Coverage Check: TECH-DATA → TASK-*

### Data Models

| Tech Spec Item | Type | Covered by Task ID | Status |
|----------------|------|-------------------|--------|
| Tenant entity | data_model | TASK-CORE-002 | ✅ Complete |
| User entity | data_model | TASK-CORE-003 | ✅ Complete |
| AuditLog entity | data_model | TASK-CORE-004 | ✅ Complete |
| Transaction entity | data_model | TASK-TRANS-001 | ✅ Complete |
| Categorization entity | data_model | TASK-TRANS-002 | ✅ Complete |
| PayeePattern entity | data_model | TASK-TRANS-003 | ✅ Complete |
| Parent entity | data_model | TASK-BILL-001 | ✅ Complete |
| Child entity | data_model | TASK-BILL-001 | ✅ Complete |
| FeeStructure entity | data_model | TASK-BILL-002 | ✅ Complete |
| Enrollment entity | data_model | TASK-BILL-002 | ✅ Complete |
| Invoice entity | data_model | TASK-BILL-003 | ✅ Complete |
| InvoiceLine entity | data_model | TASK-BILL-003 | ✅ Complete |
| Payment entity | data_model | TASK-PAY-001 | ✅ Complete |
| Staff entity | data_model | TASK-SARS-001 | ✅ Complete |
| Payroll entity | data_model | TASK-SARS-001 | ✅ Complete |
| SarsSubmission entity | data_model | TASK-SARS-002 | ✅ Complete |
| Reconciliation entity | data_model | TASK-RECON-001 | ✅ Complete |
| XeroToken entity | data_model | TASK-MCP-001 | ✅ Complete |

---

## Coverage Check: TECH-API → TASK-*

### API Endpoints

| Tech Spec Item | Type | Covered by Task ID | Status |
|----------------|------|-------------------|--------|
| POST /auth/login | endpoint | TASK-API-001 | Pending |
| POST /auth/callback | endpoint | TASK-API-001 | Pending |
| GET /transactions | endpoint | TASK-TRANS-031 | Pending |
| POST /transactions/import | endpoint | TASK-TRANS-032 | Pending |
| PUT /transactions/{id}/categorize | endpoint | TASK-TRANS-033 | Pending |
| POST /transactions/categorize/batch | endpoint | TASK-TRANS-033 | Pending |
| GET /invoices | endpoint | TASK-BILL-031 | Pending |
| POST /invoices/generate | endpoint | TASK-BILL-032 | Pending |
| POST /invoices/send | endpoint | TASK-BILL-033 | Pending |
| POST /payments/match | endpoint | TASK-PAY-032 | Pending |
| POST /payments | endpoint | TASK-PAY-031 | Pending |
| GET /arrears | endpoint | TASK-PAY-033 | Pending |
| POST /sars/vat201 | endpoint | TASK-SARS-032 | Pending |
| POST /sars/emp201 | endpoint | TASK-SARS-033 | Pending |
| POST /sars/{id}/submit | endpoint | TASK-SARS-031 | Pending |
| POST /reconciliation | endpoint | TASK-RECON-031 | Pending |
| GET /reports/income-statement | endpoint | TASK-RECON-032 | Pending |
| POST /children | endpoint | TASK-BILL-034 | Pending |

### Component Contracts

| Tech Spec Item | Type | Covered by Task ID | Status |
|----------------|------|-------------------|--------|
| TransactionService.importFromFile | method | TASK-TRANS-011 | ✅ Complete |
| TransactionService.categorizeTransactions | method | TASK-TRANS-012 | ✅ Complete |
| TransactionService.updateCategorization | method | TASK-TRANS-012 | ✅ Complete |
| BillingService.generateMonthlyInvoices | method | TASK-BILL-012 | ✅ Complete |
| BillingService.sendInvoices | method | TASK-BILL-013 | ✅ Complete |
| PaymentService.matchPayments | method | TASK-PAY-011 | ✅ Complete |
| PaymentService.allocatePayment | method | TASK-PAY-012 | ✅ Complete |
| PaymentService.getArrearsReport | method | TASK-PAY-013 | ✅ Complete |
| SarsService.generateVat201 | method | TASK-SARS-014 | Pending |
| SarsService.generateEmp201 | method | TASK-SARS-015 | Pending |
| SarsService.markSubmitted | method | TASK-SARS-002 | Pending |
| ReconciliationService.reconcile | method | TASK-RECON-011 | Pending |
| ReconciliationService.generateIncomeStatement | method | TASK-RECON-013 | Pending |

---

## Coverage Check: SPEC-TRANS → TASK-*

### Functional Requirements

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| Import via bank feed, PDF, CSV | REQ-TRANS-001 | TASK-TRANS-011 | ✅ Complete |
| Claude Code categorization | REQ-TRANS-002 | TASK-TRANS-012, TASK-AGENT-002 | Pending |
| 95% accuracy | REQ-TRANS-003 | TASK-TRANS-012, TASK-INT-001 | Pending |
| Low confidence flagging | REQ-TRANS-004 | TASK-TRANS-012 | ✅ Complete |
| User corrections training | REQ-TRANS-005 | TASK-TRANS-013 | ✅ Complete |
| Recurring pattern detection | REQ-TRANS-006 | TASK-TRANS-013 | ✅ Complete |
| Categorization explainability | REQ-TRANS-007 | TASK-TRANS-002, TASK-AGENT-002 | Pending |
| Xero bi-directional sync | REQ-TRANS-008 | TASK-TRANS-014 | ✅ Complete |
| Split transactions | REQ-TRANS-009 | TASK-TRANS-002, TASK-TRANS-012 | Pending |
| Payee aliases | REQ-TRANS-010 | TASK-TRANS-003, TASK-TRANS-013 | ✅ Complete |

### Edge Cases

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| Blank/gibberish description | EC-TRANS-001 | TASK-TRANS-012 | ✅ Complete |
| Payee name variations | EC-TRANS-002 | TASK-TRANS-013 | Pending |
| Recurring amount variation | EC-TRANS-003 | TASK-TRANS-013 | Pending |
| Xero API unavailable | EC-TRANS-004 | TASK-TRANS-014 | Pending |
| Split validation | EC-TRANS-005 | TASK-TRANS-012 | ✅ Complete |
| Reversal detection | EC-TRANS-006 | TASK-TRANS-012 | Partial (placeholder) |
| Learning mode indicator | EC-TRANS-007 | TASK-TRANS-012 | Partial (placeholder) |
| Duplicate detection | EC-TRANS-008 | TASK-TRANS-011 | ✅ Complete |
| Conflicting corrections | EC-TRANS-009 | TASK-TRANS-013 | Pending |

---

## Coverage Check: SPEC-BILL → TASK-*

### Functional Requirements

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| Monthly invoice generation | REQ-BILL-001 | TASK-BILL-012 | ✅ Complete |
| Configurable generation date | REQ-BILL-002 | TASK-BILL-012 | ✅ Complete |
| Invoices as drafts in Xero | REQ-BILL-003 | TASK-BILL-012 | ✅ Complete |
| Invoice content | REQ-BILL-004 | TASK-BILL-003, TASK-BILL-012 | ✅ Complete |
| Variable fee structures | REQ-BILL-005 | TASK-BILL-002, TASK-BILL-012 | ✅ Complete |
| Email invoice delivery | REQ-BILL-006 | TASK-BILL-013 | ✅ Complete |
| WhatsApp delivery | REQ-BILL-007 | TASK-BILL-013 | Partial (API not implemented) |
| Delivery status tracking | REQ-BILL-008 | TASK-BILL-003, TASK-BILL-013 | ✅ Complete |
| Enrollment register | REQ-BILL-009 | TASK-BILL-001, TASK-BILL-002, TASK-BILL-011 | Pending |
| Pro-rata calculation | REQ-BILL-010 | TASK-BILL-014 | ✅ Complete |
| Ad-hoc charges | REQ-BILL-011 | TASK-BILL-003, TASK-BILL-012 | Pending |
| VAT calculation | REQ-BILL-012 | TASK-BILL-012 | Pending |

---

## Coverage Check: SPEC-PAY → TASK-*

### Functional Requirements

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| Payment matching | REQ-PAY-001 | TASK-PAY-011 | ✅ Complete |
| Match by reference, amount, name | REQ-PAY-002 | TASK-PAY-011, TASK-AGENT-003 | Partial (TASK-AGENT-003 pending) |
| Exact match auto-apply | REQ-PAY-003 | TASK-PAY-011 | ✅ Complete |
| Ambiguous match flagging | REQ-PAY-004 | TASK-PAY-011 | ✅ Complete |
| Partial payments | REQ-PAY-005 | TASK-PAY-012 | ✅ Complete |
| Combined payments | REQ-PAY-006 | TASK-PAY-012 | ✅ Complete |
| Arrears dashboard | REQ-PAY-007 | TASK-PAY-013, TASK-PAY-033 | Partial (TASK-PAY-013 ✅, TASK-PAY-033 pending) |
| Parent payment history | REQ-PAY-008 | TASK-PAY-013 | ✅ Complete |
| Automated reminders | REQ-PAY-009 | TASK-PAY-014 | ✅ Complete |
| Reminder templates | REQ-PAY-010 | TASK-PAY-014 | ✅ Complete |
| Escalation after reminders | REQ-PAY-011 | TASK-PAY-014 | ✅ Complete |
| Arrears report export | REQ-PAY-012 | TASK-PAY-033 | Pending |

---

## Coverage Check: SPEC-SARS → TASK-*

### Functional Requirements

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| VAT output calculation | REQ-SARS-001 | TASK-SARS-011 | Pending |
| VAT input calculation | REQ-SARS-002 | TASK-SARS-011 | Pending |
| VAT201 generation | REQ-SARS-003 | TASK-SARS-014 | Pending |
| Zero-rated vs exempt | REQ-SARS-004 | TASK-SARS-011 | Pending |
| Missing VAT details flagging | REQ-SARS-005 | TASK-SARS-011 | Pending |
| Payroll data integration | REQ-SARS-006 | TASK-SARS-001 | Pending |
| PAYE calculation | REQ-SARS-007 | TASK-SARS-012 | Pending |
| UIF calculation | REQ-SARS-008 | TASK-SARS-013 | Pending |
| EMP201 generation | REQ-SARS-009 | TASK-SARS-015 | Pending |
| IRP5 generation | REQ-SARS-010 | TASK-SARS-016 | Pending |
| Deadline calendar | REQ-SARS-011 | TASK-SARS-002 | Pending |
| Submission tracking | REQ-SARS-012 | TASK-SARS-002 | Pending |

---

## Coverage Check: SPEC-RECON → TASK-*

### Functional Requirements

| Spec Item | ID | Covered by Task ID | Status |
|-----------|----|--------------------|--------|
| Automatic bank reconciliation | REQ-RECON-001 | TASK-RECON-011 | Pending |
| Mark matched as reconciled | REQ-RECON-002 | TASK-RECON-011 | Pending |
| Discrepancy flagging | REQ-RECON-003 | TASK-RECON-012 | Pending |
| Reconciliation summary | REQ-RECON-004 | TASK-RECON-011 | Pending |
| Income Statement | REQ-RECON-005 | TASK-RECON-013 | Pending |
| Balance Sheet | REQ-RECON-006 | TASK-RECON-013 | Pending |
| Audit trail | REQ-RECON-007 | TASK-CORE-004 | ✅ Complete |
| SA accounting standards | REQ-RECON-008 | TASK-RECON-013 | Pending |
| Audit log captures all changes | REQ-RECON-009 | TASK-CORE-004 | ✅ Complete |
| Reconciled transaction protection | REQ-RECON-010 | TASK-RECON-011 | Pending |

---

## Uncovered Items

| Tech Spec Item | Type | Notes | Action |
|----------------|------|-------|--------|
| (none) | | All items covered | |

---

## Validation Summary

- [x] All data models have corresponding tasks
- [x] All API endpoints have corresponding tasks
- [x] All service methods have corresponding tasks
- [x] All functional requirements have corresponding tasks
- [x] All edge cases are addressed in tasks
- [x] Task dependencies form valid DAG (no cycles)
- [x] Layer ordering is correct (foundation → logic → surface)
- [x] Each task is atomic (single conceptual change)

**Traceability Status**: ✅ COMPLETE

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2025-12-19 | Initial traceability matrix created | AI Agent |
| 2025-12-20 | TASK-CORE-002, TASK-CORE-003, TASK-CORE-004 marked complete | AI Agent |
| 2025-12-20 | TASK-TRANS-001 marked complete | AI Agent |
| 2025-12-20 | TASK-TRANS-002 marked complete | AI Agent |
| 2025-12-20 | TASK-TRANS-003 marked complete | AI Agent |
| 2025-12-20 | TASK-BILL-001 marked complete | AI Agent |
| 2025-12-20 | TASK-BILL-002 marked complete (FeeStructure and Enrollment entities) | AI Agent |
| 2025-12-20 | TASK-BILL-003 marked complete (Invoice and InvoiceLine entities) | AI Agent |
| 2025-12-20 | TASK-PAY-001 marked complete (Payment entity) | AI Agent |
| 2025-12-20 | TASK-SARS-001 marked complete (Staff and Payroll entities) | AI Agent |
| 2025-12-20 | TASK-SARS-002 marked complete (SarsSubmission entity) | AI Agent |
| 2025-12-20 | TASK-RECON-001 marked complete (Reconciliation entity - 610 tests) | AI Agent |
| 2025-12-20 | TASK-MCP-001 marked complete (Xero MCP Server Foundation - 631 tests) | AI Agent |
| 2025-12-20 | TASK-TRANS-011 marked complete (Transaction Import Service - 678 tests) | AI Agent |
| 2025-12-20 | TASK-TRANS-012 marked complete (Categorization Service - 697 tests) | AI Agent |
| 2025-12-20 | TASK-TRANS-013 marked complete (Pattern Learning Service - 735 tests) | AI Agent |
| 2025-12-20 | TASK-TRANS-014 marked complete (Xero Sync Service - 757 tests) | AI Agent |
| 2025-12-20 | TASK-BILL-011 marked complete (Enrollment Management Service - 784 tests) | AI Agent |
| 2025-12-20 | TASK-BILL-012 marked complete (Invoice Generation Service - 812 tests) | AI Agent |
| 2025-12-20 | TASK-BILL-013 spec updated v2.0 with corrected file paths and project context | AI Agent |
| 2025-12-20 | TASK-BILL-013 marked complete (Invoice Delivery Service - 833 tests) | AI Agent |
| 2025-12-20 | TASK-BILL-014 marked complete (Pro-rata Calculation Service - 874 tests) | AI Agent |
| 2025-12-20 | TASK-PAY-011 marked complete (Payment Matching Service - 905 tests) | AI Agent |
| 2025-12-21 | TASK-PAY-012 marked complete (Payment Allocation Service - 945 tests) | AI Agent |
| 2025-12-21 | TASK-PAY-013 marked complete (Arrears Calculation Service - 989 tests) | AI Agent |
| 2025-12-21 | TASK-PAY-014 marked complete (Payment Reminder Service - 1027 tests) | AI Agent |

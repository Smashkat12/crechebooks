# CrecheBooks Agent Remediation Prompts

**Purpose**: Structured prompts for Claude Code agents to fix all critical issues identified in the validation analysis.
**Reference**: `/docs/VALIDATION_ANALYSIS.md`
**Task Structure**: Follow `/specs/tasks/` format
**Standards**: Adhere to `/specs/constitution.md`

---

## Usage Instructions

1. Execute prompts in priority order (P0 → P1 → P2)
2. Each prompt creates/amends tasks in `/specs/tasks/`
3. After task creation, execute the implementation
4. Validate against acceptance criteria before marking complete
5. NO mock data, NO workarounds - fail fast with robust error handling

---

## P0 BLOCKERS - Execute Immediately

### CRIT-001: Reconciled Transaction Delete Protection

```
TASK: Fix reconciled transaction delete protection violation

CONTEXT:
- File: apps/api/src/database/repositories/transaction.repository.ts:306-335
- Issue: Reconciled transactions can be deleted - COMPLIANCE VIOLATION
- Spec: SPEC-RECON REQ-RECON-010 requires delete protection

REQUIREMENTS:
1. Add isReconciled check BEFORE softDelete() method executes
2. Throw ForbiddenException with code "RECONCILED_TRANSACTION_UNDELETABLE"
3. Add audit log entry for blocked deletion attempt
4. Write unit test verifying reconciled transactions cannot be deleted
5. Write integration test for the API endpoint

IMPLEMENTATION:
- Modify softDelete() method in transaction.repository.ts
- Add guard clause: if (entity.isReconciled) throw new ForbiddenException()
- Log blocked attempt with user ID, transaction ID, timestamp

ACCEPTANCE CRITERIA:
- [ ] softDelete() throws ForbiddenException for reconciled transactions
- [ ] Error code is "RECONCILED_TRANSACTION_UNDELETABLE"
- [ ] Audit log captures blocked deletion attempts
- [ ] Unit test passes with 100% branch coverage
- [ ] Integration test verifies API returns 403

TASK FILE: /specs/tasks/reconciliation/TASK-RECON-DELETE-PROTECTION.md
```

---

### CRIT-002: Replace SARS VAT201 Mock Data

```
TASK: Replace SARS VAT201 fake mock data with real API integration

CONTEXT:
- File: apps/web/src/app/(dashboard)/sars/vat201/page.tsx:17-25
- Issue: Hardcoded MOCK data displays fake tax figures
- Spec: SPEC-WEB REQ-WEB-09 requires real SARS data preview

REQUIREMENTS:
1. Create useSarsVat201() hook in apps/web/src/hooks/useSarsVat201.ts
2. Connect to existing SARS API endpoint at /api/sars/vat201
3. Replace hardcoded data with hook response
4. Add loading, error, and empty states
5. Display real VAT calculations from backend

IMPLEMENTATION:
- Create hook using @tanstack/react-query
- Endpoint: GET /api/sars/vat201?period={period}
- Map response to VAT201FormData type
- Handle all edge cases (no transactions, pending items, etc.)

ACCEPTANCE CRITERIA:
- [ ] No hardcoded mock data in component
- [ ] useSarsVat201() hook fetches real data
- [ ] Loading spinner shown during fetch
- [ ] Error message displayed on API failure
- [ ] VAT figures match backend calculations exactly
- [ ] E2E test verifies real data flow

TASK FILE: /specs/tasks/web/TASK-WEB-SARS-VAT201-REAL-DATA.md
```

---

### CRIT-003: Bank Feed Integration

```
TASK: Implement bank feed integration via Xero API

CONTEXT:
- Issue: Bank feed auto-import missing entirely
- Spec: SPEC-TRANS REQ-TRANS-001 requires bank feed import
- Current: Only CSV/PDF upload works, no automated feed

REQUIREMENTS:
1. Implement Xero bank feed API integration
2. Create BankFeedService in apps/api/src/integrations/xero/
3. Set up OAuth2 authentication flow for bank connections
4. Create sync scheduler for automatic imports
5. Map Xero bank transactions to CrecheBooks format

IMPLEMENTATION:
- Use Xero Bank Feeds API v2
- Create BankFeedService with methods:
  - connectBankAccount(tenantId, accountId)
  - syncTransactions(tenantId, fromDate)
  - handleWebhook(payload)
- Store connection credentials securely
- Map Xero transaction types to local categories

ACCEPTANCE CRITERIA:
- [ ] BankFeedService connects to Xero bank feeds
- [ ] OAuth2 flow completes successfully
- [ ] Transactions sync automatically every 4 hours
- [ ] Webhook receives real-time transaction events
- [ ] All Xero transaction fields mapped correctly
- [ ] Integration test with Xero sandbox passes

TASK FILE: /specs/tasks/transactions/TASK-TRANS-BANK-FEED-INTEGRATION.md
```

---

### CRIT-004: Fix PAYE Tax Bracket Discrepancy

```
TASK: Sync PAYE tax bracket 1 maximum to R237,400

CONTEXT:
- File: apps/api/src/database/constants/paye.constants.ts:34-40
- Issue: Bracket 1 max is R237,100 but should be R237,400
- Spec: SPEC-SARS requires exact SARS 2024/25 tax tables

REQUIREMENTS:
1. Update paye.constants.ts bracket 1 max to R237,400
2. Verify all other brackets match sars_tables_2025.json
3. Add automated comparison test between constants and JSON
4. Recalculate any affected payroll records
5. Log discrepancy fix in audit trail

IMPLEMENTATION:
- Change: { min: 0, max: 237100 } → { min: 0, max: 237400 }
- Create test that compares constants against JSON source
- Add migration to recalculate PAYE for affected employees

ACCEPTANCE CRITERIA:
- [ ] Bracket 1 max equals R237,400
- [ ] All brackets match SARS 2024/25 tables exactly
- [ ] Automated test verifies constants vs JSON
- [ ] Affected payroll records recalculated
- [ ] Audit log records the correction

TASK FILE: /specs/tasks/sars/TASK-SARS-PAYE-BRACKET-FIX.md
```

---

### CRIT-005: SARS Deadline Reminder System

```
TASK: Implement SARS deadline reminder cron job

CONTEXT:
- Issue: No deadline reminder system exists
- Spec: SPEC-SARS REQ-SARS-011 requires deadline alerts
- Risk: Missing deadlines results in SARS penalties

REQUIREMENTS:
1. Create SarsDeadlineService with cron scheduler
2. Implement reminder logic for VAT, EMP201, IRP5 deadlines
3. Send notifications via email (and WhatsApp when available)
4. Store reminder preferences per tenant
5. Track sent reminders to avoid duplicates

IMPLEMENTATION:
- Install @nestjs/schedule if not present
- Create deadline cron job running daily at 08:00 SAST
- Calculate days until deadline (30, 14, 7, 3, 1 day warnings)
- Use NotificationService for multi-channel delivery
- Store SarsDeadlineReminder entity for audit

DEADLINE SCHEDULE:
- VAT201: 25th of following month
- EMP201: 7th of following month
- IRP5: End of May annually

ACCEPTANCE CRITERIA:
- [ ] Cron job runs daily at 08:00 SAST
- [ ] Reminders sent at 30, 14, 7, 3, 1 days before deadline
- [ ] Email notifications delivered successfully
- [ ] No duplicate reminders sent
- [ ] Tenant preferences respected
- [ ] Integration test verifies reminder logic

TASK FILE: /specs/tasks/sars/TASK-SARS-DEADLINE-REMINDERS.md
```

---

### CRIT-006: Connect Invoice Send to API

```
TASK: Connect invoice send button to actual API endpoint

CONTEXT:
- File: apps/web/src/app/(dashboard)/invoices/page.tsx:23
- Issue: handleSend is TODO stub - invoices cannot be sent
- Spec: SPEC-WEB REQ-WEB-06 requires email/WhatsApp delivery

REQUIREMENTS:
1. Create useSendInvoice() hook in apps/web/src/hooks/
2. Connect to POST /api/invoices/:id/send endpoint
3. Add delivery channel selection (email/WhatsApp)
4. Show success/error toast notifications
5. Update invoice status in UI after send

IMPLEMENTATION:
- Hook uses mutation with optimistic updates
- Request body: { channel: 'email' | 'whatsapp', recipients: string[] }
- Handle loading state on send button
- Display delivery status (SENT, FAILED, PENDING)

ACCEPTANCE CRITERIA:
- [ ] Send button triggers API call
- [ ] Email delivery works end-to-end
- [ ] Success toast shows recipient info
- [ ] Error toast displays failure reason
- [ ] Invoice status updates to SENT
- [ ] E2E test verifies send flow

TASK FILE: /specs/tasks/web/TASK-WEB-INVOICE-SEND.md
```

---

### CRIT-007: Add Balance Sheet API Endpoint

```
TASK: Implement Balance Sheet API endpoint

CONTEXT:
- File: apps/api/src/modules/reconciliation/reconciliation.controller.ts
- Issue: No Balance Sheet endpoint exists
- Spec: SPEC-RECON REQ-RECON-006 requires Balance Sheet generation

REQUIREMENTS:
1. Add @Get('balance-sheet') endpoint to ReconciliationController
2. Create BalanceSheetService with calculation logic
3. Return assets, liabilities, equity breakdown
4. Support date range parameters
5. Export to PDF/Excel formats

IMPLEMENTATION:
- Endpoint: GET /api/reconciliation/balance-sheet
- Query params: asAtDate, tenantId
- Response: { assets: [], liabilities: [], equity: [], total: Decimal }
- Use Decimal.js for all calculations
- Follow SA accounting standards (IFRS for SMEs)

BALANCE SHEET STRUCTURE:
- Assets: Current (bank, receivables), Non-current (equipment)
- Liabilities: Current (payables, VAT), Non-current (loans)
- Equity: Retained earnings, owner capital

ACCEPTANCE CRITERIA:
- [ ] GET /api/reconciliation/balance-sheet returns data
- [ ] Assets = Liabilities + Equity (accounting equation)
- [ ] All amounts use Decimal.js with banker's rounding
- [ ] PDF export generates valid document
- [ ] Excel export with correct formatting
- [ ] Unit tests for all calculations

TASK FILE: /specs/tasks/reconciliation/TASK-RECON-BALANCE-SHEET.md
```

---

### CRIT-008: Accuracy Tracking Service

```
TASK: Implement transaction categorization accuracy tracking

CONTEXT:
- Issue: No metrics collection for AI accuracy
- Spec: SPEC-TRANS REQ-TRANS-003 requires 95% accuracy after 3 months
- Current: Cannot measure or report accuracy

REQUIREMENTS:
1. Create AccuracyMetricsService in apps/api/src/modules/transactions/
2. Track: auto-categorized count, corrected count, accuracy percentage
3. Store metrics per tenant, per time period
4. Create API endpoint for accuracy reports
5. Dashboard widget for accuracy visualization

IMPLEMENTATION:
- Entity: CategorizationMetric { tenantId, period, autoCount, correctedCount, accuracy }
- Calculate: accuracy = (autoCount - correctedCount) / autoCount * 100
- Store on each categorization and correction
- Aggregate by week, month, quarter

METRICS TRACKED:
- Total transactions categorized
- Transactions corrected by user
- Accuracy percentage (rolling 30-day)
- Improvement trend over time

ACCEPTANCE CRITERIA:
- [ ] Every categorization logs a metric
- [ ] Every correction updates metrics
- [ ] GET /api/transactions/accuracy returns report
- [ ] Accuracy calculated correctly
- [ ] Dashboard shows accuracy chart
- [ ] Alert when accuracy drops below 90%

TASK FILE: /specs/tasks/transactions/TASK-TRANS-ACCURACY-TRACKING.md
```

---

## P1 CRITICAL - Fix Within 1 Sprint

### CRIT-009: Invoice Scheduling Cron Job

```
TASK: Implement automated invoice generation scheduler

CONTEXT:
- Issue: No @nestjs/schedule implementation for invoice generation
- Spec: SPEC-BILL REQ-BILL-002 requires configurable generation date
- Current: Only manual API trigger works

REQUIREMENTS:
1. Install and configure @nestjs/schedule
2. Create InvoiceSchedulerService
3. Generate invoices at tenant-configured time (default 6AM on 1st)
4. Support monthly, bi-weekly schedules
5. Handle generation failures with retry logic

IMPLEMENTATION:
- Cron expression from tenant settings
- Default: 0 6 1 * * (6AM on 1st of month)
- Process tenants in batches of 10
- Retry failed generations 3 times with exponential backoff
- Send notification on completion/failure

ACCEPTANCE CRITERIA:
- [ ] Cron job runs at configured time
- [ ] All enrolled children invoiced
- [ ] Failed invoices retried automatically
- [ ] Admin notified of generation results
- [ ] Audit log tracks each generation run

TASK FILE: /specs/tasks/billing/TASK-BILL-INVOICE-SCHEDULER.md
```

---

### CRIT-010: WhatsApp Business API Integration

```
TASK: Implement WhatsApp Business API for invoice delivery

CONTEXT:
- File: apps/api/src/integrations/whatsapp/whatsapp.service.ts:74-79
- Issue: Throws WHATSAPP_NOT_IMPLEMENTED exception
- Spec: SPEC-BILL REQ-BILL-007 requires WhatsApp delivery

REQUIREMENTS:
1. Integrate WhatsApp Business API (Meta/360dialog)
2. Implement template messages for invoices
3. Send invoice PDF as attachment
4. Track delivery status via webhooks
5. Handle opt-out/unsubscribe requests

IMPLEMENTATION:
- Use 360dialog or Meta WhatsApp Business API
- Create templates: invoice_reminder, payment_received, arrears_notice
- Handle webhook events: sent, delivered, read, failed
- Store WhatsApp number in Parent entity
- Respect POPIA consent requirements

ACCEPTANCE CRITERIA:
- [ ] WhatsApp messages send successfully
- [ ] Invoice PDF attached to message
- [ ] Delivery status tracked accurately
- [ ] Failed sends logged with reason
- [ ] Opt-out removes from list
- [ ] Integration test with WhatsApp sandbox

TASK FILE: /specs/tasks/billing/TASK-BILL-WHATSAPP-INTEGRATION.md
```

---

### CRIT-011: Payment Reminder Scheduler

```
TASK: Implement automated payment reminder cron job

CONTEXT:
- Issue: No automated payment reminders
- Spec: SPEC-PAY REQ-PAY-009 requires automated arrears follow-up
- Current: Manual reminder only

REQUIREMENTS:
1. Create PaymentReminderService with scheduler
2. Send reminders at configurable intervals (7, 14, 30 days overdue)
3. Support email and WhatsApp channels
4. Escalate after 3 reminders
5. Track reminder history per invoice

IMPLEMENTATION:
- Cron: Daily at 09:00 SAST
- Query overdue invoices by days
- Match reminder schedule to tenant settings
- Use NotificationService for delivery
- Store ReminderHistory entity

ESCALATION PATH:
- 7 days: Gentle reminder
- 14 days: Second notice
- 30 days: Final notice + escalation
- 45 days: Account flagged for review

ACCEPTANCE CRITERIA:
- [ ] Reminders sent at correct intervals
- [ ] Multiple channels supported
- [ ] No duplicate reminders sent
- [ ] Escalation triggers at 45 days
- [ ] History tracked per invoice
- [ ] Tenant settings respected

TASK FILE: /specs/tasks/payments/TASK-PAY-REMINDER-SCHEDULER.md
```

---

### CRIT-012: Invoke PaymentMatcherAgent

```
TASK: Integrate PaymentMatcherAgent into PaymentMatchingService

CONTEXT:
- File: apps/api/src/database/services/payment-matching.service.ts
- Issue: PaymentMatcherAgent exists but is NEVER called
- Spec: SPEC-PAY requires AI-powered matching

REQUIREMENTS:
1. Import PaymentMatcherAgent in PaymentMatchingService
2. Call agent.makeMatchDecision() for ambiguous matches
3. Use agent confidence score to determine auto-apply
4. Log agent decisions for audit trail
5. Fall back to rule-based matching if agent unavailable

IMPLEMENTATION:
- Add: private readonly paymentAgent: PaymentMatcherAgent
- On ambiguous match: const decision = await this.paymentAgent.makeMatchDecision(payment, candidates)
- If confidence > 85: auto-apply
- If confidence 60-85: suggest to user
- If confidence < 60: manual review

ACCEPTANCE CRITERIA:
- [ ] PaymentMatcherAgent imported and injected
- [ ] makeMatchDecision() called for ambiguous matches
- [ ] High confidence matches auto-applied
- [ ] Low confidence flagged for review
- [ ] Agent decisions logged
- [ ] Fallback works when agent fails

TASK FILE: /specs/tasks/payments/TASK-PAY-AGENT-INTEGRATION.md
```

---

### CRIT-013: Reports PDF/CSV Export

```
TASK: Implement PDF and CSV export for financial reports

CONTEXT:
- File: apps/web/src/app/(dashboard)/reports/page.tsx:23
- Issue: handleExport is TODO stub
- Spec: SPEC-WEB requires exportable reports

REQUIREMENTS:
1. Create useExportReport() hook
2. Connect to POST /api/reports/export endpoint
3. Support PDF and CSV formats
4. Generate Income Statement, Balance Sheet, VAT reports
5. Download file to user's device

IMPLEMENTATION:
- Hook: useExportReport({ reportType, format, dateRange })
- Backend: Use PDFKit for PDF, csv-stringify for CSV
- Stream large reports for memory efficiency
- Include CrecheBooks branding on PDF

EXPORT FORMATS:
- PDF: Formatted report with headers, totals
- CSV: Raw data for spreadsheet import
- Excel: Formatted with formulas (optional P2)

ACCEPTANCE CRITERIA:
- [ ] Export button triggers download
- [ ] PDF renders correctly with branding
- [ ] CSV parses correctly in Excel
- [ ] Large reports don't cause timeout
- [ ] All report types exportable
- [ ] E2E test verifies download

TASK FILE: /specs/tasks/web/TASK-WEB-REPORTS-EXPORT.md
```

---

### CRIT-014: Enable Payee Alias Matching

```
TASK: Enable payee alias infrastructure for transaction matching

CONTEXT:
- File: apps/api/src/modules/transactions/pattern-learning.service.ts:204-216
- Issue: Alias infrastructure exists but is unused
- Spec: SPEC-TRANS requires payee recognition

REQUIREMENTS:
1. Enable alias matching in PatternLearningService
2. Create PayeeAliasService for alias management
3. Automatically create aliases from corrections
4. Use aliases during categorization
5. UI for managing aliases

IMPLEMENTATION:
- PayeeAliasService.findByAlias(payeeName)
- On correction: createAlias(originalName, canonicalName)
- During categorization: resolvePayee(transactionPayee)
- Store: PayeeAlias { alias, canonicalName, tenantId }

ACCEPTANCE CRITERIA:
- [ ] Aliases created from corrections
- [ ] Categorization uses aliases
- [ ] UI shows alias management
- [ ] Duplicate aliases prevented
- [ ] Aliases improve matching accuracy
- [ ] Unit tests for alias resolution

TASK FILE: /specs/tasks/transactions/TASK-TRANS-PAYEE-ALIASES.md
```

---

### CRIT-015: Reconciliation Duplicate Detection

```
TASK: Add hash-based duplicate detection to reconciliation

CONTEXT:
- File: apps/api/src/modules/reconciliation/discrepancy.service.ts
- Issue: No duplicate detection during bank statement import
- Spec: SPEC-RECON requires duplicate flagging

REQUIREMENTS:
1. Generate hash from transaction key fields
2. Check for existing hash before creating transaction
3. Flag duplicates instead of rejecting
4. UI to review and resolve duplicates
5. Track duplicate resolution decisions

IMPLEMENTATION:
- Hash: SHA256(date + amount + reference + accountId)
- Store hash in Transaction entity
- On import: findByHash(hash) → if exists, flag as potential duplicate
- User decision: merge, keep both, reject new

ACCEPTANCE CRITERIA:
- [ ] Hash generated for every transaction
- [ ] Duplicates detected on import
- [ ] UI shows duplicate review queue
- [ ] Resolution tracked in audit log
- [ ] No data loss from auto-rejection
- [ ] Integration test for duplicate flow

TASK FILE: /specs/tasks/reconciliation/TASK-RECON-DUPLICATE-DETECTION.md
```

---

### CRIT-016: 3-Day Timing Window for Matching

```
TASK: Change exact date match to 3-day window for reconciliation

CONTEXT:
- File: apps/api/src/modules/reconciliation/discrepancy.service.ts:328-340
- Issue: Exact date match misses legitimate timing differences
- Spec: SPEC-RECON requires timing difference handling

REQUIREMENTS:
1. Change date matching from exact to +/- 3 business days
2. Handle weekends and SA public holidays
3. Mark matches with timing difference flag
4. Log timing differences for reporting
5. Configurable window per tenant

IMPLEMENTATION:
- BusinessDayService.isWithinWindow(date1, date2, days)
- Account for SA public holidays
- Default window: 3 business days
- Flag: transaction.hasTimingDifference = true

ACCEPTANCE CRITERIA:
- [ ] Matches found within 3 business days
- [ ] Weekends excluded from calculation
- [ ] SA holidays respected
- [ ] Timing differences flagged
- [ ] Window configurable per tenant
- [ ] Unit tests for date calculations

TASK FILE: /specs/tasks/reconciliation/TASK-RECON-TIMING-WINDOW.md
```

---

## P2 HIGH - Fix Before Launch

### HIGH-001: Recurring Detection Integration

```
TASK: Integrate recurring transaction detection into main flow

CONTEXT:
- Issue: Detection logic exists but not integrated
- Spec: SPEC-TRANS REQ-TRANS-006 requires recurring pattern detection

REQUIREMENTS:
1. Enable RecurringDetectionService in main categorization flow
2. Auto-detect monthly, weekly patterns
3. Pre-categorize recurring transactions
4. UI for recurring transaction management

TASK FILE: /specs/tasks/transactions/TASK-TRANS-RECURRING-INTEGRATION.md
```

---

### HIGH-002: Xero Sync REST Endpoints

```
TASK: Create REST API endpoints for Xero synchronization

CONTEXT:
- Issue: Service exists but no API endpoints
- Spec: SPEC-TRANS REQ-TRANS-008 requires bi-directional sync

REQUIREMENTS:
1. POST /api/xero/sync - trigger manual sync
2. GET /api/xero/status - check sync status
3. POST /api/xero/connect - initiate OAuth
4. WebSocket for real-time sync progress

TASK FILE: /specs/tasks/transactions/TASK-TRANS-XERO-ENDPOINTS.md
```

---

### HIGH-003: Delivery Status Webhooks

```
TASK: Implement webhook handlers for delivery status tracking

CONTEXT:
- Issue: Only SENT/FAILED tracked, missing DELIVERED/OPENED
- Spec: SPEC-BILL REQ-BILL-008 requires full delivery tracking

REQUIREMENTS:
1. Email webhook endpoint for delivery events
2. Track: sent, delivered, opened, clicked, bounced
3. Update invoice delivery status in real-time
4. Dashboard for delivery analytics

TASK FILE: /specs/tasks/billing/TASK-BILL-DELIVERY-WEBHOOKS.md
```

---

### HIGH-004: Ad-Hoc Charges in Monthly Invoice

```
TASK: Include ad-hoc charges in automated monthly invoice generation

CONTEXT:
- Issue: Ad-hoc charges not included in monthly generation
- Spec: SPEC-BILL REQ-BILL-011 requires ad-hoc inclusion

REQUIREMENTS:
1. Query pending ad-hoc charges during generation
2. Include in monthly invoice as line items
3. Mark ad-hoc charges as invoiced
4. Support partial month charges

TASK FILE: /specs/tasks/billing/TASK-BILL-ADHOC-INCLUSION.md
```

---

### HIGH-005: PDF Export for Arrears

```
TASK: Add PDF export capability for arrears reports

CONTEXT:
- Issue: Only CSV export works for arrears
- Spec: SPEC-PAY REQ-PAY-012 requires PDF/Excel export

REQUIREMENTS:
1. Add PDF generation for arrears report
2. Include aging analysis chart
3. Professional formatting with logo
4. Email attachment ready

TASK FILE: /specs/tasks/payments/TASK-PAY-PDF-EXPORT.md
```

---

### HIGH-006: Template Customization UI

```
TASK: Create UI for payment reminder template customization

CONTEXT:
- Issue: No UI exists for template management
- Spec: SPEC-PAY REQ-PAY-010 requires customizable templates

REQUIREMENTS:
1. Template editor page in dashboard
2. Variable placeholders ({parent_name}, {amount}, etc.)
3. Preview before save
4. Multiple templates per stage

TASK FILE: /specs/tasks/web/TASK-WEB-TEMPLATE-EDITOR.md
```

---

### HIGH-007: SARS eFiling Error Handling

```
TASK: Implement retry logic for SARS eFiling submissions

CONTEXT:
- Issue: No error handling for SARS API failures
- Spec: SPEC-SARS requires robust submission handling

REQUIREMENTS:
1. Retry failed submissions 3 times
2. Store submission state for resume
3. Alert admin on persistent failures
4. Log all SARS API responses

TASK FILE: /specs/tasks/sars/TASK-SARS-EFILING-RETRY.md
```

---

### HIGH-008: Audit Log Pagination

```
TASK: Add pagination to audit log API endpoint

CONTEXT:
- Issue: Audit log returns all records
- Spec: SPEC-RECON requires scalable audit access

REQUIREMENTS:
1. Add offset/limit pagination
2. Filter by date range, entity type, action
3. Search by user or entity ID
4. Export filtered results

TASK FILE: /specs/tasks/reconciliation/TASK-RECON-AUDIT-PAGINATION.md
```

---

### HIGH-009: ProRataDisplay Component

```
TASK: Create ProRataDisplay component for fee calculations

CONTEXT:
- Issue: Pro-rata calculations not shown in UI
- Spec: SPEC-WEB REQ-WEB-10 requires pro-rata display

REQUIREMENTS:
1. Create ProRataDisplay component
2. Show calculation breakdown
3. Display start date, end date, total days, charged days
4. Visual timeline representation

TASK FILE: /specs/tasks/web/TASK-WEB-PRORATA-DISPLAY.md
```

---

### HIGH-010: Mobile Responsive Expansion

```
TASK: Improve mobile responsiveness across dashboard

CONTEXT:
- Issue: Limited mobile support
- Spec: SPEC-WEB REQ-WEB-14 requires responsive design

REQUIREMENTS:
1. Test all pages on mobile viewports
2. Fix layout issues on <768px screens
3. Optimize touch targets (min 44px)
4. Add responsive navigation drawer

TASK FILE: /specs/tasks/web/TASK-WEB-MOBILE-RESPONSIVE.md
```

---

## Cross-Domain Infrastructure Tasks

### INFRA-001: Centralized Scheduling Service

```
TASK: Create centralized scheduling service with BullMQ

CONTEXT:
- Pattern: 4 domains need scheduling (TRANS, BILL, PAY, SARS)
- Issue: No scheduling infrastructure exists

REQUIREMENTS:
1. Install @nestjs/schedule and bull
2. Create SchedulerModule with BullMQ
3. Implement job types: invoice, reminder, sync, deadline
4. Dashboard for job monitoring
5. Retry and dead-letter queue handling

TASK FILE: /specs/tasks/infrastructure/TASK-INFRA-SCHEDULER.md
```

---

### INFRA-002: Notification Service Enhancement

```
TASK: Enhance NotificationService for multi-channel delivery

CONTEXT:
- Pattern: Email works, WhatsApp doesn't, SMS not implemented
- Issue: Inconsistent notification handling

REQUIREMENTS:
1. Abstract channel interface
2. Implement email, WhatsApp, SMS adapters
3. Preference management per parent
4. Delivery tracking across channels
5. Fallback chain (WhatsApp → Email → SMS)

TASK FILE: /specs/tasks/infrastructure/TASK-INFRA-NOTIFICATIONS.md
```

---

## Execution Order

Execute tasks in this order to resolve dependencies:

1. **INFRA-001** - Scheduler (enables CRIT-005, CRIT-009, CRIT-011)
2. **INFRA-002** - Notifications (enables CRIT-010)
3. **CRIT-001** - Delete protection (compliance blocker)
4. **CRIT-004** - PAYE fix (data accuracy)
5. **CRIT-002** - VAT201 real data
6. **CRIT-006** - Invoice send
7. **CRIT-007** - Balance Sheet
8. **CRIT-008** - Accuracy tracking
9. **CRIT-003** - Bank feed (largest effort)
10. **CRIT-005** - Deadline reminders (needs scheduler)
11. Continue with CRIT-009 through CRIT-016
12. Complete HIGH-001 through HIGH-010

---

## Agent Coordination Protocol

When executing these prompts:

1. **Pre-Task**: Run `npx claude-flow@alpha hooks pre-task --description "[task]"`
2. **During**: After each file, run `npx claude-flow@alpha hooks post-edit --file "[file]"`
3. **Memory**: Store decisions using `npx claude-flow@alpha hooks notify --message "[decision]"`
4. **Post-Task**: Run `npx claude-flow@alpha hooks post-task --task-id "[task]"`

---

**Document Generated**: 2025-12-23
**Reference**: VALIDATION_ANALYSIS.md
**Total Tasks**: 26 (8 P0 + 8 P1 + 10 P2)

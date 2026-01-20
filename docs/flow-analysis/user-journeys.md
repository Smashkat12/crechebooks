# User Journeys

> End-user flow mapping for CrecheBooks platform.

## Journey Overview

```mermaid
graph TB
    subgraph "Primary Personas"
        P1[👤 Creche Owner/Admin]
        P2[👩‍💼 Bookkeeper]
        P3[👨‍👩‍👧 Parent]
        P4[👨‍💻 Staff Member]
    end

    subgraph "Key Journeys"
        J1[Billing Cycle Management]
        J2[Payment Reconciliation]
        J3[Parent Portal Access]
        J4[Payroll Processing]
        J5[SARS Compliance]
    end

    P1 --> J1
    P1 --> J4
    P1 --> J5
    P2 --> J2
    P2 --> J1
    P3 --> J3
    P4 --> J4
```

---

## J1: Monthly Billing Cycle Journey

### Persona: Creche Owner/Admin

### Goal
Generate and send monthly invoices to all parents for enrolled children.

### Journey Map

```mermaid
journey
    title Monthly Invoice Generation
    section Preparation
      Review enrollments: 5: Admin
      Check fee structures: 4: Admin
      Verify parent details: 4: Admin
    section Generation
      Navigate to billing: 5: Admin
      Select billing period: 5: Admin
      Review preview: 4: Admin
      Generate invoices: 5: Admin
    section Distribution
      Review generated invoices: 4: Admin
      Send batch emails: 5: Admin
      Confirm delivery: 3: Admin
    section Follow-up
      Monitor payment status: 4: Admin
      Send reminders: 3: Admin
```

### Step-by-Step Flow

```mermaid
sequenceDiagram
    participant Admin
    participant Dashboard
    participant BillingPage
    participant InvoicePreview
    participant EmailService

    Admin->>Dashboard: Login
    Dashboard->>Admin: Show summary widgets
    Admin->>BillingPage: Navigate to Billing
    BillingPage->>Admin: Show billing overview
    Admin->>BillingPage: Click "Generate Invoices"
    BillingPage->>Admin: Show period selection
    Admin->>BillingPage: Select month
    BillingPage->>InvoicePreview: Generate preview
    InvoicePreview->>Admin: Show invoice summary
    Admin->>InvoicePreview: Confirm generation
    InvoicePreview->>Admin: Show success (X invoices)
    Admin->>BillingPage: Click "Send All"
    BillingPage->>EmailService: Queue emails
    EmailService->>Admin: Confirm sent
```

### Touchpoints

| Step | Screen | Action | Pain Points | Optimization |
|------|--------|--------|-------------|--------------|
| 1 | Login | Authenticate | Session timeout | Remember me |
| 2 | Dashboard | View summary | Data freshness | Real-time updates |
| 3 | Billing | Navigate | Deep navigation | Quick actions |
| 4 | Generate | Select period | Manual selection | Auto-suggest |
| 5 | Preview | Review | Large list | Pagination |
| 6 | Send | Batch email | No progress | Progress bar |

### Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Time to generate | <30s | 45s |
| Clicks to complete | <10 | 12 |
| Error rate | <1% | 0.5% |
| User satisfaction | >4.5/5 | 4.2/5 |

---

## J2: Payment Reconciliation Journey

### Persona: Bookkeeper

### Goal
Match bank transactions to outstanding invoices efficiently.

### Journey Map

```mermaid
journey
    title Payment Reconciliation
    section Import
      Download bank statement: 3: Bookkeeper
      Upload to system: 4: Bookkeeper
      Review import results: 4: Bookkeeper
    section Matching
      Review auto-matches: 5: Bookkeeper
      Verify high-confidence: 5: Bookkeeper
      Handle review queue: 3: Bookkeeper
    section Completion
      Confirm allocations: 5: Bookkeeper
      Generate report: 4: Bookkeeper
      Archive statement: 4: Bookkeeper
```

### Step-by-Step Flow

```mermaid
sequenceDiagram
    participant Bookkeeper
    participant ReconcilePage
    participant ImportWizard
    participant MatchingEngine
    participant ReviewQueue
    participant ReportGen

    Bookkeeper->>ReconcilePage: Navigate to Reconciliation
    ReconcilePage->>Bookkeeper: Show reconciliation status
    Bookkeeper->>ImportWizard: Click "Import Statement"
    ImportWizard->>Bookkeeper: Show file upload
    Bookkeeper->>ImportWizard: Upload CSV/OFX
    ImportWizard->>MatchingEngine: Process transactions
    MatchingEngine->>Bookkeeper: Show matching results

    alt High Confidence (>80%)
        MatchingEngine->>ReconcilePage: Auto-apply matches
    else Low Confidence (<80%)
        MatchingEngine->>ReviewQueue: Add to review
    end

    Bookkeeper->>ReviewQueue: Review suggestions
    Bookkeeper->>ReviewQueue: Approve/Reject/Manual
    ReviewQueue->>ReconcilePage: Update status
    Bookkeeper->>ReportGen: Generate report
    ReportGen->>Bookkeeper: Download reconciliation report
```

### Matching Decision Flow

```mermaid
graph TB
    A[Bank Transaction] --> B{Reference Match?}
    B -->|Yes| C[100% Confidence]
    B -->|No| D{Parent Name Match?}
    D -->|Yes| E[80-95% Confidence]
    D -->|No| F{Amount Match?}
    F -->|Yes| G[60-80% Confidence]
    F -->|No| H{Fuzzy Match?}
    H -->|Yes| I[40-60% Confidence]
    H -->|No| J[Manual Review Required]

    C --> K[Auto-Apply]
    E --> L{>80%?}
    L -->|Yes| K
    L -->|No| M[Review Queue]
    G --> M
    I --> M
    J --> M
```

### Pain Points & Solutions

| Pain Point | Impact | Solution |
|------------|--------|----------|
| Manual statement download | HIGH | Bank API integration |
| Slow large file processing | MEDIUM | Stream processing |
| Low match confidence | MEDIUM | ML-enhanced matching |
| Multiple partial payments | HIGH | Split allocation UI |

---

## J3: Parent Portal Journey

### Persona: Parent

### Goal
View and pay outstanding invoices, manage child information.

### Journey Map

```mermaid
journey
    title Parent Invoice Payment
    section Access
      Receive invoice email: 5: Parent
      Click payment link: 5: Parent
      Authenticate: 3: Parent
    section Review
      View invoice details: 5: Parent
      Check child enrollments: 4: Parent
      Review payment history: 4: Parent
    section Payment
      Select payment method: 4: Parent
      Complete payment: 3: Parent
      Download receipt: 5: Parent
```

### Portal Navigation

```mermaid
graph TB
    subgraph "Parent Portal"
        A[Login] --> B[Dashboard]
        B --> C[My Children]
        B --> D[Invoices]
        B --> E[Payments]
        B --> F[Profile]

        C --> C1[View Details]
        C --> C2[Enrollment History]

        D --> D1[Current Invoice]
        D --> D2[Invoice History]
        D --> D3[Download PDF]

        E --> E1[Payment History]
        E --> E2[Download Receipts]

        F --> F1[Update Contact]
        F --> F2[Payment Methods]
    end
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant Parent
    participant Email
    participant Portal
    participant Auth

    Email->>Parent: Invoice notification
    Parent->>Portal: Click "View Invoice"
    Portal->>Auth: Check authentication

    alt Already logged in
        Auth->>Portal: Valid session
        Portal->>Parent: Show invoice
    else Not logged in
        Auth->>Parent: Show login
        Parent->>Auth: Enter credentials
        Auth->>Portal: Create session
        Portal->>Parent: Redirect to invoice
    end
```

### Mobile Responsiveness

| Screen | Desktop | Tablet | Mobile |
|--------|---------|--------|--------|
| Dashboard | Full layout | Condensed | Cards |
| Invoice List | Table | Table | Cards |
| Invoice Detail | Side-by-side | Stacked | Scrollable |
| Payment | Full form | Full form | Simplified |

---

## J4: Payroll Processing Journey

### Persona: Creche Owner/Admin

### Goal
Process monthly staff payroll accurately and on time.

### Journey Map

```mermaid
journey
    title Monthly Payroll Processing
    section Preparation
      Review staff roster: 5: Admin
      Check leave records: 4: Admin
      Verify hours/attendance: 3: Admin
    section Processing
      Navigate to payroll: 5: Admin
      Review calculations: 4: Admin
      Verify deductions: 4: Admin
      Submit to SimplePay: 4: Admin
    section Compliance
      Review EMP201 data: 4: Admin
      Submit to SARS: 3: Admin
      Generate payslips: 5: Admin
```

### Step-by-Step Flow

```mermaid
sequenceDiagram
    participant Admin
    participant StaffPage
    participant PayrollPage
    participant SimplePay
    participant SarsService

    Admin->>StaffPage: Review staff details
    StaffPage->>Admin: Show active staff
    Admin->>PayrollPage: Navigate to Payroll
    PayrollPage->>Admin: Show payroll period
    Admin->>PayrollPage: Click "Process Payroll"
    PayrollPage->>SimplePay: Sync payroll data
    SimplePay->>PayrollPage: Return calculations
    PayrollPage->>Admin: Show breakdown

    Admin->>PayrollPage: Verify amounts
    Admin->>PayrollPage: Approve payroll
    PayrollPage->>SimplePay: Submit final
    SimplePay->>PayrollPage: Confirm processed

    Admin->>PayrollPage: View EMP201 data
    PayrollPage->>SarsService: Prepare submission
    SarsService->>Admin: Show SARS report
```

### Calculation Breakdown

```mermaid
graph LR
    subgraph "Gross Pay"
        A[Basic Salary]
        B[Overtime]
        C[Allowances]
    end

    subgraph "Deductions"
        D[PAYE]
        E[UIF Employee]
        F[Pension]
        G[Medical Aid]
    end

    subgraph "Employer Costs"
        H[UIF Employer]
        I[SDL]
    end

    A --> J[Gross Total]
    B --> J
    C --> J

    J --> K[Taxable Income]
    K --> D
    K --> E
    K --> F
    K --> G

    D --> L[Net Pay]
    E --> L
    F --> L
    G --> L

    J --> H
    J --> I
    H --> M[Total Cost]
    I --> M
```

---

## J5: SARS Compliance Journey

### Persona: Creche Owner/Admin

### Goal
Submit accurate monthly tax returns (EMP201, VAT201).

### Journey Map

```mermaid
journey
    title SARS Monthly Submission
    section Preparation
      Review payroll data: 4: Admin
      Verify VAT calculations: 4: Admin
      Check previous submissions: 4: Admin
    section EMP201
      Navigate to SARS section: 5: Admin
      Review EMP201 preview: 4: Admin
      Submit EMP201: 3: Admin
    section VAT201
      Review VAT summary: 4: Admin
      Verify input/output VAT: 4: Admin
      Submit VAT201: 3: Admin
    section Confirmation
      Download receipts: 5: Admin
      Archive submissions: 4: Admin
```

### Submission Timeline

```mermaid
gantt
    title Monthly SARS Compliance Timeline
    dateFormat  DD
    axisFormat  %d

    section Payroll
    Process payroll        :done, 25, 3d
    Generate payslips      :done, 28, 1d

    section EMP201
    Prepare EMP201         :active, 01, 2d
    Review & verify        :03, 2d
    Submit to SARS         :crit, 05, 2d

    section VAT201
    Calculate VAT          :08, 3d
    Prepare VAT201         :11, 2d
    Submit to SARS         :crit, 13, 2d

    section Deadline
    EMP201 Due             :milestone, 07, 0d
    VAT201 Due             :milestone, 15, 0d
```

### Validation Checklist

```mermaid
graph TB
    subgraph "EMP201 Validation"
        E1[Total employees matches staff count]
        E2[PAYE totals reconcile to payroll]
        E3[UIF totals reconcile to payroll]
        E4[SDL calculated correctly]
    end

    subgraph "VAT201 Validation"
        V1[Output VAT from invoices]
        V2[Input VAT from expenses]
        V3[Net VAT calculation]
        V4[Previous period carried forward]
    end

    E1 --> P[Pre-submission Check]
    E2 --> P
    E3 --> P
    E4 --> P
    V1 --> P
    V2 --> P
    V3 --> P
    V4 --> P

    P --> S{All Valid?}
    S -->|Yes| A[Allow Submission]
    S -->|No| R[Show Errors]
```

---

## User Satisfaction Metrics

### Net Promoter Score by Journey

| Journey | NPS Score | Trend |
|---------|-----------|-------|
| Billing Cycle | 42 | ↑ |
| Reconciliation | 35 | → |
| Parent Portal | 48 | ↑ |
| Payroll | 38 | ↑ |
| SARS Compliance | 32 | → |

### Task Completion Rate

```mermaid
xychart-beta
    title "Task Completion Rate by Journey"
    x-axis [Billing, Reconcile, Portal, Payroll, SARS]
    y-axis "Completion %" 0 --> 100
    bar [92, 85, 95, 88, 82]
```

### Time on Task

| Journey | Target | Actual | Status |
|---------|--------|--------|--------|
| Generate invoices | 2 min | 3 min | ⚠️ |
| Reconcile statement | 10 min | 15 min | ⚠️ |
| Pay invoice (parent) | 2 min | 1.5 min | ✅ |
| Process payroll | 5 min | 8 min | ⚠️ |
| Submit SARS | 5 min | 4 min | ✅ |

---

## Improvement Roadmap

### Short-term (P1)
1. Add quick actions to dashboard
2. Implement progress indicators
3. Reduce clicks in billing flow
4. Add inline help tooltips

### Medium-term (P2)
1. Parent mobile app
2. Automated bank statement import
3. Smart reconciliation suggestions
4. Bulk action improvements

### Long-term (P3)
1. AI-powered forecasting
2. Conversational interface
3. Proactive notifications
4. Self-service customization

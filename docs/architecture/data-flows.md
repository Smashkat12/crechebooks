# Data Flows

> Key business process flows and data transformations.

## Invoice Generation Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant BillingService
    participant EnrollmentRepo
    participant FeeService
    participant InvoiceRepo
    participant XeroService
    participant NotificationService

    Note over Scheduler,NotificationService: Monthly Invoice Generation

    Scheduler->>BillingService: Trigger invoice generation
    BillingService->>EnrollmentRepo: Get active enrollments
    EnrollmentRepo-->>BillingService: Enrolled children

    loop For each parent
        BillingService->>FeeService: Calculate fees
        FeeService->>FeeService: Apply fee structure
        FeeService->>FeeService: Add adjustments
        FeeService->>FeeService: Calculate VAT
        FeeService-->>BillingService: Fee breakdown

        BillingService->>InvoiceRepo: Create invoice
        InvoiceRepo-->>BillingService: Invoice created

        BillingService->>XeroService: Sync to Xero
        XeroService-->>BillingService: Xero invoice ID

        BillingService->>NotificationService: Send invoice email
    end

    BillingService-->>Scheduler: Generation complete
```

## Payment Processing Flow

```mermaid
sequenceDiagram
    participant User
    participant PaymentController
    participant PaymentService
    participant InvoiceService
    participant TransactionService
    participant XeroService
    participant AuditService

    User->>PaymentController: Record payment
    PaymentController->>PaymentService: Process payment

    PaymentService->>PaymentService: Validate amount
    PaymentService->>TransactionService: Create transaction
    TransactionService-->>PaymentService: Transaction ID

    PaymentService->>InvoiceService: Apply to invoice
    InvoiceService->>InvoiceService: Update balance
    InvoiceService->>InvoiceService: Update status
    InvoiceService-->>PaymentService: Invoice updated

    PaymentService->>XeroService: Sync payment
    XeroService-->>PaymentService: Synced

    PaymentService->>AuditService: Log payment
    AuditService-->>PaymentService: Logged

    PaymentService-->>PaymentController: Payment recorded
    PaymentController-->>User: Success response
```

## Reconciliation Flow

```mermaid
graph TB
    subgraph "Import Phase"
        UPLOAD[Upload Statement]
        PARSE[Parse Transactions]
        NORMALIZE[Normalize Data]
        DEDUP[Remove Duplicates]
    end

    subgraph "Matching Phase"
        RULES[Apply Match Rules]
        REF_MATCH[Reference Match]
        AMT_MATCH[Amount Match]
        ML_MATCH[ML Suggestions]
    end

    subgraph "Review Phase"
        AUTO[Auto-Matched]
        SUGGESTED[Suggested Matches]
        UNMATCHED[Unmatched]
        MANUAL[Manual Review]
    end

    subgraph "Completion Phase"
        CONFIRM[Confirm Matches]
        UPDATE[Update Records]
        REPORT[Generate Report]
    end

    UPLOAD --> PARSE
    PARSE --> NORMALIZE
    NORMALIZE --> DEDUP
    DEDUP --> RULES

    RULES --> REF_MATCH
    REF_MATCH --> AMT_MATCH
    AMT_MATCH --> ML_MATCH

    ML_MATCH --> AUTO
    ML_MATCH --> SUGGESTED
    ML_MATCH --> UNMATCHED

    SUGGESTED --> MANUAL
    UNMATCHED --> MANUAL

    AUTO --> CONFIRM
    MANUAL --> CONFIRM

    CONFIRM --> UPDATE
    UPDATE --> REPORT
```

### Matching Rules Detail

```mermaid
flowchart TD
    TXN[Bank Transaction]

    TXN --> CHECK_REF{Has Reference?}

    CHECK_REF -->|Yes| FIND_REF[Find by Reference]
    FIND_REF --> FOUND_REF{Found?}
    FOUND_REF -->|Yes| HIGH[High Confidence 95%]
    FOUND_REF -->|No| CHECK_AMT

    CHECK_REF -->|No| CHECK_AMT{Match Amount?}

    CHECK_AMT --> FIND_AMT[Find Payments by Amount]
    FIND_AMT --> FOUND_AMT{Found?}

    FOUND_AMT -->|Single Match| CHECK_DATE{Within 7 Days?}
    CHECK_DATE -->|Yes| MED[Medium Confidence 75%]
    CHECK_DATE -->|No| LOW[Low Confidence 40%]

    FOUND_AMT -->|Multiple| MULTI[Multiple Suggestions]
    FOUND_AMT -->|None| NONE[No Match]

    HIGH --> AUTO_MATCH[Auto Match]
    MED --> SUGGEST[Suggest Match]
    LOW --> SUGGEST
    MULTI --> SUGGEST
    NONE --> MANUAL[Manual Review]
```

## Payroll Processing Flow

```mermaid
sequenceDiagram
    participant Admin
    participant PayrollService
    participant SimplePayService
    participant StaffRepo
    participant PayrollRepo
    participant SarsService
    participant NotificationService

    Admin->>PayrollService: Initiate payroll run
    PayrollService->>SimplePayService: Get payroll data
    SimplePayService-->>PayrollService: Payroll details

    loop For each staff member
        PayrollService->>PayrollService: Calculate gross
        PayrollService->>PayrollService: Calculate PAYE
        PayrollService->>PayrollService: Calculate UIF
        PayrollService->>PayrollService: Apply deductions
        PayrollService->>PayrollService: Calculate net pay
    end

    PayrollService->>PayrollRepo: Save payroll run
    PayrollRepo-->>PayrollService: Saved

    PayrollService->>SarsService: Prepare EMP201 data
    SarsService-->>PayrollService: EMP201 ready

    PayrollService->>NotificationService: Send payslips
    NotificationService-->>PayrollService: Sent

    PayrollService-->>Admin: Payroll complete
```

## Child Enrollment Flow

```mermaid
stateDiagram-v2
    [*] --> Inquiry

    Inquiry --> Application: Submit application
    Application --> Review: Documents received

    Review --> Waitlist: Capacity full
    Review --> Approved: Approved
    Review --> Rejected: Not suitable

    Waitlist --> Approved: Space available

    Approved --> Active: Start date reached

    Active --> OnHold: Temporary leave
    OnHold --> Active: Return

    Active --> Graduating: Year end
    Graduating --> Graduated: Complete

    Active --> Withdrawn: Parent request

    Graduated --> [*]
    Withdrawn --> [*]
    Rejected --> [*]
```

## SARS Submission Flow

```mermaid
graph TB
    subgraph "Data Collection"
        PAYROLL[Payroll Data]
        VAT[VAT Transactions]
        IRP5[Employee Tax Certs]
    end

    subgraph "EMP201 Generation"
        AGG_PAYE[Aggregate PAYE]
        AGG_UIF[Aggregate UIF]
        AGG_SDL[Aggregate SDL]
        EMP201[Generate EMP201]
    end

    subgraph "VAT201 Generation"
        OUTPUT[Output VAT]
        INPUT[Input VAT]
        VAT201[Generate VAT201]
    end

    subgraph "Submission"
        VALIDATE[Validate]
        SUBMIT[Submit to SARS]
        CONFIRM[Confirmation]
    end

    PAYROLL --> AGG_PAYE
    PAYROLL --> AGG_UIF
    PAYROLL --> AGG_SDL
    AGG_PAYE --> EMP201
    AGG_UIF --> EMP201
    AGG_SDL --> EMP201

    VAT --> OUTPUT
    VAT --> INPUT
    OUTPUT --> VAT201
    INPUT --> VAT201

    EMP201 --> VALIDATE
    VAT201 --> VALIDATE

    VALIDATE --> SUBMIT
    SUBMIT --> CONFIRM
```

## Transaction Split Flow

```mermaid
sequenceDiagram
    participant User
    participant TxnController
    participant TxnService
    participant SplitService
    participant CategoryService
    participant AuditService

    User->>TxnController: Split transaction
    TxnController->>TxnService: Get transaction
    TxnService-->>TxnController: Original transaction

    TxnController->>SplitService: Create splits

    loop For each split
        SplitService->>SplitService: Validate amount
        SplitService->>CategoryService: Assign category
        SplitService->>SplitService: Create split record
    end

    SplitService->>SplitService: Verify total = original
    SplitService->>TxnService: Mark original as split
    SplitService->>AuditService: Log split action

    SplitService-->>TxnController: Splits created
    TxnController-->>User: Success
```

## Data Transformation Summary

| Source | Transformation | Destination |
|--------|----------------|-------------|
| Enrollment + Fee Structure | Calculate monthly fees | Invoice Lines |
| Bank Transaction | Match by reference/amount | Payment Record |
| Payroll Data | Tax calculations | Payslips + EMP201 |
| Invoices + Payments | Aggregate totals | VAT201 |
| All mutations | Extract changes | Audit Log |
| SimplePay webhook | Transform employee data | Staff Records |
| Xero sync | Map invoice format | Xero Invoice |

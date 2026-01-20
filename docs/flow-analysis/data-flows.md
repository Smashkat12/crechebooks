# Data Flows

> Data transformation pipelines and state transitions in CrecheBooks.

## Data Flow Architecture

```mermaid
graph TB
    subgraph "Data Sources"
        S1[User Input]
        S2[Bank Statements]
        S3[SimplePay API]
        S4[Xero API]
    end

    subgraph "Ingestion Layer"
        I1[Form Validation]
        I2[File Parser]
        I3[API Client]
        I4[Webhook Handler]
    end

    subgraph "Processing Layer"
        P1[Business Logic]
        P2[Calculations]
        P3[Matching Engine]
        P4[Sync Services]
    end

    subgraph "Storage Layer"
        D1[(PostgreSQL)]
        D2[(Redis Cache)]
    end

    subgraph "Output Layer"
        O1[JSON API]
        O2[PDF Reports]
        O3[Email]
        O4[External APIs]
    end

    S1 --> I1
    S2 --> I2
    S3 --> I3
    S4 --> I4

    I1 --> P1
    I2 --> P3
    I3 --> P2
    I4 --> P4

    P1 --> D1
    P2 --> D1
    P3 --> D1
    P4 --> D1
    D1 --> D2

    D1 --> O1
    D1 --> O2
    D1 --> O3
    D1 --> O4
```

---

## DF001: Invoice Data Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Transactional |
| **Source** | Enrollment + Fee Structure |
| **Destination** | Invoice + Xero |
| **Throughput** | 500/day |
| **Latency** | 1.8s |

### Data Transformation Pipeline

```mermaid
graph LR
    subgraph "Input"
        A[Active Enrollments]
        B[Fee Structures]
        C[Ad-hoc Charges]
    end

    subgraph "Transform"
        D[Fee Calculator]
        E[Line Item Generator]
        F[Tax Calculator]
    end

    subgraph "Enrich"
        G[Parent Details]
        H[Child Details]
        I[Tenant Settings]
    end

    subgraph "Output"
        J[Invoice Record]
        K[Line Items]
        L[Xero Invoice]
    end

    A --> D
    B --> D
    C --> E
    D --> E
    E --> F
    F --> J

    G --> J
    H --> J
    I --> J

    J --> K
    J --> L
```

### Data Schema Transformation

```
Input (Enrollment):
{
  id: string
  childId: string
  scheduleType: "FULL_TIME" | "PART_TIME" | "FLEXI"
  startDate: Date
  endDate?: Date
  feeStructureId: string
}

Transform (Fee Calculation):
{
  baseFee: number
  registrationFee: number
  additionalCharges: AdditionalCharge[]
  discounts: Discount[]
  vatAmount: number
  totalAmount: number
}

Output (Invoice):
{
  id: string
  invoiceNumber: string
  parentId: string
  childId: string
  tenantId: string
  issueDate: Date
  dueDate: Date
  subtotal: number
  vatAmount: number
  totalAmount: number
  outstandingAmount: number
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE"
  xeroId?: string
  lineItems: InvoiceLineItem[]
}
```

### State Machine

```mermaid
stateDiagram-v2
    [*] --> DRAFT: Create
    DRAFT --> SENT: Send
    DRAFT --> CANCELLED: Cancel
    SENT --> PARTIALLY_PAID: Partial Payment
    SENT --> PAID: Full Payment
    SENT --> OVERDUE: Past Due Date
    PARTIALLY_PAID --> PAID: Remaining Payment
    PARTIALLY_PAID --> OVERDUE: Past Due Date
    OVERDUE --> PAID: Payment Received
    PAID --> [*]
    CANCELLED --> [*]
```

---

## DF002: Payment Data Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Transactional |
| **Source** | Bank Transaction |
| **Destination** | Payment + Invoice Update |
| **Throughput** | 200/day |
| **Latency** | 450ms |

### Data Transformation Pipeline

```mermaid
graph TB
    subgraph "Bank Data"
        A[Bank Transaction]
        B[Reference/Description]
        C[Amount/Date]
    end

    subgraph "Matching"
        D[Reference Parser]
        E[Amount Matcher]
        F[Fuzzy Matcher]
        G[Confidence Scorer]
    end

    subgraph "Allocation"
        H[Invoice Lookup]
        I[Amount Validation]
        J[Balance Update]
    end

    subgraph "Output"
        K[Payment Record]
        L[Invoice Update]
        M[Audit Trail]
    end

    A --> D
    B --> D
    C --> E

    D --> G
    E --> G
    F --> G

    G --> H
    H --> I
    I --> J

    J --> K
    J --> L
    K --> M
    L --> M
```

### Allocation Logic

```mermaid
flowchart TB
    A[Receive Bank Transaction] --> B{Is Credit?}
    B -->|No| C[Skip - Not Payment]
    B -->|Yes| D[Parse Reference]

    D --> E{Invoice Number Found?}
    E -->|Yes| F[Direct Match]
    E -->|No| G[Run Matching Engine]

    G --> H{Match Confidence}
    H -->|>80%| I[Auto-Apply]
    H -->|50-80%| J[Suggest with Review]
    H -->|<50%| K[Manual Review Queue]

    F --> L{Amount Check}
    I --> L
    J --> M[User Confirms]
    M --> L

    L -->|Exact| N[Single Invoice]
    L -->|Partial| O[Partial Payment]
    L -->|Excess| P[Overpayment Handler]

    N --> Q[Create Payment Record]
    O --> Q
    P --> Q

    Q --> R[Update Invoice Balance]
    R --> S[Audit Log Entry]
```

### Split Payment Handling

```mermaid
graph TB
    A[Transaction: R1500] --> B[Allocation Request]

    B --> C[Invoice 1: R800 Outstanding]
    B --> D[Invoice 2: R700 Outstanding]

    C --> E[Payment 1: R800]
    D --> F[Payment 2: R700]

    E --> G[Invoice 1: PAID]
    F --> H[Invoice 2: PAID]

    subgraph "Database Records"
        I[Payment 1<br/>invoiceId: INV001<br/>amount: 800]
        J[Payment 2<br/>invoiceId: INV002<br/>amount: 700]
        K[Transaction<br/>allocatedAmount: 1500<br/>status: ALLOCATED]
    end

    E --> I
    F --> J
    G --> K
    H --> K
```

---

## DF003: Bank Statement Import Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Batch |
| **Source** | CSV/OFX File |
| **Destination** | Bank Transactions |
| **Throughput** | 1000 txns/import |
| **Latency** | 3s |

### Transformation Pipeline

```mermaid
graph LR
    subgraph "Input"
        A[Upload File]
        B[Detect Format]
    end

    subgraph "Parse"
        C[CSV Parser]
        D[OFX Parser]
        E[Normalize]
    end

    subgraph "Process"
        F[Deduplicate]
        G[Categorize]
        H[Validate]
    end

    subgraph "Store"
        I[Bank Transactions]
        J[Import Log]
    end

    A --> B
    B -->|CSV| C
    B -->|OFX| D
    C --> E
    D --> E
    E --> F
    F --> G
    G --> H
    H --> I
    H --> J
```

### Format Normalization

```
CSV Input (Standard Bank):
Date,Description,Amount,Balance
2026-01-15,"PAYMENT RECEIVED REF: INV-001",1500.00,25000.00

OFX Input:
<STMTTRN>
  <TRNTYPE>CREDIT
  <DTPOSTED>20260115
  <TRNAMT>1500.00
  <FITID>TXN123456
  <MEMO>PAYMENT RECEIVED REF: INV-001
</STMTTRN>

Normalized Output:
{
  externalId: "TXN123456" | hash(date+amount+desc)
  transactionDate: Date("2026-01-15")
  description: "PAYMENT RECEIVED REF: INV-001"
  amount: 1500.00
  type: "CREDIT"
  category: "PAYMENT"
  reference: "INV-001"
  status: "UNALLOCATED"
  bankAccountId: string
  tenantId: string
}
```

### Deduplication Strategy

```mermaid
flowchart TB
    A[Incoming Transaction] --> B{Has External ID?}
    B -->|Yes| C[Check by External ID]
    B -->|No| D[Generate Hash]

    D --> E[Check by Hash]
    C --> F{Exists?}
    E --> F

    F -->|Yes| G[Mark as Duplicate]
    F -->|No| H[Insert New Record]

    G --> I[Skip & Log]
    H --> J[Continue Processing]

    subgraph "Hash Components"
        K[Date + Amount + Description + Account]
    end

    D -.-> K
```

---

## DF004: Payroll Data Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Batch |
| **Source** | Staff + SimplePay |
| **Destination** | Payroll Items + SARS |
| **Throughput** | 50 staff/run |
| **Latency** | 8.5s |

### Transformation Pipeline

```mermaid
graph TB
    subgraph "Input Sources"
        A[Staff Records]
        B[SimplePay Data]
        C[Leave Records]
        D[Tax Tables]
    end

    subgraph "Calculation Engine"
        E[Gross Pay Calculator]
        F[PAYE Calculator]
        G[UIF Calculator]
        H[Deduction Processor]
    end

    subgraph "Output"
        I[Payroll Items]
        J[EMP201 Data]
        K[Payslips]
    end

    A --> E
    B --> E
    C --> E

    E --> F
    F --> G
    G --> H
    D --> F

    H --> I
    I --> J
    I --> K
```

### Tax Calculation Flow

```mermaid
graph LR
    subgraph "Gross Income"
        A[Basic Salary]
        B[Overtime]
        C[Commission]
        D[Allowances]
    end

    subgraph "Taxable Income"
        E[Sum Gross]
        F[Apply Exemptions]
        G[Annual Equivalent]
    end

    subgraph "PAYE Calculation"
        H[Tax Bracket Lookup]
        I[Calculate Annual Tax]
        J[Monthly PAYE]
    end

    A --> E
    B --> E
    C --> E
    D --> E

    E --> F
    F --> G

    G --> H
    H --> I
    I --> J
```

### SARS Data Aggregation

```mermaid
graph TB
    subgraph "Monthly Payroll"
        P1[Payroll Item 1]
        P2[Payroll Item 2]
        P3[Payroll Item N]
    end

    subgraph "EMP201 Fields"
        E1[Total PAYE]
        E2[Total UIF Employee]
        E3[Total UIF Employer]
        E4[Total SDL]
        E5[Employee Count]
    end

    subgraph "Submission"
        S[EMP201 Record]
    end

    P1 --> E1
    P2 --> E1
    P3 --> E1

    P1 --> E2
    P2 --> E2
    P3 --> E2

    P1 --> E3
    P2 --> E3
    P3 --> E3

    P1 --> E4
    P2 --> E4
    P3 --> E4

    P1 --> E5
    P2 --> E5
    P3 --> E5

    E1 --> S
    E2 --> S
    E3 --> S
    E4 --> S
    E5 --> S
```

---

## DF005: Xero Sync Data Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Event-Driven |
| **Source** | CrecheBooks Invoice |
| **Destination** | Xero Invoice |
| **Throughput** | 500/day |
| **Latency** | 500ms |

### Bidirectional Sync

```mermaid
graph TB
    subgraph "CrecheBooks"
        C1[Invoice Created]
        C2[Payment Recorded]
        C3[Invoice Updated]
    end

    subgraph "Sync Layer"
        S1[Outbound Queue]
        S2[Transformer]
        S3[Inbound Handler]
    end

    subgraph "Xero"
        X1[Xero Invoice]
        X2[Xero Payment]
        X3[Xero Contact]
    end

    C1 --> S1
    C2 --> S1
    C3 --> S1

    S1 --> S2
    S2 --> X1
    S2 --> X2

    X1 -.-> S3
    X2 -.-> S3
    X3 -.-> S3

    S3 -.-> C1
    S3 -.-> C2
```

### Field Mapping

```
CrecheBooks Invoice → Xero Invoice:

{                                    {
  invoiceNumber → InvoiceNumber
  parentId → Contact.ContactID (via lookup)
  issueDate → Date
  dueDate → DueDate
  lineItems[] → LineItems[]
    - description → Description
    - amount → UnitAmount
    - quantity → Quantity
    - vatAmount → TaxAmount
  totalAmount → Total
  status → Status (mapped)
}
```

### Conflict Resolution

```mermaid
flowchart TB
    A[Sync Triggered] --> B{Check Xero Version}
    B --> C{Local Changed?}
    C -->|Yes| D{Xero Changed?}
    C -->|No| E[Pull Xero Changes]

    D -->|No| F[Push Local Changes]
    D -->|Yes| G{Conflict Resolution}

    G -->|Local Wins| F
    G -->|Xero Wins| E
    G -->|Merge| H[Merge Changes]

    F --> I[Update Xero ID]
    E --> J[Update Local Record]
    H --> I
    H --> J
```

---

## DF006: Audit Trail Data Flow

### Overview
| Attribute | Value |
|-----------|-------|
| **Type** | Event-Driven |
| **Source** | All Mutations |
| **Destination** | Audit Log |
| **Throughput** | 10K/day |
| **Latency** | 50ms |

### Event Capture

```mermaid
graph LR
    subgraph "Source Operations"
        A[Create]
        B[Update]
        C[Delete]
        D[Login/Logout]
    end

    subgraph "Interceptor"
        E[Audit Interceptor]
    end

    subgraph "Processing"
        F[Extract Context]
        G[Diff Changes]
        H[Format Entry]
    end

    subgraph "Storage"
        I[(Audit Log Table)]
    end

    A --> E
    B --> E
    C --> E
    D --> E

    E --> F
    F --> G
    G --> H
    H --> I
```

### Audit Entry Schema

```typescript
interface AuditLogEntry {
  id: string;
  timestamp: Date;
  tenantId: string;
  userId: string;
  userEmail: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'LOGIN' | 'LOGOUT';
  entityType: string;
  entityId: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  changes?: {
    field: string;
    from: unknown;
    to: unknown;
  }[];
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}
```

### Retention Policy

```mermaid
graph TB
    A[New Audit Entry] --> B[(Hot Storage<br/>0-90 days)]
    B --> C{Age > 90 days?}
    C -->|No| B
    C -->|Yes| D[(Warm Storage<br/>90-365 days)]
    D --> E{Age > 365 days?}
    E -->|No| D
    E -->|Yes| F[(Cold Storage<br/>Archive)]

    subgraph "Query Access"
        G[Dashboard] --> B
        H[Reports] --> B
        H --> D
        I[Compliance] --> B
        I --> D
        I --> F
    end
```

---

## Data Integrity Rules

### Referential Integrity

```mermaid
graph TB
    subgraph "Core Entities"
        T[Tenant]
        P[Parent]
        C[Child]
        E[Enrollment]
        I[Invoice]
        PA[Payment]
    end

    T -->|1:N| P
    T -->|1:N| C
    P -->|1:N| C
    C -->|1:N| E
    E -->|1:N| I
    I -->|1:N| PA

    subgraph "Cascade Rules"
        R1[Tenant DELETE → Soft delete all]
        R2[Parent DELETE → Orphan children warning]
        R3[Invoice DELETE → Void only if unpaid]
    end
```

### Validation Rules

| Entity | Field | Rule | Error |
|--------|-------|------|-------|
| Invoice | amount | > 0 | "Amount must be positive" |
| Payment | amount | <= invoice.outstanding | "Exceeds balance" |
| Enrollment | endDate | >= startDate | "Invalid date range" |
| Staff | salary | >= minimum wage | "Below minimum" |

### Transaction Boundaries

```mermaid
sequenceDiagram
    participant Service
    participant Transaction
    participant DB

    Service->>Transaction: BEGIN
    Transaction->>DB: Insert Invoice
    Transaction->>DB: Insert Line Items
    Transaction->>DB: Update Enrollment
    Transaction->>DB: Create Audit Log

    alt All Successful
        Transaction->>DB: COMMIT
    else Any Failure
        Transaction->>DB: ROLLBACK
    end
```

---

## Data Flow Metrics

### Throughput by Flow

| Flow | Daily Volume | Peak Rate | Avg Latency |
|------|--------------|-----------|-------------|
| DF001 Invoice | 500 | 100/min | 1.8s |
| DF002 Payment | 200 | 50/min | 450ms |
| DF003 Import | 30 | 5/min | 3s |
| DF004 Payroll | 2 | 1/run | 8.5s |
| DF005 Xero | 500 | 100/min | 500ms |
| DF006 Audit | 10K | 500/min | 50ms |

### Data Quality Metrics

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATA QUALITY DASHBOARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Completeness:        98.5%
Accuracy:            99.2%
Consistency:         97.8%
Timeliness:          96.5%

Duplicate Rate:      0.3%
Validation Failures: 1.2%
Sync Conflicts:      0.1%

OVERALL SCORE: 97.4% ✅
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

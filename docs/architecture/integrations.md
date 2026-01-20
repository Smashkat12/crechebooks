# External Integrations

> Integration architecture for Xero, SimplePay, and banking services.

## Integration Overview

```mermaid
graph TB
    subgraph "CrecheBooks"
        API[NestJS API]

        subgraph "Integration Layer"
            XERO_SVC[Xero Service]
            SIMPLE_SVC[SimplePay Service]
            BANK_SVC[Bank Service]
        end

        subgraph "Sync Engine"
            QUEUE[Job Queue]
            WORKER[Background Worker]
            RETRY[Retry Handler]
        end
    end

    subgraph "External Services"
        XERO[Xero API]
        SIMPLEPAY[SimplePay API]
        BANK[Bank APIs]
    end

    API --> XERO_SVC
    API --> SIMPLE_SVC
    API --> BANK_SVC

    XERO_SVC --> QUEUE
    SIMPLE_SVC --> QUEUE
    BANK_SVC --> QUEUE

    QUEUE --> WORKER
    WORKER --> RETRY

    WORKER --> XERO
    WORKER --> SIMPLEPAY
    WORKER --> BANK
```

## Xero Integration

### Purpose
- Invoice synchronization
- Payment recording
- Financial reporting

### Authentication Flow

```mermaid
sequenceDiagram
    participant User
    participant App
    participant Xero

    User->>App: Click "Connect Xero"
    App->>Xero: OAuth2 Authorization Request
    Xero->>User: Login & Consent
    User->>Xero: Grant Access
    Xero->>App: Authorization Code
    App->>Xero: Exchange for Tokens
    Xero->>App: Access + Refresh Tokens
    App->>App: Store Tokens (encrypted)
```

### Data Sync Flow

```mermaid
graph LR
    subgraph "CrecheBooks"
        INV[Invoice Created]
        PAY[Payment Recorded]
        SYNC[Sync Service]
    end

    subgraph "Xero"
        XINV[Xero Invoice]
        XPAY[Xero Payment]
        XCON[Xero Contact]
    end

    INV -->|Create/Update| SYNC
    PAY -->|Create| SYNC
    SYNC -->|API Call| XINV
    SYNC -->|API Call| XPAY
    SYNC -->|Lookup/Create| XCON
```

### API Endpoints

| CrecheBooks Event | Xero API Call |
|-------------------|---------------|
| Invoice created | `POST /Invoices` |
| Invoice updated | `POST /Invoices/{id}` |
| Payment received | `PUT /Payments` |
| Parent created | `POST /Contacts` |

### Configuration

```typescript
// Xero service configuration
interface XeroConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: [
    'openid',
    'profile',
    'email',
    'accounting.transactions',
    'accounting.contacts',
    'accounting.settings.read'
  ];
}
```

---

## SimplePay Integration

### Purpose
- Payroll processing
- Employee management
- Leave tracking

### Architecture

```mermaid
graph TB
    subgraph "CrecheBooks"
        STAFF[Staff Module]
        PAYROLL[Payroll Service]
        WEBHOOK[Webhook Handler]
    end

    subgraph "SimplePay"
        SP_EMP[Employees API]
        SP_PAY[Payroll API]
        SP_HOOK[Webhooks]
    end

    STAFF -->|Sync Employee| SP_EMP
    PAYROLL -->|Get Payroll Data| SP_PAY
    SP_HOOK -->|Payroll Processed| WEBHOOK
    WEBHOOK -->|Update Records| PAYROLL
```

### Sync Workflow

```mermaid
sequenceDiagram
    participant CB as CrecheBooks
    participant SP as SimplePay

    Note over CB,SP: Staff Onboarding
    CB->>SP: Create Employee
    SP-->>CB: Employee ID
    CB->>CB: Store SimplePay ID

    Note over CB,SP: Payroll Processing
    SP->>SP: Process Payroll
    SP->>CB: Webhook: Payroll Complete
    CB->>SP: GET Payroll Details
    SP-->>CB: Payroll Data
    CB->>CB: Create PayrollRun
    CB->>CB: Update Staff Records
```

### Webhook Events

| Event | Action |
|-------|--------|
| `payroll.processed` | Import payroll run data |
| `employee.updated` | Sync staff details |
| `leave.approved` | Update leave records |
| `employee.terminated` | Mark staff as terminated |

### API Integration

```typescript
// SimplePay service
@Injectable()
export class SimplePayService {
  async syncEmployee(staff: Staff): Promise<void> {
    const employee = {
      firstName: staff.firstName,
      lastName: staff.lastName,
      idNumber: staff.idNumber,
      taxNumber: staff.taxNumber,
      email: staff.email,
      startDate: staff.startDate,
      salary: staff.salary,
      bankDetails: {
        bankName: staff.bankName,
        accountNumber: staff.bankAccount,
        branchCode: staff.bankBranch,
      },
    };

    if (staff.simplePayId) {
      await this.updateEmployee(staff.simplePayId, employee);
    } else {
      const result = await this.createEmployee(employee);
      await this.staffRepo.update(staff.id, {
        simplePayId: result.id,
      });
    }
  }

  async importPayrollRun(payrollId: string): Promise<PayrollRun> {
    const data = await this.client.get(`/payrolls/${payrollId}`);

    return this.payrollService.createFromSimplePay({
      periodStart: data.periodStart,
      periodEnd: data.periodEnd,
      items: data.employees.map(emp => ({
        staffId: this.findStaffBySimplePayId(emp.id),
        grossPay: emp.grossPay,
        paye: emp.paye,
        uif: emp.uif,
        netPay: emp.netPay,
      })),
    });
  }
}
```

---

## Bank Statement Integration

### Purpose
- Import bank statements
- Auto-match transactions
- Reconciliation assistance

### Import Flow

```mermaid
graph TB
    subgraph "Import Methods"
        CSV[CSV Upload]
        OFX[OFX Import]
        API[Bank API]
    end

    subgraph "Processing"
        PARSE[Parser]
        NORM[Normalizer]
        DEDUP[Deduplicator]
    end

    subgraph "Matching"
        RULES[Rule Engine]
        ML[ML Matcher]
        MANUAL[Manual Match]
    end

    subgraph "Output"
        MATCHED[Matched Txns]
        UNMATCHED[Unmatched Txns]
    end

    CSV --> PARSE
    OFX --> PARSE
    API --> PARSE

    PARSE --> NORM
    NORM --> DEDUP
    DEDUP --> RULES
    RULES --> ML
    ML --> MATCHED
    ML --> UNMATCHED
    UNMATCHED --> MANUAL
    MANUAL --> MATCHED
```

### Matching Algorithm

```mermaid
flowchart TD
    TXN[Bank Transaction]

    TXN --> REF{Reference Match?}
    REF -->|Yes| HIGH[High Confidence]
    REF -->|No| AMT{Amount Match?}

    AMT -->|Yes| DATE{Date Range?}
    AMT -->|No| LOW[Low/No Match]

    DATE -->|Within 3 days| MED[Medium Confidence]
    DATE -->|Outside| LOW

    HIGH --> AUTO[Auto-Match]
    MED --> SUGGEST[Suggest Match]
    LOW --> MANUAL[Manual Review]
```

### Supported Banks

| Bank | Method | Format |
|------|--------|--------|
| FNB | CSV Upload | Custom CSV |
| Standard Bank | OFX Import | OFX 2.0 |
| Nedbank | CSV Upload | Standard CSV |
| ABSA | CSV Upload | Custom CSV |
| Capitec | CSV Upload | Standard CSV |

### Transaction Categorization

```typescript
// Auto-categorization rules
const categorizationRules = [
  {
    pattern: /DEBIT ORDER.*INSURANCE/i,
    category: 'INSURANCE',
    type: 'EXPENSE',
  },
  {
    pattern: /EFT.*SCHOOL FEE|CRECHE/i,
    category: 'FEE_PAYMENT',
    type: 'INCOME',
  },
  {
    pattern: /SALARY|WAGE/i,
    category: 'PAYROLL',
    type: 'EXPENSE',
  },
];
```

---

## Error Handling & Retry

```mermaid
graph TB
    subgraph "Error Handling"
        REQ[API Request]
        ERR{Error?}
        TYPE{Error Type}

        RATE[Rate Limited]
        AUTH[Auth Error]
        SERVER[Server Error]
        CLIENT[Client Error]

        RETRY[Retry Queue]
        REFRESH[Refresh Token]
        ALERT[Alert Admin]
        LOG[Log & Skip]
    end

    REQ --> ERR
    ERR -->|No| SUCCESS[Success]
    ERR -->|Yes| TYPE

    TYPE -->|429| RATE
    TYPE -->|401/403| AUTH
    TYPE -->|5xx| SERVER
    TYPE -->|4xx| CLIENT

    RATE --> RETRY
    AUTH --> REFRESH
    SERVER --> RETRY
    CLIENT --> LOG

    REFRESH --> REQ
    RETRY -->|Max Retries| ALERT
```

### Retry Configuration

| Error Type | Retry Strategy |
|------------|----------------|
| Rate Limit | Exponential backoff, max 5 retries |
| Auth Error | Refresh token, retry once |
| Server Error | Linear backoff, max 3 retries |
| Client Error | No retry, log and alert |

---

## Integration Settings UI

```
Settings → Integrations
├── Xero
│   ├── Connection Status: Connected ✓
│   ├── Last Sync: 2026-01-18 14:30
│   ├── Auto-sync Invoices: Enabled
│   └── [Disconnect] [Sync Now]
│
├── SimplePay
│   ├── Connection Status: Connected ✓
│   ├── Company ID: SP-12345
│   ├── Webhook Status: Active
│   └── [Disconnect] [Test Webhook]
│
└── Bank Feeds
    ├── FNB Business: Connected
    ├── Auto-import: Daily at 6 AM
    └── [Add Bank] [Import Now]
```

# Comparative Analysis: Stub vs CrecheBooks
## Accounting & Bookkeeping Capabilities

**Analysis Date:** January 2026
**Purpose:** Identify gaps and improvement opportunities for CrecheBooks accounting features

---

## Executive Summary

| Category | Stub | CrecheBooks | Gap Assessment |
|----------|------|-------------|----------------|
| **Core Accounting** | General-purpose SMB | Creche-specialized | Different focus |
| **Chart of Accounts** | Customizable, editable | Via Xero integration | **GAP - Need native** |
| **General Ledger** | Native view | Journal-based only | **GAP - Need GL view** |
| **Opening Balances** | Dedicated setup | Not implemented | **GAP - Missing** |
| **Asset Tracking** | Built-in with depreciation | Not implemented | **GAP - Missing** |
| **Invoicing** | Full-featured | Full-featured | ✅ Parity |
| **Quotes** | Full support | Not implemented | **GAP - Missing** |
| **Pro Forma Invoices** | Supported | Not implemented | **GAP - Missing** |
| **Credit Notes** | Full support | Basic implementation | ✅ Partial parity |
| **Bank Reconciliation** | Basic auto-sync | Advanced with AI matching | ✅ CrecheBooks ahead |
| **VAT Handling** | Basic VAT | Section 12(h) compliant | ✅ CrecheBooks ahead |
| **Financial Reports** | Full suite | Most reports | ✅ Near parity |
| **Cash Flow Report** | Dedicated report | Not implemented | **GAP - Missing** |
| **Receivables Report** | Dedicated report | Arrears report | ✅ Parity |
| **Payables Report** | Dedicated report | Not implemented | **GAP - Missing** |
| **Multi-currency** | Full support | Basic infrastructure | **GAP - Need full** |
| **Products/Inventory** | Stock tracking | Fee structures only | **GAP - Need inventory** |
| **Suppliers** | Full module | Not implemented | **GAP - Missing** |
| **Purchase Orders** | Supported | Not implemented | **GAP - Missing** |
| **Bills (AP)** | Full support | Not implemented | **GAP - Missing** |
| **Debit Notes** | Supported | Not implemented | **GAP - Missing** |
| **Receipt Upload** | Built-in | Not implemented | **GAP - Missing** |
| **Online Payments** | Built-in gateway | Via external integrations | **GAP - Need native** |
| **Payment Links** | Supported | Not implemented | **GAP - Missing** |
| **Loans Tracking** | Built-in | Not implemented | **GAP - Missing** |
| **Onboarding UX** | Guided wizard | Basic setup | **GAP - Need wizard** |

---

## Detailed Feature Comparison

### 1. ONBOARDING EXPERIENCE

#### Stub's Approach (from screenshots)
```
Welcome wizard with checklist:
├── Logo - Business branding for invoices
├── Address - Legal compliance for invoices
├── Bank account - For invoice display + auto-sync
├── Business details - Contact, VAT, online payments
├── Invoices - Quick create invoice/quote
├── Expenses - Manual add, CSV import, or bank connect
├── Income - Track non-invoice income
├── Customers - Import CSV or add during invoicing
└── Products & Services - Item catalog with variants + stock
```

**Key UX Elements:**
- Expandable accordion sections with explanations
- "Done" checkmarks for completed steps
- Direct action buttons (e.g., "Sales", "Expenses", "Customers")
- Friendly, non-technical language
- Progress indication

#### CrecheBooks Current State
- Basic tenant setup during registration
- Settings scattered across multiple pages
- No guided onboarding wizard
- More technical language in setup

#### 🎯 RECOMMENDATION: Implement Onboarding Wizard
```typescript
// Suggested onboarding checklist for CrecheBooks
const onboardingSteps = [
  { id: 'logo', title: 'Creche Logo', desc: 'Brand your invoices and statements' },
  { id: 'address', title: 'Physical Address', desc: 'Required for legal invoices' },
  { id: 'bank', title: 'Bank Details', desc: 'Show on invoices for parent payments' },
  { id: 'vat', title: 'VAT Registration', desc: 'Enable VAT if registered (optional for education)' },
  { id: 'fees', title: 'Fee Structure', desc: 'Set up your monthly fees and extras' },
  { id: 'children', title: 'Enrol Children', desc: 'Import or add your enrolled children' },
  { id: 'parents', title: 'Parent Details', desc: 'Link billing contacts to children' },
  { id: 'invoice', title: 'First Invoice', desc: 'Generate your first monthly invoice' },
];
```

---

### 2. CHART OF ACCOUNTS

#### Stub's Implementation
- Native chart of accounts management
- Customizable account categories
- Default accounting rules configuration
- Edit/add accounts directly in UI

#### CrecheBooks Current State
- Relies on Xero integration for chart of accounts
- XeroAccount model syncs accounts from Xero
- XeroAccountMapping for type mapping
- No native chart of accounts editor

#### 🎯 RECOMMENDATION: Native Chart of Accounts
```prisma
// Add to schema.prisma
model ChartOfAccount {
  id          String   @id @default(cuid())
  tenantId    String
  code        String   // e.g., "1000", "4100"
  name        String   // e.g., "Bank Account", "Tuition Revenue"
  type        AccountType // ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  subType     String?  // e.g., "Current Asset", "Fixed Asset"
  parentId    String?  // For hierarchical accounts
  isSystem    Boolean  @default(false) // Protect system accounts
  isActive    Boolean  @default(true)
  description String?
  taxRate     TaxRate? // Default VAT treatment

  // Creche-specific defaults
  isEducationExempt Boolean @default(false) // Section 12(h)

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  parent      ChartOfAccount? @relation("AccountHierarchy", fields: [parentId], references: [id])
  children    ChartOfAccount[] @relation("AccountHierarchy")

  @@unique([tenantId, code])
}

enum AccountType {
  ASSET
  LIABILITY
  EQUITY
  REVENUE
  EXPENSE
}
```

**Default Accounts for Creches:**
```
ASSETS
├── 1000 Bank Account (Current Asset)
├── 1100 Accounts Receivable - Parents (Current Asset)
├── 1200 Petty Cash (Current Asset)
└── 1500 Fixed Assets - Equipment (Fixed Asset)

LIABILITIES
├── 2000 Accounts Payable (Current Liability)
├── 2100 VAT Payable (Current Liability)
├── 2200 PAYE Payable (Current Liability)
└── 2300 Deposits Held - Registration (Current Liability)

EQUITY
├── 3000 Owner's Equity
└── 3100 Retained Earnings

REVENUE
├── 4000 Tuition Fees (VAT Exempt - Section 12h)
├── 4100 Registration Fees (VAT Exempt)
├── 4200 Extra-Mural Income (VATable if not educational)
├── 4300 Uniform Sales (VATable)
└── 4400 Meal Charges (VAT Exempt if educational)

EXPENSES
├── 5000 Salaries & Wages
├── 5100 UIF Contributions
├── 5200 SDL Levy
├── 5300 Rent
├── 5400 Utilities
├── 5500 Educational Supplies
├── 5600 Food & Catering
└── 5700 Insurance
```

---

### 3. GENERAL LEDGER VIEW

#### Stub's Implementation
- Dedicated "General Ledger" menu item
- View all journal entries
- Filter by account, date range
- Drill-down to transactions

#### CrecheBooks Current State
- CategorizationJournal for reconciled transactions
- PayrollJournal for payroll entries
- No unified general ledger view
- Journals are created but not exposed in UI

#### 🎯 RECOMMENDATION: Add General Ledger Module
```typescript
// apps/web/app/(dashboard)/general-ledger/page.tsx
// Features needed:
// 1. List all journal entries across all sources
// 2. Filter by account, date range, source type
// 3. Show debits/credits with running balance
// 4. Drill-down to source document (invoice, payment, etc.)
// 5. Manual journal entry creation
// 6. Journal reversal capability
```

**UI Components Needed:**
```
/general-ledger
├── Journal entries list (sortable, filterable)
├── Account filter dropdown
├── Date range picker
├── Source type filter (Invoice, Payment, Payroll, Manual)
├── Entry detail modal with audit trail
└── New manual entry button (for adjustments)
```

---

### 4. ASSET TRACKING & DEPRECIATION

#### Stub's Implementation
- "Assets" section in sidebar
- Track business assets
- Depreciation schedules
- Asset disposal tracking

#### CrecheBooks Current State
- **Not implemented**
- No asset tracking model
- No depreciation calculations

#### 🎯 RECOMMENDATION: Add Asset Management
```prisma
model FixedAsset {
  id              String   @id @default(cuid())
  tenantId        String
  name            String   // e.g., "Playground Equipment"
  description     String?
  category        AssetCategory
  purchaseDate    DateTime
  purchasePrice   Decimal
  residualValue   Decimal  @default(0)
  usefulLifeMonths Int     // e.g., 60 for 5 years
  depreciationMethod DepreciationMethod @default(STRAIGHT_LINE)

  // Tracking
  currentValue    Decimal  // Calculated field
  accumulatedDepreciation Decimal @default(0)
  status          AssetStatus @default(ACTIVE)
  disposalDate    DateTime?
  disposalPrice   Decimal?

  // Linking
  accountId       String?  // Chart of accounts link

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  depreciationEntries AssetDepreciation[]
}

enum AssetCategory {
  FURNITURE
  EQUIPMENT
  VEHICLES
  COMPUTERS
  PLAYGROUND
  KITCHEN
  OTHER
}

enum DepreciationMethod {
  STRAIGHT_LINE
  REDUCING_BALANCE
}

enum AssetStatus {
  ACTIVE
  DISPOSED
  WRITTEN_OFF
}

model AssetDepreciation {
  id          String   @id @default(cuid())
  assetId     String
  periodStart DateTime
  periodEnd   DateTime
  amount      Decimal
  journalId   String?  // Link to GL entry

  asset       FixedAsset @relation(fields: [assetId], references: [id])
}
```

**Creche-Relevant Assets:**
- Playground equipment (swings, slides, jungle gyms)
- Furniture (cots, chairs, tables)
- Kitchen equipment (fridges, stoves, microwaves)
- Educational toys and learning materials
- Vehicles (if transport provided)
- Computer equipment
- Security systems (CCTV, access control)

---

### 5. SUPPLIER & PURCHASE MANAGEMENT

#### Stub's Implementation
- Full "Suppliers" module
- "Purchases" tracking
- Supplier invoicing (AP)
- Expense categorization

#### CrecheBooks Current State
- **Not implemented**
- Only parent billing (AR)
- No supplier management
- No purchase order system
- Expenses tracked via bank transactions only

#### 🎯 RECOMMENDATION: Add Accounts Payable Module
```prisma
model Supplier {
  id          String   @id @default(cuid())
  tenantId    String
  name        String
  email       String?
  phone       String?
  address     String?
  vatNumber   String?
  paymentTerms Int     @default(30) // Days
  bankDetails Json?

  isActive    Boolean  @default(true)

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  bills       SupplierBill[]

  @@unique([tenantId, name])
}

model SupplierBill {
  id          String   @id @default(cuid())
  tenantId    String
  supplierId  String
  billNumber  String
  billDate    DateTime
  dueDate     DateTime

  subtotal    Decimal
  vatAmount   Decimal
  total       Decimal

  status      BillStatus @default(DRAFT)
  paidDate    DateTime?

  // Categorization
  accountId   String?  // Expense account

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  supplier    Supplier @relation(fields: [supplierId], references: [id])
  lines       SupplierBillLine[]
  payments    SupplierPayment[]
}

enum BillStatus {
  DRAFT
  AWAITING_PAYMENT
  PARTIALLY_PAID
  PAID
  VOID
}
```

**Common Creche Suppliers:**
- Food suppliers (groceries, catering)
- Educational supply companies
- Cleaning supply vendors
- Utility providers
- Insurance companies
- Maintenance contractors
- Toy and equipment suppliers

---

### 6. LOAN TRACKING

#### Stub's Implementation
- "Loans" section in business settings
- Track business loans
- Payment schedules
- Interest calculations

#### CrecheBooks Current State
- **Not implemented**
- No loan tracking capability

#### 🎯 RECOMMENDATION: Add Loan Management
```prisma
model BusinessLoan {
  id              String   @id @default(cuid())
  tenantId        String
  lenderName      String
  loanType        LoanType
  principalAmount Decimal
  interestRate    Decimal  // Annual percentage
  termMonths      Int
  startDate       DateTime
  monthlyPayment  Decimal

  // Tracking
  outstandingBalance Decimal
  totalInterestPaid  Decimal @default(0)
  status          LoanStatus @default(ACTIVE)

  // Linking
  liabilityAccountId String? // Chart of accounts
  interestAccountId  String? // Expense account

  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  payments        LoanPayment[]
}

enum LoanType {
  TERM_LOAN
  VEHICLE_FINANCE
  EQUIPMENT_FINANCE
  OVERDRAFT
  CREDIT_CARD
}

enum LoanStatus {
  ACTIVE
  PAID_OFF
  DEFAULTED
}
```

---

### 7. PRODUCTS & INVENTORY

#### Stub's Implementation
- "Products & Services" module
- Item variants (sizes, colors)
- Stock tracking
- Inventory management

#### CrecheBooks Current State
- Fee structures (Full day, Half day, Hourly)
- InvoiceLineType for charge categories
- No true inventory/product catalog
- No stock tracking

#### 🎯 RECOMMENDATION: Add Product Catalog for Sellable Items
```prisma
model Product {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // e.g., "School Uniform - Shirt"
  description String?
  sku         String?
  category    ProductCategory

  // Pricing
  unitPrice   Decimal
  costPrice   Decimal?
  vatType     VatType  @default(STANDARD)

  // Inventory
  trackStock  Boolean  @default(false)
  stockOnHand Int      @default(0)
  reorderLevel Int?

  isActive    Boolean  @default(true)

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  variants    ProductVariant[]
}

enum ProductCategory {
  UNIFORM
  BOOKS
  STATIONERY
  MEALS
  TRANSPORT
  EXTRA_MURAL
  OTHER
}

model ProductVariant {
  id          String   @id @default(cuid())
  productId   String
  name        String   // e.g., "Size 5-6"
  sku         String?
  priceAdjustment Decimal @default(0)
  stockOnHand Int      @default(0)

  product     Product  @relation(fields: [productId], references: [id])
}
```

---

### 8. INSIGHTS DASHBOARD

#### Stub's Implementation (from screenshots)
```
Dashboard Cards:
├── Overdue invoices (count, clickable)
├── Total invoices (count)
├── New quote (quick action)
├── Uncategorized expenses (alert)
├── Profit (current period + delta)
├── Yearly profit (YTD + delta)
├── Cash in (bar chart + total)
├── Cash out (bar chart + total)
├── Income (by customer breakdown)
└── Expenses (by category breakdown)
```

#### CrecheBooks Current State
- Dashboard exists but focused on:
  - Enrollment stats
  - Attendance tracking
  - Arrears summary
- Less financial insight focus

#### 🎯 RECOMMENDATION: Enhance Financial Dashboard
```typescript
// New dashboard widgets for finance focus
const financialWidgets = [
  // Quick Stats Row
  { type: 'stat', label: 'Outstanding Invoices', value: 'R 45,000', link: '/invoices?status=unpaid' },
  { type: 'stat', label: 'Overdue (30+ days)', value: '8 parents', link: '/arrears', alert: true },
  { type: 'stat', label: 'This Month Revenue', value: 'R 125,000', delta: '+12%' },
  { type: 'stat', label: 'Bank Balance', value: 'R 89,500', link: '/reconciliation' },

  // Charts
  { type: 'chart', label: 'Cash Flow', data: 'monthly', comparison: 'prior_year' },
  { type: 'chart', label: 'Revenue by Fee Type', data: 'pie' },

  // Action Items
  { type: 'action', label: 'Uncategorized Transactions', count: 12, link: '/transactions?uncategorized=true' },
  { type: 'action', label: 'Pending Reconciliation', count: 3, link: '/reconciliation' },
  { type: 'action', label: 'VAT Filing Due', date: '25 Feb', link: '/sars/vat201' },
];
```

---

### 9. MULTI-CURRENCY SUPPORT

#### Stub's Implementation
- Full multi-currency invoicing
- Currency selection per transaction
- Exchange rate handling

#### CrecheBooks Current State
- Basic currency field in some models
- CurrencyConversionService exists
- Not fully implemented in UI

#### 🎯 RECOMMENDATION: Complete Multi-Currency Implementation
- Lower priority for SA-focused creches
- Consider for international school support
- Implement exchange rate sync with SARB rates

---

### 10. RECURRING INVOICES

#### Stub's Implementation
- Repeat/recurring invoice schedules
- Auto-generation capability

#### CrecheBooks Current State
- Batch invoice generation per period
- No true recurring invoice scheduler
- Manual trigger required each month

#### 🎯 RECOMMENDATION: Add Recurring Invoice Scheduler
```prisma
model RecurringInvoiceSchedule {
  id          String   @id @default(cuid())
  tenantId    String
  childId     String

  frequency   RecurringFrequency
  dayOfMonth  Int      // 1-28 for safety
  startDate   DateTime
  endDate     DateTime?

  // Template
  templateLines Json   // Snapshot of line items

  // Tracking
  lastGenerated DateTime?
  nextGeneration DateTime
  isActive    Boolean  @default(true)

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  child       Child    @relation(fields: [childId], references: [id])
}

enum RecurringFrequency {
  WEEKLY
  MONTHLY
  QUARTERLY
  ANNUALLY
}
```

---

### 11. QUOTES & PRO FORMA INVOICES

#### Stub's Implementation
- Full quote management
- Quote to invoice conversion
- Pro forma invoice generation
- Credit notes and debit notes

#### CrecheBooks Current State
- **Quotes: Not implemented**
- **Pro Forma: Not implemented**
- Credit notes: Basic via CreditBalance model
- No debit notes

#### 🎯 RECOMMENDATION: Add Quote System
```prisma
model Quote {
  id          String   @id @default(cuid())
  tenantId    String
  parentId    String
  childId     String?
  quoteNumber String
  quoteDate   DateTime
  expiryDate  DateTime
  status      QuoteStatus @default(DRAFT)

  subtotal    Decimal
  vatAmount   Decimal
  total       Decimal
  notes       String?

  // Conversion tracking
  convertedToInvoiceId String?
  convertedAt DateTime?

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  parent      Parent   @relation(fields: [parentId], references: [id])
  lines       QuoteLine[]
}

enum QuoteStatus {
  DRAFT
  SENT
  VIEWED
  ACCEPTED
  DECLINED
  EXPIRED
  CONVERTED
}
```

**Use Cases for Creches:**
- Registration fee quotes for prospective parents
- Extra-mural activity packages
- Holiday program pricing
- Uniform and supply bundles

---

### 12. ONLINE PAYMENTS (Built-in Gateway)

#### Stub's Implementation
- **Built-in payment processing**
- Invoice payments via link
- Standalone payment links
- Donation pages
- Transaction fees: 3.0-4.5% + R2 (SA cards)

#### CrecheBooks Current State
- External payment integrations only
- No built-in payment gateway
- Manual payment recording
- Bank EFT is primary method

#### 🎯 RECOMMENDATION: Add Payment Gateway Integration
```prisma
model PaymentLink {
  id          String   @id @default(cuid())
  tenantId    String
  parentId    String?
  invoiceId   String?
  type        PaymentLinkType
  amount      Decimal
  description String
  expiresAt   DateTime?

  // Link details
  shortCode   String   @unique
  url         String

  // Status
  status      PaymentLinkStatus @default(ACTIVE)
  paidAt      DateTime?
  paymentId   String?  // Link to Payment record

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
}

enum PaymentLinkType {
  INVOICE      // Pay specific invoice
  STANDALONE   // One-time payment link
  REGISTRATION // Registration fee
  DEPOSIT      // Security deposit
}

enum PaymentLinkStatus {
  ACTIVE
  PAID
  EXPIRED
  CANCELLED
}
```

**Integration Options:**
- **Yoco** - Most popular SA payment gateway
- **PayFast** - Established SA provider
- **Peach Payments** - Enterprise option
- **Ozow** - Instant EFT

**Benefits for Creches:**
- Faster payment collection
- Reduced arrears
- Automatic reconciliation
- Parent convenience (card payments)

---

### 13. PURCHASE ORDERS

#### Stub's Implementation
- Full purchase order management
- PO to Bill conversion
- Supplier management
- Order tracking

#### CrecheBooks Current State
- **Not implemented**
- No purchase workflow
- Expenses tracked via bank transactions only

#### 🎯 RECOMMENDATION: Add Purchase Order System
```prisma
model PurchaseOrder {
  id          String   @id @default(cuid())
  tenantId    String
  supplierId  String
  poNumber    String
  orderDate   DateTime
  expectedDate DateTime?
  status      POStatus @default(DRAFT)

  subtotal    Decimal
  vatAmount   Decimal
  total       Decimal
  notes       String?

  // Conversion
  convertedToBillId String?

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  supplier    Supplier @relation(fields: [supplierId], references: [id])
  lines       PurchaseOrderLine[]
}

enum POStatus {
  DRAFT
  SENT
  PARTIALLY_RECEIVED
  RECEIVED
  CANCELLED
  BILLED
}
```

**Creche Use Cases:**
- Food/grocery orders
- Educational supplies
- Cleaning supplies
- Equipment purchases

---

### 14. RECEIPT UPLOAD & EXPENSE CAPTURE

#### Stub's Implementation
- Receipt photo upload
- OCR extraction (potentially)
- Link to expense transactions
- Mobile-friendly capture

#### CrecheBooks Current State
- **Not implemented**
- No receipt management
- Document model exists but not for receipts

#### 🎯 RECOMMENDATION: Add Receipt Management
```prisma
model Receipt {
  id          String   @id @default(cuid())
  tenantId    String
  transactionId String?
  supplierId  String?

  // Receipt details
  receiptDate DateTime
  amount      Decimal
  vatAmount   Decimal?
  description String?
  category    String?

  // File storage
  fileUrl     String
  fileType    String   // image/jpeg, application/pdf
  ocrData     Json?    // Extracted data if using OCR

  status      ReceiptStatus @default(UNMATCHED)

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  transaction Transaction? @relation(fields: [transactionId], references: [id])
}

enum ReceiptStatus {
  UNMATCHED
  MATCHED
  ARCHIVED
}
```

---

### 15. CASH FLOW REPORT

#### Stub's Implementation
- Dedicated cash flow statement
- Operating/investing/financing activities
- Period comparison

#### CrecheBooks Current State
- **Not implemented**
- Has income statement and balance sheet
- No cash flow statement

#### 🎯 RECOMMENDATION: Add Cash Flow Report
```typescript
// apps/api/src/services/reports/cash-flow.service.ts
interface CashFlowReport {
  period: { start: Date; end: Date };

  operatingActivities: {
    netIncome: Decimal;
    adjustments: {
      depreciation: Decimal;
      receivablesChange: Decimal;
      payablesChange: Decimal;
    };
    netCashFromOperations: Decimal;
  };

  investingActivities: {
    assetPurchases: Decimal;
    assetSales: Decimal;
    netCashFromInvesting: Decimal;
  };

  financingActivities: {
    loanProceeds: Decimal;
    loanRepayments: Decimal;
    ownerDrawings: Decimal;
    capitalContributions: Decimal;
    netCashFromFinancing: Decimal;
  };

  netCashChange: Decimal;
  openingCash: Decimal;
  closingCash: Decimal;
}
```

---

### 16. OPENING BALANCES

#### Stub's Implementation
- Dedicated opening balance setup
- Import from prior system
- Trial balance upload

#### CrecheBooks Current State
- No formal opening balance setup
- Balance sheet has opening balance retrieval
- No wizard for migration

#### 🎯 RECOMMENDATION: Add Opening Balance Wizard
```prisma
model OpeningBalance {
  id          String   @id @default(cuid())
  tenantId    String
  accountId   String   // Chart of accounts reference
  asOfDate    DateTime
  debitAmount Decimal?
  creditAmount Decimal?
  notes       String?

  // Audit
  enteredBy   String
  enteredAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, accountId, asOfDate])
}
```

**Migration Wizard Steps:**
1. Select migration date (start of financial year)
2. Enter bank balances
3. Enter outstanding receivables (parent balances)
4. Enter outstanding payables (if any)
5. Enter fixed asset values
6. System calculates opening retained earnings
7. Verify trial balance balances

---

## Priority Implementation Roadmap

### Phase 1: Core Accounting Foundation (Critical - Do First)
| # | Feature | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 1 | **Native Chart of Accounts** | Medium | High | Foundation for proper accounting |
| 2 | **General Ledger View** | Low | High | Already have journals, just need UI |
| 3 | **Opening Balances Wizard** | Medium | High | Required for migration/onboarding |
| 4 | **Cash Flow Report** | Medium | Medium | Completes financial report suite |

### Phase 2: Revenue & Collections Enhancement (High Priority)
| # | Feature | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 5 | **Online Payment Gateway** | High | Very High | Reduce arrears, improve cash flow |
| 6 | **Payment Links** | Medium | High | Convenience for parents |
| 7 | **Quotes System** | Medium | Medium | Pre-enrollment fee discussions |
| 8 | **Onboarding Wizard** | Medium | High | Better first-time experience |

### Phase 3: Expense & Purchasing (Medium Priority)
| # | Feature | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 9 | **Supplier Management** | Medium | Medium | Track recurring vendors |
| 10 | **Bills (Accounts Payable)** | Medium | Medium | Proper expense tracking |
| 11 | **Receipt Upload** | Medium | Medium | Expense documentation |
| 12 | **Purchase Orders** | Medium | Low | Ordering workflow |

### Phase 4: Asset & Inventory (Lower Priority)
| # | Feature | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 13 | **Product/Inventory Catalog** | Medium | Low | Uniforms, supplies tracking |
| 14 | **Asset Tracking** | Medium | Low | Equipment depreciation |
| 15 | **Loan Management** | Low | Low | Business loan tracking |

### Phase 5: Advanced Features (Future)
| # | Feature | Effort | Impact | Rationale |
|---|---------|--------|--------|-----------|
| 16 | **Multi-Currency Full** | High | Low | International schools only |
| 17 | **Recurring Invoice Scheduler** | Medium | Medium | Automation |
| 18 | **Debit Notes** | Low | Low | Rare use case |

---

## Quick Wins (Can Implement Immediately)

These require minimal effort and leverage existing infrastructure:

1. **General Ledger View** - Just expose CategorizationJournal + PayrollJournal in a new UI page
2. **Cash Flow Report** - Build from existing income/expense data
3. **Enhanced Financial Dashboard** - Add widgets to existing dashboard
4. **Opening Balance Entry** - Simple form to record balances

---

## CrecheBooks Competitive Advantages

While implementing parity with Stub, preserve these CrecheBooks strengths:

### ✅ Features Where CrecheBooks Excels

1. **Child-Centric Data Model**
   - Enrollment, attendance, development tracking
   - Parent-child-invoice relationships
   - Sibling discount automation

2. **Advanced Bank Reconciliation**
   - AI-powered categorization with confidence scoring
   - Split transaction handling (one-to-many, many-to-one)
   - Accrued bank charge tracking
   - Manual match audit trail

3. **SA Tax Compliance**
   - Section 12(h) VAT exemption handling
   - SARS submission (VAT201, EMP201, IRP5)
   - UI19 deadline tracking

4. **Payroll Integration**
   - SimplePay + Xero connectivity
   - PAYE, UIF, SDL calculations
   - Payroll journal automation

5. **Multi-Channel Communication**
   - WhatsApp invoice delivery
   - Email with delivery tracking
   - Reminder escalation workflows

6. **Credit Balance Management**
   - Overpayment tracking
   - Credit balance reapplication
   - Credit note handling

---

## Conclusion

CrecheBooks has **strong specialized accounting features** for the creche/daycare niche, particularly in:
- Parent billing and collections
- SA tax compliance
- Bank reconciliation

However, it lacks some **general accounting fundamentals** that Stub provides:
- Native chart of accounts management
- General ledger visibility
- Asset and depreciation tracking
- Supplier/purchase management
- Guided onboarding experience

The recommended approach is to implement core accounting parity (Chart of Accounts, General Ledger, Onboarding) while preserving CrecheBooks' domain-specific advantages in child enrollment, attendance, and specialized billing workflows.

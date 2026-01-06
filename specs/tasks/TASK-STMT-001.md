# TASK-STMT-001: Statement Entity and Data Model

## Metadata
- **Task ID**: TASK-STMT-001
- **Phase**: 12 - Account Statements
- **Layer**: foundation
- **Priority**: P1-CRITICAL
- **Dependencies**: TASK-BILL-003, TASK-PAY-001
- **Estimated Effort**: 4 hours

## Objective
Create the Statement data model to track parent account statements with opening/closing balances, all transactions, and generation metadata.

## Business Context
Parents need periodic account statements showing:
- Opening balance (carried forward from previous period)
- All charges (invoices, ad-hoc fees)
- All payments received
- Any credits or adjustments
- Closing balance (amount due or credit balance)

This is standard accounting practice used by Xero, QuickBooks, and Sage.

## Technical Requirements

### 1. Prisma Schema Updates (`apps/api/prisma/schema.prisma`)

```prisma
model Statement {
  id                    String    @id @default(uuid())
  tenantId              String    @map("tenant_id")
  parentId              String    @map("parent_id")
  statementNumber       String    @map("statement_number") @db.VarChar(50)

  // Period
  periodStart           DateTime  @map("period_start") @db.Date
  periodEnd             DateTime  @map("period_end") @db.Date
  generatedAt           DateTime  @default(now()) @map("generated_at")

  // Balances (in cents for precision)
  openingBalanceCents   Int       @map("opening_balance_cents")
  totalChargesCents     Int       @map("total_charges_cents")
  totalPaymentsCents    Int       @map("total_payments_cents")
  totalCreditsCents     Int       @map("total_credits_cents")
  closingBalanceCents   Int       @map("closing_balance_cents")

  // Status
  status                StatementStatus @default(DRAFT)
  deliveryStatus        DeliveryStatus? @map("delivery_status")
  deliveredAt           DateTime?       @map("delivered_at")
  deliveryChannel       String?         @map("delivery_channel") @db.VarChar(50)

  // Metadata
  notes                 String?
  pdfUrl                String?         @map("pdf_url")
  createdAt             DateTime        @default(now()) @map("created_at")
  updatedAt             DateTime        @updatedAt @map("updated_at")

  // Relations
  tenant                Tenant    @relation(fields: [tenantId], references: [id])
  parent                Parent    @relation(fields: [parentId], references: [id])
  lines                 StatementLine[]

  @@unique([tenantId, statementNumber])
  @@index([tenantId, parentId])
  @@index([tenantId, periodStart, periodEnd])
  @@map("statements")
}

model StatementLine {
  id                String    @id @default(uuid())
  statementId       String    @map("statement_id")

  // Line details
  date              DateTime  @db.Date
  description       String
  lineType          StatementLineType @map("line_type")

  // Reference to source document
  referenceType     String?   @map("reference_type") @db.VarChar(50) // 'INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'ADJUSTMENT'
  referenceId       String?   @map("reference_id")
  referenceNumber   String?   @map("reference_number") @db.VarChar(50)

  // Amounts (in cents)
  debitCents        Int       @default(0) @map("debit_cents")   // Charges
  creditCents       Int       @default(0) @map("credit_cents")  // Payments
  balanceCents      Int       @map("balance_cents")             // Running balance

  sortOrder         Int       @map("sort_order")
  createdAt         DateTime  @default(now()) @map("created_at")

  // Relations
  statement         Statement @relation(fields: [statementId], references: [id], onDelete: Cascade)

  @@index([statementId, date])
  @@map("statement_lines")
}

enum StatementStatus {
  DRAFT
  FINALIZED
  SENT
  VOIDED
}

enum StatementLineType {
  OPENING_BALANCE
  INVOICE
  PAYMENT
  CREDIT_NOTE
  ADJUSTMENT
  CLOSING_BALANCE
}
```

### 2. Entity Interface (`apps/api/src/database/entities/statement.entity.ts`)

```typescript
export enum StatementStatus {
  DRAFT = 'DRAFT',
  FINALIZED = 'FINALIZED',
  SENT = 'SENT',
  VOIDED = 'VOIDED',
}

export enum StatementLineType {
  OPENING_BALANCE = 'OPENING_BALANCE',
  INVOICE = 'INVOICE',
  PAYMENT = 'PAYMENT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  ADJUSTMENT = 'ADJUSTMENT',
  CLOSING_BALANCE = 'CLOSING_BALANCE',
}

export interface IStatement {
  id: string;
  tenantId: string;
  parentId: string;
  statementNumber: string;
  periodStart: Date;
  periodEnd: Date;
  generatedAt: Date;
  openingBalanceCents: number;
  totalChargesCents: number;
  totalPaymentsCents: number;
  totalCreditsCents: number;
  closingBalanceCents: number;
  status: StatementStatus;
  deliveryStatus?: string;
  deliveredAt?: Date;
  deliveryChannel?: string;
  notes?: string;
  pdfUrl?: string;
  createdAt: Date;
  updatedAt: Date;
  lines?: IStatementLine[];
}

export interface IStatementLine {
  id: string;
  statementId: string;
  date: Date;
  description: string;
  lineType: StatementLineType;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
  sortOrder: number;
  createdAt: Date;
}
```

### 3. Repository (`apps/api/src/database/repositories/statement.repository.ts`)

```typescript
@Injectable()
export class StatementRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateStatementInput): Promise<Statement>;
  async findById(id: string): Promise<Statement | null>;
  async findByParent(tenantId: string, parentId: string, options?: { limit?: number }): Promise<Statement[]>;
  async findByPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<Statement[]>;
  async findLastStatementForParent(tenantId: string, parentId: string): Promise<Statement | null>;
  async update(id: string, data: UpdateStatementInput): Promise<Statement>;
  async addLines(statementId: string, lines: CreateStatementLineInput[]): Promise<void>;
  async generateStatementNumber(tenantId: string, year: number): Promise<string>;
}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `apps/api/prisma/schema.prisma` | MODIFY | Add Statement and StatementLine models |
| `apps/api/src/database/entities/statement.entity.ts` | CREATE | Statement and StatementLine interfaces |
| `apps/api/src/database/repositories/statement.repository.ts` | CREATE | Statement repository |
| `apps/api/src/database/repositories/statement.repository.spec.ts` | CREATE | Repository tests |
| `packages/types/src/statement.ts` | CREATE | Shared Statement types |
| `packages/types/src/index.ts` | MODIFY | Export statement types |

## Acceptance Criteria

- [ ] Statement and StatementLine models added to Prisma schema
- [ ] Migration runs successfully
- [ ] StatementRepository with all CRUD operations
- [ ] Unique constraint on tenant + statement_number
- [ ] Statement number format: STMT-YYYY-NNNNN
- [ ] All amounts stored in cents with Decimal.js precision
- [ ] Unit tests with >90% coverage

## Test Cases

1. Create statement with opening/closing balances
2. Add multiple statement lines
3. Calculate running balance correctly
4. Find statements by parent
5. Find statements by period
6. Generate unique statement numbers
7. Handle concurrent statement generation

## South African Context

- Currency: ZAR (stored as cents)
- Date format: DD/MM/YYYY on statements
- Include VAT breakdown where applicable
- POPIA compliant: statements contain personal financial data

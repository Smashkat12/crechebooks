<task_spec id="TASK-ACCT-013" version="2.0">

<metadata>
  <title>Supplier Management Foundation</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>foundation</layer>
  <sequence>413</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-ACCT-SUPPLIER-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-002</task_ref>
    <task_ref status="ready">TASK-ACCT-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has no supplier/vendor management. Expenses are only tracked via
  bank transaction categorization. Stub has full Suppliers and Bills (AP) modules.

  **Gap:**
  - No Supplier model
  - No way to track recurring vendors
  - No purchase history per supplier
  - Cannot generate supplier statements

  **Files to Create:**
  - packages/database/prisma/migrations/xxx_add_suppliers/migration.sql
  - apps/api/src/database/entities/supplier.entity.ts
  - apps/api/src/database/repositories/supplier.repository.ts
  - apps/api/src/database/services/supplier.service.ts

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD Supplier, SupplierBill, SupplierBillLine)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Prisma Models
  ```prisma
  // packages/database/prisma/schema.prisma

  enum BillStatus {
    DRAFT
    AWAITING_PAYMENT
    PARTIALLY_PAID
    PAID
    VOID
    OVERDUE
  }

  model Supplier {
    id              String         @id @default(cuid())
    tenantId        String
    name            String
    tradingName     String?
    email           String?
    phone           String?
    address         String?
    vatNumber       String?
    registrationNumber String?
    paymentTermsDays Int           @default(30)

    // Bank details for EFT payments
    bankName        String?
    branchCode      String?
    accountNumber   String?
    accountType     String?        // CHEQUE, SAVINGS, CURRENT

    // Default expense account for categorization
    defaultAccountId String?

    // Status
    isActive        Boolean        @default(true)

    // Audit
    createdAt       DateTime       @default(now())
    updatedAt       DateTime       @updatedAt

    tenant          Tenant         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
    defaultAccount  ChartOfAccount? @relation(fields: [defaultAccountId], references: [id])
    bills           SupplierBill[]
    transactions    Transaction[]  // Linked bank transactions

    @@unique([tenantId, name])
    @@index([tenantId, isActive])
  }

  model SupplierBill {
    id              String         @id @default(cuid())
    tenantId        String
    supplierId      String
    billNumber      String         // Supplier's invoice number
    billDate        DateTime
    dueDate         DateTime

    // Amounts
    subtotalCents   Int
    vatAmountCents  Int            @default(0)
    totalCents      Int
    paidCents       Int            @default(0)
    balanceDueCents Int

    // Status
    status          BillStatus     @default(DRAFT)
    paidDate        DateTime?

    // Reference
    purchaseOrderRef String?
    notes           String?

    // Attachments
    attachmentUrl   String?        // PDF/image of supplier invoice

    // Audit
    createdById     String
    createdAt       DateTime       @default(now())
    updatedAt       DateTime       @updatedAt

    tenant          Tenant         @relation(fields: [tenantId], references: [id])
    supplier        Supplier       @relation(fields: [supplierId], references: [id])
    createdBy       User           @relation(fields: [createdById], references: [id])
    lines           SupplierBillLine[]
    payments        SupplierBillPayment[]

    @@unique([tenantId, supplierId, billNumber])
    @@index([tenantId, status])
    @@index([tenantId, dueDate])
    @@index([supplierId])
  }

  model SupplierBillLine {
    id              String         @id @default(cuid())
    billId          String
    lineNumber      Int
    description     String
    quantity        Decimal        @default(1)
    unitPriceCents  Int
    lineTotalCents  Int
    vatType         VatType        @default(STANDARD)

    // Account coding
    accountId       String?        // Chart of accounts

    bill            SupplierBill   @relation(fields: [billId], references: [id], onDelete: Cascade)
    account         ChartOfAccount? @relation(fields: [accountId], references: [id])

    @@index([billId])
  }

  model SupplierBillPayment {
    id              String         @id @default(cuid())
    tenantId        String
    billId          String
    transactionId   String?        // Link to bank transaction
    amountCents     Int
    paymentDate     DateTime
    paymentMethod   String         // EFT, CASH, CARD
    reference       String?

    createdAt       DateTime       @default(now())

    tenant          Tenant         @relation(fields: [tenantId], references: [id])
    bill            SupplierBill   @relation(fields: [billId], references: [id])
    transaction     Transaction?   @relation(fields: [transactionId], references: [id])

    @@index([billId])
    @@index([transactionId])
  }
  ```

  ### 3. Supplier Service
  ```typescript
  // apps/api/src/database/services/supplier.service.ts
  @Injectable()
  export class SupplierService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly auditService: AuditLogService,
    ) {}

    async createSupplier(
      tenantId: string,
      userId: string,
      data: CreateSupplierDto,
    ): Promise<Supplier> {
      const supplier = await this.prisma.supplier.create({
        data: {
          tenantId,
          name: data.name,
          tradingName: data.tradingName,
          email: data.email,
          phone: data.phone,
          address: data.address,
          vatNumber: data.vatNumber,
          registrationNumber: data.registrationNumber,
          paymentTermsDays: data.paymentTermsDays || 30,
          bankName: data.bankName,
          branchCode: data.branchCode,
          accountNumber: data.accountNumber,
          accountType: data.accountType,
          defaultAccountId: data.defaultAccountId,
        },
      });

      await this.auditService.log({
        tenantId,
        userId,
        action: 'SUPPLIER_CREATED',
        resourceType: 'Supplier',
        resourceId: supplier.id,
      });

      return supplier;
    }

    async createBill(
      tenantId: string,
      userId: string,
      data: CreateSupplierBillDto,
    ): Promise<SupplierBill> {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: data.supplierId, tenantId },
      });

      if (!supplier) throw new NotFoundException('Supplier not found');

      // Calculate totals
      const subtotalCents = data.lines.reduce(
        (sum, line) => sum + (line.unitPriceCents * Number(line.quantity || 1)),
        0,
      );

      const vatAmountCents = data.lines.reduce((sum, line) => {
        if (line.vatType === 'STANDARD') {
          return sum + Math.round((line.unitPriceCents * Number(line.quantity || 1)) * 0.15);
        }
        return sum;
      }, 0);

      const totalCents = subtotalCents + vatAmountCents;

      // Calculate due date from payment terms
      const dueDate = data.dueDate
        ? new Date(data.dueDate)
        : new Date(new Date(data.billDate).getTime() + supplier.paymentTermsDays * 24 * 60 * 60 * 1000);

      const bill = await this.prisma.supplierBill.create({
        data: {
          tenantId,
          supplierId: data.supplierId,
          billNumber: data.billNumber,
          billDate: new Date(data.billDate),
          dueDate,
          subtotalCents,
          vatAmountCents,
          totalCents,
          balanceDueCents: totalCents,
          purchaseOrderRef: data.purchaseOrderRef,
          notes: data.notes,
          attachmentUrl: data.attachmentUrl,
          createdById: userId,
          status: 'AWAITING_PAYMENT',
          lines: {
            create: data.lines.map((line, index) => ({
              lineNumber: index + 1,
              description: line.description,
              quantity: line.quantity || 1,
              unitPriceCents: line.unitPriceCents,
              lineTotalCents: line.unitPriceCents * Number(line.quantity || 1),
              vatType: line.vatType || 'STANDARD',
              accountId: line.accountId || supplier.defaultAccountId,
            })),
          },
        },
        include: { lines: true, supplier: true },
      });

      await this.auditService.log({
        tenantId,
        userId,
        action: 'SUPPLIER_BILL_CREATED',
        resourceType: 'SupplierBill',
        resourceId: bill.id,
        metadata: { billNumber: bill.billNumber, totalCents },
      });

      return bill;
    }

    async recordBillPayment(
      tenantId: string,
      billId: string,
      amountCents: number,
      paymentDate: Date,
      paymentMethod: string,
      reference?: string,
      transactionId?: string,
    ): Promise<SupplierBillPayment> {
      const bill = await this.prisma.supplierBill.findFirst({
        where: { id: billId, tenantId },
      });

      if (!bill) throw new NotFoundException('Bill not found');
      if (amountCents > bill.balanceDueCents) {
        throw new BadRequestException('Payment exceeds balance due');
      }

      const payment = await this.prisma.supplierBillPayment.create({
        data: {
          tenantId,
          billId,
          amountCents,
          paymentDate,
          paymentMethod,
          reference,
          transactionId,
        },
      });

      // Update bill balance and status
      const newBalance = bill.balanceDueCents - amountCents;
      const newPaidCents = bill.paidCents + amountCents;

      let newStatus: BillStatus = bill.status;
      if (newBalance === 0) {
        newStatus = 'PAID';
      } else if (newPaidCents > 0) {
        newStatus = 'PARTIALLY_PAID';
      }

      await this.prisma.supplierBill.update({
        where: { id: billId },
        data: {
          balanceDueCents: newBalance,
          paidCents: newPaidCents,
          status: newStatus,
          paidDate: newStatus === 'PAID' ? paymentDate : null,
        },
      });

      return payment;
    }

    async getPayablesSummary(tenantId: string): Promise<{
      totalDueCents: number;
      overdueCents: number;
      dueThisWeekCents: number;
      supplierCount: number;
    }> {
      const today = new Date();
      const weekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

      const bills = await this.prisma.supplierBill.findMany({
        where: {
          tenantId,
          status: { in: ['AWAITING_PAYMENT', 'PARTIALLY_PAID', 'OVERDUE'] },
        },
        select: {
          balanceDueCents: true,
          dueDate: true,
          supplierId: true,
        },
      });

      const totalDueCents = bills.reduce((sum, b) => sum + b.balanceDueCents, 0);
      const overdueCents = bills
        .filter(b => b.dueDate < today)
        .reduce((sum, b) => sum + b.balanceDueCents, 0);
      const dueThisWeekCents = bills
        .filter(b => b.dueDate >= today && b.dueDate <= weekFromNow)
        .reduce((sum, b) => sum + b.balanceDueCents, 0);
      const supplierCount = new Set(bills.map(b => b.supplierId)).size;

      return { totalDueCents, overdueCents, dueThisWeekCents, supplierCount };
    }

    async linkTransactionToSupplier(
      tenantId: string,
      transactionId: string,
      supplierId: string,
    ): Promise<void> {
      await this.prisma.transaction.update({
        where: { id: transactionId, tenantId },
        data: { supplierId },
      });
    }
  }
  ```
</critical_patterns>

<context>
This task adds supplier/vendor management for tracking creche expenses.
Common creche suppliers include food vendors, cleaning supplies, educational materials.

**Common Creche Suppliers:**
- Food/grocery suppliers (Makro, local vendors)
- Cleaning supply companies
- Educational toy/material suppliers
- Uniform suppliers
- Maintenance contractors
- Utility companies
- Insurance providers

**Features:**
1. Supplier database with contact and banking details
2. Supplier bills (invoices from suppliers)
3. Bill payment tracking
4. Link bank transactions to suppliers
5. Accounts payable summary

**Accounting Impact:**
- Creates Accounts Payable entries
- Tracks expense by supplier
- Enables supplier statements and payment planning
</context>

<scope>
  <in_scope>
    - Supplier model with bank details
    - SupplierBill and SupplierBillLine models
    - SupplierBillPayment for tracking payments
    - Database migrations
    - SupplierService with CRUD operations
    - Bill creation with VAT calculation
    - Payment recording with balance updates
    - Payables summary report
    - Unit tests
  </in_scope>
  <out_of_scope>
    - API endpoints (TASK-ACCT-033)
    - Frontend UI (TASK-ACCT-043)
    - Purchase orders (future enhancement)
    - Supplier portal (not needed for creches)
    - Automatic bill payment scheduling
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_suppliers

# 2. Build must pass
cd apps/api && pnpm run build

# 3. Run unit tests
pnpm test -- --testPathPattern="supplier" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] Supplier model added to Prisma schema
  - [ ] SupplierBill and SupplierBillLine models added
  - [ ] SupplierBillPayment model added
  - [ ] Migration created and applied
  - [ ] SupplierService with createSupplier, createBill, recordBillPayment
  - [ ] getPayablesSummary for dashboard
  - [ ] VAT calculation on bill lines
  - [ ] Balance tracking on bills
  - [ ] Audit logging
  - [ ] Unit tests (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** allow overpayment on bills
  - **NEVER** modify paid bills without void/credit note
  - **NEVER** store unmasked bank account numbers in logs
  - **NEVER** delete suppliers with linked bills
</anti_patterns>

</task_spec>

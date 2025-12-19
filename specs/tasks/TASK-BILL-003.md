<task_spec id="TASK-BILL-003" version="1.0">

<metadata>
  <title>Invoice and Invoice Line Entities</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>10</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-004</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
    <requirement_ref>REQ-BILL-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Invoice and InvoiceLine entities which handle billing for
school fees. Invoices track the billing period, amounts, status, and delivery
information, with synchronization to Xero. Invoice lines contain individual
line items with VAT calculations. The system supports multiple delivery methods
(email, WhatsApp) and tracks invoice lifecycle from draft to paid.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Invoice</file>
  <file purpose="schema_definition">specs/technical/data-models.md#InvoiceLine</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-001 completed</check>
  <check>Parent and Child entities exist</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Invoice Prisma model
    - Create InvoiceLine Prisma model
    - Create InvoiceStatus enum (DRAFT, SENT, VIEWED, PARTIALLY_PAID, PAID, OVERDUE, VOID)
    - Create DeliveryStatus enum (PENDING, SENT, DELIVERED, OPENED, FAILED)
    - Create LineType enum (MONTHLY_FEE, REGISTRATION, EXTRA, DISCOUNT, CREDIT)
    - Create database migrations for invoices and invoice_lines tables
    - Create TypeScript interfaces for Invoice and InvoiceLine
    - Create DTOs for Invoice and InvoiceLine operations
    - Create Invoice and InvoiceLine repositories
  </in_scope>
  <out_of_scope>
    - Payment entity (TASK-PAY-001)
    - Business logic for invoice generation
    - Business logic for invoice delivery
    - Invoice PDF generation
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model Invoice {
        id                  String   @id @default(uuid())
        tenantId            String
        tenant              Tenant   @relation(fields: [tenantId], references: [id])
        xeroInvoiceId       String?  @unique
        invoiceNumber       String
        parentId            String
        parent              Parent   @relation(fields: [parentId], references: [id])
        childId             String
        child               Child    @relation(fields: [childId], references: [id])
        billingPeriodStart  DateTime @db.Date
        billingPeriodEnd    DateTime @db.Date
        issueDate           DateTime @db.Date
        dueDate             DateTime @db.Date
        subtotalCents       Int
        vatCents            Int      @default(0)
        totalCents          Int
        amountPaidCents     Int      @default(0)
        status              InvoiceStatus @default(DRAFT)
        deliveryMethod      DeliveryMethod?
        deliveryStatus      DeliveryStatus?
        deliveredAt         DateTime?
        notes               String?
        isDeleted           Boolean  @default(false)
        createdAt           DateTime @default(now())
        updatedAt           DateTime @updatedAt

        lines               InvoiceLine[]

        @@unique([tenantId, invoiceNumber])
        @@index([tenantId, parentId])
        @@index([tenantId, status])
        @@index([tenantId, dueDate])
        @@index([xeroInvoiceId])
        @@map("invoices")
      }

      model InvoiceLine {
        id              String   @id @default(uuid())
        invoiceId       String
        invoice         Invoice  @relation(fields: [invoiceId], references: [id])
        description     String
        quantity        Decimal  @default(1) @db.Decimal(10, 2)
        unitPriceCents  Int
        discountCents   Int      @default(0)
        subtotalCents   Int
        vatCents        Int      @default(0)
        totalCents      Int
        lineType        LineType
        accountCode     String?
        sortOrder       Int      @default(0)
        createdAt       DateTime @default(now())

        @@index([invoiceId, sortOrder])
        @@map("invoice_lines")
      }

      enum InvoiceStatus {
        DRAFT
        SENT
        VIEWED
        PARTIALLY_PAID
        PAID
        OVERDUE
        VOID
      }

      enum DeliveryMethod {
        EMAIL
        WHATSAPP
        BOTH
      }

      enum DeliveryStatus {
        PENDING
        SENT
        DELIVERED
        OPENED
        FAILED
      }

      enum LineType {
        MONTHLY_FEE
        REGISTRATION
        EXTRA
        DISCOUNT
        CREDIT
      }
    </signature>
    <signature file="src/database/entities/invoice.entity.ts">
      export enum InvoiceStatus {
        DRAFT = 'DRAFT',
        SENT = 'SENT',
        VIEWED = 'VIEWED',
        PARTIALLY_PAID = 'PARTIALLY_PAID',
        PAID = 'PAID',
        OVERDUE = 'OVERDUE',
        VOID = 'VOID'
      }

      export enum DeliveryMethod {
        EMAIL = 'EMAIL',
        WHATSAPP = 'WHATSAPP',
        BOTH = 'BOTH'
      }

      export enum DeliveryStatus {
        PENDING = 'PENDING',
        SENT = 'SENT',
        DELIVERED = 'DELIVERED',
        OPENED = 'OPENED',
        FAILED = 'FAILED'
      }

      export interface IInvoice {
        id: string;
        tenantId: string;
        xeroInvoiceId: string | null;
        invoiceNumber: string;
        parentId: string;
        childId: string;
        billingPeriodStart: Date;
        billingPeriodEnd: Date;
        issueDate: Date;
        dueDate: Date;
        subtotalCents: number;
        vatCents: number;
        totalCents: number;
        amountPaidCents: number;
        status: InvoiceStatus;
        deliveryMethod: DeliveryMethod | null;
        deliveryStatus: DeliveryStatus | null;
        deliveredAt: Date | null;
        notes: string | null;
        isDeleted: boolean;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/entities/invoice-line.entity.ts">
      export enum LineType {
        MONTHLY_FEE = 'MONTHLY_FEE',
        REGISTRATION = 'REGISTRATION',
        EXTRA = 'EXTRA',
        DISCOUNT = 'DISCOUNT',
        CREDIT = 'CREDIT'
      }

      export interface IInvoiceLine {
        id: string;
        invoiceId: string;
        description: string;
        quantity: number;
        unitPriceCents: number;
        discountCents: number;
        subtotalCents: number;
        vatCents: number;
        totalCents: number;
        lineType: LineType;
        accountCode: string | null;
        sortOrder: number;
        createdAt: Date;
      }
    </signature>
    <signature file="src/database/dto/invoice.dto.ts">
      export class CreateInvoiceDto {...}
      export class UpdateInvoiceDto {...}
    </signature>
    <signature file="src/database/dto/invoice-line.dto.ts">
      export class CreateInvoiceLineDto {...}
      export class UpdateInvoiceLineDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - invoiceNumber must be unique per tenant
    - xeroInvoiceId must be unique when not null
    - Invoice must have valid parentId and childId foreign keys
    - InvoiceLine must have valid invoiceId foreign key
    - All amount fields (cents) must be non-negative
    - Date fields must be date only (no time)
    - deliveryMethod must match PreferredContact values for consistency
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum InvoiceStatus { DRAFT, SENT, VIEWED, PARTIALLY_PAID, PAID, OVERDUE, VOID }
    enum DeliveryMethod { EMAIL, WHATSAPP, BOTH }
    enum DeliveryStatus { PENDING, SENT, DELIVERED, OPENED, FAILED }
    enum LineType { MONTHLY_FEE, REGISTRATION, EXTRA, DISCOUNT, CREDIT }

  Add model Invoice with all fields per technical spec:
    - id, tenantId (FK to Tenant), xeroInvoiceId (unique, nullable)
    - invoiceNumber (String), parentId (FK to Parent), childId (FK to Child)
    - billingPeriodStart (@db.Date), billingPeriodEnd (@db.Date)
    - issueDate (@db.Date), dueDate (@db.Date)
    - subtotalCents (Int), vatCents (Int default 0), totalCents (Int)
    - amountPaidCents (Int default 0)
    - status (enum, default DRAFT)
    - deliveryMethod (enum, nullable), deliveryStatus (enum, nullable)
    - deliveredAt (DateTime, nullable), notes, isDeleted (Boolean default false)
    - createdAt, updatedAt
    - Relation: lines (InvoiceLine[])
    - Use @map("invoices") for snake_case table name
    - Unique constraint on [tenantId, invoiceNumber]
    - Index on [tenantId, parentId]
    - Index on [tenantId, status]
    - Index on [tenantId, dueDate]
    - Index on [xeroInvoiceId]

  Add model InvoiceLine with all fields per technical spec:
    - id, invoiceId (FK to Invoice)
    - description (String), quantity (Decimal(10,2) default 1)
    - unitPriceCents (Int), discountCents (Int default 0)
    - subtotalCents (Int), vatCents (Int default 0), totalCents (Int)
    - lineType (enum), accountCode (String, nullable)
    - sortOrder (Int default 0), createdAt
    - Use @map("invoice_lines") for snake_case table name
    - Index on [invoiceId, sortOrder]

  Update Tenant model:
    - Add relation: invoices (Invoice[])

  Update Parent model:
    - Add relation: invoices (Invoice[])

  Update Child model:
    - Add relation: invoices (Invoice[])

Invoice Entity Interface (src/database/entities/invoice.entity.ts):
  export enum InvoiceStatus:
    DRAFT = 'DRAFT'
    SENT = 'SENT'
    VIEWED = 'VIEWED'
    PARTIALLY_PAID = 'PARTIALLY_PAID'
    PAID = 'PAID'
    OVERDUE = 'OVERDUE'
    VOID = 'VOID'

  export enum DeliveryMethod:
    EMAIL = 'EMAIL'
    WHATSAPP = 'WHATSAPP'
    BOTH = 'BOTH'

  export enum DeliveryStatus:
    PENDING = 'PENDING'
    SENT = 'SENT'
    DELIVERED = 'DELIVERED'
    OPENED = 'OPENED'
    FAILED = 'FAILED'

  export interface IInvoice:
    // All fields with proper types

InvoiceLine Entity Interface (src/database/entities/invoice-line.entity.ts):
  export enum LineType:
    MONTHLY_FEE = 'MONTHLY_FEE'
    REGISTRATION = 'REGISTRATION'
    EXTRA = 'EXTRA'
    DISCOUNT = 'DISCOUNT'
    CREDIT = 'CREDIT'

  export interface IInvoiceLine:
    // All fields with proper types

Invoice DTOs (src/database/dto/invoice.dto.ts):
  export class CreateInvoiceDto:
    @IsString() @MinLength(1) invoiceNumber: string
    @IsUUID() parentId: string
    @IsUUID() childId: string
    @IsDate() billingPeriodStart: Date
    @IsDate() billingPeriodEnd: Date
    @IsDate() issueDate: Date
    @IsDate() dueDate: Date
    @IsInt() @Min(0) subtotalCents: number
    @IsInt() @Min(0) vatCents: number
    @IsInt() @Min(0) totalCents: number
    @IsEnum(InvoiceStatus) status: InvoiceStatus
    @IsOptional() @IsEnum(DeliveryMethod) deliveryMethod?: DeliveryMethod
    @IsOptional() @IsString() notes?: string

  export class UpdateInvoiceDto:
    // All fields optional except tenantId validation

InvoiceLine DTOs (src/database/dto/invoice-line.dto.ts):
  export class CreateInvoiceLineDto:
    @IsUUID() invoiceId: string
    @IsString() @MinLength(1) description: string
    @IsNumber() @Min(0) quantity: number
    @IsInt() @Min(0) unitPriceCents: number
    @IsInt() @Min(0) discountCents: number
    @IsInt() @Min(0) subtotalCents: number
    @IsInt() @Min(0) vatCents: number
    @IsInt() @Min(0) totalCents: number
    @IsEnum(LineType) lineType: LineType
    @IsOptional() @IsString() accountCode?: string
    @IsInt() @Min(0) sortOrder: number

  export class UpdateInvoiceLineDto:
    // All fields optional except invoiceId validation

Invoice Repository (src/database/repositories/invoice.repository.ts):
  @Injectable()
  export class InvoiceRepository:
    constructor(private prisma: PrismaService)

    async create(tenantId: string, dto: CreateInvoiceDto): Promise<Invoice>
    async findById(tenantId: string, id: string): Promise<Invoice | null>
    async findByInvoiceNumber(tenantId: string, invoiceNumber: string): Promise<Invoice | null>
    async findByParentId(tenantId: string, parentId: string): Promise<Invoice[]>
    async findByStatus(tenantId: string, status: InvoiceStatus): Promise<Invoice[]>
    async findOverdue(tenantId: string): Promise<Invoice[]>
    async update(tenantId: string, id: string, dto: UpdateInvoiceDto): Promise<Invoice>
    async delete(tenantId: string, id: string): Promise<void>

InvoiceLine Repository (src/database/repositories/invoice-line.repository.ts):
  @Injectable()
  export class InvoiceLineRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreateInvoiceLineDto): Promise<InvoiceLine>
    async findByInvoiceId(invoiceId: string): Promise<InvoiceLine[]>
    async update(id: string, dto: UpdateInvoiceLineDto): Promise<InvoiceLine>
    async delete(id: string): Promise<void>

Migration:
  npx prisma migrate dev --name create_invoices_and_invoice_lines
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/invoice.entity.ts">Invoice interface and enums (InvoiceStatus, DeliveryMethod, DeliveryStatus)</file>
  <file path="src/database/entities/invoice-line.entity.ts">InvoiceLine interface and LineType enum</file>
  <file path="src/database/dto/invoice.dto.ts">Create and Update DTOs for Invoice with validation</file>
  <file path="src/database/dto/invoice-line.dto.ts">Create and Update DTOs for InvoiceLine with validation</file>
  <file path="src/database/repositories/invoice.repository.ts">Invoice repository</file>
  <file path="src/database/repositories/invoice-line.repository.ts">InvoiceLine repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_invoices_and_invoice_lines/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/invoice.repository.spec.ts">Invoice repository tests</file>
  <file path="tests/database/repositories/invoice-line.repository.spec.ts">InvoiceLine repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Invoice and InvoiceLine models with enums</file>
  <file path="src/database/entities/index.ts">Export Invoice and InvoiceLine entities</file>
  <file path="src/database/dto/index.ts">Export Invoice and InvoiceLine DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates invoices and invoice_lines tables with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Invoice and InvoiceLine entities match technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on tenantId + invoiceNumber works</criterion>
  <criterion>Foreign key constraints work (Invoice to Parent/Child, InvoiceLine to Invoice, both to Tenant)</criterion>
  <criterion>InvoiceStatus, DeliveryMethod, DeliveryStatus, and LineType enums work correctly</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>Date fields stored as date only (no time component)</criterion>
  <criterion>InvoiceLines ordered by sortOrder correctly</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_invoices_and_invoice_lines</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "InvoiceRepository"</command>
  <command>npm run test -- --grep "InvoiceLineRepository"</command>
</test_commands>

</task_spec>

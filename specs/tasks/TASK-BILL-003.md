<task_spec id="TASK-BILL-003" version="2.0">

<metadata>
  <title>Invoice and Invoice Line Entities</title>
  <status>complete</status>
  <layer>foundation</layer>
  <sequence>10</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-004</requirement_ref>
    <requirement_ref>REQ-BILL-008</requirement_ref>
    <requirement_ref>REQ-BILL-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-001</task_ref>
    <task_ref status="complete">TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL INSTRUCTIONS FOR AI AGENT -->
<!-- ============================================ -->

<critical_instructions>
  <rule priority="1">NO BACKWARDS COMPATIBILITY - fail fast for debugging</rule>
  <rule priority="2">NO WORKAROUNDS OR FALLBACKS - if something fails, ERROR OUT with robust logging</rule>
  <rule priority="3">NO MOCK DATA IN TESTS - use real PostgreSQL database for integration tests</rule>
  <rule priority="4">LOG THEN THROW - always log errors with full context before throwing</rule>
  <rule priority="5">Tests must FAIL if project is broken - never pass falsely</rule>
  <rule priority="6">Follow constitution.md error_handling rules exactly</rule>
</critical_instructions>

<!-- ============================================ -->
<!-- CURRENT PROJECT STATE (as of 2025-12-20) -->
<!-- ============================================ -->

<project_state>
  <completed_tasks>
    <task id="TASK-CORE-001">Project Setup and Base Configuration</task>
    <task id="TASK-CORE-002">Tenant Entity and Migration</task>
    <task id="TASK-CORE-003">User Entity and Authentication Types</task>
    <task id="TASK-CORE-004">Audit Log Entity and Trail System</task>
    <task id="TASK-TRANS-001">Transaction Entity and Migration</task>
    <task id="TASK-TRANS-002">Categorization Entity and Types</task>
    <task id="TASK-TRANS-003">Payee Pattern Entity</task>
    <task id="TASK-BILL-001">Parent and Child Entities</task>
    <task id="TASK-BILL-002">Fee Structure and Enrollment Entities</task>
  </completed_tasks>

  <current_test_count>378 passing tests</current_test_count>
  <test_command>npx jest --runInBand</test_command>

  <existing_enums_in_schema>
    TaxStatus, SubscriptionStatus, UserRole, AuditAction, ImportSource,
    TransactionStatus, VatType, CategorizationSource, Gender, PreferredContact,
    FeeType, EnrollmentStatus
  </existing_enums_in_schema>

  <existing_models_in_schema>
    Tenant, User, AuditLog, Transaction, Categorization, PayeePattern,
    FeeStructure, Enrollment, Parent, Child
  </existing_models_in_schema>
</project_state>

<!-- ============================================ -->
<!-- LESSONS LEARNED FROM PREVIOUS TASKS -->
<!-- ============================================ -->

<lessons_learned>
  <lesson id="1" severity="critical">
    <title>Test Cleanup Order - FK Dependencies</title>
    <problem>Foreign key constraint violations during test cleanup</problem>
    <solution>Delete in FK order - leaf tables first. The EXACT order is:
      1. Invoice (new - has FK to InvoiceLine via cascade)
      2. InvoiceLine (new - leaf table)
      3. Enrollment
      4. FeeStructure
      5. Child
      6. Parent
      7. PayeePattern
      8. Categorization
      9. Transaction
      10. User
      11. Tenant
    </solution>
    <code_pattern>
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
    </code_pattern>
  </lesson>

  <lesson id="2" severity="critical">
    <title>Date-Only Fields (@db.Date) Comparison</title>
    <problem>Test failed comparing timestamps on date-only fields (difference was 10662797ms instead of &lt;5000ms)</problem>
    <solution>Date-only fields strip time to 00:00:00 UTC. Compare year/month/day, not milliseconds.</solution>
    <code_pattern>
// WRONG - fails on @db.Date fields:
expect(Math.abs(now.getTime() - dateField.getTime())).toBeLessThan(5000);

// CORRECT - compare date components:
expect(dateField.getFullYear()).toBe(now.getFullYear());
expect(dateField.getMonth()).toBe(now.getMonth());
expect(dateField.getDate()).toBe(now.getDate());
    </code_pattern>
  </lesson>

  <lesson id="3" severity="critical">
    <title>Prisma Client Regeneration</title>
    <problem>Build failed with "Module '@prisma/client' has no exported member 'Invoice'"</problem>
    <solution>After schema changes, MUST run: pnpm prisma generate</solution>
  </lesson>

  <lesson id="4" severity="high">
    <title>Test Race Conditions</title>
    <problem>Tests failed intermittently due to shared database state</problem>
    <solution>Always run tests with --runInBand flag: npx jest --runInBand</solution>
  </lesson>

  <lesson id="5" severity="high">
    <title>Error Handling Pattern</title>
    <problem>Constitution requires log-then-throw pattern</problem>
    <solution>Always log with context before throwing. Use existing exception classes.</solution>
    <code_pattern>
// From constitution.md error_handling:
try {
  // operation
} catch (error) {
  this.logger.error(
    `Failed to [operation]: ${JSON.stringify(dto)}`,
    error instanceof Error ? error.stack : String(error),
  );

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      throw new NotFoundException('Entity', id);
    }
  }
  throw new DatabaseException('operation', 'Failed to...', error instanceof Error ? error : undefined);
}
    </code_pattern>
  </lesson>

  <lesson id="6" severity="medium">
    <title>Decimal Fields in Prisma</title>
    <problem>Prisma returns Decimal as Prisma.Decimal, not number</problem>
    <solution>Use @db.Decimal(precision, scale) and handle conversion in TypeScript interface as number</solution>
  </lesson>
</lessons_learned>

<!-- ============================================ -->
<!-- CONTEXT -->
<!-- ============================================ -->

<context>
This task creates Invoice and InvoiceLine entities for billing school fees. Invoices track:
- Billing period, amounts, VAT
- Status lifecycle (DRAFT → SENT → VIEWED → PARTIALLY_PAID → PAID/OVERDUE/VOID)
- Delivery method and status (email/WhatsApp)
- Xero synchronization

Invoice has soft delete (isDeleted flag). InvoiceLine is cascade deleted with Invoice.

South African context:
- Currency: ZAR (stored as cents)
- VAT rate: 15%
- All amounts stored as integers (cents) per constitution.md
</context>

<!-- ============================================ -->
<!-- EXACT FILES TO CREATE -->
<!-- ============================================ -->

<files_to_create>
  <file path="src/database/entities/invoice.entity.ts">
    <description>Invoice interface and enums (InvoiceStatus, DeliveryMethod, DeliveryStatus)</description>
    <pattern>Follow src/database/entities/fee-structure.entity.ts pattern exactly</pattern>
  </file>

  <file path="src/database/entities/invoice-line.entity.ts">
    <description>InvoiceLine interface and LineType enum</description>
    <pattern>Follow src/database/entities/fee-structure.entity.ts pattern exactly</pattern>
  </file>

  <file path="src/database/dto/invoice.dto.ts">
    <description>CreateInvoiceDto, UpdateInvoiceDto, InvoiceFilterDto with class-validator decorators</description>
    <pattern>Follow src/database/dto/fee-structure.dto.ts pattern exactly</pattern>
  </file>

  <file path="src/database/dto/invoice-line.dto.ts">
    <description>CreateInvoiceLineDto, UpdateInvoiceLineDto with class-validator decorators</description>
    <pattern>Follow src/database/dto/fee-structure.dto.ts pattern exactly</pattern>
  </file>

  <file path="src/database/repositories/invoice.repository.ts">
    <description>Invoice repository with CRUD + findOverdue + softDelete methods</description>
    <pattern>Follow src/database/repositories/fee-structure.repository.ts pattern exactly</pattern>
  </file>

  <file path="src/database/repositories/invoice-line.repository.ts">
    <description>InvoiceLine repository with CRUD + batch operations</description>
    <pattern>Follow src/database/repositories/fee-structure.repository.ts pattern exactly</pattern>
  </file>

  <file path="tests/database/repositories/invoice.repository.spec.ts">
    <description>Invoice repository integration tests</description>
    <pattern>Follow tests/database/repositories/fee-structure.repository.spec.ts pattern exactly</pattern>
  </file>

  <file path="tests/database/repositories/invoice-line.repository.spec.ts">
    <description>InvoiceLine repository integration tests</description>
    <pattern>Follow tests/database/repositories/fee-structure.repository.spec.ts pattern exactly</pattern>
  </file>
</files_to_create>

<!-- ============================================ -->
<!-- EXACT FILES TO MODIFY -->
<!-- ============================================ -->

<files_to_modify>
  <file path="prisma/schema.prisma">
    <action>Add 4 new enums (InvoiceStatus, DeliveryMethod, DeliveryStatus, LineType)</action>
    <action>Add Invoice model with relations to Tenant, Parent, Child, InvoiceLine</action>
    <action>Add InvoiceLine model with relation to Invoice (cascade delete)</action>
    <action>Update Tenant, Parent, Child models to add Invoice[] relation</action>
    <location>Add enums after EnrollmentStatus (line ~96)</location>
    <location>Add models after Child model (after line ~352)</location>
  </file>

  <file path="src/database/entities/index.ts">
    <action>Add exports for invoice.entity and invoice-line.entity</action>
    <current_content>
export * from './tenant.entity';
export * from './user.entity';
export * from './audit-log.entity';
export * from './transaction.entity';
export * from './categorization.entity';
export * from './payee-pattern.entity';
export * from './parent.entity';
export * from './child.entity';
export * from './fee-structure.entity';
export * from './enrollment.entity';
    </current_content>
    <add_lines>
export * from './invoice.entity';
export * from './invoice-line.entity';
    </add_lines>
  </file>

  <file path="src/database/dto/index.ts">
    <action>Add exports for invoice.dto and invoice-line.dto</action>
    <current_content>
export * from './tenant.dto';
export * from './user.dto';
export * from './audit-log.dto';
export * from './transaction.dto';
export * from './categorization.dto';
export * from './payee-pattern.dto';
export * from './parent.dto';
export * from './child.dto';
export * from './fee-structure.dto';
export * from './enrollment.dto';
    </current_content>
    <add_lines>
export * from './invoice.dto';
export * from './invoice-line.dto';
    </add_lines>
  </file>

  <file path="tests/database/repositories/*.spec.ts">
    <action>Update ALL 10 existing test files to add invoice and invoiceLine cleanup</action>
    <files>
      tenant.repository.spec.ts
      user.repository.spec.ts
      transaction.repository.spec.ts
      categorization.repository.spec.ts
      payee-pattern.repository.spec.ts
      parent.repository.spec.ts
      child.repository.spec.ts
      fee-structure.repository.spec.ts
      enrollment.repository.spec.ts
    </files>
    <cleanup_order>
      await prisma.invoiceLine.deleteMany({});
      await prisma.invoice.deleteMany({});
      await prisma.enrollment.deleteMany({});
      await prisma.feeStructure.deleteMany({});
      await prisma.child.deleteMany({});
      await prisma.parent.deleteMany({});
      await prisma.payeePattern.deleteMany({});
      await prisma.categorization.deleteMany({});
      await prisma.transaction.deleteMany({});
      await prisma.user.deleteMany({});
      await prisma.tenant.deleteMany({});
    </cleanup_order>
  </file>
</files_to_modify>

<!-- ============================================ -->
<!-- PRISMA SCHEMA ADDITIONS -->
<!-- ============================================ -->

<prisma_schema_additions>
  <enums>
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
  </enums>

  <models>
model Invoice {
  id                 String          @id @default(uuid())
  tenantId           String          @map("tenant_id")
  xeroInvoiceId      String?         @unique @map("xero_invoice_id")
  invoiceNumber      String          @map("invoice_number") @db.VarChar(50)
  parentId           String          @map("parent_id")
  childId            String          @map("child_id")
  billingPeriodStart DateTime        @map("billing_period_start") @db.Date
  billingPeriodEnd   DateTime        @map("billing_period_end") @db.Date
  issueDate          DateTime        @map("issue_date") @db.Date
  dueDate            DateTime        @map("due_date") @db.Date
  subtotalCents      Int             @map("subtotal_cents")
  vatCents           Int             @default(0) @map("vat_cents")
  totalCents         Int             @map("total_cents")
  amountPaidCents    Int             @default(0) @map("amount_paid_cents")
  status             InvoiceStatus   @default(DRAFT)
  deliveryMethod     DeliveryMethod? @map("delivery_method")
  deliveryStatus     DeliveryStatus? @map("delivery_status")
  deliveredAt        DateTime?       @map("delivered_at")
  notes              String?
  isDeleted          Boolean         @default(false) @map("is_deleted")
  createdAt          DateTime        @default(now()) @map("created_at")
  updatedAt          DateTime        @updatedAt @map("updated_at")

  tenant  Tenant        @relation(fields: [tenantId], references: [id])
  parent  Parent        @relation(fields: [parentId], references: [id])
  child   Child         @relation(fields: [childId], references: [id])
  lines   InvoiceLine[]

  @@unique([tenantId, invoiceNumber])
  @@index([tenantId, parentId])
  @@index([tenantId, status])
  @@index([tenantId, dueDate])
  @@index([xeroInvoiceId])
  @@map("invoices")
}

model InvoiceLine {
  id             String   @id @default(uuid())
  invoiceId      String   @map("invoice_id")
  description    String   @db.VarChar(500)
  quantity       Decimal  @default(1) @db.Decimal(10, 2)
  unitPriceCents Int      @map("unit_price_cents")
  discountCents  Int      @default(0) @map("discount_cents")
  subtotalCents  Int      @map("subtotal_cents")
  vatCents       Int      @default(0) @map("vat_cents")
  totalCents     Int      @map("total_cents")
  lineType       LineType @map("line_type")
  accountCode    String?  @map("account_code") @db.VarChar(20)
  sortOrder      Int      @default(0) @map("sort_order")
  createdAt      DateTime @default(now()) @map("created_at")

  invoice Invoice @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId, sortOrder])
  @@map("invoice_lines")
}
  </models>

  <model_updates>
    <update model="Tenant">Add: invoices Invoice[]</update>
    <update model="Parent">Add: invoices Invoice[]</update>
    <update model="Child">Add: invoices Invoice[]</update>
  </model_updates>
</prisma_schema_additions>

<!-- ============================================ -->
<!-- ENTITY INTERFACES -->
<!-- ============================================ -->

<entity_interfaces>
  <file path="src/database/entities/invoice.entity.ts">
/**
 * Invoice Entity
 * Tracks billing for childcare services with Xero integration
 */

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum DeliveryMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  FAILED = 'FAILED',
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
  </file>

  <file path="src/database/entities/invoice-line.entity.ts">
/**
 * Invoice Line Entity
 * Individual line items on an invoice
 */

export enum LineType {
  MONTHLY_FEE = 'MONTHLY_FEE',
  REGISTRATION = 'REGISTRATION',
  EXTRA = 'EXTRA',
  DISCOUNT = 'DISCOUNT',
  CREDIT = 'CREDIT',
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
  </file>
</entity_interfaces>

<!-- ============================================ -->
<!-- DTO PATTERNS -->
<!-- ============================================ -->

<dto_patterns>
  <imports>
import {
  IsUUID,
  IsString,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsDate,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
  </imports>

  <create_dto_pattern>
export class CreateInvoiceDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  invoiceNumber!: string;

  @IsUUID()
  parentId!: string;

  @IsUUID()
  childId!: string;

  @Type(() => Date)
  @IsDate()
  billingPeriodStart!: Date;

  @Type(() => Date)
  @IsDate()
  billingPeriodEnd!: Date;

  @Type(() => Date)
  @IsDate()
  issueDate!: Date;

  @Type(() => Date)
  @IsDate()
  dueDate!: Date;

  @IsInt()
  @Min(0)
  subtotalCents!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  vatCents?: number;

  @IsInt()
  @Min(0)
  totalCents!: number;

  @IsOptional()
  @IsEnum(DeliveryMethod)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateInvoiceDto extends PartialType(CreateInvoiceDto) {}

export class InvoiceFilterDto {
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @IsOptional()
  @IsUUID()
  childId?: string;

  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsBoolean()
  isDeleted?: boolean;
}
  </create_dto_pattern>
</dto_patterns>

<!-- ============================================ -->
<!-- REPOSITORY PATTERN -->
<!-- ============================================ -->

<repository_pattern>
  <structure>
@Injectable()
export class InvoiceRepository {
  private readonly logger = new Logger(InvoiceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // Required methods:
  async create(dto: CreateInvoiceDto): Promise&lt;Invoice&gt;
  async findById(id: string): Promise&lt;Invoice | null&gt;
  async findByTenant(tenantId: string, filter: InvoiceFilterDto): Promise&lt;Invoice[]&gt;
  async findByInvoiceNumber(tenantId: string, invoiceNumber: string): Promise&lt;Invoice | null&gt;
  async findByParent(tenantId: string, parentId: string): Promise&lt;Invoice[]&gt;
  async findByChild(tenantId: string, childId: string): Promise&lt;Invoice[]&gt;
  async findByStatus(tenantId: string, status: InvoiceStatus): Promise&lt;Invoice[]&gt;
  async findOverdue(tenantId: string): Promise&lt;Invoice[]&gt;
  async update(id: string, dto: UpdateInvoiceDto): Promise&lt;Invoice&gt;
  async softDelete(id: string): Promise&lt;Invoice&gt;
  async delete(id: string): Promise&lt;void&gt;
  </structure>

  <error_handling>
// MUST follow this pattern from constitution.md:
try {
  return await this.prisma.invoice.create({ data: {...} });
} catch (error) {
  this.logger.error(
    `Failed to create invoice: ${JSON.stringify(dto)}`,
    error instanceof Error ? error.stack : String(error),
  );

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      throw new ConflictException('Invoice', 'invoiceNumber', dto.invoiceNumber);
    }
    if (error.code === 'P2003') {
      const field = error.meta?.field_name as string | undefined;
      if (field?.includes('parent')) {
        throw new NotFoundException('Parent', dto.parentId);
      }
      if (field?.includes('child')) {
        throw new NotFoundException('Child', dto.childId);
      }
      throw new NotFoundException('Tenant', dto.tenantId);
    }
  }
  throw new DatabaseException(
    'create',
    'Failed to create invoice',
    error instanceof Error ? error : undefined,
  );
}
  </error_handling>
</repository_pattern>

<!-- ============================================ -->
<!-- TEST PATTERN -->
<!-- ============================================ -->

<test_pattern>
  <structure>
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { CreateInvoiceDto } from '../../../src/database/dto/invoice.dto';
import { InvoiceStatus, DeliveryMethod } from '../../../src/database/entities/invoice.entity';
import { NotFoundException, ConflictException } from '../../../src/shared/exceptions';
import { Tenant, Parent, Child } from '@prisma/client';

describe('InvoiceRepository', () => {
  let repository: InvoiceRepository;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, InvoiceRepository],
    }).compile();

    prisma = module.get&lt;PrismaService&gt;(PrismaService);
    repository = module.get&lt;InvoiceRepository&gt;(InvoiceRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});

    // Create test fixtures (real data, not mocks)
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Little Stars Creche',
        addressLine1: '123 Main Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `test${Date.now()}@littlestars.co.za`,
      },
    });

    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Thabo',
        lastName: 'Mbeki',
        email: 'thabo@family.co.za',
        phone: '+27821234567',
      },
    });

    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Lerato',
        lastName: 'Mbeki',
        dateOfBirth: new Date('2021-03-15'),
      },
    });
  });

  // Tests follow...
});
  </structure>

  <date_comparison>
// For @db.Date fields (date-only), compare components not timestamps:
expect(invoice.billingPeriodStart.getFullYear()).toBe(2025);
expect(invoice.billingPeriodStart.getMonth()).toBe(0); // January = 0
expect(invoice.billingPeriodStart.getDate()).toBe(1);
  </date_comparison>
</test_pattern>

<!-- ============================================ -->
<!-- EXECUTION STEPS -->
<!-- ============================================ -->

<execution_steps>
  <step order="1">
    <action>Update prisma/schema.prisma</action>
    <details>Add enums (InvoiceStatus, DeliveryMethod, DeliveryStatus, LineType), Invoice model, InvoiceLine model, update Tenant/Parent/Child relations</details>
  </step>

  <step order="2">
    <action>Generate migration</action>
    <command>pnpm prisma migrate dev --name create_invoices_and_invoice_lines</command>
  </step>

  <step order="3">
    <action>Regenerate Prisma client</action>
    <command>pnpm prisma generate</command>
  </step>

  <step order="4">
    <action>Create entity interfaces</action>
    <files>src/database/entities/invoice.entity.ts, src/database/entities/invoice-line.entity.ts</files>
  </step>

  <step order="5">
    <action>Update entity index</action>
    <file>src/database/entities/index.ts</file>
  </step>

  <step order="6">
    <action>Create DTOs</action>
    <files>src/database/dto/invoice.dto.ts, src/database/dto/invoice-line.dto.ts</files>
  </step>

  <step order="7">
    <action>Update DTO index</action>
    <file>src/database/dto/index.ts</file>
  </step>

  <step order="8">
    <action>Create repositories</action>
    <files>src/database/repositories/invoice.repository.ts, src/database/repositories/invoice-line.repository.ts</files>
  </step>

  <step order="9">
    <action>Update ALL existing test files with new cleanup order</action>
    <files>All 10 files in tests/database/repositories/</files>
    <critical>Add invoiceLine and invoice to cleanup BEFORE enrollment</critical>
  </step>

  <step order="10">
    <action>Create test files</action>
    <files>tests/database/repositories/invoice.repository.spec.ts, tests/database/repositories/invoice-line.repository.spec.ts</files>
  </step>

  <step order="11">
    <action>Build and verify</action>
    <commands>
pnpm build
pnpm lint
npx jest --runInBand
    </commands>
  </step>
</execution_steps>

<!-- ============================================ -->
<!-- VERIFICATION CHECKLIST -->
<!-- ============================================ -->

<verification_checklist>
  <item>pnpm build succeeds with no errors</item>
  <item>pnpm lint succeeds with no errors</item>
  <item>All tests pass with npx jest --runInBand</item>
  <item>Migration can be reverted with pnpm prisma migrate reset</item>
  <item>Invoice unique constraint (tenantId, invoiceNumber) works</item>
  <item>InvoiceLine cascade deletes when Invoice is deleted</item>
  <item>All FK constraints enforced (Parent, Child, Tenant)</item>
  <item>Soft delete (isDeleted flag) works for Invoice</item>
  <item>findOverdue returns invoices past dueDate with status not PAID/VOID</item>
  <item>Date fields are date-only (no time component)</item>
  <item>All amount fields are integers (cents)</item>
  <item>No TypeScript 'any' types used</item>
  <item>Error handling follows log-then-throw pattern</item>
</verification_checklist>

<!-- ============================================ -->
<!-- RELATED FILES FOR REFERENCE -->
<!-- ============================================ -->

<reference_files>
  <file path="prisma/schema.prisma" purpose="Current schema to extend"/>
  <file path="src/database/entities/fee-structure.entity.ts" purpose="Entity pattern to follow"/>
  <file path="src/database/dto/fee-structure.dto.ts" purpose="DTO pattern to follow"/>
  <file path="src/database/repositories/fee-structure.repository.ts" purpose="Repository pattern to follow"/>
  <file path="src/database/repositories/enrollment.repository.ts" purpose="Repository pattern with FK validation"/>
  <file path="tests/database/repositories/fee-structure.repository.spec.ts" purpose="Test pattern to follow"/>
  <file path="tests/database/repositories/enrollment.repository.spec.ts" purpose="Test pattern with date handling"/>
  <file path="src/shared/exceptions/index.ts" purpose="Exception classes to use"/>
  <file path="specs/constitution.md" purpose="Coding standards and error handling rules"/>
</reference_files>

<!-- ============================================ -->
<!-- ANTI-PATTERNS TO AVOID -->
<!-- ============================================ -->

<anti_patterns>
  <forbidden reason="Type Safety">Do NOT use 'any' type anywhere</forbidden>
  <forbidden reason="Constitution Rule">Do NOT silently swallow errors - always log then throw</forbidden>
  <forbidden reason="Test Integrity">Do NOT use mock data - use real PostgreSQL database</forbidden>
  <forbidden reason="Test Order">Do NOT forget to add cleanup for new tables to ALL existing test files</forbidden>
  <forbidden reason="Date Handling">Do NOT compare @db.Date fields using millisecond timestamps</forbidden>
  <forbidden reason="FK Order">Do NOT clean tables in wrong order - will cause FK constraint violations</forbidden>
  <forbidden reason="Prisma">Do NOT forget to run prisma generate after schema changes</forbidden>
  <forbidden reason="Debugging">Do NOT create workarounds - fail fast with clear errors</forbidden>
</anti_patterns>

</task_spec>

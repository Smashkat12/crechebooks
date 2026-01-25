<task_spec id="TASK-ACCT-012" version="2.0">

<metadata>
  <title>Quotes System Foundation</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>foundation</layer>
  <sequence>412</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-ACCT-QUOTE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-003</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has no quote functionality. Prospective parents cannot receive
  fee estimates before enrollment. Stub provides quotes that convert to invoices.

  **Gap:**
  - No Quote model in schema
  - No quote-to-invoice conversion
  - No way to track quote acceptance
  - Missing from sales workflow

  **Files to Create:**
  - packages/database/prisma/migrations/xxx_add_quotes/migration.sql
  - apps/api/src/database/entities/quote.entity.ts
  - apps/api/src/database/repositories/quote.repository.ts
  - apps/api/src/database/services/quote.service.ts
  - apps/api/src/database/dto/quote.dto.ts

  **Files to Modify:**
  - packages/database/prisma/schema.prisma (ADD Quote, QuoteLine)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Prisma Models
  ```prisma
  // packages/database/prisma/schema.prisma

  enum QuoteStatus {
    DRAFT
    SENT
    VIEWED
    ACCEPTED
    DECLINED
    EXPIRED
    CONVERTED
  }

  model Quote {
    id              String         @id @default(cuid())
    tenantId        String
    quoteNumber     String

    // Recipient (may not be a Parent yet)
    parentId        String?        // Existing parent
    recipientName   String         // For prospects
    recipientEmail  String
    recipientPhone  String?

    // Child info (for enrollment quotes)
    childName       String?
    childDob        DateTime?
    expectedStartDate DateTime?

    // Dates
    quoteDate       DateTime       @default(now())
    expiryDate      DateTime

    // Amounts
    subtotalCents   Int
    vatAmountCents  Int            @default(0)
    totalCents      Int

    // Status
    status          QuoteStatus    @default(DRAFT)
    sentAt          DateTime?
    viewedAt        DateTime?
    acceptedAt      DateTime?
    declinedAt      DateTime?
    declineReason   String?

    // Conversion
    convertedToInvoiceId String?
    convertedAt     DateTime?

    // Content
    notes           String?        // Terms, conditions
    validityDays    Int            @default(30)

    // Audit
    createdById     String
    createdAt       DateTime       @default(now())
    updatedAt       DateTime       @updatedAt

    tenant          Tenant         @relation(fields: [tenantId], references: [id])
    parent          Parent?        @relation(fields: [parentId], references: [id])
    convertedInvoice Invoice?      @relation(fields: [convertedToInvoiceId], references: [id])
    createdBy       User           @relation(fields: [createdById], references: [id])
    lines           QuoteLine[]

    @@unique([tenantId, quoteNumber])
    @@index([tenantId, status])
    @@index([recipientEmail])
  }

  model QuoteLine {
    id              String         @id @default(cuid())
    quoteId         String
    lineNumber      Int
    description     String
    quantity        Int            @default(1)
    unitPriceCents  Int
    lineTotalCents  Int
    vatType         VatType        @default(EXEMPT) // Most creche fees are exempt

    // Link to fee structure (optional)
    feeStructureId  String?
    lineType        InvoiceLineType?

    quote           Quote          @relation(fields: [quoteId], references: [id], onDelete: Cascade)
    feeStructure    FeeStructure?  @relation(fields: [feeStructureId], references: [id])

    @@index([quoteId])
  }
  ```

  ### 3. Quote Service
  ```typescript
  // apps/api/src/database/services/quote.service.ts
  @Injectable()
  export class QuoteService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly quoteNumberService: QuoteNumberService,
      private readonly invoiceService: InvoiceService,
      private readonly auditService: AuditLogService,
      private readonly emailService: EmailService,
    ) {}

    async createQuote(
      tenantId: string,
      userId: string,
      data: CreateQuoteDto,
    ): Promise<Quote> {
      const quoteNumber = await this.quoteNumberService.getNextNumber(tenantId);

      const subtotalCents = data.lines.reduce(
        (sum, line) => sum + (line.unitPriceCents * line.quantity),
        0,
      );

      // Calculate VAT (most creche fees are exempt under Section 12(h))
      const vatAmountCents = data.lines.reduce((sum, line) => {
        if (line.vatType === 'STANDARD') {
          return sum + Math.round((line.unitPriceCents * line.quantity) * 0.15);
        }
        return sum;
      }, 0);

      const quote = await this.prisma.quote.create({
        data: {
          tenantId,
          quoteNumber,
          recipientName: data.recipientName,
          recipientEmail: data.recipientEmail,
          recipientPhone: data.recipientPhone,
          parentId: data.parentId,
          childName: data.childName,
          childDob: data.childDob,
          expectedStartDate: data.expectedStartDate,
          expiryDate: new Date(Date.now() + (data.validityDays || 30) * 24 * 60 * 60 * 1000),
          subtotalCents,
          vatAmountCents,
          totalCents: subtotalCents + vatAmountCents,
          notes: data.notes,
          validityDays: data.validityDays || 30,
          createdById: userId,
          lines: {
            create: data.lines.map((line, index) => ({
              lineNumber: index + 1,
              description: line.description,
              quantity: line.quantity || 1,
              unitPriceCents: line.unitPriceCents,
              lineTotalCents: line.unitPriceCents * (line.quantity || 1),
              vatType: line.vatType || 'EXEMPT',
              feeStructureId: line.feeStructureId,
              lineType: line.lineType,
            })),
          },
        },
        include: { lines: true },
      });

      await this.auditService.log({
        tenantId,
        userId,
        action: 'QUOTE_CREATED',
        resourceType: 'Quote',
        resourceId: quote.id,
        metadata: { quoteNumber, totalCents: quote.totalCents },
      });

      return quote;
    }

    async sendQuote(quoteId: string, userId: string): Promise<Quote> {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        include: { lines: true, tenant: true },
      });

      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.status !== 'DRAFT') {
        throw new BadRequestException('Quote has already been sent');
      }

      // Generate PDF (reuse invoice PDF template)
      const pdfBuffer = await this.generateQuotePdf(quote);

      // Send email
      await this.emailService.sendQuote({
        to: quote.recipientEmail,
        recipientName: quote.recipientName,
        quoteNumber: quote.quoteNumber,
        totalCents: quote.totalCents,
        expiryDate: quote.expiryDate,
        tenantName: quote.tenant.name,
        pdfBuffer,
      });

      return this.prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }

    async acceptQuote(quoteId: string): Promise<Quote> {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
      });

      if (!quote) throw new NotFoundException('Quote not found');
      if (!['SENT', 'VIEWED'].includes(quote.status)) {
        throw new BadRequestException(`Cannot accept quote with status ${quote.status}`);
      }
      if (quote.expiryDate < new Date()) {
        await this.prisma.quote.update({
          where: { id: quoteId },
          data: { status: 'EXPIRED' },
        });
        throw new BadRequestException('Quote has expired');
      }

      return this.prisma.quote.update({
        where: { id: quoteId },
        data: { status: 'ACCEPTED', acceptedAt: new Date() },
      });
    }

    async declineQuote(quoteId: string, reason?: string): Promise<Quote> {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
      });

      if (!quote) throw new NotFoundException('Quote not found');

      return this.prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'DECLINED',
          declinedAt: new Date(),
          declineReason: reason,
        },
      });
    }

    async convertToInvoice(quoteId: string, userId: string): Promise<Invoice> {
      const quote = await this.prisma.quote.findUnique({
        where: { id: quoteId },
        include: { lines: true, parent: true },
      });

      if (!quote) throw new NotFoundException('Quote not found');
      if (quote.status !== 'ACCEPTED') {
        throw new BadRequestException('Only accepted quotes can be converted');
      }

      // If no parent exists, create one
      let parentId = quote.parentId;
      if (!parentId) {
        const parent = await this.prisma.parent.create({
          data: {
            tenantId: quote.tenantId,
            firstName: quote.recipientName.split(' ')[0],
            lastName: quote.recipientName.split(' ').slice(1).join(' ') || '',
            email: quote.recipientEmail,
            phone: quote.recipientPhone,
          },
        });
        parentId = parent.id;
      }

      // Create invoice from quote
      const invoice = await this.invoiceService.createInvoice({
        tenantId: quote.tenantId,
        parentId,
        dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        lines: quote.lines.map(line => ({
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          vatType: line.vatType,
          lineType: line.lineType,
        })),
        notes: `Converted from Quote ${quote.quoteNumber}`,
      }, userId);

      // Update quote
      await this.prisma.quote.update({
        where: { id: quoteId },
        data: {
          status: 'CONVERTED',
          convertedToInvoiceId: invoice.id,
          convertedAt: new Date(),
          parentId, // Link parent if created
        },
      });

      await this.auditService.log({
        tenantId: quote.tenantId,
        userId,
        action: 'QUOTE_CONVERTED',
        resourceType: 'Quote',
        resourceId: quoteId,
        metadata: { invoiceId: invoice.id },
      });

      return invoice;
    }

    private async generateQuotePdf(quote: Quote & { lines: QuoteLine[]; tenant: Tenant }): Promise<Buffer> {
      // Reuse PDF generation logic from invoice service
      // Similar layout but "QUOTE" instead of "INVOICE"
      // Include expiry date prominently
    }
  }
  ```

  ### 4. Quote Number Service
  ```typescript
  // apps/api/src/database/services/quote-number.service.ts
  @Injectable()
  export class QuoteNumberService {
    constructor(private readonly prisma: PrismaService) {}

    async getNextNumber(tenantId: string): Promise<string> {
      const year = new Date().getFullYear();

      // Atomic increment similar to invoice numbers
      const result = await this.prisma.$executeRaw`
        INSERT INTO "QuoteNumberCounter" ("tenantId", "year", "lastNumber")
        VALUES (${tenantId}, ${year}, 1)
        ON CONFLICT ("tenantId", "year")
        DO UPDATE SET "lastNumber" = "QuoteNumberCounter"."lastNumber" + 1
        RETURNING "lastNumber"
      `;

      const counter = await this.prisma.quoteNumberCounter.findUnique({
        where: { tenantId_year: { tenantId, year } },
      });

      return `Q${year}-${String(counter?.lastNumber || 1).padStart(4, '0')}`;
    }
  }
  ```
</critical_patterns>

<context>
This task adds quote functionality for prospective parent inquiries.
Quotes help creches provide professional fee estimates before enrollment.

**Use Cases:**
1. Prospective parent inquires about fees → Quote sent
2. Parent accepts quote → Converts to invoice on enrollment
3. Quote declined → Reason tracked for follow-up
4. Quote expires → Auto-status update

**Creche-Specific Lines:**
- Monthly fees (VAT exempt)
- Registration fees (VAT exempt)
- Uniform estimates (VAT applicable)
- Meal plans (VAT applicable/exempt depending)
- Transport fees (VAT applicable)
- Extra-mural activities

**Workflow:**
1. Create quote with recipient details and line items
2. Send quote via email with PDF attachment
3. Recipient views/accepts/declines
4. On acceptance + enrollment, convert to invoice
</context>

<scope>
  <in_scope>
    - Quote and QuoteLine models
    - QuoteNumberCounter for sequential numbering
    - Database migrations
    - QuoteService with full lifecycle
    - Quote-to-invoice conversion
    - Email delivery with PDF
    - Audit logging
  </in_scope>
  <out_of_scope>
    - API endpoints (TASK-ACCT-032)
    - Frontend UI (TASK-ACCT-042)
    - Quote PDF template design (reuse invoice template)
    - Quote approval workflow (simple accept/decline)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate migration
cd packages/database && pnpm prisma migrate dev --name add_quotes

# 2. Build must pass
cd apps/api && pnpm run build

# 3. Run unit tests
pnpm test -- --testPathPattern="quote" --runInBand

# 4. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] Quote and QuoteLine models added to Prisma schema
  - [ ] QuoteNumberCounter for atomic numbering
  - [ ] Migration created and applied
  - [ ] QuoteService with create, send, accept, decline, convert
  - [ ] Email delivery with PDF attachment
  - [ ] Quote-to-invoice conversion
  - [ ] Parent creation on conversion (if needed)
  - [ ] Audit logging for all actions
  - [ ] Unit tests for service methods (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** convert non-accepted quotes to invoices
  - **NEVER** modify sent/accepted quotes
  - **NEVER** allow expired quote conversion
  - **NEVER** skip VAT calculation for applicable items
</anti_patterns>

</task_spec>

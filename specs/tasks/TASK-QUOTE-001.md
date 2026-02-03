<task_spec id="TASK-QUOTE-001" version="2.0">

<metadata>
  <title>Quote PDF Generation and Email Delivery</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>421</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-QUOTE-002</requirement_ref>
    <requirement_ref>REQ-ACCT-QUOTE-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-012</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/database/services/quote-pdf.service.ts` (NEW)
  - `apps/api/src/common/services/email-template/quote-email.templates.ts` (NEW)
  - `apps/api/tests/database/services/quote-pdf.service.spec.ts` (NEW)
  - `apps/api/tests/database/services/quote.service.spec.ts` (NEW - integration tests)

  **Files to Modify:**
  - `apps/api/src/database/services/quote.service.ts` (line 259 TODO)
  - `apps/api/src/common/services/email-template/email-template.service.ts` (add QUOTE_EMAIL template)
  - `apps/api/src/database/database.module.ts` (add QuotePdfService provider)
  - `apps/api/prisma/schema.prisma` (add viewToken field to Quote model)

  **Current Problem:**
  The QuoteService.sendQuote() method has a TODO at line 259:
  ```typescript
  // TODO: Generate PDF and send email
  // This would integrate with an email service
  // For now, just update the status
  ```

  Quote sending currently only updates status to SENT without:
  - Generating a Quote PDF document
  - Sending the PDF via email to recipient
  - Including a unique view token for public quote access

  **Existing Patterns to Follow:**
  - `apps/api/src/database/services/invoice-pdf.service.ts` - PDF generation using pdfkit
  - `apps/api/src/integrations/email/email.service.ts` - Mailgun/SMTP email delivery
  - `apps/api/src/common/services/email-template/email-template.service.ts` - Handlebars templates

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Quote PDF Service Pattern
  ```typescript
  // apps/api/src/database/services/quote-pdf.service.ts
  import { Injectable, Logger } from '@nestjs/common';
  import PDFDocument from 'pdfkit';
  import { PrismaService } from '../prisma/prisma.service';
  import { NotFoundException } from '../../shared/exceptions';

  interface QuoteWithRelations {
    id: string;
    quoteNumber: string;
    quoteDate: Date;
    expiryDate: Date;
    validityDays: number;
    recipientName: string;
    recipientEmail: string;
    recipientPhone: string | null;
    childName: string | null;
    expectedStartDate: Date | null;
    subtotalCents: number;
    vatAmountCents: number;
    totalCents: number;
    notes: string | null;
    tenant: {
      name: string;
      tradingName: string | null;
      vatNumber: string | null;
      registrationNumber: string | null;
      addressLine1: string;
      addressLine2: string | null;
      city: string;
      province: string;
      postalCode: string;
      phone: string;
      email: string;
      bankName: string | null;
      bankAccountHolder: string | null;
      bankAccountNumber: string | null;
      bankBranchCode: string | null;
      bankAccountType: string | null;
    };
    lines: Array<{
      lineNumber: number;
      description: string;
      quantity: number;
      unitPriceCents: number;
      lineTotalCents: number;
      vatType: string;
    }>;
  }

  @Injectable()
  export class QuotePdfService {
    private readonly logger = new Logger(QuotePdfService.name);

    constructor(private readonly prisma: PrismaService) {}

    /**
     * Generate PDF for a quote
     * @param tenantId - Tenant ID for isolation
     * @param quoteId - Quote ID
     * @returns Buffer containing PDF data
     */
    async generatePdf(tenantId: string, quoteId: string): Promise<Buffer> {
      this.logger.log(`Generating PDF for quote ${quoteId}`);

      const quote = await this.prisma.quote.findFirst({
        where: { id: quoteId, tenantId },
        include: {
          tenant: true,
          lines: { orderBy: { lineNumber: 'asc' } },
        },
      });

      if (!quote) {
        throw new NotFoundException('Quote', quoteId);
      }

      return this.createPdfDocument(quote as QuoteWithRelations);
    }

    private async createPdfDocument(quote: QuoteWithRelations): Promise<Buffer> {
      return new Promise((resolve, reject) => {
        try {
          const doc = new PDFDocument({ margin: 50, size: 'A4' });
          const chunks: Buffer[] = [];

          doc.on('data', (chunk: Buffer) => chunks.push(chunk));
          doc.on('end', () => resolve(Buffer.concat(chunks)));
          doc.on('error', reject);

          // Build PDF content following invoice pattern
          this.addHeader(doc, quote.tenant);
          this.addQuoteTitle(doc, quote);
          this.addRecipientInfo(doc, quote);
          this.addLineItemsTable(doc, quote.lines);
          this.addTotals(doc, quote);
          this.addValidityNotice(doc, quote);
          this.addBankingDetails(doc, quote.tenant);
          this.addNotes(doc, quote.notes);
          this.addFooter(doc, quote.tenant);

          doc.end();
        } catch (error) {
          reject(error);
        }
      });
    }

    private addQuoteTitle(doc: typeof PDFDocument.prototype, quote: QuoteWithRelations): void {
      doc.moveDown(1);
      doc.fontSize(24).font('Helvetica-Bold').text('QUOTE', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).font('Helvetica').text(`Quote Number: ${quote.quoteNumber}`, { align: 'center' });
      doc.fontSize(10).text(`Valid until: ${this.formatDate(quote.expiryDate)}`, { align: 'center' });
    }

    private addValidityNotice(doc: typeof PDFDocument.prototype, quote: QuoteWithRelations): void {
      doc.moveDown(1.5);
      doc.fontSize(10).font('Helvetica-Bold')
        .text(`This quote is valid for ${quote.validityDays} days from ${this.formatDate(quote.quoteDate)}.`, 50);
      doc.font('Helvetica')
        .text('Prices may be subject to change after the expiry date.', 50);
    }

    private formatDate(date: Date): string {
      return date.toLocaleDateString('en-ZA', { day: '2-digit', month: '2-digit', year: 'numeric' });
    }

    private formatCurrency(cents: number): string {
      return (cents / 100).toFixed(2);
    }

    // ... additional methods following invoice-pdf.service.ts pattern
  }
  ```

  ### 3. Quote Email Template Data
  ```typescript
  // Add to email-template.service.ts

  export interface QuoteEmailData extends BaseEmailTemplateData {
    quoteNumber: string;
    quoteDate: Date | string;
    expiryDate: Date | string;
    validityDays: number;
    childName?: string;
    expectedStartDate?: Date | string;
    subtotalCents: number;
    vatCents: number;
    totalCents: number;
    lineItems: Array<{
      description: string;
      quantity: number;
      unitPriceCents: number;
      totalCents: number;
    }>;
    /** Link to view quote online (public token-based) */
    viewQuoteUrl?: string;
    /** Link to accept quote */
    acceptQuoteUrl?: string;
    /** Link to decline quote */
    declineQuoteUrl?: string;
  }
  ```

  ### 4. Updated QuoteService.sendQuote
  ```typescript
  async sendQuote(
    tenantId: string,
    userId: string,
    quoteId: string,
  ): Promise<Quote> {
    const quote = await this.getQuoteById(tenantId, quoteId);

    if (quote.status !== 'DRAFT') {
      throw new BadRequestException('Quote has already been sent');
    }

    if (quote.lines.length === 0) {
      throw new BadRequestException('Cannot send quote without line items');
    }

    // Generate unique view token for public access
    const viewToken = crypto.randomUUID();

    // Generate PDF
    const pdfBuffer = await this.quotePdfService.generatePdf(tenantId, quoteId);

    // Build public URLs
    const baseUrl = this.configService.get('APP_URL') || 'http://localhost:3001';
    const viewQuoteUrl = `${baseUrl}/quote/${viewToken}`;
    const acceptQuoteUrl = `${baseUrl}/quote/${viewToken}/accept`;
    const declineQuoteUrl = `${baseUrl}/quote/${viewToken}/decline`;

    // Render email template
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const emailContent = this.emailTemplateService.renderQuoteEmail({
      recipientName: quote.recipientName,
      tenantName: tenant.tradingName || tenant.name,
      quoteNumber: quote.quoteNumber,
      quoteDate: quote.quoteDate,
      expiryDate: quote.expiryDate,
      validityDays: quote.validityDays,
      childName: quote.childName || undefined,
      expectedStartDate: quote.expectedStartDate || undefined,
      subtotalCents: quote.subtotalCents,
      vatCents: quote.vatAmountCents,
      totalCents: quote.totalCents,
      lineItems: quote.lines.map(line => ({
        description: line.description,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
        totalCents: line.lineTotalCents,
      })),
      viewQuoteUrl,
      acceptQuoteUrl,
      declineQuoteUrl,
      bankName: tenant.bankName || undefined,
      bankAccountHolder: tenant.bankAccountHolder || undefined,
      bankAccountNumber: tenant.bankAccountNumber || undefined,
      bankBranchCode: tenant.bankBranchCode || undefined,
      bankAccountType: tenant.bankAccountType || undefined,
      supportEmail: tenant.email,
    });

    // Send email with PDF attachment
    await this.emailService.sendEmailWithOptions({
      to: quote.recipientEmail,
      subject: emailContent.subject,
      body: emailContent.text,
      html: emailContent.html,
      attachments: [{
        filename: `Quote-${quote.quoteNumber}.pdf`,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
      tags: ['quote', 'quote-sent'],
      customVariables: {
        quoteId: quoteId,
        tenantId: tenantId,
      },
    });

    // Update quote with status and view token
    const updated = await this.prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        viewToken,
      },
    });

    await this.auditService.logUpdate({
      tenantId,
      userId,
      entityType: 'Quote',
      entityId: quoteId,
      beforeValue: { status: 'DRAFT' },
      afterValue: { status: 'SENT', sentAt: updated.sentAt?.toISOString() },
    });

    return updated;
  }
  ```

  ### 5. Schema Update for viewToken
  ```prisma
  model Quote {
    // ... existing fields ...

    // Public access token for recipient
    viewToken String? @unique @map("view_token") @db.VarChar(36)

    // ... rest of model
  }
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task completes the quote sending functionality by implementing PDF generation and email delivery.

**Business Requirements:**
1. Quote PDF must match the professional look of invoice PDFs
2. PDF prominently displays "QUOTE" (not "INVOICE") and validity period
3. Email includes PDF as attachment
4. Email includes links to view/accept/decline quote online
5. View token enables public access without authentication

**South African Context:**
- Currency: South African Rand (R / ZAR)
- Date format: DD/MM/YYYY
- VAT: 15% (most creche fees exempt under Section 12(h))
- Bank details for EFT payments

**Quote Email Content:**
- Professional greeting with recipient name
- Quote summary (number, date, total, validity)
- Line items preview
- Call-to-action buttons for accept/decline
- Banking details for deposit payments
- Attached PDF for full details

**Security Considerations:**
- viewToken is a UUID - unpredictable but not cryptographically secret
- Token grants read-only access to quote details
- Accept/decline actions require additional confirmation
</context>

<scope>
  <in_scope>
    - QuotePdfService for PDF generation using pdfkit
    - Quote email template (HTML + text)
    - Integration with EmailService for delivery
    - viewToken generation and storage
    - Public URL construction for quote access
    - PDF attachment to email
    - Unit tests for PDF service
    - Integration tests for email sending
  </in_scope>
  <out_of_scope>
    - Public quote viewing page (TASK-QUOTE-002)
    - Quote accept/decline API endpoints for public access (TASK-QUOTE-002)
    - WhatsApp quote delivery (future task)
    - Quote PDF template customization per tenant
    - Quote reminders and follow-ups
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add viewToken to schema
# Edit apps/api/prisma/schema.prisma - add viewToken field to Quote model

# 2. Generate migration
cd /home/smash/Documents/dev-env/Playground/ruv/crechebooks/apps/api && pnpm prisma migrate dev --name add_quote_view_token

# 3. Create QuotePdfService
# Create apps/api/src/database/services/quote-pdf.service.ts

# 4. Add quote email template
# Edit apps/api/src/common/services/email-template/email-template.service.ts

# 5. Update QuoteService
# Edit apps/api/src/database/services/quote.service.ts - replace TODO with implementation

# 6. Update database module
# Edit apps/api/src/database/database.module.ts - add QuotePdfService

# 7. Create tests
# Create apps/api/tests/database/services/quote-pdf.service.spec.ts

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - PDF matches invoice PDF professional styling
    - PDF clearly labeled as "QUOTE" with validity period
    - Email sent via configured provider (Mailgun/SMTP)
    - viewToken is unique UUID stored on Quote record
    - PDF attached to email with proper filename
    - Email includes view/accept/decline links
    - Amounts formatted in ZAR (R)
    - Dates formatted DD/MM/YYYY
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: PDF generates with all quote details
    - Test: PDF includes line items table
    - Test: PDF shows validity period prominently
    - Test: Email template renders HTML and text versions
    - Test: Email sends with PDF attachment
    - Test: viewToken is generated and stored
    - Test: Error handling for missing tenant/quote
    - Test: Error handling for empty line items
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Skip PDF generation and only send text email
  - Use hardcoded URLs instead of configurable APP_URL
  - Store viewToken in plain text without unique constraint
  - Send quote without PDF attachment
  - Allow sending quotes with zero line items
  - Skip tenant branding in email template
  - Use synchronous file operations for PDF generation
</anti_patterns>

</task_spec>

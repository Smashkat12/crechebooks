<task_spec id="TASK-BILL-012" version="1.0">

<metadata>
  <title>Invoice Generation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>21</sequence>
  <implements>
    <requirement_ref>REQ-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-002</requirement_ref>
    <requirement_ref>REQ-BILL-004</requirement_ref>
    <requirement_ref>REQ-BILL-005</requirement_ref>
    <requirement_ref>REQ-BILL-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-003</task_ref>
    <task_ref>TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the InvoiceGenerationService which handles monthly batch
invoice generation for enrolled children. The service calculates monthly fees,
applies sibling discounts, adds ad-hoc charges, calculates VAT for registered
tenants, handles pro-rata for mid-month enrollments/withdrawals, and syncs
draft invoices to Xero via MCP. All monetary calculations use Decimal.js with
banker's rounding to avoid floating-point errors. Invoices are created in DRAFT
status in Xero for manual review before sending.
</context>

<input_context_files>
  <file purpose="requirements">specs/requirements/billing.md#REQ-BILL-001,REQ-BILL-002,REQ-BILL-004,REQ-BILL-005,REQ-BILL-012</file>
  <file purpose="data_model">specs/technical/data-models.md#Invoice,InvoiceLine</file>
  <file purpose="api_contract">specs/technical/api-contracts.md#BillingService</file>
  <file purpose="entity_reference">src/database/entities/invoice.entity.ts</file>
  <file purpose="repository_reference">src/database/repositories/invoice.repository.ts</file>
  <file purpose="enrollment_service">src/core/billing/enrollment.service.ts</file>
  <file purpose="tenant_entity">src/database/entities/tenant.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-003 completed (Invoice entities exist)</check>
  <check>TASK-BILL-002 completed (Enrollment entity exists)</check>
  <check>InvoiceRepository and InvoiceLineRepository available</check>
  <check>EnrollmentService available</check>
  <check>Xero MCP server configured and accessible</check>
  <check>Decimal.js installed (npm install decimal.js)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create InvoiceGenerationService in src/core/billing/
    - Implement generateMonthlyInvoices batch method
    - Implement createInvoice for single child
    - Implement addLineItems for invoice lines
    - Implement calculateVAT using Decimal.js (15% standard rate)
    - Implement syncToXero using Xero MCP
    - VAT calculations only for tenants with is_vat_registered=true
    - Pro-rata calculations using ProRataService
    - Sibling discount integration with EnrollmentService
    - Invoice number generation (format: INV-{YYYY}-{sequential})
    - Unit tests for all methods
    - Integration tests with Xero MCP mock
  </in_scope>
  <out_of_scope>
    - Pro-rata calculation logic (separate ProRataService in TASK-BILL-014)
    - Invoice delivery/sending (separate service)
    - Payment allocation
    - Invoice PDF generation
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/billing/invoice-generation.service.ts">
      import { Injectable, NotFoundException } from '@nestjs/common';
      import { InvoiceRepository } from '../../database/repositories/invoice.repository';
      import { InvoiceLineRepository } from '../../database/repositories/invoice-line.repository';
      import { EnrollmentService } from './enrollment.service';
      import { ProRataService } from './pro-rata.service';
      import { TenantRepository } from '../../database/repositories/tenant.repository';
      import { XeroService } from '../../integrations/xero/xero.service';
      import { InvoiceStatus, LineType } from '../../database/entities/invoice.entity';
      import Decimal from 'decimal.js';

      // Configure Decimal.js for banker's rounding
      Decimal.set({
        precision: 20,
        rounding: Decimal.ROUND_HALF_EVEN  // Banker's rounding
      });

      export interface InvoiceGenerationResult {
        invoicesCreated: number;
        totalAmountCents: number;
        invoices: Array&lt;{
          id: string;
          invoiceNumber: string;
          childName: string;
          totalCents: number;
          status: InvoiceStatus;
        }&gt;;
        errors: Array&lt;{
          childId: string;
          error: string;
        }&gt;;
      }

      export interface LineItemDto {
        description: string;
        quantity: Decimal;
        unitPriceCents: number;
        discountCents: number;
        lineType: LineType;
        accountCode?: string;
      }

      @Injectable()
      export class InvoiceGenerationService {
        private readonly VAT_RATE = new Decimal('0.15');  // 15% VAT

        constructor(
          private readonly invoiceRepo: InvoiceRepository,
          private readonly invoiceLineRepo: InvoiceLineRepository,
          private readonly enrollmentService: EnrollmentService,
          private readonly proRataService: ProRataService,
          private readonly tenantRepo: TenantRepository,
          private readonly xeroService: XeroService,
        ) {}

        /**
         * Generate monthly invoices for all active enrollments
         * @param billingMonth Format: YYYY-MM
         * @param childIds Optional array to generate for specific children only
         * @returns Generation summary with created invoices and errors
         */
        async generateMonthlyInvoices(
          tenantId: string,
          billingMonth: string,
          childIds?: string[],
        ): Promise&lt;InvoiceGenerationResult&gt;;

        /**
         * Create single invoice for a child enrollment
         * @returns Created invoice with lines
         */
        async createInvoice(
          tenantId: string,
          enrollmentId: string,
          billingPeriodStart: Date,
          billingPeriodEnd: Date,
        ): Promise&lt;Invoice&gt;;

        /**
         * Add line items to invoice and calculate totals
         * Uses Decimal.js with banker's rounding for all calculations
         */
        async addLineItems(
          invoice: Invoice,
          lineItems: LineItemDto[],
          isVatRegistered: boolean,
        ): Promise&lt;InvoiceLine[]&gt;;

        /**
         * Calculate VAT using Decimal.js with banker's rounding
         * @param amountCents Amount in cents (integer)
         * @returns VAT amount in cents (integer, banker's rounded)
         */
        calculateVAT(amountCents: number): number;

        /**
         * Sync invoice to Xero as DRAFT via MCP
         * @returns Xero invoice ID
         */
        async syncToXero(invoice: Invoice): Promise&lt;string&gt;;

        /**
         * Generate next invoice number for tenant
         * Format: INV-{YYYY}-{sequential}
         * Example: INV-2025-001
         */
        async generateInvoiceNumber(tenantId: string, year: number): Promise&lt;string&gt;;
      }
    </signature>

    <signature file="src/integrations/xero/xero.service.ts">
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class XeroService {
        /**
         * Create invoice in Xero as DRAFT via MCP
         * Uses mcp__xero__create_invoice MCP tool
         */
        async createInvoiceDraft(
          contactId: string,
          invoiceNumber: string,
          dueDate: Date,
          lineItems: Array&lt;{
            description: string;
            quantity: number;
            unitAmount: number;
            accountCode?: string;
            taxType: 'OUTPUT' | 'NONE';
          }&gt;,
        ): Promise&lt;{ invoiceId: string; status: string }&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN) for all rounding
    - Must convert to cents (integer) only at final storage step
    - VAT only calculated if tenant.is_vat_registered = true
    - VAT rate is 15% (0.15)
    - Invoice number must be unique per tenant
    - Invoice number format: INV-{YYYY}-{sequential} (e.g., INV-2025-001)
    - Billing period dates must be date-only (no time component)
    - All line items must have sortOrder for consistent display
    - Must create invoices in DRAFT status locally
    - Must sync to Xero as DRAFT (not SUBMITTED/AUTHORISED)
    - Must handle Xero sync failures gracefully (log error, mark invoice)
    - Must NOT use 'any' type anywhere
    - Due date = issue date + 7 days (configurable per tenant later)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - generateMonthlyInvoices creates invoices for all active enrollments
    - generateMonthlyInvoices applies sibling discounts correctly
    - generateMonthlyInvoices calculates VAT only for VAT-registered tenants
    - calculateVAT uses banker's rounding correctly
    - Invoice numbers are sequential and unique per tenant
    - Xero sync creates DRAFT invoices
    - Pro-rata integration works for mid-month enrollments
    - Line items have correct sortOrder
    - All amounts stored as integers (cents)
  </verification>
</definition_of_done>

<pseudo_code>
InvoiceGenerationService (src/core/billing/invoice-generation.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN  // Banker's rounding
    })

  async generateMonthlyInvoices(tenantId, billingMonth, childIds?):
    // Parse billing month
    [year, month] = billingMonth.split('-').map(Number)
    billingPeriodStart = new Date(year, month - 1, 1)
    billingPeriodEnd = new Date(year, month, 0)  // Last day of month

    // Get tenant for VAT status
    tenant = await tenantRepo.findById(tenantId)
    isVatRegistered = tenant.isVatRegistered

    // Get active enrollments
    enrollments = await enrollmentService.getActiveEnrollments(tenantId)

    // Filter by childIds if provided
    if (childIds && childIds.length > 0) {
      enrollments = enrollments.filter(e => childIds.includes(e.childId))
    }

    result = {
      invoicesCreated: 0,
      totalAmountCents: 0,
      invoices: [],
      errors: []
    }

    // Group enrollments by parent for sibling discount
    enrollmentsByParent = new Map&lt;string, Enrollment[]&gt;()
    for (enrollment in enrollments) {
      parentId = enrollment.child.parentId
      if (!enrollmentsByParent.has(parentId)) {
        enrollmentsByParent.set(parentId, [])
      }
      enrollmentsByParent.get(parentId).push(enrollment)
    }

    // Process each parent's enrollments
    for ([parentId, parentEnrollments] in enrollmentsByParent) {
      // Get sibling discounts
      siblingDiscounts = await enrollmentService.applySiblingDiscount(tenantId, parentId)

      // Create invoice for each child
      for (enrollment in parentEnrollments) {
        try {
          invoice = await this.createInvoice(
            tenantId,
            enrollment.id,
            billingPeriodStart,
            billingPeriodEnd
          )

          // Build line items
          lineItems = []

          // Monthly fee line item
          monthlyFeeCents = enrollment.feeStructure.amountCents

          // Check for pro-rata
          isProRata = false
          if (enrollment.startDate > billingPeriodStart) {
            // Mid-month start
            proRataAmount = await proRataService.calculateProRata(
              monthlyFeeCents,
              enrollment.startDate,
              billingPeriodEnd,
              tenantId
            )
            monthlyFeeCents = proRataAmount
            isProRata = true
          }

          if (enrollment.endDate && enrollment.endDate < billingPeriodEnd) {
            // Mid-month end
            proRataAmount = await proRataService.calculateProRata(
              monthlyFeeCents,
              billingPeriodStart,
              enrollment.endDate,
              tenantId
            )
            monthlyFeeCents = proRataAmount
            isProRata = true
          }

          // Apply sibling discount
          discountPercentage = siblingDiscounts.get(enrollment.childId) || new Decimal(0)
          discountCents = 0

          if (discountPercentage.greaterThan(0)) {
            // Calculate discount in Decimal
            discountAmount = new Decimal(monthlyFeeCents)
              .mul(discountPercentage)
              .div(100)
            // Round to integer cents
            discountCents = discountAmount.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()
          }

          // Add monthly fee line
          description = isProRata
            ? `${enrollment.feeStructure.name} (Pro-rata)`
            : enrollment.feeStructure.name

          lineItems.push({
            description: description,
            quantity: new Decimal(1),
            unitPriceCents: monthlyFeeCents,
            discountCents: 0,
            lineType: LineType.MONTHLY_FEE,
            accountCode: '4000'  // Income: School Fees
          })

          // Add sibling discount line if applicable
          if (discountCents > 0) {
            lineItems.push({
              description: `Sibling Discount (${discountPercentage.toString()}%)`,
              quantity: new Decimal(1),
              unitPriceCents: discountCents,
              discountCents: 0,
              lineType: LineType.DISCOUNT,
              accountCode: '4000'
            })
          }

          // TODO: Add ad-hoc charges from database

          // Add line items to invoice
          await this.addLineItems(invoice, lineItems, isVatRegistered)

          // Sync to Xero
          try {
            xeroInvoiceId = await this.syncToXero(invoice)
            await invoiceRepo.update(tenantId, invoice.id, { xeroInvoiceId })
          } catch (error) {
            // Log error but don't fail invoice creation
            console.error(`Failed to sync invoice ${invoice.id} to Xero:`, error)
          }

          // Add to result
          result.invoicesCreated++
          result.totalAmountCents += invoice.totalCents
          result.invoices.push({
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            childName: `${enrollment.child.firstName} ${enrollment.child.lastName}`,
            totalCents: invoice.totalCents,
            status: invoice.status
          })

        } catch (error) {
          result.errors.push({
            childId: enrollment.childId,
            error: error.message
          })
        }
      }
    }

    return result

  async createInvoice(tenantId, enrollmentId, billingPeriodStart, billingPeriodEnd):
    // Get enrollment with relations
    enrollment = await enrollmentRepo.findById(tenantId, enrollmentId)
    if (!enrollment) throw NotFoundException('Enrollment not found')

    // Generate invoice number
    year = billingPeriodStart.getFullYear()
    invoiceNumber = await this.generateInvoiceNumber(tenantId, year)

    // Set dates
    issueDate = new Date()
    issueDate.setHours(0, 0, 0, 0)
    dueDate = new Date(issueDate)
    dueDate.setDate(dueDate.getDate() + 7)  // 7 days payment term

    // Create invoice
    invoiceDto = {
      invoiceNumber: invoiceNumber,
      parentId: enrollment.child.parentId,
      childId: enrollment.childId,
      billingPeriodStart: billingPeriodStart,
      billingPeriodEnd: billingPeriodEnd,
      issueDate: issueDate,
      dueDate: dueDate,
      subtotalCents: 0,  // Will be calculated when adding lines
      vatCents: 0,
      totalCents: 0,
      status: InvoiceStatus.DRAFT
    }

    invoice = await invoiceRepo.create(tenantId, invoiceDto)
    return invoice

  async addLineItems(invoice, lineItems, isVatRegistered):
    subtotal = new Decimal(0)
    createdLines = []

    // Process each line item
    for (index, lineItem in lineItems) {
      // Calculate line subtotal
      lineSubtotal = new Decimal(lineItem.unitPriceCents)
        .mul(lineItem.quantity)
        .sub(lineItem.discountCents)

      // Calculate line VAT
      lineVatCents = 0
      if (isVatRegistered && lineItem.lineType !== LineType.DISCOUNT) {
        lineVatCents = this.calculateVAT(lineSubtotal.toNumber())
      }

      // Calculate line total
      lineTotal = lineSubtotal.add(lineVatCents)

      // Create line
      lineDto = {
        invoiceId: invoice.id,
        description: lineItem.description,
        quantity: lineItem.quantity.toNumber(),
        unitPriceCents: lineItem.unitPriceCents,
        discountCents: lineItem.discountCents,
        subtotalCents: lineSubtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        vatCents: lineVatCents,
        totalCents: lineTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        lineType: lineItem.lineType,
        accountCode: lineItem.accountCode,
        sortOrder: index
      }

      line = await invoiceLineRepo.create(lineDto)
      createdLines.push(line)

      // Accumulate subtotal
      subtotal = subtotal.add(lineSubtotal)
    }

    // Calculate invoice VAT and total
    invoiceVatCents = 0
    if (isVatRegistered) {
      invoiceVatCents = this.calculateVAT(subtotal.toNumber())
    }

    invoiceTotal = subtotal.add(invoiceVatCents)

    // Update invoice totals
    await invoiceRepo.update(invoice.tenantId, invoice.id, {
      subtotalCents: subtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
      vatCents: invoiceVatCents,
      totalCents: invoiceTotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()
    })

    return createdLines

  calculateVAT(amountCents):
    // Convert to Decimal for precision
    amount = new Decimal(amountCents)

    // Calculate VAT with banker's rounding
    vat = amount.mul(this.VAT_RATE)

    // Round to integer cents using banker's rounding
    vatCents = vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber()

    return vatCents

  async syncToXero(invoice):
    // Get parent contact ID from invoice
    parent = await parentRepo.findById(invoice.tenantId, invoice.parentId)

    // Get invoice lines
    lines = await invoiceLineRepo.findByInvoiceId(invoice.id)

    // Map lines to Xero format
    xeroLines = lines.map(line => ({
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitPriceCents / 100,  // Convert cents to currency
      accountCode: line.accountCode,
      taxType: line.vatCents > 0 ? 'OUTPUT' : 'NONE'
    }))

    // Create in Xero as DRAFT via MCP
    result = await xeroService.createInvoiceDraft(
      parent.xeroContactId,
      invoice.invoiceNumber,
      invoice.dueDate,
      xeroLines
    )

    return result.invoiceId

  async generateInvoiceNumber(tenantId, year):
    // Get last invoice number for tenant and year
    lastInvoice = await invoiceRepo.findLastInvoiceForYear(tenantId, year)

    if (!lastInvoice) {
      // First invoice of the year
      sequential = 1
    } else {
      // Extract sequential number from last invoice
      // Format: INV-2025-001
      parts = lastInvoice.invoiceNumber.split('-')
      lastSequential = parseInt(parts[2])
      sequential = lastSequential + 1
    }

    // Format with leading zeros (001, 002, etc.)
    sequentialPadded = sequential.toString().padStart(3, '0')

    invoiceNumber = `INV-${year}-${sequentialPadded}`

    return invoiceNumber

XeroService (src/integrations/xero/xero.service.ts):

  async createInvoiceDraft(contactId, invoiceNumber, dueDate, lineItems):
    // Call Xero MCP tool
    result = await mcpClient.call('mcp__xero__create_invoice', {
      contact_id: contactId,
      invoice_number: invoiceNumber,
      due_date: dueDate.toISOString().split('T')[0],
      line_items: lineItems,
      status: 'DRAFT'
    })

    return {
      invoiceId: result.invoice_id,
      status: result.status
    }
</pseudo_code>

<files_to_create>
  <file path="src/core/billing/invoice-generation.service.ts">InvoiceGenerationService with all methods</file>
  <file path="src/integrations/xero/xero.service.ts">XeroService for MCP integration</file>
  <file path="src/integrations/xero/xero.module.ts">XeroModule for dependency injection</file>
  <file path="tests/core/billing/invoice-generation.service.spec.ts">Unit tests for invoice generation</file>
  <file path="tests/integrations/xero/xero.service.spec.ts">Unit tests for Xero service</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/billing/billing.module.ts">Import InvoiceGenerationService and XeroModule</file>
  <file path="src/database/repositories/invoice.repository.ts">Add findLastInvoiceForYear method</file>
  <file path="package.json">Add decimal.js dependency if not present</file>
</files_to_modify>

<validation_criteria>
  <criterion>InvoiceGenerationService compiles without TypeScript errors</criterion>
  <criterion>All methods use Decimal.js for calculations</criterion>
  <criterion>Banker's rounding (ROUND_HALF_EVEN) used consistently</criterion>
  <criterion>VAT calculated only for VAT-registered tenants</criterion>
  <criterion>VAT calculation is accurate (15% with banker's rounding)</criterion>
  <criterion>Invoice numbers are sequential and unique per tenant</criterion>
  <criterion>Invoice numbers follow format INV-{YYYY}-{sequential}</criterion>
  <criterion>Sibling discounts applied correctly</criterion>
  <criterion>Pro-rata integration works for mid-month enrollments</criterion>
  <criterion>Xero sync creates invoices as DRAFT status</criterion>
  <criterion>Xero sync failures don't prevent local invoice creation</criterion>
  <criterion>Line items have correct sortOrder</criterion>
  <criterion>All amounts stored as integers (cents)</criterion>
  <criterion>All unit tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm install decimal.js</command>
  <command>npm run build</command>
  <command>npm run test -- invoice-generation.service.spec.ts</command>
  <command>npm run test -- xero.service.spec.ts</command>
  <command>npm run test:cov -- invoice-generation.service.spec.ts</command>
</test_commands>

</task_spec>

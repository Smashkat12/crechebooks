<task_spec id="TASK-PAY-013" version="1.0">

<metadata>
  <title>Arrears Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>26</sequence>
  <implements>
    <requirement_ref>REQ-PAY-007</requirement_ref>
    <requirement_ref>REQ-PAY-008</requirement_ref>
    <requirement_ref>REQ-PAY-012</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-001</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the ArrearsService which calculates and reports on outstanding payments.
It provides aging analysis (current, 30 days, 60 days, 90+ days), identifies top debtors,
tracks parent payment history, and generates CSV exports for follow-up. This service powers
the arrears dashboard and enables proactive debt collection. The aging buckets help
prioritize collection efforts and identify high-risk accounts.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#PaymentService</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="invoice_entity">src/database/entities/invoice.entity.ts</file>
  <file purpose="payment_entity">src/database/entities/payment.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>TASK-PAY-001 completed (Payment entity exists)</check>
  <check>Invoice repository available</check>
  <check>Payment repository available</check>
  <check>Parent repository available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ArrearsService
    - Implement getArrearsReport (summary with aging)
    - Implement calculateAging (current, 30, 60, 90+ day buckets)
    - Implement getParentHistory (payment patterns per parent)
    - Implement getTopDebtors (sorted by outstanding amount)
    - Implement exportArrearsCSV (for external follow-up)
    - Create ArrearsReport DTOs
    - Calculate days overdue based on invoice due date
    - Support filtering by date range, parent, or minimum amount
  </in_scope>
  <out_of_scope>
    - Payment reminder sending (TASK-PAY-014)
    - API endpoints (API layer tasks)
    - Dashboard UI components
    - Automated debt collection workflows
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/payment/arrears.service.ts">
      @Injectable()
      export class ArrearsService {
        constructor(
          private prisma: PrismaService,
          private invoiceRepository: InvoiceRepository,
          private paymentRepository: PaymentRepository,
          private parentRepository: ParentRepository,
          private logger: LoggerService
        ) {}

        async getArrearsReport(
          tenantId: string,
          filters?: ArrearsFilters
        ): Promise&lt;ArrearsReport&gt;

        async calculateAging(
          invoices: Invoice[]
        ): Promise&lt;AgingBuckets&gt;

        async getParentHistory(
          parentId: string,
          tenantId: string
        ): Promise&lt;ParentPaymentHistory&gt;

        async getTopDebtors(
          tenantId: string,
          limit?: number
        ): Promise&lt;DebtorSummary[]&gt;

        async exportArrearsCSV(
          tenantId: string,
          filters?: ArrearsFilters
        ): Promise&lt;string&gt;

        private calculateDaysOverdue(
          invoice: Invoice
        ): number

        private categorizeInvoiceByAge(
          invoice: Invoice,
          buckets: AgingBuckets
        ): void
      }
    </signature>
    <signature file="src/core/payment/dto/arrears.dto.ts">
      export interface ArrearsFilters {
        dateFrom?: Date;
        dateTo?: Date;
        parentId?: string;
        minAmount?: number;
      }

      export interface ArrearsReport {
        summary: {
          totalOutstanding: number;
          totalInvoices: number;
          aging: AgingBuckets;
        };
        topDebtors: DebtorSummary[];
        invoices: ArrearsInvoice[];
      }

      export interface AgingBuckets {
        current: number;        // 0-7 days overdue
        days30: number;         // 8-30 days overdue
        days60: number;         // 31-60 days overdue
        days90Plus: number;     // 61+ days overdue
      }

      export interface DebtorSummary {
        parentId: string;
        parentName: string;
        parentEmail: string;
        parentPhone: string;
        totalOutstanding: number;
        oldestInvoiceDate: Date;
        invoiceCount: number;
        daysOverdue: number;
      }

      export interface ArrearsInvoice {
        invoiceId: string;
        invoiceNumber: string;
        parentName: string;
        childName: string;
        issueDate: Date;
        dueDate: Date;
        totalAmount: number;
        amountPaid: number;
        outstandingAmount: number;
        daysOverdue: number;
        agingBucket: 'current' | '30' | '60' | '90+';
      }

      export interface ParentPaymentHistory {
        parentId: string;
        parentName: string;
        totalInvoiced: number;
        totalPaid: number;
        totalOutstanding: number;
        onTimePayments: number;
        latePayments: number;
        averageDaysToPayment: number;
        paymentHistory: PaymentHistoryEntry[];
      }

      export interface PaymentHistoryEntry {
        invoiceNumber: string;
        invoiceDate: Date;
        dueDate: Date;
        paidDate: Date | null;
        amount: number;
        daysToPayment: number | null;
        status: 'paid' | 'partial' | 'overdue';
      }
    </signature>
  </signatures>

  <constraints>
    - Days overdue calculated from invoice due_date to current date
    - Aging buckets: current (0-7 days), 30 (8-30), 60 (31-60), 90+ (61+)
    - Only include invoices with outstanding balance > 0
    - Only include invoices in status SENT, PARTIALLY_PAID, or OVERDUE
    - Top debtors sorted by total outstanding (descending)
    - CSV export includes all invoice details for follow-up
    - Parent history includes both paid and outstanding invoices
    - Must respect tenant isolation
    - Performance: optimize queries for large datasets
  </constraints>

  <verification>
    - Service instantiates without errors
    - getArrearsReport returns correct summary
    - Aging buckets calculated correctly based on days overdue
    - Top debtors sorted by outstanding amount
    - Parent history shows accurate payment patterns
    - CSV export generates valid CSV format
    - Filters apply correctly (date range, parent, min amount)
    - Performance acceptable with 10,000+ invoices
    - Unit tests pass
    - Integration tests verify calculations
  </verification>
</definition_of_done>

<pseudo_code>
ArrearsService (src/core/payment/arrears.service.ts):
  @Injectable()
  export class ArrearsService:
    constructor(
      private prisma: PrismaService,
      private invoiceRepository: InvoiceRepository,
      private paymentRepository: PaymentRepository,
      private parentRepository: ParentRepository,
      private logger: LoggerService
    )

    async getArrearsReport(tenantId: string, filters?: ArrearsFilters): Promise<ArrearsReport>:
      // 1. Get all outstanding invoices
      invoices = await invoiceRepository.findOutstanding(tenantId, {
        dateFrom: filters?.dateFrom,
        dateTo: filters?.dateTo,
        parentId: filters?.parentId,
        minOutstanding: filters?.minAmount
      })

      // 2. Calculate aging buckets
      aging = await calculateAging(invoices)

      // 3. Get top debtors
      topDebtors = await getTopDebtors(tenantId, 10)

      // 4. Build arrears invoice list
      arrearsInvoices = invoices.map(invoice => {
        outstanding = invoice.totalCents - invoice.amountPaidCents
        daysOverdue = calculateDaysOverdue(invoice)

        return {
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          parentName: invoice.parent.name,
          childName: invoice.child.name,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          totalAmount: invoice.totalCents / 100,
          amountPaid: invoice.amountPaidCents / 100,
          outstandingAmount: outstanding / 100,
          daysOverdue: daysOverdue,
          agingBucket: daysOverdue <= 7 ? 'current' :
                       daysOverdue <= 30 ? '30' :
                       daysOverdue <= 60 ? '60' : '90+'
        }
      })

      // 5. Calculate summary
      totalOutstanding = invoices.reduce((sum, inv) =>
        sum + (inv.totalCents - inv.amountPaidCents), 0
      )

      return {
        summary: {
          totalOutstanding: totalOutstanding / 100,
          totalInvoices: invoices.length,
          aging: aging
        },
        topDebtors: topDebtors,
        invoices: arrearsInvoices
      }

    async calculateAging(invoices: Invoice[]): Promise<AgingBuckets>:
      buckets = {
        current: 0,
        days30: 0,
        days60: 0,
        days90Plus: 0
      }

      for invoice in invoices:
        outstanding = invoice.totalCents - invoice.amountPaidCents
        daysOverdue = calculateDaysOverdue(invoice)

        if daysOverdue <= 7:
          buckets.current += outstanding
        else if daysOverdue <= 30:
          buckets.days30 += outstanding
        else if daysOverdue <= 60:
          buckets.days60 += outstanding
        else:
          buckets.days90Plus += outstanding

      // Convert to currency
      return {
        current: buckets.current / 100,
        days30: buckets.days30 / 100,
        days60: buckets.days60 / 100,
        days90Plus: buckets.days90Plus / 100
      }

    async getParentHistory(parentId: string, tenantId: string): Promise<ParentPaymentHistory>:
      // 1. Get parent details
      parent = await parentRepository.findById(parentId, tenantId)

      if !parent:
        throw new NotFoundException('Parent not found')

      // 2. Get all invoices for parent
      invoices = await invoiceRepository.findByParentId(parentId, tenantId)

      // 3. Get all payments
      payments = await paymentRepository.findByInvoiceIds(
        invoices.map(i => i.id),
        tenantId
      )

      // 4. Build payment history
      paymentHistory = invoices.map(invoice => {
        invoicePayments = payments.filter(p => p.invoiceId === invoice.id)

        totalPaid = invoicePayments.reduce((sum, p) => sum + p.amountCents, 0)
        isPaid = totalPaid >= invoice.totalCents

        firstPaymentDate = invoicePayments.length > 0
          ? invoicePayments[0].paymentDate
          : null

        daysToPayment = firstPaymentDate
          ? Math.floor((firstPaymentDate - invoice.issueDate) / (1000 * 60 * 60 * 24))
          : null

        return {
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          paidDate: firstPaymentDate,
          amount: invoice.totalCents / 100,
          daysToPayment: daysToPayment,
          status: isPaid ? 'paid' : (totalPaid > 0 ? 'partial' : 'overdue')
        }
      })

      // 5. Calculate statistics
      totalInvoiced = invoices.reduce((sum, i) => sum + i.totalCents, 0)
      totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0)

      paidInvoices = paymentHistory.filter(h => h.status === 'paid')
      onTimePayments = paidInvoices.filter(h =>
        h.paidDate && h.paidDate <= h.dueDate
      ).length

      latePayments = paidInvoices.filter(h =>
        h.paidDate && h.paidDate > h.dueDate
      ).length

      avgDaysToPayment = paidInvoices.length > 0
        ? paidInvoices.reduce((sum, h) => sum + (h.daysToPayment || 0), 0) / paidInvoices.length
        : 0

      return {
        parentId: parent.id,
        parentName: parent.name,
        totalInvoiced: totalInvoiced / 100,
        totalPaid: totalPaid / 100,
        totalOutstanding: (totalInvoiced - totalPaid) / 100,
        onTimePayments: onTimePayments,
        latePayments: latePayments,
        averageDaysToPayment: Math.round(avgDaysToPayment),
        paymentHistory: paymentHistory
      }

    async getTopDebtors(tenantId: string, limit: number = 10): Promise<DebtorSummary[]>:
      // Use raw SQL for performance
      result = await prisma.$queryRaw`
        SELECT
          p.id as parent_id,
          p.name as parent_name,
          p.email as parent_email,
          p.phone as parent_phone,
          SUM(i.total_cents - i.amount_paid_cents) as total_outstanding_cents,
          MIN(i.due_date) as oldest_invoice_date,
          COUNT(i.id) as invoice_count,
          MAX(EXTRACT(DAY FROM (CURRENT_DATE - i.due_date))) as days_overdue
        FROM parents p
        JOIN invoices i ON i.parent_id = p.id
        WHERE i.tenant_id = ${tenantId}
          AND i.status IN ('SENT', 'PARTIALLY_PAID', 'OVERDUE')
          AND (i.total_cents - i.amount_paid_cents) > 0
        GROUP BY p.id, p.name, p.email, p.phone
        ORDER BY total_outstanding_cents DESC
        LIMIT ${limit}
      `

      return result.map(row => ({
        parentId: row.parent_id,
        parentName: row.parent_name,
        parentEmail: row.parent_email,
        parentPhone: row.parent_phone,
        totalOutstanding: Number(row.total_outstanding_cents) / 100,
        oldestInvoiceDate: row.oldest_invoice_date,
        invoiceCount: Number(row.invoice_count),
        daysOverdue: Number(row.days_overdue)
      }))

    async exportArrearsCSV(tenantId: string, filters?: ArrearsFilters): Promise<string>:
      report = await getArrearsReport(tenantId, filters)

      // Build CSV
      csvRows = [
        // Header
        'Invoice Number,Parent Name,Child Name,Issue Date,Due Date,Total Amount,Paid Amount,Outstanding,Days Overdue,Aging Bucket'
      ]

      for invoice in report.invoices:
        csvRows.push(
          `"${invoice.invoiceNumber}",` +
          `"${invoice.parentName}",` +
          `"${invoice.childName}",` +
          `"${invoice.issueDate.toISOString().split('T')[0]}",` +
          `"${invoice.dueDate.toISOString().split('T')[0]}",` +
          `${invoice.totalAmount},` +
          `${invoice.amountPaid},` +
          `${invoice.outstandingAmount},` +
          `${invoice.daysOverdue},` +
          `"${invoice.agingBucket}"`
        )

      return csvRows.join('\n')

    private calculateDaysOverdue(invoice: Invoice): number:
      today = new Date()
      dueDate = new Date(invoice.dueDate)

      diffMs = today.getTime() - dueDate.getTime()
      diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      return Math.max(0, diffDays) // Don't return negative for not-yet-due

DTOs (src/core/payment/dto/arrears.dto.ts):
  export interface ArrearsFilters:
    dateFrom?: Date
    dateTo?: Date
    parentId?: string
    minAmount?: number

  export interface ArrearsReport:
    summary: {
      totalOutstanding: number
      totalInvoices: number
      aging: AgingBuckets
    }
    topDebtors: DebtorSummary[]
    invoices: ArrearsInvoice[]

  export interface AgingBuckets:
    current: number        // 0-7 days overdue
    days30: number         // 8-30 days overdue
    days60: number         // 31-60 days overdue
    days90Plus: number     // 61+ days overdue

  export interface DebtorSummary:
    parentId: string
    parentName: string
    parentEmail: string
    parentPhone: string
    totalOutstanding: number
    oldestInvoiceDate: Date
    invoiceCount: number
    daysOverdue: number

  export interface ArrearsInvoice:
    invoiceId: string
    invoiceNumber: string
    parentName: string
    childName: string
    issueDate: Date
    dueDate: Date
    totalAmount: number
    amountPaid: number
    outstandingAmount: number
    daysOverdue: number
    agingBucket: 'current' | '30' | '60' | '90+'

  export interface ParentPaymentHistory:
    parentId: string
    parentName: string
    totalInvoiced: number
    totalPaid: number
    totalOutstanding: number
    onTimePayments: number
    latePayments: number
    averageDaysToPayment: number
    paymentHistory: PaymentHistoryEntry[]

  export interface PaymentHistoryEntry:
    invoiceNumber: string
    invoiceDate: Date
    dueDate: Date
    paidDate: Date | null
    amount: number
    daysToPayment: number | null
    status: 'paid' | 'partial' | 'overdue'
</pseudo_code>

<files_to_create>
  <file path="src/core/payment/arrears.service.ts">ArrearsService implementation</file>
  <file path="src/core/payment/dto/arrears.dto.ts">Arrears DTOs and interfaces</file>
  <file path="tests/core/payment/arrears.service.spec.ts">Unit tests</file>
  <file path="tests/core/payment/arrears.integration.spec.ts">Integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/payment/index.ts">Export ArrearsService</file>
  <file path="src/core/payment/payment.module.ts">Register ArrearsService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Service compiles without TypeScript errors</criterion>
  <criterion>getArrearsReport returns correct summary with aging</criterion>
  <criterion>Aging buckets calculated correctly: current (0-7), 30 (8-30), 60 (31-60), 90+ (61+)</criterion>
  <criterion>Days overdue calculated from due date to current date</criterion>
  <criterion>Top debtors sorted by outstanding amount descending</criterion>
  <criterion>Parent history shows accurate payment patterns</criterion>
  <criterion>CSV export generates valid CSV with all fields</criterion>
  <criterion>Filters apply correctly (date range, parent, min amount)</criterion>
  <criterion>Performance acceptable with 10,000+ invoices</criterion>
  <criterion>Only includes invoices with outstanding balance > 0</criterion>
  <criterion>Unit tests achieve >90% coverage</criterion>
  <criterion>Integration tests verify calculations</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "ArrearsService"</command>
  <command>npm run test:integration -- --grep "arrears"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

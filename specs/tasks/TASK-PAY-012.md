<task_spec id="TASK-PAY-012" version="1.0">

<metadata>
  <title>Payment Allocation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>25</sequence>
  <implements>
    <requirement_ref>REQ-PAY-005</requirement_ref>
    <requirement_ref>REQ-PAY-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-001</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the PaymentAllocationService which handles the actual allocation of
payments to invoices. It supports partial payments (allocating less than invoice total),
combined payments (allocating one transaction to multiple invoices), and overpayments
(creating credit balance). The service updates invoice statuses, tracks payment history,
and synchronizes all allocations to Xero via MCP. It also provides reversal functionality
for correcting allocation errors.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#PaymentService</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="payment_entity">src/database/entities/payment.entity.ts</file>
  <file purpose="invoice_entity">src/database/entities/invoice.entity.ts</file>
  <file purpose="xero_spec">specs/technical/external-integrations.md#xero</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-001 completed (Payment entity exists)</check>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>Payment repository available</check>
  <check>Invoice repository available</check>
  <check>Xero MCP integration available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PaymentAllocationService
    - Implement allocatePayment for manual allocation
    - Implement allocateToMultipleInvoices for combined payments
    - Implement handleOverpayment (create credit balance)
    - Implement handlePartialPayment (update invoice status)
    - Implement reverseAllocation for correcting errors
    - Create AllocationDto and validation
    - Update invoice statuses (PARTIALLY_PAID, PAID)
    - Sync to Xero via MCP
    - Create audit trail for all allocations
  </in_scope>
  <out_of_scope>
    - Payment matching logic (TASK-PAY-011)
    - API endpoints (API layer tasks)
    - Credit balance management UI
    - Xero MCP implementation (external integration layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/payment/payment-allocation.service.ts">
      @Injectable()
      export class PaymentAllocationService {
        constructor(
          private prisma: PrismaService,
          private paymentRepository: PaymentRepository,
          private invoiceRepository: InvoiceRepository,
          private transactionRepository: TransactionRepository,
          private xeroMcp: XeroMcpService,
          private logger: LoggerService
        ) {}

        async allocatePayment(
          transactionId: string,
          allocations: AllocationDto[],
          userId: string,
          tenantId: string
        ): Promise&lt;AllocationResult&gt;

        async allocateToMultipleInvoices(
          transactionId: string,
          allocations: AllocationDto[],
          userId: string,
          tenantId: string
        ): Promise&lt;AllocationResult&gt;

        async handleOverpayment(
          transactionId: string,
          invoiceId: string,
          overpaymentAmount: number,
          userId: string,
          tenantId: string
        ): Promise&lt;Payment&gt;

        async handlePartialPayment(
          transactionId: string,
          invoiceId: string,
          partialAmount: number,
          userId: string,
          tenantId: string
        ): Promise&lt;Payment&gt;

        async reverseAllocation(
          paymentId: string,
          reason: string,
          userId: string,
          tenantId: string
        ): Promise&lt;Payment&gt;

        private updateInvoiceStatus(
          invoiceId: string,
          newAmountPaid: number
        ): Promise&lt;Invoice&gt;

        private syncToXero(
          payment: Payment
        ): Promise&lt;void&gt;

        private validateAllocations(
          transactionAmount: number,
          allocations: AllocationDto[]
        ): void
      }
    </signature>
    <signature file="src/core/payment/dto/allocation.dto.ts">
      export class AllocationDto {
        @IsUUID()
        invoiceId: string;

        @IsNumber()
        @Min(0.01)
        amount: number;
      }

      export class AllocatePaymentDto {
        @IsUUID()
        transactionId: string;

        @IsArray()
        @ValidateNested({ each: true })
        @Type(() => AllocationDto)
        allocations: AllocationDto[];
      }

      export interface AllocationResult {
        payments: Payment[];
        invoicesUpdated: string[];
        unallocatedAmount: number;
        xeroSyncStatus: 'SUCCESS' | 'FAILED' | 'PENDING';
      }
    </signature>
  </signatures>

  <constraints>
    - Total allocations must not exceed transaction amount
    - Allocation amounts must be positive (>0)
    - Must handle rounding to cents correctly
    - Invoice status updates: SENT -> PARTIALLY_PAID -> PAID
    - Overpayment creates OVERPAYMENT type payment
    - Partial payment updates amountPaid but keeps invoice PARTIALLY_PAID
    - Reversal sets isReversed=true and creates new payment to reverse
    - Must sync to Xero after every successful allocation
    - Must validate tenant isolation (transaction and invoices same tenant)
    - Must log all allocations for audit trail
    - Reversal reason must be non-empty string
  </constraints>

  <verification>
    - Service instantiates without errors
    - allocatePayment creates payment records
    - Invoice statuses update correctly
    - Partial payments work correctly
    - Combined payments (multi-invoice) work correctly
    - Overpayments create credit balance
    - Reversal correctly undoes allocation
    - Xero sync is called after allocation
    - Validation prevents over-allocation
    - Unit tests pass
    - Integration tests with Xero MCP pass
  </verification>
</definition_of_done>

<pseudo_code>
PaymentAllocationService (src/core/payment/payment-allocation.service.ts):
  @Injectable()
  export class PaymentAllocationService:
    constructor(
      private prisma: PrismaService,
      private paymentRepository: PaymentRepository,
      private invoiceRepository: InvoiceRepository,
      private transactionRepository: TransactionRepository,
      private xeroMcp: XeroMcpService,
      private logger: LoggerService
    )

    async allocatePayment(
      transactionId: string,
      allocations: AllocationDto[],
      userId: string,
      tenantId: string
    ): Promise<AllocationResult>:
      // 1. Get and validate transaction
      transaction = await transactionRepository.findById(transactionId, tenantId)
      if !transaction:
        throw new NotFoundException('Transaction not found')

      if !transaction.isCredit:
        throw new BadRequestException('Transaction must be a credit (payment)')

      // 2. Validate allocations don't exceed transaction amount
      transactionAmount = Math.abs(transaction.amountCents)
      validateAllocations(transactionAmount, allocations)

      // 3. Check if this is multi-invoice allocation
      if allocations.length > 1:
        return await allocateToMultipleInvoices(transactionId, allocations, userId, tenantId)

      // 4. Single invoice allocation
      allocation = allocations[0]
      invoice = await invoiceRepository.findById(allocation.invoiceId, tenantId)

      if !invoice:
        throw new NotFoundException('Invoice not found')

      outstandingAmount = invoice.totalCents - invoice.amountPaidCents
      allocationCents = Math.round(allocation.amount * 100)

      // 5. Determine payment type
      if allocationCents > outstandingAmount:
        // Overpayment
        payment = await handleOverpayment(transactionId, invoice.id, allocationCents, userId, tenantId)
      else if allocationCents < outstandingAmount:
        // Partial payment
        payment = await handlePartialPayment(transactionId, invoice.id, allocationCents, userId, tenantId)
      else:
        // Exact payment
        payment = await paymentRepository.create({
          tenantId: tenantId,
          transactionId: transactionId,
          invoiceId: invoice.id,
          amountCents: allocationCents,
          paymentDate: transaction.date,
          reference: transaction.reference,
          matchType: MatchType.MANUAL,
          matchConfidence: 100,
          matchedBy: MatchedBy.USER
        })

        await updateInvoiceStatus(invoice.id, invoice.amountPaidCents + allocationCents)

      // 6. Sync to Xero
      try:
        await syncToXero(payment)
        xeroStatus = 'SUCCESS'
      catch error:
        logger.error('Xero sync failed', error)
        xeroStatus = 'FAILED'

      // 7. Return result
      return {
        payments: [payment],
        invoicesUpdated: [invoice.id],
        unallocatedAmount: 0,
        xeroSyncStatus: xeroStatus
      }

    async allocateToMultipleInvoices(
      transactionId: string,
      allocations: AllocationDto[],
      userId: string,
      tenantId: string
    ): Promise<AllocationResult>:
      transaction = await transactionRepository.findById(transactionId, tenantId)

      payments = []
      invoicesUpdated = []

      // Use database transaction for atomicity
      await prisma.$transaction(async (tx) => {
        for allocation in allocations:
          invoice = await invoiceRepository.findById(allocation.invoiceId, tenantId)

          if !invoice:
            throw new NotFoundException(`Invoice ${allocation.invoiceId} not found`)

          allocationCents = Math.round(allocation.amount * 100)

          // Create payment
          payment = await paymentRepository.create({
            tenantId: tenantId,
            transactionId: transactionId,
            invoiceId: invoice.id,
            amountCents: allocationCents,
            paymentDate: transaction.date,
            reference: transaction.reference,
            matchType: MatchType.MANUAL,
            matchConfidence: 100,
            matchedBy: MatchedBy.USER
          })

          // Update invoice
          await updateInvoiceStatus(invoice.id, invoice.amountPaidCents + allocationCents)

          payments.push(payment)
          invoicesUpdated.push(invoice.id)
      })

      // Sync all to Xero
      xeroStatus = 'SUCCESS'
      for payment in payments:
        try:
          await syncToXero(payment)
        catch error:
          logger.error('Xero sync failed for payment', payment.id, error)
          xeroStatus = 'FAILED'

      // Calculate unallocated amount
      totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0)
      unallocated = (Math.abs(transaction.amountCents) / 100) - totalAllocated

      return {
        payments: payments,
        invoicesUpdated: invoicesUpdated,
        unallocatedAmount: unallocated,
        xeroSyncStatus: xeroStatus
      }

    async handleOverpayment(
      transactionId: string,
      invoiceId: string,
      overpaymentAmountCents: number,
      userId: string,
      tenantId: string
    ): Promise<Payment>:
      invoice = await invoiceRepository.findById(invoiceId, tenantId)
      transaction = await transactionRepository.findById(transactionId, tenantId)

      outstandingCents = invoice.totalCents - invoice.amountPaidCents

      // Create payment for outstanding amount
      payment = await paymentRepository.create({
        tenantId: tenantId,
        transactionId: transactionId,
        invoiceId: invoiceId,
        amountCents: outstandingCents, // Only allocate outstanding amount
        paymentDate: transaction.date,
        reference: transaction.reference,
        matchType: MatchType.OVERPAYMENT,
        matchConfidence: 100,
        matchedBy: MatchedBy.USER
      })

      // Update invoice to PAID
      await updateInvoiceStatus(invoiceId, invoice.totalCents)

      // TODO: Create credit balance for difference (future enhancement)
      overpaymentCents = overpaymentAmountCents - outstandingCents
      logger.info(`Overpayment of ${overpaymentCents / 100} for parent ${invoice.parentId}`)

      return payment

    async handlePartialPayment(
      transactionId: string,
      invoiceId: string,
      partialAmountCents: number,
      userId: string,
      tenantId: string
    ): Promise<Payment>:
      invoice = await invoiceRepository.findById(invoiceId, tenantId)
      transaction = await transactionRepository.findById(transactionId, tenantId)

      // Create payment for partial amount
      payment = await paymentRepository.create({
        tenantId: tenantId,
        transactionId: transactionId,
        invoiceId: invoiceId,
        amountCents: partialAmountCents,
        paymentDate: transaction.date,
        reference: transaction.reference,
        matchType: MatchType.PARTIAL,
        matchConfidence: 100,
        matchedBy: MatchedBy.USER
      })

      // Update invoice to PARTIALLY_PAID
      newAmountPaid = invoice.amountPaidCents + partialAmountCents
      await updateInvoiceStatus(invoiceId, newAmountPaid)

      return payment

    async reverseAllocation(
      paymentId: string,
      reason: string,
      userId: string,
      tenantId: string
    ): Promise<Payment>:
      payment = await paymentRepository.findById(paymentId, tenantId)

      if !payment:
        throw new NotFoundException('Payment not found')

      if payment.isReversed:
        throw new BadRequestException('Payment already reversed')

      // Mark payment as reversed
      reversedPayment = await paymentRepository.update(paymentId, {
        isReversed: true,
        reversedAt: new Date(),
        reversalReason: reason
      })

      // Revert invoice amount_paid
      invoice = await invoiceRepository.findById(payment.invoiceId, tenantId)
      newAmountPaid = invoice.amountPaidCents - payment.amountCents
      await updateInvoiceStatus(payment.invoiceId, Math.max(0, newAmountPaid))

      // Sync reversal to Xero
      try:
        await xeroMcp.reversePayment(payment.xeroPaymentId)
      catch error:
        logger.error('Xero reversal failed', error)
        // Don't fail - reversal is recorded locally

      logger.info(`Payment ${paymentId} reversed by ${userId}: ${reason}`)

      return reversedPayment

    private async updateInvoiceStatus(invoiceId: string, newAmountPaid: number): Promise<Invoice>:
      invoice = await invoiceRepository.findById(invoiceId)

      // Determine new status
      newStatus = invoice.status
      if newAmountPaid === 0:
        newStatus = InvoiceStatus.SENT
      else if newAmountPaid >= invoice.totalCents:
        newStatus = InvoiceStatus.PAID
      else if newAmountPaid > 0:
        newStatus = InvoiceStatus.PARTIALLY_PAID

      // Update invoice
      updatedInvoice = await invoiceRepository.update(invoiceId, {
        amountPaidCents: newAmountPaid,
        status: newStatus
      })

      return updatedInvoice

    private async syncToXero(payment: Payment): Promise<void>:
      // Call Xero MCP to sync payment
      xeroResponse = await xeroMcp.createPayment({
        invoiceId: payment.invoice.xeroInvoiceId,
        amount: payment.amountCents / 100,
        date: payment.paymentDate,
        reference: payment.reference
      })

      // Update payment with Xero ID
      await paymentRepository.update(payment.id, {
        xeroPaymentId: xeroResponse.paymentId
      })

    private validateAllocations(transactionAmountCents: number, allocations: AllocationDto[]): void:
      totalAllocated = allocations.reduce((sum, a) => sum + (a.amount * 100), 0)

      if totalAllocated > transactionAmountCents:
        throw new BadRequestException(
          `Total allocations (${totalAllocated / 100}) exceed transaction amount (${transactionAmountCents / 100})`
        )

      if allocations.some(a => a.amount <= 0):
        throw new BadRequestException('Allocation amounts must be positive')

DTOs (src/core/payment/dto/allocation.dto.ts):
  export class AllocationDto:
    @IsUUID()
    invoiceId: string

    @IsNumber()
    @Min(0.01)
    amount: number

  export class AllocatePaymentDto:
    @IsUUID()
    transactionId: string

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => AllocationDto)
    allocations: AllocationDto[]

  export interface AllocationResult:
    payments: Payment[]
    invoicesUpdated: string[]
    unallocatedAmount: number
    xeroSyncStatus: 'SUCCESS' | 'FAILED' | 'PENDING'
</pseudo_code>

<files_to_create>
  <file path="src/core/payment/payment-allocation.service.ts">PaymentAllocationService implementation</file>
  <file path="src/core/payment/dto/allocation.dto.ts">Allocation DTOs and validation</file>
  <file path="tests/core/payment/payment-allocation.service.spec.ts">Unit tests</file>
  <file path="tests/core/payment/payment-allocation.integration.spec.ts">Integration tests with Xero MCP</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/payment/index.ts">Export PaymentAllocationService</file>
  <file path="src/core/payment/payment.module.ts">Register PaymentAllocationService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Service compiles without TypeScript errors</criterion>
  <criterion>allocatePayment creates payment records correctly</criterion>
  <criterion>Invoice statuses update: SENT -> PARTIALLY_PAID -> PAID</criterion>
  <criterion>Partial payments update amountPaid correctly</criterion>
  <criterion>Combined payments allocate to multiple invoices</criterion>
  <criterion>Overpayments handle excess amount correctly</criterion>
  <criterion>Reversal undoes allocation and updates invoice</criterion>
  <criterion>Xero sync is called after successful allocation</criterion>
  <criterion>Validation prevents total allocations exceeding transaction amount</criterion>
  <criterion>Validation prevents negative or zero allocations</criterion>
  <criterion>Database transactions ensure atomicity</criterion>
  <criterion>Unit tests achieve >90% coverage</criterion>
  <criterion>Integration tests verify Xero sync</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "PaymentAllocationService"</command>
  <command>npm run test:integration -- --grep "payment-allocation"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

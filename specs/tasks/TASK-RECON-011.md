<task_spec id="TASK-RECON-011" version="1.0">

<metadata>
  <title>Bank Reconciliation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>34</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-002</requirement_ref>
    <requirement_ref>REQ-RECON-004</requirement_ref>
    <requirement_ref>REQ-RECON-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-001</task_ref>
    <task_ref>TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the ReconciliationService which handles bank reconciliation
processes for the creche. The service matches bank statement transactions against
Xero records, identifies discrepancies, and ensures the accounting equation holds:
opening balance + deposits - withdrawals = closing balance. Reconciled transactions
are protected from changes to maintain audit integrity. This service enables
accountants to verify that all bank activity is accurately recorded in the books.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#ReconciliationService</file>
  <file purpose="reconciliation_entity">src/database/entities/reconciliation.entity.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="repository">src/database/repositories/reconciliation.repository.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-001 completed (Reconciliation entity exists)</check>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Transaction repository available</check>
  <check>Reconciliation repository available</check>
  <check>NestJS service infrastructure in place</check>
</prerequisites>

<scope>
  <in_scope>
    - Create ReconciliationService class
    - Implement reconcile() method
    - Implement matchTransactions() method
    - Implement markReconciled() method
    - Implement getUnmatched() method
    - Implement calculateBalance() method
    - Validate reconciliation formula (opening + in - out = closing)
    - Protect reconciled transactions from changes
    - Handle discrepancy detection when balances don't match
    - Create reconciliation DTOs (ReconcileDto, ReconcileResultDto)
    - Unit tests for reconciliation service
    - Integration tests for reconciliation flow
  </in_scope>
  <out_of_scope>
    - Discrepancy classification logic (TASK-RECON-012)
    - Resolution suggestions (TASK-RECON-012)
    - Financial report generation (TASK-RECON-013)
    - API endpoints (handled by controller tasks)
    - UI components
    - Xero sync integration
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/reconciliation/reconciliation.service.ts">
      @Injectable()
      export class ReconciliationService {
        constructor(
          private reconciliationRepo: ReconciliationRepository,
          private transactionRepo: TransactionRepository
        ) {}

        async reconcile(dto: ReconcileDto): Promise&lt;ReconcileResultDto&gt; {
          // 1. Validate period and balances
          // 2. Get all transactions in period
          // 3. Calculate sum: opening + debits - credits
          // 4. Compare to closing balance
          // 5. Match transactions to Xero records
          // 6. Mark matched items as reconciled
          // 7. Create reconciliation record
          // 8. Return result with status and discrepancies
        }

        async matchTransactions(
          transactionIds: string[],
          reconId: string
        ): Promise&lt;MatchResult&gt; {
          // Match specific transactions to reconciliation
          // Return matched/unmatched counts
        }

        async markReconciled(transactionIds: string[]): Promise&lt;void&gt; {
          // Set is_reconciled = true
          // Prevent future edits to categorization
          // Log audit trail
        }

        async getUnmatched(
          periodStart: Date,
          periodEnd: Date,
          bankAccount: string
        ): Promise&lt;Transaction[]&gt; {
          // Find transactions in period not yet reconciled
        }

        async calculateBalance(
          periodStart: Date,
          periodEnd: Date,
          openingBalance: number,
          bankAccount: string
        ): Promise&lt;BalanceCalculation&gt; {
          // opening + sum(credits) - sum(debits) = calculated closing
        }
      }
    </signature>
    <signature file="src/core/reconciliation/dto/reconcile.dto.ts">
      export class ReconcileDto {
        @IsString() bankAccount: string;
        @IsDateString() periodStart: string;
        @IsDateString() periodEnd: string;
        @IsNumber() openingBalanceCents: number;
        @IsNumber() closingBalanceCents: number;
      }

      export class ReconcileResultDto {
        id: string;
        status: ReconciliationStatus;
        openingBalance: number;
        closingBalance: number;
        calculatedBalance: number;
        discrepancyCents: number;
        matchedCount: number;
        unmatchedCount: number;
        discrepancies?: DiscrepancyItem[];
      }

      export class BalanceCalculation {
        openingBalanceCents: number;
        totalCreditsCents: number;
        totalDebitsCents: number;
        calculatedBalanceCents: number;
        transactionCount: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Must NOT use 'any' type anywhere
    - Must follow NestJS service patterns
    - Must validate all inputs using class-validator
    - Reconciliation formula must be exact: opening + credits - debits = closing
    - Discrepancy tolerance must be R0.01 (1 cent)
    - Reconciled transactions must be immutable (is_reconciled flag)
    - All monetary values stored as cents (integers)
    - Must handle edge cases: empty periods, zero balances, negative balances
    - Must use database transactions for atomicity
    - Must log all reconciliation actions for audit trail
    - Status must be RECONCILED only if discrepancy === 0
    - Status must be DISCREPANCY if |discrepancy| > 0
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - Integration tests pass for full reconciliation flow
    - Service can handle period with no transactions
    - Service correctly calculates balance from transactions
    - Service detects discrepancies accurately
    - Reconciled transactions cannot be modified
    - Service handles concurrent reconciliations safely
    - All DTOs have proper validation decorators
    - Error handling works for invalid inputs
  </verification>
</definition_of_done>

<pseudo_code>
DTOs (src/core/reconciliation/dto/reconcile.dto.ts):
  export class ReconcileDto:
    @IsString() @MinLength(1) bankAccount: string
    @IsDateString() periodStart: string
    @IsDateString() periodEnd: string
    @IsInt() openingBalanceCents: number
    @IsInt() closingBalanceCents: number

  export class ReconcileResultDto:
    id: string
    status: ReconciliationStatus
    openingBalance: number
    closingBalance: number
    calculatedBalance: number
    discrepancyCents: number
    matchedCount: number
    unmatchedCount: number
    discrepancies?: DiscrepancyItem[]

  export class BalanceCalculation:
    openingBalanceCents: number
    totalCreditsCents: number
    totalDebitsCents: number
    calculatedBalanceCents: number
    transactionCount: number

  export class MatchResult:
    matchedCount: number
    unmatchedCount: number
    matchedTransactionIds: string[]

Service (src/core/reconciliation/reconciliation.service.ts):
  @Injectable()
  export class ReconciliationService:
    constructor(
      private reconciliationRepo: ReconciliationRepository,
      private transactionRepo: TransactionRepository,
      private prisma: PrismaService
    )

    async reconcile(dto: ReconcileDto, tenantId: string, userId: string):
      // Convert dates
      periodStart = new Date(dto.periodStart)
      periodEnd = new Date(dto.periodEnd)

      // Check for existing reconciliation
      existing = await reconciliationRepo.findByTenantAndAccount(
        tenantId, dto.bankAccount, periodStart
      )
      if (existing && existing.status === RECONCILED):
        throw ConflictException("Period already reconciled")

      // Get all transactions in period
      transactions = await transactionRepo.findByPeriodAndAccount(
        tenantId, dto.bankAccount, periodStart, periodEnd
      )

      // Calculate balance from transactions
      calculation = await calculateBalance(
        periodStart, periodEnd, dto.openingBalanceCents, dto.bankAccount
      )

      // Calculate discrepancy
      discrepancyCents = dto.closingBalanceCents - calculation.calculatedBalanceCents

      // Determine status
      status = (Math.abs(discrepancyCents) <= 1) ? RECONCILED : DISCREPANCY

      // Start database transaction
      return await prisma.$transaction(async (tx):
        // Mark all matched transactions as reconciled
        if (status === RECONCILED):
          await markReconciled(transactions.map(t => t.id), tx)

        // Create reconciliation record
        reconciliation = await reconciliationRepo.create({
          tenantId,
          bankAccount: dto.bankAccount,
          periodStart,
          periodEnd,
          openingBalanceCents: dto.openingBalanceCents,
          closingBalanceCents: dto.closingBalanceCents,
          calculatedBalanceCents: calculation.calculatedBalanceCents,
          discrepancyCents,
          status,
          reconciledBy: (status === RECONCILED) ? userId : null,
          reconciledAt: (status === RECONCILED) ? new Date() : null
        }, tx)

        // Build result
        result = {
          id: reconciliation.id,
          status: reconciliation.status,
          openingBalance: reconciliation.openingBalanceCents / 100,
          closingBalance: reconciliation.closingBalanceCents / 100,
          calculatedBalance: calculation.calculatedBalanceCents / 100,
          discrepancyCents,
          matchedCount: transactions.length,
          unmatchedCount: 0
        }

        return result
      )

    async calculateBalance(
      periodStart: Date,
      periodEnd: Date,
      openingBalanceCents: number,
      bankAccount: string,
      tenantId: string
    ): Promise<BalanceCalculation>
      transactions = await transactionRepo.findByPeriodAndAccount(
        tenantId, bankAccount, periodStart, periodEnd
      )

      totalCreditsCents = 0
      totalDebitsCents = 0

      for each transaction in transactions:
        if (transaction.is_credit):
          totalCreditsCents += transaction.amountCents
        else:
          totalDebitsCents += transaction.amountCents

      calculatedBalanceCents =
        openingBalanceCents + totalCreditsCents - totalDebitsCents

      return {
        openingBalanceCents,
        totalCreditsCents,
        totalDebitsCents,
        calculatedBalanceCents,
        transactionCount: transactions.length
      }

    async markReconciled(
      transactionIds: string[],
      tx?: PrismaTransaction
    ): Promise<void>
      if (transactionIds.length === 0):
        return

      await transactionRepo.updateMany(
        { id: { in: transactionIds } },
        { is_reconciled: true, reconciled_at: new Date() },
        tx
      )

      // Log audit event
      logger.log(`Marked ${transactionIds.length} transactions as reconciled`)

    async getUnmatched(
      periodStart: Date,
      periodEnd: Date,
      bankAccount: string,
      tenantId: string
    ): Promise<Transaction[]>
      return await transactionRepo.findByPeriodAndAccount(
        tenantId,
        bankAccount,
        periodStart,
        periodEnd,
        { is_reconciled: false }
      )

    async matchTransactions(
      transactionIds: string[],
      reconId: string,
      tenantId: string
    ): Promise<MatchResult>
      // Verify reconciliation exists and is not finalized
      recon = await reconciliationRepo.findById(reconId)
      if (!recon):
        throw NotFoundException("Reconciliation not found")
      if (recon.status === RECONCILED):
        throw ConflictException("Cannot modify reconciled period")

      // Validate transactions belong to tenant and period
      transactions = await transactionRepo.findByIds(transactionIds)
      validTransactions = transactions.filter(t =>
        t.tenantId === tenantId &&
        t.date >= recon.periodStart &&
        t.date <= recon.periodEnd
      )

      // Mark as reconciled
      await markReconciled(validTransactions.map(t => t.id))

      return {
        matchedCount: validTransactions.length,
        unmatchedCount: transactionIds.length - validTransactions.length,
        matchedTransactionIds: validTransactions.map(t => t.id)
      }
</pseudo_code>

<files_to_create>
  <file path="src/core/reconciliation/reconciliation.service.ts">ReconciliationService class</file>
  <file path="src/core/reconciliation/dto/reconcile.dto.ts">Reconciliation DTOs</file>
  <file path="src/core/reconciliation/dto/index.ts">Export barrel file</file>
  <file path="tests/core/reconciliation/reconciliation.service.spec.ts">Service unit tests</file>
  <file path="tests/integration/reconciliation.integration.spec.ts">Integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/reconciliation/reconciliation.module.ts">Register service as provider</file>
  <file path="src/database/repositories/transaction.repository.ts">Add findByPeriodAndAccount method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Service reconciles period with matching balances successfully</criterion>
  <criterion>Service detects discrepancies when balances don't match</criterion>
  <criterion>Reconciliation formula (opening + credits - debits = closing) is accurate</criterion>
  <criterion>Reconciled transactions are marked and protected from changes</criterion>
  <criterion>Unmatched transactions can be retrieved for review</criterion>
  <criterion>Balance calculation handles credits and debits correctly</criterion>
  <criterion>Service prevents duplicate reconciliations for same period</criterion>
  <criterion>Service handles empty periods gracefully</criterion>
  <criterion>All monetary values stored and calculated as cents</criterion>
  <criterion>Database transactions ensure atomicity</criterion>
  <criterion>Audit trail logged for all reconciliation actions</criterion>
  <criterion>Status correctly set to RECONCILED or DISCREPANCY</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "ReconciliationService"</command>
  <command>npm run test:integration -- --grep "Reconciliation"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

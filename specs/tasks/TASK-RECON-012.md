<task_spec id="TASK-RECON-012" version="1.0">

<metadata>
  <title>Discrepancy Detection Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>35</sequence>
  <implements>
    <requirement_ref>REQ-RECON-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-RECON-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the DiscrepancyService which identifies and classifies
reconciliation discrepancies. When bank statements don't match Xero records,
this service analyzes the differences, classifies them by type (missing from
bank, missing from Xero, amount mismatch, date mismatch), suggests resolutions,
and alerts accountants. The service ensures discrepancies above R0.01 threshold
are flagged for investigation and provides actionable insights for resolution.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#ReconciliationService</file>
  <file purpose="reconciliation_service">src/core/reconciliation/reconciliation.service.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-RECON-011 completed (ReconciliationService exists)</check>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Transaction repository available</check>
  <check>NestJS service infrastructure in place</check>
</prerequisites>

<scope>
  <in_scope>
    - Create DiscrepancyService class
    - Implement detectDiscrepancies() method
    - Implement classifyDiscrepancy() method
    - Implement suggestResolution() method
    - Implement reportDiscrepancy() method
    - Define discrepancy types (IN_BANK_NOT_XERO, IN_XERO_NOT_BANK, AMOUNT_MISMATCH, DATE_MISMATCH)
    - Threshold detection (alert on >R0.01)
    - Create discrepancy DTOs
    - Generate resolution suggestions
    - Unit tests for discrepancy service
  </in_scope>
  <out_of_scope>
    - Actual reconciliation logic (TASK-RECON-011)
    - Financial report generation (TASK-RECON-013)
    - Automatic resolution (manual review required)
    - API endpoints
    - UI components
    - Email/notification delivery (just flag for reporting)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/reconciliation/discrepancy.service.ts">
      export enum DiscrepancyType {
        IN_BANK_NOT_XERO = 'IN_BANK_NOT_XERO',
        IN_XERO_NOT_BANK = 'IN_XERO_NOT_BANK',
        AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
        DATE_MISMATCH = 'DATE_MISMATCH'
      }

      @Injectable()
      export class DiscrepancyService {
        constructor(
          private transactionRepo: TransactionRepository,
          private reconciliationRepo: ReconciliationRepository
        ) {}

        async detectDiscrepancies(
          reconId: string
        ): Promise&lt;DiscrepancyReport&gt; {
          // 1. Get reconciliation record
          // 2. Get all transactions in period
          // 3. Get Xero records for same period
          // 4. Compare and identify discrepancies
          // 5. Classify each discrepancy
          // 6. Return structured report
        }

        classifyDiscrepancy(
          bankTx?: Transaction,
          xeroTx?: any
        ): DiscrepancyClassification {
          // IN_BANK_NOT_XERO: bankTx exists, xeroTx null
          // IN_XERO_NOT_BANK: xeroTx exists, bankTx null
          // AMOUNT_MISMATCH: both exist, amounts differ
          // DATE_MISMATCH: both exist, dates differ
        }

        suggestResolution(
          discrepancy: Discrepancy
        ): ResolutionSuggestion {
          // Suggest actions based on discrepancy type
          // Examples: "Create manual entry in Xero",
          // "Verify bank statement", "Adjust transaction date"
        }

        async reportDiscrepancy(
          discrepancy: Discrepancy,
          tenantId: string
        ): Promise&lt;void&gt; {
          // Log discrepancy for reporting
          // Flag for accountant review
        }
      }
    </signature>
    <signature file="src/core/reconciliation/dto/discrepancy.dto.ts">
      export enum DiscrepancyType {
        IN_BANK_NOT_XERO = 'IN_BANK_NOT_XERO',
        IN_XERO_NOT_BANK = 'IN_XERO_NOT_BANK',
        AMOUNT_MISMATCH = 'AMOUNT_MISMATCH',
        DATE_MISMATCH = 'DATE_MISMATCH'
      }

      export class Discrepancy {
        type: DiscrepancyType;
        transactionId?: string;
        xeroTransactionId?: string;
        description: string;
        amountCents: number;
        date?: Date;
        expectedAmount?: number;
        actualAmount?: number;
        severity: 'LOW' | 'MEDIUM' | 'HIGH';
      }

      export class DiscrepancyReport {
        reconciliationId: string;
        totalDiscrepancyCents: number;
        discrepancyCount: number;
        discrepancies: Discrepancy[];
        summary: {
          inBankNotXero: number;
          inXeroNotBank: number;
          amountMismatches: number;
          dateMismatches: number;
        };
      }

      export class ResolutionSuggestion {
        action: string;
        description: string;
        automatable: boolean;
        estimatedImpact: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Must NOT use 'any' type anywhere (except for Xero API responses, which should be typed)
    - Must follow NestJS service patterns
    - Discrepancy threshold is R0.01 (1 cent)
    - All discrepancies must be classified into one of 4 types
    - Severity levels: LOW (<R10), MEDIUM (R10-R100), HIGH (>R100)
    - Must handle null/undefined safely
    - Must validate all inputs
    - Resolution suggestions must be actionable
    - All monetary values in cents (integers)
    - Must log all detected discrepancies
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass
    - Service detects IN_BANK_NOT_XERO correctly
    - Service detects IN_XERO_NOT_BANK correctly
    - Service detects AMOUNT_MISMATCH correctly
    - Service detects DATE_MISMATCH correctly
    - Severity classification works correctly
    - Discrepancies above R0.01 are flagged
    - Resolution suggestions are appropriate for each type
    - Report summary calculations are accurate
  </verification>
</definition_of_done>

<pseudo_code>
Enums and DTOs (src/core/reconciliation/dto/discrepancy.dto.ts):
  export enum DiscrepancyType:
    IN_BANK_NOT_XERO = 'IN_BANK_NOT_XERO'
    IN_XERO_NOT_BANK = 'IN_XERO_NOT_BANK'
    AMOUNT_MISMATCH = 'AMOUNT_MISMATCH'
    DATE_MISMATCH = 'DATE_MISMATCH'

  export class Discrepancy:
    type: DiscrepancyType
    transactionId?: string
    xeroTransactionId?: string
    description: string
    amountCents: number
    date?: Date
    expectedAmount?: number
    actualAmount?: number
    severity: 'LOW' | 'MEDIUM' | 'HIGH'

  export class DiscrepancyReport:
    reconciliationId: string
    totalDiscrepancyCents: number
    discrepancyCount: number
    discrepancies: Discrepancy[]
    summary: {
      inBankNotXero: number
      inXeroNotBank: number
      amountMismatches: number
      dateMismatches: number
    }

  export class ResolutionSuggestion:
    action: string
    description: string
    automatable: boolean
    estimatedImpact: number

Service (src/core/reconciliation/discrepancy.service.ts):
  @Injectable()
  export class DiscrepancyService:
    constructor(
      private transactionRepo: TransactionRepository,
      private reconciliationRepo: ReconciliationRepository,
      private logger: LoggerService
    )

    async detectDiscrepancies(reconId: string, tenantId: string):
      // Get reconciliation record
      recon = await reconciliationRepo.findById(reconId)
      if (!recon):
        throw NotFoundException("Reconciliation not found")

      // Get all bank transactions in period
      bankTxs = await transactionRepo.findByPeriodAndAccount(
        tenantId,
        recon.bankAccount,
        recon.periodStart,
        recon.periodEnd
      )

      // TODO: Get Xero transactions for same period
      // xeroTxs = await xeroService.getTransactions(...)
      // For now, simulate with empty array
      xeroTxs = []

      discrepancies = []
      summary = {
        inBankNotXero: 0,
        inXeroNotBank: 0,
        amountMismatches: 0,
        dateMismatches: 0
      }

      // Create maps for efficient lookup
      bankTxMap = new Map(bankTxs.map(tx => [tx.reference, tx]))
      xeroTxMap = new Map(xeroTxs.map(tx => [tx.reference, tx]))

      // Check for bank transactions not in Xero
      for each bankTx in bankTxs:
        xeroTx = xeroTxMap.get(bankTx.reference)
        if (!xeroTx):
          discrepancy = {
            type: DiscrepancyType.IN_BANK_NOT_XERO,
            transactionId: bankTx.id,
            description: `Transaction in bank not found in Xero: ${bankTx.description}`,
            amountCents: bankTx.amountCents,
            date: bankTx.date,
            severity: calculateSeverity(Math.abs(bankTx.amountCents))
          }
          discrepancies.push(discrepancy)
          summary.inBankNotXero++
        else:
          // Check for amount mismatch
          if (bankTx.amountCents !== xeroTx.amountCents):
            discrepancy = {
              type: DiscrepancyType.AMOUNT_MISMATCH,
              transactionId: bankTx.id,
              xeroTransactionId: xeroTx.id,
              description: `Amount mismatch: Bank=${bankTx.amountCents/100}, Xero=${xeroTx.amountCents/100}`,
              amountCents: Math.abs(bankTx.amountCents - xeroTx.amountCents),
              date: bankTx.date,
              expectedAmount: xeroTx.amountCents,
              actualAmount: bankTx.amountCents,
              severity: calculateSeverity(Math.abs(bankTx.amountCents - xeroTx.amountCents))
            }
            discrepancies.push(discrepancy)
            summary.amountMismatches++

          // Check for date mismatch
          else if (!isSameDate(bankTx.date, xeroTx.date)):
            discrepancy = {
              type: DiscrepancyType.DATE_MISMATCH,
              transactionId: bankTx.id,
              xeroTransactionId: xeroTx.id,
              description: `Date mismatch: Bank=${bankTx.date}, Xero=${xeroTx.date}`,
              amountCents: 0,
              date: bankTx.date,
              severity: 'LOW'
            }
            discrepancies.push(discrepancy)
            summary.dateMismatches++

      // Check for Xero transactions not in bank
      for each xeroTx in xeroTxs:
        if (!bankTxMap.has(xeroTx.reference)):
          discrepancy = {
            type: DiscrepancyType.IN_XERO_NOT_BANK,
            xeroTransactionId: xeroTx.id,
            description: `Transaction in Xero not found in bank: ${xeroTx.description}`,
            amountCents: xeroTx.amountCents,
            date: xeroTx.date,
            severity: calculateSeverity(Math.abs(xeroTx.amountCents))
          }
          discrepancies.push(discrepancy)
          summary.inXeroNotBank++

      // Calculate total discrepancy
      totalDiscrepancyCents = discrepancies.reduce(
        (sum, d) => sum + Math.abs(d.amountCents),
        0
      )

      // Build report
      report = {
        reconciliationId: reconId,
        totalDiscrepancyCents,
        discrepancyCount: discrepancies.length,
        discrepancies,
        summary
      }

      // Log discrepancies for audit
      if (discrepancies.length > 0):
        logger.warn(
          `Detected ${discrepancies.length} discrepancies for reconciliation ${reconId}`
        )

      return report

    classifyDiscrepancy(
      bankTx?: Transaction,
      xeroTx?: any
    ): DiscrepancyType
      if (bankTx && !xeroTx):
        return DiscrepancyType.IN_BANK_NOT_XERO

      if (xeroTx && !bankTx):
        return DiscrepancyType.IN_XERO_NOT_BANK

      if (bankTx && xeroTx):
        if (bankTx.amountCents !== xeroTx.amountCents):
          return DiscrepancyType.AMOUNT_MISMATCH

        if (!isSameDate(bankTx.date, xeroTx.date)):
          return DiscrepancyType.DATE_MISMATCH

      return null // No discrepancy

    suggestResolution(discrepancy: Discrepancy): ResolutionSuggestion
      switch (discrepancy.type):
        case DiscrepancyType.IN_BANK_NOT_XERO:
          return {
            action: 'CREATE_XERO_ENTRY',
            description: 'Create a manual entry in Xero to match this bank transaction',
            automatable: false,
            estimatedImpact: Math.abs(discrepancy.amountCents)
          }

        case DiscrepancyType.IN_XERO_NOT_BANK:
          return {
            action: 'VERIFY_BANK_STATEMENT',
            description: 'Verify if this transaction is missing from bank statement or incorrectly entered in Xero',
            automatable: false,
            estimatedImpact: Math.abs(discrepancy.amountCents)
          }

        case DiscrepancyType.AMOUNT_MISMATCH:
          return {
            action: 'ADJUST_AMOUNT',
            description: `Adjust amount in Xero from ${discrepancy.expectedAmount/100} to ${discrepancy.actualAmount/100}`,
            automatable: false,
            estimatedImpact: Math.abs(discrepancy.amountCents)
          }

        case DiscrepancyType.DATE_MISMATCH:
          return {
            action: 'ADJUST_DATE',
            description: 'Update transaction date in Xero to match bank statement',
            automatable: false,
            estimatedImpact: 0
          }

    async reportDiscrepancy(
      discrepancy: Discrepancy,
      tenantId: string
    ): Promise<void>
      // Log for audit trail
      logger.warn({
        tenantId,
        discrepancyType: discrepancy.type,
        amountCents: discrepancy.amountCents,
        severity: discrepancy.severity,
        description: discrepancy.description
      })

      // Store in database for reporting (optional)
      // await discrepancyRepo.create(...)

    private calculateSeverity(amountCents: number): 'LOW' | 'MEDIUM' | 'HIGH'
      absAmount = Math.abs(amountCents)
      if (absAmount > 10000): // > R100
        return 'HIGH'
      else if (absAmount > 1000): // > R10
        return 'MEDIUM'
      else:
        return 'LOW'

    private isSameDate(date1: Date, date2: Date): boolean
      return (
        date1.getFullYear() === date2.getFullYear() &&
        date1.getMonth() === date2.getMonth() &&
        date1.getDate() === date2.getDate()
      )
</pseudo_code>

<files_to_create>
  <file path="src/core/reconciliation/discrepancy.service.ts">DiscrepancyService class</file>
  <file path="src/core/reconciliation/dto/discrepancy.dto.ts">Discrepancy DTOs and enums</file>
  <file path="tests/core/reconciliation/discrepancy.service.spec.ts">Service unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/reconciliation/reconciliation.module.ts">Register DiscrepancyService as provider</file>
  <file path="src/core/reconciliation/dto/index.ts">Export discrepancy DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Service detects transactions in bank but not in Xero</criterion>
  <criterion>Service detects transactions in Xero but not in bank</criterion>
  <criterion>Service detects amount mismatches between bank and Xero</criterion>
  <criterion>Service detects date mismatches between bank and Xero</criterion>
  <criterion>Severity levels calculated correctly (LOW, MEDIUM, HIGH)</criterion>
  <criterion>Discrepancies above R0.01 are flagged</criterion>
  <criterion>Resolution suggestions are appropriate for each discrepancy type</criterion>
  <criterion>Report summary aggregates counts by type correctly</criterion>
  <criterion>Total discrepancy amount calculated correctly</criterion>
  <criterion>Service handles empty result sets gracefully</criterion>
  <criterion>All discrepancies logged for audit trail</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "DiscrepancyService"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

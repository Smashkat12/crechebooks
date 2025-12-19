<task_spec id="TASK-PAY-011" version="1.0">

<metadata>
  <title>Payment Matching Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>24</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
    <requirement_ref>REQ-PAY-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the PaymentMatchingService which uses AI-powered Claude Code agents to
automatically match bank transactions to outstanding invoices. The service implements
intelligent matching by reference number, amount, and payer name with confidence scoring.
Matches with 100% confidence (exact) or >=80% confidence are automatically applied. Lower
confidence matches are flagged for manual review. This dramatically reduces manual payment
allocation work and ensures accurate invoice payment tracking.
</context>

<input_context_files>
  <file purpose="api_contracts">specs/technical/api-contracts.md#PaymentService</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="payment_entity">src/database/entities/payment.entity.ts</file>
  <file purpose="invoice_entity">src/database/entities/invoice.entity.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PAY-001 completed (Payment entity exists)</check>
  <check>TASK-BILL-003 completed (Invoice entity exists)</check>
  <check>TASK-TRANS-001 completed (Transaction entity exists)</check>
  <check>Claude Code agent framework available</check>
  <check>Payment repository available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PaymentMatchingService
    - Implement matchPayments method with Claude Code agent integration
    - Implement findExactMatches (reference + amount + invoice)
    - Implement findPartialMatches (fuzzy matching on payer name)
    - Implement calculateConfidence scoring algorithm
    - Implement autoApplyMatches for high-confidence matches
    - Create MatchingResult DTOs
    - Create AI agent prompt templates for payment matching
    - Support multiple match candidates per transaction
    - Handle edge cases (multiple invoices with same amount)
  </in_scope>
  <out_of_scope>
    - Payment allocation logic (TASK-PAY-012)
    - API endpoints (API layer tasks)
    - Xero synchronization (handled by allocation service)
    - Manual payment allocation UI
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/payment/payment-matching.service.ts">
      @Injectable()
      export class PaymentMatchingService {
        constructor(
          private prisma: PrismaService,
          private paymentRepository: PaymentRepository,
          private invoiceRepository: InvoiceRepository,
          private transactionRepository: TransactionRepository,
          private claudeAgent: ClaudeAgentService
        ) {}

        async matchPayments(
          transactionIds?: string[],
          tenantId: string
        ): Promise&lt;MatchingResult&gt;

        async findExactMatches(
          transaction: Transaction,
          invoices: Invoice[]
        ): Promise&lt;MatchCandidate[]&gt;

        async findPartialMatches(
          transaction: Transaction,
          invoices: Invoice[]
        ): Promise&lt;MatchCandidate[]&gt;

        async calculateConfidence(
          transaction: Transaction,
          invoice: Invoice
        ): Promise&lt;number&gt;

        async autoApplyMatches(
          matches: MatchCandidate[],
          userId: string
        ): Promise&lt;AppliedMatch[]&gt;

        private buildMatchingPrompt(
          transaction: Transaction,
          invoices: Invoice[]
        ): string

        private parseAgentResponse(
          response: string
        ): MatchCandidate[]
      }
    </signature>
    <signature file="src/core/payment/dto/matching.dto.ts">
      export interface MatchCandidate {
        transactionId: string;
        invoiceId: string;
        invoiceNumber: string;
        matchType: MatchType;
        confidence: number;
        matchReason: string;
        parentName: string;
        childName: string;
        invoiceAmount: number;
        transactionAmount: number;
      }

      export interface MatchingResult {
        autoMatched: number;
        requiresReview: number;
        noMatch: number;
        matches: AppliedMatch[];
        reviewRequired: ReviewMatch[];
      }

      export interface AppliedMatch {
        transactionId: string;
        invoiceId: string;
        matchType: MatchType;
        confidence: number;
        autoApplied: boolean;
      }

      export interface ReviewMatch {
        transactionId: string;
        suggestedMatches: MatchCandidate[];
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Claude Code agent for intelligent matching
    - Exact match: reference matches invoice number AND amount matches
    - Confidence threshold for auto-apply: >=80%
    - Confidence threshold for exact match: 100%
    - Confidence threshold for review: <80%
    - Must handle transactions without reference numbers
    - Must handle fuzzy name matching (e.g., "J Smith" vs "John Smith")
    - Must handle multiple invoices for same parent
    - Must NOT auto-apply if multiple high-confidence matches exist
    - Must log all AI agent decisions for audit
    - Must handle edge case: payment exceeds invoice amount
    - Must validate tenant isolation (all entities belong to same tenant)
  </constraints>

  <verification>
    - Service instantiates without errors
    - matchPayments returns correct structure
    - Exact matches have 100% confidence
    - Reference + amount matches are identified
    - Fuzzy name matching works correctly
    - Auto-apply only triggers for confidence >=80%
    - Multiple match candidates flag for review
    - Claude Code agent integration works
    - Unit tests pass with mocked agent
    - Integration tests with real agent pass
  </verification>
</definition_of_done>

<pseudo_code>
PaymentMatchingService (src/core/payment/payment-matching.service.ts):
  @Injectable()
  export class PaymentMatchingService:
    constructor(
      private prisma: PrismaService,
      private paymentRepository: PaymentRepository,
      private invoiceRepository: InvoiceRepository,
      private transactionRepository: TransactionRepository,
      private claudeAgent: ClaudeAgentService
    )

    async matchPayments(transactionIds?: string[], tenantId: string): Promise<MatchingResult>:
      // 1. Get unallocated credit transactions
      transactions = transactionIds
        ? await transactionRepository.findByIds(transactionIds, tenantId)
        : await transactionRepository.findUnallocatedCredits(tenantId)

      // 2. Get outstanding invoices for this tenant
      outstandingInvoices = await invoiceRepository.findOutstanding(tenantId)

      // 3. Initialize result counters
      result = {
        autoMatched: 0,
        requiresReview: 0,
        noMatch: 0,
        matches: [],
        reviewRequired: []
      }

      // 4. Process each transaction
      for transaction in transactions:
        // Try exact matches first
        exactMatches = await findExactMatches(transaction, outstandingInvoices)

        if exactMatches.length === 1:
          // Single exact match - auto apply
          applied = await autoApplyMatches([exactMatches[0]], 'SYSTEM')
          result.autoMatched++
          result.matches.push(applied[0])
          continue

        // Try AI-powered matching
        candidates = await findPartialMatches(transaction, outstandingInvoices)

        if candidates.length === 0:
          result.noMatch++
          continue

        // Check if we have high-confidence single match
        highConfidence = candidates.filter(c => c.confidence >= 80)

        if highConfidence.length === 1:
          applied = await autoApplyMatches([highConfidence[0]], 'SYSTEM')
          result.autoMatched++
          result.matches.push(applied[0])
        else:
          // Multiple matches or low confidence - flag for review
          result.requiresReview++
          result.reviewRequired.push({
            transactionId: transaction.id,
            suggestedMatches: candidates.slice(0, 5) // Top 5 suggestions
          })

      return result

    async findExactMatches(transaction: Transaction, invoices: Invoice[]): Promise<MatchCandidate[]>:
      if !transaction.reference:
        return []

      matches = []
      for invoice in invoices:
        // Exact match: reference matches invoice number AND amount matches
        if invoice.invoiceNumber === transaction.reference:
          amountMatch = Math.abs(transaction.amountCents) === invoice.totalCents - invoice.amountPaidCents

          if amountMatch:
            matches.push({
              transactionId: transaction.id,
              invoiceId: invoice.id,
              invoiceNumber: invoice.invoiceNumber,
              matchType: MatchType.EXACT,
              confidence: 100,
              matchReason: 'Reference and amount exact match',
              parentName: invoice.parent.name,
              childName: invoice.child.name,
              invoiceAmount: invoice.totalCents / 100,
              transactionAmount: Math.abs(transaction.amountCents) / 100
            })

      return matches

    async findPartialMatches(transaction: Transaction, invoices: Invoice[]): Promise<MatchCandidate[]>:
      // Build prompt for Claude Code agent
      prompt = buildMatchingPrompt(transaction, invoices)

      // Invoke Claude Code agent
      agentResponse = await claudeAgent.invokeAgent('payment-matcher', prompt)

      // Parse agent response into match candidates
      candidates = parseAgentResponse(agentResponse)

      // Calculate confidence for each candidate
      for candidate in candidates:
        candidate.confidence = await calculateConfidence(transaction, invoice)

      // Sort by confidence descending
      candidates.sort((a, b) => b.confidence - a.confidence)

      return candidates

    async calculateConfidence(transaction: Transaction, invoice: Invoice): Promise<number>:
      score = 0

      // Amount match (50 points)
      transactionAmt = Math.abs(transaction.amountCents)
      outstandingAmt = invoice.totalCents - invoice.amountPaidCents

      if transactionAmt === outstandingAmt:
        score += 50
      else if Math.abs(transactionAmt - outstandingAmt) / outstandingAmt < 0.05:
        score += 40 // Within 5%

      // Reference match (30 points)
      if transaction.reference:
        if transaction.reference === invoice.invoiceNumber:
          score += 30
        else if transaction.reference.includes(invoice.invoiceNumber.substr(-4)):
          score += 20 // Partial reference match

      // Payer name match (20 points)
      if transaction.payeeName:
        parentName = invoice.parent.name.toLowerCase()
        payeeName = transaction.payeeName.toLowerCase()

        if payeeName.includes(parentName) || parentName.includes(payeeName):
          score += 20
        else:
          // Fuzzy match using Levenshtein distance
          similarity = calculateStringSimilarity(payeeName, parentName)
          if similarity > 0.7:
            score += 15

      return Math.min(score, 100)

    async autoApplyMatches(matches: MatchCandidate[], userId: string): Promise<AppliedMatch[]>:
      applied = []

      for match in matches:
        // Create payment record (via allocation service in TASK-PAY-012)
        // For now, just mark as matched
        payment = await paymentRepository.create({
          tenantId: match.tenantId,
          transactionId: match.transactionId,
          invoiceId: match.invoiceId,
          amountCents: match.transactionAmount * 100,
          paymentDate: match.transaction.date,
          reference: match.transaction.reference,
          matchType: match.matchType,
          matchConfidence: match.confidence,
          matchedBy: match.confidence === 100 ? MatchedBy.AI_AUTO : MatchedBy.AI_AUTO
        })

        applied.push({
          transactionId: match.transactionId,
          invoiceId: match.invoiceId,
          matchType: match.matchType,
          confidence: match.confidence,
          autoApplied: true
        })

      return applied

    private buildMatchingPrompt(transaction: Transaction, invoices: Invoice[]): string:
      return `
        You are a payment matching expert for a South African creche.

        Transaction to match:
        - Date: ${transaction.date}
        - Description: ${transaction.description}
        - Payer: ${transaction.payeeName || 'Unknown'}
        - Reference: ${transaction.reference || 'None'}
        - Amount: R${Math.abs(transaction.amountCents) / 100}

        Outstanding invoices:
        ${invoices.map(inv => `
        - Invoice: ${inv.invoiceNumber}
        - Parent: ${inv.parent.name}
        - Child: ${inv.child.name}
        - Amount due: R${(inv.totalCents - inv.amountPaidCents) / 100}
        - Due date: ${inv.dueDate}
        `).join('\n')}

        Task: Identify which invoice(s) this transaction most likely pays.
        Consider: reference numbers, amounts, payer names, and dates.
        Return top 3 matches with reasoning.
      `

    private parseAgentResponse(response: string): MatchCandidate[]:
      // Parse Claude Code agent's structured response
      // Expected format: JSON array of matches
      try:
        parsed = JSON.parse(response)
        return parsed.map(p => ({
          ...p,
          matchType: MatchType.PARTIAL // Will be updated based on confidence
        }))
      catch error:
        logger.error('Failed to parse agent response', error)
        return []

DTOs (src/core/payment/dto/matching.dto.ts):
  export interface MatchCandidate:
    transactionId: string
    invoiceId: string
    invoiceNumber: string
    matchType: MatchType
    confidence: number
    matchReason: string
    parentName: string
    childName: string
    invoiceAmount: number
    transactionAmount: number

  export interface MatchingResult:
    autoMatched: number
    requiresReview: number
    noMatch: number
    matches: AppliedMatch[]
    reviewRequired: ReviewMatch[]

  export interface AppliedMatch:
    transactionId: string
    invoiceId: string
    matchType: MatchType
    confidence: number
    autoApplied: boolean

  export interface ReviewMatch:
    transactionId: string
    suggestedMatches: MatchCandidate[]

Agent Prompt Template (src/core/payment/prompts/payment-matching.prompt.ts):
  export const PAYMENT_MATCHING_PROMPT = `...`
</pseudo_code>

<files_to_create>
  <file path="src/core/payment/payment-matching.service.ts">PaymentMatchingService with AI agent integration</file>
  <file path="src/core/payment/dto/matching.dto.ts">MatchingResult and MatchCandidate DTOs</file>
  <file path="src/core/payment/prompts/payment-matching.prompt.ts">Claude Code agent prompt templates</file>
  <file path="tests/core/payment/payment-matching.service.spec.ts">Unit tests with mocked agent</file>
  <file path="tests/core/payment/payment-matching.integration.spec.ts">Integration tests with real agent</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/payment/index.ts">Export PaymentMatchingService</file>
  <file path="src/core/payment/payment.module.ts">Register PaymentMatchingService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Service compiles without TypeScript errors</criterion>
  <criterion>matchPayments correctly identifies exact matches (100% confidence)</criterion>
  <criterion>Reference + amount matching works correctly</criterion>
  <criterion>Fuzzy name matching identifies partial matches</criterion>
  <criterion>Auto-apply only triggers for confidence >=80%</criterion>
  <criterion>Multiple high-confidence matches flag for review</criterion>
  <criterion>Claude Code agent integration works</criterion>
  <criterion>Agent prompt is well-structured and clear</criterion>
  <criterion>Edge cases handled: no reference, multiple invoices, overpayment</criterion>
  <criterion>All matches respect tenant isolation</criterion>
  <criterion>Unit tests achieve >90% coverage</criterion>
  <criterion>Integration tests verify end-to-end matching</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "PaymentMatchingService"</command>
  <command>npm run test:integration -- --grep "payment-matching"</command>
  <command>npm run lint</command>
</test_commands>

</task_spec>

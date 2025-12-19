<task_spec id="TASK-TRANS-012" version="1.0">

<metadata>
  <title>Transaction Categorization Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>17</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
    <requirement_ref>REQ-TRANS-004</requirement_ref>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
    <requirement_ref>REQ-TRANS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-002</task_ref>
    <task_ref>TASK-TRANS-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the CategorizationService which orchestrates AI-powered transaction
categorization using Claude Code agents. The service loads tenant-specific patterns,
invokes the AI categorization agent, applies confidence thresholds (>=80% auto-apply,
<80% review required), handles split transactions, and maintains audit trails. This
is the core intelligence layer that automates bookkeeping categorization.
</context>

<input_context_files>
  <file purpose="api_contract">specs/technical/api-contracts.md#TransactionService.categorizeTransactions</file>
  <file purpose="categorization_entity">src/database/entities/categorization.entity.ts</file>
  <file purpose="payee_pattern_entity">src/database/entities/payee-pattern.entity.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="requirements">specs/requirements/REQ-TRANS.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-002 completed (Categorization entity exists)</check>
  <check>TASK-TRANS-003 completed (PayeePattern entity exists)</check>
  <check>Claude Code MCP integration available</check>
  <check>Xero MCP server configured for sync</check>
</prerequisites>

<scope>
  <in_scope>
    - Create CategorizationService in src/core/transaction/
    - Implement AI categorization with Claude Code agent
    - Load and apply existing PayeePatterns
    - Handle confidence thresholds (80% auto vs review)
    - Support split transaction categorization
    - Validate split amounts equal transaction total
    - Create audit trail for all categorizations
    - Queue Xero sync for auto-categorized transactions
    - Return categorization statistics
  </in_scope>
  <out_of_scope>
    - Pattern learning logic (TASK-TRANS-013)
    - Xero sync implementation (TASK-TRANS-014)
    - User correction UI
    - Manual categorization endpoint (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/transaction/categorization.service.ts">
      @Injectable()
      export class CategorizationService {
        constructor(
          private readonly transactionRepo: TransactionRepository,
          private readonly categorizationRepo: CategorizationRepository,
          private readonly payeePatternRepo: PayeePatternRepository,
          private readonly coaRepo: ChartOfAccountsRepository,
          @InjectQueue('xero-sync') private xeroSyncQueue: Queue
        )

        async categorizeTransactions(
          transactionIds: string[],
          tenantId: string
        ): Promise&lt;CategorizationResult&gt;

        async updateCategorization(
          transactionId: string,
          dto: UpdateCategorizationDto,
          userId: string,
          tenantId: string
        ): Promise&lt;Transaction&gt;

        async getSuggestions(
          transactionId: string,
          tenantId: string
        ): Promise&lt;CategorySuggestion[]&gt;

        private async loadTenantContext(tenantId: string): Promise&lt;TenantContext&gt;
        private async invokeAIAgent(
          transaction: Transaction,
          context: TenantContext
        ): Promise&lt;AICategorization&gt;
        private async applyPatternMatching(
          transaction: Transaction,
          patterns: PayeePattern[]
        ): Promise&lt;PatternMatch | null&gt;
        private validateSplits(
          splits: SplitItem[],
          totalCents: number
        ): void
      }
    </signature>
    <signature file="src/core/transaction/dto/categorization.dto.ts">
      export interface CategorizationResult {
        totalProcessed: number;
        autoCategorized: number;
        reviewRequired: number;
        failed: number;
        results: CategorizationItem[];
        statistics: {
          avgConfidence: number;
          patternMatchRate: number;
          aiCategoryRate: number;
        };
      }

      export interface CategorizationItem {
        transactionId: string;
        status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'FAILED';
        accountCode?: string;
        accountName?: string;
        confidenceScore?: number;
        source: CategorizationSource;
        error?: string;
      }

      export interface UpdateCategorizationDto {
        accountCode: string;
        isSplit: boolean;
        splits?: SplitItem[];
        vatType?: VatType;
        createPattern?: boolean;
      }

      export interface SplitItem {
        accountCode: string;
        amountCents: number;
        vatType: VatType;
        description?: string;
      }

      export interface CategorySuggestion {
        accountCode: string;
        accountName: string;
        confidenceScore: number;
        reason: string;
        source: 'PATTERN' | 'AI' | 'SIMILAR_TX';
      }

      export interface TenantContext {
        chartOfAccounts: ChartOfAccount[];
        payeePatterns: PayeePattern[];
        recentCategorizations: Categorization[];
      }

      export interface AICategorization {
        accountCode: string;
        confidenceScore: number;
        reasoning: string;
        vatType: VatType;
        isSplit: boolean;
        splits?: SplitItem[];
      }

      export interface PatternMatch {
        pattern: PayeePattern;
        confidenceBoost: number;
      }
    </signature>
    <signature file="src/core/transaction/agents/categorization-agent.ts">
      export class CategorizationAgent {
        async categorize(
          transaction: Transaction,
          context: TenantContext
        ): Promise&lt;AICategorization&gt;

        private buildPrompt(
          transaction: Transaction,
          context: TenantContext
        ): string
        private parseAIResponse(response: string): AICategorization
      }
    </signature>
  </signatures>

  <constraints>
    - Confidence threshold for auto-categorization: >= 80%
    - Must check pattern matches before invoking AI
    - Pattern confidence boost: +15% to AI confidence
    - Split amounts must equal transaction total (validate to 1 cent)
    - Must create audit trail for every categorization
    - Must filter all data by tenantId
    - Must NOT use 'any' type anywhere
    - Queue Xero sync only for auto-applied categorizations
    - AI agent timeout: 30 seconds
  </constraints>

  <verification>
    - Pattern matching correctly identifies existing payee patterns
    - AI agent returns valid categorizations with confidence scores
    - Confidence threshold correctly separates auto vs review
    - Split transaction validation prevents invalid amounts
    - Categorization audit trail is created
    - Xero sync jobs are queued for auto-categorized transactions
    - Multi-tenant isolation verified
    - Unit tests pass
    - Integration tests with AI agent pass
  </verification>
</definition_of_done>

<pseudo_code>
CategorizationService (src/core/transaction/categorization.service.ts):
  @Injectable()
  export class CategorizationService:
    constructor(
      private transactionRepo: TransactionRepository,
      private categorizationRepo: CategorizationRepository,
      private payeePatternRepo: PayeePatternRepository,
      private coaRepo: ChartOfAccountsRepository,
      @InjectQueue('xero-sync') private xeroSyncQueue: Queue
    )

    async categorizeTransactions(transactionIds, tenantId):
      // 1. Load tenant context (CoA, patterns, history)
      const context = await this.loadTenantContext(tenantId)

      // 2. Load transactions
      const transactions = await this.transactionRepo.findByIds(
        transactionIds,
        tenantId
      )

      const results: CategorizationItem[] = []
      let autoCount = 0
      let reviewCount = 0
      let failedCount = 0

      // 3. Process each transaction
      for (const tx of transactions):
        try:
          // 3a. Try pattern matching first
          let categorization: AICategorization
          const patternMatch = await this.applyPatternMatching(tx, context.payeePatterns)

          if patternMatch:
            // Use pattern suggestion and invoke AI for validation
            categorization = await this.invokeAIAgent(tx, context)
            // Boost confidence if pattern matches AI suggestion
            if categorization.accountCode === patternMatch.pattern.accountCode:
              categorization.confidenceScore += patternMatch.confidenceBoost
              categorization.confidenceScore = Math.min(100, categorization.confidenceScore)

          else:
            // No pattern match, use AI directly
            categorization = await this.invokeAIAgent(tx, context)

          // 3b. Apply confidence threshold
          const shouldAutoApply = categorization.confidenceScore >= 80

          if shouldAutoApply:
            // Auto-categorize
            await this.categorizationRepo.create({
              transactionId: tx.id,
              accountCode: categorization.accountCode,
              isSplit: categorization.isSplit,
              splits: categorization.splits,
              confidenceScore: categorization.confidenceScore,
              source: patternMatch ? 'PATTERN_MATCHED' : 'AI_AUTO',
              reviewedBy: null,
              reviewedAt: null
            })

            // Update transaction status
            await this.transactionRepo.update(tenantId, tx.id, {
              status: 'CATEGORIZED'
            })

            // Queue Xero sync
            await this.xeroSyncQueue.add('sync-transaction', {
              transactionId: tx.id,
              tenantId
            })

            autoCount++
            results.push({
              transactionId: tx.id,
              status: 'AUTO_APPLIED',
              accountCode: categorization.accountCode,
              confidenceScore: categorization.confidenceScore,
              source: patternMatch ? 'PATTERN_MATCHED' : 'AI_AUTO'
            })

          else:
            // Flag for review
            await this.categorizationRepo.create({
              transactionId: tx.id,
              accountCode: categorization.accountCode,
              isSplit: categorization.isSplit,
              splits: categorization.splits,
              confidenceScore: categorization.confidenceScore,
              source: 'AI_SUGGESTION',
              reviewedBy: null,
              reviewedAt: null
            })

            await this.transactionRepo.update(tenantId, tx.id, {
              status: 'REVIEW_REQUIRED'
            })

            reviewCount++
            results.push({
              transactionId: tx.id,
              status: 'REVIEW_REQUIRED',
              accountCode: categorization.accountCode,
              confidenceScore: categorization.confidenceScore,
              source: 'AI_SUGGESTION'
            })

        catch (error):
          failedCount++
          results.push({
            transactionId: tx.id,
            status: 'FAILED',
            error: error.message
          })

      // 4. Calculate statistics
      const avgConfidence = results
        .filter(r => r.confidenceScore)
        .reduce((sum, r) => sum + r.confidenceScore, 0) / results.length

      const patternMatches = results.filter(r => r.source === 'PATTERN_MATCHED').length

      return {
        totalProcessed: transactions.length,
        autoCategorized: autoCount,
        reviewRequired: reviewCount,
        failed: failedCount,
        results,
        statistics: {
          avgConfidence,
          patternMatchRate: (patternMatches / transactions.length) * 100,
          aiCategoryRate: ((autoCount + reviewCount) / transactions.length) * 100
        }
      }

    async updateCategorization(transactionId, dto, userId, tenantId):
      // 1. Validate transaction exists and belongs to tenant
      const transaction = await this.transactionRepo.findById(tenantId, transactionId)
      if !transaction:
        throw new NotFoundException('Transaction not found')

      // 2. Validate account code exists
      const account = await this.coaRepo.findByCode(tenantId, dto.accountCode)
      if !account:
        throw new ValidationError('Invalid account code')

      // 3. Validate splits if applicable
      if dto.isSplit:
        if !dto.splits || dto.splits.length === 0:
          throw new ValidationError('Split categorization requires split items')
        this.validateSplits(dto.splits, transaction.amountCents)

      // 4. Update or create categorization
      const existing = await this.categorizationRepo.findByTransaction(transactionId)

      if existing:
        await this.categorizationRepo.update(existing.id, {
          accountCode: dto.accountCode,
          isSplit: dto.isSplit,
          splits: dto.splits,
          source: 'USER_OVERRIDE',
          reviewedBy: userId,
          reviewedAt: new Date()
        })
      else:
        await this.categorizationRepo.create({
          transactionId,
          accountCode: dto.accountCode,
          isSplit: dto.isSplit,
          splits: dto.splits,
          confidenceScore: 100,
          source: 'USER_OVERRIDE',
          reviewedBy: userId,
          reviewedAt: new Date()
        })

      // 5. Update transaction status
      await this.transactionRepo.update(tenantId, transactionId, {
        status: 'CATEGORIZED'
      })

      // 6. Queue Xero sync
      await this.xeroSyncQueue.add('sync-transaction', {
        transactionId,
        tenantId
      })

      // 7. Return updated transaction
      return await this.transactionRepo.findById(tenantId, transactionId)

    async getSuggestions(transactionId, tenantId):
      const transaction = await this.transactionRepo.findById(tenantId, transactionId)
      const context = await this.loadTenantContext(tenantId)

      const suggestions: CategorySuggestion[] = []

      // 1. Check pattern match
      const patternMatch = await this.applyPatternMatching(transaction, context.payeePatterns)
      if patternMatch:
        const account = await this.coaRepo.findByCode(tenantId, patternMatch.pattern.accountCode)
        suggestions.push({
          accountCode: patternMatch.pattern.accountCode,
          accountName: account.name,
          confidenceScore: 85 + patternMatch.confidenceBoost,
          reason: `Matches saved pattern for "${patternMatch.pattern.payeeName}"`,
          source: 'PATTERN'
        })

      // 2. Get AI suggestion
      const aiCat = await this.invokeAIAgent(transaction, context)
      const aiAccount = await this.coaRepo.findByCode(tenantId, aiCat.accountCode)
      suggestions.push({
        accountCode: aiCat.accountCode,
        accountName: aiAccount.name,
        confidenceScore: aiCat.confidenceScore,
        reason: aiCat.reasoning,
        source: 'AI'
      })

      // 3. Find similar transactions
      const similar = await this.categorizationRepo.findSimilar(
        transaction.description,
        tenantId
      )
      if similar.length > 0:
        const mostCommon = similar[0] // Already sorted by frequency
        const account = await this.coaRepo.findByCode(tenantId, mostCommon.accountCode)
        suggestions.push({
          accountCode: mostCommon.accountCode,
          accountName: account.name,
          confidenceScore: 70,
          reason: `Used ${mostCommon.count} times for similar transactions`,
          source: 'SIMILAR_TX'
        })

      // Sort by confidence
      return suggestions.sort((a, b) => b.confidenceScore - a.confidenceScore)

    private async loadTenantContext(tenantId):
      const [chartOfAccounts, payeePatterns, recentCategorizations] = await Promise.all([
        this.coaRepo.findByTenant(tenantId),
        this.payeePatternRepo.findByTenant(tenantId),
        this.categorizationRepo.findRecent(tenantId, 100)
      ])

      return { chartOfAccounts, payeePatterns, recentCategorizations }

    private async invokeAIAgent(transaction, context):
      const agent = new CategorizationAgent()
      return await agent.categorize(transaction, context)

    private async applyPatternMatching(transaction, patterns):
      // Match by payee name or description keywords
      for (const pattern of patterns):
        if pattern.payeeName && transaction.payeeName:
          // Exact payee match
          if transaction.payeeName.toLowerCase().includes(pattern.payeeName.toLowerCase()):
            return {
              pattern,
              confidenceBoost: 15
            }

        if pattern.descriptionKeywords:
          // Keyword match in description
          const keywords = pattern.descriptionKeywords.toLowerCase().split(',')
          const description = transaction.description.toLowerCase()
          const matchCount = keywords.filter(kw => description.includes(kw.trim())).length

          if matchCount > 0:
            const boost = Math.min(15, matchCount * 5)
            return { pattern, confidenceBoost: boost }

      return null

    private validateSplits(splits, totalCents):
      const splitSum = splits.reduce((sum, split) => sum + split.amountCents, 0)
      const diff = Math.abs(splitSum - totalCents)

      if diff > 1: // Allow 1 cent rounding
        throw new ValidationError(
          `Split amounts (${splitSum / 100}) do not equal transaction total (${totalCents / 100})`
        )

CategorizationAgent (src/core/transaction/agents/categorization-agent.ts):
  export class CategorizationAgent:
    async categorize(transaction, context):
      // Build prompt for Claude Code
      const prompt = this.buildPrompt(transaction, context)

      // Invoke Claude Code via MCP
      const response = await claudeCodeMCP.query({
        prompt,
        timeout: 30000
      })

      // Parse response
      return this.parseAIResponse(response)

    private buildPrompt(transaction, context):
      // Format Chart of Accounts
      const coaList = context.chartOfAccounts
        .map(acc => `${acc.code}: ${acc.name}`)
        .join('\n')

      // Format recent examples
      const examples = context.recentCategorizations
        .slice(0, 10)
        .map(cat =>
          `"${cat.transaction.description}" -> ${cat.accountCode}: ${cat.account.name}`
        )
        .join('\n')

      return `
You are a bookkeeping AI for a South African creche.

TRANSACTION TO CATEGORIZE:
Date: ${transaction.date}
Description: ${transaction.description}
Payee: ${transaction.payeeName || 'Unknown'}
Amount: R${transaction.amountCents / 100} (${transaction.isCredit ? 'Credit' : 'Debit'})

CHART OF ACCOUNTS:
${coaList}

RECENT EXAMPLES:
${examples}

TASK:
Categorize this transaction into the most appropriate account code.
Consider:
- Transaction description and payee
- Typical creche expenses (food, salaries, utilities, supplies)
- Whether this is income (school fees) or expense
- VAT implications

Respond ONLY with valid JSON:
{
  "accountCode": "XXXX",
  "confidenceScore": 0-100,
  "reasoning": "Brief explanation",
  "vatType": "STANDARD" | "ZERO_RATED" | "EXEMPT" | "NO_VAT",
  "isSplit": false
}

If this should be split across multiple categories, set isSplit: true and include:
{
  "isSplit": true,
  "splits": [
    {"accountCode": "XXXX", "amountCents": 1000, "vatType": "STANDARD"},
    ...
  ]
}
`

    private parseAIResponse(response: string): AICategorization:
      try:
        // Extract JSON from response (may have markdown code blocks)
        const jsonMatch = response.match(/\{[\s\S]*\}/)
        if !jsonMatch:
          throw new Error('No JSON found in AI response')

        const parsed = JSON.parse(jsonMatch[0])

        // Validate required fields
        if !parsed.accountCode || !parsed.confidenceScore || !parsed.vatType:
          throw new Error('Missing required fields in AI response')

        return {
          accountCode: parsed.accountCode,
          confidenceScore: Math.min(100, Math.max(0, parsed.confidenceScore)),
          reasoning: parsed.reasoning || '',
          vatType: parsed.vatType,
          isSplit: parsed.isSplit || false,
          splits: parsed.splits || []
        }

      catch (error):
        throw new Error(`Failed to parse AI response: ${error.message}`)
</pseudo_code>

<files_to_create>
  <file path="src/core/transaction/categorization.service.ts">Main categorization service</file>
  <file path="src/core/transaction/dto/categorization.dto.ts">Categorization DTOs</file>
  <file path="src/core/transaction/agents/categorization-agent.ts">AI agent integration</file>
  <file path="tests/core/transaction/categorization.service.spec.ts">Service tests</file>
  <file path="tests/core/transaction/agents/categorization-agent.spec.ts">Agent tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/transaction/index.ts">Export CategorizationService</file>
  <file path="src/database/repositories/categorization.repository.ts">Add findSimilar method</file>
  <file path="src/config/queue.config.ts">Add xero-sync queue</file>
</files_to_modify>

<validation_criteria>
  <criterion>AI agent returns valid categorizations with confidence scores</criterion>
  <criterion>Confidence threshold (80%) correctly separates auto vs review</criterion>
  <criterion>Pattern matching boosts confidence for known payees</criterion>
  <criterion>Split transactions validate correctly (amounts equal total)</criterion>
  <criterion>User overrides update categorization with audit trail</criterion>
  <criterion>Xero sync jobs queued only for auto-categorized transactions</criterion>
  <criterion>Multi-tenant isolation verified</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- --grep "CategorizationService"</command>
  <command>npm run test -- --grep "CategorizationAgent"</command>
  <command>npm run build</command>
</test_commands>

</task_spec>

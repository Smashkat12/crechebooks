<task_spec id="TASK-TRANS-013" version="1.0">

<metadata>
  <title>Payee Pattern Learning Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>18</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
    <requirement_ref>REQ-TRANS-006</requirement_ref>
    <requirement_ref>REQ-TRANS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the PatternLearningService which learns from user categorization
corrections to improve future auto-categorization accuracy. The service creates and
updates PayeePattern records when users manually categorize transactions, maintains
confidence boosts based on match success, tracks recurring transactions, and provides
pattern-based suggestions. This enables the system to learn tenant-specific categorization
rules over time.
</context>

<input_context_files>
  <file purpose="payee_pattern_entity">src/database/entities/payee-pattern.entity.ts</file>
  <file purpose="transaction_entity">src/database/entities/transaction.entity.ts</file>
  <file purpose="categorization_entity">src/database/entities/categorization.entity.ts</file>
  <file purpose="requirements">specs/requirements/REQ-TRANS.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-TRANS-003 completed (PayeePattern entity exists)</check>
  <check>PatternRepository available</check>
  <check>CategorizationRepository available</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PatternLearningService in src/core/transaction/
    - Implement pattern creation from user corrections
    - Implement pattern update logic (confidence boost, match count)
    - Extract payee names from transaction descriptions
    - Detect recurring transactions (same payee, regular intervals)
    - Find and rank matching patterns for suggestions
    - Track pattern effectiveness over time
  </in_scope>
  <out_of_scope>
    - AI categorization logic (TASK-TRANS-012)
    - User correction UI
    - Pattern deletion (manual admin task)
    - Advanced NLP for payee extraction
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/transaction/pattern-learning.service.ts">
      @Injectable()
      export class PatternLearningService {
        constructor(
          private readonly patternRepo: PayeePatternRepository,
          private readonly transactionRepo: TransactionRepository,
          private readonly categorizationRepo: CategorizationRepository
        )

        async learnFromCorrection(
          transactionId: string,
          accountCode: string,
          tenantId: string
        ): Promise&lt;PayeePattern&gt;

        async updatePattern(
          patternId: string,
          matchSuccess: boolean,
          tenantId: string
        ): Promise&lt;PayeePattern&gt;

        async findMatchingPatterns(
          transaction: Transaction,
          tenantId: string
        ): Promise&lt;PatternMatch[]&gt;

        async detectRecurring(
          payeeName: string,
          tenantId: string
        ): Promise&lt;RecurringInfo | null&gt;

        private extractPayeeName(description: string): string
        private extractKeywords(description: string): string[]
        private calculateConfidenceBoost(matchCount: number): number
        private normalizePayeeName(payee: string): string
      }
    </signature>
    <signature file="src/core/transaction/dto/pattern.dto.ts">
      export interface PatternMatch {
        pattern: PayeePattern;
        matchScore: number;
        matchType: 'EXACT_PAYEE' | 'PARTIAL_PAYEE' | 'KEYWORD' | 'DESCRIPTION';
        confidenceBoost: number;
      }

      export interface RecurringInfo {
        payeeName: string;
        frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
        averageAmount: number;
        lastOccurrence: Date;
        occurrenceCount: number;
        isRecurring: boolean;
      }

      export interface PatternStats {
        totalPatterns: number;
        activePatterns: number;
        avgMatchCount: number;
        topPatterns: {
          payeeName: string;
          matchCount: number;
          accountCode: string;
        }[];
      }
    </signature>
  </signatures>

  <constraints>
    - Pattern confidence boost range: 0-15%
    - Base confidence boost: 10% for new patterns
    - Confidence boost increases by 1% per successful match (max 15%)
    - Minimum match count for pattern to be active: 1
    - Payee names must be normalized (uppercase, trimmed)
    - Keywords extracted from description (min 3 chars)
    - Recurring detection window: 12 months
    - Must filter all data by tenantId
    - Must NOT use 'any' type anywhere
  </constraints>

  <verification>
    - Pattern created when user corrects categorization
    - Existing pattern updated if payee already has pattern
    - Confidence boost calculated correctly based on match count
    - Pattern matching correctly ranks multiple patterns
    - Recurring transaction detection identifies regular payments
    - Multi-tenant isolation verified
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
PatternLearningService (src/core/transaction/pattern-learning.service.ts):
  @Injectable()
  export class PatternLearningService:
    constructor(
      private patternRepo: PayeePatternRepository,
      private transactionRepo: TransactionRepository,
      private categorizationRepo: CategorizationRepository
    )

    async learnFromCorrection(transactionId, accountCode, tenantId):
      // 1. Load transaction
      const transaction = await this.transactionRepo.findById(tenantId, transactionId)
      if !transaction:
        throw new NotFoundException('Transaction not found')

      // 2. Extract payee and keywords
      const payeeName = this.extractPayeeName(
        transaction.payeeName || transaction.description
      )
      const keywords = this.extractKeywords(transaction.description)

      // 3. Check if pattern exists for this payee
      const existing = await this.patternRepo.findByPayee(
        tenantId,
        payeeName
      )

      if existing:
        // 4a. Update existing pattern
        // Check if account code changed
        if existing.accountCode !== accountCode:
          // User changed their mind - reset to new account
          return await this.patternRepo.update(existing.id, {
            accountCode,
            confidenceBoost: 10, // Reset confidence
            matchCount: 1,
            descriptionKeywords: keywords.join(','),
            updatedAt: new Date()
          })
        else:
          // Same account - increment match count
          const newMatchCount = existing.matchCount + 1
          const newConfidence = this.calculateConfidenceBoost(newMatchCount)

          return await this.patternRepo.update(existing.id, {
            matchCount: newMatchCount,
            confidenceBoost: newConfidence,
            descriptionKeywords: keywords.join(','), // Update keywords
            updatedAt: new Date()
          })

      else:
        // 4b. Create new pattern
        return await this.patternRepo.create({
          tenantId,
          payeeName: this.normalizePayeeName(payeeName),
          accountCode,
          confidenceBoost: 10, // Base confidence
          matchCount: 1,
          descriptionKeywords: keywords.join(','),
          createdAt: new Date(),
          updatedAt: new Date()
        })

    async updatePattern(patternId, matchSuccess, tenantId):
      const pattern = await this.patternRepo.findById(tenantId, patternId)
      if !pattern:
        throw new NotFoundException('Pattern not found')

      if matchSuccess:
        // Increment match count and boost confidence
        const newMatchCount = pattern.matchCount + 1
        const newConfidence = this.calculateConfidenceBoost(newMatchCount)

        return await this.patternRepo.update(patternId, {
          matchCount: newMatchCount,
          confidenceBoost: newConfidence,
          updatedAt: new Date()
        })
      else:
        // Match failed - decrease confidence slightly
        const newConfidence = Math.max(5, pattern.confidenceBoost - 2)

        return await this.patternRepo.update(patternId, {
          confidenceBoost: newConfidence,
          updatedAt: new Date()
        })

    async findMatchingPatterns(transaction, tenantId):
      // Get all patterns for tenant
      const allPatterns = await this.patternRepo.findByTenant(tenantId)

      const matches: PatternMatch[] = []

      for (const pattern of allPatterns):
        let matchScore = 0
        let matchType: string

        // 1. Exact payee name match
        if transaction.payeeName:
          const normalizedTxPayee = this.normalizePayeeName(transaction.payeeName)
          const normalizedPatternPayee = this.normalizePayeeName(pattern.payeeName)

          if normalizedTxPayee === normalizedPatternPayee:
            matchScore = 100
            matchType = 'EXACT_PAYEE'
          else if normalizedTxPayee.includes(normalizedPatternPayee):
            matchScore = 80
            matchType = 'PARTIAL_PAYEE'

        // 2. Keyword match in description
        if matchScore === 0 && pattern.descriptionKeywords:
          const patternKeywords = pattern.descriptionKeywords
            .toLowerCase()
            .split(',')
            .map(k => k.trim())

          const description = transaction.description.toLowerCase()
          const matchedKeywords = patternKeywords.filter(kw =>
            description.includes(kw)
          )

          if matchedKeywords.length > 0:
            matchScore = (matchedKeywords.length / patternKeywords.length) * 70
            matchType = 'KEYWORD'

        // 3. Description similarity (simple contains)
        if matchScore === 0:
          const normalizedDesc = transaction.description.toLowerCase()
          if normalizedDesc.includes(pattern.payeeName.toLowerCase()):
            matchScore = 50
            matchType = 'DESCRIPTION'

        // Add to matches if score > 0
        if matchScore > 0:
          matches.push({
            pattern,
            matchScore,
            matchType,
            confidenceBoost: pattern.confidenceBoost
          })

      // Sort by match score descending
      return matches.sort((a, b) => b.matchScore - a.matchScore)

    async detectRecurring(payeeName, tenantId):
      // Find all transactions for this payee in last 12 months
      const twelveMonthsAgo = subMonths(new Date(), 12)

      const transactions = await this.transactionRepo.findByTenant(tenantId, {
        payeeName,
        dateFrom: twelveMonthsAgo,
        isDeleted: false
      })

      if transactions.length < 3:
        return null // Need at least 3 occurrences

      // Sort by date
      const sorted = transactions.sort((a, b) => a.date.getTime() - b.date.getTime())

      // Calculate intervals between transactions (in days)
      const intervals = []
      for (let i = 1; i < sorted.length; i++):
        const diffDays = differenceInDays(sorted[i].date, sorted[i-1].date)
        intervals.push(diffDays)

      // Calculate average interval
      const avgInterval = intervals.reduce((sum, val) => sum + val, 0) / intervals.length

      // Calculate standard deviation
      const variance = intervals.reduce((sum, val) =>
        sum + Math.pow(val - avgInterval, 2), 0
      ) / intervals.length
      const stdDev = Math.sqrt(variance)

      // Check if regular (low variance)
      const isRecurring = stdDev < (avgInterval * 0.2) // 20% tolerance

      // Determine frequency
      let frequency: string
      if avgInterval <= 10:
        frequency = 'WEEKLY'
      else if avgInterval <= 35:
        frequency = 'MONTHLY'
      else if avgInterval <= 100:
        frequency = 'QUARTERLY'
      else:
        frequency = 'ANNUAL'

      // Calculate average amount
      const avgAmount = transactions.reduce(
        (sum, tx) => sum + tx.amountCents, 0
      ) / transactions.length

      return {
        payeeName,
        frequency,
        averageAmount: avgAmount,
        lastOccurrence: sorted[sorted.length - 1].date,
        occurrenceCount: transactions.length,
        isRecurring
      }

    private extractPayeeName(description: string): string:
      // Remove common prefixes
      let cleaned = description
        .replace(/^(POS PURCHASE|POS|ATM|EFT|DEBIT ORDER|PAYMENT)\s+/i, '')
        .trim()

      // Take first significant word (usually merchant name)
      const words = cleaned.split(/\s+/)

      // Filter out common words
      const stopWords = ['THE', 'AND', 'FOR', 'FROM', 'TO', 'AT', 'IN']
      const significant = words.find(w =>
        w.length >= 3 && !stopWords.includes(w.toUpperCase())
      )

      return significant || words[0] || 'UNKNOWN'

    private extractKeywords(description: string): string[]:
      // Tokenize and filter
      const words = description
        .toUpperCase()
        .replace(/[^\w\s]/g, ' ') // Remove punctuation
        .split(/\s+/)
        .filter(w => w.length >= 3)

      // Remove duplicates
      return [...new Set(words)]

    private calculateConfidenceBoost(matchCount: number): number:
      // Base: 10%, increase 1% per match, max 15%
      return Math.min(15, 10 + (matchCount - 1))

    private normalizePayeeName(payee: string): string:
      return payee.toUpperCase().trim()

Pattern Statistics (Helper method):
  async getPatternStats(tenantId: string): Promise&lt;PatternStats&gt;:
    const patterns = await this.patternRepo.findByTenant(tenantId)

    const active = patterns.filter(p => p.matchCount > 0)

    const avgMatchCount = patterns.length > 0
      ? patterns.reduce((sum, p) => sum + p.matchCount, 0) / patterns.length
      : 0

    const topPatterns = patterns
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 10)
      .map(p => ({
        payeeName: p.payeeName,
        matchCount: p.matchCount,
        accountCode: p.accountCode
      }))

    return {
      totalPatterns: patterns.length,
      activePatterns: active.length,
      avgMatchCount,
      topPatterns
    }
</pseudo_code>

<files_to_create>
  <file path="src/core/transaction/pattern-learning.service.ts">Main pattern learning service</file>
  <file path="src/core/transaction/dto/pattern.dto.ts">Pattern DTOs and interfaces</file>
  <file path="tests/core/transaction/pattern-learning.service.spec.ts">Service tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/transaction/index.ts">Export PatternLearningService</file>
  <file path="src/core/transaction/categorization.service.ts">Call learnFromCorrection when user overrides</file>
  <file path="src/database/repositories/payee-pattern.repository.ts">Add findByPayee method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Pattern created when user manually categorizes transaction</criterion>
  <criterion>Existing pattern updated with incremented match count</criterion>
  <criterion>Confidence boost calculated correctly (10-15% range)</criterion>
  <criterion>Payee name extraction works for common formats</criterion>
  <criterion>Keyword extraction filters out common words</criterion>
  <criterion>Pattern matching correctly ranks multiple matches</criterion>
  <criterion>Recurring detection identifies regular monthly payments</criterion>
  <criterion>Multi-tenant isolation verified</criterion>
  <criterion>All tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- --grep "PatternLearningService"</command>
  <command>npm run build</command>
</test_commands>

</task_spec>

<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-TXN-003</task_id>
    <title>Improve AI Categorization</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Enhancement</category>
    <phase>16 - Transaction Remediation</phase>
    <status>DONE</status>
    <created_date>2026-01-15</created_date>
    <estimated_effort>8-16 hours</estimated_effort>
    <tags>
      <tag>transactions</tag>
      <tag>ai</tag>
      <tag>categorization</tag>
      <tag>machine-learning</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      The current transaction categorization agent uses simple keyword matching rather
      than true machine learning. This results in limited accuracy, no confidence scoring,
      and inability to learn from user corrections. The system is marketed as "AI-powered"
      but lacks genuine ML capabilities.
    </problem_statement>

    <current_behavior>
      - Simple keyword-based pattern matching
      - No confidence scores returned
      - Cannot learn from corrections
      - Binary categorization (match or no match)
      - Limited to predefined keyword lists
    </current_behavior>

    <expected_behavior>
      - Confidence scores for categorization decisions
      - Clear documentation of current limitations
      - Learning from user corrections (feedback loop)
      - Multiple category suggestions ranked by confidence
      - Upgrade path to true ML model defined
    </expected_behavior>

    <impact>
      - User trust: Accurate categorization reduces manual corrections
      - Audit compliance: Confidence scores support decision transparency
      - System improvement: Learning enables better accuracy over time
      - Competitive advantage: True AI capability differentiator
    </impact>
  </context>

  <scope>
    <files_to_modify>
      <file>
        <path>apps/api/src/agents/transaction-categorizer.agent.ts</path>
        <changes>Add confidence scoring, improve algorithm, add learning capability</changes>
      </file>
    </files_to_modify>

    <files_to_create>
      <file>
        <path>apps/api/src/agents/categorization/confidence-scorer.ts</path>
        <purpose>Calculate and return confidence scores</purpose>
      </file>
      <file>
        <path>apps/api/src/agents/categorization/feedback-learner.ts</path>
        <purpose>Process user corrections for learning</purpose>
      </file>
      <file>
        <path>apps/api/src/agents/categorization/category-suggester.ts</path>
        <purpose>Return multiple ranked suggestions</purpose>
      </file>
      <file>
        <path>docs/architecture/ai-categorization-roadmap.md</path>
        <purpose>Document ML upgrade path</purpose>
      </file>
    </files_to_create>

    <out_of_scope>
      <item>Full ML model implementation (future phase)</item>
      <item>External AI service integration</item>
      <item>Historical recategorization</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Enhance the existing keyword-based system with confidence scoring based on match
      quality, frequency analysis, and historical accuracy. Implement a feedback mechanism
      to track corrections and improve keyword weights. Document the system honestly as
      "rule-based with learning" rather than pure ML.
    </approach>

    <pseudocode>
```typescript
interface CategorizationResult {
  categoryId: string;
  categoryName: string;
  confidence: number;  // 0.0 to 1.0
  matchFactors: MatchFactor[];
  suggestions: CategorySuggestion[];
}

interface MatchFactor {
  type: 'keyword' | 'amount_range' | 'merchant' | 'historical' | 'learned';
  value: string;
  weight: number;
}

interface CategorySuggestion {
  categoryId: string;
  categoryName: string;
  confidence: number;
  reason: string;
}

@Injectable()
export class TransactionCategorizerAgent {
  async categorize(transaction: Transaction): Promise<CategorizationResult> {
    const matchFactors: MatchFactor[] = [];
    const suggestions: CategorySuggestion[] = [];

    // Factor 1: Keyword matching (base confidence)
    const keywordMatches = this.findKeywordMatches(transaction.description);
    matchFactors.push(...keywordMatches.map(m => ({
      type: 'keyword' as const,
      value: m.keyword,
      weight: m.baseWeight * this.getLearnedWeight(m.keyword),
    })));

    // Factor 2: Amount range analysis
    const amountMatch = this.analyzeAmountRange(transaction.amount);
    if (amountMatch) {
      matchFactors.push({
        type: 'amount_range',
        value: `${amountMatch.min}-${amountMatch.max}`,
        weight: 0.1,
      });
    }

    // Factor 3: Merchant pattern recognition
    const merchantMatch = this.recognizeMerchant(transaction.description);
    if (merchantMatch) {
      matchFactors.push({
        type: 'merchant',
        value: merchantMatch.merchantName,
        weight: 0.3,
      });
    }

    // Factor 4: Historical patterns for this account
    const historicalMatch = await this.checkHistoricalPatterns(
      transaction.accountId,
      transaction.description
    );
    if (historicalMatch) {
      matchFactors.push({
        type: 'historical',
        value: `Previously categorized as ${historicalMatch.categoryName}`,
        weight: 0.25,
      });
    }

    // Factor 5: Learned corrections
    const learnedMatch = await this.checkLearnedCorrections(transaction.description);
    if (learnedMatch) {
      matchFactors.push({
        type: 'learned',
        value: `User corrected similar to ${learnedMatch.categoryName}`,
        weight: 0.35,
      });
    }

    // Calculate overall confidence
    const confidence = this.calculateConfidence(matchFactors);
    const bestMatch = this.selectBestCategory(matchFactors);

    // Generate alternative suggestions
    const alternatives = this.generateSuggestions(matchFactors, bestMatch);

    return {
      categoryId: bestMatch.categoryId,
      categoryName: bestMatch.categoryName,
      confidence: Math.min(confidence, 0.95), // Cap at 95% for rule-based
      matchFactors,
      suggestions: alternatives,
    };
  }

  private calculateConfidence(factors: MatchFactor[]): number {
    if (factors.length === 0) return 0;

    const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
    const normalizedConfidence = Math.min(totalWeight / 1.0, 1.0);

    // Apply diminishing returns for multiple weak matches
    const strongMatchCount = factors.filter(f => f.weight > 0.2).length;
    const boost = strongMatchCount > 0 ? 0.1 : 0;

    return Math.min(normalizedConfidence + boost, 0.95);
  }

  async recordFeedback(
    transactionId: string,
    originalCategoryId: string,
    correctedCategoryId: string,
    userId: string
  ): Promise<void> {
    // Store correction for learning
    await this.feedbackRepository.save({
      transactionId,
      originalCategoryId,
      correctedCategoryId,
      userId,
      timestamp: new Date(),
    });

    // Update keyword weights based on correction
    const transaction = await this.transactionRepository.findOne(transactionId);
    if (transaction) {
      await this.updateLearnedWeights(
        transaction.description,
        originalCategoryId,
        correctedCategoryId
      );
    }
  }

  private async updateLearnedWeights(
    description: string,
    wrongCategoryId: string,
    correctCategoryId: string
  ): Promise<void> {
    const keywords = this.extractKeywords(description);

    for (const keyword of keywords) {
      // Decrease weight for wrong category
      await this.decreaseWeight(keyword, wrongCategoryId, 0.1);
      // Increase weight for correct category
      await this.increaseWeight(keyword, correctCategoryId, 0.15);
    }
  }
}
```
    </pseudocode>

    <technical_notes>
      - Cap confidence at 95% to indicate rule-based limitations
      - Store feedback in separate table for learning analysis
      - Use exponential decay for learned weights over time
      - Consider batch retraining of weights periodically
      - Log all categorization decisions for audit and analysis
    </technical_notes>

    <ml_upgrade_path>
      Phase 1 (Current): Enhanced rule-based with learning
      Phase 2: Implement simple Naive Bayes classifier trained on corrections
      Phase 3: Integrate pre-trained transformer model (FinBERT or similar)
      Phase 4: Custom fine-tuned model with domain-specific training data
    </ml_upgrade_path>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should return confidence score with categorization</name>
        <input>transaction: { description: 'WOOLWORTHS FOOD', amount: 150 }</input>
        <expected_result>Result includes confidence between 0.0 and 1.0</expected_result>
      </test_case>
      <test_case>
        <name>Should return multiple suggestions ranked by confidence</name>
        <input>transaction: { description: 'GENERIC STORE', amount: 200 }</input>
        <expected_result>suggestions array with 2-5 alternatives</expected_result>
      </test_case>
      <test_case>
        <name>Should learn from user corrections</name>
        <input>Correct categorization then process similar transaction</input>
        <expected_result>Higher confidence for learned category</expected_result>
      </test_case>
      <test_case>
        <name>Should include match factors explaining decision</name>
        <input>Any transaction</input>
        <expected_result>matchFactors array with type, value, weight</expected_result>
      </test_case>
      <test_case>
        <name>Should cap confidence at 95% for rule-based</name>
        <input>Perfect keyword match</input>
        <expected_result>confidence <= 0.95</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Process sample transactions and review confidence scores</step>
      <step>Make corrections and verify learning effect</step>
      <step>Check match factors explain categorization logic</step>
      <step>Verify suggestions provide useful alternatives</step>
      <step>Review documentation accurately describes capabilities</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Confidence scores returned with all categorizations</criterion>
      <criterion>Multiple category suggestions provided</criterion>
      <criterion>Match factors explain categorization reasoning</criterion>
      <criterion>Feedback mechanism stores corrections</criterion>
      <criterion>Learned weights influence future categorizations</criterion>
      <criterion>Documentation clearly describes rule-based nature</criterion>
      <criterion>ML upgrade roadmap documented</criterion>
      <criterion>Unit tests cover all confidence scenarios</criterion>
      <criterion>Integration tests verify learning capability</criterion>
      <criterion>API response format updated with new fields</criterion>
    </criteria>
  </definition_of_done>

  <references>
    <reference>
      <title>Transaction Categorizer Agent</title>
      <path>apps/api/src/agents/transaction-categorizer.agent.ts</path>
    </reference>
    <reference>
      <title>FinBERT Model</title>
      <url>https://huggingface.co/ProsusAI/finbert</url>
    </reference>
  </references>
</task_specification>

<task_spec id="TASK-AGENT-002" version="1.0">

<metadata>
  <title>Transaction Categorizer Agent</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>38</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-012</task_ref>
    <task_ref>TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task implements the Transaction Categorizer agent, a specialized Claude Code subagent
that automatically categorizes imported bank transactions using AI-powered pattern matching.
The agent uses context files (payee patterns, chart of accounts) and MCP tools to analyze
transactions and assign appropriate account codes. It operates with L3 autonomy (auto-execute
with logging) for high-confidence categorizations (>=80%), and escalates low-confidence
transactions to human review. All decisions are logged for audit purposes and learning.
</context>

<input_context_files>
  <file purpose="agent_definition">specs/technical/architecture.md#transaction_categorizer</file>
  <file purpose="categorization_logic">specs/logic/transaction-logic.md#categorization_rules</file>
  <file purpose="confidence_thresholds">specs/constitution.md#autonomy_levels</file>
  <file purpose="context_data">.claude/context/payee_patterns.json</file>
  <file purpose="chart_of_accounts">.claude/context/chart_of_accounts.json</file>
</input_context_files>

<prerequisites>
  <check>TASK-AGENT-001 completed (.claude/ structure exists)</check>
  <check>TASK-TRANS-012 completed (Transaction service implemented)</check>
  <check>Xero MCP server configured and accessible</check>
  <check>Context files loaded with patterns and CoA</check>
</prerequisites>

<scope>
  <in_scope>
    - Create agent definition in src/agents/transaction-categorizer/
    - Implement skills file: categorize-transaction.md
    - Create agent context loader (reads patterns, CoA)
    - Implement confidence scoring algorithm (0-100%)
    - Integration with MCP tools:
      - mcp__xero__get_accounts
      - mcp__xero__update_transaction
    - Decision logging to .claude/logs/decisions.jsonl
    - Escalation logic for confidence < 80%
    - Batch processing support (50 transactions per batch)
    - Pattern learning from manual corrections
  </in_scope>
  <out_of_scope>
    - Manual transaction entry UI (TASK-TRANS-001)
    - Bank feed import (TASK-TRANS-011)
    - Xero MCP server implementation (TASK-MCP-001)
    - Pattern editing UI (future phase)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/agents/transaction-categorizer/categorizer.agent.ts">
      export class TransactionCategorizerAgent {
        async categorizeTransaction(
          transaction: Transaction,
          context: CategorizationContext
        ): Promise&lt;CategorizationResult&gt;;

        async categorizeBatch(
          transactions: Transaction[],
          context: CategorizationContext
        ): Promise&lt;CategorizationResult[]&gt;;

        private calculateConfidence(
          transaction: Transaction,
          suggestedAccount: string,
          matchingPatterns: Pattern[]
        ): number;

        private logDecision(
          transactionId: string,
          decision: CategorizationDecision,
          confidence: number
        ): Promise&lt;void&gt;;
      }
    </signature>
    <signature file=".claude/agents/transaction-categorizer/categorize-transaction.md">
      # Categorize Transaction Skill

      ## Context
      [Load patterns, CoA, tenant config]

      ## Algorithm
      1. Match payee against patterns (regex)
      2. Analyze transaction amount and date
      3. Check historical categorizations
      4. Calculate confidence score
      5. If confidence >= 80%: auto-categorize
      6. If confidence < 80%: escalate for review

      ## MCP Tools
      - mcp__xero__get_accounts
      - mcp__xero__update_transaction
    </signature>
    <signature file="src/agents/transaction-categorizer/confidence-scorer.ts">
      export class ConfidenceScorer {
        calculateConfidence(params: {
          patternMatch: boolean;
          patternConfidence: number;
          historicalMatch: boolean;
          amountTypical: boolean;
        }): number;
      }
    </signature>
  </signatures>

  <constraints>
    - Must achieve >=80% confidence for auto-categorization
    - Must log ALL categorization attempts to decisions.jsonl
    - Must NOT modify transactions directly (use Xero MCP)
    - Must handle batch processing (50 transactions max per batch)
    - Escalations must include explanation and suggested category
    - Must preserve original transaction data
    - Confidence calculation must be deterministic and auditable
  </constraints>

  <verification>
    - Agent categorizes exact pattern matches with 95%+ confidence
    - Agent escalates ambiguous transactions (confidence < 80%)
    - Batch processing handles 50 transactions in < 30 seconds
    - All decisions logged to decisions.jsonl
    - MCP tool calls use correct authentication
    - Unit tests cover all confidence scoring scenarios
  </verification>
</definition_of_done>

<pseudo_code>
Agent Structure:
  src/agents/transaction-categorizer/
    categorizer.agent.ts        # Main agent class
    confidence-scorer.ts        # Confidence calculation
    pattern-matcher.ts          # Regex pattern matching
    context-loader.ts           # Load patterns and CoA
    categorizer.module.ts       # NestJS module
    categorizer.service.ts      # Service for API layer

Categorization Algorithm:
  async function categorizeTransaction(transaction):
    # 1. Load context
    patterns = await loadPatterns('.claude/context/payee_patterns.json')
    chartOfAccounts = await loadChartOfAccounts('.claude/context/chart_of_accounts.json')
    tenantConfig = await loadTenantConfig('.claude/context/tenant_config.json')

    # 2. Pattern matching
    matchingPatterns = []
    for pattern in patterns:
      if regex.test(pattern.regex, transaction.payee):
        matchingPatterns.push(pattern)

    # 3. Historical analysis
    historicalCategories = await db.query(`
      SELECT account_code, COUNT(*) as count
      FROM transactions
      WHERE tenant_id = ? AND payee LIKE ?
      GROUP BY account_code
      ORDER BY count DESC
      LIMIT 1
    `, [tenantId, `%${transaction.payee}%`])

    # 4. Calculate confidence
    confidence = calculateConfidence({
      patternMatch: matchingPatterns.length > 0,
      patternConfidence: matchingPatterns[0]?.confidence || 0,
      historicalMatch: historicalCategories.length > 0,
      amountTypical: isAmountTypical(transaction.amount, historicalCategories)
    })

    # 5. Determine suggested account
    suggestedAccount = null
    if matchingPatterns.length > 0:
      suggestedAccount = matchingPatterns[0].account
    else if historicalCategories.length > 0:
      suggestedAccount = historicalCategories[0].account_code

    # 6. Make decision
    result = {
      transactionId: transaction.id,
      suggestedAccount: suggestedAccount,
      confidence: confidence,
      reasoning: buildReasoningExplanation(matchingPatterns, historicalCategories),
      autoApplied: false
    }

    # 7. Auto-apply or escalate
    if confidence >= 0.80 and suggestedAccount:
      await mcpXeroUpdateTransaction({
        transactionId: transaction.xeroId,
        accountCode: suggestedAccount
      })
      result.autoApplied = true
      await logDecision('auto_categorized', result)
    else:
      await logEscalation('low_confidence_categorization', result,
        `Confidence ${confidence * 100}% below threshold`)
      await logDecision('escalated', result)

    return result

Confidence Scoring:
  function calculateConfidence(params):
    let score = 0

    # Pattern match (0-60 points)
    if params.patternMatch:
      score += params.patternConfidence * 60

    # Historical match (0-30 points)
    if params.historicalMatch:
      score += 30

    # Amount typical (0-10 points)
    if params.amountTypical:
      score += 10

    return Math.min(score / 100, 1.0) # Return 0-1

Batch Processing:
  async function categorizeBatch(transactions):
    const BATCH_SIZE = 50
    const results = []

    for (let i = 0; i < transactions.length; i += BATCH_SIZE):
      const batch = transactions.slice(i, i + BATCH_SIZE)

      # Parallel categorization within batch
      const batchResults = await Promise.all(
        batch.map(tx => categorizeTransaction(tx))
      )

      results.push(...batchResults)

      # Brief pause between batches to avoid rate limits
      if (i + BATCH_SIZE < transactions.length):
        await sleep(1000)

    return results

Decision Logging:
  async function logDecision(action, result):
    const logEntry = {
      timestamp: new Date().toISOString(),
      agent: 'transaction-categorizer',
      action: action,
      transactionId: result.transactionId,
      suggestedAccount: result.suggestedAccount,
      confidence: result.confidence,
      reasoning: result.reasoning,
      autoApplied: result.autoApplied,
      tenantId: getCurrentTenantId()
    }

    await appendToFile('.claude/logs/decisions.jsonl',
      JSON.stringify(logEntry) + '\n')

Pattern Matcher:
  class PatternMatcher:
    match(payee: string, patterns: Pattern[]): MatchResult[]
      results = []
      for pattern in patterns:
        regex = new RegExp(pattern.regex, 'i')
        if regex.test(payee):
          results.push({
            pattern: pattern,
            confidence: pattern.confidence,
            accountCode: pattern.account
          })

      # Sort by confidence descending
      return results.sort((a, b) => b.confidence - a.confidence)
</pseudo_code>

<files_to_create>
  <file path="src/agents/transaction-categorizer/categorizer.agent.ts">Main agent class with categorization logic</file>
  <file path="src/agents/transaction-categorizer/confidence-scorer.ts">Confidence calculation algorithm</file>
  <file path="src/agents/transaction-categorizer/pattern-matcher.ts">Regex pattern matching utility</file>
  <file path="src/agents/transaction-categorizer/context-loader.ts">Load context files (patterns, CoA)</file>
  <file path="src/agents/transaction-categorizer/categorizer.module.ts">NestJS module definition</file>
  <file path="src/agents/transaction-categorizer/categorizer.service.ts">Service layer for API integration</file>
  <file path=".claude/agents/transaction-categorizer/categorize-transaction.md">Agent skill documentation</file>
  <file path="src/agents/transaction-categorizer/interfaces/categorization.interface.ts">TypeScript interfaces</file>
  <file path="tests/agents/transaction-categorizer/categorizer.spec.ts">Unit tests</file>
  <file path="tests/agents/transaction-categorizer/confidence-scorer.spec.ts">Confidence scorer tests</file>
  <file path="tests/agents/transaction-categorizer/pattern-matcher.spec.ts">Pattern matcher tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">
    Import TransactionCategorizerModule
  </file>
  <file path="src/modules/transaction/transaction.service.ts">
    Inject and use CategorizerService for auto-categorization
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Agent correctly categorizes transactions matching exact patterns (95%+ confidence)</criterion>
  <criterion>Agent escalates transactions with no pattern match or low confidence</criterion>
  <criterion>Confidence scoring is deterministic and reproducible</criterion>
  <criterion>Batch processing completes 50 transactions in under 30 seconds</criterion>
  <criterion>All decisions logged to decisions.jsonl with complete context</criterion>
  <criterion>MCP tool integration works with real Xero API</criterion>
  <criterion>Unit tests achieve >90% code coverage</criterion>
  <criterion>Agent respects tenant isolation (only accesses own tenant data)</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- transaction-categorizer</command>
  <command>npm run test:e2e -- agents/categorizer</command>
  <command>npm run lint</command>
  <command>npm run build</command>
</test_commands>

</task_spec>

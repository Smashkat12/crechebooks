<task_spec id="TASK-AGENT-003" version="1.0">

<metadata>
  <title>Payment Matcher Agent</title>
  <status>ready</status>
  <layer>agent</layer>
  <sequence>39</sequence>
  <implements>
    <requirement_ref>REQ-PAY-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PAY-011</task_ref>
    <task_ref>TASK-AGENT-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task implements the Payment Matcher agent, a specialized Claude Code subagent that
automatically matches incoming payments to outstanding invoices. The agent uses multiple
matching strategies (reference number, exact amount, partial amount, payee name) and
calculates confidence scores for each match. It operates with L3 autonomy (auto-execute
with logging) for exact matches with high confidence (>=90%), and escalates ambiguous
or partial matches to human review. This ensures accurate payment allocation while
minimizing manual reconciliation effort.
</context>

<input_context_files>
  <file purpose="agent_definition">specs/technical/architecture.md#payment_matcher</file>
  <file purpose="matching_logic">specs/logic/payment-logic.md#matching_algorithm</file>
  <file purpose="confidence_thresholds">specs/constitution.md#autonomy_levels</file>
  <file purpose="payment_requirements">specs/requirements/payment.md</file>
</input_context_files>

<prerequisites>
  <check>TASK-AGENT-001 completed (.claude/ structure exists)</check>
  <check>TASK-PAY-011 completed (Payment service implemented)</check>
  <check>Xero MCP server configured and accessible</check>
  <check>Invoice and payment data available in database</check>
</prerequisites>

<scope>
  <in_scope>
    - Create agent definition in src/agents/payment-matcher/
    - Implement skills file: match-payments.md
    - Matching strategies:
      - Reference number matching (e.g., "INV-12345")
      - Exact amount matching
      - Partial amount matching (multiple invoices)
      - Payee name fuzzy matching
    - Confidence scoring algorithm (0-100%)
    - Integration with MCP tools:
      - mcp__xero__apply_payment
      - mcp__xero__get_invoices
    - Decision logging to .claude/logs/decisions.jsonl
    - Escalation logic for:
      - Confidence < 90%
      - Partial matches requiring split
      - Multiple possible matches
    - Handle overpayments and underpayments
  </in_scope>
  <out_of_scope>
    - Manual payment entry UI (TASK-PAY-001)
    - Payment reminder logic (TASK-BILL-004)
    - Xero MCP server implementation (TASK-MCP-001)
    - Arrears calculation (TASK-PAY-003)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/agents/payment-matcher/matcher.agent.ts">
      export class PaymentMatcherAgent {
        async matchPayment(
          payment: Payment,
          context: MatchingContext
        ): Promise&lt;MatchingResult&gt;;

        async matchBatch(
          payments: Payment[]
        ): Promise&lt;MatchingResult[]&gt;;

        private findCandidateInvoices(
          payment: Payment,
          tenant: Tenant
        ): Promise&lt;Invoice[]&gt;;

        private calculateMatchConfidence(
          payment: Payment,
          invoice: Invoice,
          matchType: MatchType
        ): number;

        private applyPaymentToInvoice(
          payment: Payment,
          invoice: Invoice,
          amount: Decimal
        ): Promise&lt;void&gt;;
      }
    </signature>
    <signature file=".claude/agents/payment-matcher/match-payments.md">
      # Match Payments Skill

      ## Context
      [Load outstanding invoices, payment patterns]

      ## Matching Algorithm
      1. Reference number match (highest priority)
      2. Exact amount + payee name match
      3. Partial amount match (check invoice combinations)
      4. Fuzzy payee name match
      5. Calculate confidence for each candidate
      6. If confidence >= 90% and exact match: auto-apply
      7. If confidence < 90% or ambiguous: escalate

      ## MCP Tools
      - mcp__xero__get_invoices
      - mcp__xero__apply_payment
    </signature>
    <signature file="src/agents/payment-matcher/matching-strategies.ts">
      export interface MatchingStrategy {
        match(payment: Payment, invoices: Invoice[]): MatchCandidate[];
      }

      export class ReferenceNumberStrategy implements MatchingStrategy {...}
      export class ExactAmountStrategy implements MatchingStrategy {...}
      export class PartialAmountStrategy implements MatchingStrategy {...}
      export class PayeeNameStrategy implements MatchingStrategy {...}
    </signature>
  </signatures>

  <constraints>
    - Must achieve >=90% confidence for auto-application
    - Must log ALL matching attempts to decisions.jsonl
    - Must NOT apply payments directly (use Xero MCP)
    - Must handle partial payments (split across multiple invoices)
    - Must handle overpayments (credit note required)
    - Escalations must include all candidate matches and reasoning
    - Must preserve payment audit trail
    - Confidence calculation must be deterministic and auditable
  </constraints>

  <verification>
    - Agent auto-applies exact reference + amount matches (100% confidence)
    - Agent escalates partial matches for review
    - Agent handles overpayments correctly (creates credit note)
    - Batch processing handles 100 payments in < 60 seconds
    - All decisions logged to decisions.jsonl
    - MCP tool calls use correct authentication
    - Unit tests cover all matching strategies
  </verification>
</definition_of_done>

<pseudo_code>
Agent Structure:
  src/agents/payment-matcher/
    matcher.agent.ts            # Main agent class
    matching-strategies.ts      # Strategy pattern for matching
    confidence-scorer.ts        # Confidence calculation
    context-loader.ts           # Load invoices and patterns
    matcher.module.ts           # NestJS module
    matcher.service.ts          # Service for API layer

Matching Algorithm:
  async function matchPayment(payment):
    # 1. Load outstanding invoices for tenant
    outstandingInvoices = await mcpXeroGetInvoices({
      tenantId: payment.tenantId,
      status: 'AUTHORISED',
      where: 'AmountDue > 0'
    })

    # 2. Extract reference from payment description
    extractedRef = extractInvoiceReference(payment.description)

    # 3. Try matching strategies in priority order
    candidates = []

    # Strategy 1: Reference number match
    if extractedRef:
      refMatches = outstandingInvoices.filter(inv =>
        inv.invoiceNumber === extractedRef
      )
      for invoice in refMatches:
        candidates.push({
          invoice: invoice,
          matchType: 'reference',
          confidence: calculateConfidence(payment, invoice, 'reference'),
          amountMatch: payment.amount.equals(invoice.amountDue)
        })

    # Strategy 2: Exact amount + payee match
    exactAmountMatches = outstandingInvoices.filter(inv =>
      payment.amount.equals(inv.amountDue)
    )
    for invoice in exactAmountMatches:
      similarity = calculateNameSimilarity(payment.payeeName, invoice.contact.name)
      if similarity >= 0.7:
        candidates.push({
          invoice: invoice,
          matchType: 'exact_amount_payee',
          confidence: calculateConfidence(payment, invoice, 'exact_amount_payee'),
          amountMatch: true
        })

    # Strategy 3: Partial amount match (multiple invoices)
    if payment.amount.greaterThan(0):
      partialCombinations = findInvoiceCombinations(
        outstandingInvoices.filter(inv => inv.contact.name matches payment.payeeName),
        payment.amount
      )
      for combination in partialCombinations:
        candidates.push({
          invoices: combination,
          matchType: 'partial_multi',
          confidence: calculateConfidence(payment, combination, 'partial_multi'),
          amountMatch: sumAmounts(combination).equals(payment.amount)
        })

    # Strategy 4: Fuzzy payee name match
    for invoice in outstandingInvoices:
      similarity = calculateNameSimilarity(payment.payeeName, invoice.contact.name)
      if similarity >= 0.6:
        candidates.push({
          invoice: invoice,
          matchType: 'fuzzy_payee',
          confidence: calculateConfidence(payment, invoice, 'fuzzy_payee'),
          amountMatch: false
        })

    # 4. Sort candidates by confidence
    candidates.sort((a, b) => b.confidence - a.confidence)

    # 5. Make decision
    bestMatch = candidates[0]
    result = {
      paymentId: payment.id,
      candidates: candidates,
      bestMatch: bestMatch,
      confidence: bestMatch?.confidence || 0,
      reasoning: buildMatchingExplanation(payment, candidates),
      autoApplied: false
    }

    # 6. Auto-apply or escalate
    if bestMatch and bestMatch.confidence >= 0.90 and bestMatch.amountMatch:
      if bestMatch.matchType === 'partial_multi':
        # Apply to multiple invoices
        for invoice in bestMatch.invoices:
          await mcpXeroApplyPayment({
            invoiceId: invoice.id,
            paymentId: payment.xeroId,
            amount: invoice.amountDue
          })
      else:
        # Apply to single invoice
        await mcpXeroApplyPayment({
          invoiceId: bestMatch.invoice.id,
          paymentId: payment.xeroId,
          amount: payment.amount
        })

      result.autoApplied = true
      await logDecision('auto_matched', result)
    else:
      await logEscalation('ambiguous_payment_match', result,
        `Confidence ${bestMatch?.confidence * 100}% or multiple candidates`)
      await logDecision('escalated', result)

    return result

Confidence Scoring:
  function calculateConfidence(payment, invoice, matchType):
    let score = 0

    switch matchType:
      case 'reference':
        score = 100 # Exact reference match = 100%
        if not payment.amount.equals(invoice.amountDue):
          score -= 10 # Reduce if amount doesn't match
        break

      case 'exact_amount_payee':
        amountMatch = 40 # Exact amount
        nameSimilarity = calculateNameSimilarity(payment.payeeName, invoice.contact.name)
        nameMatch = nameSimilarity * 60 # Name similarity up to 60 points
        score = amountMatch + nameMatch
        break

      case 'partial_multi':
        amountMatch = payment.amount.equals(sumAmounts(invoices)) ? 50 : 0
        nameSimilarity = calculateNameSimilarity(payment.payeeName, invoices[0].contact.name)
        nameMatch = nameSimilarity * 30
        multiInvoicePenalty = -10 # Penalize for complexity
        score = amountMatch + nameMatch + multiInvoicePenalty
        break

      case 'fuzzy_payee':
        nameSimilarity = calculateNameSimilarity(payment.payeeName, invoice.contact.name)
        score = nameSimilarity * 50 # Max 50% confidence for name-only match
        break

    return Math.max(0, Math.min(100, score))

Name Similarity (Levenshtein-based):
  function calculateNameSimilarity(name1, name2):
    # Normalize names
    n1 = name1.toLowerCase().replace(/[^a-z0-9]/g, '')
    n2 = name2.toLowerCase().replace(/[^a-z0-9]/g, '')

    # Calculate Levenshtein distance
    distance = levenshteinDistance(n1, n2)
    maxLength = Math.max(n1.length, n2.length)

    # Convert to similarity score (0-1)
    similarity = 1 - (distance / maxLength)

    return similarity

Invoice Combination Finder:
  function findInvoiceCombinations(invoices, targetAmount):
    # Find all combinations of invoices that sum to targetAmount
    # Use dynamic programming or subset sum algorithm
    # Return top 3 combinations by likelihood

    combinations = []
    # ... subset sum implementation ...
    return combinations.slice(0, 3)

Reference Extractor:
  function extractInvoiceReference(description):
    # Try common patterns
    patterns = [
      /INV[- ]?(\d+)/i,
      /invoice[- ]?(\d+)/i,
      /ref[- ]?(\d+)/i,
      /(\d{5,})/  # 5+ digit number
    ]

    for pattern in patterns:
      match = description.match(pattern)
      if match:
        return match[1]

    return null
</pseudo_code>

<files_to_create>
  <file path="src/agents/payment-matcher/matcher.agent.ts">Main agent class with matching logic</file>
  <file path="src/agents/payment-matcher/matching-strategies.ts">Strategy pattern implementations</file>
  <file path="src/agents/payment-matcher/confidence-scorer.ts">Confidence calculation algorithm</file>
  <file path="src/agents/payment-matcher/context-loader.ts">Load invoices and payment data</file>
  <file path="src/agents/payment-matcher/reference-extractor.ts">Extract invoice references from descriptions</file>
  <file path="src/agents/payment-matcher/name-matcher.ts">Fuzzy name matching utility</file>
  <file path="src/agents/payment-matcher/matcher.module.ts">NestJS module definition</file>
  <file path="src/agents/payment-matcher/matcher.service.ts">Service layer for API integration</file>
  <file path=".claude/agents/payment-matcher/match-payments.md">Agent skill documentation</file>
  <file path="src/agents/payment-matcher/interfaces/matching.interface.ts">TypeScript interfaces</file>
  <file path="tests/agents/payment-matcher/matcher.spec.ts">Unit tests</file>
  <file path="tests/agents/payment-matcher/strategies.spec.ts">Strategy tests</file>
  <file path="tests/agents/payment-matcher/name-matcher.spec.ts">Name matching tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/app.module.ts">
    Import PaymentMatcherModule
  </file>
  <file path="src/modules/payment/payment.service.ts">
    Inject and use MatcherService for auto-matching
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Agent auto-applies exact reference + amount matches with 100% confidence</criterion>
  <criterion>Agent escalates partial matches and ambiguous cases</criterion>
  <criterion>Name similarity algorithm achieves >85% accuracy on test dataset</criterion>
  <criterion>Agent correctly handles overpayments (creates credit note)</criterion>
  <criterion>Batch processing completes 100 payments in under 60 seconds</criterion>
  <criterion>All decisions logged to decisions.jsonl with complete context</criterion>
  <criterion>MCP tool integration works with real Xero API</criterion>
  <criterion>Unit tests achieve >90% code coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- payment-matcher</command>
  <command>npm run test:e2e -- agents/matcher</command>
  <command>npm run lint</command>
  <command>npm run build</command>
</test_commands>

</task_spec>

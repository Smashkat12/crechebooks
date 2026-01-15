<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-BILL-005</task_id>
    <title>Fix Payment Matching Threshold</title>
    <priority>HIGH</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>billing</category>
    <estimated_effort>4-6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>payments</tag>
      <tag>matching</tag>
      <tag>auto-application</tag>
      <tag>threshold</tag>
    </tags>
  </metadata>

  <context>
    <problem_statement>
      Payment auto-application threshold is too permissive, matching payments to
      invoices with significant differences. This results in incorrect payment
      allocations, over/underpayment issues, and customer balance discrepancies.
    </problem_statement>

    <business_impact>
      - Incorrect payment allocation to wrong invoices
      - Customer accounts showing false balances
      - Increased manual reconciliation workload
      - Potential revenue recognition issues
      - Customer disputes over payment status
    </business_impact>

    <root_cause>
      Current matching algorithm uses a flat percentage threshold (e.g., 10%)
      without considering absolute amount differences. A 10% tolerance on a
      large invoice can result in matching payments that are hundreds off.
    </root_cause>

    <affected_users>
      - Finance team processing payments
      - Customers with multiple open invoices
      - Automated payment processing systems
    </affected_users>
  </context>

  <scope>
    <in_scope>
      <item>Payment matching algorithm refinement</item>
      <item>Configurable threshold system</item>
      <item>Manual review queue for edge cases</item>
      <item>Confidence scoring for matches</item>
      <item>Multi-invoice payment distribution</item>
    </in_scope>

    <out_of_scope>
      <item>Payment gateway integration</item>
      <item>Payment collection/refund processing</item>
      <item>Currency conversion</item>
      <item>Historical payment re-matching</item>
    </out_of_scope>

    <affected_files>
      <file>apps/api/src/billing/payment-matching.service.ts</file>
      <file>apps/api/src/billing/payment.service.ts</file>
      <file>apps/api/src/billing/models/payment-match.model.ts</file>
      <file>apps/api/src/billing/config/payment-matching.config.ts</file>
    </affected_files>

    <dependencies>
      <dependency type="feature">Manual review workflow</dependency>
      <dependency type="config">Organization-level matching rules</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement tiered matching rules with both percentage and absolute amount
      thresholds. Add confidence scoring and require manual review for matches
      below a confidence threshold. Support organization-specific configurations.
    </approach>

    <steps>
      <step order="1">
        <description>Define matching rule configuration structure</description>
        <details>
          - Create configuration schema for matching rules
          - Define default rules and organization override capability
          - Include exact match, near match, and partial match tiers
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/config/payment-matching.config.ts

export interface MatchingThreshold {
  maxPercentageDiff: number;  // Maximum % difference allowed
  maxAbsoluteDiff: number;    // Maximum absolute amount difference
  minConfidence: number;      // Minimum confidence for auto-application
  requiresReview: boolean;    // Whether to require manual review
}

export interface PaymentMatchingConfig {
  exactMatch: MatchingThreshold;
  nearMatch: MatchingThreshold;
  partialMatch: MatchingThreshold;

  // Multi-invoice matching settings
  enableMultiInvoice: boolean;
  maxInvoicesPerPayment: number;

  // Reference matching weights
  referenceMatchWeight: number;      // Weight for invoice number match
  amountMatchWeight: number;         // Weight for amount match
  dateProximityWeight: number;       // Weight for invoice date proximity
  customerHistoryWeight: number;     // Weight for customer payment patterns

  // Review queue settings
  autoApproveThreshold: number;      // Confidence above which to auto-apply
  autoRejectThreshold: number;       // Confidence below which to reject
  reviewQueueEnabled: boolean;
}

export const DEFAULT_MATCHING_CONFIG: PaymentMatchingConfig = {
  exactMatch: {
    maxPercentageDiff: 0,
    maxAbsoluteDiff: 0,
    minConfidence: 1.0,
    requiresReview: false,
  },
  nearMatch: {
    maxPercentageDiff: 0.5,    // 0.5% tolerance
    maxAbsoluteDiff: 5.00,      // Max 5.00 difference
    minConfidence: 0.95,
    requiresReview: false,
  },
  partialMatch: {
    maxPercentageDiff: 2.0,    // 2% tolerance
    maxAbsoluteDiff: 20.00,     // Max 20.00 difference
    minConfidence: 0.80,
    requiresReview: true,       // Requires manual review
  },

  enableMultiInvoice: true,
  maxInvoicesPerPayment: 10,

  referenceMatchWeight: 0.40,
  amountMatchWeight: 0.35,
  dateProximityWeight: 0.15,
  customerHistoryWeight: 0.10,

  autoApproveThreshold: 0.95,
  autoRejectThreshold: 0.30,
  reviewQueueEnabled: true,
};
```
        </code_snippet>
      </step>

      <step order="2">
        <description>Implement confidence scoring algorithm</description>
        <details>
          - Create multi-factor confidence calculation
          - Weight reference, amount, date, and history signals
          - Normalize scores to 0-1 range
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/payment-matching.service.ts

interface MatchCandidate {
  invoiceId: string;
  invoiceNumber: string;
  invoiceAmount: Decimal;
  invoiceDate: Date;
  customerId: string;
  confidence: number;
  matchFactors: MatchFactors;
}

interface MatchFactors {
  referenceScore: number;
  amountScore: number;
  dateProximityScore: number;
  customerHistoryScore: number;
}

@Injectable()
export class PaymentMatchingService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async findMatchCandidates(
    payment: Payment,
    config?: PaymentMatchingConfig
  ): Promise<MatchCandidate[]> {
    const matchConfig = config || await this.getOrgConfig(payment.organizationId);

    // Get open invoices for the customer
    const openInvoices = await this.prisma.invoice.findMany({
      where: {
        customerId: payment.customerId,
        status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
        outstandingAmount: { gt: 0 },
      },
      orderBy: { dueDate: 'asc' },
    });

    const candidates: MatchCandidate[] = [];

    for (const invoice of openInvoices) {
      const matchFactors = await this.calculateMatchFactors(
        payment,
        invoice,
        matchConfig
      );

      const confidence = this.calculateConfidence(matchFactors, matchConfig);

      if (confidence >= matchConfig.autoRejectThreshold) {
        candidates.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          invoiceAmount: new Decimal(invoice.outstandingAmount),
          invoiceDate: invoice.invoiceDate,
          customerId: invoice.customerId,
          confidence,
          matchFactors,
        });
      }
    }

    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  private async calculateMatchFactors(
    payment: Payment,
    invoice: Invoice,
    config: PaymentMatchingConfig
  ): Promise<MatchFactors> {
    const referenceScore = this.calculateReferenceScore(
      payment.reference,
      invoice.invoiceNumber
    );

    const amountScore = this.calculateAmountScore(
      new Decimal(payment.amount),
      new Decimal(invoice.outstandingAmount),
      config
    );

    const dateProximityScore = this.calculateDateProximityScore(
      payment.receivedDate,
      invoice.dueDate
    );

    const customerHistoryScore = await this.calculateCustomerHistoryScore(
      payment.customerId,
      invoice.id
    );

    return {
      referenceScore,
      amountScore,
      dateProximityScore,
      customerHistoryScore,
    };
  }

  private calculateReferenceScore(
    paymentRef: string | null,
    invoiceNumber: string
  ): number {
    if (!paymentRef) return 0;

    const normalizedRef = paymentRef.toUpperCase().replace(/\s+/g, '');
    const normalizedInvoice = invoiceNumber.toUpperCase().replace(/\s+/g, '');

    // Exact match
    if (normalizedRef === normalizedInvoice) return 1.0;

    // Contains invoice number
    if (normalizedRef.includes(normalizedInvoice)) return 0.9;
    if (normalizedInvoice.includes(normalizedRef)) return 0.8;

    // Partial match (Levenshtein distance)
    const distance = this.levenshteinDistance(normalizedRef, normalizedInvoice);
    const maxLen = Math.max(normalizedRef.length, normalizedInvoice.length);
    const similarity = 1 - (distance / maxLen);

    return Math.max(0, similarity * 0.7); // Cap partial matches at 0.7
  }

  private calculateAmountScore(
    paymentAmount: Decimal,
    invoiceAmount: Decimal,
    config: PaymentMatchingConfig
  ): number {
    const diff = paymentAmount.minus(invoiceAmount).abs();
    const percentageDiff = diff.dividedBy(invoiceAmount).times(100).toNumber();

    // Exact match
    if (diff.isZero()) return 1.0;

    // Check against near match threshold
    const nearMatch = config.nearMatch;
    if (
      percentageDiff <= nearMatch.maxPercentageDiff &&
      diff.lte(nearMatch.maxAbsoluteDiff)
    ) {
      // Scale score based on how close to exact
      return 0.95 - (percentageDiff / nearMatch.maxPercentageDiff) * 0.05;
    }

    // Check against partial match threshold
    const partialMatch = config.partialMatch;
    if (
      percentageDiff <= partialMatch.maxPercentageDiff &&
      diff.lte(partialMatch.maxAbsoluteDiff)
    ) {
      return 0.80 - (percentageDiff / partialMatch.maxPercentageDiff) * 0.30;
    }

    // Beyond thresholds - very low score
    return Math.max(0, 0.3 - (percentageDiff / 10) * 0.3);
  }

  private calculateDateProximityScore(
    paymentDate: Date,
    dueDate: Date
  ): number {
    const daysDiff = Math.abs(
      (paymentDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Payment on due date
    if (daysDiff <= 1) return 1.0;

    // Payment within a week of due date
    if (daysDiff <= 7) return 0.9;

    // Payment within a month
    if (daysDiff <= 30) return 0.7;

    // Older invoices get lower scores
    return Math.max(0.3, 1 - (daysDiff / 90) * 0.7);
  }

  private async calculateCustomerHistoryScore(
    customerId: string,
    invoiceId: string
  ): Promise<number> {
    // Get recent payment history for this customer
    const recentPayments = await this.prisma.paymentApplication.findMany({
      where: {
        payment: { customerId },
        createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      },
      include: { invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    if (recentPayments.length === 0) return 0.5; // Neutral for new customers

    // Check if customer typically pays exact amounts
    const exactPayments = recentPayments.filter(p =>
      new Decimal(p.amount).eq(p.invoice.total)
    );

    return 0.5 + (exactPayments.length / recentPayments.length) * 0.5;
  }

  private calculateConfidence(
    factors: MatchFactors,
    config: PaymentMatchingConfig
  ): number {
    return (
      factors.referenceScore * config.referenceMatchWeight +
      factors.amountScore * config.amountMatchWeight +
      factors.dateProximityScore * config.dateProximityWeight +
      factors.customerHistoryScore * config.customerHistoryWeight
    );
  }
}
```
        </code_snippet>
      </step>

      <step order="3">
        <description>Implement review queue for uncertain matches</description>
        <details>
          - Create review queue data model
          - Add UI for manual review decisions
          - Track review outcomes for algorithm improvement
        </details>
        <code_snippet>
```typescript
// apps/api/src/billing/payment-matching.service.ts

interface MatchDecision {
  action: 'auto_apply' | 'queue_review' | 'reject';
  confidence: number;
  candidate: MatchCandidate | null;
  reason: string;
}

async processPayment(payment: Payment): Promise<MatchDecision> {
  const config = await this.getOrgConfig(payment.organizationId);
  const candidates = await this.findMatchCandidates(payment, config);

  if (candidates.length === 0) {
    return {
      action: 'queue_review',
      confidence: 0,
      candidate: null,
      reason: 'No matching invoices found',
    };
  }

  const bestMatch = candidates[0];

  // Auto-apply high confidence matches
  if (bestMatch.confidence >= config.autoApproveThreshold) {
    await this.applyPaymentToInvoice(payment, bestMatch);
    return {
      action: 'auto_apply',
      confidence: bestMatch.confidence,
      candidate: bestMatch,
      reason: `High confidence match (${(bestMatch.confidence * 100).toFixed(1)}%)`,
    };
  }

  // Auto-reject very low confidence
  if (bestMatch.confidence < config.autoRejectThreshold) {
    return {
      action: 'reject',
      confidence: bestMatch.confidence,
      candidate: bestMatch,
      reason: `Best match confidence too low (${(bestMatch.confidence * 100).toFixed(1)}%)`,
    };
  }

  // Queue for manual review
  if (config.reviewQueueEnabled) {
    await this.createReviewQueueItem(payment, candidates);
    return {
      action: 'queue_review',
      confidence: bestMatch.confidence,
      candidate: bestMatch,
      reason: `Confidence below auto-approve threshold (${(bestMatch.confidence * 100).toFixed(1)}%)`,
    };
  }

  // Review queue disabled - reject uncertain matches
  return {
    action: 'reject',
    confidence: bestMatch.confidence,
    candidate: bestMatch,
    reason: 'Review queue disabled, cannot auto-apply uncertain match',
  };
}

async createReviewQueueItem(
  payment: Payment,
  candidates: MatchCandidate[]
): Promise<PaymentReviewItem> {
  return this.prisma.paymentReviewItem.create({
    data: {
      paymentId: payment.id,
      status: 'PENDING',
      candidates: candidates.map(c => ({
        invoiceId: c.invoiceId,
        invoiceNumber: c.invoiceNumber,
        confidence: c.confidence,
        matchFactors: c.matchFactors,
      })),
      suggestedMatch: candidates[0]?.invoiceId || null,
      createdAt: new Date(),
    },
  });
}
```
        </code_snippet>
      </step>

      <step order="4">
        <description>Add multi-invoice payment distribution</description>
        <details>
          - Handle payments covering multiple invoices
          - Apply in order of due date or user preference
          - Track partial payments accurately
        </details>
      </step>

      <step order="5">
        <description>Implement admin UI for review queue</description>
        <details>
          - List pending review items
          - Show match candidates with confidence scores
          - Allow manual invoice selection
          - Support bulk review actions
        </details>
      </step>
    </steps>

    <technical_notes>
      - Both percentage AND absolute thresholds must be satisfied
      - Reference matching should handle common variations (spaces, prefixes)
      - Confidence scores should be logged for algorithm tuning
      - Review queue should have SLA tracking for timely processing
      - Consider ML-based matching for future enhancement
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Exact amount match auto-applies</description>
        <preconditions>Payment of 100.00 for invoice of 100.00</preconditions>
        <expected_result>Payment auto-applied with 100% confidence</expected_result>
      </test_case>

      <test_case id="TC-002">
        <description>Near match within threshold auto-applies</description>
        <preconditions>Payment of 100.50 for invoice of 100.00, threshold 1%/1.00</preconditions>
        <expected_result>Payment auto-applied with high confidence</expected_result>
      </test_case>

      <test_case id="TC-003">
        <description>Exceeds absolute threshold queues for review</description>
        <preconditions>Payment of 125.00 for invoice of 100.00, threshold 5.00 absolute</preconditions>
        <expected_result>Payment queued for manual review</expected_result>
      </test_case>

      <test_case id="TC-004">
        <description>Reference match boosts confidence</description>
        <preconditions>Payment with reference "INV-2026-001" matches invoice INV-2026-001</preconditions>
        <expected_result>High confidence despite small amount difference</expected_result>
      </test_case>

      <test_case id="TC-005">
        <description>Multi-invoice payment distributed correctly</description>
        <preconditions>Payment of 300.00 for invoices of 100, 150, 100</preconditions>
        <expected_result>First two invoices paid in full, third partial</expected_result>
      </test_case>

      <test_case id="TC-006">
        <description>No match queues for review</description>
        <preconditions>Payment with no matching customer invoices</preconditions>
        <expected_result>Payment queued for manual allocation</expected_result>
      </test_case>
    </test_cases>

    <manual_testing>
      <step>Process payments with various confidence levels</step>
      <step>Review queue workflow - approve, reject, reassign</step>
      <step>Multi-invoice payment distribution</step>
      <step>Organization-specific threshold configuration</step>
    </manual_testing>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Tiered matching rules with percentage AND absolute thresholds</criterion>
      <criterion>Confidence scoring algorithm implemented</criterion>
      <criterion>Review queue for uncertain matches</criterion>
      <criterion>Multi-invoice payment distribution working</criterion>
      <criterion>Organization-level configuration supported</criterion>
      <criterion>Admin UI for review queue</criterion>
      <criterion>All test cases passing</criterion>
      <criterion>Finance team approval of matching accuracy</criterion>
    </criteria>

    <acceptance_checklist>
      <item checked="false">Matching configuration schema defined</item>
      <item checked="false">Confidence scoring algorithm implemented</item>
      <item checked="false">Tiered thresholds enforced</item>
      <item checked="false">Review queue created</item>
      <item checked="false">Admin UI for review workflow</item>
      <item checked="false">Multi-invoice distribution implemented</item>
      <item checked="false">Unit and integration tests</item>
      <item checked="false">Performance testing completed</item>
      <item checked="false">Documentation updated</item>
    </acceptance_checklist>
  </definition_of_done>

  <references>
    <reference type="issue">Support tickets - incorrect payment allocation</reference>
    <reference type="metric">Current auto-match accuracy rate</reference>
    <reference type="benchmark">Industry standard payment matching rules</reference>
  </references>
</task_specification>

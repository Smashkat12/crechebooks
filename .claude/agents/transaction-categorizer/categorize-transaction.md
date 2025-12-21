# Transaction Categorizer Agent Skill

## Purpose
Categorize bank transactions into Chart of Accounts categories using pattern matching
and historical analysis.

## Context Files Required
- `.claude/context/payee_patterns.json` - Regex patterns for payee matching
- `.claude/context/chart_of_accounts.json` - Valid account codes and names

## Algorithm

1. **Load Context**
   - Load patterns from payee_patterns.json
   - Load chart of accounts from chart_of_accounts.json
   - Get auto-apply threshold (default 80%)

2. **Pattern Matching**
   - Match transaction payee/description against regex patterns
   - Apply amount-based filtering (maxAmountCents)
   - Apply credit/debit filtering (isCredit)

3. **Historical Analysis**
   - Query similar transactions for the same payee
   - Use most common account code assignment

4. **Confidence Calculation** (0-100 scale)
   - Pattern match: up to 60 points (pattern_confidence × 0.6)
   - Historical match: up to 30 points (25 base + 1 per additional match, max 5)
   - Typical amount: up to 10 points
   - Description quality: up to 10 points (1 per word over 2 chars, max 10)

5. **Decision Making**
   - If confidence ≥ 80% AND pattern not flagged: AUTO_APPLY
   - If pattern flagged for review: ESCALATE (even if high confidence)
   - If amount exceeds pattern max: ESCALATE
   - If confidence < 80%: ESCALATE

## Autonomy Levels

| Condition | Level | Action |
|-----------|-------|--------|
| Confidence ≥ 80%, no flags | L3 (Full Auto) | Auto-apply categorization |
| Pattern flagged for review | L2 (Draft) | Create draft, escalate for review |
| Amount exceeds max | L1 (Suggest) | Suggest only, require confirmation |
| Confidence < 80% | L1 (Suggest) | Suggest only, require confirmation |

## Decision Logging

All decisions logged to `.claude/logs/decisions.jsonl`:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "agent": "transaction-categorizer",
  "tenantId": "uuid",
  "transactionId": "uuid",
  "decision": "categorize",
  "accountCode": "8100",
  "accountName": "Bank Charges",
  "confidence": 95,
  "source": "PATTERN",
  "autoApplied": true,
  "reasoning": "Matched pattern 'bank-fnb-fee': FNB SERVICE FEE",
  "patternId": "bank-fnb-fee"
}
```

## Escalation Logging

Low-confidence or flagged transactions logged to `.claude/logs/escalations.jsonl`:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "agent": "transaction-categorizer",
  "tenantId": "uuid",
  "transactionId": "uuid",
  "type": "LOW_CONFIDENCE_CATEGORIZATION",
  "reason": "Confidence 55% below threshold 80%",
  "suggestedAccount": "5900",
  "suggestedAccountName": "General Expenses",
  "confidence": 55,
  "status": "pending"
}
```

## VAT Type Mapping

| Pattern VAT Type | Enum Value | Description |
|------------------|------------|-------------|
| STANDARD | VatType.STANDARD | 15% VAT |
| ZERO_RATED | VatType.ZERO_RATED | 0% VAT (exports, basic foodstuffs) |
| EXEMPT | VatType.EXEMPT | No VAT (educational services) |
| NO_VAT | VatType.NO_VAT | Outside VAT system (salaries, bank charges) |

## Error Handling

- **Missing context files**: Fail fast with descriptive error
- **Invalid JSON**: Fail fast with parsing error
- **Invalid regex patterns**: Log error, skip pattern, continue
- **Database errors**: Log error, return fallback categorization
- **All amounts in CENTS**: Never use floats for monetary values

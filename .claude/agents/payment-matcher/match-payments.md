# Payment Matcher Agent Skill

## Purpose
Match incoming bank payments (credit transactions) to outstanding invoices
using confidence-based scoring.

## Confidence Algorithm (0-100 points)

### Reference Match (0-40 points)
| Match Type | Points |
|------------|--------|
| Exact match | 40 |
| Reference contains invoice number | 30 |
| Reference ends with invoice suffix | 15 |
| No match | 0 |

### Amount Match (0-40 points)
| Match Type | Points |
|------------|--------|
| Exact match | 40 |
| Within 1% or R1 | 35 |
| Within 5% | 25 |
| Within 10% | 15 |
| Partial payment (less than outstanding) | 10 |
| No match | 0 |

### Name Similarity (0-20 points)
| Similarity | Points |
|------------|--------|
| Exact match (100%) | 20 |
| Strong (>80%) | 15 |
| Good (>60%) | 10 |
| Weak (>40%) | 5 |
| No match | 0 |

## Decision Rules

| Condition | Action | Autonomy Level |
|-----------|--------|----------------|
| Single match ≥ 80% | AUTO_APPLY | L3 (Full Auto) |
| Multiple matches ≥ 80% | REVIEW_REQUIRED | L1 (Suggest) |
| Best match < 80% | REVIEW_REQUIRED | L1 (Suggest) |
| No matches ≥ 20% | NO_MATCH | N/A |

## Decision Logging

All decisions logged to `.claude/logs/decisions.jsonl`:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "agent": "payment-matcher",
  "tenantId": "uuid",
  "transactionId": "uuid",
  "transactionAmountCents": 400000,
  "decision": "match",
  "invoiceId": "uuid",
  "invoiceNumber": "INV-2025-001",
  "confidence": 95,
  "autoApplied": true,
  "reasoning": "Exact reference match; Exact amount match",
  "candidateCount": 1
}
```

## Escalation Logging

Ambiguous or low-confidence matches logged to `.claude/logs/escalations.jsonl`:

```json
{
  "timestamp": "2025-01-15T10:30:00.000Z",
  "agent": "payment-matcher",
  "tenantId": "uuid",
  "transactionId": "uuid",
  "type": "AMBIGUOUS_MATCH",
  "reason": "2 invoices with confidence >= 80%",
  "candidateInvoiceIds": ["uuid1", "uuid2"],
  "candidateInvoiceNumbers": ["INV-2025-001", "INV-2025-002"],
  "status": "pending"
}
```

## Escalation Types

| Type | Description |
|------|-------------|
| AMBIGUOUS_MATCH | Multiple high-confidence matches |
| LOW_CONFIDENCE | Best match below threshold |
| AMOUNT_MISMATCH | Transaction amount significantly different |

## Critical Rules

- **ALL amounts in CENTS** (integers, never floats)
- **Tenant isolation** on ALL queries
- **Fail fast** - no backwards compatibility
- **No mocks** in tests - use real PostgreSQL

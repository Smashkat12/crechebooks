# Agent Integration Traceability Matrix

## Overview

This document maps Claude Code Agents to their implementations and integration points across the CrecheBooks codebase.

## Agent Summary

| Agent | Task ID | Module | Status | Integration Points |
|-------|---------|--------|--------|-------------------|
| TransactionCategorizerAgent | TASK-AGENT-002 | TransactionCategorizerModule | ✅ Integrated | CategorizationService, OrchestratorAgent |
| PaymentMatcherAgent | TASK-AGENT-003 | PaymentMatcherModule | ✅ Integrated | PaymentMatchingService, OrchestratorAgent |
| SarsAgent | TASK-AGENT-004 | SarsAgentModule | ✅ Integrated | OrchestratorAgent |
| OrchestratorAgent | TASK-AGENT-005 | OrchestratorModule | ✅ Integrated | DatabaseModule (app level) |
| ExtractionValidatorAgent | TASK-AGENT-006 | ExtractionValidatorModule | ✅ Integrated | TransactionImportService, DatabaseModule |

---

## Detailed Integration Matrix

### 1. TransactionCategorizerAgent (TASK-AGENT-002)

**Module Path:** `apps/api/src/agents/transaction-categorizer/`

| Component | File | Purpose |
|-----------|------|---------|
| Agent | `categorizer.agent.ts` | AI-driven transaction categorization |
| Module | `categorizer.module.ts` | NestJS dependency injection |
| Interface | `interfaces/categorizer.interface.ts` | Type definitions |

**Integration Points:**

| Service | File | Method | Usage |
|---------|------|--------|-------|
| CategorizationService | `database/services/categorization.service.ts` | `categorizeTransactions()` | Agent invoked for AI categorization |
| OrchestratorAgent | `agents/orchestrator/orchestrator.agent.ts` | `processTransactions()` | Coordinated via orchestrator |

**Module Import Chain:**
```
DatabaseModule
  └── TransactionCategorizerModule (imported)
        └── TransactionCategorizerAgent (provider)
              └── Used by CategorizationService
```

---

### 2. PaymentMatcherAgent (TASK-AGENT-003)

**Module Path:** `apps/api/src/agents/payment-matcher/`

| Component | File | Purpose |
|-----------|------|---------|
| Agent | `matcher.agent.ts` | AI-driven payment-to-invoice matching |
| Module | `matcher.module.ts` | NestJS dependency injection |
| Interface | `interfaces/matcher.interface.ts` | Type definitions |

**Integration Points:**

| Service | File | Method | Usage |
|---------|------|--------|-------|
| PaymentMatchingService | `database/services/payment-matching.service.ts` | `findMatches()` | Agent invoked for AI matching |
| OrchestratorAgent | `agents/orchestrator/orchestrator.agent.ts` | `processPayments()` | Coordinated via orchestrator |

**Module Import Chain:**
```
DatabaseModule
  └── PaymentMatcherModule (imported)
        └── PaymentMatcherAgent (provider)
              └── Used by PaymentMatchingService
```

---

### 3. SarsAgent (TASK-AGENT-004)

**Module Path:** `apps/api/src/agents/sars-agent/`

| Component | File | Purpose |
|-----------|------|---------|
| Agent | `sars.agent.ts` | AI-driven SARS compliance validation |
| Module | `sars.module.ts` | NestJS dependency injection |
| Interface | `interfaces/sars.interface.ts` | Type definitions |

**Integration Points:**

| Service | File | Method | Usage |
|---------|------|--------|-------|
| OrchestratorAgent | `agents/orchestrator/orchestrator.agent.ts` | `validateSarsSubmission()` | Coordinated via orchestrator |

**Module Import Chain:**
```
DatabaseModule
  └── SarsAgentModule (forwardRef, imported)
        └── SarsAgent (provider)
              └── Used by OrchestratorAgent
```

---

### 4. OrchestratorAgent (TASK-AGENT-005)

**Module Path:** `apps/api/src/agents/orchestrator/`

| Component | File | Purpose |
|-----------|------|---------|
| Agent | `orchestrator.agent.ts` | Coordinates all AI agents |
| WorkflowRouter | `workflow-router.ts` | Routes tasks to appropriate agents |
| EscalationManager | `escalation-manager.ts` | Handles agent failures |
| Module | `orchestrator.module.ts` | NestJS dependency injection |

**Integration Points:**

| Module/Service | File | Usage |
|----------------|------|-------|
| DatabaseModule | `database/database.module.ts` | Module imported at app level |

**Module Import Chain:**
```
DatabaseModule
  └── OrchestratorModule (forwardRef, imported)
        └── OrchestratorAgent (provider)
              ├── TransactionCategorizerAgent (via module import)
              ├── PaymentMatcherAgent (via module import)
              └── SarsAgent (via module import)
```

**Coordination Capabilities:**
- `processTransactions()` - Batch transaction categorization
- `processPayments()` - Payment matching workflow
- `validateSarsSubmission()` - SARS compliance validation
- `escalateToHuman()` - Manual review escalation

---

### 5. ExtractionValidatorAgent (TASK-AGENT-006)

**Module Path:** `apps/api/src/agents/extraction-validator/`

| Component | File | Purpose |
|-----------|------|---------|
| Agent | `validator.agent.ts` | Validates PDF extraction quality |
| BalanceReconciler | `balance-reconciler.ts` | Balance reconciliation checks |
| AmountSanityChecker | `amount-sanity-checker.ts` | Amount validation |
| DecisionLogger | `decision-logger.ts` | JSONL audit logging |
| Module | `validator.module.ts` | NestJS dependency injection |
| Interface | `interfaces/validator.interface.ts` | Type definitions |

**Integration Points:**

| Service | File | Method | Usage |
|---------|------|--------|-------|
| TransactionImportService | `database/services/transaction-import.service.ts` | `validateBankStatement()` | Validates parsed bank statements |

**Module Import Chain:**
```
DatabaseModule
  └── ExtractionValidatorModule (imported)
        └── ExtractionValidatorAgent (provider)
              └── Used by TransactionImportService.validateBankStatement()
```

**Validation Capabilities:**
- Balance reconciliation (opening + transactions = closing)
- Amount sanity checks (reasonable values for SA creche business)
- OCR error detection (common decimal point errors)
- Confidence scoring (0-100 with 90% auto-accept threshold)
- Suggested corrections for common errors

---

## Module Import Summary

### database.module.ts Imports

```typescript
imports: [
  EmailModule,
  forwardRef(() => WhatsAppModule),
  SarsModule,
  TransactionCategorizerModule,      // TASK-AGENT-002
  PaymentMatcherModule,               // TASK-AGENT-003
  forwardRef(() => SarsAgentModule),  // TASK-AGENT-004
  forwardRef(() => OrchestratorModule), // TASK-AGENT-005
  ExtractionValidatorModule,          // TASK-AGENT-006
  forwardRef(() => NotificationModule),
  forwardRef(() => SimplePayModule),
],
```

---

## Decision Logging

All agents log decisions to `.claude/logs/` using JSONL format:

| Log File | Agent | Content |
|----------|-------|---------|
| `decisions.jsonl` | ExtractionValidatorAgent | All validation decisions |
| `escalations.jsonl` | ExtractionValidatorAgent | Invalid extractions needing review |
| `categorization-decisions.jsonl` | TransactionCategorizerAgent | Categorization decisions |
| `matching-decisions.jsonl` | PaymentMatcherAgent | Payment matching decisions |

---

## Test Coverage

| Agent | Test File | Tests |
|-------|-----------|-------|
| TransactionCategorizerAgent | `tests/agents/transaction-categorizer/categorizer.agent.spec.ts` | ✅ |
| PaymentMatcherAgent | `tests/agents/payment-matcher/matcher.agent.spec.ts` | ✅ |
| SarsAgent | `tests/agents/sars-agent/sars.agent.spec.ts` | ✅ |
| OrchestratorAgent | `tests/agents/orchestrator/orchestrator.agent.spec.ts` | ✅ |
| ExtractionValidatorAgent | `tests/agents/extraction-validator/validator.agent.spec.ts` | ✅ (22 tests) |

---

## Configuration

### Claude Code Agent Configuration

Located in `.claude/` directory:

| File | Purpose |
|------|---------|
| `settings.json` | Claude Code settings |
| `context/payee_patterns.json` | Learned payee patterns for categorization |
| `logs/decisions.jsonl` | Agent decision audit trail |
| `logs/escalations.jsonl` | Escalation audit trail |

---

## Future Enhancements

### Parser Enhancement (Recommended)

The ExtractionValidatorAgent is fully implemented but requires full `ParsedBankStatement` data with opening/closing balances. Currently, the HybridPdfParser only extracts transactions.

**Recommended enhancement:**
1. Modify HybridPdfParser to extract opening/closing balances
2. Return `ParsedBankStatement` instead of `ParsedTransaction[]`
3. Invoke validator in import flow for all PDF imports

### Integration with Reconciliation Flow

The ExtractionValidatorAgent can be called from the bank reconciliation flow where full statement data is available:

```typescript
// In ReconciliationService
const validation = await transactionImportService.validateBankStatement(
  parsedStatement,
  tenantId
);
if (!validation.isValid) {
  // Flag for manual review
}
```

---

**Last Updated:** 2026-01-10
**Author:** Claude Code

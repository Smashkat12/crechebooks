# TASK-XERO-007: Journal Entry Approach for Categorization Sync

## Overview

When a bank transaction is reconciled in Xero (reconciled with a bank statement), it cannot be edited via the API. This task implements a Journal Entry approach to move expenses from the suspense account (9999) to the correct expense account without modifying the original reconciled transaction.

## Problem Statement

1. Bank transactions are pulled from Xero into CrecheBooks for categorization
2. These transactions are initially reconciled to a suspense account (9999) in Xero
3. Users categorize transactions in CrecheBooks, selecting the correct expense account
4. When syncing back to Xero, if the transaction is reconciled, the API returns:
   `"This Bank Transaction cannot be edited as it has been reconciled with a Bank Statement."`
5. We need an alternative approach to move the expense from suspense to correct account

## Solution: Journal Entry Approach

Create a Manual Journal entry in Xero that:
- **Debits** the correct expense account (user's selected category)
- **Credits** the suspense account (9999)

This is accounting-correct and achieves the same net effect as editing the original transaction.

### Example

Original transaction: Bank payment of R1,000 reconciled to 9999 (Suspense)

Journal Entry:
| Account | Debit | Credit |
|---------|-------|--------|
| 6001 (Office Expenses) | R1,000 | |
| 9999 (Suspense) | | R1,000 |

Net effect: R1,000 moves from Suspense to Office Expenses

## Implementation Plan

### Phase 1: Database Schema

Add `XeroCategorizationJournal` model to track categorization journals:

```prisma
model XeroCategorizationJournal {
  id                 String   @id @default(cuid())
  tenantId           String
  transactionId      String   @unique // One journal per transaction
  xeroJournalId      String?  // Xero ManualJournal ID after posting
  journalNumber      String?
  status             CategorizationJournalStatus @default(PENDING)
  fromAccountCode    String   // Suspense account (9999)
  toAccountCode      String   // Target expense account
  amountCents        Int
  description        String
  narration          String
  postedAt           DateTime?
  errorMessage       String?
  retryCount         Int      @default(0)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  tenant             Tenant   @relation(fields: [tenantId], references: [id])
  transaction        Transaction @relation(fields: [transactionId], references: [id])

  @@index([tenantId])
  @@index([status])
}

enum CategorizationJournalStatus {
  PENDING
  POSTED
  FAILED
  CANCELLED
}
```

### Phase 2: Entity & DTO

Create entity and DTO files following existing patterns.

### Phase 3: Repository

Create repository with methods:
- `create()` - Create new categorization journal record
- `findByTransactionId()` - Check if journal exists for transaction
- `markAsPosted()` - Update after successful Xero post
- `markAsFailed()` - Update on failure
- `findPendingJournals()` - Get journals ready to post

### Phase 4: Update XeroSyncService

Add method `createCategorizationJournal()` that:
1. Creates a ManualJournal in Xero
2. Uses the same pattern as `XeroPayrollJournalService`
3. Handles rate limiting and retries
4. Records the journal in the database

### Phase 5: Update CategorizationService

Modify the sync flow:
1. Try to update the transaction directly (existing behavior)
2. If Xero returns "reconciled" error, create a journal entry instead
3. Log the approach taken for audit trail

## Error Handling

- **FAIL FAST**: If journal creation fails, propagate error with full context
- **NO WORKAROUNDS**: Don't silently skip or hide failures
- **ROBUST LOGGING**: Log all attempts, successes, and failures with context

## API Changes

None - existing categorization endpoint behavior unchanged from user perspective

## Test Requirements

- Use real Prisma database (test schema)
- No mocks for database operations
- Test the actual journal creation flow
- Verify journal balances (debits = credits)
- Test error scenarios (missing accounts, invalid codes)

## Verification Commands

```bash
# Build check
pnpm --filter @crechebooks/api build

# Type check
pnpm --filter @crechebooks/api typecheck

# Run specific tests
pnpm --filter @crechebooks/api test -- --testPathPattern="categorization-journal"

# Lint
pnpm --filter @crechebooks/api lint
```

## Acceptance Criteria

1. When categorizing a reconciled transaction, a journal entry is created in Xero
2. The journal correctly debits the expense account and credits suspense
3. The journal is recorded in the local database with Xero reference
4. Audit trail logs the journal creation
5. Build, typecheck, and lint pass
6. Integration tests pass with real database

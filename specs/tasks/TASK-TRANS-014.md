# TASK-TRANS-014: Xero Sync Service

## Metadata
- **Status**: ✅ Complete
- **Layer**: Logic
- **Sequence**: 19
- **Dependencies**: TASK-MCP-001 ✅, TASK-TRANS-001 ✅
- **Complexity**: High
- **Completed**: 2025-12-20
- **Tests**: 22 tests (757 total)

---

## Context

This task creates the XeroSyncService for bi-directional synchronization between CrecheBooks and Xero. The service syncs categorized transactions to Xero, pulls Chart of Accounts, and handles OAuth token management. All sync operations use the existing Xero MCP server tools.

**CRITICAL**: This service integrates with the existing `src/mcp/xero-mcp/` implementation. Do NOT create a separate MCP client wrapper - use the MCP tools directly.

---

## Current Codebase State

### Existing Files (DO NOT RECREATE)

**Xero MCP Server** (`src/mcp/xero-mcp/`):
```
src/mcp/xero-mcp/
├── server.ts              # Main MCP server - handles tool dispatch
├── config.ts              # Configuration loader
├── auth/
│   ├── token-manager.ts   # OAuth token refresh with 5-min buffer
│   └── encryption.ts      # AES-256 token encryption
├── tools/
│   ├── get-accounts.ts    # get_accounts tool
│   ├── get-transactions.ts # get_transactions tool
│   ├── update-transaction.ts # update_transaction tool
│   ├── create-invoice.ts  # create_invoice tool
│   ├── get-invoices.ts    # get_invoices tool
│   ├── apply-payment.ts   # apply_payment tool
│   ├── get-contacts.ts    # get_contacts tool
│   └── create-contact.ts  # create_contact tool
├── types/
│   ├── xero.types.ts      # XeroAccount, XeroTransaction, etc.
│   └── mcp.types.ts       # Tool input/output types
└── utils/
    ├── rate-limiter.ts    # 60 req/min sliding window
    ├── error-handler.ts   # XeroMCPError, handleXeroError
    └── logger.ts          # Structured JSON logging
```

**Transaction Repository** (`src/database/repositories/transaction.repository.ts`):
```typescript
// Existing methods:
create(dto: CreateTransactionDto): Promise<Transaction>
createMany(dtos: CreateTransactionDto[]): Promise<Transaction[]>
findById(tenantId: string, id: string): Promise<Transaction | null>
findByIds(tenantId: string, ids: string[]): Promise<Transaction[]>
findByTenant(tenantId: string, filter: TransactionFilterDto): Promise<PaginatedResult<Transaction>>
findPending(tenantId: string): Promise<Transaction[]>
update(tenantId: string, id: string, dto: UpdateTransactionDto): Promise<Transaction>
updateStatus(tenantId: string, id: string, status: TransactionStatus): Promise<Transaction>
softDelete(tenantId: string, id: string): Promise<void>
markReconciled(tenantId: string, id: string): Promise<Transaction>

// NEEDS TO BE ADDED:
findByXeroId(tenantId: string, xeroTransactionId: string): Promise<Transaction | null>
```

**Queue Configuration** (`src/config/queue.config.ts`):
```typescript
export const QUEUE_NAMES = {
  CATEGORIZATION: 'transaction-categorization',
  // ADD: XERO_SYNC: 'xero-sync',
} as const;
```

**Database Module** (`src/database/database.module.ts`):
- Services registered as providers and exports
- Pattern: constructor injection of repositories

### Prisma Models

**Transaction** (partial):
```prisma
model Transaction {
  id                String            @id @default(uuid())
  tenantId          String            @map("tenant_id")
  xeroTransactionId String?           @unique @map("xero_transaction_id")
  status            TransactionStatus @default(PENDING)
  // ... other fields
}
```

**XeroToken**:
```prisma
model XeroToken {
  id                String   @id @default(uuid())
  tenantId          String   @unique @map("tenant_id")
  xeroTenantId      String   @map("xero_tenant_id")
  encryptedTokens   String   @map("encrypted_tokens") @db.Text
  tokenExpiresAt    DateTime @map("token_expires_at")
}
```

### Existing Types

**From `src/mcp/xero-mcp/types/xero.types.ts`**:
```typescript
export interface XeroAccount {
  code: string;
  name: string;
  type: string;
  taxType: string | null;
  enablePaymentsToAccount: boolean;
}

export interface XeroTransaction {
  transactionId: string;
  bankAccount: string;
  date: Date;
  description: string;
  payeeName: string | null;
  reference: string | null;
  amountCents: number;
  isCredit: boolean;
  accountCode: string | null;
  status: string;
}

export interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}
```

**From `src/database/entities/categorization.entity.ts`**:
```typescript
export enum VatType {
  STANDARD = 'STANDARD',     // 15% VAT
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}
```

---

## Files to Create

### 1. `src/database/dto/xero-sync.dto.ts`

```typescript
/**
 * Xero Sync DTOs
 * TASK-TRANS-014
 */

export interface SyncResult {
  totalProcessed: number;
  synced: number;
  failed: number;
  conflicts: number;
  errors: SyncError[];
}

export interface SyncError {
  transactionId: string;
  error: string;
  code?: string;
}

export interface CategorySyncResult {
  accountsCreated: number;
  accountsUpdated: number;
  accountsArchived: number;
  total: number;
}

export interface PullResult {
  transactionsPulled: number;
  duplicatesSkipped: number;
  errors: string[];
}

export interface ConflictResolution {
  action: 'USE_LOCAL' | 'USE_XERO' | 'SKIP';
  reason: string;
}

// Maps our VatType to Xero tax type codes
export const VAT_TO_XERO_TAX: Record<string, string> = {
  STANDARD: 'OUTPUT2',        // 15% SA VAT
  ZERO_RATED: 'ZERORATEDOUTPUT',
  EXEMPT: 'EXEMPTOUTPUT',
  NO_VAT: 'NONE',
};
```

### 2. `src/database/services/xero-sync.service.ts`

```typescript
/**
 * XeroSyncService
 * TASK-TRANS-014
 *
 * Bi-directional sync between CrecheBooks and Xero.
 * Uses existing Xero MCP server tools for API calls.
 */

import { Injectable, Logger } from '@nestjs/common';
import { format } from 'date-fns';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { AuditLogService } from './audit-log.service';
import {
  SyncResult,
  SyncError,
  CategorySyncResult,
  PullResult,
  ConflictResolution,
  VAT_TO_XERO_TAX,
} from '../dto/xero-sync.dto';
import { TransactionStatus, ImportSource } from '../entities/transaction.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

// Import Xero MCP tools directly
import { getAccounts, getTransactions, updateTransaction } from '../../mcp/xero-mcp/tools';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import { XeroClient } from 'xero-node';

@Injectable()
export class XeroSyncService {
  private readonly logger = new Logger(XeroSyncService.name);
  private tokenManager: TokenManager;
  private xeroClient: XeroClient;

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    private readonly auditLogService: AuditLogService,
  ) {
    // Initialize TokenManager and XeroClient
    this.tokenManager = new TokenManager();
    this.xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID ?? '',
      clientSecret: process.env.XERO_CLIENT_SECRET ?? '',
      redirectUris: [process.env.XERO_REDIRECT_URI ?? ''],
      scopes: ['openid', 'profile', 'email', 'accounting.transactions', 'accounting.settings'],
    });
  }

  /**
   * Sync multiple transactions to Xero
   */
  async syncTransactions(transactionIds: string[], tenantId: string): Promise<SyncResult> {
    // Implementation...
  }

  /**
   * Push single transaction to Xero
   */
  async pushToXero(transactionId: string, tenantId: string): Promise<void> {
    // Implementation...
  }

  /**
   * Pull transactions from Xero
   */
  async pullFromXero(tenantId: string, dateFrom: Date, dateTo: Date): Promise<PullResult> {
    // Implementation...
  }

  /**
   * Sync Chart of Accounts from Xero
   */
  async syncChartOfAccounts(tenantId: string): Promise<CategorySyncResult> {
    // Implementation...
  }

  /**
   * Get authenticated XeroClient for tenant
   */
  private async getAuthenticatedClient(tenantId: string): Promise<{ client: XeroClient; xeroTenantId: string }> {
    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    this.xeroClient.setTokenSet({
      access_token: accessToken,
      token_type: 'Bearer',
    });

    return { client: this.xeroClient, xeroTenantId };
  }

  /**
   * Map VatType to Xero tax type
   */
  private mapVatToXeroTax(vatType: string): string {
    return VAT_TO_XERO_TAX[vatType] ?? 'NONE';
  }
}
```

### 3. `tests/database/services/xero-sync.service.spec.ts`

Integration tests using REAL database (no mocks).

---

## Files to Modify

### 1. Add `findByXeroId` to `src/database/repositories/transaction.repository.ts`

```typescript
/**
 * Find transaction by Xero transaction ID
 * @returns Transaction or null if not found
 * @throws DatabaseException for database errors
 */
async findByXeroId(tenantId: string, xeroTransactionId: string): Promise<Transaction | null> {
  try {
    return await this.prisma.transaction.findFirst({
      where: {
        tenantId,
        xeroTransactionId,
        isDeleted: false,
      },
    });
  } catch (error) {
    this.logger.error(
      `Failed to find transaction by xeroId: ${xeroTransactionId} for tenant: ${tenantId}`,
      error instanceof Error ? error.stack : String(error),
    );
    throw new DatabaseException(
      'findByXeroId',
      'Failed to find transaction by Xero ID',
      error instanceof Error ? error : undefined,
    );
  }
}
```

### 2. Update `src/config/queue.config.ts`

```typescript
export const QUEUE_NAMES = {
  CATEGORIZATION: 'transaction-categorization',
  XERO_SYNC: 'xero-sync',
} as const;
```

### 3. Update `src/database/database.module.ts`

```typescript
import { XeroSyncService } from './services/xero-sync.service';

@Module({
  providers: [
    // ... existing providers
    XeroSyncService,
  ],
  exports: [
    // ... existing exports
    XeroSyncService,
  ],
})
```

### 4. Update `src/database/services/index.ts`

```typescript
export * from './xero-sync.service';
```

### 5. Update `src/database/dto/index.ts`

```typescript
export * from './xero-sync.dto';
```

---

## Implementation Steps

### Step 1: Add Repository Method (15 min)
1. Add `findByXeroId` method to `transaction.repository.ts`
2. Add test for `findByXeroId` in `transaction.repository.spec.ts`

### Step 2: Update Queue Config (5 min)
1. Add `XERO_SYNC` to `QUEUE_NAMES` in `queue.config.ts`

### Step 3: Create DTOs (10 min)
1. Create `src/database/dto/xero-sync.dto.ts`
2. Export from `src/database/dto/index.ts`

### Step 4: Create XeroSyncService (60 min)
1. Create `src/database/services/xero-sync.service.ts`
2. Implement `syncTransactions` method
3. Implement `pushToXero` method
4. Implement `pullFromXero` method
5. Implement `syncChartOfAccounts` method
6. Register in `database.module.ts`
7. Export from `services/index.ts`

### Step 5: Create Tests (45 min)
1. Create `tests/database/services/xero-sync.service.spec.ts`
2. Test sync operations with real database
3. Test error handling
4. Test conflict resolution

### Step 6: Verify (15 min)
1. Run `npm run build` - must pass
2. Run `npm run lint` - must pass
3. Run `npm test` - all tests must pass

---

## Key Implementation Details

### Token Management
The `TokenManager` class in `src/mcp/xero-mcp/auth/token-manager.ts` handles:
- Token storage in encrypted format (AES-256)
- Automatic refresh 5 minutes before expiry
- Mutex lock to prevent concurrent refresh
- Methods: `getAccessToken()`, `getXeroTenantId()`, `hasValidConnection()`

### Rate Limiting
Xero API has 60 requests/minute limit. The `RateLimiter` in `src/mcp/xero-mcp/utils/rate-limiter.ts` handles this with a sliding window.

### Error Handling
Use `XeroMCPError` from `src/mcp/xero-mcp/utils/error-handler.ts` for Xero-specific errors. Always log with full context before throwing.

### Multi-tenancy
ALL queries MUST filter by `tenantId`. Never access data across tenants.

### Monetary Values
- All amounts are in **cents** (integers)
- Use `Decimal` from `decimal.js` for calculations
- Convert to decimal (divide by 100) only when sending to Xero API

---

## Test Cleanup Order

```typescript
beforeEach(async () => {
  await prisma.auditLog.deleteMany({});
  await prisma.reconciliation.deleteMany({});
  await prisma.sarsSubmission.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.xeroToken.deleteMany({});  // ADD THIS
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});
});
```

---

## Anti-Patterns to AVOID

1. **NO `any` type** - Use proper typing or `unknown`
2. **NO mocks in tests** - Use real database
3. **NO backwards compatibility hacks** - Fail fast
4. **NO floating point for money** - Use cents (integers)
5. **DO NOT create separate MCP client wrapper** - Use existing tools directly
6. **DO NOT bypass TokenManager** - It handles refresh automatically
7. **DO NOT store tokens in plaintext** - Use TokenManager's encryption

---

## Verification Criteria

- [x] `findByXeroId` added to TransactionRepository
- [x] XERO_SYNC queue added to queue config
- [x] XeroSyncService created with all methods
- [x] Transactions sync to Xero correctly
- [x] `xeroTransactionId` stored after sync
- [x] Chart of Accounts pulled from Xero
- [x] Duplicate detection works (skip already-synced)
- [x] Multi-tenant isolation verified
- [x] All tests pass with `--runInBand`
- [x] Build passes
- [x] Lint passes

---

## Test Commands

```bash
npm run build
npm run lint
npm test -- --testPathPattern="xero-sync"
npm test
```

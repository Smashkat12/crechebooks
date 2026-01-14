<task_spec id="TASK-XERO-004" version="2.0">

<metadata>
  <title>Push Categorizations to Xero API Endpoint</title>
  <status>pending</status>
  <phase>9</phase>
  <layer>logic</layer>
  <sequence>180</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-XERO-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-XERO-001</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-014</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-09</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Xero Integration State

  **Existing Xero Services (src/integrations/xero/):**
  - `xero.controller.ts` - OAuth flow, sync trigger, status check, bank feeds
  - `bank-feed.service.ts` - Import transactions from Xero bank statements
  - `xero.gateway.ts` - WebSocket progress events for sync operations
  - `xero.module.ts` - NestJS module exports

  **Existing Xero Sync Service (src/database/services/xero-sync.service.ts):**
  - `syncTransactions()` - Batch sync multiple transactions to Xero
  - `pushToXero()` - Push single transaction categorization to Xero (EXISTS!)
  - `pullFromXero()` - Pull transactions from Xero (implemented)
  - `syncChartOfAccounts()` - Fetch accounts from Xero (returns data, doesn't store)
  - `createInvoiceDraft()` - Create invoice in Xero
  - `syncPayment()` - Sync payment to Xero

  **Existing Database Models (prisma/schema.prisma):**
  - `XeroToken` - Stores encrypted access/refresh tokens per tenant
  - `XeroOAuthState` - Stores OAuth CSRF state
  - `BankConnection` - Bank account connections for sync
  - `Transaction` - Has `xeroTransactionId` field for Xero mapping
  - `TransactionStatus` enum - PENDING, CATEGORIZED, REVIEW_REQUIRED, SYNCED

  **GAP ANALYSIS:**
  - `XeroSyncService.pushToXero()` EXISTS but is NOT wired into the controller
  - `executeSyncAsync()` in xero.controller.ts (line ~764) only handles PULL direction
  - No PUSH direction block exists in the controller
  - No dedicated endpoint to push specific transactions

  **Xero API Base URL:** Uses xero-node SDK
  **Rate Limit:** 60 requests per minute

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Xero Authenticated Client Pattern
  ALWAYS use TokenManager to get authenticated XeroClient:
  ```typescript
  import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';

  // In service methods
  async someMethod(tenantId: string) {
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    if (!hasConnection) {
      throw new BusinessException(
        'No valid Xero connection. Please connect to Xero first.',
        'XERO_NOT_CONNECTED',
      );
    }

    const accessToken = await this.tokenManager.getAccessToken(tenantId);
    const xeroTenantId = await this.tokenManager.getXeroTenantId(tenantId);

    const client = new XeroClient({ ... });
    client.setTokenSet({ access_token: accessToken, token_type: 'Bearer' });
  }
  ```

  ### 3. Controller Pattern (src/integrations/xero/xero.controller.ts)
  ```typescript
  @Post('endpoint-name')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
  @ApiOperation({ summary: 'Description', description: 'Details' })
  @ApiResponse({ status: 200, description: 'Success', type: ResponseDto })
  async methodName(@CurrentUser() user: IUser): Promise<ResponseDto> {
    const tenantId = user.tenantId;
    // Always check connection first
    const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
    // ...
  }
  ```

  ### 4. Service Pattern
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SomeService {
    private readonly logger = new Logger(SomeService.name);
    // Every operation must log with full context
    // Every error must be logged and re-thrown (never swallowed)
  }
  ```

  ### 5. Audit Log Pattern
  ALWAYS audit Xero sync operations:
  ```typescript
  await this.auditLogService.logAction({
    tenantId,
    entityType: 'Transaction',
    entityId: transactionId,
    action: AuditAction.UPDATE,
    afterValue: {
      xeroTransactionId,
      syncedAt: new Date().toISOString(),
      syncType: 'XERO_SYNC',
    },
    changeSummary: 'Description of what happened',
  });
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag - prevents parallel DB conflicts
  ```
</critical_patterns>

<context>
This task implements the PUSH direction in the Xero sync controller to wire up the
existing `XeroSyncService.pushToXero()` method.

**Gap Analysis:**
The sync endpoint (`POST /xero/sync`) only implements PULL direction.
Looking at `executeSyncAsync()` (line ~764 in xero.controller.ts):

```typescript
// Current - only handles PULL
if (options.direction === 'pull' || options.direction === 'bidirectional') {
  // ... sync transactions from Xero
}
// MISSING: Push direction handling
```

The code comments at line 855-858 say:
"Future: implement invoice sync, payment sync, contact sync"

But `XeroSyncService.pushToXero()` already exists with:
- Conflict detection with Xero
- Account code update via `updateTransaction()`
- Status update to SYNCED
- Audit logging

**Business Logic:**
- Only push transactions that have categorizations
- Only push transactions with xeroTransactionId (from Xero originally)
- Skip already SYNCED transactions
- Handle conflicts using existing ConflictDetectionService
- Rate limit: max 60 requests/minute to Xero
- Emit WebSocket progress events during push
</context>

<scope>
  <in_scope>
    - Add PUSH direction handling in executeSyncAsync() method
    - Call XeroSyncService.syncTransactions() for categorized transactions
    - Add POST /xero/push-categorizations endpoint for specific transaction IDs
    - Progress events for push operations via XeroSyncGateway
    - Error handling and status tracking
    - Audit logging for all push attempts
  </in_scope>
  <out_of_scope>
    - Auto-push on categorization (TASK-XERO-005)
    - UI changes (surface layer)
    - Invoice/Payment/Contact sync
    - Chart of Accounts storage (TASK-XERO-006)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- XERO API REFERENCE                          -->
<!-- ============================================ -->

<xero_api_reference>
## Xero API Reference (via xero-node SDK)

### Update Bank Transaction (Account Code)
Uses MCP tool `updateTransaction()` from `src/mcp/xero-mcp/tools/index.ts`:
```typescript
await updateTransaction(
  client,           // XeroClient instance
  xeroTenantId,     // Xero tenant ID
  transactionId,    // Xero transaction ID
  accountCode,      // New account code
);
```

### Get Bank Transactions
Uses MCP tool `getTransactions()`:
```typescript
const transactions = await getTransactions(client, xeroTenantId, {
  fromDate: 'YYYY-MM-DD',
  toDate: 'YYYY-MM-DD',
});
```

### Rate Limits
- 60 requests per minute
- 5000 requests per day
- Use existing rate limiting in XeroSyncService
</xero_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE/MODIFY        -->
<!-- ============================================ -->

<dto_files>
## Add to src/integrations/xero/dto/xero.dto.ts

```typescript
// Add to existing DTOs in xero.dto.ts

export class PushCategorizationsRequestDto {
  @ApiPropertyOptional({
    description: 'Specific transaction IDs to push. If empty, pushes all categorized but unsynced.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transactionIds?: string[];
}

export class PushCategorizationsResponseDto {
  @ApiProperty({ description: 'Number of transactions synced' })
  synced!: number;

  @ApiProperty({ description: 'Number of transactions that failed' })
  failed!: number;

  @ApiProperty({ description: 'Number of transactions skipped (already synced or no Xero ID)' })
  skipped!: number;

  @ApiProperty({ description: 'Error details for failed transactions' })
  errors!: Array<{
    transactionId: string;
    error: string;
    code: string;
  }>;
}
```
</dto_files>

<controller_additions>
## Modify src/integrations/xero/xero.controller.ts

### 1. Add imports at top of file:
```typescript
import { XeroSyncService } from '../../database/services/xero-sync.service';
import {
  PushCategorizationsRequestDto,
  PushCategorizationsResponseDto
} from './dto/xero.dto';
```

### 2. Add XeroSyncService to constructor:
```typescript
constructor(
  private readonly prisma: PrismaService,
  private readonly bankFeedService: BankFeedService,
  private readonly syncGateway: XeroSyncGateway,
  private readonly xeroSyncService: XeroSyncService,  // ADD THIS
) {
  this.tokenManager = new TokenManager(this.prisma);
}
```

### 3. Add PUSH handling in executeSyncAsync() (after line ~846):
```typescript
// Add after the existing PULL block (around line 846):

// TASK-XERO-004: Handle PUSH direction
if (options.direction === 'push' || options.direction === 'bidirectional') {
  this.logger.log(`Pushing categorizations to Xero for tenant ${tenantId}`);

  this.syncGateway.emitProgress(tenantId, {
    entity: 'categorizations',
    total: 100,
    processed: 0,
    percentage: 0,
  });

  // Find transactions that are categorized but not synced
  const unsyncedTransactions = await this.prisma.transaction.findMany({
    where: {
      tenantId,
      status: { not: 'SYNCED' },
      xeroTransactionId: { not: null }, // Must have Xero ID
    },
    include: {
      categorizations: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  // Filter to only those with categorizations
  const toSync = unsyncedTransactions.filter(tx => tx.categorizations.length > 0);

  if (toSync.length > 0) {
    this.logger.log(`Found ${toSync.length} transactions to push to Xero`);

    const pushResult = await this.xeroSyncService.syncTransactions(
      toSync.map(tx => tx.id),
      tenantId,
    );

    this.syncGateway.emitProgress(tenantId, {
      entity: 'categorizations',
      total: toSync.length,
      processed: pushResult.synced + pushResult.skipped,
      percentage: 100,
    });

    this.logger.log(
      `Push complete: ${pushResult.synced} synced, ${pushResult.skipped} skipped, ${pushResult.failed} failed`,
    );
  } else {
    this.logger.log('No categorized transactions to push');
    this.syncGateway.emitProgress(tenantId, {
      entity: 'categorizations',
      total: 0,
      processed: 0,
      percentage: 100,
    });
  }
}
```

### 4. Add new endpoint for manual push:
```typescript
/**
 * Push transaction categorizations to Xero
 * POST /xero/push-categorizations
 */
@Post('push-categorizations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({
  summary: 'Push transaction categorizations to Xero',
  description: 'Pushes local categorizations to update Xero transactions. If no IDs provided, pushes all categorized but unsynced.',
})
@ApiResponse({
  status: 200,
  description: 'Push operation completed',
  type: PushCategorizationsResponseDto,
})
@ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async pushCategorizations(
  @Body() body: PushCategorizationsRequestDto,
  @CurrentUser() user: IUser,
): Promise<PushCategorizationsResponseDto> {
  const tenantId = user.tenantId;

  // Check connection
  const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
  if (!hasConnection) {
    throw new BusinessException(
      'No valid Xero connection. Please connect to Xero first.',
      'XERO_NOT_CONNECTED',
    );
  }

  let transactionIds = body.transactionIds ?? [];

  // If no specific IDs, get all categorized but unsynced
  if (transactionIds.length === 0) {
    const unsynced = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        status: { in: ['CATEGORIZED', 'REVIEW_REQUIRED'] },
        xeroTransactionId: { not: null },
      },
      include: {
        categorizations: {
          take: 1,
        },
      },
    });
    transactionIds = unsynced
      .filter(tx => tx.categorizations.length > 0)
      .map(tx => tx.id);
  }

  if (transactionIds.length === 0) {
    return { synced: 0, failed: 0, skipped: 0, errors: [] };
  }

  this.logger.log(`Pushing ${transactionIds.length} categorizations to Xero for tenant ${tenantId}`);

  const result = await this.xeroSyncService.syncTransactions(
    transactionIds,
    tenantId,
  );

  return {
    synced: result.synced,
    failed: result.failed,
    skipped: result.skipped,
    errors: result.errors.map(e => ({
      transactionId: e.transactionId,
      error: e.error,
      code: e.code,
    })),
  };
}
```
</controller_additions>

<module_update>
## Update src/integrations/xero/xero.module.ts

Add XeroSyncService import and to the module:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { SharedModule } from '../../shared/shared.module';
import { XeroController } from './xero.controller';
import { BankFeedService } from './bank-feed.service';
import { XeroSyncGateway } from './xero.gateway';
import { XeroSyncService } from '../../database/services/xero-sync.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  controllers: [XeroController],
  providers: [
    BankFeedService,
    XeroSyncGateway,
    XeroSyncService,  // ADD
  ],
  exports: [
    BankFeedService,
    XeroSyncGateway,
    XeroSyncService,  // ADD
  ],
})
export class XeroModule {}
```

Note: If XeroSyncService is already provided by DatabaseModule, you may only need to import it in the controller.
</module_update>

<test_requirements>
## Test Files Required

### tests/integrations/xero/xero-push.controller.spec.ts (12+ tests)

Test scenarios:
1. `POST /xero/push-categorizations` - pushes specific transaction IDs
2. `POST /xero/push-categorizations` - pushes all unsynced when no IDs provided
3. `POST /xero/push-categorizations` - returns empty result when no transactions to push
4. `POST /xero/push-categorizations` - throws XERO_NOT_CONNECTED when no connection
5. `POST /xero/push-categorizations` - skips transactions without xeroTransactionId
6. `POST /xero/push-categorizations` - skips transactions without categorizations
7. `POST /xero/push-categorizations` - handles partial failures gracefully
8. `POST /xero/sync direction=push` - triggers push sync
9. `POST /xero/sync direction=bidirectional` - triggers both pull and push
10. PUSH direction emits WebSocket progress events
11. Push updates transaction status to SYNCED
12. Push creates audit log entries

Test data (South African context):
```typescript
const testTransaction = {
  tenantId: '', // set in beforeEach
  xeroTransactionId: 'xero-tx-001',
  bankAccount: 'FNB Business',
  date: new Date('2026-01-08'),
  description: 'WOOLWORTHS CAPE GATE',
  payeeName: 'WOOLWORTHS',
  amountCents: -125000, // R1,250.00
  isCredit: false,
  status: TransactionStatus.CATEGORIZED,
};

const testCategorization = {
  transactionId: '', // set in beforeEach
  accountCode: '5100',
  accountName: 'Groceries & Supplies',
  confidenceScore: 92,
  source: CategorizationSource.USER_OVERRIDE,
  vatType: VatType.STANDARD,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update DTO file
# Edit src/integrations/xero/dto/xero.dto.ts with new DTOs

# 2. Update controller file
# Edit src/integrations/xero/xero.controller.ts with push handling

# 3. Update module file (if needed)
# Edit src/integrations/xero/xero.module.ts

# 4. Create test file
# Create tests/integrations/xero/xero-push.controller.spec.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 400+ tests passing

# 6. Manual verification
# Start API: pnpm run start:dev
# Trigger sync: POST /xero/sync { "direction": "push" }
# Push specific: POST /xero/push-categorizations { "transactionIds": ["..."] }
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Only push transactions that have categorizations
    - Only push transactions with xeroTransactionId (from Xero)
    - Skip already SYNCED transactions
    - Handle conflicts using existing ConflictDetectionService
    - Rate limit: respect Xero 60 req/min
    - Audit log all push attempts
    - WebSocket progress events must be emitted
    - All errors must be logged with full context
    - Must NOT break existing PULL functionality
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 400+ tests passing
    - POST /xero/sync with direction=push works
    - POST /xero/sync with direction=bidirectional does both pull and push
    - POST /xero/push-categorizations pushes specific transactions
    - Transaction status updates to SYNCED on success
    - Audit logs created for push operations
    - WebSocket progress events emitted correctly
    - Conflict detection prevents data loss
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Push transactions without checking xeroTransactionId
  - Push transactions without categorizations
  - Swallow errors without logging
  - Break existing PULL functionality
  - Skip audit logging
  - Skip WebSocket progress events
  - Create new XeroClient instances without using TokenManager
  - Ignore rate limits (60 req/min)
  - Push transactions that are already SYNCED
</anti_patterns>

</task_spec>

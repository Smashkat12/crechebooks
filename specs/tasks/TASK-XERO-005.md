<task_spec id="TASK-XERO-005" version="2.0">

<metadata>
  <title>Auto-Push Categorization on User Review</title>
  <status>DONE</status>
  <phase>9</phase>
  <layer>logic</layer>
  <sequence>181</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-XERO-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-XERO-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>5 hours</estimated_effort>
  <last_updated>2026-01-09</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Categorization Flow State

  **Frontend Flow (apps/web/):**
  - `components/transactions/categorization-dialog.tsx` - User categorization UI
  - `hooks/use-transactions.ts` - useCategorizeTransaction mutation
  - User clicks Save → calls API → saves locally → dialog closes

  **Backend Flow (apps/api/):**
  - `api/transaction/transaction.controller.ts` - PUT :id/categorize endpoint
  - `database/services/categorization.service.ts` - updateCategorization method
  - Updates categorization in DB, updates transaction status to CATEGORIZED
  - NO Xero sync triggered!

  **Xero Sync Service (src/database/services/xero-sync.service.ts):**
  - `pushToXero()` - Push single transaction to Xero (EXISTS!)
  - `syncTransactions()` - Batch push (EXISTS!)
  - Both work but are NOT called after categorization

  **GAP ANALYSIS:**
  User categorizes transaction → saved locally ✅ → NOT synced to Xero ❌

  **User Expectation:**
  "I categorize a transaction in CrecheBooks, it updates in Xero"

  **Transaction Status Flow:**
  PENDING → CATEGORIZED (after user review) → SYNCED (after Xero push)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Service Injection Pattern
  ```typescript
  @Injectable()
  export class CategorizationService {
    constructor(
      // ... existing dependencies ...
      @Optional() private readonly xeroSyncService?: XeroSyncService,
      @Optional() private readonly tokenManager?: TokenManager,
    ) {}
  }
  ```

  ### 3. Async Sync Pattern (Non-blocking)
  Xero sync should NOT block the user's categorization save:
  ```typescript
  // Save categorization first (always succeeds)
  const categorization = await this.saveLocally(...);

  // Then try Xero sync (optional, doesn't block)
  let xeroSync: { status: string; error?: string } | null = null;
  try {
    const synced = await this.xeroSyncService.pushToXero(transactionId, tenantId);
    xeroSync = { status: synced ? 'synced' : 'skipped' };
  } catch (error) {
    xeroSync = { status: 'failed', error: error.message };
  }

  return { categorization, xeroSync };
  ```

  ### 4. Response Type Pattern
  API responses should include sync status:
  ```typescript
  interface CategorizationResponse {
    categorization: Categorization;
    xeroSyncStatus: 'pending' | 'synced' | 'failed' | 'skipped';
    xeroSyncError?: string;
  }
  ```

  ### 5. Frontend Toast Pattern
  ```typescript
  if (result.xeroSyncStatus === 'synced') {
    toast({ title: 'Categorized & Synced', description: '...' });
  } else if (result.xeroSyncStatus === 'failed') {
    toast({ variant: 'warning', title: 'Categorized (Sync Pending)', ... });
  }
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task triggers automatic Xero sync when a user confirms/modifies a categorization.

**Current User Flow (apps/web/src/components/transactions/categorization-dialog.tsx):**
```typescript
const handleSave = async () => {
  await categorizeTransaction.mutateAsync({
    transactionId: transaction.id,
    categoryId: selectedCategory,
    // ...
  });
  // Dialog closes - no Xero sync indicator
};
```

**Current Backend (apps/api/src/api/transaction/transaction.controller.ts):**
```typescript
@Put(':id/categorize')
async updateCategorization() {
  // Updates categorization in DB
  // Does NOT push to Xero
}
```

**Desired Flow:**
1. User opens CategorizationDialog
2. User confirms or changes category
3. User clicks Save
4. Transaction categorization saved locally ✅
5. Categorization pushed to Xero ✅ (NEW)
6. User sees sync status toast ✅ (NEW)

**Sync Logic:**
- Push only if transaction has xeroTransactionId (came from Xero originally)
- Push only if tenant has valid Xero connection
- Never block the categorization save on Xero sync
- Show appropriate toast based on sync result
</context>

<scope>
  <in_scope>
    - Add categorizeAndSync method to CategorizationService
    - Update transaction.controller.ts to call categorizeAndSync
    - Return xeroSyncStatus in API response
    - Update frontend hook response type
    - Add toast notifications for sync status
    - Audit logging for sync attempts
  </in_scope>
  <out_of_scope>
    - Batch categorization Xero sync (future enhancement)
    - Real-time WebSocket updates for sync status
    - Manual retry button in UI (future enhancement)
    - Sync status column in transaction table (future)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- XERO API REFERENCE                          -->
<!-- ============================================ -->

<xero_api_reference>
## Xero Sync Service Methods (Already Exist)

### pushToXero (src/database/services/xero-sync.service.ts)
```typescript
/**
 * Push single transaction to Xero
 * @returns true if synced, false if skipped (already synced or no Xero ID)
 */
async pushToXero(
  transactionId: string,
  tenantId: string,
  client?: XeroClient,
  xeroTenantId?: string,
): Promise<boolean>;
```

### hasValidConnection (via TokenManager)
```typescript
/**
 * Check if tenant has valid Xero connection
 */
async hasValidConnection(tenantId: string): Promise<boolean>;
```

### Sync Status Enum
```typescript
type XeroSyncStatus = 'pending' | 'synced' | 'failed' | 'skipped';

// skipped = no xeroTransactionId or no Xero connection
// pending = queued for sync (future: async queue)
// synced = successfully pushed to Xero
// failed = push attempted but failed
```
</xero_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE/MODIFY        -->
<!-- ============================================ -->

<dto_files>
## Add to src/api/transaction/dto/update-categorization.dto.ts

```typescript
// Add to existing UpdateCategorizationResponseDto or create new

export interface XeroSyncResult {
  status: 'pending' | 'synced' | 'failed' | 'skipped';
  error?: string;
}

// Update UpdateCategorizationResponseDto to include:
export class UpdateCategorizationResponseDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  data!: {
    id: string;
    status: string;
    account_code: string;
    account_name: string;
    source: string;
    pattern_created: boolean;
    payment_allocations?: Array<{
      payment_id: string;
      invoice_id: string;
      invoice_number: string;
      amount_cents: number;
    }>;
    unallocated_cents?: number;
    // NEW: Xero sync status
    xero_sync_status?: 'pending' | 'synced' | 'failed' | 'skipped';
    xero_sync_error?: string;
  };
}
```
</dto_files>

<service_file>
## Modify src/database/services/categorization.service.ts

### 1. Add imports at top:
```typescript
import { XeroSyncService } from './xero-sync.service';
import { TokenManager } from '../../mcp/xero-mcp/auth/token-manager';
import { PrismaService } from '../prisma/prisma.service';
```

### 2. Add to constructor:
```typescript
constructor(
  private readonly transactionRepo: TransactionRepository,
  private readonly categorizationRepo: CategorizationRepository,
  private readonly payeePatternRepo: PayeePatternRepository,
  private readonly auditLogService: AuditLogService,
  @Inject(forwardRef(() => PatternLearningService))
  private readonly patternLearningService: PatternLearningService,
  private readonly payeeAliasService: PayeeAliasService,
  private readonly prisma: PrismaService,  // ADD
  @Optional()
  private readonly recurringDetectionService?: RecurringDetectionService,
  @Optional()
  private readonly categorizerAgent?: TransactionCategorizerAgent,
  @Optional()
  private readonly accuracyMetricsService?: AccuracyMetricsService,
  @Optional()
  private readonly xeroSyncService?: XeroSyncService,  // ADD
) {
  // Initialize TokenManager if PrismaService available
  this.tokenManager = this.prisma ? new TokenManager(this.prisma) : undefined;
}

private readonly tokenManager?: TokenManager;
```

### 3. Add new method categorizeAndSync:
```typescript
/**
 * Categorize and optionally sync to Xero
 * TASK-XERO-005: Auto-push on user review
 *
 * @param transactionId - Transaction ID
 * @param dto - Categorization data
 * @param userId - User performing the action
 * @param tenantId - Tenant ID for isolation
 * @param syncToXero - Whether to sync to Xero (default true)
 * @returns Categorization result with Xero sync status
 */
async categorizeAndSync(
  transactionId: string,
  dto: UserCategorizationDto,
  userId: string,
  tenantId: string,
  syncToXero: boolean = true,
): Promise<{
  transaction: Transaction;
  xeroSync: { status: 'pending' | 'synced' | 'failed' | 'skipped'; error?: string } | null;
}> {
  // First, save categorization locally (always succeeds)
  const transaction = await this.updateCategorization(
    transactionId,
    dto,
    userId,
    tenantId,
  );

  // Check if we should sync to Xero
  if (!syncToXero || !this.xeroSyncService || !this.tokenManager) {
    return { transaction, xeroSync: null };
  }

  // Get transaction to check for Xero ID
  const fullTransaction = await this.transactionRepo.findById(tenantId, transactionId);
  if (!fullTransaction?.xeroTransactionId) {
    this.logger.debug(
      `Transaction ${transactionId} has no Xero ID, skipping sync`,
    );
    return {
      transaction,
      xeroSync: { status: 'skipped', error: 'No Xero transaction ID' },
    };
  }

  // Check Xero connection
  const hasConnection = await this.tokenManager.hasValidConnection(tenantId);
  if (!hasConnection) {
    this.logger.debug(
      `Tenant ${tenantId} has no Xero connection, skipping sync`,
    );
    return {
      transaction,
      xeroSync: { status: 'skipped', error: 'No Xero connection' },
    };
  }

  // Push to Xero (async but await result for status)
  try {
    const synced = await this.xeroSyncService.pushToXero(
      transactionId,
      tenantId,
    );

    if (synced) {
      this.logger.log(
        `Transaction ${transactionId} synced to Xero successfully`,
      );
      return { transaction, xeroSync: { status: 'synced' } };
    } else {
      return { transaction, xeroSync: { status: 'skipped' } };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error(
      `Xero sync failed for transaction ${transactionId}: ${errorMessage}`,
      error instanceof Error ? error.stack : undefined,
    );

    // Audit log the failure
    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'Transaction',
      entityId: transactionId,
      action: 'UPDATE' as any,
      afterValue: {
        xeroSyncFailed: true,
        xeroSyncError: errorMessage,
        attemptedAt: new Date().toISOString(),
      },
      changeSummary: `Xero sync failed: ${errorMessage}`,
    });

    return {
      transaction,
      xeroSync: { status: 'failed', error: errorMessage },
    };
  }
}
```
</service_file>

<controller_additions>
## Modify src/api/transaction/transaction.controller.ts

### 1. Update the updateCategorization method:
```typescript
@Put(':id/categorize')
@ApiOperation({
  summary: 'Update transaction categorization',
  description:
    'Manually override categorization for a transaction. Automatically syncs to Xero if connected.',
})
@ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
@ApiResponse({
  status: 200,
  description: 'Categorization updated successfully',
  type: UpdateCategorizationResponseDto,
})
async updateCategorization(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateCategorizationRequestDto,
  @CurrentUser() user: IUser,
): Promise<UpdateCategorizationResponseDto> {
  this.logger.log(
    `Update categorization: tx=${id}, account=${dto.account_code}, tenant=${user.tenantId}`,
  );

  // Map API DTO to service DTO
  const serviceDto: ServiceUserCategorizationDto = {
    accountCode: dto.account_code,
    accountName: dto.account_name,
    isSplit: dto.is_split,
    splits: dto.splits?.map((s) => ({
      accountCode: s.account_code,
      accountName: s.account_name,
      amountCents: s.amount_cents,
      vatType: s.vat_type as unknown as VatType,
      description: s.description,
    })),
    vatType: dto.vat_type as unknown as VatType,
    createPattern: dto.create_pattern,
  };

  // TASK-XERO-005: Use categorizeAndSync instead of updateCategorization
  const { transaction, xeroSync } = await this.categorizationService.categorizeAndSync(
    id,
    serviceDto,
    user.id,
    user.tenantId,
    true, // syncToXero
  );

  // Build response
  const response: UpdateCategorizationResponseDto = {
    success: true,
    data: {
      id: transaction.id,
      status: transaction.status,
      account_code: dto.account_code,
      account_name: dto.account_name,
      source: 'USER_OVERRIDE',
      pattern_created: dto.create_pattern !== false && !dto.is_split,
      // TASK-XERO-005: Include Xero sync status
      xero_sync_status: xeroSync?.status,
      xero_sync_error: xeroSync?.error,
    },
  };

  // ... rest of existing parent_id allocation logic ...

  return response;
}
```
</controller_additions>

<frontend_files>
## Modify apps/web/src/hooks/use-transactions.ts

### Update response type:
```typescript
interface CategorizeTransactionResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    account_code: string;
    account_name: string;
    source: string;
    pattern_created: boolean;
    payment_allocations?: Array<{
      payment_id: string;
      invoice_id: string;
      invoice_number: string;
      amount_cents: number;
    }>;
    unallocated_cents?: number;
    // TASK-XERO-005: Xero sync status
    xero_sync_status?: 'pending' | 'synced' | 'failed' | 'skipped';
    xero_sync_error?: string;
  };
}
```

## Modify apps/web/src/components/transactions/categorization-dialog.tsx

### Update handleSave to show sync status:
```typescript
const handleSave = async () => {
  try {
    const result = await categorizeTransaction.mutateAsync({
      transactionId: transaction.id,
      categoryId: selectedCategory,
      // ...other fields
    });

    // TASK-XERO-005: Show sync status toast
    if (result.data.xero_sync_status === 'synced') {
      toast({
        title: 'Categorized & Synced',
        description: 'Transaction categorized and synced to Xero.',
      });
    } else if (result.data.xero_sync_status === 'failed') {
      toast({
        variant: 'warning',
        title: 'Categorized (Sync Pending)',
        description: `Saved locally. Xero sync failed: ${result.data.xero_sync_error || 'Unknown error'}. Will retry on next sync.`,
      });
    } else if (result.data.xero_sync_status === 'skipped') {
      toast({
        title: 'Categorized',
        description: 'Transaction categorized successfully.',
      });
    } else {
      toast({
        title: 'Categorized',
        description: 'Transaction categorized successfully.',
      });
    }

    onOpenChange(false);
    onSuccess?.();
  } catch (error) {
    console.error('Failed to categorize:', error);
    toast({
      variant: 'destructive',
      title: 'Error',
      description: 'Failed to save categorization.',
    });
  }
};
```
</frontend_files>

<test_requirements>
## Test Files Required

### tests/database/services/categorization-sync.service.spec.ts (15+ tests)

Test scenarios:
1. categorizeAndSync - saves locally and syncs to Xero
2. categorizeAndSync - returns 'synced' status on success
3. categorizeAndSync - returns 'skipped' when no xeroTransactionId
4. categorizeAndSync - returns 'skipped' when no Xero connection
5. categorizeAndSync - returns 'failed' on Xero error
6. categorizeAndSync - does not block on Xero failure
7. categorizeAndSync - creates audit log on sync failure
8. categorizeAndSync - syncToXero=false skips sync entirely
9. categorizeAndSync - handles missing XeroSyncService gracefully
10. updateCategorization still works without Xero (backwards compatible)
11. Split transactions sync correctly
12. User override syncs correctly

### tests/api/transaction/categorize-sync.controller.spec.ts (10+ tests)

Test scenarios:
1. PUT /transactions/:id/categorize - includes xero_sync_status in response
2. PUT /transactions/:id/categorize - returns 'synced' when Xero sync succeeds
3. PUT /transactions/:id/categorize - returns 'skipped' when no Xero ID
4. PUT /transactions/:id/categorize - returns 'failed' with error message
5. Response still succeeds even when Xero sync fails
6. Pattern learning still works with Xero sync
7. Payment allocation still works with Xero sync

Test data:
```typescript
const testTransaction = {
  tenantId: '', // set in beforeEach
  xeroTransactionId: 'xero-tx-001',
  bankAccount: 'FNB Business',
  date: new Date('2026-01-08'),
  description: 'WOOLWORTHS CAPE GATE',
  amountCents: -125000,
  isCredit: false,
  status: TransactionStatus.PENDING,
};

const testCategorizationDto = {
  account_code: '5100',
  account_name: 'Groceries & Supplies',
  vat_type: 'STANDARD',
  create_pattern: true,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update DTO files
# Edit src/api/transaction/dto/update-categorization.dto.ts

# 2. Update categorization service
# Edit src/database/services/categorization.service.ts

# 3. Update transaction controller
# Edit src/api/transaction/transaction.controller.ts

# 4. Update frontend hook
# Edit apps/web/src/hooks/use-transactions.ts

# 5. Update categorization dialog
# Edit apps/web/src/components/transactions/categorization-dialog.tsx

# 6. Create test files
# Create tests/database/services/categorization-sync.service.spec.ts
# Create tests/api/transaction/categorize-sync.controller.spec.ts

# 7. Verify backend
cd apps/api
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 400+ tests passing

# 8. Verify frontend
cd apps/web
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings

# 9. Manual verification
# Start API: pnpm run start:dev
# Start Web: pnpm run dev
# Categorize a transaction → verify toast shows sync status
# Check Xero → verify transaction updated
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Xero push must NOT block UI (categorization always saves first)
    - Push only if transaction has xeroTransactionId
    - Push only if Xero connection exists
    - Max 3 retry attempts for failed pushes (handled by XeroSyncService)
    - Audit log all push attempts
    - Return sync status in API response
    - Show appropriate toast in UI
    - Must NOT break existing categorization flow
    - Must NOT break pattern learning
    - Must NOT break payment allocation
  </constraints>

  <verification>
    - pnpm run build: 0 errors (both api and web)
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 400+ tests passing
    - User categorizes → transaction synced to Xero
    - API response includes xero_sync_status
    - UI shows appropriate toast for sync result
    - Failed sync doesn't block categorization save
    - Transactions without Xero ID are skipped gracefully
    - Audit trail created for sync attempts
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Block categorization save on Xero sync
  - Throw errors that prevent categorization from saving
  - Skip toast notifications for sync status
  - Break existing categorization flow
  - Break pattern learning functionality
  - Break payment allocation functionality
  - Ignore sync failures silently (must log and return status)
  - Make Xero sync synchronous/blocking in the UI
  - Forget to handle missing XeroSyncService (optional dependency)
</anti_patterns>

</task_spec>

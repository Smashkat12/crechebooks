<task_spec id="TASK-XERO-001" version="1.0">

<metadata>
  <title>Bi-directional Sync Conflict Resolution</title>
  <status>pending</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>134</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-XERO-007</requirement_ref>
    <edge_case_ref>EC-TRANS-004</edge_case_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-014</task_ref>
    <task_ref status="COMPLETE">TASK-MCP-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use distributed systems and conflict resolution patterns.
This task involves:
1. Detecting conflicts between local and Xero data
2. Conflict types: update-update, delete-update, create-create
3. Resolution strategies: last-write-wins, local-wins, xero-wins, manual
4. Conflict queue for manual resolution
5. Audit trail for all resolutions
</reasoning_mode>

<context>
GAP: REQ-XERO-007 specifies "Bi-directional sync conflict resolution."

Current state: XeroSyncService syncs data but has no conflict handling. When the same record is modified in both systems:
- No detection of conflicts
- Last sync wins (potentially losing data)
- No user notification
- No manual resolution option

Bi-directional sync conflicts occur when:
- User edits transaction locally AND in Xero
- Category mapping changes in Xero while categorizing locally
- Invoice updated in Xero while modifying locally
</context>

<current_state>
## Codebase State
- XeroSyncService exists (TASK-TRANS-014)
- Sync is currently one-directional (local → Xero or Xero → local)
- No conflict detection
- No conflict resolution
- lastSyncedAt timestamp exists but not used for conflict detection

## Sync Flow
```typescript
// Current simple sync - no conflict handling
async syncTransaction(transactionId: string): Promise<void> {
  const local = await this.getLocal(transactionId);
  await this.pushToXero(local);  // Overwrites Xero!
}
```
</current_state>

<input_context_files>
  <file purpose="xero_sync_service">apps/api/src/database/services/xero-sync.service.ts</file>
  <file purpose="xero_mcp">apps/api/src/mcp/xero/xero.mcp.ts</file>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - ConflictDetectionService
    - ConflictResolutionService
    - Conflict entity for queue
    - Detection during sync
    - Auto-resolution strategies
    - Manual resolution queue
    - Audit logging
    - Resolution API endpoints
  </in_scope>
  <out_of_scope>
    - UI for conflict resolution (surface layer)
    - Real-time conflict notifications
    - Merge strategies (complex field-level merging)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/entities/sync-conflict.entity.ts">
      export enum ConflictType {
        UPDATE_UPDATE = 'update_update',
        DELETE_UPDATE = 'delete_update',
        CREATE_CREATE = 'create_create',
      }

      export enum ConflictStatus {
        PENDING = 'pending',
        AUTO_RESOLVED = 'auto_resolved',
        MANUALLY_RESOLVED = 'manually_resolved',
        IGNORED = 'ignored',
      }

      @Entity('sync_conflicts')
      export class SyncConflict {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column()
        tenantId: string;

        @Column()
        entityType: string;  // 'transaction', 'invoice', etc.

        @Column()
        entityId: string;

        @Column({ type: 'enum', enum: ConflictType })
        conflictType: ConflictType;

        @Column({ type: 'jsonb' })
        localData: Record<string, unknown>;

        @Column({ type: 'jsonb' })
        xeroData: Record<string, unknown>;

        @Column({ type: 'timestamp' })
        localModifiedAt: Date;

        @Column({ type: 'timestamp' })
        xeroModifiedAt: Date;

        @Column({ type: 'enum', enum: ConflictStatus })
        status: ConflictStatus;

        @Column({ nullable: true })
        resolvedBy?: string;

        @Column({ nullable: true })
        resolution?: string;  // 'local_wins', 'xero_wins', 'merged'

        @Column({ type: 'timestamp', nullable: true })
        resolvedAt?: Date;
      }
    </signature>
    <signature file="apps/api/src/database/services/conflict-detection.service.ts">
      @Injectable()
      export class ConflictDetectionService {
        async detectConflicts(
          tenantId: string,
          entityType: string,
          localData: Record<string, unknown>,
          xeroData: Record<string, unknown>
        ): Promise<ConflictType | null>;

        async hasModifications(
          entity: BaseEntity,
          xeroVersion: Record<string, unknown>
        ): Promise<boolean>;

        async getConflictingFields(
          localData: Record<string, unknown>,
          xeroData: Record<string, unknown>
        ): Promise<string[]>;
      }
    </signature>
    <signature file="apps/api/src/database/services/conflict-resolution.service.ts">
      export type ResolutionStrategy = 'local_wins' | 'xero_wins' | 'last_modified_wins' | 'manual';

      @Injectable()
      export class ConflictResolutionService {
        async resolveConflict(
          conflictId: string,
          strategy: ResolutionStrategy,
          resolvedBy: string
        ): Promise<void>;

        async autoResolve(
          conflict: SyncConflict,
          defaultStrategy: ResolutionStrategy
        ): Promise<boolean>;

        async queueForManualResolution(
          conflict: SyncConflict
        ): Promise<void>;

        async getPendingConflicts(
          tenantId: string
        ): Promise<SyncConflict[]>;

        async applyResolution(
          conflict: SyncConflict,
          winner: 'local' | 'xero'
        ): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Conflict detection before every sync operation
    - Default strategy configurable per tenant
    - Auto-resolve if only one side modified since last sync
    - Queue for manual resolution if both sides modified
    - Never lose data without explicit user action
    - Audit log for all resolutions
    - Conflict age limit: 30 days (then escalate)
  </constraints>

  <verification>
    - Conflicts detected on sync
    - Auto-resolution works for simple cases
    - Complex conflicts queued for manual review
    - Resolution applies changes correctly
    - Audit trail complete
    - No data loss
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/entities/sync-conflict.entity.ts">Conflict entity</file>
  <file path="apps/api/src/database/services/conflict-detection.service.ts">Detection service</file>
  <file path="apps/api/src/database/services/conflict-resolution.service.ts">Resolution service</file>
  <file path="apps/api/src/database/services/__tests__/conflict-detection.service.spec.ts">Tests</file>
  <file path="apps/api/src/database/services/__tests__/conflict-resolution.service.spec.ts">Tests</file>
  <file path="apps/api/src/sync/sync.controller.ts">API endpoints</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/xero-sync.service.ts">Integrate conflict detection</file>
  <file path="apps/api/prisma/schema.prisma">Add SyncConflict model</file>
</files_to_modify>

<validation_criteria>
  <criterion>SyncConflict entity created</criterion>
  <criterion>Conflict detection works</criterion>
  <criterion>Auto-resolution for simple cases</criterion>
  <criterion>Manual queue for complex cases</criterion>
  <criterion>Resolution applies correctly</criterion>
  <criterion>Audit trail complete</criterion>
  <criterion>No data loss</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_sync_conflicts</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="conflict" --verbose</command>
</test_commands>

</task_spec>

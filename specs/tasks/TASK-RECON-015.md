<task_spec id="TASK-RECON-015" version="1.0">

<metadata>
  <title>Reconciliation Duplicate Detection Service</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>105</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-RECON-003</requirement_ref>
    <critical_issue_ref>CRIT-015</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
    <task_ref status="COMPLETE">TASK-RECON-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use data integrity and deduplication thinking.
This task involves:
1. Hash-based duplicate detection
2. Import-time duplicate checking
3. User review workflow
4. Resolution tracking
5. No automatic rejection
</reasoning_mode>

<context>
CRITICAL GAP: No duplicate detection during bank statement import. Duplicate transactions can be imported.

REQ-RECON-003 specifies: "Flag potential duplicates during import."

This task adds hash-based duplicate detection to flag potential duplicates without rejecting them.
</context>

<current_state>
## Codebase State
- TransactionImportService handles CSV/PDF import
- Transaction entity exists
- No hash field for deduplication
- No duplicate checking logic

## What's Missing
- Transaction hash field
- Duplicate detection on import
- User resolution workflow
- Audit trail for resolutions
</current_state>

<input_context_files>
  <file purpose="import_service">apps/api/src/database/services/transaction-import.service.ts</file>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<scope>
  <in_scope>
    - Add transactionHash field to Transaction
    - Hash generation from key fields
    - Duplicate detection during import
    - Flag potential duplicates (don't reject)
    - User resolution workflow
    - Resolution audit trail
  </in_scope>
  <out_of_scope>
    - UI for duplicate review (Surface layer)
    - Cross-tenant duplicate detection
    - Historical deduplication scan
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/duplicate-detection.service.ts">
      @Injectable()
      export class DuplicateDetectionService {
        generateHash(transaction: TransactionInput): string;
        checkForDuplicates(tenantId: string, transactions: TransactionInput[]): Promise<DuplicateCheckResult>;
        flagAsPotentialDuplicate(transactionId: string, existingId: string): Promise<void>;
        resolveDuplicate(transactionId: string, resolution: DuplicateResolution): Promise<void>;
        getPendingDuplicates(tenantId: string): Promise<PotentialDuplicate[]>;
      }
    </signature>
    <signature file="apps/api/src/database/types/duplicate.types.ts">
      export type DuplicateResolution = 'KEEP_BOTH' | 'MERGE' | 'REJECT_NEW' | 'REJECT_EXISTING';

      export interface DuplicateCheckResult {
        clean: TransactionInput[];
        potentialDuplicates: Array<{
          transaction: TransactionInput;
          existingMatch: Transaction;
          confidence: number;
        }>;
      }

      export interface PotentialDuplicate {
        id: string;
        newTransaction: Transaction;
        existingTransaction: Transaction;
        flaggedAt: Date;
        resolvedAt?: Date;
        resolution?: DuplicateResolution;
      }
    </signature>
  </signatures>

  <constraints>
    - Hash: SHA256(date + amount + reference + accountId)
    - Hash stored in Transaction entity
    - Never auto-reject duplicates
    - User must explicitly resolve
    - Resolution logged in audit trail
    - Confidence score based on field matches
  </constraints>

  <verification>
    - Hash generated for every transaction
    - Duplicates detected on import
    - Potential duplicates flagged, not rejected
    - Resolution options work correctly
    - Audit trail captures resolutions
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/duplicate-detection.service.ts">Detection service</file>
  <file path="apps/api/src/database/types/duplicate.types.ts">Types</file>
  <file path="apps/api/prisma/migrations/YYYYMMDD_add_transaction_hash/migration.sql">Migration</file>
  <file path="apps/api/src/database/services/__tests__/duplicate-detection.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add transactionHash and duplicateOf fields</file>
  <file path="apps/api/src/database/services/transaction-import.service.ts">Integrate duplicate check</file>
</files_to_modify>

<validation_criteria>
  <criterion>Transaction hash generated correctly</criterion>
  <criterion>Duplicates detected during import</criterion>
  <criterion>Potential duplicates flagged</criterion>
  <criterion>Resolution workflow works</criterion>
  <criterion>Audit trail captures resolutions</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="duplicate-detection" --verbose</command>
</test_commands>

</task_spec>

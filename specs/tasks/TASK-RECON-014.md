<task_spec id="TASK-RECON-014" version="1.0">

<metadata>
  <title>Reconciled Transaction Delete Protection</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>96</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-RECON-010</requirement_ref>
    <critical_issue_ref>CRIT-001</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-001</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use security-first thinking.
This is a COMPLIANCE CRITICAL task:
1. Reconciled transactions are audit-locked
2. Deletion must be prevented at repository level
3. Blocked attempts must be logged
4. ForbiddenException with specific error code
</reasoning_mode>

<context>
CRITICAL COMPLIANCE VIOLATION: Reconciled transactions can currently be deleted via the softDelete() method in TransactionRepository. This violates financial audit requirements.

Per SPEC-RECON REQ-RECON-010: "Reconciled transactions cannot be modified or deleted."

This task adds a guard in the repository layer to prevent deletion of reconciled transactions and logs all blocked attempts for audit purposes.
</context>

<current_state>
## Codebase State
- File: `apps/api/src/database/repositories/transaction.repository.ts`
- Lines 306-335: softDelete() method exists WITHOUT isReconciled check
- Transaction entity has `isReconciled: boolean` field
- AuditLogService exists at `apps/api/src/database/services/audit-log.service.ts`

## The Bug
```typescript
// CURRENT CODE - NO PROTECTION
async softDelete(id: string, tenantId: string): Promise<void> {
  const transaction = await this.findById(id, tenantId);
  if (!transaction) {
    throw new NotFoundException('Transaction', id);
  }
  // MISSING: Check for isReconciled!
  await this.prisma.transaction.update({
    where: { id },
    data: { isDeleted: true, deletedAt: new Date() },
  });
}
```
</current_state>

<input_context_files>
  <file purpose="file_to_modify">apps/api/src/database/repositories/transaction.repository.ts</file>
  <file purpose="audit_service">apps/api/src/database/services/audit-log.service.ts</file>
  <file purpose="exceptions">apps/api/src/shared/exceptions/index.ts</file>
  <file purpose="entity_definition">apps/api/src/database/entities/transaction.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Add isReconciled check to softDelete() method
    - Throw ForbiddenException with code RECONCILED_TRANSACTION_UNDELETABLE
    - Log blocked deletion attempt to audit log
    - Add unit test for the protection
    - Add integration test verifying API returns 403
  </in_scope>
  <out_of_scope>
    - Modifying other repository methods
    - UI changes
    - Modifying the Transaction entity
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/repositories/transaction.repository.ts">
      async softDelete(id: string, tenantId: string, userId?: string): Promise<void> {
        const transaction = await this.findById(id, tenantId);
        if (!transaction) {
          throw new NotFoundException('Transaction', id);
        }

        // CRIT-001: Prevent deletion of reconciled transactions
        if (transaction.isReconciled) {
          this.logger.warn(
            `Blocked deletion of reconciled transaction ${id} by user ${userId}`,
            { transactionId: id, tenantId, userId }
          );

          // Log to audit trail
          await this.auditLogService.log({
            tenantId,
            entityType: 'Transaction',
            entityId: id,
            action: 'DELETE_BLOCKED',
            userId,
            details: { reason: 'Transaction is reconciled' },
          });

          throw new ForbiddenException(
            'Cannot delete reconciled transaction',
            'RECONCILED_TRANSACTION_UNDELETABLE',
            { transactionId: id, reconciledAt: transaction.reconciledAt }
          );
        }

        await this.prisma.transaction.update({
          where: { id },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      }
    </signature>
  </signatures>

  <constraints>
    - softDelete() MUST check isReconciled BEFORE any modification
    - ForbiddenException error code MUST be 'RECONCILED_TRANSACTION_UNDELETABLE'
    - Blocked attempt MUST be logged to audit trail
    - userId parameter added for audit logging (optional, for system operations)
    - No changes to other methods
  </constraints>

  <verification>
    - npm run build succeeds
    - Unit test: softDelete throws ForbiddenException for reconciled transaction
    - Unit test: softDelete succeeds for non-reconciled transaction
    - Integration test: DELETE /transactions/:id returns 403 for reconciled
    - Audit log entry created for blocked deletion
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/database/repositories/transaction.repository.ts" action="update">
    Add isReconciled check and audit logging to softDelete() method
  </file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/repositories/__tests__/transaction.repository.reconciled.spec.ts">
    Tests for reconciled transaction delete protection
  </file>
</files_to_create>

<implementation_reference>
## Updated softDelete method

```typescript
/**
 * Soft delete a transaction
 * @throws NotFoundException if transaction doesn't exist
 * @throws ForbiddenException if transaction is reconciled (CRIT-001)
 */
async softDelete(id: string, tenantId: string, userId?: string): Promise<void> {
  const transaction = await this.findById(id, tenantId);
  if (!transaction) {
    throw new NotFoundException('Transaction', id);
  }

  // CRIT-001: Prevent deletion of reconciled transactions
  // REQ-RECON-010: Reconciled transactions cannot be modified or deleted
  if (transaction.isReconciled) {
    this.logger.warn(
      `Blocked deletion of reconciled transaction ${id}`,
      { transactionId: id, tenantId, userId, reconciledAt: transaction.reconciledAt }
    );

    // Log to audit trail for compliance
    await this.auditLogService.log({
      tenantId,
      entityType: 'Transaction',
      entityId: id,
      action: 'DELETE_BLOCKED',
      userId: userId || 'SYSTEM',
      details: {
        reason: 'Transaction is reconciled',
        reconciledAt: transaction.reconciledAt,
        attemptedAt: new Date().toISOString(),
      },
    });

    throw new ForbiddenException(
      'Cannot delete reconciled transaction. Reconciled transactions are locked for audit compliance.',
      'RECONCILED_TRANSACTION_UNDELETABLE',
      { transactionId: id, reconciledAt: transaction.reconciledAt }
    );
  }

  await this.prisma.transaction.update({
    where: { id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });

  this.logger.log(`Soft deleted transaction ${id}`);
}
```

## Test file

```typescript
/**
 * Transaction Repository - Reconciled Delete Protection Tests
 * TASK-RECON-014: CRIT-001 fix verification
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { TransactionRepository } from '../transaction.repository';
import { AuditLogService } from '../../services/audit-log.service';
import { ForbiddenException } from '../../../shared/exceptions';
import { ImportSource } from '../../entities/transaction.entity';

describe('TransactionRepository - Reconciled Delete Protection', () => {
  let repository: TransactionRepository;
  let prisma: PrismaService;
  let auditLogService: AuditLogService;
  let testTenantId: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        TransactionRepository,
        AuditLogService,
      ],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<TransactionRepository>(TransactionRepository);
    auditLogService = module.get<AuditLogService>(AuditLogService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean database
    await prisma.transaction.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.tenant.deleteMany({});

    const tenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche',
        email: 'test@creche.co.za',
        // ... required fields
      },
    });
    testTenantId = tenant.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('softDelete - reconciled protection', () => {
    it('should throw ForbiddenException when deleting reconciled transaction', async () => {
      // Create reconciled transaction
      const tx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'FNB-001',
          date: new Date(),
          description: 'Reconciled payment',
          amountCents: 100000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          isReconciled: true,
          reconciledAt: new Date(),
        },
      });

      // Attempt to delete
      await expect(
        repository.softDelete(tx.id, testTenantId, 'user-123')
      ).rejects.toThrow(ForbiddenException);

      // Verify error code
      try {
        await repository.softDelete(tx.id, testTenantId, 'user-123');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).code).toBe('RECONCILED_TRANSACTION_UNDELETABLE');
      }

      // Verify transaction NOT deleted
      const stillExists = await prisma.transaction.findUnique({
        where: { id: tx.id },
      });
      expect(stillExists).not.toBeNull();
      expect(stillExists?.isDeleted).toBe(false);
    });

    it('should log blocked deletion to audit trail', async () => {
      const tx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'FNB-001',
          date: new Date(),
          description: 'Reconciled payment',
          amountCents: 100000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          isReconciled: true,
          reconciledAt: new Date(),
        },
      });

      try {
        await repository.softDelete(tx.id, testTenantId, 'user-123');
      } catch {
        // Expected to throw
      }

      // Check audit log
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          entityId: tx.id,
          action: 'DELETE_BLOCKED',
        },
      });

      expect(auditLogs).toHaveLength(1);
      expect(auditLogs[0].details).toContain('reconciled');
    });

    it('should allow deletion of non-reconciled transaction', async () => {
      const tx = await prisma.transaction.create({
        data: {
          tenantId: testTenantId,
          bankAccount: 'FNB-001',
          date: new Date(),
          description: 'Regular payment',
          amountCents: 100000,
          isCredit: true,
          source: ImportSource.CSV_IMPORT,
          isReconciled: false, // NOT reconciled
        },
      });

      // Should NOT throw
      await expect(
        repository.softDelete(tx.id, testTenantId, 'user-123')
      ).resolves.not.toThrow();

      // Verify deleted
      const deleted = await prisma.transaction.findUnique({
        where: { id: tx.id },
      });
      expect(deleted?.isDeleted).toBe(true);
    });
  });
});
```
</implementation_reference>

<validation_criteria>
  <criterion>softDelete throws ForbiddenException for reconciled transactions</criterion>
  <criterion>Error code is RECONCILED_TRANSACTION_UNDELETABLE</criterion>
  <criterion>Audit log entry created for blocked deletion</criterion>
  <criterion>Non-reconciled transactions can still be deleted</criterion>
  <criterion>All tests pass</criterion>
  <criterion>Build succeeds</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="transaction.repository.reconciled" --verbose</command>
  <command>npm run test -- --testPathPattern="transaction" --verbose</command>
</test_commands>

</task_spec>

<task_spec id="TASK-DB-001" version="2.0">

<metadata>
  <title>Add Transaction Handling to completeOffboarding</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>180</sequence>
  <implements>
    <requirement_ref>REQ-DATA-INTEGRITY-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **File to Modify:**
  - `apps/api/src/database/services/staff-offboarding.service.ts`

  **Problem:**
  The `completeOffboarding` method performs multiple database operations (update offboarding, deactivate staff, sync to SimplePay) without transaction wrapping. If any operation fails mid-way, the database can be left in an inconsistent state.

  **Current Implementation Issues:**
  1. Offboarding marked complete but staff not deactivated
  2. Staff deactivated but audit log not created
  3. SimplePay sync fails silently after local changes committed

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Prisma Transaction Pattern
  ```typescript
  async completeOffboarding(
    offboardingId: string,
    dto: CompleteOffboardingDto,
    tenantId: string,
  ): Promise<void> {
    // Validation BEFORE transaction
    const offboarding = await this.offboardingRepo.findOffboardingById(offboardingId);
    if (!offboarding) {
      throw new NotFoundException('Offboarding', offboardingId);
    }

    // Validation errors collected
    const validationErrors: { field: string; message: string }[] = [];
    // ... validation ...

    // Transaction wraps ALL database mutations
    await this.prisma.$transaction(async (tx) => {
      // 1. Complete offboarding
      await tx.staffOffboarding.update({
        where: { id: offboardingId },
        data: { status: 'COMPLETED', completedAt: new Date(), completedBy },
      });

      // 2. Mark staff as inactive
      await tx.staff.update({
        where: { id: offboarding.staffId },
        data: { isActive: false, endDate: offboarding.lastWorkingDay },
      });

      // 3. Create audit logs (within transaction)
      await tx.auditLog.create({
        data: { /* ... */ },
      });
    });

    // SimplePay sync OUTSIDE transaction (external API call)
    await this.syncTerminationToSimplePay(...);
  }
  ```

  ### 3. Error Handling Pattern
  ```typescript
  try {
    await this.prisma.$transaction(async (tx) => { /* ... */ });
  } catch (error) {
    this.logger.error(`Transaction failed: ${error}`, { offboardingId });
    throw new DatabaseException('completeOffboarding', 'Failed to complete offboarding', error);
  }
  ```

  ### 4. Test Pattern
  ```typescript
  import 'dotenv/config';  // FIRST LINE - Required!

  describe('StaffOffboardingService', () => {
    it('should rollback all changes if staff update fails', async () => {
      // Setup: Create offboarding in INITIATED state
      // Mock staff update to fail
      // Call completeOffboarding
      // Assert: offboarding still INITIATED, staff still active
    });
  });
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag - prevents parallel DB conflicts
  ```
</critical_patterns>

<context>
This task adds proper database transaction handling to the `completeOffboarding` method to ensure atomicity. All local database operations must succeed together or fail together.

**Key Insight:** SimplePay API sync should happen AFTER the transaction commits successfully, since we cannot rollback external API calls. The SimplePay sync already has its own error handling that doesn't fail the offboarding.
</context>

<scope>
  <in_scope>
    - Wrap offboarding completion in Prisma transaction
    - Wrap staff deactivation in same transaction
    - Move audit log creation inside transaction
    - Add transaction error handling with logging
    - Create test cases for rollback scenarios
    - Update existing tests if needed
  </in_scope>
  <out_of_scope>
    - SimplePay sync (remains outside transaction)
    - Changes to validation logic
    - Changes to offboarding workflow states
    - New API endpoints
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Modify the service file
# Edit apps/api/src/database/services/staff-offboarding.service.ts

# 2. Create/update test file
# Edit apps/api/tests/database/services/staff-offboarding.service.spec.ts

# 3. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing

# 4. Run specific tests
pnpm test -- staff-offboarding --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Transaction must wrap: offboarding update, staff update, audit logs
    - SimplePay sync must remain OUTSIDE transaction
    - All validation must happen BEFORE transaction starts
    - Transaction must use Prisma's interactive transaction ($transaction with callback)
    - Error logging must include full context (offboardingId, staffId, tenantId)
    - Must NOT break existing functionality
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - New test: rollback on staff update failure
    - New test: rollback on audit log creation failure
    - Existing tests continue to pass
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Put SimplePay sync inside the transaction
  - Use sequential transactions (multiple $transaction calls)
  - Swallow transaction errors without logging
  - Skip the --runInBand flag when running tests
  - Use try/catch around individual operations inside transaction (let it rollback)
</anti_patterns>

</task_spec>

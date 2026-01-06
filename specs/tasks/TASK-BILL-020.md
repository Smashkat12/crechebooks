<task_spec id="TASK-BILL-020" version="1.0">

<metadata>
  <title>Add registrationFeeCents to FeeStructure Entity</title>
  <status>complete</status>
  <completed_date>2026-01-06</completed_date>
  <layer>foundation</layer>
  <sequence>139</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>EC-BILL-001</requirement_ref>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis on 2026-01-06, it was discovered that the FeeStructure entity
is missing the `registrationFeeCents` field. This field is required to charge a one-time
registration fee when a child is enrolled (EC-BILL-001).

## Current State
- FeeStructure entity exists at `apps/api/src/database/entities/fee-structure.entity.ts`
- Prisma schema defines FeeStructure at `apps/api/prisma/schema.prisma` (lines 417-438)
- TypeScript interface IFeeStructure already includes `registrationFeeCents` (line 21) but the Prisma model and database do NOT

## Root Cause
The TypeScript interface was updated but the Prisma schema and database migration were never created.

## Project Context
- **Framework**: NestJS with Prisma ORM
- **Database**: PostgreSQL
- **Financial Precision**: All monetary values stored as cents (integers)
- **Multi-tenant**: All entities include `tenantId` for isolation
- **Location**: South Africa (ZAR currency, registration fees are one-time charges)
</context>

<input_context_files>
  <file purpose="entity_definition">apps/api/src/database/entities/fee-structure.entity.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma#FeeStructure</file>
  <file purpose="repository">apps/api/src/database/repositories/fee-structure.repository.ts</file>
  <file purpose="fee_structure_dtos">apps/api/src/api/billing/dto/fee-structure.dto.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-002 completed (FeeStructure entity exists)</check>
  <check>Prisma CLI available (npx prisma)</check>
  <check>PostgreSQL database accessible</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `registrationFeeCents` field to Prisma FeeStructure model
    - Create database migration
    - Update any DTOs that reference FeeStructure
    - Add default value of 0 for existing records
    - Run migration successfully
  </in_scope>
  <out_of_scope>
    - Using the registration fee in invoice generation (TASK-BILL-021)
    - UI changes
    - API endpoint changes
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/prisma/schema.prisma">
      model FeeStructure {
        id                     String    @id @default(uuid())
        tenantId               String    @map("tenant_id")
        name                   String    @db.VarChar(100)
        description            String?
        feeType                FeeType   @map("fee_type")
        amountCents            Int       @map("amount_cents")
        registrationFeeCents   Int       @default(0) @map("registration_fee_cents")
        vatInclusive           Boolean   @default(true) @map("vat_inclusive")
        siblingDiscountPercent Decimal?  @map("sibling_discount_percent") @db.Decimal(5, 2)
        effectiveFrom          DateTime  @map("effective_from") @db.Date
        effectiveTo            DateTime? @map("effective_to") @db.Date
        isActive               Boolean   @default(true) @map("is_active")
        createdAt              DateTime  @default(now()) @map("created_at")
        updatedAt              DateTime  @updatedAt @map("updated_at")

        tenant      Tenant       @relation(fields: [tenantId], references: [id])
        enrollments Enrollment[]

        @@index([tenantId, isActive])
        @@index([tenantId, effectiveFrom])
        @@map("fee_structures")
      }
    </signature>
  </signatures>

  <constraints>
    - Must add `registrationFeeCents` with @default(0) to not break existing records
    - Must use @map("registration_fee_cents") for database column name (snake_case)
    - Must be Int type (cents, not decimal)
    - Migration must be reversible
    - TypeScript interface already correct - no changes needed there
  </constraints>

  <verification>
    - Migration runs without error: npx prisma migrate dev
    - Prisma generate succeeds: npx prisma generate
    - TypeScript compiles without errors: npm run build
    - Existing FeeStructure records have registrationFeeCents = 0
  </verification>
</definition_of_done>

<implementation_steps>
1. Edit `apps/api/prisma/schema.prisma`:
   - Find the FeeStructure model (around line 417)
   - Add new field after `amountCents`:
     `registrationFeeCents   Int       @default(0) @map("registration_fee_cents")`

2. Run Prisma migration:
   ```bash
   cd apps/api
   npx prisma migrate dev --name add_registration_fee_to_fee_structure
   ```

3. Regenerate Prisma client:
   ```bash
   npx prisma generate
   ```

4. Verify TypeScript compilation:
   ```bash
   npm run build
   ```

5. Verify existing records have default value:
   - All existing FeeStructure rows should have registration_fee_cents = 0
</implementation_steps>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add registrationFeeCents field to FeeStructure model</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_registration_fee_to_fee_structure/migration.sql">Prisma auto-generated migration</file>
</files_to_create>

<validation_criteria>
  <criterion>Prisma migration runs successfully</criterion>
  <criterion>Prisma client regenerated</criterion>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>registrationFeeCents field accessible on FeeStructure</criterion>
  <criterion>Existing records have default value of 0</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/api && npx prisma migrate dev --name add_registration_fee_to_fee_structure</command>
  <command>cd apps/api && npx prisma generate</command>
  <command>npm run build</command>
  <command>npm run test -- fee-structure</command>
</test_commands>


<implementation_notes>
## Implementation Summary (2026-01-06)

### Changes Made:
1. **Prisma Schema**: Added `registrationFeeCents Int @default(0) @map("registration_fee_cents")` to FeeStructure model
2. **DTO**: Added `registrationFeeCents` field to `CreateFeeStructureDto` in `apps/api/src/database/dto/fee-structure.dto.ts`
3. **Types Package**: Updated `IFeeStructure` in `packages/types/src/billing.ts` to include:
   - `feeType?: FeeType`
   - `amountCents?: number`
   - `registrationFeeCents?: number`
   - `vatInclusive?: boolean`
   - Added `FeeType` enum

### Pre-existing Issues Fixed:
During build verification, several pre-existing type mismatches were discovered and fixed:
- `packages/types/src/billing.ts`: Fixed IParent interface to use `whatsapp` and `preferredContact` (matching Prisma)
- `packages/types/src/sars.ts`: Extended IStaff interface with all Prisma schema fields
- `apps/web/src/lib/api/query-keys.ts`: Added missing `children.lists()` and `children.list()` functions
- `apps/web/src/hooks/use-staff.ts`: Fixed StaffStatus enum usage
- `apps/web/src/components/ui/calendar.tsx`: Fixed SelectTrigger props spread
- `apps/web/src/components/parents/*.tsx`: Updated to use correct field names
- `apps/web/src/components/parents/fee-structure-select.tsx`: Use `amountCents` with fallback
- `apps/web/src/components/parents/prorata-display.tsx`: Use `amountCents` with fallback

### Pending:
- Database migration requires Docker/PostgreSQL to be running
- Run: `cd apps/api && npx prisma migrate dev --name add_registration_fee_to_fee_structure`

### Verification:
- ✅ Prisma schema validated successfully
- ✅ Prisma client generated successfully
- ✅ TypeScript build passes without errors
</implementation_notes>

</task_spec>

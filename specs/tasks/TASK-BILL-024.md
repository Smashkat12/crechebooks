<task_spec id="TASK-BILL-024" version="1.1">

<metadata>
  <title>Re-Registration Fee for Returning Students (SUPERSEDED)</title>
  <status>superseded</status>
  <started_date>2026-01-07</started_date>
  <completed_date>2026-01-07</completed_date>
  <superseded_by>TASK-BILL-037</superseded_by>
  <superseded_reason>Original logic was incorrect - re-registration fee applies to CONTINUING students at year start, not students returning after WITHDRAWN/GRADUATED status</superseded_reason>
  <layer>logic</layer>
  <sequence>171</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>EC-BILL-003</requirement_ref>
    <requirement_ref>REQ-BILL-011</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-020</task_ref>
    <task_ref>TASK-BILL-021</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Business Requirement
When a child who was previously enrolled (and later WITHDRAWN or GRADUATED) is re-enrolled at the creche:
- **Returning student**: Charged a re-registration fee of R300 (30000 cents)
- **New student**: Charged a registration fee of R500 (50000 cents)

The monthly school fees remain the same for both new and returning students.

## Current State
- FeeStructure entity has `registrationFeeCents` field (TASK-BILL-020)
- Enrollment service generates invoices with registration fee (TASK-BILL-021)
- No logic exists to detect returning students
- No `reRegistrationFeeCents` field exists in FeeStructure

## Required Changes
1. Add `reRegistrationFeeCents` field to FeeStructure (Prisma + entity + DTOs)
2. Add `isReturningStudent()` detection logic to EnrollmentService
3. Update `createEnrollmentInvoice()` to use correct fee based on student type

## Detection Logic
A child is considered a "returning student" if they have ANY previous enrollment with status:
- WITHDRAWN
- GRADUATED

If no previous enrollment exists with these statuses, they are a "new student".

## Project Context
- **Framework**: NestJS with Prisma ORM
- **Database**: PostgreSQL
- **Financial Precision**: All monetary values stored as cents (integers)
- **Multi-tenant**: All entities include `tenantId` for isolation
- **Location**: South Africa (ZAR currency)
</context>

<input_context_files>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma#FeeStructure</file>
  <file purpose="entity_definition">apps/api/src/database/entities/fee-structure.entity.ts</file>
  <file purpose="enrollment_service">apps/api/src/database/services/enrollment.service.ts</file>
  <file purpose="enrollment_repository">apps/api/src/database/repositories/enrollment.repository.ts</file>
  <file purpose="fee_structure_dtos">apps/api/src/database/dto/fee-structure.dto.ts</file>
  <file purpose="types_package">packages/types/src/billing.ts</file>
  <file purpose="web_forms">apps/web/src/app/(dashboard)/settings/fees/fee-structure-form.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-020 completed (registrationFeeCents exists)</check>
  <check>TASK-BILL-021 completed (enrollment invoice generation works)</check>
  <check>Prisma CLI available (npx prisma)</check>
  <check>PostgreSQL database accessible</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `reRegistrationFeeCents` field to Prisma FeeStructure model
    - Create database migration
    - Update FeeStructure entity and DTOs
    - Add `isReturningStudent()` method to EnrollmentService
    - Update `createEnrollmentInvoice()` to apply correct fee
    - Update fee structure forms to include re-registration fee field
  </in_scope>
  <out_of_scope>
    - Changing monthly fee calculations
    - Changing sibling discount logic
    - Reporting on new vs returning students
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/prisma/schema.prisma">
      model FeeStructure {
        id                       String    @id @default(uuid())
        tenantId                 String    @map("tenant_id")
        name                     String    @db.VarChar(100)
        description              String?
        feeType                  FeeType   @map("fee_type")
        amountCents              Int       @map("amount_cents")
        registrationFeeCents     Int       @default(0) @map("registration_fee_cents")
        reRegistrationFeeCents   Int       @default(0) @map("re_registration_fee_cents")
        vatInclusive             Boolean   @default(true) @map("vat_inclusive")
        siblingDiscountPercent   Decimal?  @map("sibling_discount_percent") @db.Decimal(5, 2)
        effectiveFrom            DateTime  @map("effective_from") @db.Date
        effectiveTo              DateTime? @map("effective_to") @db.Date
        isActive                 Boolean   @default(true) @map("is_active")
        createdAt                DateTime  @default(now()) @map("created_at")
        updatedAt                DateTime  @updatedAt @map("updated_at")

        tenant      Tenant       @relation(fields: [tenantId], references: [id])
        enrollments Enrollment[]

        @@index([tenantId, isActive])
        @@index([tenantId, effectiveFrom])
        @@map("fee_structures")
      }
    </signature>
    <signature file="apps/api/src/database/services/enrollment.service.ts">
      async isReturningStudent(tenantId: string, childId: string): Promise&lt;boolean&gt;
    </signature>
  </signatures>

  <constraints>
    - Must add `reRegistrationFeeCents` with @default(0) to not break existing records
    - Must use @map("re_registration_fee_cents") for database column name (snake_case)
    - Must be Int type (cents, not decimal)
    - Registration fee description on invoice should indicate if it's re-registration
    - Migration must be reversible
  </constraints>

  <verification>
    - Migration runs without error: npx prisma migrate dev
    - Prisma generate succeeds: npx prisma generate
    - TypeScript compiles without errors: npm run build
    - Existing FeeStructure records have reRegistrationFeeCents = 0
    - New student enrollment generates invoice with R500 registration fee
    - Returning student enrollment generates invoice with R300 re-registration fee
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Foundation Layer (Schema)

1. Edit `apps/api/prisma/schema.prisma`:
   - Find the FeeStructure model (around line 419)
   - Add new field after `registrationFeeCents`:
     `reRegistrationFeeCents   Int       @default(0) @map("re_registration_fee_cents")`

2. Run Prisma migration:
   ```bash
   cd apps/api
   npx prisma migrate dev --name add_re_registration_fee_to_fee_structure
   ```

3. Regenerate Prisma client:
   ```bash
   npx prisma generate
   ```

## Phase 2: Entity and DTOs

4. Update `apps/api/src/database/entities/fee-structure.entity.ts`:
   - Add `reRegistrationFeeCents: number` to IFeeStructure interface

5. Update `apps/api/src/database/dto/fee-structure.dto.ts`:
   - Add `reRegistrationFeeCents` field to CreateFeeStructureDto
   - Add `reRegistrationFeeCents` field to UpdateFeeStructureDto

6. Update `packages/types/src/billing.ts`:
   - Add `reRegistrationFeeCents?: number` to IFeeStructure interface

## Phase 3: Logic Layer (Service)

7. Add `isReturningStudent()` method to `enrollment.service.ts`:
   ```typescript
   async isReturningStudent(tenantId: string, childId: string): Promise<boolean> {
     const previousEnrollments = await this.enrollmentRepo.findByChildId(
       tenantId,
       childId,
     );
     return previousEnrollments.some(
       (e) =>
         e.status === EnrollmentStatus.WITHDRAWN ||
         e.status === EnrollmentStatus.GRADUATED
     );
   }
   ```

8. Update `createEnrollmentInvoice()` to use correct fee:
   - Call `isReturningStudent()` to determine student type
   - Use `reRegistrationFeeCents` if returning, `registrationFeeCents` if new
   - Update line item description to indicate "Re-Registration Fee" vs "Registration Fee"

## Phase 4: Surface Layer (UI)

9. Update `apps/web/src/app/(dashboard)/settings/fees/fee-structure-form.tsx`:
   - Add input field for "Re-Registration Fee"
   - Add validation (must be >= 0)
   - Display as currency with ZAR formatting

10. Verify TypeScript compilation:
    ```bash
    npm run build
    ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add reRegistrationFeeCents field to FeeStructure model</file>
  <file path="apps/api/src/database/entities/fee-structure.entity.ts">Add reRegistrationFeeCents to IFeeStructure interface</file>
  <file path="apps/api/src/database/dto/fee-structure.dto.ts">Add reRegistrationFeeCents to DTOs</file>
  <file path="packages/types/src/billing.ts">Add reRegistrationFeeCents to IFeeStructure type</file>
  <file path="apps/api/src/database/services/enrollment.service.ts">Add isReturningStudent() and update createEnrollmentInvoice()</file>
  <file path="apps/web/src/app/(dashboard)/settings/fees/fee-structure-form.tsx">Add re-registration fee input field</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_re_registration_fee_to_fee_structure/migration.sql">Prisma auto-generated migration</file>
</files_to_create>

<validation_criteria>
  <criterion>Prisma migration runs successfully</criterion>
  <criterion>Prisma client regenerated</criterion>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>reRegistrationFeeCents field accessible on FeeStructure</criterion>
  <criterion>Existing records have default value of 0</criterion>
  <criterion>isReturningStudent() correctly detects WITHDRAWN/GRADUATED enrollments</criterion>
  <criterion>New student invoice shows "Registration Fee" at R500</criterion>
  <criterion>Returning student invoice shows "Re-Registration Fee" at R300</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/api && npx prisma migrate dev --name add_re_registration_fee_to_fee_structure</command>
  <command>cd apps/api && npx prisma generate</command>
  <command>npm run build</command>
  <command>npm run test -- enrollment</command>
  <command>npm run test -- fee-structure</command>
</test_commands>


<implementation_notes>
## Implementation Summary (2026-01-07)

### Changes Made:

1. **Prisma Schema** (`apps/api/prisma/schema.prisma`):
   - Added `reRegistrationFeeCents Int @default(0) @map("re_registration_fee_cents")` to FeeStructure model

2. **Entity** (`apps/api/src/database/entities/fee-structure.entity.ts`):
   - Added `reRegistrationFeeCents: number` to IFeeStructure interface

3. **DTOs** (`apps/api/src/database/dto/fee-structure.dto.ts`):
   - Added `reRegistrationFeeCents?: number` to CreateFeeStructureDto

4. **Types Package** (`packages/types/src/billing.ts`):
   - Added `reRegistrationFeeCents?: number` to IFeeStructure interface

5. **Enrollment Service** (`apps/api/src/database/services/enrollment.service.ts`):
   - Added `isReturningStudent()` method to detect WITHDRAWN/GRADUATED enrollments
   - Updated `createEnrollmentInvoice()` to use re-registration fee for returning students

6. **Repository** (`apps/api/src/database/repositories/fee-structure.repository.ts`):
   - Updated `create()` and `update()` to handle reRegistrationFeeCents

7. **Controller** (`apps/api/src/api/settings/fee-structure.controller.ts`):
   - Updated `toSnakeCase()` to include re_registration_fee and re_registration_fee_cents
   - Updated create and update body types to include re_registration_fee

8. **Web Hooks** (`apps/web/src/hooks/use-fee-structures.ts`):
   - Added re_registration_fee_cents and re_registration_fee to FeeStructure interface
   - Added re_registration_fee to CreateFeeStructureParams

9. **Fee Structure Form** (`apps/web/src/app/(dashboard)/settings/fees/page.tsx`):
   - Added re_registration_fee input field
   - Updated table to display Re-Reg Fee column
   - Updated form submit to include re_registration_fee

### Business Logic:
- **New students**: Charged `registrationFeeCents` (R500 = 50000 cents)
- **Returning students**: Charged `reRegistrationFeeCents` (R300 = 30000 cents)
- Returning student = any child with previous WITHDRAWN or GRADUATED enrollment
- Invoice line description: "Registration Fee" vs "Re-Registration Fee"

### Verification:
- ✅ Database schema pushed successfully
- ✅ Prisma client regenerated
- ✅ TypeScript build passes without errors (API and Web)
- ✅ All packages build successfully
</implementation_notes>

</task_spec>

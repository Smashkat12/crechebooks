<task_spec id="TASK-E2E-007" version="1.0">

<metadata>
  <title>Feature Request - Add Registration Fee to Fee Structures</title>
  <status>pending</status>
  <layer>foundation</layer>
  <sequence>160</sequence>
  <priority>P3-LOW</priority>
  <implements>
    <requirement_ref>BILL-FEE-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Feature Gap Identified During E2E Testing
Date: 2026-01-06

During E2E testing, the user noted that registration fees are not included in enrollment invoices. Upon investigation, the Fee Structure entity and form do not include a registration fee field.

## Current State
Fee Structure fields:
- Name
- Description
- Fee Type (Full Day, Half Day, etc.)
- Amount (monthly fee)
- Sibling Discount (%)
- Effective From
- Status (Active/Inactive)

## Missing Feature
- Registration Fee field (one-time fee charged on first enrollment)

## Business Requirement
Many creches charge a one-time registration fee when a child first enrolls. This fee should be:
1. Configurable per fee structure
2. Automatically added to the first invoice when a child enrolls
3. Optional (default to R 0.00 if not set)

## Impact
- **Billing**: Registration fees must be manually added as line items
- **Automation**: Cannot auto-generate complete first invoices

## Pages Affected
- /settings/fees (Add/Edit Fee Structure form)
- Enrollment flow (invoice generation)

</context>

<input_context_files>
  <file purpose="entity">apps/api/src/database/entities/fee-structure.entity.ts</file>
  <file purpose="dto">apps/api/src/database/dto/fee-structure.dto.ts</file>
  <file purpose="schema">apps/api/prisma/schema.prisma</file>
  <file purpose="service">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="component">apps/web/src/components/parents/fee-structure-select.tsx</file>
</input_context_files>

<prerequisites>
  <check>Fee Structure CRUD working</check>
  <check>Enrollment invoice generation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Add registration_fee column to FeeStructure entity
    - Update Prisma schema with new column
    - Update Fee Structure create/edit forms
    - Update invoice generation to include registration fee on first enrollment
  </in_scope>
  <out_of_scope>
    - Refactoring existing fee structure logic
    - Adding other one-time fees
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - FeeStructure has registration_fee field (Decimal, default 0)
    - Add/Edit Fee Structure form includes registration fee input
    - First enrollment invoice includes registration fee line item
    - Subsequent invoices do NOT include registration fee
  </constraints>

  <verification>
    - Create a fee structure with R 500 registration fee
    - Enroll a child using that fee structure
    - Verify first invoice includes registration fee line item
    - Verify subsequent monthly invoices do NOT include registration fee
  </verification>
</definition_of_done>

<implementation_steps>
1. Add registration_fee column to Prisma schema
2. Run prisma migrate to update database
3. Update FeeStructureEntity with new field
4. Update CreateFeeStructureDto and UpdateFeeStructureDto
5. Update fee structure API controller
6. Update Add/Edit Fee Structure form on frontend
7. Update InvoiceGenerationService to add registration fee on first enrollment
8. Test the complete flow
</implementation_steps>

</task_spec>

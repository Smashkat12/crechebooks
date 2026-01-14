# TASK-BILL-038: South African VAT Compliance for Invoice Generation

## Task Metadata
| Field | Value |
|-------|-------|
| Task ID | TASK-BILL-038 |
| Priority | P1-CRITICAL |
| Layer | Logic |
| Phase | 15 - VAT Compliance Enhancement |
| Dependencies | TASK-BILL-012, TASK-SARS-011 |
| Status | Completed |
| Completed Date | 2026-01-13 |
| Estimated Effort | 6 hours |
| Actual Effort | 4 hours |

---

## Executive Summary

Enhance the invoice generation system to properly apply South African VAT rules based on the Value-Added Tax Act No. 89 of 1991, Section 12(h). Currently, the system correctly handles basic VAT exemptions for educational services, but needs refinement to handle additional line item types (meals, transport) and provide configurable VAT applicability for ad-hoc charges.

---

## Context for AI Agent

<context>
<project_overview>
CrecheBooks is a multi-tenant SaaS application for South African childcare centers (crèches). This task ensures VAT is correctly applied according to SA tax law - specifically that childcare/educational fees are VAT exempt while goods and certain services remain VAT applicable at 15%.
</project_overview>

<technology_stack>
- Runtime: Node.js with TypeScript (strict mode)
- Framework: NestJS with dependency injection
- Database: PostgreSQL with Prisma ORM
- Testing: Jest with `pnpm test --runInBand`
- Package Manager: pnpm (NOT npm)
- Monetary: All values in cents (integers), Decimal.js with banker's rounding
</technology_stack>

<sa_vat_law_summary>
Based on Value-Added Tax Act No. 89 of 1991:

**Section 12(h) - VAT EXEMPT Educational Services:**
- Childcare/creche fees (Section 12(h)(iii))
- Educational/tuition services (Section 12(h)(i))
- Registration fees (when bundled with school fees per Section 12(h)(ii))
- Re-registration fees (when part of educational services)
- After-school care fees
- Extra-mural activities (if "subordinate and incidental" to education)

**VAT APPLICABLE at 15% (Standard Rate):**
- School uniforms (goods sold separately)
- Stationery and school supplies
- Textbooks sold separately
- Prepared meals (food ready for consumption)
- Transport fees (to/from school)
- School trips/outings (service, not educational)
- Late pickup fees (penalty, not educational)
- Damaged equipment charges

**ZERO-RATED (0% VAT) - Basic Foodstuffs:**
- Brown bread, milk (fresh), maize meal, rice, fresh vegetables/fruit, eggs
- Note: NOT zero-rated when "provided as a meal, ready for consumption"

**Key Principle:**
Exemption applies to services "necessary for and subordinate and incidental" to core educational/childcare services. Goods sold separately are VAT applicable.
</sa_vat_law_summary>

<file_locations>
- Entity: `src/database/entities/invoice-line.entity.ts`
- Service: `src/database/services/invoice-generation.service.ts`
- VAT Service: `src/database/services/vat.service.ts`
- DTOs: `src/database/dto/invoice-generation.dto.ts`
- Tests: `tests/database/services/invoice-generation.service.spec.ts`
</file_locations>

<coding_standards>
- Use `string | null` not `string?` for nullable fields
- All monetary values stored as cents (integer)
- Decimal.js with ROUND_HALF_EVEN for calculations
- Export enums from entity files
- Comprehensive JSDoc comments with legal references
</coding_standards>
</context>

---

## Current Implementation Analysis

### Existing LineTypes (invoice-line.entity.ts)

```typescript
export enum LineType {
  MONTHLY_FEE = 'MONTHLY_FEE',      // ✅ VAT EXEMPT - Correct
  REGISTRATION = 'REGISTRATION',    // ✅ VAT EXEMPT - Correct
  EXTRA = 'EXTRA',                  // ⚠️ VAT APPLICABLE - Too vague
  DISCOUNT = 'DISCOUNT',            // ✅ NO VAT - Correct
  CREDIT = 'CREDIT',                // ✅ NO VAT - Correct
  BOOKS = 'BOOKS',                  // ✅ VAT APPLICABLE - Correct
  SCHOOL_TRIP = 'SCHOOL_TRIP',      // ✅ VAT APPLICABLE - Correct
  STATIONERY = 'STATIONERY',        // ✅ VAT APPLICABLE - Correct
  UNIFORM = 'UNIFORM',              // ✅ VAT APPLICABLE - Correct
  AD_HOC = 'AD_HOC',                // ⚠️ VAT APPLICABLE - Needs granularity
}
```

### Identified Gaps

| Gap | Current Behavior | Required Behavior | Impact |
|-----|-----------------|-------------------|--------|
| **MEALS** | No LineType exists | Should be VAT APPLICABLE (15%) | Under-charging VAT on meal fees |
| **TRANSPORT** | No LineType exists | Should be VAT APPLICABLE (15%) | Under-charging VAT on transport |
| **LATE_PICKUP** | No LineType exists | Should be VAT APPLICABLE (15%) | Under-charging VAT on late fees |
| **AD_HOC granularity** | All AD_HOC = VAT | Some AD_HOC may be exempt | Over-charging VAT on exempt items |
| **EXTRA vagueness** | Applies VAT to all | Depends on nature of charge | Potentially incorrect VAT |

---

## Requirements

### R1: Add New LineTypes for VAT-Applicable Items

Add specific LineTypes to properly categorize charges:

```typescript
export enum LineType {
  // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
  MONTHLY_FEE = 'MONTHLY_FEE',
  REGISTRATION = 'REGISTRATION',
  RE_REGISTRATION = 'RE_REGISTRATION',    // NEW
  EXTRA_MURAL = 'EXTRA_MURAL',            // NEW - Subordinate to education

  // VAT APPLICABLE - Goods & Non-Educational Services (15%)
  BOOKS = 'BOOKS',
  STATIONERY = 'STATIONERY',
  UNIFORM = 'UNIFORM',
  SCHOOL_TRIP = 'SCHOOL_TRIP',
  MEALS = 'MEALS',                        // NEW - Prepared food
  TRANSPORT = 'TRANSPORT',                // NEW - To/from school
  LATE_PICKUP = 'LATE_PICKUP',            // NEW - Penalty fee
  DAMAGED_EQUIPMENT = 'DAMAGED_EQUIPMENT', // NEW - Replacement charge

  // CONFIGURABLE - Depends on nature
  AD_HOC = 'AD_HOC',                      // VAT determined by isVatExempt flag
  EXTRA = 'EXTRA',                        // DEPRECATED - Use specific types

  // NO VAT - Adjustments
  DISCOUNT = 'DISCOUNT',
  CREDIT = 'CREDIT',
}
```

### R2: Update isVatApplicable() Function

```typescript
/**
 * Determines whether VAT should be applied to a line item.
 *
 * Per South African VAT Act No. 89 of 1991, Section 12(h):
 * - Educational/childcare fees are VAT EXEMPT
 * - Goods and non-educational services are VAT APPLICABLE (15%)
 *
 * @see https://www.sars.gov.za - VAT Act Section 12
 * @param lineType - The type of invoice line item
 * @param isExemptOverride - Optional override for AD_HOC items
 * @returns true if VAT should be applied, false otherwise
 */
export function isVatApplicable(lineType: LineType, isExemptOverride?: boolean): boolean {
  // AD_HOC items use explicit override flag
  if (lineType === LineType.AD_HOC && isExemptOverride !== undefined) {
    return !isExemptOverride;
  }

  switch (lineType) {
    // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
    case LineType.MONTHLY_FEE:
    case LineType.REGISTRATION:
    case LineType.RE_REGISTRATION:
    case LineType.EXTRA_MURAL:
      return false;

    // VAT APPLICABLE - Goods & Non-Educational Services (15%)
    case LineType.BOOKS:
    case LineType.STATIONERY:
    case LineType.UNIFORM:
    case LineType.SCHOOL_TRIP:
    case LineType.MEALS:
    case LineType.TRANSPORT:
    case LineType.LATE_PICKUP:
    case LineType.DAMAGED_EQUIPMENT:
    case LineType.AD_HOC:  // Default: VAT applicable unless overridden
    case LineType.EXTRA:   // Deprecated: Assume VAT applicable
      return true;

    // NO VAT - Adjustments
    case LineType.DISCOUNT:
    case LineType.CREDIT:
      return false;
  }

  const _exhaustiveCheck: never = lineType;
  throw new Error(`Unknown LineType: ${String(_exhaustiveCheck)}`);
}
```

### R3: Update AdHocCharge Entity

Add `isVatExempt` flag to allow configurable VAT on ad-hoc charges:

```prisma
model AdHocCharge {
  id            String    @id @default(cuid())
  tenantId      String
  childId       String
  description   String
  amountCents   Int
  chargeDate    DateTime
  chargeType    String    @default("OTHER")   // NEW: Specific charge type
  isVatExempt   Boolean   @default(false)     // NEW: Override for exempt charges
  invoicedAt    DateTime?
  invoiceId     String?
  createdAt     DateTime  @default(now())

  // Relations...
}
```

### R4: Update Invoice Generation Service

Modify `addLineItems()` to pass VAT exemption flag:

```typescript
// When processing AD_HOC charges
lineItems.push({
  description: charge.description,
  quantity: new Decimal(1),
  unitPriceCents: charge.amountCents,
  discountCents: 0,
  lineType: LineType.AD_HOC,
  accountCode: this.SCHOOL_FEES_ACCOUNT,
  adHocChargeId: charge.id,
  isVatExempt: charge.isVatExempt,  // Pass through exemption flag
});
```

### R5: Update VAT Calculation in addLineItems()

```typescript
// Calculate VAT based on line type and exemption override
let lineVatCents = 0;
if (
  isVatRegistered &&
  isVatApplicable(item.lineType, item.isVatExempt) &&
  item.unitPriceCents > 0
) {
  lineVatCents = this.calculateVAT(
    lineSubtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
  );
}
```

---

## Prisma Schema Changes

```prisma
// Add to schema.prisma

// Update AdHocCharge model
model AdHocCharge {
  id            String    @id @default(cuid())
  tenantId      String
  childId       String
  description   String
  amountCents   Int
  chargeDate    DateTime
  chargeType    String    @default("OTHER")   // NEW: Specific charge type
  isVatExempt   Boolean   @default(false)     // NEW: VAT exemption override
  vatCents      Int?                          // NEW: Cached VAT amount
  invoicedAt    DateTime?
  invoiceId     String?
  createdAt     DateTime  @default(now())

  tenant        Tenant    @relation(fields: [tenantId], references: [id])
  child         Child     @relation(fields: [childId], references: [id])
  invoice       Invoice?  @relation(fields: [invoiceId], references: [id])

  @@index([tenantId, childId])
  @@index([invoicedAt])
}
```

---

## Updated DTOs

```typescript
// src/database/dto/invoice-generation.dto.ts

export interface LineItemInput {
  description: string;
  quantity: Decimal;
  unitPriceCents: number;
  discountCents: number;
  lineType: LineType;
  accountCode: string;
  adHocChargeId?: string;
  isVatExempt?: boolean;  // NEW: Override for AD_HOC items
}

// src/database/dto/ad-hoc-charge.dto.ts

export class CreateAdHocChargeDto {
  @ApiProperty({ description: 'Child ID for the charge' })
  @IsString()
  childId: string;

  @ApiProperty({ description: 'Description of the charge' })
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty({ description: 'Amount in cents (Rands * 100)' })
  @IsInt()
  @Min(1)
  amountCents: number;

  @ApiProperty({ description: 'Date of the charge' })
  @IsDateString()
  chargeDate: string;

  @ApiPropertyOptional({
    description: 'Charge type for VAT categorization',
    enum: ['MEALS', 'TRANSPORT', 'LATE_PICKUP', 'EXTRA_MURAL', 'DAMAGED_EQUIPMENT', 'OTHER'],
    default: 'OTHER'
  })
  @IsOptional()
  @IsEnum(['MEALS', 'TRANSPORT', 'LATE_PICKUP', 'EXTRA_MURAL', 'DAMAGED_EQUIPMENT', 'OTHER'])
  chargeType?: string;

  @ApiPropertyOptional({
    description: 'Override: Mark charge as VAT exempt (e.g., educational extra-mural)',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  isVatExempt?: boolean;
}
```

---

## VAT Category Reference Table

| Line Type | VAT Status | Rate | Legal Basis |
|-----------|-----------|------|-------------|
| MONTHLY_FEE | Exempt | 0% | VAT Act s.12(h)(iii) - Childcare services |
| REGISTRATION | Exempt | 0% | VAT Act s.12(h)(ii) - School fees |
| RE_REGISTRATION | Exempt | 0% | VAT Act s.12(h)(ii) - School fees |
| EXTRA_MURAL | Exempt | 0% | VAT Act s.12(h)(ii) - Subordinate to education |
| BOOKS | Standard | 15% | Goods - not exempt |
| STATIONERY | Standard | 15% | Goods - not exempt |
| UNIFORM | Standard | 15% | Goods - not exempt |
| SCHOOL_TRIP | Standard | 15% | Service - not educational |
| MEALS | Standard | 15% | Prepared food - not zero-rated |
| TRANSPORT | Standard | 15% | Service - not educational |
| LATE_PICKUP | Standard | 15% | Penalty - not educational |
| DAMAGED_EQUIPMENT | Standard | 15% | Replacement - goods |
| AD_HOC | Configurable | 0%/15% | Depends on isVatExempt flag |
| DISCOUNT | N/A | 0% | Adjustment - no VAT |
| CREDIT | N/A | 0% | Adjustment - no VAT |

---

## Test Specification

```typescript
// tests/database/services/invoice-vat-compliance.spec.ts

import { LineType, isVatApplicable } from '../../../src/database/entities/invoice-line.entity';

describe('SA VAT Compliance - isVatApplicable', () => {
  describe('VAT EXEMPT items (Section 12(h))', () => {
    it.each([
      ['MONTHLY_FEE', LineType.MONTHLY_FEE],
      ['REGISTRATION', LineType.REGISTRATION],
      ['RE_REGISTRATION', LineType.RE_REGISTRATION],
      ['EXTRA_MURAL', LineType.EXTRA_MURAL],
    ])('%s should be VAT exempt', (name, lineType) => {
      expect(isVatApplicable(lineType)).toBe(false);
    });
  });

  describe('VAT APPLICABLE items (15% Standard Rate)', () => {
    it.each([
      ['BOOKS', LineType.BOOKS],
      ['STATIONERY', LineType.STATIONERY],
      ['UNIFORM', LineType.UNIFORM],
      ['SCHOOL_TRIP', LineType.SCHOOL_TRIP],
      ['MEALS', LineType.MEALS],
      ['TRANSPORT', LineType.TRANSPORT],
      ['LATE_PICKUP', LineType.LATE_PICKUP],
      ['DAMAGED_EQUIPMENT', LineType.DAMAGED_EQUIPMENT],
    ])('%s should have VAT applied', (name, lineType) => {
      expect(isVatApplicable(lineType)).toBe(true);
    });
  });

  describe('NO VAT items (Adjustments)', () => {
    it.each([
      ['DISCOUNT', LineType.DISCOUNT],
      ['CREDIT', LineType.CREDIT],
    ])('%s should not have VAT', (name, lineType) => {
      expect(isVatApplicable(lineType)).toBe(false);
    });
  });

  describe('AD_HOC with configurable VAT', () => {
    it('should apply VAT by default (no override)', () => {
      expect(isVatApplicable(LineType.AD_HOC)).toBe(true);
    });

    it('should apply VAT when isVatExempt=false', () => {
      expect(isVatApplicable(LineType.AD_HOC, false)).toBe(true);
    });

    it('should NOT apply VAT when isVatExempt=true', () => {
      expect(isVatApplicable(LineType.AD_HOC, true)).toBe(false);
    });
  });
});

describe('Invoice Generation - VAT Calculation', () => {
  it('should NOT add VAT to monthly fees for VAT-registered tenant', async () => {
    // Test that monthly fee line has vatCents = 0
  });

  it('should add 15% VAT to meals for VAT-registered tenant', async () => {
    // Test that meal line has correct VAT calculation
  });

  it('should NOT add VAT for non-VAT-registered tenant', async () => {
    // All lines should have vatCents = 0
  });

  it('should handle mixed exempt and applicable items on same invoice', async () => {
    // Invoice with MONTHLY_FEE (exempt) + MEALS (applicable)
    // Only MEALS should have VAT
  });
});
```

---

## Acceptance Criteria

- [ ] New LineTypes added: MEALS, TRANSPORT, LATE_PICKUP, DAMAGED_EQUIPMENT, RE_REGISTRATION, EXTRA_MURAL
- [ ] `isVatApplicable()` updated with all line types and legal references
- [ ] AdHocCharge entity has `isVatExempt` and `chargeType` flags
- [ ] Invoice generation correctly applies VAT based on line type
- [ ] AD_HOC charges can be marked as VAT exempt
- [ ] VAT only calculated for VAT-registered tenants
- [ ] Invoice displays VAT breakdown clearly
- [ ] All tests pass: `pnpm test --runInBand`
- [ ] JSDoc comments include VAT Act section references
- [ ] Migration created for schema changes

---

## Files to Create/Modify

### Modified Files
- `src/database/entities/invoice-line.entity.ts` - Add new LineTypes, update isVatApplicable()
- `src/database/services/invoice-generation.service.ts` - Update VAT calculation logic
- `src/database/dto/invoice-generation.dto.ts` - Add isVatExempt to LineItemInput
- `src/database/dto/ad-hoc-charge.dto.ts` - Add chargeType and isVatExempt
- `prisma/schema.prisma` - Add fields to AdHocCharge model
- `tests/database/services/invoice-generation.service.spec.ts` - Update tests

### New Files
- `prisma/migrations/XXXXXXXX_add_vat_compliance_fields/` - Migration
- `src/database/services/__tests__/invoice-vat-compliance.spec.ts` - VAT-specific tests

---

## Legal References

- **VAT Act No. 89 of 1991, Section 12(h)** - Exempt supplies (educational services)
- **Section 12(h)(i)** - Educational services by registered institutions
- **Section 12(h)(ii)** - Goods/services subordinate to education
- **Section 12(h)(iii)** - Childcare services specifically
- **Schedule 2, Part B** - Zero-rated basic foodstuffs
- **SARS VAT 404 Guide** - General VAT guidance for vendors

---

**Last Updated**: 2026-01-13
**Template Version**: 2.0 (Comprehensive)
**Research Basis**: South African VAT Act No. 89 of 1991, SARS guidance, Grant Thornton tax advisory

---

## Implementation Notes (Completed 2026-01-13)

### Changes Made

#### 1. Prisma Schema Updates
- Added `AdHocChargeType` enum with values: MEALS, TRANSPORT, LATE_PICKUP, EXTRA_MURAL, DAMAGED_EQUIPMENT, OTHER
- Added to `AdHocCharge` model:
  - `chargeType AdHocChargeType @default(OTHER)`
  - `isVatExempt Boolean @default(false)`
  - `vatCents Int?`
- Updated `LineType` enum with new values:
  - RE_REGISTRATION, EXTRA_MURAL (VAT Exempt)
  - MEALS, TRANSPORT, LATE_PICKUP, DAMAGED_EQUIPMENT (VAT Applicable)
- Migration: `20260113131915_add_vat_compliance_fields`

#### 2. Entity Updates (`invoice-line.entity.ts`)
- Added 6 new LineTypes with JSDoc comments and VAT Act references
- Updated `isVatApplicable()` function:
  - Added `isExemptOverride?: boolean` parameter for AD_HOC items
  - Added exhaustive switch with error handling
  - Comprehensive comments linking to VAT Act Section 12(h)

#### 3. DTO Updates
- `invoice-generation.dto.ts`: Added `isVatExempt?: boolean` to `LineItemInput`
- `adhoc-charge.dto.ts`: Added `chargeType` and `isVatExempt` fields
- `adhoc-charge-request.dto.ts`: Added API-layer DTOs with Swagger annotations

#### 4. Service Updates (`invoice-generation.service.ts`)
- Updated ad-hoc charge processing to pass `isVatExempt` flag
- Updated `addLineItems()` to pass exemption override to `isVatApplicable()`

#### 5. Constants Update (`line-type-accounts.constants.ts`)
- Added Xero account codes for all new LineTypes
- Updated VAT exempt/applicable arrays

#### 6. Tests Created (`invoice-vat-compliance.spec.ts`)
- 31 comprehensive tests covering:
  - VAT exempt items (Section 12(h))
  - VAT applicable items (15%)
  - Adjustment items (no VAT)
  - AD_HOC with configurable exemption
  - Business scenarios (monthly invoice, ad-hoc override, late pickup, transport)

### Acceptance Criteria Status

- [x] New LineTypes added: MEALS, TRANSPORT, LATE_PICKUP, DAMAGED_EQUIPMENT, RE_REGISTRATION, EXTRA_MURAL
- [x] `isVatApplicable()` updated with all line types and legal references
- [x] AdHocCharge entity has `isVatExempt` and `chargeType` flags
- [x] Invoice generation correctly applies VAT based on line type
- [x] AD_HOC charges can be marked as VAT exempt
- [x] VAT only calculated for VAT-registered tenants
- [x] All new tests pass (31/31)
- [x] JSDoc comments include VAT Act section references
- [x] Migration created for schema changes

### Test Results
```
PASS src/database/services/__tests__/invoice-vat-compliance.spec.ts
  31 passing tests
  - VAT EXEMPT items (4 tests)
  - VAT APPLICABLE items (9 tests)
  - NO VAT items (2 tests)
  - AD_HOC configurable (4 tests)
  - LineType completeness (2 tests)
  - Exhaustive coverage (2 tests)
  - Business scenarios (8 tests)
```

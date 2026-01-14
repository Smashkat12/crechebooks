<task_spec id="TASK-SPAY-003" version="2.0">

<metadata>
  <title>SimplePay Calculations Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>177</sequence>
  <implements>
    <requirement_ref>REQ-PAYROLL-CALCULATIONS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-004</task_ref>
    <task_ref status="pending">TASK-SPAY-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-08</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current SimplePay Integration State

  **Existing SimplePay Services (src/integrations/simplepay/):**
  - `simplepay-api.client.ts` - HTTP client with rate limiting (60 req/min), exponential backoff
  - `simplepay-connection.service.ts` - Connection setup, test, disconnect
  - `simplepay-employee.service.ts` - Employee CRUD, sync to SimplePay
  - `simplepay-payslip.service.ts` - Payslip import, PDF download
  - `simplepay-tax.service.ts` - IRP5 certificates, EMP201 data
  - `simplepay-payrun.service.ts` - Pay run tracking, Xero journal posting (TASK-SPAY-002)
  - `simplepay.module.ts` - NestJS module exports

  **Existing SimplePay Database Models (prisma/schema.prisma):**
  - `SimplePayConnection` - Stores API key (encrypted), client ID per tenant
  - `SimplePayEmployeeMapping` - Maps Staff.id to SimplePay employee ID
  - `SimplePayPayslipImport` - Stores imported payslip data
  - `PayRunSync` - Pay run tracking with Xero status (TASK-SPAY-002)
  - `SimplePaySyncStatus` enum - NOT_SYNCED, SYNCED, SYNC_FAILED, OUT_OF_SYNC

  **SimplePay API Base URL:** `https://api.payroll.simplepay.cloud/v1`
  **Rate Limit:** 60 requests per minute (1000 per hour)

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. SimplePay API Client Pattern
  ALWAYS use the existing SimplePayApiClient for HTTP calls:
  ```typescript
  import { SimplePayApiClient } from './simplepay-api.client';

  // In constructor
  constructor(private readonly apiClient: SimplePayApiClient) {}

  // In methods - MUST call initializeForTenant first
  async someMethod(tenantId: string) {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    // SimplePay returns wrapped responses: [{ calculation: {...} }, ...]
    const response = await this.apiClient.get<WrapperType[]>(`/employees/${empId}/calculations`);
    return response.map(w => w.calculation);
  }
  ```

  ### 3. Service Pattern (src/integrations/simplepay/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SimplePayCalculationsService {
    private readonly logger = new Logger(SimplePayCalculationsService.name);

    constructor(
      private readonly apiClient: SimplePayApiClient,
      private readonly simplePayRepo: SimplePayRepository,
    ) {}
  }
  ```

  ### 4. Repository Pattern (src/database/repositories/*.repository.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';

  @Injectable()
  export class CalculationCacheRepository {
    private readonly logger = new Logger(CalculationCacheRepository.name);
    constructor(private readonly prisma: PrismaService) {}

    // Every method has try/catch with:
    // 1. this.logger.error() with full context
    // 2. Re-throw custom exception (NEVER swallow errors)
  }
  ```

  ### 5. Entity Interface Pattern (src/database/entities/*.entity.ts)
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values: `EARNING = 'EARNING'` (string value matches key)

  ### 6. DTO Pattern (src/database/dto/*.dto.ts)
  - Import enums from entity file
  - Use class-validator decorators
  - Use @ApiProperty for Swagger documentation

  ### 7. Test Pattern
  ```typescript
  import 'dotenv/config';  // FIRST LINE - Required!
  import { Test, TestingModule } from '@nestjs/testing';

  // CRITICAL: Add new tables to cleanup in FK order
  beforeEach(async () => {
    await prisma.payrollAdjustment.deleteMany({});  // NEW tables first
    await prisma.calculationItemCache.deleteMany({});
    // ... existing cleanup ...
  });
  ```

  ### 8. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag - prevents parallel DB conflicts
  ```
</critical_patterns>

<context>
This task implements payslip calculations management via SimplePay API. Calculations control earnings, deductions, and company contributions on employee payslips.

**SimplePay Calculations API Endpoints:**
- `GET /v1/clients/:client_id/items_and_outputs` - List all available calculation items
- `GET /v1/employees/:employee_id/calculations` - List employee recurring calculations
- `POST /v1/employees/:employee_id/calculations` - Create/update calculation
- `GET /v1/calculations/:id` - Get single calculation
- `PATCH /v1/calculations/:id` - Update calculation
- `DELETE /v1/calculations/:id` - Delete calculation
- `GET /v1/payslips/:payslip_id/calculations` - List payslip calculations
- `POST /v1/payslips/:payslip_id/calculations` - Add one-time calculation
- `GET /v1/employees/:employee_id/inherited_calculations` - List inherited calculations
- `PATCH /v1/employees/:employee_id/inherited_calculations` - Update inherited calculation

**Business Logic:**
- Calculation items are templates (BONUS, OVERTIME, PENSION, etc.)
- Employee calculations are recurring (applied every pay run)
- Payslip calculations are one-time (single pay run)
- Inherited calculations are system-managed (basic salary, tax settings)

**South African Payroll Context:**
- PAYE - Income tax calculated on gross earnings
- UIF - 1% employee + 1% employer (capped at R177.12/month)
- SDL - 1% employer (Skills Development Levy)
- ETI - Employment Tax Incentive for youth employment
</context>

<scope>
  <in_scope>
    - Add CalculationItemCache model to prisma/schema.prisma
    - Add PayrollAdjustment model to prisma/schema.prisma
    - Add CalculationType enum
    - Run migration: npx prisma migrate dev --name create_calculation_tables
    - Create src/database/entities/calculation.entity.ts
    - Create src/database/dto/calculations.dto.ts
    - Create src/database/repositories/calculation-cache.repository.ts
    - Create src/database/repositories/payroll-adjustment.repository.ts
    - Create src/integrations/simplepay/simplepay-calculations.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add calculation endpoints to src/api/integrations/simplepay.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-calculations.service.spec.ts (18+ tests)
    - Create tests/database/repositories/calculation-cache.repository.spec.ts (8+ tests)
    - Create tests/database/repositories/payroll-adjustment.repository.spec.ts (10+ tests)
  </in_scope>
  <out_of_scope>
    - Leave management (TASK-SPAY-001)
    - Service periods (TASK-SPAY-004)
    - Reports (TASK-SPAY-005)
    - Payslip generation (SimplePay handles this)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay API Response Formats (CRITICAL - responses are wrapped!)

### GET /v1/clients/:client_id/items_and_outputs
```json
[
  {
    "item_and_output": {
      "id": "item_basic",
      "code": "BASIC",
      "name": "Basic Salary",
      "type": "earning",
      "taxable": true,
      "affects_uif": true,
      "category": "fixed_earning"
    }
  },
  {
    "item_and_output": {
      "id": "item_bonus",
      "code": "BONUS",
      "name": "Bonus",
      "type": "earning",
      "taxable": true,
      "affects_uif": false,
      "category": "variable_earning"
    }
  },
  {
    "item_and_output": {
      "id": "item_pension",
      "code": "PENSION",
      "name": "Pension Fund",
      "type": "deduction",
      "taxable": false,
      "affects_uif": false,
      "category": "retirement"
    }
  },
  {
    "item_and_output": {
      "id": "item_uif_er",
      "code": "UIF_ER",
      "name": "UIF Employer",
      "type": "company_contribution",
      "taxable": false,
      "affects_uif": false,
      "category": "statutory"
    }
  }
]
```

### GET /v1/employees/:employee_id/calculations
```json
[
  {
    "calculation": {
      "id": "calc_123",
      "item_code": "BONUS",
      "item_name": "Bonus",
      "type": "earning",
      "amount": 5000.00,
      "percentage": null,
      "formula": null,
      "effective_date": "2026-01-01",
      "end_date": null
    }
  },
  {
    "calculation": {
      "id": "calc_456",
      "item_code": "PENSION",
      "item_name": "Pension Fund",
      "type": "deduction",
      "amount": null,
      "percentage": 7.5,
      "formula": "gross * percentage / 100",
      "effective_date": "2025-01-01",
      "end_date": null
    }
  }
]
```

### POST /v1/employees/:employee_id/calculations
Request:
```json
{
  "calculation": {
    "item_code": "BONUS",
    "amount": 10000.00,
    "operation": "insert",
    "effective_date": "2026-02-01"
  }
}
```
Response: Same format as GET single calculation

### GET /v1/calculations/:id
```json
{
  "calculation": {
    "id": "calc_123",
    "item_code": "BONUS",
    "item_name": "Bonus",
    "type": "earning",
    "amount": 5000.00,
    "percentage": null,
    "formula": null,
    "effective_date": "2026-01-01",
    "end_date": null
  }
}
```

### PATCH /v1/calculations/:id
Request:
```json
{
  "calculation": {
    "amount": 7500.00,
    "effective_date": "2026-02-01"
  }
}
```

### DELETE /v1/calculations/:id
Returns: 204 No Content

### GET /v1/payslips/:payslip_id/calculations
```json
[
  {
    "calculation": {
      "id": "ps_calc_789",
      "item_code": "OVERTIME",
      "item_name": "Overtime",
      "type": "earning",
      "amount": 1500.00,
      "hours": 10,
      "rate": 150.00
    }
  }
]
```

### POST /v1/payslips/:payslip_id/calculations
Request:
```json
{
  "calculation": {
    "item_code": "OVERTIME",
    "amount": 2000.00
  }
}
```

### GET /v1/employees/:employee_id/inherited_calculations
```json
[
  {
    "inherited_calculation": {
      "id": "inh_basic",
      "code": "week_hours",
      "name": "Weekly Hours / Basic Salary",
      "current_value": 20000.00,
      "inputs_history": [
        {
          "effective_date": "2025-01-01",
          "value": 18000.00
        },
        {
          "effective_date": "2026-01-01",
          "value": 20000.00
        }
      ]
    }
  },
  {
    "inherited_calculation": {
      "id": "inh_tax",
      "code": "tax_status",
      "name": "Tax Status",
      "current_value": "A",
      "inputs_history": []
    }
  }
]
```

### PATCH /v1/employees/:employee_id/inherited_calculations
Request:
```json
{
  "inherited_calculation": {
    "code": "week_hours",
    "value": 25000.00,
    "effective_date": "2026-02-01"
  }
}
```
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER PayRunSync model)

```prisma
// TASK-SPAY-003: Calculations Management
enum CalculationType {
  EARNING
  DEDUCTION
  COMPANY_CONTRIBUTION
}

model CalculationItemCache {
  id         String          @id @default(uuid())
  tenantId   String          @map("tenant_id")
  code       String          @db.VarChar(50)
  name       String          @db.VarChar(200)
  type       CalculationType
  taxable    Boolean
  affectsUif Boolean         @map("affects_uif")
  category   String?         @db.VarChar(100)
  cachedAt   DateTime        @default(now()) @map("cached_at")
  updatedAt  DateTime        @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, code])
  @@index([tenantId])
  @@index([tenantId, type])
  @@map("calculation_item_cache")
}

model PayrollAdjustment {
  id                  String          @id @default(uuid())
  tenantId            String          @map("tenant_id")
  staffId             String          @map("staff_id")
  itemCode            String          @map("item_code") @db.VarChar(50)
  itemName            String          @map("item_name") @db.VarChar(200)
  type                CalculationType
  amountCents         Int?            @map("amount_cents")
  percentage          Decimal?        @db.Decimal(5, 2)
  isRecurring         Boolean         @default(true) @map("is_recurring")
  effectiveDate       DateTime        @map("effective_date") @db.Date
  endDate             DateTime?       @map("end_date") @db.Date
  simplePayCalcId     String?         @map("simplepay_calc_id")
  syncedToSimplePay   Boolean         @default(false) @map("synced_to_simplepay")
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  staff  Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([staffId])
  @@index([tenantId, staffId, isRecurring])
  @@map("payroll_adjustments")
}
```

## Update Tenant model - ADD these relations:
```prisma
model Tenant {
  // ... existing relations ...
  calculationItemCache  CalculationItemCache[]  // ADD THIS
  payrollAdjustments    PayrollAdjustment[]     // ADD THIS
}
```

## Update Staff model - ADD this relation:
```prisma
model Staff {
  // ... existing relations ...
  payrollAdjustments    PayrollAdjustment[]     // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/calculation.entity.ts
```typescript
/**
 * Calculation Entity Types
 * TASK-SPAY-003: SimplePay Calculations Service
 */

export enum CalculationType {
  EARNING = 'EARNING',
  DEDUCTION = 'DEDUCTION',
  COMPANY_CONTRIBUTION = 'COMPANY_CONTRIBUTION',
}

export interface ICalculationItemCache {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  type: CalculationType;
  taxable: boolean;
  affectsUif: boolean;
  category: string | null;
  cachedAt: Date;
  updatedAt: Date;
}

export interface IPayrollAdjustment {
  id: string;
  tenantId: string;
  staffId: string;
  itemCode: string;
  itemName: string;
  type: CalculationType;
  amountCents: number | null;
  percentage: number | null;
  isRecurring: boolean;
  effectiveDate: Date;
  endDate: Date | null;
  simplePayCalcId: string | null;
  syncedToSimplePay: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// SimplePay API types
export interface SimplePayItemAndOutput {
  id: string;
  code: string;
  name: string;
  type: 'earning' | 'deduction' | 'company_contribution';
  taxable: boolean;
  affects_uif: boolean;
  category: string;
}

export interface SimplePayCalculation {
  id: string;
  item_code: string;
  item_name: string;
  type: 'earning' | 'deduction' | 'company_contribution';
  amount: number | null;
  percentage: number | null;
  formula: string | null;
  effective_date: string | null;
  end_date: string | null;
}

export interface SimplePayPayslipCalculation {
  id: string;
  item_code: string;
  item_name: string;
  type: 'earning' | 'deduction' | 'company_contribution';
  amount: number;
  hours?: number;
  rate?: number;
}

export interface SimplePayInheritedCalculation {
  id: string;
  code: string;
  name: string;
  current_value: number | string;
  inputs_history: Array<{
    effective_date: string;
    value: number | string;
  }>;
}

// Mapped types for internal use
export interface CalculationItem {
  id: string;
  code: string;
  name: string;
  type: CalculationType;
  taxable: boolean;
  affectsUif: boolean;
  category: string | null;
}

export interface Calculation {
  id: string;
  itemCode: string;
  itemName: string;
  type: CalculationType;
  amount: number | null;
  percentage: number | null;
  formula: string | null;
  effectiveDate: string | null;
  endDate: string | null;
}

export interface InheritedCalculation {
  id: string;
  code: string;
  name: string;
  currentValue: number | string;
  inputsHistory: Array<{
    effectiveDate: string;
    value: number | string;
  }>;
}

// Common SA payroll item codes
export const SA_PAYROLL_ITEMS = {
  // Earnings
  BASIC: 'BASIC',
  OVERTIME: 'OVERTIME',
  COMMISSION: 'COMMISSION',
  BONUS: 'BONUS',
  ALLOWANCE_TRAVEL: 'ALLOWANCE_TRAVEL',
  ALLOWANCE_CELL: 'ALLOWANCE_CELL',
  ALLOWANCE_HOUSING: 'ALLOWANCE_HOUSING',
  // Deductions
  PAYE: 'PAYE',
  UIF_EE: 'UIF_EE',
  PENSION: 'PENSION',
  MEDICAL_AID: 'MEDICAL_AID',
  LOAN_REPAY: 'LOAN_REPAY',
  GARNISHEE: 'GARNISHEE',
  // Company contributions
  UIF_ER: 'UIF_ER',
  SDL: 'SDL',
  PENSION_ER: 'PENSION_ER',
  MEDICAL_AID_ER: 'MEDICAL_AID_ER',
} as const;
```
</entity_files>

<dto_files>
## src/database/dto/calculations.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsInt,
  IsNumber,
  IsBoolean,
  IsDate,
  IsOptional,
  IsEnum,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { CalculationType } from '../entities/calculation.entity';

// ============================================
// Calculation Item DTOs
// ============================================

export class CalculationItemResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: CalculationType })
  type!: CalculationType;

  @ApiProperty()
  taxable!: boolean;

  @ApiProperty()
  affectsUif!: boolean;

  @ApiPropertyOptional()
  category?: string;
}

// ============================================
// Employee Calculation DTOs
// ============================================

export class CreateCalculationDto {
  @ApiProperty({ description: 'Calculation item code', example: 'BONUS' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode!: string;

  @ApiPropertyOptional({ description: 'Fixed amount in Rands', example: 5000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Percentage value', example: 7.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @ApiPropertyOptional({
    description: 'Operation type',
    enum: ['insert', 'upsert', 'update'],
    default: 'upsert',
  })
  @IsOptional()
  @IsString()
  operation?: 'insert' | 'upsert' | 'update';

  @ApiPropertyOptional({ description: 'Effective date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class UpdateCalculationDto extends PartialType(CreateCalculationDto) {}

export class CalculationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  itemCode!: string;

  @ApiProperty()
  itemName!: string;

  @ApiProperty({ enum: CalculationType })
  type!: CalculationType;

  @ApiPropertyOptional()
  amount?: number;

  @ApiPropertyOptional()
  percentage?: number;

  @ApiPropertyOptional()
  formula?: string;

  @ApiPropertyOptional()
  effectiveDate?: string;

  @ApiPropertyOptional()
  endDate?: string;
}

// ============================================
// Payslip Calculation DTOs
// ============================================

export class CreatePayslipCalculationDto {
  @ApiProperty({ description: 'Calculation item code', example: 'OVERTIME' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode!: string;

  @ApiProperty({ description: 'Amount in Rands', example: 1500 })
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({ description: 'Hours (for time-based calculations)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hours?: number;

  @ApiPropertyOptional({ description: 'Rate per hour/unit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  rate?: number;
}

export class PayslipCalculationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  itemCode!: string;

  @ApiProperty()
  itemName!: string;

  @ApiProperty({ enum: CalculationType })
  type!: CalculationType;

  @ApiProperty()
  amount!: number;

  @ApiPropertyOptional()
  hours?: number;

  @ApiPropertyOptional()
  rate?: number;
}

// ============================================
// Inherited Calculation DTOs
// ============================================

export class InheritedCalculationHistoryDto {
  @ApiProperty()
  effectiveDate!: string;

  @ApiProperty()
  value!: number | string;
}

export class InheritedCalculationResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  currentValue!: number | string;

  @ApiProperty({ type: [InheritedCalculationHistoryDto] })
  inputsHistory!: InheritedCalculationHistoryDto[];
}

export class UpdateInheritedCalculationDto {
  @ApiProperty({ description: 'Calculation code', example: 'week_hours' })
  @IsString()
  @MinLength(1)
  code!: string;

  @ApiProperty({ description: 'New value', example: 25000 })
  value!: number | string;

  @ApiPropertyOptional({ description: 'Effective date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  effectiveDate?: string;
}

// ============================================
// Payroll Adjustment DTOs (Local Storage)
// ============================================

export class CreatePayrollAdjustmentDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiProperty()
  @IsUUID()
  staffId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  itemCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  itemName!: string;

  @ApiProperty({ enum: CalculationType })
  @IsEnum(CalculationType)
  type!: CalculationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  amountCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  effectiveDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}

export class UpdatePayrollAdjustmentDto extends PartialType(CreatePayrollAdjustmentDto) {}

export class PayrollAdjustmentFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({ enum: CalculationType })
  @IsOptional()
  @IsEnum(CalculationType)
  type?: CalculationType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  syncedOnly?: boolean;
}
```
</dto_files>

<repository_file>
## src/database/repositories/calculation-cache.repository.ts

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculationItemCache, Prisma } from '@prisma/client';
import { CalculationType, CalculationItem } from '../entities/calculation.entity';

@Injectable()
export class CalculationCacheRepository {
  private readonly logger = new Logger(CalculationCacheRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async upsertMany(tenantId: string, items: CalculationItem[]): Promise<number> {
    try {
      let upserted = 0;
      for (const item of items) {
        await this.prisma.calculationItemCache.upsert({
          where: {
            tenantId_code: { tenantId, code: item.code },
          },
          create: {
            tenantId,
            code: item.code,
            name: item.name,
            type: item.type,
            taxable: item.taxable,
            affectsUif: item.affectsUif,
            category: item.category,
          },
          update: {
            name: item.name,
            type: item.type,
            taxable: item.taxable,
            affectsUif: item.affectsUif,
            category: item.category,
          },
        });
        upserted++;
      }
      return upserted;
    } catch (error) {
      this.logger.error(`Failed to upsert calculation items: ${error}`, { tenantId });
      throw error;
    }
  }

  async findByTenant(tenantId: string): Promise<CalculationItemCache[]> {
    return this.prisma.calculationItemCache.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findByCode(tenantId: string, code: string): Promise<CalculationItemCache | null> {
    return this.prisma.calculationItemCache.findUnique({
      where: { tenantId_code: { tenantId, code } },
    });
  }

  async findByType(tenantId: string, type: CalculationType): Promise<CalculationItemCache[]> {
    return this.prisma.calculationItemCache.findMany({
      where: { tenantId, type },
      orderBy: { name: 'asc' },
    });
  }

  async getCacheAge(tenantId: string): Promise<Date | null> {
    const oldest = await this.prisma.calculationItemCache.findFirst({
      where: { tenantId },
      orderBy: { cachedAt: 'asc' },
      select: { cachedAt: true },
    });
    return oldest?.cachedAt || null;
  }

  async deleteByTenant(tenantId: string): Promise<number> {
    const result = await this.prisma.calculationItemCache.deleteMany({
      where: { tenantId },
    });
    return result.count;
  }
}
```

## src/database/repositories/payroll-adjustment.repository.ts

```typescript
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayrollAdjustment, Prisma } from '@prisma/client';
import {
  CreatePayrollAdjustmentDto,
  UpdatePayrollAdjustmentDto,
  PayrollAdjustmentFilterDto,
} from '../dto/calculations.dto';

@Injectable()
export class PayrollAdjustmentRepository {
  private readonly logger = new Logger(PayrollAdjustmentRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePayrollAdjustmentDto): Promise<PayrollAdjustment> {
    try {
      return await this.prisma.payrollAdjustment.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          itemCode: dto.itemCode,
          itemName: dto.itemName,
          type: dto.type,
          amountCents: dto.amountCents,
          percentage: dto.percentage,
          isRecurring: dto.isRecurring ?? true,
          effectiveDate: dto.effectiveDate,
          endDate: dto.endDate,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to create PayrollAdjustment: ${error}`, { dto });
      throw error;
    }
  }

  async findById(id: string): Promise<PayrollAdjustment | null> {
    return this.prisma.payrollAdjustment.findUnique({ where: { id } });
  }

  async findByStaff(
    tenantId: string,
    staffId: string,
    filter?: PayrollAdjustmentFilterDto,
  ): Promise<PayrollAdjustment[]> {
    const where: Prisma.PayrollAdjustmentWhereInput = { tenantId, staffId };

    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.isRecurring !== undefined) {
      where.isRecurring = filter.isRecurring;
    }
    if (filter?.syncedOnly) {
      where.syncedToSimplePay = true;
    }

    return this.prisma.payrollAdjustment.findMany({
      where,
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async findByTenant(
    tenantId: string,
    filter?: PayrollAdjustmentFilterDto,
  ): Promise<PayrollAdjustment[]> {
    const where: Prisma.PayrollAdjustmentWhereInput = { tenantId };

    if (filter?.staffId) {
      where.staffId = filter.staffId;
    }
    if (filter?.type) {
      where.type = filter.type;
    }
    if (filter?.isRecurring !== undefined) {
      where.isRecurring = filter.isRecurring;
    }
    if (filter?.syncedOnly) {
      where.syncedToSimplePay = true;
    }

    return this.prisma.payrollAdjustment.findMany({
      where,
      orderBy: [{ staffId: 'asc' }, { effectiveDate: 'desc' }],
    });
  }

  async findActiveByStaff(tenantId: string, staffId: string): Promise<PayrollAdjustment[]> {
    const today = new Date();
    return this.prisma.payrollAdjustment.findMany({
      where: {
        tenantId,
        staffId,
        effectiveDate: { lte: today },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  async update(id: string, dto: UpdatePayrollAdjustmentDto): Promise<PayrollAdjustment> {
    try {
      return await this.prisma.payrollAdjustment.update({
        where: { id },
        data: {
          ...(dto.itemCode && { itemCode: dto.itemCode }),
          ...(dto.itemName && { itemName: dto.itemName }),
          ...(dto.type && { type: dto.type }),
          ...(dto.amountCents !== undefined && { amountCents: dto.amountCents }),
          ...(dto.percentage !== undefined && { percentage: dto.percentage }),
          ...(dto.isRecurring !== undefined && { isRecurring: dto.isRecurring }),
          ...(dto.effectiveDate && { effectiveDate: dto.effectiveDate }),
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayrollAdjustment', id);
      }
      throw error;
    }
  }

  async markSynced(id: string, simplePayCalcId: string): Promise<PayrollAdjustment> {
    try {
      return await this.prisma.payrollAdjustment.update({
        where: { id },
        data: {
          simplePayCalcId,
          syncedToSimplePay: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayrollAdjustment', id);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.payrollAdjustment.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayrollAdjustment', id);
      }
      throw error;
    }
  }
}
```
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-calculations.service.ts

```typescript
/**
 * SimplePay Calculations Service
 * TASK-SPAY-003: Payslip Calculations Management
 *
 * Manages earnings, deductions, and company contributions via SimplePay API.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { CalculationCacheRepository } from '../../database/repositories/calculation-cache.repository';
import {
  SimplePayItemAndOutput,
  SimplePayCalculation,
  SimplePayPayslipCalculation,
  SimplePayInheritedCalculation,
  CalculationItem,
  Calculation,
  InheritedCalculation,
  CalculationType,
} from '../../database/entities/calculation.entity';
import { CreateCalculationDto, CreatePayslipCalculationDto, UpdateInheritedCalculationDto } from '../../database/dto/calculations.dto';

// Response wrapper types
interface ItemAndOutputWrapper {
  item_and_output: SimplePayItemAndOutput;
}

interface CalculationWrapper {
  calculation: SimplePayCalculation;
}

interface PayslipCalculationWrapper {
  calculation: SimplePayPayslipCalculation;
}

interface InheritedCalculationWrapper {
  inherited_calculation: SimplePayInheritedCalculation;
}

@Injectable()
export class SimplePayCalculationsService {
  private readonly logger = new Logger(SimplePayCalculationsService.name);

  // Cache TTL for calculation items
  private readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly calculationCacheRepo: CalculationCacheRepository,
  ) {}

  // ============================================
  // Calculation Items (Templates)
  // ============================================

  /**
   * Get available calculation items (cached)
   */
  async getCalculationItems(tenantId: string, forceRefresh = false): Promise<CalculationItem[]> {
    // Check cache age
    if (!forceRefresh) {
      const cacheAge = await this.calculationCacheRepo.getCacheAge(tenantId);
      if (cacheAge && Date.now() - cacheAge.getTime() < this.CACHE_TTL_MS) {
        const cached = await this.calculationCacheRepo.findByTenant(tenantId);
        if (cached.length > 0) {
          return cached.map(this.mapCacheToItem);
        }
      }
    }

    // Fetch from SimplePay
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const response = await this.apiClient.get<ItemAndOutputWrapper[]>(
      `/clients/${clientId}/items_and_outputs`,
    );
    const items = response.map(w => this.mapApiItemToCalculationItem(w.item_and_output));

    // Update cache
    await this.calculationCacheRepo.upsertMany(tenantId, items);
    this.logger.debug(`Cached ${items.length} calculation items for tenant ${tenantId}`);

    return items;
  }

  /**
   * Get single calculation item by code
   */
  async getCalculationItem(tenantId: string, itemCode: string): Promise<CalculationItem | null> {
    const cached = await this.calculationCacheRepo.findByCode(tenantId, itemCode);
    if (cached) {
      return this.mapCacheToItem(cached);
    }

    // Refresh cache and try again
    const items = await this.getCalculationItems(tenantId, true);
    return items.find(i => i.code === itemCode) || null;
  }

  // ============================================
  // Employee Calculations (Recurring)
  // ============================================

  /**
   * Get employee's recurring calculations
   */
  async getEmployeeCalculations(tenantId: string, staffId: string): Promise<Calculation[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.get<CalculationWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/calculations`,
    );

    return response.map(w => this.mapApiCalculation(w.calculation));
  }

  /**
   * Create employee calculation
   */
  async createEmployeeCalculation(
    tenantId: string,
    staffId: string,
    dto: CreateCalculationDto,
  ): Promise<Calculation> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.post<CalculationWrapper>(
      `/employees/${mapping.simplePayEmployeeId}/calculations`,
      {
        calculation: {
          item_code: dto.itemCode,
          amount: dto.amount,
          percentage: dto.percentage,
          operation: dto.operation || 'upsert',
          effective_date: dto.effectiveDate,
          end_date: dto.endDate,
        },
      },
    );

    this.logger.log(`Created calculation ${dto.itemCode} for staff ${staffId}`);
    return this.mapApiCalculation(response.calculation);
  }

  /**
   * Get single calculation
   */
  async getCalculation(tenantId: string, calculationId: string): Promise<Calculation> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.get<CalculationWrapper>(
      `/calculations/${calculationId}`,
    );

    return this.mapApiCalculation(response.calculation);
  }

  /**
   * Update calculation
   */
  async updateCalculation(
    tenantId: string,
    calculationId: string,
    dto: Partial<CreateCalculationDto>,
  ): Promise<Calculation> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.patch<CalculationWrapper>(
      `/calculations/${calculationId}`,
      {
        calculation: {
          ...(dto.amount !== undefined && { amount: dto.amount }),
          ...(dto.percentage !== undefined && { percentage: dto.percentage }),
          ...(dto.effectiveDate && { effective_date: dto.effectiveDate }),
          ...(dto.endDate !== undefined && { end_date: dto.endDate }),
        },
      },
    );

    this.logger.log(`Updated calculation ${calculationId}`);
    return this.mapApiCalculation(response.calculation);
  }

  /**
   * Delete calculation
   */
  async deleteCalculation(tenantId: string, calculationId: string): Promise<void> {
    await this.apiClient.initializeForTenant(tenantId);
    await this.apiClient.delete(`/calculations/${calculationId}`);
    this.logger.log(`Deleted calculation ${calculationId}`);
  }

  // ============================================
  // Payslip Calculations (One-time)
  // ============================================

  /**
   * Get payslip calculations
   */
  async getPayslipCalculations(
    tenantId: string,
    payslipId: string,
  ): Promise<SimplePayPayslipCalculation[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.get<PayslipCalculationWrapper[]>(
      `/payslips/${payslipId}/calculations`,
    );

    return response.map(w => w.calculation);
  }

  /**
   * Add one-time calculation to payslip
   */
  async addPayslipCalculation(
    tenantId: string,
    payslipId: string,
    dto: CreatePayslipCalculationDto,
  ): Promise<SimplePayPayslipCalculation> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.post<PayslipCalculationWrapper>(
      `/payslips/${payslipId}/calculations`,
      {
        calculation: {
          item_code: dto.itemCode,
          amount: dto.amount,
          ...(dto.hours && { hours: dto.hours }),
          ...(dto.rate && { rate: dto.rate }),
        },
      },
    );

    this.logger.log(`Added calculation ${dto.itemCode} to payslip ${payslipId}`);
    return response.calculation;
  }

  // ============================================
  // Inherited Calculations
  // ============================================

  /**
   * Get employee's inherited (system) calculations
   */
  async getInheritedCalculations(
    tenantId: string,
    staffId: string,
  ): Promise<InheritedCalculation[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.get<InheritedCalculationWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/inherited_calculations`,
    );

    return response.map(w => this.mapInheritedCalculation(w.inherited_calculation));
  }

  /**
   * Update inherited calculation (e.g., basic salary)
   */
  async updateInheritedCalculation(
    tenantId: string,
    staffId: string,
    dto: UpdateInheritedCalculationDto,
  ): Promise<InheritedCalculation> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.patch<InheritedCalculationWrapper>(
      `/employees/${mapping.simplePayEmployeeId}/inherited_calculations`,
      {
        inherited_calculation: {
          code: dto.code,
          value: dto.value,
          ...(dto.effectiveDate && { effective_date: dto.effectiveDate }),
        },
      },
    );

    this.logger.log(`Updated inherited calculation ${dto.code} for staff ${staffId}`);
    return this.mapInheritedCalculation(response.inherited_calculation);
  }

  // ============================================
  // Mapping Helpers
  // ============================================

  private mapApiItemToCalculationItem(item: SimplePayItemAndOutput): CalculationItem {
    return {
      id: item.id,
      code: item.code,
      name: item.name,
      type: this.mapCalculationType(item.type),
      taxable: item.taxable,
      affectsUif: item.affects_uif,
      category: item.category || null,
    };
  }

  private mapCacheToItem(cache: { code: string; name: string; type: string; taxable: boolean; affectsUif: boolean; category: string | null }): CalculationItem {
    return {
      id: cache.code,
      code: cache.code,
      name: cache.name,
      type: cache.type as CalculationType,
      taxable: cache.taxable,
      affectsUif: cache.affectsUif,
      category: cache.category,
    };
  }

  private mapApiCalculation(calc: SimplePayCalculation): Calculation {
    return {
      id: calc.id,
      itemCode: calc.item_code,
      itemName: calc.item_name,
      type: this.mapCalculationType(calc.type),
      amount: calc.amount,
      percentage: calc.percentage,
      formula: calc.formula,
      effectiveDate: calc.effective_date,
      endDate: calc.end_date,
    };
  }

  private mapInheritedCalculation(calc: SimplePayInheritedCalculation): InheritedCalculation {
    return {
      id: calc.id,
      code: calc.code,
      name: calc.name,
      currentValue: calc.current_value,
      inputsHistory: calc.inputs_history.map(h => ({
        effectiveDate: h.effective_date,
        value: h.value,
      })),
    };
  }

  private mapCalculationType(type: string): CalculationType {
    switch (type) {
      case 'earning':
        return CalculationType.EARNING;
      case 'deduction':
        return CalculationType.DEDUCTION;
      case 'company_contribution':
        return CalculationType.COMPANY_CONTRIBUTION;
      default:
        return CalculationType.EARNING;
    }
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

```typescript
// ============================================
// Calculations Management
// ============================================

@Get('calculation-items')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get available calculation items' })
@ApiResponse({ status: 200, type: [CalculationItemResponseDto] })
@ApiQuery({ name: 'refresh', required: false, description: 'Force refresh cache' })
async getCalculationItems(
  @CurrentUser() user: IUser,
  @Query('refresh') refresh?: string,
): Promise<CalculationItemResponseDto[]> {
  const forceRefresh = refresh === 'true';
  return this.calculationsService.getCalculationItems(user.tenantId, forceRefresh);
}

@Get('calculation-items/:code')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get single calculation item by code' })
@ApiResponse({ status: 200, type: CalculationItemResponseDto })
async getCalculationItem(
  @CurrentUser() user: IUser,
  @Param('code') code: string,
): Promise<CalculationItemResponseDto> {
  const item = await this.calculationsService.getCalculationItem(user.tenantId, code);
  if (!item) {
    throw new NotFoundException(`Calculation item ${code} not found`);
  }
  return item;
}

@Get('employees/:staffId/calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get employee recurring calculations' })
@ApiResponse({ status: 200, type: [CalculationResponseDto] })
async getEmployeeCalculations(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<CalculationResponseDto[]> {
  return this.calculationsService.getEmployeeCalculations(user.tenantId, staffId);
}

@Post('employees/:staffId/calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Create/update employee calculation' })
@ApiResponse({ status: 201, type: CalculationResponseDto })
async createEmployeeCalculation(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: CreateCalculationDto,
): Promise<CalculationResponseDto> {
  return this.calculationsService.createEmployeeCalculation(user.tenantId, staffId, dto);
}

@Get('calculations/:id')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get single calculation' })
@ApiResponse({ status: 200, type: CalculationResponseDto })
async getCalculation(
  @CurrentUser() user: IUser,
  @Param('id') calculationId: string,
): Promise<CalculationResponseDto> {
  return this.calculationsService.getCalculation(user.tenantId, calculationId);
}

@Patch('calculations/:id')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Update calculation' })
@ApiResponse({ status: 200, type: CalculationResponseDto })
async updateCalculation(
  @CurrentUser() user: IUser,
  @Param('id') calculationId: string,
  @Body() dto: Partial<CreateCalculationDto>,
): Promise<CalculationResponseDto> {
  return this.calculationsService.updateCalculation(user.tenantId, calculationId, dto);
}

@Delete('calculations/:id')
@HttpCode(HttpStatus.NO_CONTENT)
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Delete calculation' })
async deleteCalculation(
  @CurrentUser() user: IUser,
  @Param('id') calculationId: string,
): Promise<void> {
  await this.calculationsService.deleteCalculation(user.tenantId, calculationId);
}

@Get('payslips/:payslipId/calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get payslip calculations' })
async getPayslipCalculations(
  @CurrentUser() user: IUser,
  @Param('payslipId') payslipId: string,
): Promise<PayslipCalculationResponseDto[]> {
  return this.calculationsService.getPayslipCalculations(user.tenantId, payslipId);
}

@Post('payslips/:payslipId/calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Add one-time calculation to payslip' })
async addPayslipCalculation(
  @CurrentUser() user: IUser,
  @Param('payslipId') payslipId: string,
  @Body() dto: CreatePayslipCalculationDto,
): Promise<PayslipCalculationResponseDto> {
  return this.calculationsService.addPayslipCalculation(user.tenantId, payslipId, dto);
}

@Get('employees/:staffId/inherited-calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get employee inherited calculations' })
@ApiResponse({ status: 200, type: [InheritedCalculationResponseDto] })
async getInheritedCalculations(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<InheritedCalculationResponseDto[]> {
  return this.calculationsService.getInheritedCalculations(user.tenantId, staffId);
}

@Patch('employees/:staffId/inherited-calculations')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Update inherited calculation (e.g., basic salary)' })
@ApiResponse({ status: 200, type: InheritedCalculationResponseDto })
async updateInheritedCalculation(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: UpdateInheritedCalculationDto,
): Promise<InheritedCalculationResponseDto> {
  return this.calculationsService.updateInheritedCalculation(user.tenantId, staffId, dto);
}
```
</controller_additions>

<module_update>
## Update src/integrations/simplepay/simplepay.module.ts

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from '../../database/database.module';
import { SharedModule } from '../../shared/shared.module';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayConnectionService } from './simplepay-connection.service';
import { SimplePayEmployeeService } from './simplepay-employee.service';
import { SimplePayPayslipService } from './simplepay-payslip.service';
import { SimplePayTaxService } from './simplepay-tax.service';
import { SimplePayPayRunService } from './simplepay-payrun.service';
import { SimplePayCalculationsService } from './simplepay-calculations.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,
    SimplePayCalculationsService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,
    SimplePayCalculationsService,  // ADD
  ],
})
export class SimplePayModule {}
```
</module_update>

<test_cleanup_update>
## UPDATE ALL EXISTING TEST FILES

Add these lines at the TOP of the beforeEach cleanup (in FK order):

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.payrollAdjustment.deleteMany({});  // ADD THIS
  await prisma.calculationItemCache.deleteMany({});  // ADD THIS
  // ... all other existing deleteMany calls ...
});
```

Files to update (search for `deleteMany` in tests/):
- All repository spec files
- All service spec files
- All controller spec files
</test_cleanup_update>

<index_updates>
## Update src/database/entities/index.ts
Add at end:
```typescript
export * from './calculation.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './calculations.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './calculation-cache.repository';
export * from './payroll-adjustment.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-calculations.service.spec.ts (18+ tests)
Test scenarios:
- getCalculationItems: returns items from API, caches items, returns from cache, force refresh
- getCalculationItem: returns single item, returns null for unknown
- getEmployeeCalculations: returns calculations, throws if not synced
- createEmployeeCalculation: creates calculation, uses correct operation
- getCalculation: returns calculation
- updateCalculation: updates calculation fields
- deleteCalculation: deletes calculation
- getPayslipCalculations: returns payslip calculations
- addPayslipCalculation: adds one-time calculation
- getInheritedCalculations: returns inherited calculations
- updateInheritedCalculation: updates with effective date

### tests/database/repositories/calculation-cache.repository.spec.ts (8+ tests)
Test scenarios:
- upsertMany: inserts new items, updates existing
- findByTenant: returns all cached items
- findByCode: returns single item, returns null for unknown
- findByType: filters by calculation type
- getCacheAge: returns oldest cache date, returns null if empty
- deleteByTenant: removes all cached items

### tests/database/repositories/payroll-adjustment.repository.spec.ts (10+ tests)
Test scenarios:
- create: creates with all fields
- findById: exists, not found
- findByStaff: returns staff adjustments, filters by type
- findByTenant: returns tenant adjustments
- findActiveByStaff: returns only active adjustments (date range)
- update: updates fields
- markSynced: sets SimplePay ID and flag
- delete: removes record

Use REAL test data (South African payroll context):
```typescript
const testCalculationItem = {
  code: 'BONUS',
  name: 'Annual Bonus',
  type: CalculationType.EARNING,
  taxable: true,
  affectsUif: false,
  category: 'variable_earning',
};

const testPayrollAdjustment = {
  tenantId: '', // set in beforeEach
  staffId: '', // set in beforeEach
  itemCode: 'BONUS',
  itemName: 'Annual Bonus',
  type: CalculationType.EARNING,
  amountCents: 1000000, // R10,000
  percentage: null,
  isRecurring: false,
  effectiveDate: new Date('2026-01-01'),
  endDate: null,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_calculation_tables

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/calculation.entity.ts

# 5. Create DTO file
# Create src/database/dto/calculations.dto.ts

# 6. Create repository files
# Create src/database/repositories/calculation-cache.repository.ts
# Create src/database/repositories/payroll-adjustment.repository.ts

# 7. Create service file
# Create src/integrations/simplepay/simplepay-calculations.service.ts

# 8. Update module file
# Update src/integrations/simplepay/simplepay.module.ts

# 9. Update controller file
# Add endpoints to src/api/integrations/simplepay.controller.ts

# 10. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 11. Update existing test files (ALL of them)
# Add payrollAdjustment.deleteMany and calculationItemCache.deleteMany to cleanup

# 12. Create test files
# Create tests/integrations/simplepay/simplepay-calculations.service.spec.ts
# Create tests/database/repositories/calculation-cache.repository.spec.ts
# Create tests/database/repositories/payroll-adjustment.repository.spec.ts

# 13. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 435+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys
    - Must include tenantId FK on all models
    - SimplePay API responses are wrapped (e.g., { calculation: {...} })
    - Calculation items are cached for 1 hour to reduce API calls
    - Amounts stored in cents (integer) in database
    - Percentage values stored as Decimal(5,2)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 435+ tests passing
    - Migration applies and can be reverted
    - Calculation item retrieval works (cached)
    - Employee calculation CRUD works
    - Payslip one-time calculation works
    - Inherited calculation update works
    - Local payroll adjustment tracking works
    - Tenant isolation enforced on all queries
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Import enums from `@prisma/client` in DTOs (import from entity file)
  - Use `string?` in interfaces (use `string | null`)
  - Run tests without `--runInBand` flag
  - Skip updating existing test cleanup order
  - Create mock/stub implementations
  - Call SimplePay API without initializing for tenant first
  - Forget to unwrap SimplePay API responses
  - Store amounts as decimals (use cents as integers)
  - Skip the npx prisma generate step
  - Confuse operation types (insert = one-time, upsert = update if exists)
</anti_patterns>

</task_spec>

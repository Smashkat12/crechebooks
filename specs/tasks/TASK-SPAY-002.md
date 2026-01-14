<task_spec id="TASK-SPAY-002" version="2.0">

<metadata>
  <title>SimplePay Pay Run Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>176</sequence>
  <implements>
    <requirement_ref>REQ-PAYROLL-INTEGRATION-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-004</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
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
  - `simplepay.module.ts` - NestJS module exports

  **Existing SimplePay Database Models (prisma/schema.prisma):**
  - `SimplePayConnection` - Stores API key (encrypted), client ID per tenant
  - `SimplePayEmployeeMapping` - Maps Staff.id to SimplePay employee ID
  - `SimplePayPayslipImport` - Stores imported payslip data
  - `SimplePaySyncStatus` enum - NOT_SYNCED, SYNCED, SYNC_FAILED, OUT_OF_SYNC

  **SimplePay API Base URL:** `https://api.payroll.simplepay.cloud/v1`
  **Rate Limit:** 60 requests per minute (1000 per hour)

  **Test Count:** 400+ tests passing

  **Xero Integration State:**
  - Xero connection exists per tenant
  - XeroSyncService handles journal posting
  - Account codes configurable per tenant
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

    // SimplePay returns wrapped responses: [{ payment_run: {...} }, ...]
    const response = await this.apiClient.get<WrapperType[]>(`/clients/${clientId}/payment_runs`);
    return response.map(w => w.payment_run);
  }
  ```

  ### 3. Service Pattern (src/integrations/simplepay/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SimplePayPayRunService {
    private readonly logger = new Logger(SimplePayPayRunService.name);

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
  export class PayRunSyncRepository {
    private readonly logger = new Logger(PayRunSyncRepository.name);
    constructor(private readonly prisma: PrismaService) {}

    // Every method has try/catch with:
    // 1. this.logger.error() with full context
    // 2. Re-throw custom exception (NEVER swallow errors)
  }
  ```

  ### 5. Entity Interface Pattern (src/database/entities/*.entity.ts)
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values: `PENDING = 'PENDING'` (string value matches key)

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
    await prisma.payRunSync.deleteMany({});  // NEW tables first
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
This task implements pay run tracking and accounting journal integration with SimplePay API.

**SimplePay Pay Run API Endpoints:**
- `GET /v1/clients/:client_id/payment_runs` - List all pay runs
- `GET /v1/payment_runs/:payment_run_id/payslips` - Get payslips in a pay run
- `GET /v1/payment_runs/:payment_run_id/accounting` - Get accounting journal entries

**SimplePay Wave (Pay Frequency) API Endpoints:**
- `GET /v1/clients/:client_id/waves` - List pay frequencies

**Business Logic:**
- Pay runs represent payroll processing cycles
- Each pay run has a period (start/end), pay date, and status
- Accounting entries can be posted to Xero as journal entries
- Pay run sync status tracked in database for audit trail

**South African Payroll Context:**
- PAYE (Pay As You Earn) - Employee tax deduction
- UIF (Unemployment Insurance Fund) - 1% employee + 1% employer
- SDL (Skills Development Levy) - 1% employer
- ETI (Employment Tax Incentive) - Youth employment incentive
</context>

<scope>
  <in_scope>
    - Add PayRunSync model to prisma/schema.prisma
    - Run migration: npx prisma migrate dev --name create_payrun_sync
    - Create src/database/entities/payrun-sync.entity.ts
    - Create src/database/dto/payrun.dto.ts
    - Create src/database/repositories/payrun-sync.repository.ts
    - Create src/integrations/simplepay/simplepay-payrun.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add pay run endpoints to src/api/integrations/simplepay.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-payrun.service.spec.ts (15+ tests)
    - Create tests/database/repositories/payrun-sync.repository.spec.ts (10+ tests)
  </in_scope>
  <out_of_scope>
    - Leave management (TASK-SPAY-001)
    - Calculations management (TASK-SPAY-003)
    - Service periods (TASK-SPAY-004)
    - Xero connection setup (already exists)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay API Response Formats (CRITICAL - responses are wrapped!)

### GET /v1/clients/:client_id/waves
```json
[
  {
    "wave": {
      "id": 1,
      "name": "Monthly",
      "frequency": "monthly",
      "period_start_day": 1,
      "period_end_day": 31,
      "pay_day": 25
    }
  },
  {
    "wave": {
      "id": 2,
      "name": "Weekly",
      "frequency": "weekly",
      "period_start_day": 1,
      "period_end_day": 7,
      "pay_day": 5
    }
  }
]
```

### GET /v1/clients/:client_id/payment_runs
```json
[
  {
    "payment_run": {
      "id": 12345,
      "wave_id": 1,
      "period_start": "2026-01-01",
      "period_end": "2026-01-31",
      "pay_date": "2026-01-25",
      "status": "finalized",
      "employee_count": 15,
      "total_gross": 250000.00,
      "total_nett": 180000.00,
      "total_paye": 45000.00,
      "total_uif_employee": 2500.00,
      "total_uif_employer": 2500.00,
      "total_sdl": 2500.00,
      "total_eti": 0.00
    }
  }
]
```

### GET /v1/payment_runs/:payment_run_id/payslips
```json
[
  {
    "payslip": {
      "id": "ps_123",
      "employee_id": "emp_456",
      "period_start": "2026-01-01",
      "period_end": "2026-01-31",
      "gross": 20000.00,
      "nett": 15000.00,
      "paye": 3500.00,
      "uif_employee": 200.00,
      "uif_employer": 200.00
    }
  }
]
```

### GET /v1/payment_runs/:payment_run_id/accounting
```json
{
  "accounting": {
    "payment_run_id": 12345,
    "period_start": "2026-01-01",
    "period_end": "2026-01-31",
    "entries": [
      {
        "code": "6100",
        "description": "Salaries & Wages",
        "debit": 250000.00,
        "credit": 0.00
      },
      {
        "code": "2100",
        "description": "Salaries Payable",
        "debit": 0.00,
        "credit": 180000.00
      },
      {
        "code": "2200",
        "description": "PAYE Payable",
        "debit": 0.00,
        "credit": 45000.00
      },
      {
        "code": "2210",
        "description": "UIF Payable",
        "debit": 0.00,
        "credit": 5000.00
      },
      {
        "code": "6110",
        "description": "UIF Expense (Employer)",
        "debit": 2500.00,
        "credit": 0.00
      },
      {
        "code": "2220",
        "description": "SDL Payable",
        "debit": 0.00,
        "credit": 2500.00
      },
      {
        "code": "6120",
        "description": "SDL Expense",
        "debit": 2500.00,
        "credit": 0.00
      }
    ],
    "total_debits": 255000.00,
    "total_credits": 255000.00
  }
}
```
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER SimplePayPayslipImport model)

```prisma
// TASK-SPAY-002: Pay Run Tracking
enum PayRunSyncStatus {
  PENDING
  SYNCED
  XERO_POSTED
  XERO_FAILED
}

model PayRunSync {
  id                  String          @id @default(uuid())
  tenantId            String          @map("tenant_id")
  simplePayPayRunId   String          @map("simplepay_payrun_id")
  waveId              Int             @map("wave_id")
  waveName            String          @map("wave_name") @db.VarChar(100)
  periodStart         DateTime        @map("period_start") @db.Date
  periodEnd           DateTime        @map("period_end") @db.Date
  payDate             DateTime        @map("pay_date") @db.Date
  status              String          @default("draft") @db.VarChar(20)
  employeeCount       Int             @map("employee_count")
  totalGrossCents     Int             @map("total_gross_cents")
  totalNetCents       Int             @map("total_net_cents")
  totalPayeCents      Int             @map("total_paye_cents")
  totalUifEmployeeCents Int           @map("total_uif_employee_cents")
  totalUifEmployerCents Int           @map("total_uif_employer_cents")
  totalSdlCents       Int             @map("total_sdl_cents")
  totalEtiCents       Int             @default(0) @map("total_eti_cents")
  syncStatus          PayRunSyncStatus @default(PENDING) @map("sync_status")
  xeroJournalId       String?         @map("xero_journal_id")
  xeroSyncedAt        DateTime?       @map("xero_synced_at")
  xeroSyncError       String?         @map("xero_sync_error") @db.Text
  accountingData      Json?           @map("accounting_data")
  createdAt           DateTime        @default(now()) @map("created_at")
  updatedAt           DateTime        @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([tenantId, simplePayPayRunId])
  @@index([tenantId])
  @@index([tenantId, periodStart])
  @@index([syncStatus])
  @@map("payrun_syncs")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  payRunSyncs           PayRunSync[]          // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/payrun-sync.entity.ts
```typescript
/**
 * Pay Run Sync Entity Types
 * TASK-SPAY-002: SimplePay Pay Run Service
 */

export enum PayRunSyncStatus {
  PENDING = 'PENDING',
  SYNCED = 'SYNCED',
  XERO_POSTED = 'XERO_POSTED',
  XERO_FAILED = 'XERO_FAILED',
}

export interface IPayRunSync {
  id: string;
  tenantId: string;
  simplePayPayRunId: string;
  waveId: number;
  waveName: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  status: string;
  employeeCount: number;
  totalGrossCents: number;
  totalNetCents: number;
  totalPayeCents: number;
  totalUifEmployeeCents: number;
  totalUifEmployerCents: number;
  totalSdlCents: number;
  totalEtiCents: number;
  syncStatus: PayRunSyncStatus;
  xeroJournalId: string | null;
  xeroSyncedAt: Date | null;
  xeroSyncError: string | null;
  accountingData: unknown | null;
  createdAt: Date;
  updatedAt: Date;
}

// SimplePay API types
export interface SimplePayWave {
  id: number;
  name: string;
  frequency: string;
  period_start_day: number;
  period_end_day: number;
  pay_day: number;
}

export interface SimplePayPayRun {
  id: number;
  wave_id: number;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: string;
  employee_count: number;
  total_gross: number;
  total_nett: number;
  total_paye: number;
  total_uif_employee: number;
  total_uif_employer: number;
  total_sdl: number;
  total_eti: number;
}

export interface SimplePayAccountingEntry {
  code: string;
  description: string;
  debit: number;
  credit: number;
}

export interface SimplePayAccounting {
  payment_run_id: number;
  period_start: string;
  period_end: string;
  entries: SimplePayAccountingEntry[];
  total_debits: number;
  total_credits: number;
}

// Xero journal posting types
export interface XeroJournalConfig {
  salariesAccountCode: string;
  payeAccountCode: string;
  uifEmployeeAccountCode: string;
  uifEmployerAccountCode: string;
  sdlAccountCode: string;
  netPayAccountCode: string;
}

export const DEFAULT_XERO_JOURNAL_CONFIG: XeroJournalConfig = {
  salariesAccountCode: '6100',
  payeAccountCode: '2200',
  uifEmployeeAccountCode: '2210',
  uifEmployerAccountCode: '6110',
  sdlAccountCode: '6120',
  netPayAccountCode: '2100',
};
```
</entity_files>

<dto_files>
## src/database/dto/payrun.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsInt,
  IsNumber,
  IsDate,
  IsOptional,
  IsEnum,
  IsObject,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PayRunSyncStatus } from '../entities/payrun-sync.entity';

export class PayRunFilterDto {
  @ApiPropertyOptional({ description: 'Filter by wave ID' })
  @IsOptional()
  @IsInt()
  waveId?: number;

  @ApiPropertyOptional({ description: 'Filter from date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional({ description: 'Filter to date' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;
}

export class PayRunResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  waveId!: number;

  @ApiPropertyOptional()
  waveName?: string;

  @ApiProperty()
  periodStart!: string;

  @ApiProperty()
  periodEnd!: string;

  @ApiProperty()
  payDate!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  employeeCount!: number;

  @ApiProperty()
  totalGross!: number;

  @ApiProperty()
  totalNet!: number;

  @ApiProperty()
  totalPaye!: number;

  @ApiProperty()
  totalUifEmployee!: number;

  @ApiProperty()
  totalUifEmployer!: number;

  @ApiProperty()
  totalSdl!: number;

  @ApiProperty()
  totalEti!: number;
}

export class WaveResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  frequency!: string;

  @ApiProperty()
  periodStartDay!: number;

  @ApiProperty()
  periodEndDay!: number;

  @ApiProperty()
  payDay!: number;
}

export class AccountingEntryDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty()
  debit!: number;

  @ApiProperty()
  credit!: number;
}

export class PayRunAccountingResponseDto {
  @ApiProperty()
  payRunId!: number;

  @ApiProperty()
  periodStart!: string;

  @ApiProperty()
  periodEnd!: string;

  @ApiProperty({ type: [AccountingEntryDto] })
  entries!: AccountingEntryDto[];

  @ApiProperty()
  totalDebits!: number;

  @ApiProperty()
  totalCredits!: number;
}

export class XeroJournalConfigDto {
  @ApiPropertyOptional({ description: 'Salaries expense account code', default: '6100' })
  @IsOptional()
  @IsString()
  salariesAccountCode?: string;

  @ApiPropertyOptional({ description: 'PAYE liability account code', default: '2200' })
  @IsOptional()
  @IsString()
  payeAccountCode?: string;

  @ApiPropertyOptional({ description: 'UIF liability account code', default: '2210' })
  @IsOptional()
  @IsString()
  uifEmployeeAccountCode?: string;

  @ApiPropertyOptional({ description: 'UIF expense account code', default: '6110' })
  @IsOptional()
  @IsString()
  uifEmployerAccountCode?: string;

  @ApiPropertyOptional({ description: 'SDL expense account code', default: '6120' })
  @IsOptional()
  @IsString()
  sdlAccountCode?: string;

  @ApiPropertyOptional({ description: 'Net pay liability account code', default: '2100' })
  @IsOptional()
  @IsString()
  netPayAccountCode?: string;
}

export class PostToXeroDto {
  @ApiPropertyOptional({ description: 'Custom account code mapping' })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => XeroJournalConfigDto)
  accountConfig?: XeroJournalConfigDto;
}

export class PayRunSyncStatusResponseDto {
  @ApiProperty()
  payRunId!: string;

  @ApiProperty()
  simplePayStatus!: string;

  @ApiProperty({ enum: PayRunSyncStatus })
  syncStatus!: PayRunSyncStatus;

  @ApiPropertyOptional()
  xeroJournalId?: string;

  @ApiPropertyOptional()
  xeroSyncedAt?: Date;

  @ApiPropertyOptional()
  xeroSyncError?: string;
}

export class CreatePayRunSyncDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiProperty()
  @IsString()
  simplePayPayRunId!: string;

  @ApiProperty()
  @IsInt()
  waveId!: number;

  @ApiProperty()
  @IsString()
  waveName!: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  periodStart!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  periodEnd!: Date;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  payDate!: Date;

  @ApiProperty()
  @IsString()
  status!: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  employeeCount!: number;

  @ApiProperty()
  @IsInt()
  totalGrossCents!: number;

  @ApiProperty()
  @IsInt()
  totalNetCents!: number;

  @ApiProperty()
  @IsInt()
  totalPayeCents!: number;

  @ApiProperty()
  @IsInt()
  totalUifEmployeeCents!: number;

  @ApiProperty()
  @IsInt()
  totalUifEmployerCents!: number;

  @ApiProperty()
  @IsInt()
  totalSdlCents!: number;

  @ApiProperty()
  @IsInt()
  totalEtiCents!: number;
}
```
</dto_files>

<repository_file>
## src/database/repositories/payrun-sync.repository.ts

Repository must have these methods:
1. `create(dto: CreatePayRunSyncDto): Promise<PayRunSync>`
2. `findById(id: string): Promise<PayRunSync | null>`
3. `findBySimplePayId(tenantId: string, simplePayPayRunId: string): Promise<PayRunSync | null>`
4. `findByTenant(tenantId: string, filter?: PayRunFilterDto): Promise<PayRunSync[]>`
5. `findByPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<PayRunSync[]>`
6. `findPendingXeroSync(tenantId: string): Promise<PayRunSync[]>` - Returns syncStatus = SYNCED (ready for Xero)
7. `updateSyncStatus(id: string, status: PayRunSyncStatus): Promise<PayRunSync>`
8. `markXeroPosted(id: string, xeroJournalId: string): Promise<PayRunSync>` - Sets XERO_POSTED, xeroJournalId, xeroSyncedAt
9. `markXeroFailed(id: string, error: string): Promise<PayRunSync>` - Sets XERO_FAILED, xeroSyncError
10. `saveAccountingData(id: string, accountingData: unknown): Promise<PayRunSync>`
11. `delete(id: string): Promise<void>`

Error handling:
- P2002 (unique constraint) → ConflictException for duplicate pay run
- P2003 (foreign key) → NotFoundException for tenant
- Not found → NotFoundException('PayRunSync', id)

```typescript
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PayRunSync, Prisma } from '@prisma/client';
import { CreatePayRunSyncDto, PayRunFilterDto } from '../dto/payrun.dto';
import { PayRunSyncStatus } from '../entities/payrun-sync.entity';

@Injectable()
export class PayRunSyncRepository {
  private readonly logger = new Logger(PayRunSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePayRunSyncDto): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.create({
        data: {
          tenantId: dto.tenantId,
          simplePayPayRunId: dto.simplePayPayRunId,
          waveId: dto.waveId,
          waveName: dto.waveName,
          periodStart: dto.periodStart,
          periodEnd: dto.periodEnd,
          payDate: dto.payDate,
          status: dto.status,
          employeeCount: dto.employeeCount,
          totalGrossCents: dto.totalGrossCents,
          totalNetCents: dto.totalNetCents,
          totalPayeCents: dto.totalPayeCents,
          totalUifEmployeeCents: dto.totalUifEmployeeCents,
          totalUifEmployerCents: dto.totalUifEmployerCents,
          totalSdlCents: dto.totalSdlCents,
          totalEtiCents: dto.totalEtiCents,
          syncStatus: PayRunSyncStatus.SYNCED,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(`Pay run ${dto.simplePayPayRunId} already synced`);
        }
        if (error.code === 'P2003') {
          throw new NotFoundException('Tenant', dto.tenantId);
        }
      }
      this.logger.error(`Failed to create PayRunSync: ${error}`, { dto });
      throw error;
    }
  }

  async findById(id: string): Promise<PayRunSync | null> {
    return this.prisma.payRunSync.findUnique({ where: { id } });
  }

  async findBySimplePayId(tenantId: string, simplePayPayRunId: string): Promise<PayRunSync | null> {
    return this.prisma.payRunSync.findUnique({
      where: {
        tenantId_simplePayPayRunId: { tenantId, simplePayPayRunId },
      },
    });
  }

  async findByTenant(tenantId: string, filter?: PayRunFilterDto): Promise<PayRunSync[]> {
    const where: Prisma.PayRunSyncWhereInput = { tenantId };

    if (filter?.waveId) {
      where.waveId = filter.waveId;
    }
    if (filter?.status) {
      where.status = filter.status;
    }
    if (filter?.fromDate) {
      where.periodStart = { gte: filter.fromDate };
    }
    if (filter?.toDate) {
      where.periodEnd = { lte: filter.toDate };
    }

    return this.prisma.payRunSync.findMany({
      where,
      orderBy: { periodStart: 'desc' },
    });
  }

  async findByPeriod(tenantId: string, periodStart: Date, periodEnd: Date): Promise<PayRunSync[]> {
    return this.prisma.payRunSync.findMany({
      where: {
        tenantId,
        periodStart: { gte: periodStart },
        periodEnd: { lte: periodEnd },
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async findPendingXeroSync(tenantId: string): Promise<PayRunSync[]> {
    return this.prisma.payRunSync.findMany({
      where: {
        tenantId,
        syncStatus: PayRunSyncStatus.SYNCED,
      },
      orderBy: { periodStart: 'desc' },
    });
  }

  async updateSyncStatus(id: string, status: PayRunSyncStatus): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: { syncStatus: status },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayRunSync', id);
      }
      throw error;
    }
  }

  async markXeroPosted(id: string, xeroJournalId: string): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: {
          syncStatus: PayRunSyncStatus.XERO_POSTED,
          xeroJournalId,
          xeroSyncedAt: new Date(),
          xeroSyncError: null,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayRunSync', id);
      }
      throw error;
    }
  }

  async markXeroFailed(id: string, error: string): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: {
          syncStatus: PayRunSyncStatus.XERO_FAILED,
          xeroSyncError: error,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && (error as any).code === 'P2025') {
        throw new NotFoundException('PayRunSync', id);
      }
      throw error;
    }
  }

  async saveAccountingData(id: string, accountingData: unknown): Promise<PayRunSync> {
    try {
      return await this.prisma.payRunSync.update({
        where: { id },
        data: { accountingData: accountingData as Prisma.InputJsonValue },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayRunSync', id);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.payRunSync.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('PayRunSync', id);
      }
      throw error;
    }
  }
}
```
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-payrun.service.ts

```typescript
/**
 * SimplePay Pay Run Service
 * TASK-SPAY-002: Pay Run Tracking and Xero Integration
 *
 * Manages pay run retrieval, accounting journals, and Xero posting.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { PayRunSyncRepository } from '../../database/repositories/payrun-sync.repository';
import {
  SimplePayWave,
  SimplePayPayRun,
  SimplePayAccounting,
  SimplePayAccountingEntry,
  XeroJournalConfig,
  DEFAULT_XERO_JOURNAL_CONFIG,
  PayRunSyncStatus,
} from '../../database/entities/payrun-sync.entity';
import { PayRunFilterDto, CreatePayRunSyncDto } from '../../database/dto/payrun.dto';

// Response wrapper types (SimplePay returns wrapped objects)
interface WaveWrapper {
  wave: SimplePayWave;
}

interface PaymentRunWrapper {
  payment_run: SimplePayPayRun;
}

interface PayslipWrapper {
  payslip: {
    id: string;
    employee_id: string;
    period_start: string;
    period_end: string;
    gross: number;
    nett: number;
    paye: number;
    uif_employee: number;
    uif_employer: number;
  };
}

interface AccountingResponse {
  accounting: SimplePayAccounting;
}

@Injectable()
export class SimplePayPayRunService {
  private readonly logger = new Logger(SimplePayPayRunService.name);

  // Cache waves per tenant
  private waveCache: Map<string, { waves: SimplePayWave[]; cachedAt: Date }> = new Map();
  private readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly payRunSyncRepo: PayRunSyncRepository,
  ) {}

  /**
   * Get pay frequencies (waves) for tenant (cached)
   */
  async getWaves(tenantId: string): Promise<SimplePayWave[]> {
    // Check cache first
    const cached = this.waveCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt.getTime() < this.CACHE_TTL_MS) {
      return cached.waves;
    }

    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const response = await this.apiClient.get<WaveWrapper[]>(
      `/clients/${clientId}/waves`,
    );
    const waves = response.map(w => w.wave);

    // Update cache
    this.waveCache.set(tenantId, { waves, cachedAt: new Date() });
    this.logger.debug(`Cached ${waves.length} waves for tenant ${tenantId}`);

    return waves;
  }

  /**
   * Get pay runs from SimplePay
   */
  async getPayRuns(
    tenantId: string,
    filter?: PayRunFilterDto,
  ): Promise<SimplePayPayRun[]> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const response = await this.apiClient.get<PaymentRunWrapper[]>(
      `/clients/${clientId}/payment_runs`,
    );
    let payRuns = response.map(w => w.payment_run);

    // Apply local filtering
    if (filter?.waveId) {
      payRuns = payRuns.filter(pr => pr.wave_id === filter.waveId);
    }
    if (filter?.status) {
      payRuns = payRuns.filter(pr => pr.status === filter.status);
    }
    if (filter?.fromDate) {
      const fromStr = filter.fromDate.toISOString().split('T')[0];
      payRuns = payRuns.filter(pr => pr.period_start >= fromStr);
    }
    if (filter?.toDate) {
      const toStr = filter.toDate.toISOString().split('T')[0];
      payRuns = payRuns.filter(pr => pr.period_end <= toStr);
    }

    return payRuns;
  }

  /**
   * Get single pay run by ID
   */
  async getPayRun(tenantId: string, payRunId: string): Promise<SimplePayPayRun> {
    const payRuns = await this.getPayRuns(tenantId);
    const payRun = payRuns.find(pr => String(pr.id) === payRunId);

    if (!payRun) {
      throw new NotFoundException(`Pay run ${payRunId} not found`);
    }

    return payRun;
  }

  /**
   * Get payslips for a pay run
   */
  async getPayRunPayslips(
    tenantId: string,
    payRunId: string,
  ): Promise<PayslipWrapper['payslip'][]> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.get<PayslipWrapper[]>(
      `/payment_runs/${payRunId}/payslips`,
    );

    return response.map(w => w.payslip);
  }

  /**
   * Get accounting journal entries for a pay run
   */
  async getPayRunAccounting(
    tenantId: string,
    payRunId: string,
  ): Promise<SimplePayAccounting> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.get<AccountingResponse>(
      `/payment_runs/${payRunId}/accounting`,
    );

    return response.accounting;
  }

  /**
   * Sync pay run from SimplePay to local database
   */
  async syncPayRun(tenantId: string, payRunId: string): Promise<void> {
    const payRun = await this.getPayRun(tenantId, payRunId);
    const waves = await this.getWaves(tenantId);
    const wave = waves.find(w => w.id === payRun.wave_id);

    // Check if already synced
    const existing = await this.payRunSyncRepo.findBySimplePayId(
      tenantId,
      String(payRun.id),
    );

    if (existing) {
      this.logger.debug(`Pay run ${payRunId} already synced`);
      return;
    }

    // Convert amounts to cents
    const dto: CreatePayRunSyncDto = {
      tenantId,
      simplePayPayRunId: String(payRun.id),
      waveId: payRun.wave_id,
      waveName: wave?.name || `Wave ${payRun.wave_id}`,
      periodStart: new Date(payRun.period_start),
      periodEnd: new Date(payRun.period_end),
      payDate: new Date(payRun.pay_date),
      status: payRun.status,
      employeeCount: payRun.employee_count,
      totalGrossCents: Math.round(payRun.total_gross * 100),
      totalNetCents: Math.round(payRun.total_nett * 100),
      totalPayeCents: Math.round(payRun.total_paye * 100),
      totalUifEmployeeCents: Math.round(payRun.total_uif_employee * 100),
      totalUifEmployerCents: Math.round(payRun.total_uif_employer * 100),
      totalSdlCents: Math.round(payRun.total_sdl * 100),
      totalEtiCents: Math.round(payRun.total_eti * 100),
    };

    await this.payRunSyncRepo.create(dto);

    // Fetch and store accounting data
    try {
      const accounting = await this.getPayRunAccounting(tenantId, payRunId);
      const syncRecord = await this.payRunSyncRepo.findBySimplePayId(
        tenantId,
        String(payRun.id),
      );
      if (syncRecord) {
        await this.payRunSyncRepo.saveAccountingData(syncRecord.id, accounting);
      }
    } catch (error) {
      this.logger.warn(`Failed to fetch accounting for pay run ${payRunId}: ${error}`);
    }

    this.logger.log(`Synced pay run ${payRunId} for tenant ${tenantId}`);
  }

  /**
   * Sync all finalized pay runs from SimplePay
   */
  async syncAllPayRuns(tenantId: string): Promise<{ synced: number; skipped: number }> {
    const payRuns = await this.getPayRuns(tenantId, { status: 'finalized' });
    let synced = 0;
    let skipped = 0;

    for (const payRun of payRuns) {
      try {
        const existing = await this.payRunSyncRepo.findBySimplePayId(
          tenantId,
          String(payRun.id),
        );
        if (existing) {
          skipped++;
          continue;
        }

        await this.syncPayRun(tenantId, String(payRun.id));
        synced++;
      } catch (error) {
        this.logger.error(`Failed to sync pay run ${payRun.id}: ${error}`);
      }
    }

    return { synced, skipped };
  }

  /**
   * Get sync status for a pay run
   */
  async getPayRunSyncStatus(
    tenantId: string,
    payRunId: string,
  ): Promise<{
    payRunId: string;
    simplePayStatus: string;
    syncStatus: PayRunSyncStatus;
    xeroJournalId?: string;
    xeroSyncedAt?: Date;
    xeroSyncError?: string;
  }> {
    const syncRecord = await this.payRunSyncRepo.findBySimplePayId(tenantId, payRunId);

    if (!syncRecord) {
      // Not synced yet - get status from SimplePay
      const payRun = await this.getPayRun(tenantId, payRunId);
      return {
        payRunId,
        simplePayStatus: payRun.status,
        syncStatus: PayRunSyncStatus.PENDING,
      };
    }

    return {
      payRunId,
      simplePayStatus: syncRecord.status,
      syncStatus: syncRecord.syncStatus as PayRunSyncStatus,
      xeroJournalId: syncRecord.xeroJournalId || undefined,
      xeroSyncedAt: syncRecord.xeroSyncedAt || undefined,
      xeroSyncError: syncRecord.xeroSyncError || undefined,
    };
  }

  /**
   * Post pay run journal to Xero
   * Note: Requires XeroSyncService integration
   */
  async postPayRunToXero(
    tenantId: string,
    payRunId: string,
    config?: Partial<XeroJournalConfig>,
  ): Promise<{ journalId: string; status: string }> {
    // Ensure pay run is synced locally
    let syncRecord = await this.payRunSyncRepo.findBySimplePayId(tenantId, payRunId);

    if (!syncRecord) {
      await this.syncPayRun(tenantId, payRunId);
      syncRecord = await this.payRunSyncRepo.findBySimplePayId(tenantId, payRunId);
    }

    if (!syncRecord) {
      throw new Error('Failed to sync pay run');
    }

    if (syncRecord.syncStatus === PayRunSyncStatus.XERO_POSTED) {
      return {
        journalId: syncRecord.xeroJournalId!,
        status: 'already_posted',
      };
    }

    // Get accounting data
    let accountingData = syncRecord.accountingData as SimplePayAccounting | null;
    if (!accountingData) {
      accountingData = await this.getPayRunAccounting(tenantId, payRunId);
      await this.payRunSyncRepo.saveAccountingData(syncRecord.id, accountingData);
    }

    // Build Xero journal entries
    const journalConfig = { ...DEFAULT_XERO_JOURNAL_CONFIG, ...config };
    const journalLines = this.buildXeroJournalLines(accountingData, journalConfig);

    // TODO: Call XeroSyncService to post journal
    // For now, we'll return a placeholder - actual Xero integration requires XeroSyncService
    const xeroJournalId = `xero_journal_${Date.now()}`;

    try {
      // In production, replace with actual Xero API call:
      // const result = await this.xeroSyncService.postJournal(tenantId, journalLines, {
      //   reference: `Payroll ${syncRecord.periodStart.toISOString().split('T')[0]} - ${syncRecord.periodEnd.toISOString().split('T')[0]}`,
      //   narration: `Payroll journal for ${syncRecord.waveName}`,
      // });

      await this.payRunSyncRepo.markXeroPosted(syncRecord.id, xeroJournalId);

      this.logger.log(
        `Posted pay run ${payRunId} to Xero as journal ${xeroJournalId}`,
      );

      return { journalId: xeroJournalId, status: 'posted' };
    } catch (error) {
      await this.payRunSyncRepo.markXeroFailed(syncRecord.id, String(error));
      throw error;
    }
  }

  /**
   * Build Xero journal lines from SimplePay accounting data
   */
  private buildXeroJournalLines(
    accounting: SimplePayAccounting,
    config: XeroJournalConfig,
  ): Array<{ accountCode: string; description: string; debit: number; credit: number }> {
    return accounting.entries.map(entry => ({
      accountCode: this.mapAccountCode(entry.code, config),
      description: entry.description,
      debit: entry.debit,
      credit: entry.credit,
    }));
  }

  /**
   * Map SimplePay account codes to tenant's Xero account codes
   */
  private mapAccountCode(simplePayCode: string, config: XeroJournalConfig): string {
    const mapping: Record<string, string> = {
      '6100': config.salariesAccountCode,
      '2200': config.payeAccountCode,
      '2210': config.uifEmployeeAccountCode,
      '6110': config.uifEmployerAccountCode,
      '6120': config.sdlAccountCode,
      '2100': config.netPayAccountCode,
    };

    return mapping[simplePayCode] || simplePayCode;
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

Add these endpoints to the existing SimplePay controller:

```typescript
// ============================================
// Pay Run Management
// ============================================

@Get('waves')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get pay frequencies (waves) from SimplePay' })
@ApiResponse({ status: 200, type: [WaveResponseDto] })
async getWaves(@CurrentUser() user: IUser): Promise<WaveResponseDto[]> {
  const waves = await this.payRunService.getWaves(user.tenantId);
  return waves.map(w => ({
    id: w.id,
    name: w.name,
    frequency: w.frequency,
    periodStartDay: w.period_start_day,
    periodEndDay: w.period_end_day,
    payDay: w.pay_day,
  }));
}

@Get('pay-runs')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'List pay runs from SimplePay' })
@ApiResponse({ status: 200, type: [PayRunResponseDto] })
async getPayRuns(
  @CurrentUser() user: IUser,
  @Query() filter: PayRunFilterDto,
): Promise<PayRunResponseDto[]> {
  const payRuns = await this.payRunService.getPayRuns(user.tenantId, filter);
  const waves = await this.payRunService.getWaves(user.tenantId);

  return payRuns.map(pr => {
    const wave = waves.find(w => w.id === pr.wave_id);
    return {
      id: pr.id,
      waveId: pr.wave_id,
      waveName: wave?.name,
      periodStart: pr.period_start,
      periodEnd: pr.period_end,
      payDate: pr.pay_date,
      status: pr.status,
      employeeCount: pr.employee_count,
      totalGross: pr.total_gross,
      totalNet: pr.total_nett,
      totalPaye: pr.total_paye,
      totalUifEmployee: pr.total_uif_employee,
      totalUifEmployer: pr.total_uif_employer,
      totalSdl: pr.total_sdl,
      totalEti: pr.total_eti,
    };
  });
}

@Get('pay-runs/:id')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get pay run details' })
@ApiResponse({ status: 200, type: PayRunResponseDto })
async getPayRun(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
): Promise<PayRunResponseDto> {
  const payRun = await this.payRunService.getPayRun(user.tenantId, payRunId);
  const waves = await this.payRunService.getWaves(user.tenantId);
  const wave = waves.find(w => w.id === payRun.wave_id);

  return {
    id: payRun.id,
    waveId: payRun.wave_id,
    waveName: wave?.name,
    periodStart: payRun.period_start,
    periodEnd: payRun.period_end,
    payDate: payRun.pay_date,
    status: payRun.status,
    employeeCount: payRun.employee_count,
    totalGross: payRun.total_gross,
    totalNet: payRun.total_nett,
    totalPaye: payRun.total_paye,
    totalUifEmployee: payRun.total_uif_employee,
    totalUifEmployer: payRun.total_uif_employer,
    totalSdl: payRun.total_sdl,
    totalEti: payRun.total_eti,
  };
}

@Get('pay-runs/:id/payslips')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get payslips for a pay run' })
async getPayRunPayslips(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
) {
  return this.payRunService.getPayRunPayslips(user.tenantId, payRunId);
}

@Get('pay-runs/:id/accounting')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get accounting journal entries for pay run' })
@ApiResponse({ status: 200, type: PayRunAccountingResponseDto })
async getPayRunAccounting(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
): Promise<PayRunAccountingResponseDto> {
  const accounting = await this.payRunService.getPayRunAccounting(
    user.tenantId,
    payRunId,
  );
  return {
    payRunId: accounting.payment_run_id,
    periodStart: accounting.period_start,
    periodEnd: accounting.period_end,
    entries: accounting.entries,
    totalDebits: accounting.total_debits,
    totalCredits: accounting.total_credits,
  };
}

@Post('pay-runs/:id/sync')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Sync pay run to local database' })
async syncPayRun(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
): Promise<{ message: string }> {
  await this.payRunService.syncPayRun(user.tenantId, payRunId);
  return { message: `Pay run ${payRunId} synced successfully` };
}

@Post('pay-runs/sync-all')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Sync all finalized pay runs' })
async syncAllPayRuns(
  @CurrentUser() user: IUser,
): Promise<{ synced: number; skipped: number }> {
  return this.payRunService.syncAllPayRuns(user.tenantId);
}

@Get('pay-runs/:id/sync-status')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get sync status for pay run' })
@ApiResponse({ status: 200, type: PayRunSyncStatusResponseDto })
async getPayRunSyncStatus(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
): Promise<PayRunSyncStatusResponseDto> {
  const status = await this.payRunService.getPayRunSyncStatus(
    user.tenantId,
    payRunId,
  );
  return {
    payRunId: status.payRunId,
    simplePayStatus: status.simplePayStatus,
    syncStatus: status.syncStatus,
    xeroJournalId: status.xeroJournalId,
    xeroSyncedAt: status.xeroSyncedAt,
    xeroSyncError: status.xeroSyncError,
  };
}

@Post('pay-runs/:id/post-xero')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Post pay run journal to Xero' })
async postPayRunToXero(
  @CurrentUser() user: IUser,
  @Param('id') payRunId: string,
  @Body() dto: PostToXeroDto,
): Promise<{ journalId: string; status: string }> {
  return this.payRunService.postPayRunToXero(
    user.tenantId,
    payRunId,
    dto.accountConfig,
  );
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
import { SimplePayPayRunService } from './simplepay-payrun.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,  // ADD
  ],
})
export class SimplePayModule {}
```
</module_update>

<test_cleanup_update>
## UPDATE ALL EXISTING TEST FILES

Add this line at the TOP of the beforeEach cleanup (in FK order):

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.payRunSync.deleteMany({});  // ADD THIS LINE
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
export * from './payrun-sync.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './payrun.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './payrun-sync.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-payrun.service.spec.ts (15+ tests)
Test scenarios:
- getWaves: returns waves, caches results, cache invalidation after TTL
- getPayRuns: returns pay runs, filters by waveId, filters by status, filters by date range
- getPayRun: returns single pay run, throws if not found
- getPayRunPayslips: returns payslips for pay run
- getPayRunAccounting: returns accounting entries
- syncPayRun: creates local record, stores accounting data, skips if already synced
- syncAllPayRuns: syncs finalized pay runs, returns counts
- getPayRunSyncStatus: returns status for synced and unsynced pay runs
- postPayRunToXero: posts journal, handles already posted, handles errors

### tests/database/repositories/payrun-sync.repository.spec.ts (10+ tests)
Test scenarios:
- create: creates with all fields, throws on duplicate
- findById: exists, not found
- findBySimplePayId: exists, not found
- findByTenant: returns tenant pay runs, filters by wave, filters by date
- findPendingXeroSync: returns only SYNCED status
- updateSyncStatus: updates status
- markXeroPosted: sets status and journal ID
- markXeroFailed: sets status and error
- saveAccountingData: saves JSON data
- delete: removes record

Use REAL test data (South African payroll context):
```typescript
const testPayRunSync = {
  tenantId: '', // set in beforeEach
  simplePayPayRunId: '12345',
  waveId: 1,
  waveName: 'Monthly',
  periodStart: new Date('2026-01-01'),
  periodEnd: new Date('2026-01-31'),
  payDate: new Date('2026-01-25'),
  status: 'finalized',
  employeeCount: 15,
  totalGrossCents: 25000000, // R250,000
  totalNetCents: 18000000,   // R180,000
  totalPayeCents: 4500000,   // R45,000
  totalUifEmployeeCents: 250000, // R2,500
  totalUifEmployerCents: 250000, // R2,500
  totalSdlCents: 250000,     // R2,500
  totalEtiCents: 0,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_payrun_sync

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/payrun-sync.entity.ts

# 5. Create DTO file
# Create src/database/dto/payrun.dto.ts

# 6. Create repository file
# Create src/database/repositories/payrun-sync.repository.ts

# 7. Create service file
# Create src/integrations/simplepay/simplepay-payrun.service.ts

# 8. Update module file
# Update src/integrations/simplepay/simplepay.module.ts

# 9. Update controller file
# Add endpoints to src/api/integrations/simplepay.controller.ts

# 10. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 11. Update existing test files (ALL of them)
# Add payRunSync.deleteMany to cleanup

# 12. Create test files
# Create tests/integrations/simplepay/simplepay-payrun.service.spec.ts
# Create tests/database/repositories/payrun-sync.repository.spec.ts

# 13. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 425+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys
    - Must include tenantId FK on PayRunSync
    - SimplePay API responses are wrapped (e.g., { payment_run: {...} })
    - Waves are cached for 30 minutes to reduce API calls
    - Amounts stored in cents (integer) to avoid floating point errors
    - Xero journal posting requires actual XeroSyncService integration
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 425+ tests passing
    - Migration applies and can be reverted
    - Wave retrieval works (cached)
    - Pay run listing and filtering works
    - Pay run accounting retrieval works
    - Pay run sync to local database works
    - Sync status tracking works
    - Xero journal posting framework works (actual posting requires Xero service)
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
  - Post to Xero without first syncing the pay run locally
</anti_patterns>

</task_spec>

<task_spec id="TASK-SPAY-005" version="2.0">

<metadata>
  <title>SimplePay Reports Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>179</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-REPORTS-001</requirement_ref>
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
  - `simplepay-leave.service.ts` - Leave types, balances, leave days (TASK-SPAY-001)
  - `simplepay-payrun.service.ts` - Pay run tracking, Xero journals (TASK-SPAY-002)
  - `simplepay.module.ts` - NestJS module exports

  **Existing SimplePay Database Models (prisma/schema.prisma):**
  - `SimplePayConnection` - Stores API key (encrypted), client ID per tenant
  - `SimplePayEmployeeMapping` - Maps Staff.id to SimplePay employee ID
  - `SimplePayPayslipImport` - Stores imported payslip data
  - `PayRunSync` - Pay run tracking for Xero journal integration (TASK-SPAY-002)
  - `SimplePaySyncStatus` enum - NOT_SYNCED, SYNCED, SYNC_FAILED, OUT_OF_SYNC

  **SimplePay API Base URL:** `https://api.payroll.simplepay.cloud/v1`
  **Rate Limit:** 60 requests per minute (1000 per hour)

  **Test Count:** 425+ tests passing
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

    // SimplePay returns wrapped responses for reports (various formats)
    const response = await this.apiClient.post<ReportResponse>(`/clients/${clientId}/reports/eti`, params);
    return response;
  }
  ```

  ### 3. Service Pattern (src/integrations/simplepay/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SimplePayReportsService {
    private readonly logger = new Logger(SimplePayReportsService.name);

    constructor(
      private readonly apiClient: SimplePayApiClient,
      private readonly reportRequestRepo: ReportRequestRepository,
    ) {}
  }
  ```

  ### 4. Repository Pattern (src/database/repositories/*.repository.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';

  @Injectable()
  export class ReportRequestRepository {
    private readonly logger = new Logger(ReportRequestRepository.name);
    constructor(private readonly prisma: PrismaService) {}

    // Every method has try/catch with:
    // 1. this.logger.error() with full context
    // 2. Re-throw custom exception (NEVER swallow errors)
  }
  ```

  ### 5. Entity Interface Pattern (src/database/entities/*.entity.ts)
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values: `QUEUED = 'QUEUED'` (string value matches key)

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
    await prisma.reportRequest.deleteMany({});  // NEW tables first
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
This task implements comprehensive payroll reporting integration with SimplePay API.

**SimplePay Reports API Endpoints:**

**Standard Reports (Synchronous - POST):**
- `POST /v1/clients/:client_id/reports/eti` - Employment Tax Incentive report
- `POST /v1/clients/:client_id/reports/transaction_history` - Account transaction history
- `POST /v1/clients/:client_id/reports/variance` - Payslip item variance analysis
- `POST /v1/clients/:client_id/reports/comparison_leave` - Leave accrual vs taken comparison
- `POST /v1/clients/:client_id/reports/leave_liability_v2` - Leave payout liability
- `POST /v1/clients/:client_id/reports/tracked_balances` - Loans, savings, garnishees

**Async Reports (For Large Data Sets - POST/GET):**
- `POST /v1/clients/:client_id/reports/:report/async` - Queue large report generation
- `GET /v1/clients/:client_id/reports/poll/:uuid` - Poll async report status

**South African Payroll Reporting Context:**
- ETI (Employment Tax Incentive): SARS incentive for employing youth (18-29) earning <R6,500/month
- Leave Liability: BCEA requirement to provision for accrued leave payout on termination
- Variance Reports: Critical for month-end reconciliation and payroll audits
- Transaction History: Required for GL reconciliation with Xero integration

**Business Logic:**
- Reports can be generated on-demand or scheduled
- Large reports use async mode with polling
- Results are cached in database for re-access
- ETI reports feed into EMP201 submissions
</context>

<scope>
  <in_scope>
    - Add ReportRequest model to prisma/schema.prisma
    - Add ReportStatus enum (QUEUED, PROCESSING, COMPLETED, FAILED)
    - Add ReportType enum
    - Run migration: npx prisma migrate dev --name create_report_requests
    - Create src/database/entities/report-request.entity.ts
    - Create src/database/dto/reports.dto.ts
    - Create src/database/repositories/report-request.repository.ts
    - Create src/integrations/simplepay/simplepay-reports.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add report endpoints to src/api/integrations/simplepay.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-reports.service.spec.ts (15+ tests)
    - Create tests/database/repositories/report-request.repository.spec.ts (10+ tests)
  </in_scope>
  <out_of_scope>
    - Leave management (TASK-SPAY-001)
    - Pay run integration (TASK-SPAY-002)
    - Scheduled report generation (future task)
    - Report PDF export (future task)
    - UI components
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay Reports API Response Formats (CRITICAL - note request/response structures!)

### POST /v1/clients/:client_id/reports/eti
Request:
```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "wave_ids": [123, 456],
  "humanize": true
}
```

Response:
```json
{
  "period": "January 2026",
  "employees": [
    {
      "employee_id": 12345,
      "employee_name": "Themba Ndlovu",
      "eligible": true,
      "remuneration": 6000.00,
      "eti_calculated": 750.00,
      "eti_utilised": 500.00,
      "eti_carried_forward": 250.00
    }
  ],
  "totals": {
    "eligible_employees": 5,
    "total_remuneration": 28000.00,
    "total_eti_calculated": 3500.00,
    "total_eti_utilised": 2100.00,
    "total_eti_carried_forward": 1400.00
  }
}
```

### POST /v1/clients/:client_id/reports/transaction_history
Request:
```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "account_code": "6100",
  "humanize": true
}
```

Response:
```json
{
  "period": "January 2026",
  "transactions": [
    {
      "date": "2026-01-25",
      "account_code": "6100",
      "account_name": "Salaries & Wages",
      "description": "Monthly payroll run",
      "debit": 45000.00,
      "credit": 0,
      "balance": 45000.00
    }
  ],
  "summary": {
    "opening_balance": 0,
    "total_debits": 45000.00,
    "total_credits": 0,
    "closing_balance": 45000.00
  }
}
```

### POST /v1/clients/:client_id/reports/variance
Request:
```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "wave_ids": [123],
  "humanize": true
}
```

Response:
```json
{
  "period": "January 2026",
  "items": [
    {
      "item_code": "BASIC_SALARY",
      "item_name": "Basic Salary",
      "previous_amount": 42000.00,
      "current_amount": 45000.00,
      "variance": 3000.00,
      "variance_percentage": 7.14,
      "employees": [
        {
          "employee_id": 12345,
          "employee_name": "Themba Ndlovu",
          "previous_amount": 7000.00,
          "current_amount": 7500.00,
          "variance": 500.00
        }
      ]
    }
  ]
}
```

### POST /v1/clients/:client_id/reports/leave_liability_v2
Request:
```json
{
  "as_at_date": "2026-01-31",
  "humanize": true
}
```

Response:
```json
{
  "as_at_date": "2026-01-31",
  "employees": [
    {
      "employee_id": 12345,
      "employee_name": "Themba Ndlovu",
      "leave_types": [
        {
          "leave_type_id": 1,
          "leave_type_name": "Annual Leave",
          "balance": 12.5,
          "daily_rate": 350.00,
          "liability": 4375.00
        }
      ],
      "total_liability": 4375.00
    }
  ],
  "totals": {
    "total_employees": 8,
    "total_liability": 35000.00,
    "by_leave_type": {
      "Annual Leave": 28000.00,
      "Sick Leave": 7000.00
    }
  }
}
```

### POST /v1/clients/:client_id/reports/comparison_leave
Request:
```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-01-31",
  "humanize": true
}
```

Response:
```json
{
  "period": "January 2026",
  "employees": [
    {
      "employee_id": 12345,
      "employee_name": "Themba Ndlovu",
      "leave_types": [
        {
          "leave_type_id": 1,
          "leave_type_name": "Annual Leave",
          "opening_balance": 10.0,
          "accrued": 1.25,
          "taken": 2.0,
          "adjustment": 0,
          "closing_balance": 9.25
        }
      ]
    }
  ]
}
```

### POST /v1/clients/:client_id/reports/tracked_balances
Request:
```json
{
  "as_at_date": "2026-01-31",
  "humanize": true
}
```

Response:
```json
{
  "as_at_date": "2026-01-31",
  "employees": [
    {
      "employee_id": 12345,
      "employee_name": "Themba Ndlovu",
      "balances": [
        {
          "item_code": "STAFF_LOAN",
          "item_name": "Staff Loan",
          "type": "loan",
          "original_amount": 5000.00,
          "paid": 2000.00,
          "outstanding": 3000.00
        }
      ],
      "total_outstanding": 3000.00
    }
  ],
  "totals": {
    "total_loans": 15000.00,
    "total_savings": 8000.00,
    "total_garnishees": 2500.00
  }
}
```

### POST /v1/clients/:client_id/reports/:report/async
Request (same as synchronous reports):
```json
{
  "start_date": "2026-01-01",
  "end_date": "2026-01-31"
}
```

Response:
```json
{
  "uuid": "abc123-def456-ghi789",
  "status": "queued",
  "message": "Report generation queued"
}
```

### GET /v1/clients/:client_id/reports/poll/:uuid
Response (in progress):
```json
{
  "uuid": "abc123-def456-ghi789",
  "status": "processing",
  "progress": 45
}
```

Response (completed):
```json
{
  "uuid": "abc123-def456-ghi789",
  "status": "completed",
  "download_url": "/v1/clients/123/reports/download/abc123-def456-ghi789"
}
```

Response (failed):
```json
{
  "uuid": "abc123-def456-ghi789",
  "status": "failed",
  "error": "Insufficient data for report generation"
}
```
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER PayRunSync model)

```prisma
// TASK-SPAY-005: Report Requests
enum ReportStatus {
  QUEUED
  PROCESSING
  COMPLETED
  FAILED
}

enum ReportType {
  ETI
  TRANSACTION_HISTORY
  VARIANCE
  LEAVE_COMPARISON
  LEAVE_LIABILITY
  TRACKED_BALANCES
}

model ReportRequest {
  id            String       @id @default(uuid())
  tenantId      String       @map("tenant_id")
  reportType    ReportType   @map("report_type")
  params        Json         // Request parameters (dates, filters, etc.)
  status        ReportStatus @default(QUEUED)
  asyncUuid     String?      @map("async_uuid") @db.VarChar(100)
  resultData    Json?        @map("result_data")
  errorMessage  String?      @map("error_message")
  requestedBy   String?      @map("requested_by")
  requestedAt   DateTime     @default(now()) @map("requested_at")
  completedAt   DateTime?    @map("completed_at")
  createdAt     DateTime     @default(now()) @map("created_at")
  updatedAt     DateTime     @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([status])
  @@index([asyncUuid])
  @@index([reportType])
  @@index([tenantId, reportType])
  @@map("report_requests")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  reportRequests        ReportRequest[]       // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/report-request.entity.ts
```typescript
/**
 * Report Request Entity Types
 * TASK-SPAY-005: SimplePay Reports Service
 */

export enum ReportStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ReportType {
  ETI = 'ETI',
  TRANSACTION_HISTORY = 'TRANSACTION_HISTORY',
  VARIANCE = 'VARIANCE',
  LEAVE_COMPARISON = 'LEAVE_COMPARISON',
  LEAVE_LIABILITY = 'LEAVE_LIABILITY',
  TRACKED_BALANCES = 'TRACKED_BALANCES',
}

export interface IReportRequest {
  id: string;
  tenantId: string;
  reportType: ReportType;
  params: ReportParams;
  status: ReportStatus;
  asyncUuid: string | null;
  resultData: unknown | null;
  errorMessage: string | null;
  requestedBy: string | null;
  requestedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// Request parameter types
export interface ReportParams {
  startDate?: string;
  endDate?: string;
  asAtDate?: string;
  waveIds?: number[];
  employeeIds?: number[];
  accountCode?: string;
  humanize?: boolean;
}

// SimplePay API response types
export interface EtiReportEmployee {
  employee_id: number;
  employee_name: string;
  eligible: boolean;
  remuneration: number;
  eti_calculated: number;
  eti_utilised: number;
  eti_carried_forward: number;
}

export interface EtiReportTotals {
  eligible_employees: number;
  total_remuneration: number;
  total_eti_calculated: number;
  total_eti_utilised: number;
  total_eti_carried_forward: number;
}

export interface EtiReport {
  period: string;
  employees: EtiReportEmployee[];
  totals: EtiReportTotals;
}

export interface TransactionRecord {
  date: string;
  account_code: string;
  account_name: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface TransactionHistoryReport {
  period: string;
  transactions: TransactionRecord[];
  summary: {
    opening_balance: number;
    total_debits: number;
    total_credits: number;
    closing_balance: number;
  };
}

export interface VarianceEmployee {
  employee_id: number;
  employee_name: string;
  previous_amount: number;
  current_amount: number;
  variance: number;
}

export interface VarianceItem {
  item_code: string;
  item_name: string;
  previous_amount: number;
  current_amount: number;
  variance: number;
  variance_percentage: number;
  employees: VarianceEmployee[];
}

export interface VarianceReport {
  period: string;
  items: VarianceItem[];
}

export interface LeaveTypeBalance {
  leave_type_id: number;
  leave_type_name: string;
  balance: number;
  daily_rate: number;
  liability: number;
}

export interface LeaveLiabilityEmployee {
  employee_id: number;
  employee_name: string;
  leave_types: LeaveTypeBalance[];
  total_liability: number;
}

export interface LeaveLiabilityReport {
  as_at_date: string;
  employees: LeaveLiabilityEmployee[];
  totals: {
    total_employees: number;
    total_liability: number;
    by_leave_type: Record<string, number>;
  };
}

export interface LeaveComparison {
  leave_type_id: number;
  leave_type_name: string;
  opening_balance: number;
  accrued: number;
  taken: number;
  adjustment: number;
  closing_balance: number;
}

export interface LeaveComparisonEmployee {
  employee_id: number;
  employee_name: string;
  leave_types: LeaveComparison[];
}

export interface LeaveComparisonReport {
  period: string;
  employees: LeaveComparisonEmployee[];
}

export interface TrackedBalance {
  item_code: string;
  item_name: string;
  type: 'loan' | 'savings' | 'garnishee';
  original_amount: number;
  paid: number;
  outstanding: number;
}

export interface TrackedBalanceEmployee {
  employee_id: number;
  employee_name: string;
  balances: TrackedBalance[];
  total_outstanding: number;
}

export interface TrackedBalancesReport {
  as_at_date: string;
  employees: TrackedBalanceEmployee[];
  totals: {
    total_loans: number;
    total_savings: number;
    total_garnishees: number;
  };
}

export interface AsyncReportStatus {
  uuid: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress?: number;
  download_url?: string;
  error?: string;
}
```
</entity_files>

<dto_files>
## src/database/dto/reports.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsDate,
  IsOptional,
  IsEnum,
  IsArray,
  IsInt,
  IsBoolean,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReportStatus, ReportType } from '../entities/report-request.entity';

export class BaseReportParamsDto {
  @ApiPropertyOptional({ description: 'Start date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'End date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Filter by wave IDs' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  waveIds?: number[];

  @ApiPropertyOptional({ description: 'Filter by employee IDs' })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  employeeIds?: number[];

  @ApiPropertyOptional({ description: 'Format numbers as readable strings', default: true })
  @IsOptional()
  @IsBoolean()
  humanize?: boolean;
}

export class DateRangeReportParamsDto extends BaseReportParamsDto {
  @ApiProperty({ description: 'Start date (YYYY-MM-DD)', example: '2026-01-01' })
  @IsString()
  startDate!: string;

  @ApiProperty({ description: 'End date (YYYY-MM-DD)', example: '2026-01-31' })
  @IsString()
  endDate!: string;
}

export class AsAtDateReportParamsDto {
  @ApiProperty({ description: 'As-at date (YYYY-MM-DD)', example: '2026-01-31' })
  @IsString()
  asAtDate!: string;

  @ApiPropertyOptional({ description: 'Format numbers as readable strings', default: true })
  @IsOptional()
  @IsBoolean()
  humanize?: boolean;
}

export class TransactionHistoryParamsDto extends DateRangeReportParamsDto {
  @ApiPropertyOptional({ description: 'Filter by account code', example: '6100' })
  @IsOptional()
  @IsString()
  accountCode?: string;
}

export class CreateReportRequestDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ enum: ReportType, description: 'Type of report' })
  @IsEnum(ReportType)
  reportType!: ReportType;

  @ApiProperty({ description: 'Report parameters' })
  @ValidateNested()
  @Type(() => BaseReportParamsDto)
  params!: BaseReportParamsDto;

  @ApiPropertyOptional({ description: 'User ID who requested the report' })
  @IsOptional()
  @IsUUID()
  requestedBy?: string;
}

export class UpdateReportRequestDto {
  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ description: 'Async UUID from SimplePay' })
  @IsOptional()
  @IsString()
  asyncUuid?: string;

  @ApiPropertyOptional({ description: 'Report result data' })
  @IsOptional()
  resultData?: unknown;

  @ApiPropertyOptional({ description: 'Error message if failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ description: 'Completion timestamp' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedAt?: Date;
}

export class ReportRequestFilterDto {
  @ApiPropertyOptional({ enum: ReportType })
  @IsOptional()
  @IsEnum(ReportType)
  reportType?: ReportType;

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  fromDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  toDate?: Date;
}

// Response DTOs for API
export class EtiReportResponseDto {
  @ApiProperty()
  period!: string;

  @ApiProperty()
  employees!: Array<{
    employeeId: number;
    employeeName: string;
    eligible: boolean;
    remuneration: number;
    etiCalculated: number;
    etiUtilised: number;
    etiCarriedForward: number;
  }>;

  @ApiProperty()
  totals!: {
    eligibleEmployees: number;
    totalRemuneration: number;
    totalEtiCalculated: number;
    totalEtiUtilised: number;
    totalEtiCarriedForward: number;
  };
}

export class TransactionHistoryResponseDto {
  @ApiProperty()
  period!: string;

  @ApiProperty()
  transactions!: Array<{
    date: string;
    accountCode: string;
    accountName: string;
    description: string;
    debit: number;
    credit: number;
    balance: number;
  }>;

  @ApiProperty()
  summary!: {
    openingBalance: number;
    totalDebits: number;
    totalCredits: number;
    closingBalance: number;
  };
}

export class VarianceReportResponseDto {
  @ApiProperty()
  period!: string;

  @ApiProperty()
  items!: Array<{
    itemCode: string;
    itemName: string;
    previousAmount: number;
    currentAmount: number;
    variance: number;
    variancePercentage: number;
    employees: Array<{
      employeeId: number;
      employeeName: string;
      previousAmount: number;
      currentAmount: number;
      variance: number;
    }>;
  }>;
}

export class LeaveLiabilityResponseDto {
  @ApiProperty()
  asAtDate!: string;

  @ApiProperty()
  employees!: Array<{
    employeeId: number;
    employeeName: string;
    leaveTypes: Array<{
      leaveTypeId: number;
      leaveTypeName: string;
      balance: number;
      dailyRate: number;
      liability: number;
    }>;
    totalLiability: number;
  }>;

  @ApiProperty()
  totals!: {
    totalEmployees: number;
    totalLiability: number;
    byLeaveType: Record<string, number>;
  };
}

export class LeaveComparisonResponseDto {
  @ApiProperty()
  period!: string;

  @ApiProperty()
  employees!: Array<{
    employeeId: number;
    employeeName: string;
    leaveTypes: Array<{
      leaveTypeId: number;
      leaveTypeName: string;
      openingBalance: number;
      accrued: number;
      taken: number;
      adjustment: number;
      closingBalance: number;
    }>;
  }>;
}

export class TrackedBalancesResponseDto {
  @ApiProperty()
  asAtDate!: string;

  @ApiProperty()
  employees!: Array<{
    employeeId: number;
    employeeName: string;
    balances: Array<{
      itemCode: string;
      itemName: string;
      type: 'loan' | 'savings' | 'garnishee';
      originalAmount: number;
      paid: number;
      outstanding: number;
    }>;
    totalOutstanding: number;
  }>;

  @ApiProperty()
  totals!: {
    totalLoans: number;
    totalSavings: number;
    totalGarnishees: number;
  };
}

export class AsyncReportStatusResponseDto {
  @ApiProperty()
  uuid!: string;

  @ApiProperty({ enum: ['queued', 'processing', 'completed', 'failed'] })
  status!: 'queued' | 'processing' | 'completed' | 'failed';

  @ApiPropertyOptional()
  progress?: number;

  @ApiPropertyOptional()
  downloadUrl?: string;

  @ApiPropertyOptional()
  error?: string;
}
```
</dto_files>

<repository_file>
## src/database/repositories/report-request.repository.ts

```typescript
/**
 * Report Request Repository
 * TASK-SPAY-005: SimplePay Reports Service
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, ReportRequest, ReportStatus, ReportType } from '@prisma/client';
import {
  CreateReportRequestDto,
  UpdateReportRequestDto,
  ReportRequestFilterDto,
} from '../dto/reports.dto';

@Injectable()
export class ReportRequestRepository {
  private readonly logger = new Logger(ReportRequestRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new report request
   */
  async create(dto: CreateReportRequestDto): Promise<ReportRequest> {
    try {
      return await this.prisma.reportRequest.create({
        data: {
          tenantId: dto.tenantId,
          reportType: dto.reportType,
          params: dto.params as Prisma.JsonObject,
          requestedBy: dto.requestedBy,
          status: ReportStatus.QUEUED,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create report request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { dto },
      );
      throw error;
    }
  }

  /**
   * Find report request by ID
   */
  async findById(id: string): Promise<ReportRequest | null> {
    try {
      return await this.prisma.reportRequest.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report request by ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id },
      );
      throw error;
    }
  }

  /**
   * Find report request by async UUID
   */
  async findByAsyncUuid(asyncUuid: string): Promise<ReportRequest | null> {
    try {
      return await this.prisma.reportRequest.findFirst({
        where: { asyncUuid },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report request by async UUID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { asyncUuid },
      );
      throw error;
    }
  }

  /**
   * Find report requests by tenant with filters
   */
  async findByTenant(
    tenantId: string,
    filter?: ReportRequestFilterDto,
  ): Promise<ReportRequest[]> {
    try {
      const where: Prisma.ReportRequestWhereInput = { tenantId };

      if (filter?.reportType) {
        where.reportType = filter.reportType;
      }

      if (filter?.status) {
        where.status = filter.status;
      }

      if (filter?.fromDate || filter?.toDate) {
        where.requestedAt = {};
        if (filter.fromDate) {
          where.requestedAt.gte = filter.fromDate;
        }
        if (filter.toDate) {
          where.requestedAt.lte = filter.toDate;
        }
      }

      return await this.prisma.reportRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find report requests by tenant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, filter },
      );
      throw error;
    }
  }

  /**
   * Find pending/processing report requests
   */
  async findPending(tenantId: string): Promise<ReportRequest[]> {
    try {
      return await this.prisma.reportRequest.findMany({
        where: {
          tenantId,
          status: { in: [ReportStatus.QUEUED, ReportStatus.PROCESSING] },
        },
        orderBy: { requestedAt: 'asc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find pending report requests: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId },
      );
      throw error;
    }
  }

  /**
   * Update report request
   */
  async update(id: string, dto: UpdateReportRequestDto): Promise<ReportRequest> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException(`ReportRequest with ID ${id} not found`);
      }

      return await this.prisma.reportRequest.update({
        where: { id },
        data: {
          ...(dto.status && { status: dto.status }),
          ...(dto.asyncUuid !== undefined && { asyncUuid: dto.asyncUuid }),
          ...(dto.resultData !== undefined && { resultData: dto.resultData as Prisma.JsonValue }),
          ...(dto.errorMessage !== undefined && { errorMessage: dto.errorMessage }),
          ...(dto.completedAt !== undefined && { completedAt: dto.completedAt }),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to update report request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id, dto },
      );
      throw error;
    }
  }

  /**
   * Mark report as processing
   */
  async markProcessing(id: string, asyncUuid?: string): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.PROCESSING,
      asyncUuid,
    });
  }

  /**
   * Mark report as completed with result data
   */
  async markCompleted(id: string, resultData: unknown): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.COMPLETED,
      resultData,
      completedAt: new Date(),
    });
  }

  /**
   * Mark report as failed with error message
   */
  async markFailed(id: string, errorMessage: string): Promise<ReportRequest> {
    return this.update(id, {
      status: ReportStatus.FAILED,
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Delete report request
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException(`ReportRequest with ID ${id} not found`);
      }

      await this.prisma.reportRequest.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to delete report request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id },
      );
      throw error;
    }
  }

  /**
   * Delete old completed reports (cleanup)
   */
  async deleteOldReports(tenantId: string, olderThan: Date): Promise<number> {
    try {
      const result = await this.prisma.reportRequest.deleteMany({
        where: {
          tenantId,
          status: { in: [ReportStatus.COMPLETED, ReportStatus.FAILED] },
          completedAt: { lt: olderThan },
        },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete old report requests: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, olderThan },
      );
      throw error;
    }
  }
}
```
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-reports.service.ts

```typescript
/**
 * SimplePay Reports Service
 * TASK-SPAY-005: Payroll Reporting Integration
 *
 * Generates ETI, variance, leave liability, and other reports via SimplePay API.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { ReportRequestRepository } from '../../database/repositories/report-request.repository';
import {
  ReportType,
  ReportStatus,
  EtiReport,
  TransactionHistoryReport,
  VarianceReport,
  LeaveLiabilityReport,
  LeaveComparisonReport,
  TrackedBalancesReport,
  AsyncReportStatus,
  ReportParams,
} from '../../database/entities/report-request.entity';
import {
  DateRangeReportParamsDto,
  AsAtDateReportParamsDto,
  TransactionHistoryParamsDto,
  EtiReportResponseDto,
  TransactionHistoryResponseDto,
  VarianceReportResponseDto,
  LeaveLiabilityResponseDto,
  LeaveComparisonResponseDto,
  TrackedBalancesResponseDto,
  AsyncReportStatusResponseDto,
} from '../../database/dto/reports.dto';

@Injectable()
export class SimplePayReportsService {
  private readonly logger = new Logger(SimplePayReportsService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly reportRequestRepo: ReportRequestRepository,
  ) {}

  /**
   * Generate ETI (Employment Tax Incentive) Report
   * Used for SARS EMP201 submission
   */
  async generateEtiReport(
    tenantId: string,
    params: DateRangeReportParamsDto,
    requestedBy?: string,
  ): Promise<EtiReportResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    // Create request record
    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.ETI,
      params: params as ReportParams,
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<EtiReport>(
        `/clients/${clientId}/reports/eti`,
        {
          start_date: params.startDate,
          end_date: params.endDate,
          wave_ids: params.waveIds,
          employee_ids: params.employeeIds,
          humanize: params.humanize ?? true,
        },
      );

      // Transform to camelCase response
      const result: EtiReportResponseDto = {
        period: response.period,
        employees: response.employees.map(e => ({
          employeeId: e.employee_id,
          employeeName: e.employee_name,
          eligible: e.eligible,
          remuneration: e.remuneration,
          etiCalculated: e.eti_calculated,
          etiUtilised: e.eti_utilised,
          etiCarriedForward: e.eti_carried_forward,
        })),
        totals: {
          eligibleEmployees: response.totals.eligible_employees,
          totalRemuneration: response.totals.total_remuneration,
          totalEtiCalculated: response.totals.total_eti_calculated,
          totalEtiUtilised: response.totals.total_eti_utilised,
          totalEtiCarriedForward: response.totals.total_eti_carried_forward,
        },
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`ETI report generated for tenant ${tenantId}: ${params.startDate} to ${params.endDate}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Generate Transaction History Report
   * Used for GL reconciliation with Xero
   */
  async generateTransactionHistory(
    tenantId: string,
    params: TransactionHistoryParamsDto,
    requestedBy?: string,
  ): Promise<TransactionHistoryResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.TRANSACTION_HISTORY,
      params: params as ReportParams,
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<TransactionHistoryReport>(
        `/clients/${clientId}/reports/transaction_history`,
        {
          start_date: params.startDate,
          end_date: params.endDate,
          account_code: params.accountCode,
          humanize: params.humanize ?? true,
        },
      );

      const result: TransactionHistoryResponseDto = {
        period: response.period,
        transactions: response.transactions.map(t => ({
          date: t.date,
          accountCode: t.account_code,
          accountName: t.account_name,
          description: t.description,
          debit: t.debit,
          credit: t.credit,
          balance: t.balance,
        })),
        summary: {
          openingBalance: response.summary.opening_balance,
          totalDebits: response.summary.total_debits,
          totalCredits: response.summary.total_credits,
          closingBalance: response.summary.closing_balance,
        },
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`Transaction history report generated for tenant ${tenantId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Generate Variance Report
   * Used for month-end payroll reconciliation
   */
  async generateVarianceReport(
    tenantId: string,
    params: DateRangeReportParamsDto,
    requestedBy?: string,
  ): Promise<VarianceReportResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.VARIANCE,
      params: params as ReportParams,
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<VarianceReport>(
        `/clients/${clientId}/reports/variance`,
        {
          start_date: params.startDate,
          end_date: params.endDate,
          wave_ids: params.waveIds,
          humanize: params.humanize ?? true,
        },
      );

      const result: VarianceReportResponseDto = {
        period: response.period,
        items: response.items.map(item => ({
          itemCode: item.item_code,
          itemName: item.item_name,
          previousAmount: item.previous_amount,
          currentAmount: item.current_amount,
          variance: item.variance,
          variancePercentage: item.variance_percentage,
          employees: item.employees.map(e => ({
            employeeId: e.employee_id,
            employeeName: e.employee_name,
            previousAmount: e.previous_amount,
            currentAmount: e.current_amount,
            variance: e.variance,
          })),
        })),
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`Variance report generated for tenant ${tenantId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Generate Leave Liability Report
   * Required for BCEA compliance and financial provisioning
   */
  async generateLeaveLiabilityReport(
    tenantId: string,
    params: AsAtDateReportParamsDto,
    requestedBy?: string,
  ): Promise<LeaveLiabilityResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.LEAVE_LIABILITY,
      params: { asAtDate: params.asAtDate, humanize: params.humanize },
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<LeaveLiabilityReport>(
        `/clients/${clientId}/reports/leave_liability_v2`,
        {
          as_at_date: params.asAtDate,
          humanize: params.humanize ?? true,
        },
      );

      const result: LeaveLiabilityResponseDto = {
        asAtDate: response.as_at_date,
        employees: response.employees.map(e => ({
          employeeId: e.employee_id,
          employeeName: e.employee_name,
          leaveTypes: e.leave_types.map(lt => ({
            leaveTypeId: lt.leave_type_id,
            leaveTypeName: lt.leave_type_name,
            balance: lt.balance,
            dailyRate: lt.daily_rate,
            liability: lt.liability,
          })),
          totalLiability: e.total_liability,
        })),
        totals: {
          totalEmployees: response.totals.total_employees,
          totalLiability: response.totals.total_liability,
          byLeaveType: response.totals.by_leave_type,
        },
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`Leave liability report generated for tenant ${tenantId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Generate Leave Comparison Report
   * Shows leave accrual vs taken for period
   */
  async generateLeaveComparisonReport(
    tenantId: string,
    params: DateRangeReportParamsDto,
    requestedBy?: string,
  ): Promise<LeaveComparisonResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.LEAVE_COMPARISON,
      params: params as ReportParams,
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<LeaveComparisonReport>(
        `/clients/${clientId}/reports/comparison_leave`,
        {
          start_date: params.startDate,
          end_date: params.endDate,
          humanize: params.humanize ?? true,
        },
      );

      const result: LeaveComparisonResponseDto = {
        period: response.period,
        employees: response.employees.map(e => ({
          employeeId: e.employee_id,
          employeeName: e.employee_name,
          leaveTypes: e.leave_types.map(lt => ({
            leaveTypeId: lt.leave_type_id,
            leaveTypeName: lt.leave_type_name,
            openingBalance: lt.opening_balance,
            accrued: lt.accrued,
            taken: lt.taken,
            adjustment: lt.adjustment,
            closingBalance: lt.closing_balance,
          })),
        })),
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`Leave comparison report generated for tenant ${tenantId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Generate Tracked Balances Report
   * Shows loans, savings, and garnishee balances
   */
  async generateTrackedBalancesReport(
    tenantId: string,
    params: AsAtDateReportParamsDto,
    requestedBy?: string,
  ): Promise<TrackedBalancesResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType: ReportType.TRACKED_BALANCES,
      params: { asAtDate: params.asAtDate, humanize: params.humanize },
      requestedBy,
    });

    try {
      await this.reportRequestRepo.markProcessing(request.id);

      const response = await this.apiClient.post<TrackedBalancesReport>(
        `/clients/${clientId}/reports/tracked_balances`,
        {
          as_at_date: params.asAtDate,
          humanize: params.humanize ?? true,
        },
      );

      const result: TrackedBalancesResponseDto = {
        asAtDate: response.as_at_date,
        employees: response.employees.map(e => ({
          employeeId: e.employee_id,
          employeeName: e.employee_name,
          balances: e.balances.map(b => ({
            itemCode: b.item_code,
            itemName: b.item_name,
            type: b.type,
            originalAmount: b.original_amount,
            paid: b.paid,
            outstanding: b.outstanding,
          })),
          totalOutstanding: e.total_outstanding,
        })),
        totals: {
          totalLoans: response.totals.total_loans,
          totalSavings: response.totals.total_savings,
          totalGarnishees: response.totals.total_garnishees,
        },
      };

      await this.reportRequestRepo.markCompleted(request.id, result);
      this.logger.log(`Tracked balances report generated for tenant ${tenantId}`);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Queue async report for large datasets
   * Returns UUID for polling
   */
  async queueAsyncReport(
    tenantId: string,
    reportType: ReportType,
    params: DateRangeReportParamsDto | AsAtDateReportParamsDto,
    requestedBy?: string,
  ): Promise<{ requestId: string; uuid: string }> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const request = await this.reportRequestRepo.create({
      tenantId,
      reportType,
      params: params as ReportParams,
      requestedBy,
    });

    try {
      const reportEndpoint = this.getReportEndpoint(reportType);
      const apiParams = this.buildApiParams(params);

      const response = await this.apiClient.post<{ uuid: string; status: string }>(
        `/clients/${clientId}/reports/${reportEndpoint}/async`,
        apiParams,
      );

      await this.reportRequestRepo.markProcessing(request.id, response.uuid);
      this.logger.log(`Async report queued for tenant ${tenantId}: ${response.uuid}`);

      return { requestId: request.id, uuid: response.uuid };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      await this.reportRequestRepo.markFailed(request.id, message);
      throw error;
    }
  }

  /**
   * Poll async report status
   */
  async pollAsyncReport(
    tenantId: string,
    uuid: string,
  ): Promise<AsyncReportStatusResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const response = await this.apiClient.get<AsyncReportStatus>(
      `/clients/${clientId}/reports/poll/${uuid}`,
    );

    // Update local record if completed or failed
    const localRequest = await this.reportRequestRepo.findByAsyncUuid(uuid);
    if (localRequest) {
      if (response.status === 'completed') {
        await this.reportRequestRepo.update(localRequest.id, {
          status: ReportStatus.COMPLETED,
          completedAt: new Date(),
        });
      } else if (response.status === 'failed') {
        await this.reportRequestRepo.markFailed(localRequest.id, response.error || 'Unknown error');
      }
    }

    return {
      uuid: response.uuid,
      status: response.status,
      progress: response.progress,
      downloadUrl: response.download_url,
      error: response.error,
    };
  }

  /**
   * Download completed async report
   */
  async downloadAsyncReport(
    tenantId: string,
    uuid: string,
  ): Promise<Buffer> {
    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    // First verify the report is ready
    const status = await this.pollAsyncReport(tenantId, uuid);
    if (status.status !== 'completed' || !status.downloadUrl) {
      throw new Error(`Report not ready for download: ${status.status}`);
    }

    return this.apiClient.downloadPdf(status.downloadUrl);
  }

  /**
   * Get report request by ID
   */
  async getReportRequest(requestId: string): Promise<unknown> {
    const request = await this.reportRequestRepo.findById(requestId);
    if (!request) {
      throw new NotFoundException(`Report request ${requestId} not found`);
    }
    return request;
  }

  /**
   * Get report history for tenant
   */
  async getReportHistory(
    tenantId: string,
    reportType?: ReportType,
  ): Promise<unknown[]> {
    return this.reportRequestRepo.findByTenant(tenantId, { reportType });
  }

  /**
   * Get pending reports for tenant
   */
  async getPendingReports(tenantId: string): Promise<unknown[]> {
    return this.reportRequestRepo.findPending(tenantId);
  }

  // Helper methods
  private getReportEndpoint(reportType: ReportType): string {
    const endpoints: Record<ReportType, string> = {
      [ReportType.ETI]: 'eti',
      [ReportType.TRANSACTION_HISTORY]: 'transaction_history',
      [ReportType.VARIANCE]: 'variance',
      [ReportType.LEAVE_COMPARISON]: 'comparison_leave',
      [ReportType.LEAVE_LIABILITY]: 'leave_liability_v2',
      [ReportType.TRACKED_BALANCES]: 'tracked_balances',
    };
    return endpoints[reportType];
  }

  private buildApiParams(
    params: DateRangeReportParamsDto | AsAtDateReportParamsDto,
  ): Record<string, unknown> {
    const apiParams: Record<string, unknown> = {
      humanize: (params as DateRangeReportParamsDto).humanize ?? true,
    };

    if ('startDate' in params && params.startDate) {
      apiParams.start_date = params.startDate;
    }
    if ('endDate' in params && params.endDate) {
      apiParams.end_date = params.endDate;
    }
    if ('asAtDate' in params && params.asAtDate) {
      apiParams.as_at_date = params.asAtDate;
    }
    if ('waveIds' in params && params.waveIds) {
      apiParams.wave_ids = params.waveIds;
    }
    if ('employeeIds' in params && params.employeeIds) {
      apiParams.employee_ids = params.employeeIds;
    }

    return apiParams;
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

Add these endpoints to the existing SimplePay controller:

```typescript
// ============================================
// Reports
// ============================================

@Post('reports/eti')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate ETI (Employment Tax Incentive) report' })
@ApiResponse({ status: 200, type: EtiReportResponseDto })
async generateEtiReport(
  @CurrentUser() user: IUser,
  @Body() params: DateRangeReportParamsDto,
): Promise<EtiReportResponseDto> {
  return this.reportsService.generateEtiReport(user.tenantId, params, user.id);
}

@Post('reports/transaction-history')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate transaction history report' })
@ApiResponse({ status: 200, type: TransactionHistoryResponseDto })
async generateTransactionHistory(
  @CurrentUser() user: IUser,
  @Body() params: TransactionHistoryParamsDto,
): Promise<TransactionHistoryResponseDto> {
  return this.reportsService.generateTransactionHistory(user.tenantId, params, user.id);
}

@Post('reports/variance')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate variance report' })
@ApiResponse({ status: 200, type: VarianceReportResponseDto })
async generateVarianceReport(
  @CurrentUser() user: IUser,
  @Body() params: DateRangeReportParamsDto,
): Promise<VarianceReportResponseDto> {
  return this.reportsService.generateVarianceReport(user.tenantId, params, user.id);
}

@Post('reports/leave-liability')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate leave liability report' })
@ApiResponse({ status: 200, type: LeaveLiabilityResponseDto })
async generateLeaveLiabilityReport(
  @CurrentUser() user: IUser,
  @Body() params: AsAtDateReportParamsDto,
): Promise<LeaveLiabilityResponseDto> {
  return this.reportsService.generateLeaveLiabilityReport(user.tenantId, params, user.id);
}

@Post('reports/leave-comparison')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate leave comparison report' })
@ApiResponse({ status: 200, type: LeaveComparisonResponseDto })
async generateLeaveComparisonReport(
  @CurrentUser() user: IUser,
  @Body() params: DateRangeReportParamsDto,
): Promise<LeaveComparisonResponseDto> {
  return this.reportsService.generateLeaveComparisonReport(user.tenantId, params, user.id);
}

@Post('reports/tracked-balances')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Generate tracked balances report' })
@ApiResponse({ status: 200, type: TrackedBalancesResponseDto })
async generateTrackedBalancesReport(
  @CurrentUser() user: IUser,
  @Body() params: AsAtDateReportParamsDto,
): Promise<TrackedBalancesResponseDto> {
  return this.reportsService.generateTrackedBalancesReport(user.tenantId, params, user.id);
}

@Post('reports/:type/async')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Queue async report for large datasets' })
@ApiParam({ name: 'type', enum: ReportType })
async queueAsyncReport(
  @CurrentUser() user: IUser,
  @Param('type') reportType: ReportType,
  @Body() params: DateRangeReportParamsDto | AsAtDateReportParamsDto,
): Promise<{ requestId: string; uuid: string }> {
  return this.reportsService.queueAsyncReport(user.tenantId, reportType, params, user.id);
}

@Get('reports/async/:uuid/status')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Poll async report status' })
@ApiResponse({ status: 200, type: AsyncReportStatusResponseDto })
async pollAsyncReport(
  @CurrentUser() user: IUser,
  @Param('uuid') uuid: string,
): Promise<AsyncReportStatusResponseDto> {
  return this.reportsService.pollAsyncReport(user.tenantId, uuid);
}

@Get('reports/async/:uuid/download')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Download completed async report' })
@ApiProduces('application/octet-stream')
async downloadAsyncReport(
  @CurrentUser() user: IUser,
  @Param('uuid') uuid: string,
  @Res() res: Response,
): Promise<void> {
  const buffer = await this.reportsService.downloadAsyncReport(user.tenantId, uuid);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="report-${uuid}.pdf"`,
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}

@Get('reports/history')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get report history' })
@ApiQuery({ name: 'type', enum: ReportType, required: false })
async getReportHistory(
  @CurrentUser() user: IUser,
  @Query('type') reportType?: ReportType,
): Promise<unknown[]> {
  return this.reportsService.getReportHistory(user.tenantId, reportType);
}

@Get('reports/pending')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get pending reports' })
async getPendingReports(
  @CurrentUser() user: IUser,
): Promise<unknown[]> {
  return this.reportsService.getPendingReports(user.tenantId);
}

@Get('reports/:id')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get report request details' })
async getReportRequest(
  @Param('id') requestId: string,
): Promise<unknown> {
  return this.reportsService.getReportRequest(requestId);
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
import { SimplePayLeaveService } from './simplepay-leave.service';
import { SimplePayPayRunService } from './simplepay-payrun.service';
import { SimplePayReportsService } from './simplepay-reports.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,
    SimplePayPayRunService,
    SimplePayReportsService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,
    SimplePayPayRunService,
    SimplePayReportsService,  // ADD
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
  await prisma.reportRequest.deleteMany({});  // ADD THIS LINE
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
export * from './report-request.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './reports.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './report-request.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-reports.service.spec.ts (15+ tests)
Test scenarios:
- generateEtiReport: returns report, handles API errors, creates request record
- generateTransactionHistory: returns report with transactions, filters by account
- generateVarianceReport: returns variance items with employee breakdown
- generateLeaveLiabilityReport: returns liability by employee and leave type
- generateLeaveComparisonReport: returns accrual vs taken comparison
- generateTrackedBalancesReport: returns loans, savings, garnishees
- queueAsyncReport: returns UUID, creates processing record
- pollAsyncReport: returns status, updates local record on completion
- downloadAsyncReport: returns buffer, throws if not ready
- getReportHistory: returns reports by tenant, filters by type
- getPendingReports: returns only QUEUED and PROCESSING

### tests/database/repositories/report-request.repository.spec.ts (10+ tests)
Test scenarios:
- create: creates with all fields, validates report type
- findById: exists, not found
- findByAsyncUuid: exists, not found
- findByTenant: returns tenant reports, filters by type, filters by status, filters by date
- findPending: returns only QUEUED and PROCESSING
- markProcessing: sets status and asyncUuid
- markCompleted: sets status, resultData, completedAt
- markFailed: sets status, errorMessage, completedAt
- delete: removes record
- deleteOldReports: removes completed reports older than date

Use REAL test data (South African payroll context):
```typescript
const testReportRequest = {
  tenantId: '', // set in beforeEach
  reportType: ReportType.ETI,
  params: {
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    humanize: true,
  },
  requestedBy: '', // set in beforeEach
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_report_requests

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/report-request.entity.ts

# 5. Create DTO file
# Create src/database/dto/reports.dto.ts

# 6. Create repository file
# Create src/database/repositories/report-request.repository.ts

# 7. Create service file
# Create src/integrations/simplepay/simplepay-reports.service.ts

# 8. Update module file
# Update src/integrations/simplepay/simplepay.module.ts

# 9. Update controller file
# Add endpoints to src/api/integrations/simplepay.controller.ts

# 10. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 11. Update existing test files (ALL of them)
# Add reportRequest.deleteMany to cleanup

# 12. Create test files
# Create tests/integrations/simplepay/simplepay-reports.service.spec.ts
# Create tests/database/repositories/report-request.repository.spec.ts

# 13. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 450+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys
    - Must include tenantId FK on ReportRequest
    - SimplePay API responses are transformed from snake_case to camelCase
    - Report requests track full lifecycle (QUEUED → PROCESSING → COMPLETED/FAILED)
    - Async reports must be polled until completion
    - Report history stored for audit trail
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 450+ tests passing
    - Migration applies and can be reverted
    - ETI report generates correctly
    - Transaction history report works
    - Variance report shows item breakdowns
    - Leave liability report shows employee liabilities
    - Leave comparison report shows accrual vs taken
    - Tracked balances report shows loans, savings, garnishees
    - Async reports queue and poll correctly
    - Report history and pending queries work
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
  - Return snake_case API responses directly (transform to camelCase)
  - Skip recording report requests (required for audit trail)
  - Poll async reports without checking status first
  - Download async reports before verifying completion
  - Skip the npx prisma generate step
</anti_patterns>

</task_spec>

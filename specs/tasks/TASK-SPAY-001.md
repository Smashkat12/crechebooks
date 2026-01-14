<task_spec id="TASK-SPAY-001" version="2.0">

<metadata>
  <title>SimplePay Leave Management Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>175</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-LEAVE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-004</task_ref>
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
  - `simplepay.module.ts` - NestJS module exports

  **Existing SimplePay Database Models (prisma/schema.prisma):**
  - `SimplePayConnection` - Stores API key (encrypted), client ID per tenant
  - `SimplePayEmployeeMapping` - Maps Staff.id to SimplePay employee ID
  - `SimplePayPayslipImport` - Stores imported payslip data
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

    // SimplePay returns wrapped responses: [{ leave_type: {...} }, ...]
    const response = await this.apiClient.get<WrapperType[]>(`/clients/${clientId}/leave_types`);
    return response.map(w => w.leave_type);
  }
  ```

  ### 3. Service Pattern (src/integrations/simplepay/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SimplePayLeaveService {
    private readonly logger = new Logger(SimplePayLeaveService.name);

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
  export class LeaveRequestRepository {
    private readonly logger = new Logger(LeaveRequestRepository.name);
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
    await prisma.leaveRequest.deleteMany({});  // NEW tables first
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
This task implements comprehensive leave management integration with SimplePay API.

**SimplePay Leave API Endpoints:**
- `GET /v1/clients/:client_id/leave_types` - List leave types (annual, sick, family responsibility)
- `GET /v1/employees/:employee_id/leave_balances?date=YYYY-MM-DD` - Get leave balances
- `GET /v1/employees/:employee_id/leave_days` - List approved leave records
- `POST /v1/employees/:employee_id/leave_days` - Create single leave day
- `POST /v1/employees/:employee_id/leave_days/create_multiple` - Batch leave creation
- `PATCH /v1/leave_days/:leave_day_id` - Update leave record
- `DELETE /v1/leave_days/:leave_day_id` - Delete leave day

**South African BCEA Leave Entitlements:**
- Annual Leave: 21 consecutive days (15 working days) per year
- Sick Leave: 30 days over 3-year cycle
- Family Responsibility Leave: 3 days per year
- Maternity Leave: 4 consecutive months (unpaid, UIF claimable)
- Parental Leave: 10 consecutive days

**Business Logic:**
- CrecheBooks is the primary interface for leave requests
- Approved leave requests sync to SimplePay
- Leave balances fetched from SimplePay for display
- Leave types cached to reduce API calls
</context>

<scope>
  <in_scope>
    - Add LeaveRequest model to prisma/schema.prisma
    - Add LeaveRequestStatus enum
    - Run migration: npx prisma migrate dev --name create_leave_requests
    - Create src/database/entities/leave-request.entity.ts
    - Create src/database/dto/leave.dto.ts
    - Create src/database/repositories/leave-request.repository.ts
    - Create src/integrations/simplepay/simplepay-leave.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add leave endpoints to src/api/integrations/simplepay.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-leave.service.spec.ts (15+ tests)
    - Create tests/database/repositories/leave-request.repository.spec.ts (10+ tests)
  </in_scope>
  <out_of_scope>
    - Pay run integration (TASK-SPAY-002)
    - Calculations management (TASK-SPAY-003)
    - Leave accrual calculations (SimplePay handles this)
    - UI components
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay API Response Formats (CRITICAL - responses are wrapped!)

### GET /v1/clients/:client_id/leave_types
```json
[
  { "leave_type": { "id": 1, "name": "Annual Leave" } },
  { "leave_type": { "id": 2, "name": "Sick Leave" } },
  { "leave_type": { "id": 3, "name": "Family Responsibility Leave" } }
]
```

### GET /v1/employees/:employee_id/leave_balances?date=2026-01-08
```json
[
  {
    "leave_balance": {
      "leave_type_id": 1,
      "leave_type_name": "Annual Leave",
      "opening_balance": 15.0,
      "accrued": 1.25,
      "taken": 2.0,
      "adjustment": 0,
      "closing_balance": 14.25
    }
  }
]
```

### GET /v1/employees/:employee_id/leave_days
```json
[
  {
    "leave_day": {
      "id": 12345,
      "leave_type_id": 1,
      "date": "2026-01-15",
      "hours": 8.0,
      "notes": "Annual leave"
    }
  }
]
```

### POST /v1/employees/:employee_id/leave_days
Request:
```json
{
  "leave_day": {
    "leave_type_id": 1,
    "date": "2026-01-15",
    "hours": 8.0,
    "notes": "Annual leave"
  }
}
```
Response: Same format as GET single leave_day

### POST /v1/employees/:employee_id/leave_days/create_multiple
Request:
```json
{
  "leave_days": [
    { "leave_type_id": 1, "date": "2026-01-15", "hours": 8.0 },
    { "leave_type_id": 1, "date": "2026-01-16", "hours": 8.0 }
  ]
}
```
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER SimplePayPayslipImport model)

```prisma
// TASK-SPAY-001: Leave Management
enum LeaveRequestStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model LeaveRequest {
  id               String             @id @default(uuid())
  tenantId         String             @map("tenant_id")
  staffId          String             @map("staff_id")
  leaveTypeId      Int                @map("leave_type_id")
  leaveTypeName    String             @map("leave_type_name") @db.VarChar(100)
  startDate        DateTime           @map("start_date") @db.Date
  endDate          DateTime           @map("end_date") @db.Date
  totalDays        Decimal            @map("total_days") @db.Decimal(4, 1)
  totalHours       Decimal            @map("total_hours") @db.Decimal(5, 1)
  reason           String?
  status           LeaveRequestStatus @default(PENDING)
  approvedBy       String?            @map("approved_by")
  approvedAt       DateTime?          @map("approved_at")
  rejectedReason   String?            @map("rejected_reason")
  simplePaySynced  Boolean            @default(false) @map("simplepay_synced")
  simplePayIds     String[]           @map("simplepay_ids")
  createdAt        DateTime           @default(now()) @map("created_at")
  updatedAt        DateTime           @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  staff  Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([staffId])
  @@index([tenantId, status])
  @@map("leave_requests")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  leaveRequests         LeaveRequest[]        // ADD THIS
}
```

## Update Staff model - ADD this relation:
```prisma
model Staff {
  // ... existing relations ...
  leaveRequests         LeaveRequest[]        // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/leave-request.entity.ts
```typescript
/**
 * Leave Request Entity Types
 * TASK-SPAY-001: SimplePay Leave Management
 */

export enum LeaveRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export interface ILeaveRequest {
  id: string;
  tenantId: string;
  staffId: string;
  leaveTypeId: number;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  totalHours: number;
  reason: string | null;
  status: LeaveRequestStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  simplePaySynced: boolean;
  simplePayIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

// SimplePay API types
export interface SimplePayLeaveType {
  id: number;
  name: string;
}

export interface SimplePayLeaveBalance {
  leave_type_id: number;
  leave_type_name: string;
  opening_balance: number;
  accrued: number;
  taken: number;
  adjustment: number;
  closing_balance: number;
}

export interface SimplePayLeaveDay {
  id: number;
  leave_type_id: number;
  date: string;
  hours: number;
  notes?: string;
}
```
</entity_files>

<dto_files>
## src/database/dto/leave.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsInt,
  IsNumber,
  IsDate,
  IsOptional,
  IsEnum,
  IsArray,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LeaveRequestStatus } from '../entities/leave-request.entity';

export class CreateLeaveRequestDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Staff member ID' })
  @IsUUID()
  staffId!: string;

  @ApiProperty({ description: 'SimplePay leave type ID' })
  @IsInt()
  @Min(1)
  leaveTypeId!: number;

  @ApiProperty({ description: 'Leave type name', example: 'Annual Leave' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  leaveTypeName!: string;

  @ApiProperty({ description: 'Start date of leave' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ description: 'End date of leave' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiProperty({ description: 'Total days of leave', example: 5.0 })
  @IsNumber()
  @Min(0.5)
  @Max(365)
  totalDays!: number;

  @ApiProperty({ description: 'Total hours of leave', example: 40.0 })
  @IsNumber()
  @Min(1)
  totalHours!: number;

  @ApiPropertyOptional({ description: 'Reason for leave' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateLeaveRequestDto extends PartialType(CreateLeaveRequestDto) {}

export class ApproveLeaveRequestDto {
  @ApiProperty({ description: 'User ID of approver' })
  @IsUUID()
  approvedBy!: string;
}

export class RejectLeaveRequestDto {
  @ApiProperty({ description: 'Reason for rejection' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}

export class LeaveRequestFilterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  staffId?: string;

  @ApiPropertyOptional({ enum: LeaveRequestStatus })
  @IsOptional()
  @IsEnum(LeaveRequestStatus)
  status?: LeaveRequestStatus;

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

export class LeaveBalanceResponseDto {
  @ApiProperty()
  leaveTypeId!: number;

  @ApiProperty()
  leaveTypeName!: string;

  @ApiProperty()
  openingBalance!: number;

  @ApiProperty()
  accrued!: number;

  @ApiProperty()
  taken!: number;

  @ApiProperty()
  adjustment!: number;

  @ApiProperty()
  closingBalance!: number;
}

export class LeaveTypeResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  name!: string;
}

export class CreateSimplePayLeaveDayDto {
  @ApiProperty()
  @IsInt()
  leaveTypeId!: number;

  @ApiProperty({ description: 'Date in YYYY-MM-DD format' })
  @IsString()
  date!: string;

  @ApiProperty({ description: 'Hours of leave', example: 8.0 })
  @IsNumber()
  @Min(0.5)
  @Max(24)
  hours!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```
</dto_files>

<repository_file>
## src/database/repositories/leave-request.repository.ts

Repository must have these methods:
1. `create(dto: CreateLeaveRequestDto): Promise<LeaveRequest>`
2. `findById(id: string): Promise<LeaveRequest | null>`
3. `findByStaff(tenantId: string, staffId: string, filter?: LeaveRequestFilterDto): Promise<LeaveRequest[]>`
4. `findByTenant(tenantId: string, filter?: LeaveRequestFilterDto): Promise<LeaveRequest[]>`
5. `findPendingByStaff(tenantId: string, staffId: string): Promise<LeaveRequest[]>`
6. `update(id: string, dto: UpdateLeaveRequestDto): Promise<LeaveRequest>`
7. `approve(id: string, approvedBy: string): Promise<LeaveRequest>` - Sets status=APPROVED, approvedAt=now()
8. `reject(id: string, reason: string): Promise<LeaveRequest>` - Sets status=REJECTED, rejectedReason
9. `cancel(id: string): Promise<LeaveRequest>` - Sets status=CANCELLED
10. `markSynced(id: string, simplePayIds: string[]): Promise<LeaveRequest>` - Sets simplePaySynced=true
11. `delete(id: string): Promise<void>`

Error handling:
- P2003 (foreign key) → NotFoundException for tenant or staff
- Not found → NotFoundException('LeaveRequest', id)
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-leave.service.ts

```typescript
/**
 * SimplePay Leave Service
 * TASK-SPAY-001: Leave Management Integration
 *
 * Manages leave types, balances, and leave day records via SimplePay API.
 */

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { LeaveRequestRepository } from '../../database/repositories/leave-request.repository';
import {
  SimplePayLeaveType,
  SimplePayLeaveBalance,
  SimplePayLeaveDay,
} from '../../database/entities/leave-request.entity';
import { CreateSimplePayLeaveDayDto } from '../../database/dto/leave.dto';

// Response wrapper types (SimplePay returns wrapped objects)
interface LeaveTypeWrapper {
  leave_type: SimplePayLeaveType;
}

interface LeaveBalanceWrapper {
  leave_balance: SimplePayLeaveBalance;
}

interface LeaveDayWrapper {
  leave_day: SimplePayLeaveDay;
}

@Injectable()
export class SimplePayLeaveService {
  private readonly logger = new Logger(SimplePayLeaveService.name);

  // Cache leave types per tenant (reduces API calls)
  private leaveTypeCache: Map<string, { types: SimplePayLeaveType[]; cachedAt: Date }> = new Map();
  private readonly CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly leaveRequestRepo: LeaveRequestRepository,
  ) {}

  /**
   * Get leave types for tenant (cached)
   */
  async getLeaveTypes(tenantId: string): Promise<SimplePayLeaveType[]> {
    // Check cache first
    const cached = this.leaveTypeCache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt.getTime() < this.CACHE_TTL_MS) {
      return cached.types;
    }

    await this.apiClient.initializeForTenant(tenantId);
    const clientId = this.apiClient.getClientId();

    const response = await this.apiClient.get<LeaveTypeWrapper[]>(
      `/clients/${clientId}/leave_types`,
    );
    const types = response.map(w => w.leave_type);

    // Update cache
    this.leaveTypeCache.set(tenantId, { types, cachedAt: new Date() });
    this.logger.debug(`Cached ${types.length} leave types for tenant ${tenantId}`);

    return types;
  }

  /**
   * Get leave balances for employee
   */
  async getLeaveBalances(
    tenantId: string,
    staffId: string,
    asAtDate?: Date,
  ): Promise<SimplePayLeaveBalance[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const dateStr = asAtDate
      ? asAtDate.toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const response = await this.apiClient.get<LeaveBalanceWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/leave_balances?date=${dateStr}`,
    );

    return response.map(w => w.leave_balance);
  }

  /**
   * Get leave days for employee
   */
  async getLeaveDays(
    tenantId: string,
    staffId: string,
  ): Promise<SimplePayLeaveDay[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.get<LeaveDayWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/leave_days`,
    );

    return response.map(w => w.leave_day);
  }

  /**
   * Create single leave day in SimplePay
   */
  async createLeaveDay(
    tenantId: string,
    staffId: string,
    leaveDay: CreateSimplePayLeaveDayDto,
  ): Promise<SimplePayLeaveDay> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.post<LeaveDayWrapper>(
      `/employees/${mapping.simplePayEmployeeId}/leave_days`,
      {
        leave_day: {
          leave_type_id: leaveDay.leaveTypeId,
          date: leaveDay.date,
          hours: leaveDay.hours,
          notes: leaveDay.notes,
        },
      },
    );

    this.logger.log(`Created leave day ${response.leave_day.id} for staff ${staffId}`);
    return response.leave_day;
  }

  /**
   * Create multiple leave days in SimplePay
   */
  async createMultipleLeaveDays(
    tenantId: string,
    staffId: string,
    leaveDays: CreateSimplePayLeaveDayDto[],
  ): Promise<SimplePayLeaveDay[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new Error('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.post<LeaveDayWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/leave_days/create_multiple`,
      {
        leave_days: leaveDays.map(ld => ({
          leave_type_id: ld.leaveTypeId,
          date: ld.date,
          hours: ld.hours,
          notes: ld.notes,
        })),
      },
    );

    const created = response.map(w => w.leave_day);
    this.logger.log(`Created ${created.length} leave days for staff ${staffId}`);
    return created;
  }

  /**
   * Update leave day in SimplePay
   */
  async updateLeaveDay(
    tenantId: string,
    leaveDayId: number,
    updates: Partial<CreateSimplePayLeaveDayDto>,
  ): Promise<SimplePayLeaveDay> {
    await this.apiClient.initializeForTenant(tenantId);

    const response = await this.apiClient.patch<LeaveDayWrapper>(
      `/leave_days/${leaveDayId}`,
      {
        leave_day: {
          ...(updates.leaveTypeId && { leave_type_id: updates.leaveTypeId }),
          ...(updates.date && { date: updates.date }),
          ...(updates.hours && { hours: updates.hours }),
          ...(updates.notes !== undefined && { notes: updates.notes }),
        },
      },
    );

    return response.leave_day;
  }

  /**
   * Delete leave day from SimplePay
   */
  async deleteLeaveDay(tenantId: string, leaveDayId: number): Promise<void> {
    await this.apiClient.initializeForTenant(tenantId);
    await this.apiClient.delete(`/leave_days/${leaveDayId}`);
    this.logger.log(`Deleted leave day ${leaveDayId}`);
  }

  /**
   * Sync approved leave request to SimplePay
   * Creates leave days for each day in the request period
   */
  async syncLeaveRequestToSimplePay(
    tenantId: string,
    leaveRequestId: string,
  ): Promise<string[]> {
    const request = await this.leaveRequestRepo.findById(leaveRequestId);
    if (!request) {
      throw new Error('Leave request not found');
    }

    if (request.status !== 'APPROVED') {
      throw new Error('Only approved leave requests can be synced');
    }

    if (request.simplePaySynced) {
      throw new Error('Leave request already synced to SimplePay');
    }

    // Generate leave days for each day in the period
    const leaveDays: CreateSimplePayLeaveDayDto[] = [];
    const currentDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const hoursPerDay = 8; // Standard work day

    while (currentDate <= endDate) {
      // Skip weekends
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        leaveDays.push({
          leaveTypeId: request.leaveTypeId,
          date: currentDate.toISOString().split('T')[0],
          hours: hoursPerDay,
          notes: request.reason || undefined,
        });
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    if (leaveDays.length === 0) {
      throw new Error('No working days in leave period');
    }

    // Create leave days in SimplePay
    const createdDays = await this.createMultipleLeaveDays(
      tenantId,
      request.staffId,
      leaveDays,
    );

    // Update leave request with SimplePay IDs
    const simplePayIds = createdDays.map(d => String(d.id));
    await this.leaveRequestRepo.markSynced(leaveRequestId, simplePayIds);

    this.logger.log(
      `Synced leave request ${leaveRequestId} to SimplePay: ${simplePayIds.length} days`,
    );

    return simplePayIds;
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

Add these endpoints to the existing SimplePay controller:

```typescript
// ============================================
// Leave Management
// ============================================

@Get('leave-types')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get available leave types from SimplePay' })
@ApiResponse({ status: 200, type: [LeaveTypeResponseDto] })
async getLeaveTypes(
  @CurrentUser() user: IUser,
): Promise<LeaveTypeResponseDto[]> {
  return this.leaveService.getLeaveTypes(user.tenantId);
}

@Get('employees/:staffId/leave-balances')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get leave balances for employee' })
@ApiResponse({ status: 200, type: [LeaveBalanceResponseDto] })
@ApiQuery({ name: 'date', required: false, description: 'As at date (YYYY-MM-DD)' })
async getLeaveBalances(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Query('date') date?: string,
): Promise<LeaveBalanceResponseDto[]> {
  const balances = await this.leaveService.getLeaveBalances(
    user.tenantId,
    staffId,
    date ? new Date(date) : undefined,
  );
  return balances.map(b => ({
    leaveTypeId: b.leave_type_id,
    leaveTypeName: b.leave_type_name,
    openingBalance: b.opening_balance,
    accrued: b.accrued,
    taken: b.taken,
    adjustment: b.adjustment,
    closingBalance: b.closing_balance,
  }));
}

@Get('employees/:staffId/leave-days')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.VIEWER)
@ApiOperation({ summary: 'Get leave days for employee from SimplePay' })
async getLeaveDays(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<SimplePayLeaveDay[]> {
  return this.leaveService.getLeaveDays(user.tenantId, staffId);
}

@Post('employees/:staffId/leave-days')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Create leave day(s) in SimplePay' })
async createLeaveDays(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: CreateSimplePayLeaveDayDto | CreateSimplePayLeaveDayDto[],
): Promise<SimplePayLeaveDay | SimplePayLeaveDay[]> {
  if (Array.isArray(dto)) {
    return this.leaveService.createMultipleLeaveDays(user.tenantId, staffId, dto);
  }
  return this.leaveService.createLeaveDay(user.tenantId, staffId, dto);
}

@Patch('leave-days/:id')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Update leave day in SimplePay' })
async updateLeaveDay(
  @CurrentUser() user: IUser,
  @Param('id') leaveDayId: string,
  @Body() dto: Partial<CreateSimplePayLeaveDayDto>,
): Promise<SimplePayLeaveDay> {
  return this.leaveService.updateLeaveDay(user.tenantId, parseInt(leaveDayId), dto);
}

@Delete('leave-days/:id')
@HttpCode(HttpStatus.NO_CONTENT)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Delete leave day from SimplePay' })
async deleteLeaveDay(
  @CurrentUser() user: IUser,
  @Param('id') leaveDayId: string,
): Promise<void> {
  await this.leaveService.deleteLeaveDay(user.tenantId, parseInt(leaveDayId));
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
import { SimplePayLeaveService } from './simplepay-leave.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,  // ADD
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
  await prisma.leaveRequest.deleteMany({});  // ADD THIS LINE
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
export * from './leave-request.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './leave.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './leave-request.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-leave.service.spec.ts (15+ tests)
Test scenarios:
- getLeaveTypes: returns types, caches results, cache invalidation after TTL
- getLeaveBalances: returns balances, throws if not synced to SimplePay
- getLeaveDays: returns days for employee
- createLeaveDay: creates single day, returns created day
- createMultipleLeaveDays: creates multiple days, returns all
- updateLeaveDay: updates day, returns updated
- deleteLeaveDay: deletes day successfully
- syncLeaveRequestToSimplePay: syncs approved request, skips weekends, throws if not approved

### tests/database/repositories/leave-request.repository.spec.ts (10+ tests)
Test scenarios:
- create: creates with all fields, validates dates
- findById: exists, not found
- findByStaff: returns staff leave requests, filters by status
- findByTenant: returns tenant leave requests, date range filter
- approve: sets status and approvedAt
- reject: sets status and reason
- cancel: sets status to cancelled
- markSynced: sets simplePaySynced and IDs
- delete: removes record

Use REAL test data (South African context):
```typescript
const testLeaveRequest = {
  tenantId: '', // set in beforeEach
  staffId: '', // set in beforeEach
  leaveTypeId: 1,
  leaveTypeName: 'Annual Leave',
  startDate: new Date('2026-01-15'),
  endDate: new Date('2026-01-19'),
  totalDays: 5,
  totalHours: 40,
  reason: 'Family vacation',
  status: LeaveRequestStatus.PENDING,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_leave_requests

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/leave-request.entity.ts

# 5. Create DTO file
# Create src/database/dto/leave.dto.ts

# 6. Create repository file
# Create src/database/repositories/leave-request.repository.ts

# 7. Create service file
# Create src/integrations/simplepay/simplepay-leave.service.ts

# 8. Update module file
# Update src/integrations/simplepay/simplepay.module.ts

# 9. Update controller file
# Add endpoints to src/api/integrations/simplepay.controller.ts

# 10. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 11. Update existing test files (ALL of them)
# Add leaveRequest.deleteMany to cleanup

# 12. Create test files
# Create tests/integrations/simplepay/simplepay-leave.service.spec.ts
# Create tests/database/repositories/leave-request.repository.spec.ts

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
    - Must include tenantId FK on LeaveRequest
    - SimplePay API responses are wrapped (e.g., { leave_type: {...} })
    - Leave types are cached for 15 minutes to reduce API calls
    - Only APPROVED leave requests can be synced to SimplePay
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 425+ tests passing
    - Migration applies and can be reverted
    - Leave type retrieval works (cached)
    - Leave balance retrieval works per employee
    - Leave day CRUD operations work
    - Leave request workflow works (create → approve → sync)
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
  - Sync leave requests that are not APPROVED
  - Skip the npx prisma generate step
</anti_patterns>

</task_spec>

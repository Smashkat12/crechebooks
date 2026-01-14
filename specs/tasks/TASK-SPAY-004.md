<task_spec id="TASK-SPAY-004" version="2.0">

<metadata>
  <title>SimplePay Service Period Management</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>178</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-OFFBOARDING-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-004</task_ref>
    <task_ref status="complete">TASK-STAFF-002</task_ref>
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
  - `simplepay-api.client.ts` - HTTP client with rate limiting (60 req/min)
  - `simplepay-connection.service.ts` - Connection setup, test, disconnect
  - `simplepay-employee.service.ts` - Employee CRUD, sync to SimplePay
  - `simplepay-payslip.service.ts` - Payslip import, PDF download
  - `simplepay-tax.service.ts` - IRP5 certificates, EMP201 data
  - `simplepay-payrun.service.ts` - Pay run tracking (TASK-SPAY-002)
  - `simplepay-calculations.service.ts` - Calculations management (TASK-SPAY-003)

  **Staff Offboarding System (src/api/staff/):**
  - `staff-offboarding.service.ts` - Offboarding workflow
  - Staff model has `isActive`, `terminatedAt`, `terminationReason` fields
  - Offboarding workflow generates Certificate of Service

  **SimplePay API Base URL:** `https://api.payroll.simplepay.cloud/v1`
  **Rate Limit:** 60 requests per minute

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. SimplePay API Client Pattern
  ```typescript
  import { SimplePayApiClient } from './simplepay-api.client';

  constructor(private readonly apiClient: SimplePayApiClient) {}

  async someMethod(tenantId: string) {
    await this.apiClient.initializeForTenant(tenantId);
    // SimplePay returns wrapped responses
    const response = await this.apiClient.get<WrapperType[]>(`/employees/${empId}/service_periods`);
    return response.map(w => w.service_period);
  }
  ```

  ### 3. Entity Interface Pattern
  - Use `string | null` for nullable fields, NOT `string?`
  - Export enums BEFORE the interface
  - Enum values match keys: `RESIGNATION = 'RESIGNATION'`

  ### 4. Test Pattern
  ```typescript
  import 'dotenv/config';  // FIRST LINE

  beforeEach(async () => {
    await prisma.servicePeriodSync.deleteMany({});  // NEW table first
    // ... existing cleanup ...
  });
  ```

  ### 5. SA Termination Codes (UI-19)
  CRITICAL: South Africa has specific termination codes for UIF eligibility:
  - Code 1: Resignation
  - Code 2: Dismissal - Misconduct (no UIF)
  - Code 3: Dismissal - Incapacity
  - Code 4: Retrenchment
  - Code 5: Contract Expiry
  - Code 6: Retirement
  - Code 7: Death
  - Code 8: Absconded (no UIF)
  - Code 9: Transfer
</critical_patterns>

<context>
This task implements employee service period management (termination, reinstatement) via SimplePay API. Service periods track employment duration and termination details required for South African labour law compliance.

**SimplePay Service Period API Endpoints:**
- `GET /v1/employees/:employee_id/service_periods` - List employment periods
- `POST /v1/employees/:employee_id/service_periods/end_service` - Terminate employment
- `POST /v1/employees/:employee_id/service_periods/reinstate` - Rehire employee
- `DELETE /v1/employees/:employee_id/service_periods/undo_end_service` - Cancel termination

**Business Logic:**
- Each employee can have multiple service periods (rehires)
- Termination triggers final payslip and UI-19 form generation
- Termination code determines UIF eligibility
- Undo termination only works if final pay run not processed
</context>

<scope>
  <in_scope>
    - Add ServicePeriodSync model to prisma/schema.prisma
    - Add TerminationCode enum
    - Run migration: npx prisma migrate dev --name create_service_period_sync
    - Create src/database/entities/service-period.entity.ts
    - Create src/database/dto/service-period.dto.ts
    - Create src/database/repositories/service-period-sync.repository.ts
    - Create src/integrations/simplepay/simplepay-service-period.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add service period endpoints to src/api/integrations/simplepay.controller.ts
    - Add SimplePay sync to src/api/staff/staff-offboarding.service.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-service-period.service.spec.ts (12+ tests)
    - Create tests/database/repositories/service-period-sync.repository.spec.ts (8+ tests)
  </in_scope>
  <out_of_scope>
    - Leave management (TASK-SPAY-001)
    - Calculations (TASK-SPAY-003)
    - UI-19 form generation (SimplePay handles this)
    - Certificate of Service (existing offboarding service)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay API Response Formats (CRITICAL - responses are wrapped!)

### GET /v1/employees/:employee_id/service_periods
```json
[
  {
    "service_period": {
      "id": "sp_123",
      "employee_id": "emp_456",
      "start_date": "2024-01-15",
      "end_date": null,
      "termination_code": null,
      "termination_reason": null,
      "is_active": true,
      "created_at": "2024-01-15T00:00:00Z"
    }
  },
  {
    "service_period": {
      "id": "sp_100",
      "employee_id": "emp_456",
      "start_date": "2022-06-01",
      "end_date": "2023-12-31",
      "termination_code": "1",
      "termination_reason": "Resignation - Personal reasons",
      "is_active": false,
      "created_at": "2022-06-01T00:00:00Z"
    }
  }
]
```

### POST /v1/employees/:employee_id/service_periods/end_service
Request:
```json
{
  "termination": {
    "termination_date": "2026-01-31",
    "last_working_day": "2026-01-31",
    "termination_code": "1",
    "termination_reason": "Resignation - Personal reasons",
    "process_final_pay": true,
    "pay_notice_period": false
  }
}
```
Response:
```json
{
  "service_period": {
    "id": "sp_123",
    "employee_id": "emp_456",
    "start_date": "2024-01-15",
    "end_date": "2026-01-31",
    "termination_code": "1",
    "termination_reason": "Resignation - Personal reasons",
    "is_active": false,
    "final_payslip_id": "ps_789"
  }
}
```

### POST /v1/employees/:employee_id/service_periods/reinstate
Request:
```json
{
  "reinstatement": {
    "reinstate_date": "2026-03-01",
    "wave_id": 1,
    "reason": "Rehired after resignation"
  }
}
```
Response:
```json
{
  "service_period": {
    "id": "sp_200",
    "employee_id": "emp_456",
    "start_date": "2026-03-01",
    "end_date": null,
    "termination_code": null,
    "termination_reason": null,
    "is_active": true
  }
}
```

### DELETE /v1/employees/:employee_id/service_periods/undo_end_service
Returns: 204 No Content (on success)
Returns: 400 Bad Request (if final pay already processed)
```json
{
  "error": {
    "code": "FINAL_PAY_PROCESSED",
    "message": "Cannot undo termination after final pay run processed"
  }
}
```
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER PayrollAdjustment model)

```prisma
// TASK-SPAY-004: Service Period Management
enum TerminationCode {
  RESIGNATION            // Code 1 - UIF eligible after waiting period
  DISMISSAL_MISCONDUCT   // Code 2 - Not UIF eligible
  DISMISSAL_INCAPACITY   // Code 3 - UIF eligible
  RETRENCHMENT           // Code 4 - UIF eligible
  CONTRACT_EXPIRY        // Code 5 - UIF eligible
  RETIREMENT             // Code 6 - UIF eligible
  DEATH                  // Code 7 - Benefits to dependents
  ABSCONDED              // Code 8 - Not UIF eligible
  TRANSFER               // Code 9 - N/A
}

model ServicePeriodSync {
  id                    String           @id @default(uuid())
  tenantId              String           @map("tenant_id")
  staffId               String           @map("staff_id")
  simplePayEmployeeId   String           @map("simplepay_employee_id")
  simplePayPeriodId     String           @map("simplepay_period_id")
  startDate             DateTime         @map("start_date") @db.Date
  endDate               DateTime?        @map("end_date") @db.Date
  terminationCode       TerminationCode? @map("termination_code")
  terminationReason     String?          @map("termination_reason") @db.Text
  lastWorkingDay        DateTime?        @map("last_working_day") @db.Date
  finalPayslipId        String?          @map("final_payslip_id")
  isActive              Boolean          @default(true) @map("is_active")
  syncedAt              DateTime         @default(now()) @map("synced_at")
  updatedAt             DateTime         @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  staff  Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([tenantId, staffId, simplePayPeriodId])
  @@index([tenantId])
  @@index([staffId])
  @@index([tenantId, isActive])
  @@map("service_period_syncs")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  servicePeriodSyncs    ServicePeriodSync[]   // ADD THIS
}
```

## Update Staff model - ADD this relation:
```prisma
model Staff {
  // ... existing relations ...
  servicePeriodSyncs    ServicePeriodSync[]   // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/service-period.entity.ts
```typescript
/**
 * Service Period Entity Types
 * TASK-SPAY-004: SimplePay Service Period Management
 */

// SA UI-19 Termination Codes
export enum TerminationCode {
  RESIGNATION = 'RESIGNATION',                     // Code 1
  DISMISSAL_MISCONDUCT = 'DISMISSAL_MISCONDUCT',   // Code 2
  DISMISSAL_INCAPACITY = 'DISMISSAL_INCAPACITY',   // Code 3
  RETRENCHMENT = 'RETRENCHMENT',                   // Code 4
  CONTRACT_EXPIRY = 'CONTRACT_EXPIRY',             // Code 5
  RETIREMENT = 'RETIREMENT',                       // Code 6
  DEATH = 'DEATH',                                 // Code 7
  ABSCONDED = 'ABSCONDED',                         // Code 8
  TRANSFER = 'TRANSFER',                           // Code 9
}

// Map termination codes to SimplePay API codes
export const TERMINATION_CODE_MAP: Record<TerminationCode, string> = {
  [TerminationCode.RESIGNATION]: '1',
  [TerminationCode.DISMISSAL_MISCONDUCT]: '2',
  [TerminationCode.DISMISSAL_INCAPACITY]: '3',
  [TerminationCode.RETRENCHMENT]: '4',
  [TerminationCode.CONTRACT_EXPIRY]: '5',
  [TerminationCode.RETIREMENT]: '6',
  [TerminationCode.DEATH]: '7',
  [TerminationCode.ABSCONDED]: '8',
  [TerminationCode.TRANSFER]: '9',
};

// Map SimplePay API codes back to enum
export const SIMPLEPAY_CODE_MAP: Record<string, TerminationCode> = {
  '1': TerminationCode.RESIGNATION,
  '2': TerminationCode.DISMISSAL_MISCONDUCT,
  '3': TerminationCode.DISMISSAL_INCAPACITY,
  '4': TerminationCode.RETRENCHMENT,
  '5': TerminationCode.CONTRACT_EXPIRY,
  '6': TerminationCode.RETIREMENT,
  '7': TerminationCode.DEATH,
  '8': TerminationCode.ABSCONDED,
  '9': TerminationCode.TRANSFER,
};

// UIF eligibility by termination code
export const UIF_ELIGIBILITY: Record<TerminationCode, boolean> = {
  [TerminationCode.RESIGNATION]: true,          // After waiting period
  [TerminationCode.DISMISSAL_MISCONDUCT]: false,
  [TerminationCode.DISMISSAL_INCAPACITY]: true,
  [TerminationCode.RETRENCHMENT]: true,
  [TerminationCode.CONTRACT_EXPIRY]: true,
  [TerminationCode.RETIREMENT]: true,
  [TerminationCode.DEATH]: true,                // Benefits to dependents
  [TerminationCode.ABSCONDED]: false,
  [TerminationCode.TRANSFER]: false,            // N/A - internal transfer
};

export interface IServicePeriodSync {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayEmployeeId: string;
  simplePayPeriodId: string;
  startDate: Date;
  endDate: Date | null;
  terminationCode: TerminationCode | null;
  terminationReason: string | null;
  lastWorkingDay: Date | null;
  finalPayslipId: string | null;
  isActive: boolean;
  syncedAt: Date;
  updatedAt: Date;
}

// SimplePay API types
export interface SimplePayServicePeriod {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string | null;
  termination_code: string | null;
  termination_reason: string | null;
  is_active: boolean;
  final_payslip_id?: string;
  created_at: string;
}

// Internal types
export interface ServicePeriod {
  id: string;
  employeeId: string;
  startDate: Date;
  endDate: Date | null;
  terminationCode: TerminationCode | null;
  terminationReason: string | null;
  isActive: boolean;
  finalPayslipId: string | null;
}

export interface TerminationRequest {
  terminationDate: Date;
  terminationCode: TerminationCode;
  lastWorkingDay?: Date;
  reason?: string;
  processFinalPay?: boolean;
  payNoticePeriod?: boolean;
}

export interface ReinstatementRequest {
  reinstateDate: Date;
  waveId?: number;
  reason?: string;
}

export interface TerminationResult {
  success: boolean;
  servicePeriodId: string;
  finalPayslipId: string | null;
  error?: string;
}

export interface ReinstatementResult {
  success: boolean;
  newServicePeriodId: string;
  error?: string;
}
```
</entity_files>

<dto_files>
## src/database/dto/service-period.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsDate,
  IsBoolean,
  IsOptional,
  IsEnum,
  IsInt,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TerminationCode } from '../entities/service-period.entity';

// ============================================
// Service Period Response DTOs
// ============================================

export class ServicePeriodResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  startDate!: Date;

  @ApiPropertyOptional()
  endDate?: Date;

  @ApiPropertyOptional({ enum: TerminationCode })
  terminationCode?: TerminationCode;

  @ApiPropertyOptional()
  terminationReason?: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiPropertyOptional()
  finalPayslipId?: string;
}

export class ServicePeriodsListResponseDto {
  @ApiProperty({ type: [ServicePeriodResponseDto] })
  servicePeriods!: ServicePeriodResponseDto[];

  @ApiPropertyOptional({ type: ServicePeriodResponseDto })
  currentPeriod?: ServicePeriodResponseDto;
}

// ============================================
// Termination DTOs
// ============================================

export class TerminateEmployeeDto {
  @ApiProperty({ description: 'Date of termination (YYYY-MM-DD)' })
  @Type(() => Date)
  @IsDate()
  terminationDate!: Date;

  @ApiProperty({ enum: TerminationCode, description: 'SA UI-19 termination code' })
  @IsEnum(TerminationCode)
  terminationCode!: TerminationCode;

  @ApiPropertyOptional({ description: 'Last working day (defaults to termination date)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastWorkingDay?: Date;

  @ApiPropertyOptional({ description: 'Reason for termination' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Process final pay run', default: true })
  @IsOptional()
  @IsBoolean()
  processFinalPay?: boolean;

  @ApiPropertyOptional({ description: 'Pay notice period', default: false })
  @IsOptional()
  @IsBoolean()
  payNoticePeriod?: boolean;
}

export class TerminationResultDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  servicePeriodId!: string;

  @ApiPropertyOptional()
  finalPayslipId?: string;

  @ApiPropertyOptional()
  error?: string;
}

// ============================================
// Reinstatement DTOs
// ============================================

export class ReinstateEmployeeDto {
  @ApiProperty({ description: 'Date of reinstatement (YYYY-MM-DD)' })
  @Type(() => Date)
  @IsDate()
  reinstateDate!: Date;

  @ApiPropertyOptional({ description: 'Pay frequency (wave) ID' })
  @IsOptional()
  @IsInt()
  waveId?: number;

  @ApiPropertyOptional({ description: 'Reason for reinstatement' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReinstatementResultDto {
  @ApiProperty()
  success!: boolean;

  @ApiProperty()
  newServicePeriodId!: string;

  @ApiPropertyOptional()
  error?: string;
}

// ============================================
// Service Period Sync DTOs (Local Storage)
// ============================================

export class CreateServicePeriodSyncDto {
  @ApiProperty()
  @IsUUID()
  tenantId!: string;

  @ApiProperty()
  @IsUUID()
  staffId!: string;

  @ApiProperty()
  @IsString()
  simplePayEmployeeId!: string;

  @ApiProperty()
  @IsString()
  simplePayPeriodId!: string;

  @ApiProperty()
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ enum: TerminationCode })
  @IsOptional()
  @IsEnum(TerminationCode)
  terminationCode?: TerminationCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastWorkingDay?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalPayslipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateServicePeriodSyncDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ enum: TerminationCode })
  @IsOptional()
  @IsEnum(TerminationCode)
  terminationCode?: TerminationCode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  terminationReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lastWorkingDay?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  finalPayslipId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
```
</dto_files>

<repository_file>
## src/database/repositories/service-period-sync.repository.ts

```typescript
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ServicePeriodSync, Prisma } from '@prisma/client';
import { CreateServicePeriodSyncDto, UpdateServicePeriodSyncDto } from '../dto/service-period.dto';

@Injectable()
export class ServicePeriodSyncRepository {
  private readonly logger = new Logger(ServicePeriodSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateServicePeriodSyncDto): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayEmployeeId: dto.simplePayEmployeeId,
          simplePayPeriodId: dto.simplePayPeriodId,
          startDate: dto.startDate,
          endDate: dto.endDate,
          terminationCode: dto.terminationCode,
          terminationReason: dto.terminationReason,
          lastWorkingDay: dto.lastWorkingDay,
          finalPayslipId: dto.finalPayslipId,
          isActive: dto.isActive ?? true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(
            `Service period ${dto.simplePayPeriodId} already synced for staff ${dto.staffId}`,
          );
        }
      }
      this.logger.error(`Failed to create ServicePeriodSync: ${error}`, { dto });
      throw error;
    }
  }

  async findById(id: string): Promise<ServicePeriodSync | null> {
    return this.prisma.servicePeriodSync.findUnique({ where: { id } });
  }

  async findByStaff(tenantId: string, staffId: string): Promise<ServicePeriodSync[]> {
    return this.prisma.servicePeriodSync.findMany({
      where: { tenantId, staffId },
      orderBy: { startDate: 'desc' },
    });
  }

  async findActiveByStaff(tenantId: string, staffId: string): Promise<ServicePeriodSync | null> {
    return this.prisma.servicePeriodSync.findFirst({
      where: { tenantId, staffId, isActive: true },
      orderBy: { startDate: 'desc' },
    });
  }

  async findBySimplePayPeriodId(
    tenantId: string,
    staffId: string,
    simplePayPeriodId: string,
  ): Promise<ServicePeriodSync | null> {
    return this.prisma.servicePeriodSync.findUnique({
      where: {
        tenantId_staffId_simplePayPeriodId: { tenantId, staffId, simplePayPeriodId },
      },
    });
  }

  async update(id: string, dto: UpdateServicePeriodSyncDto): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: {
          ...(dto.endDate !== undefined && { endDate: dto.endDate }),
          ...(dto.terminationCode !== undefined && { terminationCode: dto.terminationCode }),
          ...(dto.terminationReason !== undefined && { terminationReason: dto.terminationReason }),
          ...(dto.lastWorkingDay !== undefined && { lastWorkingDay: dto.lastWorkingDay }),
          ...(dto.finalPayslipId !== undefined && { finalPayslipId: dto.finalPayslipId }),
          ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('ServicePeriodSync', id);
      }
      throw error;
    }
  }

  async markTerminated(
    id: string,
    terminationCode: string,
    terminationReason: string | null,
    endDate: Date,
    lastWorkingDay: Date | null,
    finalPayslipId: string | null,
  ): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: {
          terminationCode: terminationCode as any,
          terminationReason,
          endDate,
          lastWorkingDay,
          finalPayslipId,
          isActive: false,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('ServicePeriodSync', id);
      }
      throw error;
    }
  }

  async undoTermination(id: string): Promise<ServicePeriodSync> {
    try {
      return await this.prisma.servicePeriodSync.update({
        where: { id },
        data: {
          terminationCode: null,
          terminationReason: null,
          endDate: null,
          lastWorkingDay: null,
          finalPayslipId: null,
          isActive: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('ServicePeriodSync', id);
      }
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.prisma.servicePeriodSync.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('ServicePeriodSync', id);
      }
      throw error;
    }
  }
}
```
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-service-period.service.ts

```typescript
/**
 * SimplePay Service Period Service
 * TASK-SPAY-004: Employment Lifecycle Management
 *
 * Handles termination, reinstatement, and service period tracking.
 */

import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { ServicePeriodSyncRepository } from '../../database/repositories/service-period-sync.repository';
import {
  SimplePayServicePeriod,
  ServicePeriod,
  TerminationRequest,
  ReinstatementRequest,
  TerminationResult,
  ReinstatementResult,
  TerminationCode,
  TERMINATION_CODE_MAP,
  SIMPLEPAY_CODE_MAP,
} from '../../database/entities/service-period.entity';

// Response wrapper types
interface ServicePeriodWrapper {
  service_period: SimplePayServicePeriod;
}

interface TerminationErrorResponse {
  error: {
    code: string;
    message: string;
  };
}

@Injectable()
export class SimplePayServicePeriodService {
  private readonly logger = new Logger(SimplePayServicePeriodService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly servicePeriodSyncRepo: ServicePeriodSyncRepository,
  ) {}

  /**
   * Get all service periods for an employee
   */
  async getServicePeriods(tenantId: string, staffId: string): Promise<ServicePeriod[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.get<ServicePeriodWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/service_periods`,
    );

    const periods = response.map(w => this.mapServicePeriod(w.service_period));

    // Sync to local database
    for (const period of periods) {
      await this.syncServicePeriod(tenantId, staffId, mapping.simplePayEmployeeId, period);
    }

    return periods;
  }

  /**
   * Get current active service period
   */
  async getCurrentServicePeriod(tenantId: string, staffId: string): Promise<ServicePeriod | null> {
    const periods = await this.getServicePeriods(tenantId, staffId);
    return periods.find(p => p.isActive) || null;
  }

  /**
   * Terminate employee in SimplePay
   */
  async terminateEmployee(
    tenantId: string,
    staffId: string,
    request: TerminationRequest,
  ): Promise<TerminationResult> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    // Get current service period
    const currentPeriod = await this.getCurrentServicePeriod(tenantId, staffId);
    if (!currentPeriod) {
      throw new BadRequestException('No active service period found');
    }

    const terminationCodeStr = TERMINATION_CODE_MAP[request.terminationCode];

    try {
      const response = await this.apiClient.post<ServicePeriodWrapper>(
        `/employees/${mapping.simplePayEmployeeId}/service_periods/end_service`,
        {
          termination: {
            termination_date: request.terminationDate.toISOString().split('T')[0],
            last_working_day: (request.lastWorkingDay || request.terminationDate)
              .toISOString()
              .split('T')[0],
            termination_code: terminationCodeStr,
            termination_reason: request.reason || this.getDefaultReason(request.terminationCode),
            process_final_pay: request.processFinalPay ?? true,
            pay_notice_period: request.payNoticePeriod ?? false,
          },
        },
      );

      const period = this.mapServicePeriod(response.service_period);

      // Update local sync record
      const localRecord = await this.servicePeriodSyncRepo.findActiveByStaff(tenantId, staffId);
      if (localRecord) {
        await this.servicePeriodSyncRepo.markTerminated(
          localRecord.id,
          request.terminationCode,
          request.reason || null,
          request.terminationDate,
          request.lastWorkingDay || null,
          period.finalPayslipId || null,
        );
      }

      this.logger.log(
        `Terminated employee ${staffId} with code ${request.terminationCode} on ${request.terminationDate}`,
      );

      return {
        success: true,
        servicePeriodId: period.id,
        finalPayslipId: period.finalPayslipId || null,
      };
    } catch (error: any) {
      this.logger.error(`Failed to terminate employee ${staffId}: ${error}`);
      return {
        success: false,
        servicePeriodId: currentPeriod.id,
        finalPayslipId: null,
        error: error.message || 'Termination failed',
      };
    }
  }

  /**
   * Reinstate a terminated employee
   */
  async reinstateEmployee(
    tenantId: string,
    staffId: string,
    request: ReinstatementRequest,
  ): Promise<ReinstatementResult> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    // Check that employee is terminated
    const currentPeriod = await this.getCurrentServicePeriod(tenantId, staffId);
    if (currentPeriod?.isActive) {
      throw new BadRequestException('Employee is still active, cannot reinstate');
    }

    try {
      const response = await this.apiClient.post<ServicePeriodWrapper>(
        `/employees/${mapping.simplePayEmployeeId}/service_periods/reinstate`,
        {
          reinstatement: {
            reinstate_date: request.reinstateDate.toISOString().split('T')[0],
            ...(request.waveId && { wave_id: request.waveId }),
            ...(request.reason && { reason: request.reason }),
          },
        },
      );

      const period = this.mapServicePeriod(response.service_period);

      // Create new local sync record
      await this.servicePeriodSyncRepo.create({
        tenantId,
        staffId,
        simplePayEmployeeId: mapping.simplePayEmployeeId,
        simplePayPeriodId: period.id,
        startDate: period.startDate,
        isActive: true,
      });

      this.logger.log(`Reinstated employee ${staffId} on ${request.reinstateDate}`);

      return {
        success: true,
        newServicePeriodId: period.id,
      };
    } catch (error: any) {
      this.logger.error(`Failed to reinstate employee ${staffId}: ${error}`);
      return {
        success: false,
        newServicePeriodId: '',
        error: error.message || 'Reinstatement failed',
      };
    }
  }

  /**
   * Undo a recent termination (only if final pay not processed)
   */
  async undoTermination(tenantId: string, staffId: string): Promise<{ success: boolean; error?: string }> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    try {
      await this.apiClient.delete(
        `/employees/${mapping.simplePayEmployeeId}/service_periods/undo_end_service`,
      );

      // Update local sync record
      const localRecord = await this.servicePeriodSyncRepo.findByStaff(tenantId, staffId);
      const terminatedRecord = localRecord.find(r => !r.isActive);
      if (terminatedRecord) {
        await this.servicePeriodSyncRepo.undoTermination(terminatedRecord.id);
      }

      this.logger.log(`Undid termination for employee ${staffId}`);

      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to undo termination for employee ${staffId}: ${error}`);

      // Check for specific error
      if (error.response?.data?.error?.code === 'FINAL_PAY_PROCESSED') {
        return {
          success: false,
          error: 'Cannot undo termination after final pay run processed',
        };
      }

      return {
        success: false,
        error: error.message || 'Undo termination failed',
      };
    }
  }

  /**
   * Sync service period to local database
   */
  private async syncServicePeriod(
    tenantId: string,
    staffId: string,
    simplePayEmployeeId: string,
    period: ServicePeriod,
  ): Promise<void> {
    const existing = await this.servicePeriodSyncRepo.findBySimplePayPeriodId(
      tenantId,
      staffId,
      period.id,
    );

    if (existing) {
      // Update existing record
      await this.servicePeriodSyncRepo.update(existing.id, {
        endDate: period.endDate || undefined,
        terminationCode: period.terminationCode || undefined,
        terminationReason: period.terminationReason || undefined,
        finalPayslipId: period.finalPayslipId || undefined,
        isActive: period.isActive,
      });
    } else {
      // Create new record
      await this.servicePeriodSyncRepo.create({
        tenantId,
        staffId,
        simplePayEmployeeId,
        simplePayPeriodId: period.id,
        startDate: period.startDate,
        endDate: period.endDate || undefined,
        terminationCode: period.terminationCode || undefined,
        terminationReason: period.terminationReason || undefined,
        finalPayslipId: period.finalPayslipId || undefined,
        isActive: period.isActive,
      });
    }
  }

  /**
   * Map SimplePay API response to internal type
   */
  private mapServicePeriod(sp: SimplePayServicePeriod): ServicePeriod {
    return {
      id: sp.id,
      employeeId: sp.employee_id,
      startDate: new Date(sp.start_date),
      endDate: sp.end_date ? new Date(sp.end_date) : null,
      terminationCode: sp.termination_code ? SIMPLEPAY_CODE_MAP[sp.termination_code] : null,
      terminationReason: sp.termination_reason || null,
      isActive: sp.is_active,
      finalPayslipId: sp.final_payslip_id || null,
    };
  }

  /**
   * Get default termination reason for code
   */
  private getDefaultReason(code: TerminationCode): string {
    const reasons: Record<TerminationCode, string> = {
      [TerminationCode.RESIGNATION]: 'Resignation',
      [TerminationCode.DISMISSAL_MISCONDUCT]: 'Dismissal - Misconduct',
      [TerminationCode.DISMISSAL_INCAPACITY]: 'Dismissal - Incapacity',
      [TerminationCode.RETRENCHMENT]: 'Retrenchment',
      [TerminationCode.CONTRACT_EXPIRY]: 'Contract Expiry',
      [TerminationCode.RETIREMENT]: 'Retirement',
      [TerminationCode.DEATH]: 'Death',
      [TerminationCode.ABSCONDED]: 'Absconded',
      [TerminationCode.TRANSFER]: 'Transfer',
    };
    return reasons[code];
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

```typescript
// ============================================
// Service Period Management
// ============================================

@Get('employees/:staffId/service-periods')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.VIEWER)
@ApiOperation({ summary: 'Get employee service periods' })
@ApiResponse({ status: 200, type: ServicePeriodsListResponseDto })
async getServicePeriods(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<ServicePeriodsListResponseDto> {
  const periods = await this.servicePeriodService.getServicePeriods(
    user.tenantId,
    staffId,
  );
  const currentPeriod = periods.find(p => p.isActive);

  return {
    servicePeriods: periods.map(p => ({
      id: p.id,
      startDate: p.startDate,
      endDate: p.endDate || undefined,
      terminationCode: p.terminationCode || undefined,
      terminationReason: p.terminationReason || undefined,
      isActive: p.isActive,
      finalPayslipId: p.finalPayslipId || undefined,
    })),
    currentPeriod: currentPeriod
      ? {
          id: currentPeriod.id,
          startDate: currentPeriod.startDate,
          isActive: currentPeriod.isActive,
        }
      : undefined,
  };
}

@Post('employees/:staffId/terminate')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Terminate employee in SimplePay' })
@ApiResponse({ status: 200, type: TerminationResultDto })
async terminateEmployee(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: TerminateEmployeeDto,
): Promise<TerminationResultDto> {
  return this.servicePeriodService.terminateEmployee(user.tenantId, staffId, {
    terminationDate: dto.terminationDate,
    terminationCode: dto.terminationCode,
    lastWorkingDay: dto.lastWorkingDay,
    reason: dto.reason,
    processFinalPay: dto.processFinalPay,
    payNoticePeriod: dto.payNoticePeriod,
  });
}

@Post('employees/:staffId/reinstate')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Reinstate terminated employee' })
@ApiResponse({ status: 200, type: ReinstatementResultDto })
async reinstateEmployee(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: ReinstateEmployeeDto,
): Promise<ReinstatementResultDto> {
  return this.servicePeriodService.reinstateEmployee(user.tenantId, staffId, {
    reinstateDate: dto.reinstateDate,
    waveId: dto.waveId,
    reason: dto.reason,
  });
}

@Delete('employees/:staffId/termination')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Undo recent termination' })
async undoTermination(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<{ success: boolean; error?: string }> {
  return this.servicePeriodService.undoTermination(user.tenantId, staffId);
}
```
</controller_additions>

<offboarding_integration>
## Update src/api/staff/staff-offboarding.service.ts

Add SimplePay sync to the offboarding workflow:

```typescript
// Add to imports
import { SimplePayServicePeriodService } from '../../integrations/simplepay/simplepay-service-period.service';
import { TerminationCode, TERMINATION_CODE_MAP } from '../../database/entities/service-period.entity';

// Add to constructor
constructor(
  // ... existing dependencies ...
  private readonly simplePayServicePeriodService: SimplePayServicePeriodService,
) {}

// Add to completeOffboarding method (or create if not exists)
async completeOffboarding(tenantId: string, offboardingId: string): Promise<void> {
  const offboarding = await this.getOffboarding(offboardingId);

  // Check if SimplePay is connected
  const connection = await this.simplePayRepo.findConnection(tenantId);
  if (connection?.isActive) {
    // Sync termination to SimplePay
    const result = await this.simplePayServicePeriodService.terminateEmployee(
      tenantId,
      offboarding.staffId,
      {
        terminationDate: offboarding.lastDay,
        terminationCode: this.mapOffboardingReasonToTerminationCode(offboarding.reason),
        lastWorkingDay: offboarding.lastWorkingDay,
        reason: offboarding.notes,
        processFinalPay: true,
      },
    );

    if (!result.success) {
      this.logger.warn(`SimplePay termination failed for ${offboarding.staffId}: ${result.error}`);
      // Continue with offboarding even if SimplePay sync fails
    }
  }

  // ... existing offboarding logic ...
}

// Add helper method
private mapOffboardingReasonToTerminationCode(reason: string): TerminationCode {
  const mapping: Record<string, TerminationCode> = {
    'resignation': TerminationCode.RESIGNATION,
    'dismissal': TerminationCode.DISMISSAL_MISCONDUCT,
    'retrenchment': TerminationCode.RETRENCHMENT,
    'contract_end': TerminationCode.CONTRACT_EXPIRY,
    'retirement': TerminationCode.RETIREMENT,
    'death': TerminationCode.DEATH,
  };
  return mapping[reason.toLowerCase()] || TerminationCode.RESIGNATION;
}
```
</offboarding_integration>

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
import { SimplePayCalculationsService } from './simplepay-calculations.service';
import { SimplePayServicePeriodService } from './simplepay-service-period.service';  // ADD

@Module({
  imports: [ConfigModule, DatabaseModule, SharedModule],
  providers: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,
    SimplePayCalculationsService,
    SimplePayServicePeriodService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayPayRunService,
    SimplePayCalculationsService,
    SimplePayServicePeriodService,  // ADD
  ],
})
export class SimplePayModule {}
```
</module_update>

<test_cleanup_update>
## UPDATE ALL EXISTING TEST FILES

Add this line at the TOP of the beforeEach cleanup:

```typescript
beforeEach(async () => {
  // CRITICAL: Clean in FK order - leaf tables first!
  await prisma.servicePeriodSync.deleteMany({});  // ADD THIS
  // ... all other existing deleteMany calls ...
});
```
</test_cleanup_update>

<index_updates>
## Update src/database/entities/index.ts
```typescript
export * from './service-period.entity';
```

## Update src/database/dto/index.ts
```typescript
export * from './service-period.dto';
```

## Update src/database/repositories/index.ts
```typescript
export * from './service-period-sync.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-service-period.service.spec.ts (12+ tests)
- getServicePeriods: returns periods, syncs to local
- getCurrentServicePeriod: returns active, returns null if none
- terminateEmployee: terminates with correct code, updates local record, handles error
- reinstateEmployee: creates new period, handles active employee error
- undoTermination: removes termination, handles final pay error

### tests/database/repositories/service-period-sync.repository.spec.ts (8+ tests)
- create: creates record, throws on duplicate
- findByStaff: returns all periods
- findActiveByStaff: returns active only
- markTerminated: updates termination fields
- undoTermination: clears termination fields

Test data:
```typescript
const testServicePeriod = {
  tenantId: '', // set in beforeEach
  staffId: '', // set in beforeEach
  simplePayEmployeeId: 'emp_123',
  simplePayPeriodId: 'sp_456',
  startDate: new Date('2024-01-15'),
  endDate: null,
  terminationCode: null,
  isActive: true,
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# 2. Run migration
npx prisma migrate dev --name create_service_period_sync

# 3. Generate client
npx prisma generate

# 4. Create files in order
# 5-12. Create/update all files

# 13. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 445+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - SA UI-19 termination codes must be correctly mapped
    - UIF eligibility must be tracked per termination code
    - SimplePay API responses are wrapped
    - Offboarding workflow must sync to SimplePay
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 445+ tests passing
    - Termination with all codes works
    - Reinstatement creates new service period
    - Undo termination works (before final pay)
    - Offboarding syncs to SimplePay
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Use incorrect SA termination codes
  - Allow termination without valid code
  - Allow undo after final pay processed
  - Forget to sync service periods locally
</anti_patterns>

</task_spec>

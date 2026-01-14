# TASK-SPAY-007: SimplePay Bulk Operations Service

## Task Metadata
| Field | Value |
|-------|-------|
| Task ID | TASK-SPAY-007 |
| Priority | P3-MEDIUM |
| Layer | Logic |
| Phase | 14 - Comprehensive SimplePay Integration |
| Dependencies | TASK-STAFF-004, TASK-SPAY-003 |
| Status | Pending |
| Estimated Effort | 3 hours |

---

## Executive Summary

Implement bulk operations service for efficiently updating multiple employees or payslips in a single API call. This reduces API calls from potentially hundreds down to 1-2, staying well within SimplePay's rate limit of 60 requests/minute. Key use cases include annual salary reviews, thirteenth cheque distribution, pension fund enrollment, and mass data corrections.

---

## Context for AI Agent

<context>
<project_overview>
CrecheBooks is a multi-tenant SaaS application for South African childcare centers (crèches). This task implements the SimplePay Bulk Operations Service which allows efficient batch processing of payroll updates. SimplePay is an external South African payroll provider.
</project_overview>

<technology_stack>
- Runtime: Node.js with TypeScript (strict mode)
- Framework: NestJS with dependency injection
- Database: PostgreSQL with Prisma ORM
- Testing: Jest with `pnpm test --runInBand`
- Package Manager: pnpm (NOT npm)
- API Style: RESTful with OpenAPI/Swagger documentation
</technology_stack>

<simplepay_api_critical_info>
- Base URL: `https://api.payroll.simplepay.cloud/v1`
- Authentication: API key in header `Authorization: apikey YOUR_API_KEY`
- Rate Limit: 60 requests per minute (1000 per hour)
- CRITICAL: Bulk operations count as SINGLE request regardless of entity count
- API responses use snake_case, TypeScript uses camelCase
- MUST call `initializeForTenant(tenantId)` before any API call
</simplepay_api_critical_info>

<rate_limit_optimization>
| Operation | Individual Calls | Bulk Call | Savings |
|-----------|------------------|-----------|---------|
| Update 50 employees | 50 calls | 1 call | 98% |
| Distribute 30 bonuses | 30 calls | 1 call | 97% |
| Salary review 100 staff | 100 calls | 1-2 calls | 98-99% |
| Setup 20 deductions | 20 calls | 1 call | 95% |

**Recommendation**: For operations affecting >10 entities, ALWAYS use bulk operations.
</rate_limit_optimization>

<file_locations>
- Service: `src/integrations/simplepay/simplepay-bulk.service.ts`
- Repository: `src/database/repositories/bulk-operation-log.repository.ts`
- DTOs: `src/database/dto/bulk-operations.dto.ts`
- Entity: `src/database/entities/bulk-operation-log.entity.ts`
- Tests: `tests/integrations/simplepay/simplepay-bulk.service.spec.ts`
- API Client: `src/integrations/simplepay/simplepay-api.client.ts` (existing)
</file_locations>

<coding_standards>
- Use `string | null` not `string?` for nullable fields in entities
- Export enums from entity files, NOT from `@prisma/client`
- All monetary values stored as cents (integer)
- All dates as ISO 8601 strings for API, Date objects internally
- Transform snake_case API responses to camelCase TypeScript
- Log all bulk operations for audit trail
</coding_standards>
</context>

---

## SimplePay Bulk Input API

### Endpoint Documentation

```
POST /v1/clients/:client_id/bulk_input
Authorization: apikey YOUR_API_KEY
Content-Type: application/json
```

### Request Format

```json
{
  "entities": [
    {
      "type": "employee",
      "id": 12345,
      "data": {
        "email": "newemail@example.com",
        "cell_number": "0821234567"
      }
    },
    {
      "type": "calculation",
      "id": 67890,
      "data": {
        "amount": 5000.00
      }
    },
    {
      "type": "payslip_calculation",
      "payslip_id": 11111,
      "item_code": "BONUS",
      "data": {
        "amount": 10000.00
      }
    }
  ],
  "validate_only": false
}
```

### Response Format (Success)

```json
{
  "bulk_input": {
    "processed": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "type": "employee",
        "id": 12345,
        "status": "success"
      },
      {
        "type": "calculation",
        "id": 67890,
        "status": "success"
      },
      {
        "type": "payslip_calculation",
        "payslip_id": 11111,
        "item_code": "BONUS",
        "status": "success",
        "calculation_id": 99999
      }
    ],
    "errors": [],
    "warnings": []
  }
}
```

### Response Format (Partial Failure)

```json
{
  "bulk_input": {
    "processed": 3,
    "successful": 2,
    "failed": 1,
    "results": [
      {
        "type": "employee",
        "id": 12345,
        "status": "success"
      },
      {
        "type": "calculation",
        "id": 67890,
        "status": "failed",
        "error": "Calculation not found"
      },
      {
        "type": "payslip_calculation",
        "payslip_id": 11111,
        "item_code": "BONUS",
        "status": "success",
        "calculation_id": 99999
      }
    ],
    "errors": [
      {
        "type": "calculation",
        "id": 67890,
        "message": "Calculation not found"
      }
    ],
    "warnings": []
  }
}
```

### Supported Entity Types

| Type | Description | Required Fields |
|------|-------------|-----------------|
| `employee` | Update employee details | `id`, `data` |
| `calculation` | Update existing calculation | `id`, `data` |
| `payslip_calculation` | Add/update calculation on payslip | `payslip_id`, `item_code`, `data` |
| `inherited_calculation` | Update inherited calculation | `employee_id`, `item_code`, `data` |

---

## Prisma Schema

```prisma
// Add to prisma/schema.prisma

enum BulkOperationType {
  GENERIC_INPUT
  SALARY_ADJUSTMENT
  BONUS_DISTRIBUTION
  DEDUCTION_SETUP
  EMPLOYEE_UPDATE
}

enum BulkOperationStatus {
  PENDING
  PROCESSING
  COMPLETED
  PARTIAL_FAILURE
  FAILED
}

model BulkOperationLog {
  id              String               @id @default(cuid())
  tenantId        String
  operationType   BulkOperationType
  status          BulkOperationStatus  @default(PENDING)
  totalEntities   Int
  successCount    Int                  @default(0)
  failureCount    Int                  @default(0)
  requestData     Json
  resultData      Json?
  errors          Json?
  warnings        Json?
  executedBy      String
  startedAt       DateTime             @default(now())
  completedAt     DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@index([operationType])
  @@index([status])
  @@index([startedAt])
}
```

---

## Entity Definition

```typescript
// src/database/entities/bulk-operation-log.entity.ts

export enum BulkOperationType {
  GENERIC_INPUT = 'GENERIC_INPUT',
  SALARY_ADJUSTMENT = 'SALARY_ADJUSTMENT',
  BONUS_DISTRIBUTION = 'BONUS_DISTRIBUTION',
  DEDUCTION_SETUP = 'DEDUCTION_SETUP',
  EMPLOYEE_UPDATE = 'EMPLOYEE_UPDATE',
}

export enum BulkOperationStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  FAILED = 'FAILED',
}

export interface BulkOperationLogEntity {
  id: string;
  tenantId: string;
  operationType: BulkOperationType;
  status: BulkOperationStatus;
  totalEntities: number;
  successCount: number;
  failureCount: number;
  requestData: Record<string, unknown>;
  resultData: Record<string, unknown> | null;
  errors: BulkOperationError[] | null;
  warnings: string[] | null;
  executedBy: string;
  startedAt: Date;
  completedAt: Date | null;
}

export interface BulkOperationError {
  entityId: string;
  entityType: string;
  errorCode: string;
  errorMessage: string;
  validationErrors?: string[];
}
```

---

## DTO Definitions

```typescript
// src/database/dto/bulk-operations.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  IsDate,
  ValidateNested,
  IsObject,
  Min,
  Max,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

// ============================================
// Generic Bulk Input DTOs
// ============================================

export class BulkEntityDto {
  @ApiProperty({ enum: ['employee', 'calculation', 'payslip_calculation', 'inherited_calculation'] })
  @IsEnum(['employee', 'calculation', 'payslip_calculation', 'inherited_calculation'])
  type: 'employee' | 'calculation' | 'payslip_calculation' | 'inherited_calculation';

  @ApiPropertyOptional({ description: 'Entity ID for employee/calculation updates' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiPropertyOptional({ description: 'Payslip ID for payslip_calculation type' })
  @IsOptional()
  @IsString()
  payslipId?: string;

  @ApiPropertyOptional({ description: 'Employee ID for inherited_calculation type' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Item code for calculation types' })
  @IsOptional()
  @IsString()
  itemCode?: string;

  @ApiProperty({ description: 'Data to update' })
  @IsObject()
  data: Record<string, unknown>;
}

export class BulkInputRequestDto {
  @ApiProperty({ type: [BulkEntityDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEntityDto)
  entities: BulkEntityDto[];

  @ApiPropertyOptional({ description: 'Validate only without executing', default: false })
  @IsOptional()
  @IsBoolean()
  validateOnly?: boolean;
}

// ============================================
// Salary Adjustment DTOs
// ============================================

export class SalaryAdjustmentDto {
  @ApiProperty()
  @IsString()
  staffId: string;

  @ApiPropertyOptional({ description: 'New salary amount in Rands' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  newSalary?: number;

  @ApiPropertyOptional({ description: 'Percentage increase (e.g., 5.5 for 5.5%)' })
  @IsOptional()
  @IsNumber()
  @Min(-100)
  @Max(100)
  percentageIncrease?: number;

  @ApiProperty()
  @IsDate()
  @Type(() => Date)
  effectiveDate: Date;
}

export class BulkSalaryAdjustmentRequestDto {
  @ApiProperty({ type: [SalaryAdjustmentDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SalaryAdjustmentDto)
  adjustments: SalaryAdjustmentDto[];
}

// ============================================
// Bonus Distribution DTOs
// ============================================

export enum BonusType {
  ANNUAL = 'annual',
  PERFORMANCE = 'performance',
  THIRTEENTH_CHEQUE = 'thirteenth_cheque',
  DISCRETIONARY = 'discretionary',
}

export class BonusDistributionDto {
  @ApiProperty()
  @IsString()
  staffId: string;

  @ApiProperty({ description: 'Bonus amount in Rands' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiProperty({ enum: BonusType })
  @IsEnum(BonusType)
  bonusType: BonusType;

  @ApiPropertyOptional({ description: 'Specific payslip ID (defaults to next open payslip)' })
  @IsOptional()
  @IsString()
  effectivePayslipId?: string;
}

export class BulkBonusDistributionRequestDto {
  @ApiProperty({ type: [BonusDistributionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BonusDistributionDto)
  distributions: BonusDistributionDto[];
}

// ============================================
// Deduction Setup DTOs
// ============================================

export class BulkDeductionDto {
  @ApiProperty()
  @IsString()
  staffId: string;

  @ApiProperty({ description: 'SimplePay deduction item code' })
  @IsString()
  deductionCode: string;

  @ApiProperty({ description: 'Deduction amount in Rands' })
  @IsNumber()
  @Min(0)
  amount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  startDate?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  endDate?: Date;
}

export class BulkDeductionSetupRequestDto {
  @ApiProperty({ type: [BulkDeductionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkDeductionDto)
  deductions: BulkDeductionDto[];
}

// ============================================
// Employee Update DTOs
// ============================================

export class BankAccountDto {
  @ApiProperty({ description: 'SimplePay bank ID' })
  @IsNumber()
  bankId: number;

  @ApiProperty()
  @IsString()
  accountNumber: string;

  @ApiProperty()
  @IsString()
  branchCode: string;

  @ApiProperty({ enum: ['cheque', 'savings', 'transmission'] })
  @IsEnum(['cheque', 'savings', 'transmission'])
  accountType: 'cheque' | 'savings' | 'transmission';
}

export class AddressDto {
  @ApiProperty()
  @IsString()
  line1: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  line2?: string;

  @ApiProperty()
  @IsString()
  city: string;

  @ApiProperty({ description: 'South African province' })
  @IsString()
  province: string;

  @ApiProperty()
  @IsString()
  postalCode: string;
}

export class EmployeeUpdateDataDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: BankAccountDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankAccountDto)
  bankAccount?: BankAccountDto;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;
}

export class BulkEmployeeUpdateDto {
  @ApiProperty()
  @IsString()
  staffId: string;

  @ApiProperty({ type: EmployeeUpdateDataDto })
  @ValidateNested()
  @Type(() => EmployeeUpdateDataDto)
  updates: EmployeeUpdateDataDto;
}

export class BulkEmployeeUpdateRequestDto {
  @ApiProperty({ type: [BulkEmployeeUpdateDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkEmployeeUpdateDto)
  updates: BulkEmployeeUpdateDto[];
}

// ============================================
// Response DTOs
// ============================================

export class BulkOperationErrorDto {
  @ApiProperty()
  entityId: string;

  @ApiProperty()
  entityType: string;

  @ApiProperty()
  errorCode: string;

  @ApiProperty()
  errorMessage: string;

  @ApiPropertyOptional({ type: [String] })
  validationErrors?: string[];
}

export class BulkOperationResultDto {
  @ApiProperty()
  operationId: string;

  @ApiProperty()
  successful: number;

  @ApiProperty()
  failed: number;

  @ApiProperty()
  total: number;

  @ApiProperty({ type: [BulkOperationErrorDto] })
  errors: BulkOperationErrorDto[];

  @ApiProperty({ type: [String] })
  warnings: string[];

  @ApiProperty()
  status: string;
}
```

---

## Repository Implementation

```typescript
// src/database/repositories/bulk-operation-log.repository.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  BulkOperationLogEntity,
  BulkOperationType,
  BulkOperationStatus,
  BulkOperationError,
} from '../entities/bulk-operation-log.entity';

export interface CreateBulkOperationLogInput {
  tenantId: string;
  operationType: BulkOperationType;
  totalEntities: number;
  requestData: Record<string, unknown>;
  executedBy: string;
}

export interface UpdateBulkOperationLogInput {
  status?: BulkOperationStatus;
  successCount?: number;
  failureCount?: number;
  resultData?: Record<string, unknown>;
  errors?: BulkOperationError[];
  warnings?: string[];
  completedAt?: Date;
}

@Injectable()
export class BulkOperationLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateBulkOperationLogInput): Promise<BulkOperationLogEntity> {
    const record = await this.prisma.bulkOperationLog.create({
      data: {
        tenantId: input.tenantId,
        operationType: input.operationType,
        status: BulkOperationStatus.PENDING,
        totalEntities: input.totalEntities,
        requestData: input.requestData,
        executedBy: input.executedBy,
      },
    });

    return this.mapToEntity(record);
  }

  async update(id: string, input: UpdateBulkOperationLogInput): Promise<BulkOperationLogEntity> {
    const record = await this.prisma.bulkOperationLog.update({
      where: { id },
      data: {
        status: input.status,
        successCount: input.successCount,
        failureCount: input.failureCount,
        resultData: input.resultData ?? undefined,
        errors: input.errors ?? undefined,
        warnings: input.warnings ?? undefined,
        completedAt: input.completedAt,
      },
    });

    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<BulkOperationLogEntity | null> {
    const record = await this.prisma.bulkOperationLog.findUnique({
      where: { id },
    });

    return record ? this.mapToEntity(record) : null;
  }

  async findByTenant(
    tenantId: string,
    options?: {
      operationType?: BulkOperationType;
      status?: BulkOperationStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<BulkOperationLogEntity[]> {
    const records = await this.prisma.bulkOperationLog.findMany({
      where: {
        tenantId,
        ...(options?.operationType && { operationType: options.operationType }),
        ...(options?.status && { status: options.status }),
      },
      orderBy: { startedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return records.map((r) => this.mapToEntity(r));
  }

  async findRecentByTenant(tenantId: string, days: number = 30): Promise<BulkOperationLogEntity[]> {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const records = await this.prisma.bulkOperationLog.findMany({
      where: {
        tenantId,
        startedAt: { gte: since },
      },
      orderBy: { startedAt: 'desc' },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: any): BulkOperationLogEntity {
    return {
      id: record.id,
      tenantId: record.tenantId,
      operationType: record.operationType as BulkOperationType,
      status: record.status as BulkOperationStatus,
      totalEntities: record.totalEntities,
      successCount: record.successCount,
      failureCount: record.failureCount,
      requestData: record.requestData as Record<string, unknown>,
      resultData: record.resultData as Record<string, unknown> | null,
      errors: record.errors as BulkOperationError[] | null,
      warnings: record.warnings as string[] | null,
      executedBy: record.executedBy,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
  }
}
```

---

## Service Implementation

```typescript
// src/integrations/simplepay/simplepay-bulk.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { BulkOperationLogRepository } from '../../database/repositories/bulk-operation-log.repository';
import { StaffRepository } from '../../database/repositories/staff.repository';
import {
  BulkOperationType,
  BulkOperationStatus,
  BulkOperationError,
} from '../../database/entities/bulk-operation-log.entity';
import {
  BulkEntityDto,
  BulkInputRequestDto,
  SalaryAdjustmentDto,
  BonusDistributionDto,
  BonusType,
  BulkDeductionDto,
  BulkEmployeeUpdateDto,
  BulkOperationResultDto,
} from '../../database/dto/bulk-operations.dto';

// ============================================
// Internal Interfaces
// ============================================

interface SimplePayBulkEntity {
  type: string;
  id?: number;
  payslip_id?: number;
  employee_id?: number;
  item_code?: string;
  data: Record<string, unknown>;
}

interface SimplePayBulkResponse {
  bulk_input: {
    processed: number;
    successful: number;
    failed: number;
    results: Array<{
      type: string;
      id?: number;
      payslip_id?: number;
      item_code?: string;
      status: 'success' | 'failed';
      error?: string;
      calculation_id?: number;
    }>;
    errors: Array<{
      type: string;
      id?: number;
      message: string;
    }>;
    warnings: string[];
  };
}

// ============================================
// Service Implementation
// ============================================

@Injectable()
export class SimplePayBulkService {
  private readonly logger = new Logger(SimplePayBulkService.name);

  constructor(
    private readonly simplePayClient: SimplePayApiClient,
    private readonly bulkOperationLogRepo: BulkOperationLogRepository,
    private readonly staffRepository: StaffRepository,
  ) {}

  // ============================================
  // Generic Bulk Input
  // ============================================

  async processBulkInput(
    tenantId: string,
    request: BulkInputRequestDto,
    executedBy: string,
  ): Promise<BulkOperationResultDto> {
    // Create operation log
    const operationLog = await this.bulkOperationLogRepo.create({
      tenantId,
      operationType: BulkOperationType.GENERIC_INPUT,
      totalEntities: request.entities.length,
      requestData: { entities: request.entities, validateOnly: request.validateOnly },
      executedBy,
    });

    try {
      // Update status to processing
      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      // Initialize SimplePay client for tenant
      await this.simplePayClient.initializeForTenant(tenantId);

      // Transform entities to SimplePay format
      const simplePayEntities = await this.transformEntities(tenantId, request.entities);

      // Call SimplePay bulk API
      const response = await this.callBulkApi(simplePayEntities, request.validateOnly ?? false);

      // Process response
      const result = this.processResponse(operationLog.id, response);

      // Update operation log
      const finalStatus = result.failed === 0
        ? BulkOperationStatus.COMPLETED
        : result.successful === 0
          ? BulkOperationStatus.FAILED
          : BulkOperationStatus.PARTIAL_FAILURE;

      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: finalStatus,
        successCount: result.successful,
        failureCount: result.failed,
        resultData: response.bulk_input as unknown as Record<string, unknown>,
        errors: result.errors,
        warnings: result.warnings,
        completedAt: new Date(),
      });

      return result;
    } catch (error) {
      this.logger.error(`Bulk operation failed: ${error.message}`, error.stack);

      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.FAILED,
        errors: [{
          entityId: 'system',
          entityType: 'system',
          errorCode: 'BULK_OPERATION_FAILED',
          errorMessage: error.message,
        }],
        completedAt: new Date(),
      });

      throw error;
    }
  }

  // ============================================
  // Bulk Salary Adjustments
  // ============================================

  async bulkAdjustSalaries(
    tenantId: string,
    adjustments: SalaryAdjustmentDto[],
    executedBy: string,
  ): Promise<BulkOperationResultDto> {
    const operationLog = await this.bulkOperationLogRepo.create({
      tenantId,
      operationType: BulkOperationType.SALARY_ADJUSTMENT,
      totalEntities: adjustments.length,
      requestData: { adjustments },
      executedBy,
    });

    try {
      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      await this.simplePayClient.initializeForTenant(tenantId);

      // Build bulk entities for salary adjustments
      const entities: SimplePayBulkEntity[] = [];

      for (const adjustment of adjustments) {
        const staff = await this.staffRepository.findById(adjustment.staffId);
        if (!staff?.simplePayEmployeeId) {
          this.logger.warn(`Staff ${adjustment.staffId} not linked to SimplePay`);
          continue;
        }

        // Calculate new salary
        let newSalaryAmount: number;
        if (adjustment.newSalary !== undefined) {
          newSalaryAmount = adjustment.newSalary;
        } else if (adjustment.percentageIncrease !== undefined) {
          const currentSalary = staff.basicSalaryCents / 100;
          newSalaryAmount = currentSalary * (1 + adjustment.percentageIncrease / 100);
        } else {
          continue;
        }

        // Find the basic salary inherited calculation
        entities.push({
          type: 'inherited_calculation',
          employee_id: parseInt(staff.simplePayEmployeeId, 10),
          item_code: 'BASIC', // Standard SimplePay basic salary code
          data: {
            amount: Math.round(newSalaryAmount * 100) / 100,
            effective_date: adjustment.effectiveDate.toISOString().split('T')[0],
          },
        });
      }

      if (entities.length === 0) {
        return {
          operationId: operationLog.id,
          successful: 0,
          failed: adjustments.length,
          total: adjustments.length,
          errors: [{
            entityId: 'all',
            entityType: 'salary_adjustment',
            errorCode: 'NO_VALID_STAFF',
            errorMessage: 'No staff members are linked to SimplePay',
          }],
          warnings: [],
          status: 'FAILED',
        };
      }

      const response = await this.callBulkApi(entities, false);
      const result = this.processResponse(operationLog.id, response);

      await this.updateOperationLog(operationLog.id, result, response);

      return result;
    } catch (error) {
      await this.handleOperationError(operationLog.id, error);
      throw error;
    }
  }

  // ============================================
  // Bulk Bonus Distribution
  // ============================================

  async distributeBonuses(
    tenantId: string,
    distributions: BonusDistributionDto[],
    executedBy: string,
  ): Promise<BulkOperationResultDto> {
    const operationLog = await this.bulkOperationLogRepo.create({
      tenantId,
      operationType: BulkOperationType.BONUS_DISTRIBUTION,
      totalEntities: distributions.length,
      requestData: { distributions },
      executedBy,
    });

    try {
      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      await this.simplePayClient.initializeForTenant(tenantId);

      const entities: SimplePayBulkEntity[] = [];

      for (const distribution of distributions) {
        const staff = await this.staffRepository.findById(distribution.staffId);
        if (!staff?.simplePayEmployeeId) {
          this.logger.warn(`Staff ${distribution.staffId} not linked to SimplePay`);
          continue;
        }

        // Map bonus type to SimplePay item code
        const itemCode = this.mapBonusTypeToItemCode(distribution.bonusType);

        if (distribution.effectivePayslipId) {
          // Add to specific payslip
          entities.push({
            type: 'payslip_calculation',
            payslip_id: parseInt(distribution.effectivePayslipId, 10),
            item_code: itemCode,
            data: {
              amount: distribution.amount,
            },
          });
        } else {
          // Add as recurring calculation (will appear on next payslip)
          entities.push({
            type: 'calculation',
            employee_id: parseInt(staff.simplePayEmployeeId, 10),
            item_code: itemCode,
            data: {
              amount: distribution.amount,
              once_off: true, // Single payment, not recurring
            },
          });
        }
      }

      if (entities.length === 0) {
        return this.createEmptyResult(operationLog.id, distributions.length, 'bonus');
      }

      const response = await this.callBulkApi(entities, false);
      const result = this.processResponse(operationLog.id, response);

      await this.updateOperationLog(operationLog.id, result, response);

      return result;
    } catch (error) {
      await this.handleOperationError(operationLog.id, error);
      throw error;
    }
  }

  // ============================================
  // Bulk Deduction Setup
  // ============================================

  async setupBulkDeductions(
    tenantId: string,
    deductions: BulkDeductionDto[],
    executedBy: string,
  ): Promise<BulkOperationResultDto> {
    const operationLog = await this.bulkOperationLogRepo.create({
      tenantId,
      operationType: BulkOperationType.DEDUCTION_SETUP,
      totalEntities: deductions.length,
      requestData: { deductions },
      executedBy,
    });

    try {
      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      await this.simplePayClient.initializeForTenant(tenantId);

      const entities: SimplePayBulkEntity[] = [];

      for (const deduction of deductions) {
        const staff = await this.staffRepository.findById(deduction.staffId);
        if (!staff?.simplePayEmployeeId) {
          this.logger.warn(`Staff ${deduction.staffId} not linked to SimplePay`);
          continue;
        }

        const data: Record<string, unknown> = {
          amount: deduction.amount,
        };

        if (deduction.startDate) {
          data.start_date = deduction.startDate.toISOString().split('T')[0];
        }
        if (deduction.endDate) {
          data.end_date = deduction.endDate.toISOString().split('T')[0];
        }

        entities.push({
          type: 'inherited_calculation',
          employee_id: parseInt(staff.simplePayEmployeeId, 10),
          item_code: deduction.deductionCode,
          data,
        });
      }

      if (entities.length === 0) {
        return this.createEmptyResult(operationLog.id, deductions.length, 'deduction');
      }

      const response = await this.callBulkApi(entities, false);
      const result = this.processResponse(operationLog.id, response);

      await this.updateOperationLog(operationLog.id, result, response);

      return result;
    } catch (error) {
      await this.handleOperationError(operationLog.id, error);
      throw error;
    }
  }

  // ============================================
  // Bulk Employee Update
  // ============================================

  async bulkUpdateEmployees(
    tenantId: string,
    updates: BulkEmployeeUpdateDto[],
    executedBy: string,
  ): Promise<BulkOperationResultDto> {
    const operationLog = await this.bulkOperationLogRepo.create({
      tenantId,
      operationType: BulkOperationType.EMPLOYEE_UPDATE,
      totalEntities: updates.length,
      requestData: { updates },
      executedBy,
    });

    try {
      await this.bulkOperationLogRepo.update(operationLog.id, {
        status: BulkOperationStatus.PROCESSING,
      });

      await this.simplePayClient.initializeForTenant(tenantId);

      const entities: SimplePayBulkEntity[] = [];

      for (const update of updates) {
        const staff = await this.staffRepository.findById(update.staffId);
        if (!staff?.simplePayEmployeeId) {
          this.logger.warn(`Staff ${update.staffId} not linked to SimplePay`);
          continue;
        }

        const data: Record<string, unknown> = {};

        if (update.updates.email) {
          data.email = update.updates.email;
        }
        if (update.updates.phone) {
          data.cell_number = update.updates.phone;
        }
        if (update.updates.bankAccount) {
          data.bank_id = update.updates.bankAccount.bankId;
          data.bank_account_number = update.updates.bankAccount.accountNumber;
          data.bank_branch_code = update.updates.bankAccount.branchCode;
          data.bank_account_type = update.updates.bankAccount.accountType;
        }
        if (update.updates.address) {
          data.address_line_1 = update.updates.address.line1;
          data.address_line_2 = update.updates.address.line2 ?? '';
          data.address_city = update.updates.address.city;
          data.address_province = update.updates.address.province;
          data.address_postal_code = update.updates.address.postalCode;
        }

        if (Object.keys(data).length > 0) {
          entities.push({
            type: 'employee',
            id: parseInt(staff.simplePayEmployeeId, 10),
            data,
          });
        }
      }

      if (entities.length === 0) {
        return this.createEmptyResult(operationLog.id, updates.length, 'employee');
      }

      const response = await this.callBulkApi(entities, false);
      const result = this.processResponse(operationLog.id, response);

      await this.updateOperationLog(operationLog.id, result, response);

      return result;
    } catch (error) {
      await this.handleOperationError(operationLog.id, error);
      throw error;
    }
  }

  // ============================================
  // Validate Only (Dry Run)
  // ============================================

  async validateBulkOperation(
    tenantId: string,
    request: BulkInputRequestDto,
  ): Promise<BulkOperationResultDto> {
    await this.simplePayClient.initializeForTenant(tenantId);

    const simplePayEntities = await this.transformEntities(tenantId, request.entities);
    const response = await this.callBulkApi(simplePayEntities, true);

    return {
      operationId: 'validation-only',
      successful: response.bulk_input.successful,
      failed: response.bulk_input.failed,
      total: response.bulk_input.processed,
      errors: response.bulk_input.errors.map((e) => ({
        entityId: String(e.id ?? 'unknown'),
        entityType: e.type,
        errorCode: 'VALIDATION_ERROR',
        errorMessage: e.message,
      })),
      warnings: response.bulk_input.warnings,
      status: 'VALIDATED',
    };
  }

  // ============================================
  // Helper Methods
  // ============================================

  private async callBulkApi(
    entities: SimplePayBulkEntity[],
    validateOnly: boolean,
  ): Promise<SimplePayBulkResponse> {
    const clientId = await this.simplePayClient.getClientId();

    const response = await this.simplePayClient.post<SimplePayBulkResponse>(
      `/clients/${clientId}/bulk_input`,
      {
        entities,
        validate_only: validateOnly,
      },
    );

    return response;
  }

  private async transformEntities(
    tenantId: string,
    entities: BulkEntityDto[],
  ): Promise<SimplePayBulkEntity[]> {
    const result: SimplePayBulkEntity[] = [];

    for (const entity of entities) {
      const transformed: SimplePayBulkEntity = {
        type: entity.type,
        data: this.transformDataToSnakeCase(entity.data),
      };

      if (entity.id) {
        // Could be staffId or simplePayId
        const staff = await this.staffRepository.findById(entity.id);
        transformed.id = staff?.simplePayEmployeeId
          ? parseInt(staff.simplePayEmployeeId, 10)
          : parseInt(entity.id, 10);
      }
      if (entity.payslipId) {
        transformed.payslip_id = parseInt(entity.payslipId, 10);
      }
      if (entity.employeeId) {
        const staff = await this.staffRepository.findById(entity.employeeId);
        transformed.employee_id = staff?.simplePayEmployeeId
          ? parseInt(staff.simplePayEmployeeId, 10)
          : parseInt(entity.employeeId, 10);
      }
      if (entity.itemCode) {
        transformed.item_code = entity.itemCode;
      }

      result.push(transformed);
    }

    return result;
  }

  private transformDataToSnakeCase(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      result[snakeKey] = value;
    }
    return result;
  }

  private processResponse(
    operationId: string,
    response: SimplePayBulkResponse,
  ): BulkOperationResultDto {
    const errors: BulkOperationError[] = response.bulk_input.errors.map((e) => ({
      entityId: String(e.id ?? 'unknown'),
      entityType: e.type,
      errorCode: 'SIMPLEPAY_ERROR',
      errorMessage: e.message,
    }));

    return {
      operationId,
      successful: response.bulk_input.successful,
      failed: response.bulk_input.failed,
      total: response.bulk_input.processed,
      errors,
      warnings: response.bulk_input.warnings,
      status: response.bulk_input.failed === 0 ? 'COMPLETED' : 'PARTIAL_FAILURE',
    };
  }

  private mapBonusTypeToItemCode(bonusType: BonusType): string {
    const mapping: Record<BonusType, string> = {
      [BonusType.ANNUAL]: 'BONUS_ANNUAL',
      [BonusType.PERFORMANCE]: 'BONUS_PERF',
      [BonusType.THIRTEENTH_CHEQUE]: 'BONUS_13TH',
      [BonusType.DISCRETIONARY]: 'BONUS_DISC',
    };
    return mapping[bonusType] ?? 'BONUS';
  }

  private createEmptyResult(
    operationId: string,
    totalCount: number,
    entityType: string,
  ): BulkOperationResultDto {
    return {
      operationId,
      successful: 0,
      failed: totalCount,
      total: totalCount,
      errors: [{
        entityId: 'all',
        entityType,
        errorCode: 'NO_VALID_STAFF',
        errorMessage: 'No staff members are linked to SimplePay',
      }],
      warnings: [],
      status: 'FAILED',
    };
  }

  private async updateOperationLog(
    operationId: string,
    result: BulkOperationResultDto,
    response: SimplePayBulkResponse,
  ): Promise<void> {
    const finalStatus = result.failed === 0
      ? BulkOperationStatus.COMPLETED
      : result.successful === 0
        ? BulkOperationStatus.FAILED
        : BulkOperationStatus.PARTIAL_FAILURE;

    await this.bulkOperationLogRepo.update(operationId, {
      status: finalStatus,
      successCount: result.successful,
      failureCount: result.failed,
      resultData: response.bulk_input as unknown as Record<string, unknown>,
      errors: result.errors,
      warnings: result.warnings,
      completedAt: new Date(),
    });
  }

  private async handleOperationError(operationId: string, error: Error): Promise<void> {
    this.logger.error(`Bulk operation failed: ${error.message}`, error.stack);

    await this.bulkOperationLogRepo.update(operationId, {
      status: BulkOperationStatus.FAILED,
      errors: [{
        entityId: 'system',
        entityType: 'system',
        errorCode: 'BULK_OPERATION_FAILED',
        errorMessage: error.message,
      }],
      completedAt: new Date(),
    });
  }
}
```

---

## API Controller

```typescript
// Add to src/api/integrations/simplepay.controller.ts

import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { SimplePayBulkService } from '../../integrations/simplepay/simplepay-bulk.service';
import {
  BulkInputRequestDto,
  BulkSalaryAdjustmentRequestDto,
  BulkBonusDistributionRequestDto,
  BulkDeductionSetupRequestDto,
  BulkEmployeeUpdateRequestDto,
  BulkOperationResultDto,
} from '../../database/dto/bulk-operations.dto';

@ApiTags('SimplePay Bulk Operations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/integrations/simplepay/bulk')
export class SimplePayBulkController {
  constructor(private readonly bulkService: SimplePayBulkService) {}

  @Post('input')
  @ApiOperation({ summary: 'Process generic bulk input' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async processBulkInput(
    @Request() req: any,
    @Body() body: BulkInputRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.processBulkInput(
      req.tenantId,
      body,
      req.user.id,
    );
  }

  @Post('salary-adjustments')
  @ApiOperation({ summary: 'Bulk salary adjustments' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async bulkAdjustSalaries(
    @Request() req: any,
    @Body() body: BulkSalaryAdjustmentRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.bulkAdjustSalaries(
      req.tenantId,
      body.adjustments,
      req.user.id,
    );
  }

  @Post('bonuses')
  @ApiOperation({ summary: 'Bulk bonus distribution' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async distributeBonuses(
    @Request() req: any,
    @Body() body: BulkBonusDistributionRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.distributeBonuses(
      req.tenantId,
      body.distributions,
      req.user.id,
    );
  }

  @Post('deductions')
  @ApiOperation({ summary: 'Bulk deduction setup' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async setupBulkDeductions(
    @Request() req: any,
    @Body() body: BulkDeductionSetupRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.setupBulkDeductions(
      req.tenantId,
      body.deductions,
      req.user.id,
    );
  }

  @Post('employees')
  @ApiOperation({ summary: 'Bulk employee update' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async bulkUpdateEmployees(
    @Request() req: any,
    @Body() body: BulkEmployeeUpdateRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.bulkUpdateEmployees(
      req.tenantId,
      body.updates,
      req.user.id,
    );
  }

  @Post('validate')
  @ApiOperation({ summary: 'Validate bulk operation without executing' })
  @ApiResponse({ status: HttpStatus.OK, type: BulkOperationResultDto })
  async validateBulkOperation(
    @Request() req: any,
    @Body() body: BulkInputRequestDto,
  ): Promise<BulkOperationResultDto> {
    return this.bulkService.validateBulkOperation(req.tenantId, body);
  }
}
```

---

## Test Specification

```typescript
// tests/integrations/simplepay/simplepay-bulk.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { SimplePayBulkService } from '../../../src/integrations/simplepay/simplepay-bulk.service';
import { SimplePayApiClient } from '../../../src/integrations/simplepay/simplepay-api.client';
import { BulkOperationLogRepository } from '../../../src/database/repositories/bulk-operation-log.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import {
  BulkOperationType,
  BulkOperationStatus,
} from '../../../src/database/entities/bulk-operation-log.entity';
import { BonusType } from '../../../src/database/dto/bulk-operations.dto';

describe('SimplePayBulkService', () => {
  let service: SimplePayBulkService;
  let mockApiClient: jest.Mocked<SimplePayApiClient>;
  let mockBulkOperationLogRepo: jest.Mocked<BulkOperationLogRepository>;
  let mockStaffRepository: jest.Mocked<StaffRepository>;

  const tenantId = 'tenant-123';
  const executedBy = 'user-456';

  beforeEach(async () => {
    mockApiClient = {
      initializeForTenant: jest.fn().mockResolvedValue(undefined),
      getClientId: jest.fn().mockResolvedValue('client-789'),
      post: jest.fn(),
    } as any;

    mockBulkOperationLogRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findById: jest.fn(),
    } as any;

    mockStaffRepository = {
      findById: jest.fn(),
      findActiveByTenant: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePayBulkService,
        { provide: SimplePayApiClient, useValue: mockApiClient },
        { provide: BulkOperationLogRepository, useValue: mockBulkOperationLogRepo },
        { provide: StaffRepository, useValue: mockStaffRepository },
      ],
    }).compile();

    service = module.get<SimplePayBulkService>(SimplePayBulkService);
  });

  describe('processBulkInput', () => {
    it('should process generic bulk input successfully', async () => {
      const operationLog = {
        id: 'op-123',
        tenantId,
        operationType: BulkOperationType.GENERIC_INPUT,
        status: BulkOperationStatus.PENDING,
        totalEntities: 2,
      };

      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue({ ...operationLog, status: BulkOperationStatus.COMPLETED } as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 2,
          successful: 2,
          failed: 0,
          results: [
            { type: 'employee', id: 12345, status: 'success' },
            { type: 'calculation', id: 67890, status: 'success' },
          ],
          errors: [],
          warnings: [],
        },
      });

      const result = await service.processBulkInput(
        tenantId,
        {
          entities: [
            { type: 'employee', id: 'staff-1', data: { email: 'test@example.com' } },
            { type: 'calculation', id: '67890', data: { amount: 1000 } },
          ],
        },
        executedBy,
      );

      expect(result.successful).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.status).toBe('COMPLETED');
      expect(mockApiClient.initializeForTenant).toHaveBeenCalledWith(tenantId);
    });

    it('should handle partial failures', async () => {
      const operationLog = {
        id: 'op-123',
        status: BulkOperationStatus.PENDING,
      };

      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 2,
          successful: 1,
          failed: 1,
          results: [
            { type: 'employee', id: 12345, status: 'success' },
            { type: 'calculation', id: 67890, status: 'failed', error: 'Not found' },
          ],
          errors: [{ type: 'calculation', id: 67890, message: 'Not found' }],
          warnings: [],
        },
      });

      const result = await service.processBulkInput(
        tenantId,
        {
          entities: [
            { type: 'employee', id: 'staff-1', data: { email: 'test@example.com' } },
            { type: 'calculation', id: '67890', data: { amount: 1000 } },
          ],
        },
        executedBy,
      );

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.status).toBe('PARTIAL_FAILURE');
      expect(result.errors).toHaveLength(1);
    });

    it('should support validate-only mode', async () => {
      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [{ type: 'employee', id: 12345, status: 'success' }],
          errors: [],
          warnings: ['Field xyz will be ignored'],
        },
      });

      const result = await service.validateBulkOperation(tenantId, {
        entities: [{ type: 'employee', id: 'staff-1', data: { email: 'test@example.com' } }],
        validateOnly: true,
      });

      expect(result.status).toBe('VALIDATED');
      expect(result.warnings).toContain('Field xyz will be ignored');
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ validate_only: true }),
      );
    });
  });

  describe('bulkAdjustSalaries', () => {
    it('should process salary adjustments with percentage increase', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
        basicSalaryCents: 2000000, // R20,000
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [{ type: 'inherited_calculation', employee_id: 12345, status: 'success' }],
          errors: [],
          warnings: [],
        },
      });

      const result = await service.bulkAdjustSalaries(
        tenantId,
        [
          {
            staffId: 'staff-1',
            percentageIncrease: 5, // 5% increase
            effectiveDate: new Date('2026-03-01'),
          },
        ],
        executedBy,
      );

      expect(result.successful).toBe(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/bulk_input'),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              type: 'inherited_calculation',
              employee_id: 12345,
              item_code: 'BASIC',
              data: expect.objectContaining({
                amount: 21000, // R20,000 * 1.05 = R21,000
              }),
            }),
          ]),
        }),
      );
    });

    it('should process salary adjustments with absolute amount', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
        basicSalaryCents: 2000000,
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
          errors: [],
          warnings: [],
        },
      });

      await service.bulkAdjustSalaries(
        tenantId,
        [
          {
            staffId: 'staff-1',
            newSalary: 25000, // R25,000
            effectiveDate: new Date('2026-03-01'),
          },
        ],
        executedBy,
      );

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({ amount: 25000 }),
            }),
          ]),
        }),
      );
    });

    it('should fail when no staff are linked to SimplePay', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: null, // Not linked
      } as any);

      const result = await service.bulkAdjustSalaries(
        tenantId,
        [{ staffId: 'staff-1', newSalary: 25000, effectiveDate: new Date() }],
        executedBy,
      );

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0].errorCode).toBe('NO_VALID_STAFF');
    });
  });

  describe('distributeBonuses', () => {
    it('should distribute bonuses to specific payslips', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [{ type: 'payslip_calculation', payslip_id: 99999, status: 'success' }],
          errors: [],
          warnings: [],
        },
      });

      const result = await service.distributeBonuses(
        tenantId,
        [
          {
            staffId: 'staff-1',
            amount: 5000,
            bonusType: BonusType.THIRTEENTH_CHEQUE,
            effectivePayslipId: '99999',
          },
        ],
        executedBy,
      );

      expect(result.successful).toBe(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              type: 'payslip_calculation',
              payslip_id: 99999,
              item_code: 'BONUS_13TH',
            }),
          ]),
        }),
      );
    });

    it('should distribute one-off bonuses without specific payslip', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
          errors: [],
          warnings: [],
        },
      });

      await service.distributeBonuses(
        tenantId,
        [
          {
            staffId: 'staff-1',
            amount: 10000,
            bonusType: BonusType.PERFORMANCE,
          },
        ],
        executedBy,
      );

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              type: 'calculation',
              item_code: 'BONUS_PERF',
              data: expect.objectContaining({ once_off: true }),
            }),
          ]),
        }),
      );
    });
  });

  describe('setupBulkDeductions', () => {
    it('should setup deductions with date range', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
          errors: [],
          warnings: [],
        },
      });

      await service.setupBulkDeductions(
        tenantId,
        [
          {
            staffId: 'staff-1',
            deductionCode: 'PENSION',
            amount: 1500,
            startDate: new Date('2026-02-01'),
            endDate: new Date('2026-12-31'),
          },
        ],
        executedBy,
      );

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              type: 'inherited_calculation',
              item_code: 'PENSION',
              data: expect.objectContaining({
                amount: 1500,
                start_date: '2026-02-01',
                end_date: '2026-12-31',
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('bulkUpdateEmployees', () => {
    it('should update employee contact and banking details', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [{ type: 'employee', id: 12345, status: 'success' }],
          errors: [],
          warnings: [],
        },
      });

      const result = await service.bulkUpdateEmployees(
        tenantId,
        [
          {
            staffId: 'staff-1',
            updates: {
              email: 'newemail@example.com',
              phone: '0821234567',
              bankAccount: {
                bankId: 1,
                accountNumber: '1234567890',
                branchCode: '250655',
                accountType: 'cheque',
              },
            },
          },
        ],
        executedBy,
      );

      expect(result.successful).toBe(1);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              type: 'employee',
              id: 12345,
              data: expect.objectContaining({
                email: 'newemail@example.com',
                cell_number: '0821234567',
                bank_id: 1,
                bank_account_number: '1234567890',
                bank_branch_code: '250655',
                bank_account_type: 'cheque',
              }),
            }),
          ]),
        }),
      );
    });

    it('should update employee address', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockResolvedValue({
        bulk_input: {
          processed: 1,
          successful: 1,
          failed: 0,
          results: [],
          errors: [],
          warnings: [],
        },
      });

      await service.bulkUpdateEmployees(
        tenantId,
        [
          {
            staffId: 'staff-1',
            updates: {
              address: {
                line1: '123 Main Street',
                line2: 'Unit 5',
                city: 'Cape Town',
                province: 'Western Cape',
                postalCode: '8001',
              },
            },
          },
        ],
        executedBy,
      );

      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          entities: expect.arrayContaining([
            expect.objectContaining({
              data: expect.objectContaining({
                address_line_1: '123 Main Street',
                address_line_2: 'Unit 5',
                address_city: 'Cape Town',
                address_province: 'Western Cape',
                address_postal_code: '8001',
              }),
            }),
          ]),
        }),
      );
    });
  });

  describe('error handling', () => {
    it('should handle API errors gracefully', async () => {
      const operationLog = { id: 'op-123', status: BulkOperationStatus.PENDING };
      mockBulkOperationLogRepo.create.mockResolvedValue(operationLog as any);
      mockBulkOperationLogRepo.update.mockResolvedValue(operationLog as any);

      mockStaffRepository.findById.mockResolvedValue({
        id: 'staff-1',
        simplePayEmployeeId: '12345',
      } as any);

      mockApiClient.post.mockRejectedValue(new Error('API rate limit exceeded'));

      await expect(
        service.processBulkInput(
          tenantId,
          { entities: [{ type: 'employee', id: 'staff-1', data: {} }] },
          executedBy,
        ),
      ).rejects.toThrow('API rate limit exceeded');

      expect(mockBulkOperationLogRepo.update).toHaveBeenCalledWith(
        'op-123',
        expect.objectContaining({
          status: BulkOperationStatus.FAILED,
          errors: expect.arrayContaining([
            expect.objectContaining({
              errorCode: 'BULK_OPERATION_FAILED',
              errorMessage: 'API rate limit exceeded',
            }),
          ]),
        }),
      );
    });
  });
});
```

---

## Use Case Examples

### Annual Salary Review (5% increase for all staff)

```typescript
const staffList = await staffRepository.findActiveByTenant(tenantId);
const adjustments = staffList.map(staff => ({
  staffId: staff.id,
  percentageIncrease: 5,
  effectiveDate: new Date('2026-03-01'),
}));

const result = await bulkService.bulkAdjustSalaries(tenantId, adjustments, userId);
console.log(`Updated ${result.successful} salaries, ${result.failed} failed`);
```

### Thirteenth Cheque Distribution

```typescript
const staffList = await staffRepository.findActiveByTenant(tenantId);
const bonuses = staffList.map(staff => ({
  staffId: staff.id,
  amount: staff.basicSalaryCents / 100, // One month's salary
  bonusType: BonusType.THIRTEENTH_CHEQUE,
}));

await bulkService.distributeBonuses(tenantId, bonuses, userId);
```

### New Pension Fund Enrollment (7.5% of basic salary)

```typescript
const permanentStaff = await staffRepository.findByEmploymentType(tenantId, 'PERMANENT');
const deductions = permanentStaff.map(staff => ({
  staffId: staff.id,
  deductionCode: 'PENSION',
  amount: Math.round(staff.basicSalaryCents * 0.075 / 100),
  startDate: new Date('2026-02-01'),
}));

await bulkService.setupBulkDeductions(tenantId, deductions, userId);
```

---

## Acceptance Criteria

- [ ] Generic bulk input processes successfully
- [ ] Bulk salary adjustments work (percentage and absolute)
- [ ] Bonus distribution works (specific payslip and one-off)
- [ ] Bulk deduction setup works with date ranges
- [ ] Bulk employee updates work (contact, banking, address)
- [ ] Validation-only mode returns results without executing
- [ ] Partial failures handled gracefully with detailed errors
- [ ] All operations logged in BulkOperationLog
- [ ] Rate limiting benefits documented and validated
- [ ] All API endpoints documented in Swagger
- [ ] Unit tests pass: `pnpm test --runInBand`
- [ ] Integration tests validate SimplePay API calls

---

## Files to Create/Modify

### New Files
- `src/integrations/simplepay/simplepay-bulk.service.ts`
- `src/database/repositories/bulk-operation-log.repository.ts`
- `src/database/dto/bulk-operations.dto.ts`
- `src/database/entities/bulk-operation-log.entity.ts`
- `tests/integrations/simplepay/simplepay-bulk.service.spec.ts`

### Modified Files
- `prisma/schema.prisma` - Add BulkOperationLog model and enums
- `src/integrations/simplepay/simplepay.module.ts` - Register service
- `src/api/integrations/simplepay.controller.ts` - Add bulk endpoints

---

**Last Updated**: 2026-01-08
**Template Version**: 2.0 (Comprehensive)

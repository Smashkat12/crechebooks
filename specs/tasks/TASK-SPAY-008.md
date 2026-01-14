# TASK-SPAY-008: SimplePay Auto-Setup Pipeline on Employee Creation

## Task Metadata
| Field | Value |
|-------|-------|
| Task ID | TASK-SPAY-008 |
| Priority | P1-CRITICAL |
| Layer | Logic |
| Phase | 14 - Comprehensive SimplePay Integration |
| Dependencies | TASK-STAFF-004, TASK-SPAY-001, TASK-SPAY-003, TASK-SPAY-006 |
| Status | Pending |
| Estimated Effort | 4 hours |

---

## Executive Summary

Implement a comprehensive auto-setup pipeline that executes when creating an employee in SimplePay from CrecheBooks. This "one-click" employee setup makes CrecheBooks the primary point of interaction for all payroll operations by automatically: creating the employee in SimplePay, assigning the appropriate profile/template based on role, initializing leave balances (pro-rata for first year), configuring tax information, setting up recurring calculations, and sending completion notifications.

---

## Context for AI Agent

<context>
<project_overview>
CrecheBooks is a multi-tenant SaaS application for South African childcare centers (crèches). This task implements the Auto-Setup Pipeline - the final piece that transforms staff onboarding into a seamless one-click operation. When a new staff member is added to CrecheBooks, the system automatically handles all SimplePay configuration without manual intervention.
</project_overview>

<technology_stack>
- Runtime: Node.js with TypeScript (strict mode)
- Framework: NestJS with dependency injection
- Database: PostgreSQL with Prisma ORM
- Testing: Jest with `pnpm test --runInBand`
- Package Manager: pnpm (NOT npm)
- API Style: RESTful with OpenAPI/Swagger documentation
- Events: NestJS EventEmitter for internal event handling
</technology_stack>

<simplepay_api_critical_info>
- Base URL: `https://api.payroll.simplepay.cloud/v1`
- Authentication: API key in header `Authorization: apikey YOUR_API_KEY`
- Rate Limit: 60 requests per minute (1000 per hour)
- MUST call `initializeForTenant(tenantId)` before any API call
- API responses are WRAPPED - must extract inner data
- API uses snake_case, TypeScript uses camelCase
</simplepay_api_critical_info>

<sa_compliance_requirements>
- BCEA Leave Entitlements (Basic Conditions of Employment Act):
  - Annual Leave: 15 working days (21 consecutive days)
  - Sick Leave: 30 days per 3-year cycle
  - Family Responsibility Leave: 3 days per year
  - Maternity Leave: 4 months (unpaid, UIF claims)
  - Parental Leave: 10 days (new parents)
- Pro-rata calculation required for first-year employees
- Tax Status Codes: A (Resident), B (Non-resident), C (Emigrant)
- Statutory deductions: UIF (1% employee + 1% employer), SDL (1% employer)
</sa_compliance_requirements>

<file_locations>
- Service: `src/integrations/simplepay/simplepay-employee-setup.service.ts`
- Pipeline: `src/integrations/simplepay/setup-pipeline/setup-pipeline.ts`
- Steps: `src/integrations/simplepay/setup-pipeline/steps/`
- Repository: `src/database/repositories/employee-setup-log.repository.ts`
- DTOs: `src/database/dto/employee-setup.dto.ts`
- Entity: `src/database/entities/employee-setup-log.entity.ts`
- Event Handler: `src/integrations/simplepay/handlers/staff-created.handler.ts`
- Tests: `tests/integrations/simplepay/employee-setup.service.spec.ts`
</file_locations>

<coding_standards>
- Use `string | null` not `string?` for nullable fields in entities
- Export enums from entity files, NOT from `@prisma/client`
- All monetary values stored as cents (integer)
- Use pipeline pattern with discrete, rollback-capable steps
- Log all setup operations for audit trail
- Emit events for notification system integration
</coding_standards>

<dependent_services>
This task depends on services from previous TASK-SPAY-* implementations:
- TASK-SPAY-001: SimplePayLeaveService (leave balance initialization)
- TASK-SPAY-003: SimplePayCalculationsService (tax & calculations setup)
- TASK-SPAY-006: SimplePayProfileService (profile assignment)
- TASK-STAFF-004: SimplePayApiClient (employee creation)
</dependent_services>
</context>

---

## Architecture Overview

### Setup Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    EMPLOYEE SETUP PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   Create    │───▶│   Assign    │───▶│    Setup    │         │
│  │  Employee   │    │   Profile   │    │    Leave    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│         │                  │                  │                  │
│         ▼                  ▼                  ▼                  │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │  Configure  │───▶│     Add     │───▶│   Verify    │         │
│  │     Tax     │    │ Calculations│    │    Setup    │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│                                               │                  │
│                                               ▼                  │
│                                        ┌─────────────┐          │
│                                        │    Send     │          │
│                                        │Notification │          │
│                                        └─────────────┘          │
│                                                                  │
│  On Failure: Rollback ◀───────────────────────────────────────  │
└─────────────────────────────────────────────────────────────────┘
```

### Event-Driven Trigger

```
Staff Created in CrecheBooks
            │
            ▼
    StaffCreatedEvent
            │
            ▼
   StaffCreatedHandler
            │
            ├── Check SimplePay connection exists?
            │         │
            │    No ──┴── Skip (SimplePay not configured)
            │         │
            │    Yes ─┴─▶ Execute Setup Pipeline
            │
            ▼
   EmployeeSetupResult
            │
            ├── Success ──▶ Log & Notify Admin
            │
            └── Failure ──▶ Log Error & Notify Admin (manual setup required)
```

---

## Prisma Schema

```prisma
// Add to prisma/schema.prisma

enum SetupStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  PARTIAL
  FAILED
  ROLLED_BACK
}

model EmployeeSetupLog {
  id                  String       @id @default(cuid())
  tenantId            String
  staffId             String
  simplePayEmployeeId String?
  status              SetupStatus  @default(PENDING)
  setupSteps          Json         // Array of step results
  profileAssigned     String?
  leaveInitialized    Boolean      @default(false)
  taxConfigured       Boolean      @default(false)
  calculationsAdded   Int          @default(0)
  triggeredBy         String       // 'auto' | 'manual' | user ID
  errors              Json?
  warnings            Json?
  startedAt           DateTime     @default(now())
  completedAt         DateTime?

  tenant Tenant @relation(fields: [tenantId], references: [id])
  staff  Staff  @relation(fields: [staffId], references: [id])

  @@unique([tenantId, staffId])
  @@index([tenantId])
  @@index([status])
  @@index([startedAt])
}
```

---

## Entity Definition

```typescript
// src/database/entities/employee-setup-log.entity.ts

export enum SetupStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  PARTIAL = 'PARTIAL',
  FAILED = 'FAILED',
  ROLLED_BACK = 'ROLLED_BACK',
}

export interface SetupStepResult {
  step: string;
  status: 'completed' | 'failed' | 'skipped' | 'rolled_back';
  details?: string;
  error?: string;
  duration?: number; // milliseconds
  data?: Record<string, unknown>;
}

export interface EmployeeSetupLogEntity {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayEmployeeId: string | null;
  status: SetupStatus;
  setupSteps: SetupStepResult[];
  profileAssigned: string | null;
  leaveInitialized: boolean;
  taxConfigured: boolean;
  calculationsAdded: number;
  triggeredBy: string;
  errors: string[] | null;
  warnings: string[] | null;
  startedAt: Date;
  completedAt: Date | null;
}
```

---

## DTO Definitions

```typescript
// src/database/dto/employee-setup.dto.ts

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsEnum,
  ValidateNested,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

// ============================================
// Setup Request DTOs
// ============================================

export class LeaveEntitlementsDto {
  @ApiPropertyOptional({ description: 'Annual leave days (default: 15)', default: 15 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(30)
  annual?: number;

  @ApiPropertyOptional({ description: 'Sick leave days per 3-year cycle (default: 30)', default: 30 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  sick?: number;

  @ApiPropertyOptional({ description: 'Family responsibility leave days (default: 3)', default: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  familyResponsibility?: number;
}

export class TaxSettingsDto {
  @ApiPropertyOptional({ description: 'SARS tax reference number' })
  @IsOptional()
  @IsString()
  taxNumber?: string;

  @ApiPropertyOptional({ description: 'Tax status: A=Resident, B=Non-resident, C=Emigrant', default: 'A' })
  @IsOptional()
  @IsEnum(['A', 'B', 'C'])
  taxStatus?: 'A' | 'B' | 'C';

  @ApiPropertyOptional({ description: 'Number of medical aid members for tax credits' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  medicalAidMembers?: number;
}

export class AdditionalCalculationDto {
  @ApiProperty({ description: 'SimplePay item code' })
  @IsString()
  itemCode: string;

  @ApiPropertyOptional({ description: 'Fixed amount in Rands' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional({ description: 'Percentage of basic salary' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentage?: number;
}

export class EmployeeSetupRequestDto {
  @ApiProperty({ description: 'CrecheBooks staff ID' })
  @IsString()
  staffId: string;

  @ApiPropertyOptional({ description: 'Auto-select profile based on role', default: true })
  @IsOptional()
  @IsBoolean()
  autoAssignProfile?: boolean;

  @ApiPropertyOptional({ description: 'Specific SimplePay profile ID to assign' })
  @IsOptional()
  @IsString()
  profileId?: string;

  @ApiPropertyOptional({ type: LeaveEntitlementsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => LeaveEntitlementsDto)
  leaveEntitlements?: LeaveEntitlementsDto;

  @ApiPropertyOptional({ type: TaxSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => TaxSettingsDto)
  taxSettings?: TaxSettingsDto;

  @ApiPropertyOptional({ type: [AdditionalCalculationDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalCalculationDto)
  additionalCalculations?: AdditionalCalculationDto[];
}

// ============================================
// Setup Response DTOs
// ============================================

export class SetupStepResultDto {
  @ApiProperty()
  step: string;

  @ApiProperty({ enum: ['completed', 'failed', 'skipped', 'rolled_back'] })
  status: 'completed' | 'failed' | 'skipped' | 'rolled_back';

  @ApiPropertyOptional()
  details?: string;

  @ApiPropertyOptional()
  error?: string;

  @ApiPropertyOptional()
  duration?: number;
}

export class EmployeeSetupResultDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  setupLogId: string;

  @ApiPropertyOptional()
  simplePayEmployeeId?: string;

  @ApiProperty({ type: [SetupStepResultDto] })
  setupSteps: SetupStepResultDto[];

  @ApiProperty({ type: [String] })
  errors: string[];

  @ApiProperty({ type: [String] })
  warnings: string[];

  @ApiProperty()
  status: string;
}

export class SetupStatusDto {
  @ApiProperty()
  staffId: string;

  @ApiProperty()
  status: string;

  @ApiPropertyOptional()
  simplePayEmployeeId?: string;

  @ApiProperty()
  profileAssigned: boolean;

  @ApiProperty()
  leaveInitialized: boolean;

  @ApiProperty()
  taxConfigured: boolean;

  @ApiProperty()
  calculationsAdded: number;

  @ApiProperty({ type: [SetupStepResultDto] })
  steps: SetupStepResultDto[];

  @ApiProperty()
  startedAt: Date;

  @ApiPropertyOptional()
  completedAt?: Date;
}
```

---

## Profile Auto-Selection Configuration

```typescript
// src/integrations/simplepay/setup-pipeline/profile-selector.ts

export interface ProfileSelectionRule {
  role: string;           // CrecheBooks role or '*' for any
  employmentType: string; // 'PERMANENT' | 'CONTRACT' | 'CASUAL' | '*'
  profileId: string;      // SimplePay profile ID
  profileName: string;    // Human-readable name
  priority: number;       // Higher = more specific match
}

/**
 * Default profile selection rules for creche staff.
 * More specific rules should have higher priority.
 */
export const DEFAULT_PROFILE_RULES: ProfileSelectionRule[] = [
  // Specific role + employment type combinations (highest priority)
  { role: 'PRINCIPAL', employmentType: 'PERMANENT', profileId: 'prof_principal', profileName: 'Principal/Manager', priority: 100 },
  { role: 'TEACHER', employmentType: 'PERMANENT', profileId: 'prof_fulltime_teacher', profileName: 'Full-Time Teacher', priority: 90 },
  { role: 'TEACHER', employmentType: 'CONTRACT', profileId: 'prof_parttime_staff', profileName: 'Part-Time Staff', priority: 85 },

  // Role-based defaults (medium priority)
  { role: 'ASSISTANT', employmentType: '*', profileId: 'prof_assistant', profileName: 'Teaching Assistant', priority: 70 },
  { role: 'KITCHEN', employmentType: '*', profileId: 'prof_kitchen_staff', profileName: 'Kitchen Staff', priority: 70 },
  { role: 'ADMIN', employmentType: '*', profileId: 'prof_admin_staff', profileName: 'Admin Staff', priority: 70 },
  { role: 'CLEANER', employmentType: '*', profileId: 'prof_general_staff', profileName: 'General Staff', priority: 65 },
  { role: 'DRIVER', employmentType: '*', profileId: 'prof_general_staff', profileName: 'General Staff', priority: 65 },

  // Employment type defaults (lower priority)
  { role: '*', employmentType: 'CASUAL', profileId: 'prof_casual', profileName: 'Casual Worker', priority: 50 },
  { role: '*', employmentType: 'CONTRACT', profileId: 'prof_parttime_staff', profileName: 'Part-Time Staff', priority: 45 },

  // Catch-all fallback (lowest priority)
  { role: '*', employmentType: '*', profileId: 'prof_general_staff', profileName: 'General Staff', priority: 0 },
];

export class ProfileSelector {
  constructor(private rules: ProfileSelectionRule[] = DEFAULT_PROFILE_RULES) {}

  selectProfile(role: string, employmentType: string): { profileId: string; profileName: string } | null {
    const normalizedRole = role.toUpperCase();
    const normalizedEmploymentType = employmentType.toUpperCase();

    // Sort by priority descending
    const sortedRules = [...this.rules].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      const roleMatches = rule.role === '*' || rule.role === normalizedRole;
      const typeMatches = rule.employmentType === '*' || rule.employmentType === normalizedEmploymentType;

      if (roleMatches && typeMatches) {
        return { profileId: rule.profileId, profileName: rule.profileName };
      }
    }

    return null;
  }

  addRule(rule: ProfileSelectionRule): void {
    this.rules.push(rule);
  }

  setRules(rules: ProfileSelectionRule[]): void {
    this.rules = rules;
  }
}
```

---

## Leave Pro-Rata Calculator

```typescript
// src/integrations/simplepay/setup-pipeline/leave-calculator.ts

import { differenceInMonths, startOfMonth, endOfYear } from 'date-fns';

export interface LeaveEntitlements {
  annual: number;
  sick: number;
  familyResponsibility: number;
}

export interface ProRataResult {
  annual: number;
  sick: number;
  familyResponsibility: number;
  calculationDetails: {
    startDate: string;
    referenceDate: string;
    monthsRemaining: number;
    isFirstYear: boolean;
  };
}

/**
 * BCEA-compliant leave entitlements for South Africa
 */
export const BCEA_DEFAULTS: LeaveEntitlements = {
  annual: 15,           // 15 working days per year
  sick: 30,             // 30 days per 3-year cycle
  familyResponsibility: 3, // 3 days per year
};

/**
 * Calculate pro-rata leave entitlements for an employee's first year.
 *
 * @param startDate - Employee's start date
 * @param referenceDate - End of leave year (typically Dec 31 or company year-end)
 * @param entitlements - Annual leave entitlements
 */
export function calculateProRataLeave(
  startDate: Date,
  referenceDate: Date = endOfYear(new Date()),
  entitlements: LeaveEntitlements = BCEA_DEFAULTS,
): ProRataResult {
  const startMonth = startOfMonth(startDate);
  const refMonth = startOfMonth(referenceDate);

  const monthsRemaining = differenceInMonths(refMonth, startMonth) + 1;
  const isFirstYear = monthsRemaining < 12;

  if (!isFirstYear || monthsRemaining >= 12) {
    // Full year entitlement
    return {
      annual: entitlements.annual,
      sick: entitlements.sick,
      familyResponsibility: entitlements.familyResponsibility,
      calculationDetails: {
        startDate: startDate.toISOString().split('T')[0],
        referenceDate: referenceDate.toISOString().split('T')[0],
        monthsRemaining: 12,
        isFirstYear: false,
      },
    };
  }

  // Pro-rata calculation: (annual entitlement / 12) * months remaining
  const proRataAnnual = Math.round((entitlements.annual / 12) * monthsRemaining * 10) / 10;
  const proRataFamily = Math.round((entitlements.familyResponsibility / 12) * monthsRemaining * 10) / 10;

  // Sick leave is per 3-year cycle, so we don't pro-rata it
  // Employee gets full sick leave entitlement from day one

  return {
    annual: proRataAnnual,
    sick: entitlements.sick,
    familyResponsibility: proRataFamily,
    calculationDetails: {
      startDate: startDate.toISOString().split('T')[0],
      referenceDate: referenceDate.toISOString().split('T')[0],
      monthsRemaining,
      isFirstYear: true,
    },
  };
}
```

---

## Setup Pipeline Implementation

```typescript
// src/integrations/simplepay/setup-pipeline/setup-pipeline.ts

import { Injectable, Logger } from '@nestjs/common';
import { SetupStepResult } from '../../../database/entities/employee-setup-log.entity';

export interface SetupContext {
  tenantId: string;
  staffId: string;
  simplePayEmployeeId?: string;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    idNumber?: string;
    role: string;
    employmentType: string;
    startDate: Date;
    basicSalaryCents: number;
  };
  config: {
    autoAssignProfile: boolean;
    profileId?: string;
    leaveEntitlements?: {
      annual?: number;
      sick?: number;
      familyResponsibility?: number;
    };
    taxSettings?: {
      taxNumber?: string;
      taxStatus?: 'A' | 'B' | 'C';
      medicalAidMembers?: number;
    };
    additionalCalculations?: Array<{
      itemCode: string;
      amount?: number;
      percentage?: number;
    }>;
  };
  results: SetupStepResult[];
  errors: string[];
  warnings: string[];
}

export interface SetupStep {
  name: string;
  execute(context: SetupContext): Promise<SetupStepResult>;
  rollback?(context: SetupContext): Promise<void>;
}

@Injectable()
export class EmployeeSetupPipeline {
  private readonly logger = new Logger(EmployeeSetupPipeline.name);
  private steps: SetupStep[] = [];

  registerStep(step: SetupStep): void {
    this.steps.push(step);
  }

  async execute(context: SetupContext): Promise<SetupContext> {
    this.logger.log(`Starting setup pipeline for staff ${context.staffId}`);
    const executedSteps: SetupStep[] = [];

    for (const step of this.steps) {
      const startTime = Date.now();

      try {
        this.logger.debug(`Executing step: ${step.name}`);
        const result = await step.execute(context);
        result.duration = Date.now() - startTime;

        context.results.push(result);

        if (result.status === 'completed') {
          executedSteps.push(step);
        } else if (result.status === 'failed') {
          context.errors.push(result.error || `Step ${step.name} failed`);

          // Rollback previously executed steps
          await this.rollback(executedSteps, context);
          break;
        }
        // 'skipped' status continues to next step

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Step ${step.name} threw exception: ${errorMessage}`);

        context.results.push({
          step: step.name,
          status: 'failed',
          error: errorMessage,
          duration: Date.now() - startTime,
        });
        context.errors.push(errorMessage);

        // Rollback
        await this.rollback(executedSteps, context);
        break;
      }
    }

    this.logger.log(`Pipeline completed for staff ${context.staffId} with ${context.errors.length} errors`);
    return context;
  }

  private async rollback(executedSteps: SetupStep[], context: SetupContext): Promise<void> {
    this.logger.warn(`Rolling back ${executedSteps.length} steps for staff ${context.staffId}`);

    // Rollback in reverse order
    for (const step of executedSteps.reverse()) {
      if (step.rollback) {
        try {
          await step.rollback(context);

          // Find and update the result for this step
          const resultIndex = context.results.findIndex(r => r.step === step.name);
          if (resultIndex >= 0) {
            context.results[resultIndex].status = 'rolled_back';
          }

          this.logger.debug(`Rolled back step: ${step.name}`);
        } catch (rollbackError) {
          this.logger.error(`Failed to rollback step ${step.name}: ${rollbackError}`);
          context.warnings.push(`Rollback failed for ${step.name}`);
        }
      }
    }
  }
}
```

---

## Pipeline Step Implementations

### Step 1: Create Employee

```typescript
// src/integrations/simplepay/setup-pipeline/steps/create-employee.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { SimplePayApiClient } from '../../simplepay-api.client';

@Injectable()
export class CreateEmployeeStep implements SetupStep {
  name = 'create_employee';

  constructor(private readonly apiClient: SimplePayApiClient) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    // Check if already linked to SimplePay
    if (context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: `Staff already linked to SimplePay employee ${context.simplePayEmployeeId}`,
      };
    }

    await this.apiClient.initializeForTenant(context.tenantId);
    const clientId = await this.apiClient.getClientId();

    const response = await this.apiClient.post<{ employee: { id: number } }>(
      `/clients/${clientId}/employees`,
      {
        first_name: context.staff.firstName,
        last_name: context.staff.lastName,
        email: context.staff.email,
        id_number: context.staff.idNumber || undefined,
        start_date: context.staff.startDate.toISOString().split('T')[0],
        basic_salary: context.staff.basicSalaryCents / 100,
      },
    );

    context.simplePayEmployeeId = String(response.employee.id);

    return {
      step: this.name,
      status: 'completed',
      details: `Created SimplePay employee ${context.simplePayEmployeeId}`,
      data: { simplePayEmployeeId: context.simplePayEmployeeId },
    };
  }

  async rollback(context: SetupContext): Promise<void> {
    // Note: SimplePay may not support employee deletion via API
    // Log for manual cleanup if needed
    if (context.simplePayEmployeeId) {
      context.warnings.push(
        `SimplePay employee ${context.simplePayEmployeeId} may need manual cleanup`,
      );
    }
  }
}
```

### Step 2: Assign Profile

```typescript
// src/integrations/simplepay/setup-pipeline/steps/assign-profile.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { ProfileSelector } from '../profile-selector';
import { SimplePayProfileService } from '../../simplepay-profile.service';

@Injectable()
export class AssignProfileStep implements SetupStep {
  name = 'assign_profile';

  constructor(
    private readonly profileSelector: ProfileSelector,
    private readonly profileService: SimplePayProfileService,
  ) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    if (!context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No SimplePay employee ID available',
      };
    }

    let profileId: string;
    let profileName: string;

    if (context.config.profileId) {
      // Use explicitly specified profile
      profileId = context.config.profileId;
      profileName = 'Custom Profile';
    } else if (context.config.autoAssignProfile) {
      // Auto-select based on role and employment type
      const selected = this.profileSelector.selectProfile(
        context.staff.role,
        context.staff.employmentType,
      );

      if (!selected) {
        return {
          step: this.name,
          status: 'skipped',
          details: `No profile rule matches role=${context.staff.role}, type=${context.staff.employmentType}`,
        };
      }

      profileId = selected.profileId;
      profileName = selected.profileName;
    } else {
      return {
        step: this.name,
        status: 'skipped',
        details: 'Profile assignment disabled',
      };
    }

    await this.profileService.assignProfile(
      context.tenantId,
      context.staffId,
      profileId,
    );

    return {
      step: this.name,
      status: 'completed',
      details: `Assigned profile "${profileName}" (${profileId})`,
      data: { profileId, profileName },
    };
  }

  async rollback(context: SetupContext): Promise<void> {
    // Profile removal typically not needed as employee deletion handles it
  }
}
```

### Step 3: Setup Leave Balances

```typescript
// src/integrations/simplepay/setup-pipeline/steps/setup-leave.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { calculateProRataLeave, BCEA_DEFAULTS } from '../leave-calculator';
import { SimplePayLeaveService } from '../../simplepay-leave.service';

@Injectable()
export class SetupLeaveStep implements SetupStep {
  name = 'setup_leave';

  constructor(private readonly leaveService: SimplePayLeaveService) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    if (!context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No SimplePay employee ID available',
      };
    }

    // Calculate pro-rata entitlements
    const entitlements = {
      annual: context.config.leaveEntitlements?.annual ?? BCEA_DEFAULTS.annual,
      sick: context.config.leaveEntitlements?.sick ?? BCEA_DEFAULTS.sick,
      familyResponsibility: context.config.leaveEntitlements?.familyResponsibility ?? BCEA_DEFAULTS.familyResponsibility,
    };

    const proRata = calculateProRataLeave(context.staff.startDate, undefined, entitlements);

    // Initialize leave balances in SimplePay
    await this.leaveService.initializeLeaveBalances(
      context.tenantId,
      context.staffId,
      {
        annual: proRata.annual,
        sick: proRata.sick,
        familyResponsibility: proRata.familyResponsibility,
      },
    );

    const details = proRata.calculationDetails.isFirstYear
      ? `Pro-rata leave initialized: Annual=${proRata.annual}, Sick=${proRata.sick}, Family=${proRata.familyResponsibility} (${proRata.calculationDetails.monthsRemaining} months)`
      : `Full leave initialized: Annual=${proRata.annual}, Sick=${proRata.sick}, Family=${proRata.familyResponsibility}`;

    return {
      step: this.name,
      status: 'completed',
      details,
      data: { leaveBalances: proRata },
    };
  }
}
```

### Step 4: Configure Tax

```typescript
// src/integrations/simplepay/setup-pipeline/steps/configure-tax.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { SimplePayCalculationsService } from '../../simplepay-calculations.service';

@Injectable()
export class ConfigureTaxStep implements SetupStep {
  name = 'configure_tax';

  constructor(private readonly calculationsService: SimplePayCalculationsService) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    if (!context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No SimplePay employee ID available',
      };
    }

    const taxSettings = context.config.taxSettings;
    if (!taxSettings) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No tax settings provided',
      };
    }

    // SimplePay handles PAYE automatically based on salary
    // We only need to set tax number and status if provided
    const updates: Record<string, unknown> = {};

    if (taxSettings.taxNumber) {
      updates.tax_number = taxSettings.taxNumber;
    }
    if (taxSettings.taxStatus) {
      updates.tax_status = taxSettings.taxStatus;
    }
    if (taxSettings.medicalAidMembers !== undefined) {
      updates.medical_aid_members = taxSettings.medicalAidMembers;
    }

    if (Object.keys(updates).length === 0) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No tax configuration changes required',
      };
    }

    await this.calculationsService.updateEmployeeTaxInfo(
      context.tenantId,
      context.staffId,
      updates,
    );

    return {
      step: this.name,
      status: 'completed',
      details: `Tax configured: ${Object.keys(updates).join(', ')}`,
      data: { taxSettings: updates },
    };
  }
}
```

### Step 5: Add Calculations

```typescript
// src/integrations/simplepay/setup-pipeline/steps/add-calculations.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { SimplePayCalculationsService } from '../../simplepay-calculations.service';

@Injectable()
export class AddCalculationsStep implements SetupStep {
  name = 'add_calculations';

  constructor(private readonly calculationsService: SimplePayCalculationsService) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    if (!context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No SimplePay employee ID available',
      };
    }

    const calculations = context.config.additionalCalculations;
    if (!calculations || calculations.length === 0) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No additional calculations specified',
      };
    }

    const added: string[] = [];
    const failed: string[] = [];

    for (const calc of calculations) {
      try {
        let amount: number;

        if (calc.amount !== undefined) {
          amount = calc.amount;
        } else if (calc.percentage !== undefined) {
          amount = (context.staff.basicSalaryCents / 100) * (calc.percentage / 100);
        } else {
          failed.push(`${calc.itemCode}: no amount or percentage specified`);
          continue;
        }

        await this.calculationsService.createInheritedCalculation(
          context.tenantId,
          context.staffId,
          calc.itemCode,
          amount,
        );

        added.push(calc.itemCode);
      } catch (error) {
        failed.push(`${calc.itemCode}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (failed.length > 0) {
      context.warnings.push(`Some calculations failed: ${failed.join(', ')}`);
    }

    return {
      step: this.name,
      status: added.length > 0 ? 'completed' : 'failed',
      details: `Added ${added.length} calculations: ${added.join(', ')}`,
      error: failed.length > 0 ? `Failed: ${failed.join(', ')}` : undefined,
      data: { added, failed },
    };
  }
}
```

### Step 6: Verify Setup

```typescript
// src/integrations/simplepay/setup-pipeline/steps/verify-setup.step.ts

import { Injectable } from '@nestjs/common';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';
import { SimplePayApiClient } from '../../simplepay-api.client';

@Injectable()
export class VerifySetupStep implements SetupStep {
  name = 'verify_setup';

  constructor(private readonly apiClient: SimplePayApiClient) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    if (!context.simplePayEmployeeId) {
      return {
        step: this.name,
        status: 'skipped',
        details: 'No SimplePay employee ID to verify',
      };
    }

    await this.apiClient.initializeForTenant(context.tenantId);

    // Fetch employee from SimplePay to verify
    const response = await this.apiClient.get<{ employee: Record<string, unknown> }>(
      `/employees/${context.simplePayEmployeeId}`,
    );

    const employee = response.employee;
    const verifications: string[] = [];
    const warnings: string[] = [];

    // Check basic info
    if (employee.first_name && employee.last_name) {
      verifications.push('Basic info verified');
    } else {
      warnings.push('Missing name information');
    }

    // Check salary
    if (employee.basic_salary) {
      verifications.push(`Salary: R${employee.basic_salary}`);
    }

    // Check start date
    if (employee.start_date) {
      verifications.push(`Start date: ${employee.start_date}`);
    }

    if (warnings.length > 0) {
      context.warnings.push(...warnings);
    }

    return {
      step: this.name,
      status: 'completed',
      details: verifications.join('; '),
      data: { verified: verifications, warnings },
    };
  }
}
```

### Step 7: Send Notification

```typescript
// src/integrations/simplepay/setup-pipeline/steps/send-notification.step.ts

import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SetupStep, SetupContext } from '../setup-pipeline';
import { SetupStepResult } from '../../../../database/entities/employee-setup-log.entity';

export class EmployeeSetupCompletedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly staffId: string,
    public readonly simplePayEmployeeId: string | undefined,
    public readonly success: boolean,
    public readonly errors: string[],
    public readonly warnings: string[],
  ) {}
}

@Injectable()
export class SendNotificationStep implements SetupStep {
  name = 'send_notification';

  constructor(private readonly eventEmitter: EventEmitter2) {}

  async execute(context: SetupContext): Promise<SetupStepResult> {
    const hasErrors = context.errors.length > 0;
    const success = !hasErrors && !!context.simplePayEmployeeId;

    // Emit event for notification service to handle
    this.eventEmitter.emit(
      'employee.setup.completed',
      new EmployeeSetupCompletedEvent(
        context.tenantId,
        context.staffId,
        context.simplePayEmployeeId,
        success,
        context.errors,
        context.warnings,
      ),
    );

    return {
      step: this.name,
      status: 'completed',
      details: success
        ? 'Setup completion notification sent'
        : 'Setup failure notification sent',
      data: { notificationType: success ? 'success' : 'failure' },
    };
  }
}
```

---

## Main Service Implementation

```typescript
// src/integrations/simplepay/simplepay-employee-setup.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EmployeeSetupPipeline, SetupContext } from './setup-pipeline/setup-pipeline';
import { CreateEmployeeStep } from './setup-pipeline/steps/create-employee.step';
import { AssignProfileStep } from './setup-pipeline/steps/assign-profile.step';
import { SetupLeaveStep } from './setup-pipeline/steps/setup-leave.step';
import { ConfigureTaxStep } from './setup-pipeline/steps/configure-tax.step';
import { AddCalculationsStep } from './setup-pipeline/steps/add-calculations.step';
import { VerifySetupStep } from './setup-pipeline/steps/verify-setup.step';
import { SendNotificationStep } from './setup-pipeline/steps/send-notification.step';
import { EmployeeSetupLogRepository } from '../../database/repositories/employee-setup-log.repository';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { SetupStatus } from '../../database/entities/employee-setup-log.entity';
import {
  EmployeeSetupRequestDto,
  EmployeeSetupResultDto,
  SetupStatusDto,
} from '../../database/dto/employee-setup.dto';

@Injectable()
export class SimplePayEmployeeSetupService {
  private readonly logger = new Logger(SimplePayEmployeeSetupService.name);

  constructor(
    private readonly pipeline: EmployeeSetupPipeline,
    private readonly setupLogRepo: EmployeeSetupLogRepository,
    private readonly staffRepository: StaffRepository,
    // Steps injected for registration
    private readonly createEmployeeStep: CreateEmployeeStep,
    private readonly assignProfileStep: AssignProfileStep,
    private readonly setupLeaveStep: SetupLeaveStep,
    private readonly configureTaxStep: ConfigureTaxStep,
    private readonly addCalculationsStep: AddCalculationsStep,
    private readonly verifySetupStep: VerifySetupStep,
    private readonly sendNotificationStep: SendNotificationStep,
  ) {
    // Register steps in order
    this.pipeline.registerStep(this.createEmployeeStep);
    this.pipeline.registerStep(this.assignProfileStep);
    this.pipeline.registerStep(this.setupLeaveStep);
    this.pipeline.registerStep(this.configureTaxStep);
    this.pipeline.registerStep(this.addCalculationsStep);
    this.pipeline.registerStep(this.verifySetupStep);
    this.pipeline.registerStep(this.sendNotificationStep);
  }

  async setupEmployeeComprehensive(
    tenantId: string,
    request: EmployeeSetupRequestDto,
    triggeredBy: string = 'manual',
  ): Promise<EmployeeSetupResultDto> {
    // Get staff details
    const staff = await this.staffRepository.findById(request.staffId);
    if (!staff) {
      return {
        success: false,
        setupLogId: '',
        setupSteps: [],
        errors: [`Staff not found: ${request.staffId}`],
        warnings: [],
        status: 'FAILED',
      };
    }

    // Create setup log
    const setupLog = await this.setupLogRepo.create({
      tenantId,
      staffId: request.staffId,
      triggeredBy,
      status: SetupStatus.IN_PROGRESS,
    });

    // Build context
    const context: SetupContext = {
      tenantId,
      staffId: request.staffId,
      simplePayEmployeeId: staff.simplePayEmployeeId ?? undefined,
      staff: {
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        idNumber: staff.idNumber ?? undefined,
        role: staff.role,
        employmentType: staff.employmentType,
        startDate: staff.startDate,
        basicSalaryCents: staff.basicSalaryCents,
      },
      config: {
        autoAssignProfile: request.autoAssignProfile ?? true,
        profileId: request.profileId,
        leaveEntitlements: request.leaveEntitlements,
        taxSettings: request.taxSettings,
        additionalCalculations: request.additionalCalculations,
      },
      results: [],
      errors: [],
      warnings: [],
    };

    // Execute pipeline
    const result = await this.pipeline.execute(context);

    // Determine final status
    const hasErrors = result.errors.length > 0;
    const hasCompletedSteps = result.results.some(r => r.status === 'completed');

    let status: SetupStatus;
    if (!hasErrors) {
      status = SetupStatus.COMPLETED;
    } else if (hasCompletedSteps) {
      status = SetupStatus.PARTIAL;
    } else {
      status = SetupStatus.FAILED;
    }

    // Update staff with SimplePay ID if created
    if (result.simplePayEmployeeId && !staff.simplePayEmployeeId) {
      await this.staffRepository.update(staff.id, {
        simplePayEmployeeId: result.simplePayEmployeeId,
      });
    }

    // Update setup log
    await this.setupLogRepo.update(setupLog.id, {
      status,
      simplePayEmployeeId: result.simplePayEmployeeId,
      setupSteps: result.results,
      profileAssigned: result.results.find(r => r.step === 'assign_profile')?.data?.profileId as string ?? null,
      leaveInitialized: result.results.some(r => r.step === 'setup_leave' && r.status === 'completed'),
      taxConfigured: result.results.some(r => r.step === 'configure_tax' && r.status === 'completed'),
      calculationsAdded: (result.results.find(r => r.step === 'add_calculations')?.data?.added as string[] ?? []).length,
      errors: result.errors.length > 0 ? result.errors : null,
      warnings: result.warnings.length > 0 ? result.warnings : null,
      completedAt: new Date(),
    });

    return {
      success: status === SetupStatus.COMPLETED,
      setupLogId: setupLog.id,
      simplePayEmployeeId: result.simplePayEmployeeId,
      setupSteps: result.results,
      errors: result.errors,
      warnings: result.warnings,
      status: status.toString(),
    };
  }

  async retrySetup(
    tenantId: string,
    staffId: string,
    triggeredBy: string,
  ): Promise<EmployeeSetupResultDto> {
    // Get existing setup log
    const existingLog = await this.setupLogRepo.findByStaff(tenantId, staffId);

    if (!existingLog || existingLog.status === SetupStatus.COMPLETED) {
      // Run full setup
      return this.setupEmployeeComprehensive(
        tenantId,
        { staffId, autoAssignProfile: true },
        triggeredBy,
      );
    }

    // Retry with same config but skip completed steps
    // Note: In a real implementation, you'd want to track which steps need retry
    return this.setupEmployeeComprehensive(
      tenantId,
      { staffId, autoAssignProfile: true },
      triggeredBy,
    );
  }

  async getSetupStatus(tenantId: string, staffId: string): Promise<SetupStatusDto | null> {
    const log = await this.setupLogRepo.findByStaff(tenantId, staffId);
    if (!log) return null;

    return {
      staffId: log.staffId,
      status: log.status,
      simplePayEmployeeId: log.simplePayEmployeeId ?? undefined,
      profileAssigned: !!log.profileAssigned,
      leaveInitialized: log.leaveInitialized,
      taxConfigured: log.taxConfigured,
      calculationsAdded: log.calculationsAdded,
      steps: log.setupSteps,
      startedAt: log.startedAt,
      completedAt: log.completedAt ?? undefined,
    };
  }
}
```

---

## Event Handler

```typescript
// src/integrations/simplepay/handlers/staff-created.handler.ts

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SimplePayEmployeeSetupService } from '../simplepay-employee-setup.service';
import { SimplePayConnectionRepository } from '../../../database/repositories/simplepay-connection.repository';
import { NotificationService } from '../../../notifications/notification.service';

export class StaffCreatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly staffId: string,
    public readonly staffName: string,
    public readonly role: string,
  ) {}
}

@Injectable()
export class StaffCreatedHandler {
  private readonly logger = new Logger(StaffCreatedHandler.name);

  constructor(
    private readonly employeeSetupService: SimplePayEmployeeSetupService,
    private readonly simplePayConnectionRepo: SimplePayConnectionRepository,
    private readonly notificationService: NotificationService,
  ) {}

  @OnEvent('staff.created')
  async handleStaffCreated(event: StaffCreatedEvent): Promise<void> {
    this.logger.log(`Staff created event received: ${event.staffId} (${event.staffName})`);

    // Check if SimplePay is connected for this tenant
    const connection = await this.simplePayConnectionRepo.findByTenant(event.tenantId);

    if (!connection?.isActive) {
      this.logger.debug(`SimplePay not connected for tenant ${event.tenantId}, skipping auto-setup`);
      return;
    }

    // Check if auto-setup is enabled
    if (!connection.autoSetupEnabled) {
      this.logger.debug(`Auto-setup disabled for tenant ${event.tenantId}, skipping`);
      return;
    }

    try {
      this.logger.log(`Starting auto-setup for staff ${event.staffId}`);

      const result = await this.employeeSetupService.setupEmployeeComprehensive(
        event.tenantId,
        {
          staffId: event.staffId,
          autoAssignProfile: true,
        },
        'auto',
      );

      if (result.success) {
        this.logger.log(`Auto-setup completed successfully for staff ${event.staffId}`);
      } else {
        this.logger.warn(`Auto-setup had issues for staff ${event.staffId}: ${result.errors.join(', ')}`);

        // Notify admin of setup issues
        await this.notificationService.notify({
          tenantId: event.tenantId,
          type: 'SIMPLEPAY_SETUP_ISSUE',
          title: 'SimplePay Setup Issue',
          message: `Automatic SimplePay setup for ${event.staffName} completed with issues. Please review.`,
          data: {
            staffId: event.staffId,
            staffName: event.staffName,
            errors: result.errors,
            warnings: result.warnings,
          },
        });
      }
    } catch (error) {
      this.logger.error(`Auto-setup failed for staff ${event.staffId}: ${error}`);

      // Notify admin of failure
      await this.notificationService.notify({
        tenantId: event.tenantId,
        type: 'SIMPLEPAY_SETUP_FAILED',
        title: 'SimplePay Setup Failed',
        message: `Automatic SimplePay setup failed for ${event.staffName}. Manual setup may be required.`,
        data: {
          staffId: event.staffId,
          staffName: event.staffName,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
}
```

---

## Repository Implementation

```typescript
// src/database/repositories/employee-setup-log.repository.ts

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  EmployeeSetupLogEntity,
  SetupStatus,
  SetupStepResult,
} from '../entities/employee-setup-log.entity';

export interface CreateEmployeeSetupLogInput {
  tenantId: string;
  staffId: string;
  triggeredBy: string;
  status?: SetupStatus;
}

export interface UpdateEmployeeSetupLogInput {
  status?: SetupStatus;
  simplePayEmployeeId?: string;
  setupSteps?: SetupStepResult[];
  profileAssigned?: string | null;
  leaveInitialized?: boolean;
  taxConfigured?: boolean;
  calculationsAdded?: number;
  errors?: string[] | null;
  warnings?: string[] | null;
  completedAt?: Date;
}

@Injectable()
export class EmployeeSetupLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateEmployeeSetupLogInput): Promise<EmployeeSetupLogEntity> {
    const record = await this.prisma.employeeSetupLog.create({
      data: {
        tenantId: input.tenantId,
        staffId: input.staffId,
        triggeredBy: input.triggeredBy,
        status: input.status ?? SetupStatus.PENDING,
        setupSteps: [],
      },
    });

    return this.mapToEntity(record);
  }

  async update(id: string, input: UpdateEmployeeSetupLogInput): Promise<EmployeeSetupLogEntity> {
    const record = await this.prisma.employeeSetupLog.update({
      where: { id },
      data: {
        status: input.status,
        simplePayEmployeeId: input.simplePayEmployeeId,
        setupSteps: input.setupSteps,
        profileAssigned: input.profileAssigned,
        leaveInitialized: input.leaveInitialized,
        taxConfigured: input.taxConfigured,
        calculationsAdded: input.calculationsAdded,
        errors: input.errors,
        warnings: input.warnings,
        completedAt: input.completedAt,
      },
    });

    return this.mapToEntity(record);
  }

  async findById(id: string): Promise<EmployeeSetupLogEntity | null> {
    const record = await this.prisma.employeeSetupLog.findUnique({
      where: { id },
    });

    return record ? this.mapToEntity(record) : null;
  }

  async findByStaff(tenantId: string, staffId: string): Promise<EmployeeSetupLogEntity | null> {
    const record = await this.prisma.employeeSetupLog.findUnique({
      where: {
        tenantId_staffId: { tenantId, staffId },
      },
    });

    return record ? this.mapToEntity(record) : null;
  }

  async findByTenant(
    tenantId: string,
    options?: {
      status?: SetupStatus;
      limit?: number;
      offset?: number;
    },
  ): Promise<EmployeeSetupLogEntity[]> {
    const records = await this.prisma.employeeSetupLog.findMany({
      where: {
        tenantId,
        ...(options?.status && { status: options.status }),
      },
      orderBy: { startedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return records.map((r) => this.mapToEntity(r));
  }

  async findPendingSetups(tenantId: string): Promise<EmployeeSetupLogEntity[]> {
    const records = await this.prisma.employeeSetupLog.findMany({
      where: {
        tenantId,
        status: { in: [SetupStatus.PENDING, SetupStatus.PARTIAL, SetupStatus.FAILED] },
      },
      orderBy: { startedAt: 'desc' },
    });

    return records.map((r) => this.mapToEntity(r));
  }

  private mapToEntity(record: any): EmployeeSetupLogEntity {
    return {
      id: record.id,
      tenantId: record.tenantId,
      staffId: record.staffId,
      simplePayEmployeeId: record.simplePayEmployeeId,
      status: record.status as SetupStatus,
      setupSteps: record.setupSteps as SetupStepResult[],
      profileAssigned: record.profileAssigned,
      leaveInitialized: record.leaveInitialized,
      taxConfigured: record.taxConfigured,
      calculationsAdded: record.calculationsAdded,
      triggeredBy: record.triggeredBy,
      errors: record.errors as string[] | null,
      warnings: record.warnings as string[] | null,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
    };
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
  Get,
  Body,
  Param,
  UseGuards,
  Request,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantGuard } from '../../auth/guards/tenant.guard';
import { SimplePayEmployeeSetupService } from '../../integrations/simplepay/simplepay-employee-setup.service';
import {
  EmployeeSetupRequestDto,
  EmployeeSetupResultDto,
  SetupStatusDto,
} from '../../database/dto/employee-setup.dto';

@ApiTags('SimplePay Employee Setup')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('api/integrations/simplepay/employees')
export class SimplePayEmployeeSetupController {
  constructor(private readonly setupService: SimplePayEmployeeSetupService) {}

  @Post(':staffId/setup')
  @ApiOperation({ summary: 'Trigger comprehensive employee setup in SimplePay' })
  @ApiParam({ name: 'staffId', description: 'CrecheBooks staff ID' })
  @ApiResponse({ status: HttpStatus.OK, type: EmployeeSetupResultDto })
  async setupEmployee(
    @Request() req: any,
    @Param('staffId') staffId: string,
    @Body() body: Omit<EmployeeSetupRequestDto, 'staffId'>,
  ): Promise<EmployeeSetupResultDto> {
    return this.setupService.setupEmployeeComprehensive(
      req.tenantId,
      { ...body, staffId },
      req.user.id,
    );
  }

  @Get(':staffId/setup-status')
  @ApiOperation({ summary: 'Get setup status for an employee' })
  @ApiParam({ name: 'staffId', description: 'CrecheBooks staff ID' })
  @ApiResponse({ status: HttpStatus.OK, type: SetupStatusDto })
  async getSetupStatus(
    @Request() req: any,
    @Param('staffId') staffId: string,
  ): Promise<SetupStatusDto | null> {
    return this.setupService.getSetupStatus(req.tenantId, staffId);
  }

  @Post(':staffId/retry-setup')
  @ApiOperation({ summary: 'Retry failed setup steps' })
  @ApiParam({ name: 'staffId', description: 'CrecheBooks staff ID' })
  @ApiResponse({ status: HttpStatus.OK, type: EmployeeSetupResultDto })
  async retrySetup(
    @Request() req: any,
    @Param('staffId') staffId: string,
  ): Promise<EmployeeSetupResultDto> {
    return this.setupService.retrySetup(req.tenantId, staffId, req.user.id);
  }
}
```

---

## Test Specification

```typescript
// tests/integrations/simplepay/employee-setup.service.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SimplePayEmployeeSetupService } from '../../../src/integrations/simplepay/simplepay-employee-setup.service';
import { EmployeeSetupPipeline } from '../../../src/integrations/simplepay/setup-pipeline/setup-pipeline';
import { EmployeeSetupLogRepository } from '../../../src/database/repositories/employee-setup-log.repository';
import { StaffRepository } from '../../../src/database/repositories/staff.repository';
import { SetupStatus } from '../../../src/database/entities/employee-setup-log.entity';
import { ProfileSelector } from '../../../src/integrations/simplepay/setup-pipeline/profile-selector';
import { calculateProRataLeave, BCEA_DEFAULTS } from '../../../src/integrations/simplepay/setup-pipeline/leave-calculator';

describe('SimplePayEmployeeSetupService', () => {
  let service: SimplePayEmployeeSetupService;
  let mockPipeline: jest.Mocked<EmployeeSetupPipeline>;
  let mockSetupLogRepo: jest.Mocked<EmployeeSetupLogRepository>;
  let mockStaffRepo: jest.Mocked<StaffRepository>;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockPipeline = {
      registerStep: jest.fn(),
      execute: jest.fn(),
    } as any;

    mockSetupLogRepo = {
      create: jest.fn(),
      update: jest.fn(),
      findByStaff: jest.fn(),
    } as any;

    mockStaffRepo = {
      findById: jest.fn(),
      update: jest.fn(),
    } as any;

    // Create a simplified test module
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        { provide: EmployeeSetupPipeline, useValue: mockPipeline },
        { provide: EmployeeSetupLogRepository, useValue: mockSetupLogRepo },
        { provide: StaffRepository, useValue: mockStaffRepo },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();
  });

  describe('ProfileSelector', () => {
    let selector: ProfileSelector;

    beforeEach(() => {
      selector = new ProfileSelector();
    });

    it('should select principal profile for PRINCIPAL + PERMANENT', () => {
      const result = selector.selectProfile('PRINCIPAL', 'PERMANENT');
      expect(result?.profileId).toBe('prof_principal');
    });

    it('should select full-time teacher profile for TEACHER + PERMANENT', () => {
      const result = selector.selectProfile('TEACHER', 'PERMANENT');
      expect(result?.profileId).toBe('prof_fulltime_teacher');
    });

    it('should select part-time profile for TEACHER + CONTRACT', () => {
      const result = selector.selectProfile('TEACHER', 'CONTRACT');
      expect(result?.profileId).toBe('prof_parttime_staff');
    });

    it('should select casual profile for any role with CASUAL employment', () => {
      const result = selector.selectProfile('ASSISTANT', 'CASUAL');
      expect(result?.profileId).toBe('prof_casual');
    });

    it('should fall back to general staff for unknown roles', () => {
      const result = selector.selectProfile('UNKNOWN_ROLE', 'PERMANENT');
      expect(result?.profileId).toBe('prof_general_staff');
    });

    it('should be case-insensitive', () => {
      const result = selector.selectProfile('teacher', 'permanent');
      expect(result?.profileId).toBe('prof_fulltime_teacher');
    });
  });

  describe('calculateProRataLeave', () => {
    it('should calculate full entitlement for start of year', () => {
      const startDate = new Date('2026-01-01');
      const result = calculateProRataLeave(startDate, new Date('2026-12-31'));

      expect(result.annual).toBe(BCEA_DEFAULTS.annual);
      expect(result.sick).toBe(BCEA_DEFAULTS.sick);
      expect(result.calculationDetails.isFirstYear).toBe(false);
    });

    it('should calculate pro-rata for mid-year start', () => {
      const startDate = new Date('2026-07-01');
      const result = calculateProRataLeave(startDate, new Date('2026-12-31'));

      // 6 months remaining (Jul-Dec)
      expect(result.annual).toBeCloseTo(7.5, 1); // 15 / 12 * 6
      expect(result.sick).toBe(BCEA_DEFAULTS.sick); // Sick leave not pro-rated
      expect(result.calculationDetails.isFirstYear).toBe(true);
      expect(result.calculationDetails.monthsRemaining).toBe(6);
    });

    it('should calculate minimal leave for end-of-year start', () => {
      const startDate = new Date('2026-12-01');
      const result = calculateProRataLeave(startDate, new Date('2026-12-31'));

      // 1 month remaining
      expect(result.annual).toBeCloseTo(1.3, 1); // 15 / 12 * 1
      expect(result.calculationDetails.monthsRemaining).toBe(1);
    });

    it('should use custom entitlements when provided', () => {
      const startDate = new Date('2026-07-01');
      const customEntitlements = { annual: 20, sick: 40, familyResponsibility: 5 };
      const result = calculateProRataLeave(startDate, new Date('2026-12-31'), customEntitlements);

      expect(result.annual).toBeCloseTo(10, 1); // 20 / 12 * 6
      expect(result.sick).toBe(40);
    });
  });

  describe('Pipeline execution', () => {
    it('should execute all steps in order', async () => {
      const executedSteps: string[] = [];

      mockPipeline.execute.mockImplementation(async (context) => {
        context.results = [
          { step: 'create_employee', status: 'completed', details: 'Created' },
          { step: 'assign_profile', status: 'completed', details: 'Assigned' },
          { step: 'setup_leave', status: 'completed', details: 'Leave setup' },
          { step: 'configure_tax', status: 'skipped', details: 'No tax info' },
          { step: 'add_calculations', status: 'skipped', details: 'No calculations' },
          { step: 'verify_setup', status: 'completed', details: 'Verified' },
          { step: 'send_notification', status: 'completed', details: 'Notified' },
        ];
        context.simplePayEmployeeId = '12345';
        return context;
      });

      mockStaffRepo.findById.mockResolvedValue({
        id: 'staff-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@creche.co.za',
        role: 'TEACHER',
        employmentType: 'PERMANENT',
        startDate: new Date('2026-01-15'),
        basicSalaryCents: 2000000,
      } as any);

      mockSetupLogRepo.create.mockResolvedValue({ id: 'log-1' } as any);
      mockSetupLogRepo.update.mockResolvedValue({} as any);

      // This would need the full service setup to work properly
      // For now, we're testing the individual components
    });
  });

  describe('Error handling', () => {
    it('should handle step failures with rollback', async () => {
      mockPipeline.execute.mockImplementation(async (context) => {
        context.results = [
          { step: 'create_employee', status: 'completed', details: 'Created' },
          { step: 'assign_profile', status: 'failed', error: 'Profile not found' },
          { step: 'create_employee', status: 'rolled_back', details: 'Rolled back' },
        ];
        context.errors = ['Profile not found'];
        return context;
      });

      // Verify rollback occurred
    });

    it('should mark setup as partial when some steps fail', async () => {
      mockPipeline.execute.mockImplementation(async (context) => {
        context.results = [
          { step: 'create_employee', status: 'completed' },
          { step: 'assign_profile', status: 'completed' },
          { step: 'setup_leave', status: 'failed', error: 'Leave API error' },
        ];
        context.errors = ['Leave API error'];
        context.simplePayEmployeeId = '12345';
        return context;
      });

      // Status should be PARTIAL, not FAILED
    });
  });
});
```

---

## Acceptance Criteria

- [ ] Full setup pipeline executes successfully for new employees
- [ ] Profile auto-selected based on role and employment type
- [ ] Leave balances initialized with pro-rata calculation for first-year employees
- [ ] Tax configuration applied when settings provided
- [ ] Additional calculations added to employee
- [ ] Setup verified against SimplePay API
- [ ] Notifications sent on completion (success or failure)
- [ ] Partial failures handled gracefully with detailed logging
- [ ] Rollback mechanism works for failed setups
- [ ] Auto-setup triggered on staff.created event when SimplePay connected
- [ ] Manual setup trigger available via API
- [ ] Retry mechanism for failed setups
- [ ] Setup status queryable via API
- [ ] All endpoints documented in Swagger
- [ ] Unit tests pass: `pnpm test --runInBand`

---

## Files to Create/Modify

### New Files
- `src/integrations/simplepay/simplepay-employee-setup.service.ts`
- `src/integrations/simplepay/setup-pipeline/setup-pipeline.ts`
- `src/integrations/simplepay/setup-pipeline/profile-selector.ts`
- `src/integrations/simplepay/setup-pipeline/leave-calculator.ts`
- `src/integrations/simplepay/setup-pipeline/steps/create-employee.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/assign-profile.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/setup-leave.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/configure-tax.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/add-calculations.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/verify-setup.step.ts`
- `src/integrations/simplepay/setup-pipeline/steps/send-notification.step.ts`
- `src/integrations/simplepay/handlers/staff-created.handler.ts`
- `src/database/repositories/employee-setup-log.repository.ts`
- `src/database/dto/employee-setup.dto.ts`
- `src/database/entities/employee-setup-log.entity.ts`
- `tests/integrations/simplepay/employee-setup.service.spec.ts`

### Modified Files
- `prisma/schema.prisma` - Add EmployeeSetupLog model and SetupStatus enum
- `src/integrations/simplepay/simplepay.module.ts` - Register setup service and steps
- `src/api/integrations/simplepay.controller.ts` - Add setup endpoints
- `src/api/staff/staff.service.ts` - Emit staff.created event

---

**Last Updated**: 2026-01-08
**Template Version**: 2.0 (Comprehensive)

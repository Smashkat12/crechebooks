<task_spec id="TASK-SPAY-006" version="2.0">

<metadata>
  <title>SimplePay Profile Mappings Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>180</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-PROFILE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-STAFF-004</task_ref>
    <task_ref status="pending">TASK-SPAY-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
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
  - `simplepay-calculations.service.ts` - Calculations/inherited calculations (TASK-SPAY-003)
  - `simplepay-reports.service.ts` - Payroll reports (TASK-SPAY-005)
  - `simplepay.module.ts` - NestJS module exports

  **Existing SimplePay Database Models (prisma/schema.prisma):**
  - `SimplePayConnection` - Stores API key (encrypted), client ID per tenant
  - `SimplePayEmployeeMapping` - Maps Staff.id to SimplePay employee ID
  - `SimplePayPayslipImport` - Stores imported payslip data
  - `PayRunSync` - Pay run tracking (TASK-SPAY-002)
  - `CalculationItemCache` - Cached calculation items (TASK-SPAY-003)
  - `PayrollAdjustment` - One-off adjustments (TASK-SPAY-003)
  - `ReportRequest` - Report audit trail (TASK-SPAY-005)

  **SimplePay API Base URL:** `https://api.payroll.simplepay.cloud/v1`
  **Rate Limit:** 60 requests per minute (1000 per hour)

  **Test Count:** 450+ tests passing
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

    // SimplePay returns wrapped responses: [{ profile_mapping: {...} }, ...]
    const response = await this.apiClient.get<ProfileMappingWrapper[]>(
      `/employees/${employeeId}/profile_mappings`
    );
    return response.map(w => w.profile_mapping);
  }
  ```

  ### 3. Service Pattern (src/integrations/simplepay/*.service.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';

  @Injectable()
  export class SimplePayProfileService {
    private readonly logger = new Logger(SimplePayProfileService.name);

    constructor(
      private readonly apiClient: SimplePayApiClient,
      private readonly simplePayRepo: SimplePayRepository,
      private readonly profileMappingSyncRepo: ProfileMappingSyncRepository,
    ) {}
  }
  ```

  ### 4. Repository Pattern (src/database/repositories/*.repository.ts)
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import { PrismaService } from '../prisma/prisma.service';

  @Injectable()
  export class ProfileMappingSyncRepository {
    private readonly logger = new Logger(ProfileMappingSyncRepository.name);
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
    await prisma.profileMappingSync.deleteMany({});  // NEW tables first
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
This task implements profile (calculation template) mapping management via SimplePay API.

**What are Profiles in SimplePay?**
Profiles are calculation templates that can be assigned to employees to automatically apply standard earnings, deductions, and company contributions. This is the "template" system for payroll setup - instead of manually adding each calculation to every employee, you assign a profile that includes all standard items for that employee type.

**SimplePay Profile Mappings API Endpoints:**
- `GET /v1/employees/:employee_id/profile_mappings` - List template assignments
- `POST /v1/employees/:employee_id/profile_mappings` - Assign template to employee
- `PUT /v1/profile_mappings/:profile_mapping_id` - Toggle calculations on/off
- `DELETE /v1/profile_mappings/:profile_mapping_id` - Remove profile mapping

**South African Creche Profile Types:**
- **Full-Time Teacher Profile**: Basic Salary, PAYE, UIF (1%), SDL (1%), optional Pension
- **Part-Time Staff Profile**: Hourly Rate, PAYE, UIF only
- **Kitchen Staff Profile**: Basic Salary, PAYE, UIF, SDL, Food Allowance
- **Principal/Manager Profile**: Basic Salary, Cell Allowance, Travel Allowance, PAYE, UIF, SDL, Pension, Medical Aid

**Business Logic:**
- Profiles simplify employee setup by applying standard calculations
- Individual calculations can be toggled on/off per employee
- Profile assignments tracked locally for auditing
- Integration with staff onboarding workflow (auto-assign based on role)
- Bulk assignment for mass onboarding scenarios
</context>

<scope>
  <in_scope>
    - Add ProfileMappingSync model to prisma/schema.prisma
    - Run migration: npx prisma migrate dev --name create_profile_mapping_sync
    - Create src/database/entities/profile-mapping.entity.ts
    - Create src/database/dto/profile.dto.ts
    - Create src/database/repositories/profile-mapping-sync.repository.ts
    - Create src/integrations/simplepay/simplepay-profile.service.ts
    - Update src/integrations/simplepay/simplepay.module.ts
    - Add profile endpoints to src/api/integrations/simplepay.controller.ts
    - Update src/database/entities/index.ts
    - Update src/database/dto/index.ts
    - Update src/database/repositories/index.ts
    - Update ALL existing test files with new cleanup order
    - Create tests/integrations/simplepay/simplepay-profile.service.spec.ts (12+ tests)
    - Create tests/database/repositories/profile-mapping-sync.repository.spec.ts (8+ tests)
  </in_scope>
  <out_of_scope>
    - Leave management (TASK-SPAY-001)
    - Pay run integration (TASK-SPAY-002)
    - Calculations service (TASK-SPAY-003)
    - Auto-setup pipeline (TASK-SPAY-008)
    - UI components
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- SIMPLEPAY API RESPONSE FORMATS              -->
<!-- ============================================ -->

<simplepay_api_reference>
## SimplePay Profile Mappings API Response Formats (CRITICAL - responses are wrapped!)

### GET /v1/employees/:employee_id/profile_mappings
Returns profile templates assigned to an employee.

Response:
```json
[
  {
    "profile_mapping": {
      "id": 12345,
      "profile_id": 100,
      "profile_name": "Full-Time Teacher",
      "calculations": [
        {
          "calculation_id": 56789,
          "item_code": "BASIC",
          "item_name": "Basic Salary",
          "is_enabled": true
        },
        {
          "calculation_id": 56790,
          "item_code": "PAYE",
          "item_name": "PAYE",
          "is_enabled": true
        },
        {
          "calculation_id": 56791,
          "item_code": "UIF_EE",
          "item_name": "UIF Employee",
          "is_enabled": true
        },
        {
          "calculation_id": 56792,
          "item_code": "UIF_ER",
          "item_name": "UIF Employer",
          "is_enabled": true
        },
        {
          "calculation_id": 56793,
          "item_code": "SDL",
          "item_name": "Skills Development Levy",
          "is_enabled": true
        },
        {
          "calculation_id": 56794,
          "item_code": "PENSION",
          "item_name": "Pension Fund",
          "is_enabled": false
        }
      ],
      "assigned_at": "2026-01-15T08:30:00Z"
    }
  }
]
```

### POST /v1/employees/:employee_id/profile_mappings
Assigns a profile template to an employee.

Request:
```json
{
  "profile_mapping": {
    "profile_id": 100
  }
}
```

Response (same wrapper format):
```json
{
  "profile_mapping": {
    "id": 12345,
    "profile_id": 100,
    "profile_name": "Full-Time Teacher",
    "calculations": [...],
    "assigned_at": "2026-01-15T08:30:00Z"
  }
}
```

### PUT /v1/profile_mappings/:profile_mapping_id
Toggles individual calculations on/off for a profile mapping.

Request:
```json
{
  "profile_mapping": {
    "calculation_toggles": {
      "56789": true,
      "56790": true,
      "56791": true,
      "56792": true,
      "56793": true,
      "56794": false
    }
  }
}
```

Response (same wrapper format as GET).

### DELETE /v1/profile_mappings/:profile_mapping_id
Removes the profile mapping from the employee.

Response: 204 No Content
</simplepay_api_reference>

<!-- ============================================ -->
<!-- EXACT FILE CONTENTS TO CREATE               -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma (AFTER ReportRequest model)

```prisma
// TASK-SPAY-006: Profile Mapping Sync
model ProfileMappingSync {
  id                     String   @id @default(uuid())
  tenantId               String   @map("tenant_id")
  staffId                String   @map("staff_id")
  simplePayMappingId     Int      @map("simplepay_mapping_id")
  simplePayProfileId     Int      @map("simplepay_profile_id")
  profileName            String   @map("profile_name") @db.VarChar(100)
  calculationSettings    Json     @map("calculation_settings") // { calcId: boolean }
  syncedAt               DateTime @default(now()) @map("synced_at")
  createdAt              DateTime @default(now()) @map("created_at")
  updatedAt              DateTime @updatedAt @map("updated_at")

  tenant Tenant @relation(fields: [tenantId], references: [id])
  staff  Staff  @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@unique([tenantId, staffId, simplePayMappingId])
  @@index([tenantId])
  @@index([staffId])
  @@index([tenantId, staffId])
  @@map("profile_mapping_sync")
}
```

## Update Tenant model - ADD this relation:
```prisma
model Tenant {
  // ... existing relations ...
  profileMappingSync    ProfileMappingSync[]  // ADD THIS
}
```

## Update Staff model - ADD this relation:
```prisma
model Staff {
  // ... existing relations ...
  profileMappingSync    ProfileMappingSync[]  // ADD THIS
}
```
</prisma_schema_additions>

<entity_files>
## src/database/entities/profile-mapping.entity.ts
```typescript
/**
 * Profile Mapping Entity Types
 * TASK-SPAY-006: SimplePay Profile Mappings Service
 */

export interface IProfileMappingSync {
  id: string;
  tenantId: string;
  staffId: string;
  simplePayMappingId: number;
  simplePayProfileId: number;
  profileName: string;
  calculationSettings: Record<string, boolean>;
  syncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// SimplePay API types
export interface SimplePayProfileCalculation {
  calculation_id: number;
  item_code: string;
  item_name: string;
  is_enabled: boolean;
}

export interface SimplePayProfileMapping {
  id: number;
  profile_id: number;
  profile_name: string;
  calculations: SimplePayProfileCalculation[];
  assigned_at: string;
}

// Response wrapper types
export interface ProfileMappingWrapper {
  profile_mapping: SimplePayProfileMapping;
}

// CrecheBooks API types (camelCase)
export interface ProfileMappingCalculation {
  calculationId: number;
  itemCode: string;
  itemName: string;
  isEnabled: boolean;
}

export interface ProfileMapping {
  id: number;
  profileId: number;
  profileName: string;
  calculations: ProfileMappingCalculation[];
  assignedAt: Date;
}

// Profile type for reference (stored in SimplePay, not CrecheBooks)
export interface Profile {
  id: number;
  name: string;
  description?: string;
  calculations: Array<{
    itemCode: string;
    itemName: string;
    type: 'earning' | 'deduction' | 'company_contribution';
    defaultAmount?: number;
    defaultPercentage?: number;
    isEnabled: boolean;
  }>;
}

// Common creche profile names for auto-assignment
export const CRECHE_PROFILES = {
  FULL_TIME_TEACHER: 'Full-Time Teacher',
  PART_TIME_STAFF: 'Part-Time Staff',
  KITCHEN_STAFF: 'Kitchen Staff',
  PRINCIPAL: 'Principal/Manager',
  ADMIN_STAFF: 'Admin Staff',
  CASUAL: 'Casual Worker',
} as const;

// Role to profile mapping for auto-assignment
export const ROLE_TO_PROFILE: Record<string, string> = {
  TEACHER: CRECHE_PROFILES.FULL_TIME_TEACHER,
  ASSISTANT: CRECHE_PROFILES.PART_TIME_STAFF,
  KITCHEN: CRECHE_PROFILES.KITCHEN_STAFF,
  PRINCIPAL: CRECHE_PROFILES.PRINCIPAL,
  ADMIN: CRECHE_PROFILES.ADMIN_STAFF,
  CASUAL: CRECHE_PROFILES.CASUAL,
};
```
</entity_files>

<dto_files>
## src/database/dto/profile.dto.ts
```typescript
import {
  IsUUID,
  IsString,
  IsInt,
  IsOptional,
  IsObject,
  IsBoolean,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignProfileDto {
  @ApiProperty({ description: 'SimplePay profile ID to assign' })
  @IsInt()
  @Min(1)
  profileId!: number;
}

export class UpdateProfileMappingDto {
  @ApiProperty({
    description: 'Calculation toggle settings (calculationId: enabled)',
    example: { '56789': true, '56790': true, '56791': false },
  })
  @IsObject()
  calculationToggles!: Record<string, boolean>;
}

export class BulkAssignProfileDto {
  @ApiProperty({ description: 'SimplePay profile ID to assign' })
  @IsInt()
  @Min(1)
  profileId!: number;

  @ApiProperty({ description: 'List of staff IDs to assign the profile to' })
  @IsArray()
  @IsUUID('4', { each: true })
  staffIds!: string[];
}

export class CreateProfileMappingSyncDto {
  @ApiProperty({ description: 'Tenant ID' })
  @IsUUID()
  tenantId!: string;

  @ApiProperty({ description: 'Staff ID' })
  @IsUUID()
  staffId!: string;

  @ApiProperty({ description: 'SimplePay mapping ID' })
  @IsInt()
  @Min(1)
  simplePayMappingId!: number;

  @ApiProperty({ description: 'SimplePay profile ID' })
  @IsInt()
  @Min(1)
  simplePayProfileId!: number;

  @ApiProperty({ description: 'Profile name' })
  @IsString()
  profileName!: string;

  @ApiProperty({ description: 'Calculation settings' })
  @IsObject()
  calculationSettings!: Record<string, boolean>;
}

export class UpdateProfileMappingSyncDto {
  @ApiPropertyOptional({ description: 'Updated calculation settings' })
  @IsOptional()
  @IsObject()
  calculationSettings?: Record<string, boolean>;
}

// Response DTOs
export class ProfileMappingCalculationDto {
  @ApiProperty()
  calculationId!: number;

  @ApiProperty()
  itemCode!: string;

  @ApiProperty()
  itemName!: string;

  @ApiProperty()
  isEnabled!: boolean;
}

export class ProfileMappingResponseDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  profileId!: number;

  @ApiProperty()
  profileName!: string;

  @ApiProperty({ type: [ProfileMappingCalculationDto] })
  calculations!: ProfileMappingCalculationDto[];

  @ApiProperty()
  assignedAt!: Date;
}

export class BulkAssignResultDto {
  @ApiProperty({ description: 'Staff IDs that were successfully assigned' })
  successful!: string[];

  @ApiProperty({ description: 'Failed assignments with error details' })
  failed!: Array<{ staffId: string; error: string }>;
}
```
</dto_files>

<repository_file>
## src/database/repositories/profile-mapping-sync.repository.ts

```typescript
/**
 * Profile Mapping Sync Repository
 * TASK-SPAY-006: SimplePay Profile Mappings Service
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProfileMappingSync } from '@prisma/client';
import {
  CreateProfileMappingSyncDto,
  UpdateProfileMappingSyncDto,
} from '../dto/profile.dto';

@Injectable()
export class ProfileMappingSyncRepository {
  private readonly logger = new Logger(ProfileMappingSyncRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a profile mapping sync record
   */
  async create(dto: CreateProfileMappingSyncDto): Promise<ProfileMappingSync> {
    try {
      return await this.prisma.profileMappingSync.create({
        data: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayMappingId: dto.simplePayMappingId,
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to create profile mapping sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { dto },
      );
      throw error;
    }
  }

  /**
   * Find by ID
   */
  async findById(id: string): Promise<ProfileMappingSync | null> {
    try {
      return await this.prisma.profileMappingSync.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id },
      );
      throw error;
    }
  }

  /**
   * Find by SimplePay mapping ID
   */
  async findBySimplePayMappingId(
    tenantId: string,
    staffId: string,
    simplePayMappingId: number,
  ): Promise<ProfileMappingSync | null> {
    try {
      return await this.prisma.profileMappingSync.findUnique({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId,
            staffId,
            simplePayMappingId,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by SimplePay mapping ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, staffId, simplePayMappingId },
      );
      throw error;
    }
  }

  /**
   * Find all mappings for a staff member
   */
  async findByStaff(tenantId: string, staffId: string): Promise<ProfileMappingSync[]> {
    try {
      return await this.prisma.profileMappingSync.findMany({
        where: { tenantId, staffId },
        orderBy: { syncedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by staff: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, staffId },
      );
      throw error;
    }
  }

  /**
   * Find all mappings for a tenant
   */
  async findByTenant(tenantId: string): Promise<ProfileMappingSync[]> {
    try {
      return await this.prisma.profileMappingSync.findMany({
        where: { tenantId },
        orderBy: { syncedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by tenant: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId },
      );
      throw error;
    }
  }

  /**
   * Find all staff with a specific profile
   */
  async findByProfile(tenantId: string, profileName: string): Promise<ProfileMappingSync[]> {
    try {
      return await this.prisma.profileMappingSync.findMany({
        where: { tenantId, profileName },
        orderBy: { syncedAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to find profile mapping sync by profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, profileName },
      );
      throw error;
    }
  }

  /**
   * Update calculation settings
   */
  async update(id: string, dto: UpdateProfileMappingSyncDto): Promise<ProfileMappingSync> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException(`ProfileMappingSync with ID ${id} not found`);
      }

      return await this.prisma.profileMappingSync.update({
        where: { id },
        data: {
          ...(dto.calculationSettings && { calculationSettings: dto.calculationSettings }),
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to update profile mapping sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id, dto },
      );
      throw error;
    }
  }

  /**
   * Upsert - create or update based on SimplePay mapping ID
   */
  async upsert(dto: CreateProfileMappingSyncDto): Promise<ProfileMappingSync> {
    try {
      return await this.prisma.profileMappingSync.upsert({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId: dto.tenantId,
            staffId: dto.staffId,
            simplePayMappingId: dto.simplePayMappingId,
          },
        },
        create: {
          tenantId: dto.tenantId,
          staffId: dto.staffId,
          simplePayMappingId: dto.simplePayMappingId,
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
        },
        update: {
          simplePayProfileId: dto.simplePayProfileId,
          profileName: dto.profileName,
          calculationSettings: dto.calculationSettings,
          syncedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to upsert profile mapping sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { dto },
      );
      throw error;
    }
  }

  /**
   * Delete by ID
   */
  async delete(id: string): Promise<void> {
    try {
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundException(`ProfileMappingSync with ID ${id} not found`);
      }

      await this.prisma.profileMappingSync.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(
        `Failed to delete profile mapping sync: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id },
      );
      throw error;
    }
  }

  /**
   * Delete by SimplePay mapping ID
   */
  async deleteBySimplePayMappingId(
    tenantId: string,
    staffId: string,
    simplePayMappingId: number,
  ): Promise<void> {
    try {
      await this.prisma.profileMappingSync.delete({
        where: {
          tenantId_staffId_simplePayMappingId: {
            tenantId,
            staffId,
            simplePayMappingId,
          },
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to delete profile mapping sync by SimplePay mapping ID: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, staffId, simplePayMappingId },
      );
      throw error;
    }
  }

  /**
   * Delete all mappings for a staff member
   */
  async deleteByStaff(tenantId: string, staffId: string): Promise<number> {
    try {
      const result = await this.prisma.profileMappingSync.deleteMany({
        where: { tenantId, staffId },
      });
      return result.count;
    } catch (error) {
      this.logger.error(
        `Failed to delete profile mapping sync by staff: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { tenantId, staffId },
      );
      throw error;
    }
  }
}
```
</repository_file>

<service_file>
## src/integrations/simplepay/simplepay-profile.service.ts

```typescript
/**
 * SimplePay Profile Service
 * TASK-SPAY-006: Profile Mappings Management
 *
 * Manages profile (calculation template) assignments for employees via SimplePay API.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { SimplePayApiClient } from './simplepay-api.client';
import { SimplePayRepository } from '../../database/repositories/simplepay.repository';
import { ProfileMappingSyncRepository } from '../../database/repositories/profile-mapping-sync.repository';
import {
  SimplePayProfileMapping,
  ProfileMappingWrapper,
  ProfileMapping,
  ROLE_TO_PROFILE,
} from '../../database/entities/profile-mapping.entity';
import {
  AssignProfileDto,
  UpdateProfileMappingDto,
  BulkAssignProfileDto,
  BulkAssignResultDto,
  ProfileMappingResponseDto,
} from '../../database/dto/profile.dto';

@Injectable()
export class SimplePayProfileService {
  private readonly logger = new Logger(SimplePayProfileService.name);

  constructor(
    private readonly apiClient: SimplePayApiClient,
    private readonly simplePayRepo: SimplePayRepository,
    private readonly profileMappingSyncRepo: ProfileMappingSyncRepository,
  ) {}

  /**
   * Get profile mappings for an employee
   */
  async getEmployeeProfileMappings(
    tenantId: string,
    staffId: string,
  ): Promise<ProfileMappingResponseDto[]> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.get<ProfileMappingWrapper[]>(
      `/employees/${mapping.simplePayEmployeeId}/profile_mappings`,
    );

    const profileMappings = response.map(w => this.transformProfileMapping(w.profile_mapping));

    // Sync to local database
    for (const pm of response) {
      const calcSettings: Record<string, boolean> = {};
      for (const calc of pm.profile_mapping.calculations) {
        calcSettings[String(calc.calculation_id)] = calc.is_enabled;
      }

      await this.profileMappingSyncRepo.upsert({
        tenantId,
        staffId,
        simplePayMappingId: pm.profile_mapping.id,
        simplePayProfileId: pm.profile_mapping.profile_id,
        profileName: pm.profile_mapping.profile_name,
        calculationSettings: calcSettings,
      });
    }

    return profileMappings;
  }

  /**
   * Assign a profile to an employee
   */
  async assignProfile(
    tenantId: string,
    staffId: string,
    dto: AssignProfileDto,
  ): Promise<ProfileMappingResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);

    const mapping = await this.simplePayRepo.findEmployeeMapping(staffId);
    if (!mapping) {
      throw new NotFoundException('Employee not synced to SimplePay');
    }

    const response = await this.apiClient.post<ProfileMappingWrapper>(
      `/employees/${mapping.simplePayEmployeeId}/profile_mappings`,
      {
        profile_mapping: {
          profile_id: dto.profileId,
        },
      },
    );

    const profileMapping = this.transformProfileMapping(response.profile_mapping);

    // Sync to local database
    const calcSettings: Record<string, boolean> = {};
    for (const calc of response.profile_mapping.calculations) {
      calcSettings[String(calc.calculation_id)] = calc.is_enabled;
    }

    await this.profileMappingSyncRepo.upsert({
      tenantId,
      staffId,
      simplePayMappingId: response.profile_mapping.id,
      simplePayProfileId: response.profile_mapping.profile_id,
      profileName: response.profile_mapping.profile_name,
      calculationSettings: calcSettings,
    });

    this.logger.log(
      `Assigned profile ${dto.profileId} to staff ${staffId}: mapping ID ${response.profile_mapping.id}`,
    );

    return profileMapping;
  }

  /**
   * Update calculation toggles for a profile mapping
   */
  async updateProfileMapping(
    tenantId: string,
    simplePayMappingId: number,
    dto: UpdateProfileMappingDto,
  ): Promise<ProfileMappingResponseDto> {
    await this.apiClient.initializeForTenant(tenantId);

    // Convert string keys to number keys for API
    const calculationToggles: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(dto.calculationToggles)) {
      calculationToggles[key] = value;
    }

    const response = await this.apiClient.patch<ProfileMappingWrapper>(
      `/profile_mappings/${simplePayMappingId}`,
      {
        profile_mapping: {
          calculation_toggles: calculationToggles,
        },
      },
    );

    const profileMapping = this.transformProfileMapping(response.profile_mapping);

    // Update local sync record if exists
    const localSync = await this.profileMappingSyncRepo.findBySimplePayMappingId(
      tenantId,
      '', // We need to find by tenant and mapping ID
      simplePayMappingId,
    );

    if (localSync) {
      const calcSettings: Record<string, boolean> = {};
      for (const calc of response.profile_mapping.calculations) {
        calcSettings[String(calc.calculation_id)] = calc.is_enabled;
      }

      await this.profileMappingSyncRepo.update(localSync.id, {
        calculationSettings: calcSettings,
      });
    }

    this.logger.log(`Updated profile mapping ${simplePayMappingId}`);

    return profileMapping;
  }

  /**
   * Remove a profile mapping from an employee
   */
  async removeProfileMapping(
    tenantId: string,
    staffId: string,
    simplePayMappingId: number,
  ): Promise<void> {
    await this.apiClient.initializeForTenant(tenantId);

    await this.apiClient.delete(`/profile_mappings/${simplePayMappingId}`);

    // Remove from local sync
    await this.profileMappingSyncRepo.deleteBySimplePayMappingId(
      tenantId,
      staffId,
      simplePayMappingId,
    );

    this.logger.log(`Removed profile mapping ${simplePayMappingId} from staff ${staffId}`);
  }

  /**
   * Bulk assign a profile to multiple employees
   */
  async bulkAssignProfile(
    tenantId: string,
    dto: BulkAssignProfileDto,
  ): Promise<BulkAssignResultDto> {
    const successful: string[] = [];
    const failed: Array<{ staffId: string; error: string }> = [];

    for (const staffId of dto.staffIds) {
      try {
        await this.assignProfile(tenantId, staffId, { profileId: dto.profileId });
        successful.push(staffId);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        failed.push({ staffId, error: message });
        this.logger.warn(`Failed to assign profile to staff ${staffId}: ${message}`);
      }
    }

    this.logger.log(
      `Bulk profile assignment complete: ${successful.length} successful, ${failed.length} failed`,
    );

    return { successful, failed };
  }

  /**
   * Get suggested profile for a staff role
   * Used during onboarding to auto-assign appropriate profile
   */
  getSuggestedProfileForRole(role: string): string | null {
    return ROLE_TO_PROFILE[role.toUpperCase()] || null;
  }

  /**
   * Get local sync records for a staff member
   */
  async getLocalSyncRecords(tenantId: string, staffId: string) {
    return this.profileMappingSyncRepo.findByStaff(tenantId, staffId);
  }

  /**
   * Get all staff with a specific profile
   */
  async getStaffByProfile(tenantId: string, profileName: string) {
    return this.profileMappingSyncRepo.findByProfile(tenantId, profileName);
  }

  // Helper methods
  private transformProfileMapping(pm: SimplePayProfileMapping): ProfileMappingResponseDto {
    return {
      id: pm.id,
      profileId: pm.profile_id,
      profileName: pm.profile_name,
      calculations: pm.calculations.map(calc => ({
        calculationId: calc.calculation_id,
        itemCode: calc.item_code,
        itemName: calc.item_name,
        isEnabled: calc.is_enabled,
      })),
      assignedAt: new Date(pm.assigned_at),
    };
  }
}
```
</service_file>

<controller_additions>
## Add to src/api/integrations/simplepay.controller.ts

Add these endpoints to the existing SimplePay controller:

```typescript
// ============================================
// Profile Mappings
// ============================================

@Get('employees/:staffId/profile-mappings')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get profile mappings for employee' })
@ApiResponse({ status: 200, type: [ProfileMappingResponseDto] })
async getEmployeeProfileMappings(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
): Promise<ProfileMappingResponseDto[]> {
  return this.profileService.getEmployeeProfileMappings(user.tenantId, staffId);
}

@Post('employees/:staffId/profile-mappings')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Assign profile to employee' })
@ApiResponse({ status: 201, type: ProfileMappingResponseDto })
async assignProfile(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Body() dto: AssignProfileDto,
): Promise<ProfileMappingResponseDto> {
  return this.profileService.assignProfile(user.tenantId, staffId, dto);
}

@Patch('profile-mappings/:mappingId')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Update profile mapping calculation toggles' })
@ApiResponse({ status: 200, type: ProfileMappingResponseDto })
async updateProfileMapping(
  @CurrentUser() user: IUser,
  @Param('mappingId') mappingId: string,
  @Body() dto: UpdateProfileMappingDto,
): Promise<ProfileMappingResponseDto> {
  return this.profileService.updateProfileMapping(
    user.tenantId,
    parseInt(mappingId, 10),
    dto,
  );
}

@Delete('employees/:staffId/profile-mappings/:mappingId')
@HttpCode(HttpStatus.NO_CONTENT)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Remove profile mapping from employee' })
async removeProfileMapping(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
  @Param('mappingId') mappingId: string,
): Promise<void> {
  await this.profileService.removeProfileMapping(
    user.tenantId,
    staffId,
    parseInt(mappingId, 10),
  );
}

@Post('profile-mappings/bulk-assign')
@Roles(UserRole.OWNER, UserRole.ADMIN)
@ApiOperation({ summary: 'Bulk assign profile to multiple employees' })
@ApiResponse({ status: 200, type: BulkAssignResultDto })
async bulkAssignProfile(
  @CurrentUser() user: IUser,
  @Body() dto: BulkAssignProfileDto,
): Promise<BulkAssignResultDto> {
  return this.profileService.bulkAssignProfile(user.tenantId, dto);
}

@Get('profiles/suggest/:role')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get suggested profile for role' })
@ApiParam({ name: 'role', description: 'Staff role (e.g., TEACHER, KITCHEN, PRINCIPAL)' })
async getSuggestedProfile(
  @Param('role') role: string,
): Promise<{ suggestedProfile: string | null }> {
  const suggestedProfile = this.profileService.getSuggestedProfileForRole(role);
  return { suggestedProfile };
}

@Get('employees/:staffId/profile-mappings/local')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get local sync records for employee' })
async getLocalSyncRecords(
  @CurrentUser() user: IUser,
  @Param('staffId') staffId: string,
) {
  return this.profileService.getLocalSyncRecords(user.tenantId, staffId);
}

@Get('profiles/:profileName/staff')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@ApiOperation({ summary: 'Get all staff with a specific profile' })
async getStaffByProfile(
  @CurrentUser() user: IUser,
  @Param('profileName') profileName: string,
) {
  return this.profileService.getStaffByProfile(user.tenantId, profileName);
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
import { SimplePayCalculationsService } from './simplepay-calculations.service';
import { SimplePayReportsService } from './simplepay-reports.service';
import { SimplePayProfileService } from './simplepay-profile.service';  // ADD

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
    SimplePayCalculationsService,
    SimplePayReportsService,
    SimplePayProfileService,  // ADD
  ],
  exports: [
    SimplePayApiClient,
    SimplePayConnectionService,
    SimplePayEmployeeService,
    SimplePayPayslipService,
    SimplePayTaxService,
    SimplePayLeaveService,
    SimplePayPayRunService,
    SimplePayCalculationsService,
    SimplePayReportsService,
    SimplePayProfileService,  // ADD
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
  await prisma.profileMappingSync.deleteMany({});  // ADD THIS LINE
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
export * from './profile-mapping.entity';
```

## Update src/database/dto/index.ts
Add at end:
```typescript
export * from './profile.dto';
```

## Update src/database/repositories/index.ts
Add at end:
```typescript
export * from './profile-mapping-sync.repository';
```
</index_updates>

<test_requirements>
## Test Files Required

### tests/integrations/simplepay/simplepay-profile.service.spec.ts (12+ tests)
Test scenarios:
- getEmployeeProfileMappings: returns mappings, syncs to local db, throws if not synced
- assignProfile: assigns profile, creates local sync, returns mapping
- updateProfileMapping: updates calculation toggles, updates local sync
- removeProfileMapping: removes from SimplePay, removes local sync
- bulkAssignProfile: handles mixed success/failure, returns result summary
- getSuggestedProfileForRole: returns profile for known role, null for unknown

### tests/database/repositories/profile-mapping-sync.repository.spec.ts (8+ tests)
Test scenarios:
- create: creates with all fields
- findById: exists, not found
- findBySimplePayMappingId: exists, not found
- findByStaff: returns staff mappings
- findByTenant: returns tenant mappings
- findByProfile: returns staff with specific profile
- upsert: creates new, updates existing
- update: updates calculation settings
- delete: removes record
- deleteByStaff: removes all staff mappings

Use REAL test data (South African creche context):
```typescript
const testProfileMappingSync = {
  tenantId: '', // set in beforeEach
  staffId: '', // set in beforeEach
  simplePayMappingId: 12345,
  simplePayProfileId: 100,
  profileName: 'Full-Time Teacher',
  calculationSettings: {
    '56789': true,  // Basic Salary - enabled
    '56790': true,  // PAYE - enabled
    '56791': true,  // UIF Employee - enabled
    '56792': true,  // UIF Employer - enabled
    '56793': true,  // SDL - enabled
    '56794': false, // Pension - disabled
  },
};
```
</test_requirements>

<verification_commands>
## Execution Order (MUST follow exactly)

```bash
# 1. Update schema
# Edit prisma/schema.prisma with additions above

# 2. Run migration
npx prisma migrate dev --name create_profile_mapping_sync

# 3. Generate client
npx prisma generate

# 4. Create entity file
# Create src/database/entities/profile-mapping.entity.ts

# 5. Create DTO file
# Create src/database/dto/profile.dto.ts

# 6. Create repository file
# Create src/database/repositories/profile-mapping-sync.repository.ts

# 7. Create service file
# Create src/integrations/simplepay/simplepay-profile.service.ts

# 8. Update module file
# Update src/integrations/simplepay/simplepay.module.ts

# 9. Update controller file
# Add endpoints to src/api/integrations/simplepay.controller.ts

# 10. Update index files
# Update src/database/entities/index.ts
# Update src/database/dto/index.ts
# Update src/database/repositories/index.ts

# 11. Update existing test files (ALL of them)
# Add profileMappingSync.deleteMany to cleanup

# 12. Create test files
# Create tests/integrations/simplepay/simplepay-profile.service.spec.ts
# Create tests/database/repositories/profile-mapping-sync.repository.spec.ts

# 13. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show 470+ tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - NO mock data in tests - use real PostgreSQL database
    - NO backwards compatibility hacks - fail fast with clear errors
    - NO swallowing errors - log with full context, then re-throw
    - All errors must clearly indicate WHAT failed and WHY
    - Must use UUID for primary keys in local sync table
    - Must include tenantId FK on ProfileMappingSync
    - SimplePay API responses are wrapped (e.g., { profile_mapping: {...} })
    - Local sync records track SimplePay mapping IDs for updates
    - Bulk assignment handles partial failures gracefully
    - Role-to-profile mapping configurable for auto-assignment
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: 470+ tests passing
    - Migration applies and can be reverted
    - Profile mappings retrieval works
    - Profile assignment works
    - Calculation toggle updates work
    - Profile mapping removal works
    - Bulk assignment handles mixed results
    - Local sync records created/updated correctly
    - Role-to-profile suggestions work
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
  - Store SimplePay IDs as strings (use integers)
  - Skip creating local sync records
  - Ignore bulk assignment failures (track and return them)
  - Skip the npx prisma generate step
</anti_patterns>

</task_spec>

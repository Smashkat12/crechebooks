<task_spec id="TASK-BILL-034" version="3.0">

<metadata>
  <title>Enrollment Controller (Child Enrollment Endpoints)</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>49</sequence>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-BILL-011</task_ref>
    <task_ref status="complete">TASK-API-001</task_ref>
    <task_ref status="complete">TASK-BILL-001</task_ref>
    <task_ref status="complete">TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<context>
This task creates a NEW ChildController for child enrollment endpoints. It is a SEPARATE
controller from InvoiceController, registered in the same BillingModule.

CRITICAL REQUIREMENTS:
- NO MOCK DATA in tests - use jest.spyOn() with real behavior verification
- NO BACKWARDS COMPATIBILITY - fail fast with robust error logging
- NO WORKAROUNDS - if something fails, throw appropriate exception
- NO FALLBACKS - use NotFoundException, ConflictException, ValidationException

Service layer (TASK-BILL-011) is COMPLETE. The EnrollmentService provides:
- enrollChild(tenantId, childId, feeStructureId, startDate, userId): Promise<IEnrollment>
- updateEnrollment(tenantId, enrollmentId, updates, userId): Promise<IEnrollment>
- withdrawChild(tenantId, enrollmentId, endDate, userId): Promise<IEnrollment>
- getActiveEnrollments(tenantId, parentId?): Promise<Enrollment[]>
- applySiblingDiscount(tenantId, parentId): Promise<Map<string, Decimal>>

Repository layer (TASK-BILL-001/002) is COMPLETE. Provides:
- ChildRepository.create(), .findById(), .findByTenant(), .update()
- ParentRepository.findById()
- FeeStructureRepository.findById()
- EnrollmentRepository.create(), .findById(), .findActiveByChild()
</context>

<current_codebase_state>
IMPORTANT: These are the ACTUAL file paths and patterns in the codebase.

## Billing Module (from TASK-BILL-031/032)
- src/api/billing/invoice.controller.ts (existing - DO NOT MODIFY)
- src/api/billing/billing.module.ts (ADD ChildController and dependencies)
- src/api/billing/dto/index.ts (export new DTOs)

## Service Layer (COMPLETE - TASK-BILL-011)
- src/database/services/enrollment.service.ts
  ```typescript
  enrollChild(tenantId, childId, feeStructureId, startDate, userId): Promise<IEnrollment>
  updateEnrollment(tenantId, enrollmentId, updates, userId): Promise<IEnrollment>
  withdrawChild(tenantId, enrollmentId, endDate, userId): Promise<IEnrollment>
  getActiveEnrollments(tenantId, parentId?): Promise<Enrollment[]>
  ```

## Entity Types (COMPLETE - TASK-BILL-001/002)
```typescript
// src/database/entities/child.entity.ts
export enum Gender {
  MALE = 'MALE',
  FEMALE = 'FEMALE',
  OTHER = 'OTHER',
}

export interface IChild {
  id: string;
  tenantId: string;
  parentId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: Date;
  gender: Gender | null;
  medicalNotes: string | null;
  emergencyContact: string | null;
  emergencyPhone: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// src/database/entities/enrollment.entity.ts
export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}

export interface IEnrollment {
  id: string;
  tenantId: string;
  childId: string;
  feeStructureId: string;
  startDate: Date;
  endDate: Date | null;
  status: EnrollmentStatus;
  siblingDiscountApplied: boolean;
  customFeeOverrideCents: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

## Repository Layer (COMPLETE)
- src/database/repositories/child.repository.ts
  - create(dto: CreateChildDto): Promise<Child>
  - findById(id: string): Promise<Child | null>
  - findByTenant(tenantId, filter): Promise<Child[]>
  - findByParent(tenantId, parentId): Promise<Child[]>
  - update(id, dto): Promise<Child>
- src/database/repositories/parent.repository.ts
  - findById(id: string): Promise<Parent | null>
- src/database/repositories/fee-structure.repository.ts
  - findById(id: string): Promise<FeeStructure | null>
- src/database/repositories/enrollment.repository.ts
  - create(dto): Promise<Enrollment>
  - findById(id): Promise<Enrollment | null>
  - findActiveByChild(tenantId, childId): Promise<Enrollment | null>
  - findActiveByParentId(tenantId, parentId): Promise<Enrollment[]>

## Auth Patterns (from TASK-BILL-031/032)
```typescript
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../database/entities/user.entity';
```

## Existing DTOs to Reuse
- src/api/billing/dto/invoice-response.dto.ts has ParentSummaryDto (reuse for parent info)
- src/shared/dto/pagination-meta.dto.ts (reuse for pagination)
</current_codebase_state>

<scope>
  <in_scope>
    - Create ChildController with POST /children (enroll child)
    - Add GET /children (list children for tenant)
    - Add GET /children/:id (child details with enrollment)
    - Add PUT /children/:id (update child/enrollment)
    - Create enrollment DTOs with validation (snake_case API)
    - Support medical notes and emergency contacts
    - Add Swagger/OpenAPI annotations
    - Prevent duplicate enrollments (service handles this)
    - Register ChildController in billing.module.ts
    - Create unit tests (10 minimum, no mock data)
  </in_scope>
  <out_of_scope>
    - Fee structure management (separate module)
    - Parent management (separate module)
    - Attendance tracking (future feature)
    - Child photo uploads (future feature)
    - Enrollment withdrawal endpoint (POST /enrollments/:id/withdraw - future task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/api/billing/child.controller.ts">
      @Controller('children')
      @ApiTags('Children')
      @ApiBearerAuth('JWT-auth')
      @UseGuards(JwtAuthGuard)
      export class ChildController {
        constructor(
          private readonly childRepo: ChildRepository,
          private readonly parentRepo: ParentRepository,
          private readonly feeStructureRepo: FeeStructureRepository,
          private readonly enrollmentRepo: EnrollmentRepository,
          private readonly enrollmentService: EnrollmentService,
        ) {}

        @Post()
        @HttpCode(201)
        @Roles(UserRole.OWNER, UserRole.ADMIN)
        @UseGuards(RolesGuard)
        async enrollChild(@Body() dto: EnrollChildDto, @CurrentUser() user: IUser): Promise<EnrollChildResponseDto>;

        @Get()
        async listChildren(@Query() query: ListChildrenQueryDto, @CurrentUser() user: IUser): Promise<ChildListResponseDto>;

        @Get(':id')
        async getChild(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: IUser): Promise<ChildDetailResponseDto>;

        @Put(':id')
        @Roles(UserRole.OWNER, UserRole.ADMIN)
        @UseGuards(RolesGuard)
        async updateChild(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChildDto, @CurrentUser() user: IUser): Promise<ChildDetailResponseDto>;
      }
    </signature>

    <signature file="src/api/billing/dto/enroll-child.dto.ts">
      export class EnrollChildDto {
        @IsUUID()
        @ApiProperty({ description: 'Parent UUID' })
        parent_id!: string;

        @IsString()
        @MinLength(1)
        @MaxLength(100)
        @ApiProperty()
        first_name!: string;

        @IsString()
        @MinLength(1)
        @MaxLength(100)
        @ApiProperty()
        last_name!: string;

        @IsISO8601({ strict: true })
        @ApiProperty({ example: '2020-05-15', description: 'Date of birth (YYYY-MM-DD)' })
        date_of_birth!: string;

        @IsOptional()
        @IsEnum(Gender)
        @ApiProperty({ enum: Gender, required: false })
        gender?: Gender;

        @IsUUID()
        @ApiProperty({ description: 'Fee structure UUID' })
        fee_structure_id!: string;

        @IsISO8601({ strict: true })
        @ApiProperty({ example: '2025-02-01', description: 'Enrollment start date (YYYY-MM-DD)' })
        start_date!: string;

        @IsOptional()
        @IsString()
        @MaxLength(1000)
        @ApiProperty({ required: false })
        medical_notes?: string;

        @IsOptional()
        @IsString()
        @MaxLength(200)
        @ApiProperty({ required: false })
        emergency_contact?: string;

        @IsOptional()
        @IsString()
        @Matches(/^\+?[1-9]\d{1,14}$/)
        @ApiProperty({ required: false, example: '+27821234567' })
        emergency_phone?: string;
      }

      export class EnrollChildResponseDto {
        @ApiProperty()
        success!: boolean;

        @ApiProperty()
        data!: {
          child: ChildSummaryDto;
          enrollment: EnrollmentSummaryDto;
        };
      }
    </signature>

    <signature file="src/api/billing/dto/child-response.dto.ts">
      export class ChildSummaryDto {
        @ApiProperty() id!: string;
        @ApiProperty() first_name!: string;
        @ApiProperty() last_name!: string;
      }

      export class EnrollmentSummaryDto {
        @ApiProperty() id!: string;
        @ApiProperty() fee_structure!: { id: string; name: string; amount: number };
        @ApiProperty() start_date!: string;
        @ApiProperty({ required: false }) end_date?: string;
        @ApiProperty({ enum: EnrollmentStatus }) status!: EnrollmentStatus;
      }

      export class ChildDetailResponseDto {
        @ApiProperty() success!: boolean;
        @ApiProperty() data!: {
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string;
          gender: Gender | null;
          parent: ParentSummaryDto;
          current_enrollment: EnrollmentSummaryDto | null;
          medical_notes: string | null;
          emergency_contact: string | null;
          emergency_phone: string | null;
          created_at: Date;
        };
      }

      export class ChildListResponseDto {
        @ApiProperty() success!: boolean;
        @ApiProperty({ type: [Object] }) data!: Array<{
          id: string;
          first_name: string;
          last_name: string;
          date_of_birth: string;
          parent: ParentSummaryDto;
          enrollment_status: EnrollmentStatus | null;
        }>;
        @ApiProperty({ type: PaginationMetaDto }) meta!: PaginationMetaDto;
      }
    </signature>

    <signature file="src/api/billing/dto/list-children.dto.ts">
      export class ListChildrenQueryDto {
        @IsOptional()
        @IsInt()
        @Min(1)
        @Type(() => Number)
        @ApiProperty({ required: false, default: 1 })
        page?: number = 1;

        @IsOptional()
        @IsInt()
        @Min(1)
        @Max(100)
        @Type(() => Number)
        @ApiProperty({ required: false, default: 20 })
        limit?: number = 20;

        @IsOptional()
        @IsUUID()
        @ApiProperty({ required: false, description: 'Filter by parent ID' })
        parent_id?: string;

        @IsOptional()
        @IsEnum(EnrollmentStatus)
        @ApiProperty({ required: false, enum: EnrollmentStatus })
        enrollment_status?: EnrollmentStatus;

        @IsOptional()
        @IsString()
        @ApiProperty({ required: false, description: 'Search by name' })
        search?: string;
      }
    </signature>

    <signature file="src/api/billing/dto/update-child.dto.ts">
      export class UpdateChildDto {
        @IsOptional()
        @IsString()
        @MinLength(1)
        @MaxLength(100)
        first_name?: string;

        @IsOptional()
        @IsString()
        @MinLength(1)
        @MaxLength(100)
        last_name?: string;

        @IsOptional()
        @IsEnum(Gender)
        gender?: Gender;

        @IsOptional()
        @IsString()
        @MaxLength(1000)
        medical_notes?: string;

        @IsOptional()
        @IsString()
        @MaxLength(200)
        emergency_contact?: string;

        @IsOptional()
        @IsString()
        @Matches(/^\+?[1-9]\d{1,14}$/)
        emergency_phone?: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Only OWNER and ADMIN roles can POST/PUT children
    - All roles can GET children (with tenant isolation)
    - Must validate parent_id exists and belongs to tenant
    - Must validate fee_structure_id exists and belongs to tenant
    - date_of_birth must be in the past
    - start_date can be today or future (within 3 months)
    - Service throws ConflictException for duplicate enrollments
    - Phone numbers must be E.164 format
    - All DTOs must use snake_case for API, convert to camelCase for service
    - All DTOs must have Swagger documentation
  </constraints>

  <validation_criteria>
    - POST /children enrolls child successfully
    - Validates parent_id exists
    - Validates fee_structure_id exists
    - Prevents duplicate enrollments (service throws ConflictException)
    - date_of_birth validation works (must be past)
    - start_date validation works (not > 3 months future)
    - Phone number format validation works
    - GET /children lists children with pagination
    - GET /children/:id returns child details with enrollment
    - PUT /children/:id updates child successfully
    - Only OWNER/ADMIN can POST/PUT (403 for others)
    - Minimum 10 unit tests, all using jest.spyOn()
    - npm run test passes
    - npm run build passes
    - npm run lint passes
  </validation_criteria>
</definition_of_done>

<implementation_pattern>
Follow EXACTLY this pattern from invoice.controller.ts:

```typescript
// src/api/billing/child.controller.ts

import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Body,
  Param,
  Logger,
  HttpCode,
  UseGuards,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ChildRepository } from '../../database/repositories/child.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { Gender } from '../../database/entities/child.entity';
import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
import {
  EnrollChildDto,
  EnrollChildResponseDto,
  ListChildrenQueryDto,
  ChildListResponseDto,
  ChildDetailResponseDto,
  UpdateChildDto,
} from './dto';

@Controller('children')
@ApiTags('Children')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
export class ChildController {
  private readonly logger = new Logger(ChildController.name);

  constructor(
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly enrollmentService: EnrollmentService,
  ) {}

  @Post()
  @HttpCode(201)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @UseGuards(RolesGuard)
  @ApiOperation({ summary: 'Enroll a new child' })
  @ApiResponse({ status: 201, type: EnrollChildResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Child already has active enrollment' })
  @ApiForbiddenResponse({ description: 'Insufficient permissions' })
  async enrollChild(
    @Body() dto: EnrollChildDto,
    @CurrentUser() user: IUser,
  ): Promise<EnrollChildResponseDto> {
    const tenantId = user.tenantId;

    this.logger.log(`Enrolling child: tenant=${tenantId}, parent=${dto.parent_id}`);

    // Validate parent exists and belongs to tenant
    const parent = await this.parentRepo.findById(dto.parent_id);
    if (!parent || parent.tenantId !== tenantId) {
      this.logger.error(`Parent not found: ${dto.parent_id} for tenant ${tenantId}`);
      throw new BadRequestException('Invalid parent_id');
    }

    // Validate fee structure exists and belongs to tenant
    const feeStructure = await this.feeStructureRepo.findById(dto.fee_structure_id);
    if (!feeStructure || feeStructure.tenantId !== tenantId) {
      this.logger.error(`Fee structure not found: ${dto.fee_structure_id} for tenant ${tenantId}`);
      throw new BadRequestException('Invalid fee_structure_id');
    }

    // Validate date_of_birth is in the past
    const dateOfBirth = new Date(dto.date_of_birth);
    if (dateOfBirth >= new Date()) {
      throw new BadRequestException('date_of_birth must be in the past');
    }

    // Validate start_date is not more than 3 months in future
    const startDate = new Date(dto.start_date);
    const threeMonthsFuture = new Date();
    threeMonthsFuture.setMonth(threeMonthsFuture.getMonth() + 3);
    if (startDate > threeMonthsFuture) {
      throw new BadRequestException('start_date cannot be more than 3 months in the future');
    }

    // Create child first
    const child = await this.childRepo.create({
      tenantId,
      parentId: dto.parent_id,
      firstName: dto.first_name,
      lastName: dto.last_name,
      dateOfBirth,
      gender: dto.gender ?? null,
      medicalNotes: dto.medical_notes ?? null,
      emergencyContact: dto.emergency_contact ?? null,
      emergencyPhone: dto.emergency_phone ?? null,
    });

    // Then create enrollment (service validates no duplicate)
    const enrollment = await this.enrollmentService.enrollChild(
      tenantId,
      child.id,
      dto.fee_structure_id,
      startDate,
      user.id,
    );

    this.logger.log(`Child enrolled: child=${child.id}, enrollment=${enrollment.id}`);

    return {
      success: true,
      data: {
        child: {
          id: child.id,
          first_name: child.firstName,
          last_name: child.lastName,
        },
        enrollment: {
          id: enrollment.id,
          fee_structure: {
            id: feeStructure.id,
            name: feeStructure.name,
            amount: Number(feeStructure.monthlyFeeCents) / 100,
          },
          start_date: enrollment.startDate.toISOString().split('T')[0],
          status: enrollment.status,
        },
      },
    };
  }

  // ... implement listChildren, getChild, updateChild following same pattern
}
```
</implementation_pattern>

<test_pattern>
Follow EXACTLY this pattern from invoice.controller.spec.ts:

```typescript
// tests/api/billing/child.controller.spec.ts

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ChildController } from '../../../src/api/billing/child.controller';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import { Gender } from '../../../src/database/entities/child.entity';
import { EnrollmentStatus } from '../../../src/database/entities/enrollment.entity';

describe('ChildController', () => {
  let controller: ChildController;
  let childRepo: ChildRepository;
  let parentRepo: ParentRepository;
  let feeStructureRepo: FeeStructureRepository;
  let enrollmentService: EnrollmentService;

  const mockTenantId = 'tenant-123';
  const mockUserId = 'user-456';

  const mockOwnerUser: IUser = {
    id: mockUserId,
    tenantId: mockTenantId,
    auth0Id: 'auth0|owner123',
    email: 'owner@school.com',
    role: UserRole.OWNER,
    name: 'School Owner',
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockParent = {
    id: 'parent-001',
    tenantId: mockTenantId,
    firstName: 'John',
    lastName: 'Smith',
    email: 'john@example.com',
    // ... other fields
  };

  const mockFeeStructure = {
    id: 'fee-001',
    tenantId: mockTenantId,
    name: 'Full Day',
    monthlyFeeCents: 300000, // R3000
    // ... other fields
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChildController],
      providers: [
        {
          provide: ChildRepository,
          useValue: { create: jest.fn(), findById: jest.fn(), findByTenant: jest.fn(), update: jest.fn() },
        },
        {
          provide: ParentRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: FeeStructureRepository,
          useValue: { findById: jest.fn() },
        },
        {
          provide: EnrollmentRepository,
          useValue: { findActiveByChild: jest.fn() },
        },
        {
          provide: EnrollmentService,
          useValue: { enrollChild: jest.fn(), getActiveEnrollments: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<ChildController>(ChildController);
    childRepo = module.get<ChildRepository>(ChildRepository);
    parentRepo = module.get<ParentRepository>(ParentRepository);
    feeStructureRepo = module.get<FeeStructureRepository>(FeeStructureRepository);
    enrollmentService = module.get<EnrollmentService>(EnrollmentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /children (enrollChild)', () => {
    it('should enroll a child successfully', async () => {
      // Arrange
      const dto = {
        parent_id: 'parent-001',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
      };

      const mockChild = { id: 'child-001', firstName: 'Emma', lastName: 'Smith', tenantId: mockTenantId };
      const mockEnrollment = {
        id: 'enroll-001',
        childId: 'child-001',
        feeStructureId: 'fee-001',
        startDate: new Date('2025-02-01'),
        status: EnrollmentStatus.ACTIVE,
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(mockParent);
      jest.spyOn(feeStructureRepo, 'findById').mockResolvedValue(mockFeeStructure);
      jest.spyOn(childRepo, 'create').mockResolvedValue(mockChild);
      jest.spyOn(enrollmentService, 'enrollChild').mockResolvedValue(mockEnrollment);

      // Act
      const result = await controller.enrollChild(dto, mockOwnerUser);

      // Assert
      expect(result.success).toBe(true);
      expect(result.data.child.first_name).toBe('Emma');
      expect(result.data.enrollment.status).toBe(EnrollmentStatus.ACTIVE);
    });

    it('should reject invalid parent_id', async () => {
      // Arrange
      const dto = {
        parent_id: 'invalid-parent',
        first_name: 'Emma',
        last_name: 'Smith',
        date_of_birth: '2020-05-15',
        fee_structure_id: 'fee-001',
        start_date: '2025-02-01',
      };

      jest.spyOn(parentRepo, 'findById').mockResolvedValue(null);

      // Act & Assert
      await expect(controller.enrollChild(dto, mockOwnerUser)).rejects.toThrow(BadRequestException);
      await expect(controller.enrollChild(dto, mockOwnerUser)).rejects.toThrow('Invalid parent_id');
    });

    // ... more tests following this pattern (minimum 10 total)
  });
});
```

CRITICAL: NO MOCK DATA. Use jest.spyOn() to verify repository/service calls with real behavior.
</test_pattern>

<files_to_create>
  <file path="src/api/billing/child.controller.ts">Child enrollment controller</file>
  <file path="src/api/billing/dto/enroll-child.dto.ts">Enrollment request/response DTOs</file>
  <file path="src/api/billing/dto/child-response.dto.ts">Child response DTOs</file>
  <file path="src/api/billing/dto/update-child.dto.ts">Update child DTO</file>
  <file path="src/api/billing/dto/list-children.dto.ts">List children query DTO</file>
  <file path="tests/api/billing/child.controller.spec.ts">Child controller unit tests (10 minimum)</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/billing/billing.module.ts">Add ChildController and dependencies</file>
  <file path="src/api/billing/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<billing_module_update>
Update billing.module.ts to add ChildController:

```typescript
import { ChildController } from './child.controller';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController, ChildController],
  providers: [
    // ... existing providers
    // Note: Most repositories already added for InvoiceController
  ],
})
export class BillingModule {}
```
</billing_module_update>

<test_commands>
  <command>npm run test -- tests/api/billing/child.controller.spec.ts</command>
  <command>npm run test -- tests/api/billing/</command>
  <command>npm run build</command>
  <command>npm run lint -- src/api/billing tests/api/billing</command>
</test_commands>

<success_criteria>
1. POST /children enrolls child with enrollment successfully
2. Validates parent_id and fee_structure_id exist
3. Validates date_of_birth is in past
4. Validates start_date is not > 3 months future
5. GET /children lists children with pagination
6. GET /children/:id returns child with enrollment details
7. PUT /children/:id updates child successfully
8. Role guards enforce OWNER/ADMIN for POST/PUT
9. All 10+ tests pass using jest.spyOn() (NO MOCK DATA)
10. npm run build passes
11. npm run lint passes
</success_criteria>

</task_spec>

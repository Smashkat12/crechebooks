<task_spec id="TASK-BILL-011" version="1.0">

<metadata>
  <title>Enrollment Management Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>20</sequence>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the EnrollmentService which manages the lifecycle of child
enrollments including enrollment creation, updates, withdrawals, and sibling
discount calculations. The service handles enrollment status transitions and
ensures proper business rules are applied when children start or end their
enrollment at the creche. Sibling discounts are automatically calculated and
applied when multiple children from the same parent are enrolled.
</context>

<input_context_files>
  <file purpose="requirements">specs/requirements/billing.md#REQ-BILL-009</file>
  <file purpose="data_model">specs/technical/data-models.md#Enrollment</file>
  <file purpose="api_contract">specs/technical/api-contracts.md#BillingService</file>
  <file purpose="entity_reference">src/database/entities/enrollment.entity.ts</file>
  <file purpose="repository_reference">src/database/repositories/enrollment.repository.ts</file>
  <file purpose="parent_entity">src/database/entities/parent.entity.ts</file>
  <file purpose="child_entity">src/database/entities/child.entity.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-002 completed (Enrollment entity exists)</check>
  <check>Parent and Child entities exist</check>
  <check>FeeStructure entity exists</check>
  <check>EnrollmentRepository available</check>
  <check>Prisma client configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create EnrollmentService in src/core/billing/
    - Implement enrollChild method with validation
    - Implement updateEnrollment method
    - Implement withdrawChild method with status update
    - Implement getActiveEnrollments query method
    - Implement applySiblingDiscount calculation logic
    - Add EnrollmentModule with dependency injection
    - Business rule validations (dates, status transitions)
    - Unit tests for all methods
  </in_scope>
  <out_of_scope>
    - Enrollment API endpoints (API layer task)
    - Invoice generation triggered by enrollment
    - Fee structure management
    - Parent/child management
    - Email notifications
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/billing/enrollment.service.ts">
      import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
      import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
      import { ChildRepository } from '../../database/repositories/child.repository';
      import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
      import { EnrollmentStatus } from '../../database/entities/enrollment.entity';
      import { Decimal } from 'decimal.js';

      @Injectable()
      export class EnrollmentService {
        constructor(
          private readonly enrollmentRepo: EnrollmentRepository,
          private readonly childRepo: ChildRepository,
          private readonly feeStructureRepo: FeeStructureRepository,
        ) {}

        /**
         * Enroll a child with fee structure
         * @throws NotFoundException if child or fee structure not found
         * @throws ConflictException if child already has active enrollment
         */
        async enrollChild(
          tenantId: string,
          childId: string,
          feeStructureId: string,
          startDate: Date,
        ): Promise&lt;Enrollment&gt;;

        /**
         * Update enrollment details (fee structure, end date)
         * @throws NotFoundException if enrollment not found
         */
        async updateEnrollment(
          tenantId: string,
          enrollmentId: string,
          updates: {
            feeStructureId?: string;
            endDate?: Date;
            status?: EnrollmentStatus;
          },
        ): Promise&lt;Enrollment&gt;;

        /**
         * Withdraw a child by setting end date and status to WITHDRAWN
         * @throws NotFoundException if enrollment not found
         * @throws ConflictException if already withdrawn
         */
        async withdrawChild(
          tenantId: string,
          enrollmentId: string,
          endDate: Date,
        ): Promise&lt;Enrollment&gt;;

        /**
         * Get all active enrollments (optionally filtered by parent)
         */
        async getActiveEnrollments(
          tenantId: string,
          parentId?: string,
        ): Promise&lt;Enrollment[]&gt;;

        /**
         * Calculate sibling discount for a parent's enrollments
         * Returns discount percentage as Decimal (0-100)
         * Rules:
         * - 2 children: 10% discount on second child
         * - 3+ children: 15% discount on second child, 20% on third+
         */
        async applySiblingDiscount(
          tenantId: string,
          parentId: string,
        ): Promise&lt;Map&lt;string, Decimal&gt;&gt;;  // childId -> discount percentage
      }
    </signature>

    <signature file="src/core/billing/billing.module.ts">
      import { Module } from '@nestjs/common';
      import { DatabaseModule } from '../../database/database.module';
      import { EnrollmentService } from './enrollment.service';

      @Module({
        imports: [DatabaseModule],
        providers: [EnrollmentService],
        exports: [EnrollmentService],
      })
      export class BillingModule {}
    </signature>

    <signature file="src/core/billing/dto/enroll-child.dto.ts">
      import { IsUUID, IsDate, IsOptional } from 'class-validator';

      export class EnrollChildDto {
        @IsUUID()
        childId: string;

        @IsUUID()
        feeStructureId: string;

        @IsDate()
        startDate: Date;

        @IsOptional()
        @IsDate()
        endDate?: Date;
      }
    </signature>

    <signature file="src/core/billing/dto/update-enrollment.dto.ts">
      import { IsUUID, IsDate, IsEnum, IsOptional } from 'class-validator';
      import { EnrollmentStatus } from '../../../database/entities/enrollment.entity';

      export class UpdateEnrollmentDto {
        @IsOptional()
        @IsUUID()
        feeStructureId?: string;

        @IsOptional()
        @IsDate()
        endDate?: Date;

        @IsOptional()
        @IsEnum(EnrollmentStatus)
        status?: EnrollmentStatus;
      }
    </signature>
  </signatures>

  <constraints>
    - Must validate child exists before enrollment
    - Must validate fee structure exists before enrollment
    - Must prevent duplicate active enrollments for same child
    - Must validate startDate is not in the past (allow current date)
    - Must validate endDate is after startDate if provided
    - Must use Decimal.js for discount calculations
    - Must NOT use 'any' type anywhere
    - Must handle timezone considerations for dates
    - Sibling discount calculated based on enrollment count, not children count
    - Status transitions must be valid (ACTIVE -> WITHDRAWN, ACTIVE -> SUSPENDED)
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - All unit tests pass (npm run test -- enrollment.service.spec.ts)
    - Service can be injected in other modules
    - enrollChild creates enrollment successfully
    - enrollChild throws ConflictException for duplicate
    - withdrawChild updates status correctly
    - applySiblingDiscount calculates correct percentages
    - getActiveEnrollments filters correctly by parent
  </verification>
</definition_of_done>

<pseudo_code>
EnrollmentService (src/core/billing/enrollment.service.ts):

  async enrollChild(tenantId, childId, feeStructureId, startDate):
    // Validate child exists and belongs to tenant
    child = await childRepo.findById(tenantId, childId)
    if (!child) throw NotFoundException('Child not found')

    // Validate fee structure exists
    feeStructure = await feeStructureRepo.findById(tenantId, feeStructureId)
    if (!feeStructure) throw NotFoundException('Fee structure not found')

    // Check for existing active enrollment
    activeEnrollment = await enrollmentRepo.findActiveByChildId(tenantId, childId)
    if (activeEnrollment) throw ConflictException('Child already has active enrollment')

    // Validate start date not in past
    today = new Date()
    today.setHours(0, 0, 0, 0)
    if (startDate < today) throw ValidationError('Start date cannot be in the past')

    // Create enrollment
    enrollmentDto = {
      childId: childId,
      feeStructureId: feeStructureId,
      startDate: startDate,
      status: EnrollmentStatus.ACTIVE
    }

    enrollment = await enrollmentRepo.create(tenantId, enrollmentDto)
    return enrollment

  async updateEnrollment(tenantId, enrollmentId, updates):
    // Fetch existing enrollment
    enrollment = await enrollmentRepo.findById(tenantId, enrollmentId)
    if (!enrollment) throw NotFoundException('Enrollment not found')

    // Validate fee structure if updating
    if (updates.feeStructureId) {
      feeStructure = await feeStructureRepo.findById(tenantId, updates.feeStructureId)
      if (!feeStructure) throw NotFoundException('Fee structure not found')
    }

    // Validate end date if provided
    if (updates.endDate) {
      if (updates.endDate <= enrollment.startDate) {
        throw ValidationError('End date must be after start date')
      }
    }

    // Update enrollment
    updated = await enrollmentRepo.update(tenantId, enrollmentId, updates)
    return updated

  async withdrawChild(tenantId, enrollmentId, endDate):
    // Fetch enrollment
    enrollment = await enrollmentRepo.findById(tenantId, enrollmentId)
    if (!enrollment) throw NotFoundException('Enrollment not found')

    // Check if already withdrawn
    if (enrollment.status === EnrollmentStatus.WITHDRAWN) {
      throw ConflictException('Enrollment already withdrawn')
    }

    // Validate end date
    if (endDate <= enrollment.startDate) {
      throw ValidationError('End date must be after start date')
    }

    // Update with withdrawn status
    updates = {
      endDate: endDate,
      status: EnrollmentStatus.WITHDRAWN
    }

    updated = await enrollmentRepo.update(tenantId, enrollmentId, updates)
    return updated

  async getActiveEnrollments(tenantId, parentId?):
    if (parentId) {
      // Get enrollments for specific parent's children
      enrollments = await enrollmentRepo.findActiveByParentId(tenantId, parentId)
    } else {
      // Get all active enrollments for tenant
      enrollments = await enrollmentRepo.findByStatus(tenantId, EnrollmentStatus.ACTIVE)
    }
    return enrollments

  async applySiblingDiscount(tenantId, parentId):
    // Get all active enrollments for parent's children
    enrollments = await this.getActiveEnrollments(tenantId, parentId)

    // Count active siblings
    siblingCount = enrollments.length

    // Map to store discount per child
    discountMap = new Map&lt;string, Decimal&gt;()

    if (siblingCount < 2) {
      // No discount for single child
      return discountMap
    }

    // Sort enrollments by start date (oldest first)
    enrollments.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

    // Apply discount rules
    for (index, enrollment) in enrollments:
      childId = enrollment.childId

      if (index === 0) {
        // First child gets no discount
        discountMap.set(childId, new Decimal(0))
      } else if (siblingCount === 2) {
        // Second child gets 10% discount
        discountMap.set(childId, new Decimal(10))
      } else {
        // 3+ children
        if (index === 1) {
          // Second child gets 15% discount
          discountMap.set(childId, new Decimal(15))
        } else {
          // Third+ children get 20% discount
          discountMap.set(childId, new Decimal(20))
        }
      }

    return discountMap

BillingModule (src/core/billing/billing.module.ts):
  @Module({
    imports: [DatabaseModule],
    providers: [EnrollmentService],
    exports: [EnrollmentService]
  })
  export class BillingModule {}

DTOs (src/core/billing/dto/):
  EnrollChildDto:
    childId: UUID (required)
    feeStructureId: UUID (required)
    startDate: Date (required)
    endDate: Date (optional)

  UpdateEnrollmentDto:
    feeStructureId: UUID (optional)
    endDate: Date (optional)
    status: EnrollmentStatus enum (optional)
</pseudo_code>

<files_to_create>
  <file path="src/core/billing/enrollment.service.ts">EnrollmentService with all methods</file>
  <file path="src/core/billing/billing.module.ts">BillingModule for dependency injection</file>
  <file path="src/core/billing/dto/enroll-child.dto.ts">DTO for enrollChild operation</file>
  <file path="src/core/billing/dto/update-enrollment.dto.ts">DTO for updateEnrollment operation</file>
  <file path="src/core/billing/dto/withdraw-child.dto.ts">DTO for withdrawChild operation</file>
  <file path="tests/core/billing/enrollment.service.spec.ts">Unit tests for EnrollmentService</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/core.module.ts">Import and register BillingModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>EnrollmentService compiles without TypeScript errors</criterion>
  <criterion>All methods have correct signatures matching spec</criterion>
  <criterion>enrollChild validates child and fee structure existence</criterion>
  <criterion>enrollChild prevents duplicate active enrollments</criterion>
  <criterion>withdrawChild sets correct status and end date</criterion>
  <criterion>withdrawChild prevents double withdrawal</criterion>
  <criterion>applySiblingDiscount calculates correct percentages for 2, 3+ children</criterion>
  <criterion>applySiblingDiscount returns Map with childId keys</criterion>
  <criterion>getActiveEnrollments filters by parent when provided</criterion>
  <criterion>Date validations work correctly (start before end, not in past)</criterion>
  <criterion>All unit tests pass with >80% coverage</criterion>
  <criterion>Decimal.js used for all discount calculations</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- enrollment.service.spec.ts</command>
  <command>npm run test:cov -- enrollment.service.spec.ts</command>
</test_commands>

</task_spec>

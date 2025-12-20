<task_spec id="TASK-BILL-011" version="2.0">

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

<project_context>
## CRITICAL: Read This First

**Tech Stack**: NestJS 11, Prisma 7, PostgreSQL 16, TypeScript
**Current State**: 757 tests passing, 19/62 tasks complete (30.6%)
**Foundation Complete**: All entities, repositories, and migrations exist

### File Structure (ACTUAL - Use These Paths!)
```
src/database/
├── services/           # <-- SERVICE GOES HERE
│   ├── audit-log.service.ts
│   ├── transaction-import.service.ts
│   ├── categorization.service.ts
│   ├── pattern-learning.service.ts
│   ├── xero-sync.service.ts
│   └── index.ts
├── dto/               # <-- DTOs GO HERE
│   ├── enrollment.dto.ts (already exists - repository DTOs)
│   └── enrollment-service.dto.ts (create this - service DTOs)
├── repositories/      # <-- ALREADY EXISTS
│   ├── enrollment.repository.ts (8 methods, needs 2 more)
│   ├── child.repository.ts
│   └── fee-structure.repository.ts
├── entities/
│   └── enrollment.entity.ts (EnrollmentStatus enum, IEnrollment interface)
└── database.module.ts # <-- REGISTER SERVICE HERE
```

**DO NOT CREATE**: `src/core/` directory does NOT exist and should NOT be created.

### Key Project Rules (from constitution.md)
1. **Fail-Fast**: No workarounds, no fallbacks. Errors throw immediately with full context
2. **No Mock Data in Tests**: Use REAL PostgreSQL database with actual data
3. **Money as Cents**: All monetary values stored as integers (cents)
4. **Decimal.js**: Use for financial calculations (banker's rounding)
5. **Multi-Tenant Isolation**: ALL queries MUST filter by tenantId
6. **AuditLogService.logAction()**: Required for audit trail on mutations
7. **No `any` Type**: ESLint enforces strict typing
</project_context>

<context>
This task creates the EnrollmentService which manages the lifecycle of child
enrollments including enrollment creation, updates, withdrawals, and sibling
discount calculations. The service handles enrollment status transitions and
ensures proper business rules are applied when children start or end their
enrollment at the creche.

**Important**: The EnrollmentRepository (8 methods) and related repositories
already exist. This service adds BUSINESS LOGIC on top of the existing
data access layer.
</context>

<input_context_files>
  <file purpose="requirements">specs/requirements/billing.md#REQ-BILL-009</file>
  <file purpose="entity">src/database/entities/enrollment.entity.ts</file>
  <file purpose="repository">src/database/repositories/enrollment.repository.ts</file>
  <file purpose="child_repository">src/database/repositories/child.repository.ts</file>
  <file purpose="fee_structure_repository">src/database/repositories/fee-structure.repository.ts</file>
  <file purpose="parent_repository">src/database/repositories/parent.repository.ts</file>
  <file purpose="dto_existing">src/database/dto/enrollment.dto.ts</file>
  <file purpose="audit_service">src/database/services/audit-log.service.ts</file>
  <file purpose="database_module">src/database/database.module.ts</file>
</input_context_files>

<existing_code_reference>
### EnrollmentRepository Methods (Already Exist)
```typescript
// src/database/repositories/enrollment.repository.ts (372 lines)
class EnrollmentRepository {
  async create(dto: CreateEnrollmentDto): Promise<Enrollment>
  async findById(id: string): Promise<Enrollment | null>
  async findByTenant(tenantId: string, filter: EnrollmentFilterDto): Promise<Enrollment[]>
  async findByChild(tenantId: string, childId: string): Promise<Enrollment[]>
  async findActiveByChild(tenantId: string, childId: string): Promise<Enrollment | null>
  async findByStatus(tenantId: string, status: EnrollmentStatus): Promise<Enrollment[]>
  async update(id: string, dto: UpdateEnrollmentDto): Promise<Enrollment>
  async delete(id: string): Promise<void>
  async withdraw(id: string): Promise<Enrollment>  // Sets status=WITHDRAWN, endDate=now
}
```

### EnrollmentStatus Enum
```typescript
// src/database/entities/enrollment.entity.ts
export enum EnrollmentStatus {
  ACTIVE = 'ACTIVE',
  PENDING = 'PENDING',
  WITHDRAWN = 'WITHDRAWN',
  GRADUATED = 'GRADUATED',
}
```

### ChildRepository Methods (Already Exist)
```typescript
// src/database/repositories/child.repository.ts
class ChildRepository {
  async findById(id: string): Promise<Child | null>
  async findByParent(tenantId: string, parentId: string): Promise<Child[]>
  // ... other methods
}
```
</existing_code_reference>

<prerequisites>
  <check>TASK-BILL-002 completed - Enrollment entity and repository exist</check>
  <check>EnrollmentRepository has 8 methods (create, findById, findByTenant, findByChild, findActiveByChild, findByStatus, update, delete, withdraw)</check>
  <check>ChildRepository has findByParent method</check>
  <check>FeeStructureRepository has findById method</check>
  <check>AuditLogService available for audit trail</check>
  <check>Prisma client configured with all migrations applied</check>
</prerequisites>

<scope>
  <in_scope>
    - Create EnrollmentService in src/database/services/enrollment.service.ts
    - Create service DTOs in src/database/dto/enrollment-service.dto.ts
    - Add 2 new repository methods: findByParentId, findActiveByParentId
    - Implement enrollChild method with validation
    - Implement updateEnrollment method
    - Implement withdrawChild method with status update
    - Implement getActiveEnrollments query method
    - Implement applySiblingDiscount calculation logic
    - Register service in DatabaseModule
    - Audit logging for all mutations
    - Unit tests using REAL database (no mocks)
  </in_scope>
  <out_of_scope>
    - Enrollment API endpoints (TASK-BILL-034)
    - Invoice generation triggered by enrollment (TASK-BILL-012)
    - Fee structure management
    - Parent/child management
    - Email notifications
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/database/services/enrollment.service.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { EnrollmentRepository } from '../repositories/enrollment.repository';
      import { ChildRepository } from '../repositories/child.repository';
      import { FeeStructureRepository } from '../repositories/fee-structure.repository';
      import { AuditLogService } from './audit-log.service';
      import { EnrollmentStatus, IEnrollment } from '../entities/enrollment.entity';
      import { Decimal } from 'decimal.js';
      import { NotFoundException, ConflictException, ValidationException } from '../../shared/exceptions';

      @Injectable()
      export class EnrollmentService {
        private readonly logger = new Logger(EnrollmentService.name);

        constructor(
          private readonly enrollmentRepo: EnrollmentRepository,
          private readonly childRepo: ChildRepository,
          private readonly feeStructureRepo: FeeStructureRepository,
          private readonly auditLogService: AuditLogService,
        ) {}

        /**
         * Enroll a child with fee structure
         * @throws NotFoundException if child or fee structure not found
         * @throws ConflictException if child already has active enrollment
         * @throws ValidationException if startDate is in the past
         */
        async enrollChild(
          tenantId: string,
          childId: string,
          feeStructureId: string,
          startDate: Date,
          userId: string,
        ): Promise&lt;IEnrollment&gt;;

        /**
         * Update enrollment details (fee structure, end date)
         * @throws NotFoundException if enrollment not found
         * @throws ValidationException if endDate is before startDate
         */
        async updateEnrollment(
          tenantId: string,
          enrollmentId: string,
          updates: {
            feeStructureId?: string;
            endDate?: Date;
            customFeeOverrideCents?: number;
          },
          userId: string,
        ): Promise&lt;IEnrollment&gt;;

        /**
         * Withdraw a child by setting end date and status to WITHDRAWN
         * @throws NotFoundException if enrollment not found
         * @throws ConflictException if already withdrawn
         * @throws ValidationException if endDate is before startDate
         */
        async withdrawChild(
          tenantId: string,
          enrollmentId: string,
          endDate: Date,
          userId: string,
        ): Promise&lt;IEnrollment&gt;;

        /**
         * Get all active enrollments (optionally filtered by parent)
         */
        async getActiveEnrollments(
          tenantId: string,
          parentId?: string,
        ): Promise&lt;IEnrollment[]&gt;;

        /**
         * Calculate sibling discount for a parent's enrollments
         * Returns discount percentage as Decimal (0-100)
         * Rules:
         * - 1 child: 0% discount
         * - 2 children: 10% discount on second child
         * - 3+ children: 15% discount on second, 20% on third+
         * @returns Map of childId -> discount percentage
         */
        async applySiblingDiscount(
          tenantId: string,
          parentId: string,
        ): Promise&lt;Map&lt;string, Decimal&gt;&gt;;
      }
    </signature>

    <signature file="src/database/dto/enrollment-service.dto.ts">
      import { IsUUID, IsDate, IsOptional, IsInt, Min } from 'class-validator';

      export class EnrollChildDto {
        @IsUUID()
        tenantId: string;

        @IsUUID()
        childId: string;

        @IsUUID()
        feeStructureId: string;

        @IsDate()
        startDate: Date;
      }

      export class UpdateEnrollmentServiceDto {
        @IsOptional()
        @IsUUID()
        feeStructureId?: string;

        @IsOptional()
        @IsDate()
        endDate?: Date;

        @IsOptional()
        @IsInt()
        @Min(0)
        customFeeOverrideCents?: number;
      }

      export class WithdrawChildDto {
        @IsUUID()
        tenantId: string;

        @IsUUID()
        enrollmentId: string;

        @IsDate()
        endDate: Date;
      }

      export interface SiblingDiscountResult {
        childId: string;
        discountPercent: number;
        enrollmentId: string;
      }
    </signature>

    <signature file="src/database/repositories/enrollment.repository.ts" action="ADD_METHODS">
      // ADD these 2 methods to existing EnrollmentRepository

      /**
       * Find all enrollments for a parent's children
       * Requires joining Child table via childId -> parentId
       */
      async findByParentId(tenantId: string, parentId: string): Promise&lt;Enrollment[]&gt;;

      /**
       * Find all ACTIVE enrollments for a parent's children
       */
      async findActiveByParentId(tenantId: string, parentId: string): Promise&lt;Enrollment[]&gt;;
    </signature>
  </signatures>

  <constraints>
    - Must validate child exists (via ChildRepository.findById) before enrollment
    - Must validate fee structure exists (via FeeStructureRepository.findById) before enrollment
    - Must prevent duplicate active enrollments for same child (check findActiveByChild)
    - Must validate startDate is not in the past (allow current date)
    - Must validate endDate is after startDate if provided
    - Must use Decimal.js for discount calculations
    - Must NOT use 'any' type anywhere
    - Must log all mutations via AuditLogService.logAction()
    - Sibling discount calculated based on ACTIVE enrollment count, not children count
    - Status transitions: ACTIVE -> WITHDRAWN, ACTIVE -> GRADUATED only
    - Tests must use REAL PostgreSQL database (no mocks)
  </constraints>

  <verification>
    - TypeScript compiles without errors: `pnpm build`
    - Lint passes: `pnpm lint` (0 errors, 0 warnings)
    - All tests pass: `pnpm test -- --runInBand enrollment.service.spec.ts`
    - Service injectable in DatabaseModule
    - enrollChild creates enrollment successfully
    - enrollChild throws ConflictException for duplicate active enrollment
    - enrollChild throws NotFoundException for invalid child/feeStructure
    - withdrawChild updates status correctly
    - withdrawChild throws ConflictException if already withdrawn
    - applySiblingDiscount calculates: 0% for 1, 10% for 2nd, 15%+20% for 3+
    - getActiveEnrollments filters correctly by parent
    - Date validations work (start before end, not in past)
  </verification>
</definition_of_done>

<pseudo_code>
## 1. Add Repository Methods (enrollment.repository.ts)

findByParentId(tenantId, parentId):
  // Get all children for parent first
  children = await childRepo.findByParent(tenantId, parentId)
  childIds = children.map(c => c.id)

  // Find enrollments for those children
  return prisma.enrollment.findMany({
    where: { tenantId, childId: { in: childIds } },
    orderBy: { startDate: 'asc' }
  })

findActiveByParentId(tenantId, parentId):
  children = await childRepo.findByParent(tenantId, parentId)
  childIds = children.map(c => c.id)

  return prisma.enrollment.findMany({
    where: { tenantId, childId: { in: childIds }, status: 'ACTIVE' },
    orderBy: { startDate: 'asc' }
  })


## 2. EnrollmentService Implementation

enrollChild(tenantId, childId, feeStructureId, startDate, userId):
  // 1. Validate child exists
  child = await childRepo.findById(childId)
  if (!child || child.tenantId !== tenantId) {
    throw new NotFoundException('Child', childId)
  }

  // 2. Validate fee structure exists
  feeStructure = await feeStructureRepo.findById(feeStructureId)
  if (!feeStructure || feeStructure.tenantId !== tenantId) {
    throw new NotFoundException('FeeStructure', feeStructureId)
  }

  // 3. Check no active enrollment exists
  existing = await enrollmentRepo.findActiveByChild(tenantId, childId)
  if (existing) {
    throw new ConflictException('Child already has active enrollment')
  }

  // 4. Validate start date not in past
  today = new Date()
  today.setHours(0, 0, 0, 0)
  startDateNormalized = new Date(startDate)
  startDateNormalized.setHours(0, 0, 0, 0)
  if (startDateNormalized < today) {
    throw new ValidationException('startDate', 'Start date cannot be in the past')
  }

  // 5. Create enrollment via repository
  enrollment = await enrollmentRepo.create({
    tenantId,
    childId,
    feeStructureId,
    startDate,
    status: EnrollmentStatus.ACTIVE
  })

  // 6. Audit log
  await auditLogService.logAction({
    tenantId,
    userId,
    action: 'CREATE',
    entityType: 'Enrollment',
    entityId: enrollment.id,
    newValue: enrollment
  })

  return enrollment


updateEnrollment(tenantId, enrollmentId, updates, userId):
  // 1. Fetch existing
  enrollment = await enrollmentRepo.findById(enrollmentId)
  if (!enrollment || enrollment.tenantId !== tenantId) {
    throw new NotFoundException('Enrollment', enrollmentId)
  }

  // 2. Validate fee structure if updating
  if (updates.feeStructureId) {
    fs = await feeStructureRepo.findById(updates.feeStructureId)
    if (!fs || fs.tenantId !== tenantId) {
      throw new NotFoundException('FeeStructure', updates.feeStructureId)
    }
  }

  // 3. Validate end date
  if (updates.endDate && updates.endDate <= enrollment.startDate) {
    throw new ValidationException('endDate', 'End date must be after start date')
  }

  // 4. Update via repository
  oldValue = { ...enrollment }
  updated = await enrollmentRepo.update(enrollmentId, updates)

  // 5. Audit log
  await auditLogService.logAction({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'Enrollment',
    entityId: enrollmentId,
    previousValue: oldValue,
    newValue: updated
  })

  return updated


withdrawChild(tenantId, enrollmentId, endDate, userId):
  // 1. Fetch enrollment
  enrollment = await enrollmentRepo.findById(enrollmentId)
  if (!enrollment || enrollment.tenantId !== tenantId) {
    throw new NotFoundException('Enrollment', enrollmentId)
  }

  // 2. Check not already withdrawn
  if (enrollment.status === EnrollmentStatus.WITHDRAWN) {
    throw new ConflictException('Enrollment already withdrawn')
  }

  // 3. Validate end date after start
  if (endDate <= enrollment.startDate) {
    throw new ValidationException('endDate', 'End date must be after start date')
  }

  // 4. Update status
  oldValue = { ...enrollment }
  updated = await enrollmentRepo.update(enrollmentId, {
    endDate,
    status: EnrollmentStatus.WITHDRAWN
  })

  // 5. Audit log
  await auditLogService.logAction({
    tenantId,
    userId,
    action: 'UPDATE',
    entityType: 'Enrollment',
    entityId: enrollmentId,
    previousValue: oldValue,
    newValue: updated
  })

  return updated


getActiveEnrollments(tenantId, parentId?):
  if (parentId) {
    return enrollmentRepo.findActiveByParentId(tenantId, parentId)
  }
  return enrollmentRepo.findByStatus(tenantId, EnrollmentStatus.ACTIVE)


applySiblingDiscount(tenantId, parentId):
  // 1. Get all active enrollments for parent
  enrollments = await this.getActiveEnrollments(tenantId, parentId)

  // 2. Initialize discount map
  discountMap = new Map<string, Decimal>()

  if (enrollments.length < 2) {
    // No discount for single child
    for (e of enrollments) {
      discountMap.set(e.childId, new Decimal(0))
    }
    return discountMap
  }

  // 3. Sort by startDate (oldest first = first child)
  enrollments.sort((a, b) => a.startDate.getTime() - b.startDate.getTime())

  // 4. Apply discount rules
  for (i, enrollment of enrollments):
    if (i === 0) {
      // First child: no discount
      discountMap.set(enrollment.childId, new Decimal(0))
    } else if (enrollments.length === 2) {
      // Second child of 2: 10%
      discountMap.set(enrollment.childId, new Decimal(10))
    } else {
      // 3+ children
      if (i === 1) {
        // Second child: 15%
        discountMap.set(enrollment.childId, new Decimal(15))
      } else {
        // Third+: 20%
        discountMap.set(enrollment.childId, new Decimal(20))
      }
    }

  return discountMap
</pseudo_code>

<files_to_create>
  <file path="src/database/services/enrollment.service.ts">EnrollmentService with all methods</file>
  <file path="src/database/dto/enrollment-service.dto.ts">Service-layer DTOs (EnrollChildDto, UpdateEnrollmentServiceDto, etc.)</file>
  <file path="tests/database/services/enrollment.service.spec.ts">Unit tests using REAL database</file>
</files_to_create>

<files_to_modify>
  <file path="src/database/repositories/enrollment.repository.ts">Add findByParentId and findActiveByParentId methods</file>
  <file path="src/database/database.module.ts">Register EnrollmentService in providers and exports</file>
  <file path="src/database/services/index.ts">Export EnrollmentService</file>
  <file path="src/database/dto/index.ts">Export enrollment-service DTOs</file>
</files_to_modify>

<test_patterns>
## Test Setup (CRITICAL - Follow Exactly!)

```typescript
// tests/database/services/enrollment.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { EnrollmentService } from '../../../src/database/services/enrollment.service';
import { EnrollmentRepository } from '../../../src/database/repositories/enrollment.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { FeeStructureRepository } from '../../../src/database/repositories/fee-structure.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
// ... other imports

describe('EnrollmentService', () => {
  let service: EnrollmentService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        EnrollmentService,
        EnrollmentRepository,
        ChildRepository,
        FeeStructureRepository,
        ParentRepository,
        AuditLogService,
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    // CRITICAL: Clean in FK order - leaf tables first!
    await prisma.sarsSubmission.deleteMany({});
    await prisma.reconciliation.deleteMany({});
    await prisma.payroll.deleteMany({});
    await prisma.staff.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.enrollment.deleteMany({});
    await prisma.feeStructure.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.payeePattern.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.xeroToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.tenant.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ... tests using REAL database, no mocks
});
```

## Key Test Cases (Minimum Required)
1. enrollChild - success with valid data
2. enrollChild - throws NotFoundException for invalid childId
3. enrollChild - throws NotFoundException for invalid feeStructureId
4. enrollChild - throws ConflictException for duplicate active enrollment
5. enrollChild - throws ValidationException for past startDate
6. updateEnrollment - success with valid updates
7. updateEnrollment - throws NotFoundException for invalid enrollmentId
8. updateEnrollment - throws ValidationException for endDate before startDate
9. withdrawChild - success with valid data
10. withdrawChild - throws ConflictException if already withdrawn
11. getActiveEnrollments - returns all active for tenant
12. getActiveEnrollments - filters by parentId correctly
13. applySiblingDiscount - 0% for single child
14. applySiblingDiscount - 10% for second of 2 children
15. applySiblingDiscount - 15% and 20% for 3+ children
</test_patterns>

<validation_criteria>
  <criterion>EnrollmentService compiles without TypeScript errors</criterion>
  <criterion>Lint passes with 0 errors and 0 warnings</criterion>
  <criterion>All methods have correct signatures matching spec</criterion>
  <criterion>enrollChild validates child and fee structure existence</criterion>
  <criterion>enrollChild prevents duplicate active enrollments</criterion>
  <criterion>withdrawChild sets WITHDRAWN status and end date</criterion>
  <criterion>withdrawChild prevents double withdrawal</criterion>
  <criterion>applySiblingDiscount calculates correct percentages</criterion>
  <criterion>getActiveEnrollments filters by parent when provided</criterion>
  <criterion>Date validations work correctly</criterion>
  <criterion>All mutations logged via AuditLogService</criterion>
  <criterion>Tests use REAL database (no mocks)</criterion>
  <criterion>Decimal.js used for all discount calculations</criterion>
</validation_criteria>

<test_commands>
  <command>pnpm build</command>
  <command>pnpm lint</command>
  <command>pnpm test -- --runInBand enrollment.service.spec.ts</command>
  <command>pnpm test -- --runInBand --coverage enrollment.service.spec.ts</command>
</test_commands>

</task_spec>

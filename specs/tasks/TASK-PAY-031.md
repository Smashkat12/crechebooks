<task_spec id="TASK-PAY-031" version="3.0">

<metadata>
  <title>Payment Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>50</sequence>
  <implements>
    <requirement_ref>REQ-PAY-005</requirement_ref>
    <requirement_ref>REQ-PAY-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-011</task_ref>
    <task_ref status="complete">TASK-PAY-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<!-- ═══════════════════════════════════════════════════════════════════════════
     CRITICAL REQUIREMENTS - READ BEFORE IMPLEMENTING
     ═══════════════════════════════════════════════════════════════════════════ -->

<critical_requirements>
  <requirement priority="MANDATORY">
    **NO BACKWARDS COMPATIBILITY**: If something fails, it MUST error with clear messages.
    Never create workarounds, fallbacks, or silent failures.
  </requirement>
  <requirement priority="MANDATORY">
    **FAIL-FAST**: Use proper exception classes from `src/shared/exceptions`.
    Log errors with full context before throwing.
  </requirement>
  <requirement priority="MANDATORY">
    **NO MOCK DATA IN TESTS**: Use `jest.spyOn()` with real service method verification.
    Tests must validate actual behavior, not mock responses.
  </requirement>
  <requirement priority="MANDATORY">
    **API DTOs use snake_case**, Service DTOs use camelCase.
    Transform between them in the controller.
  </requirement>
  <requirement priority="MANDATORY">
    **All monetary amounts stored as cents (integers)**. Convert to decimal for API responses only.
  </requirement>
</critical_requirements>

<!-- ═══════════════════════════════════════════════════════════════════════════
     CONTEXT - WHAT EXISTS AND WHAT YOU'RE BUILDING
     ═══════════════════════════════════════════════════════════════════════════ -->

<context>
This task creates the Payment API controller for manual payment allocation. When automatic
payment matching fails or requires human review, users need to manually allocate bank
transaction credits to invoices.

**What Exists (DO NOT RECREATE):**
- `PaymentAllocationService` at `src/database/services/payment-allocation.service.ts`
- `PaymentMatchingService` at `src/database/services/payment-matching.service.ts`
- `PaymentRepository` at `src/database/repositories/payment.repository.ts`
- Service DTOs at `src/database/dto/payment-allocation.dto.ts`
- Payment entity at `src/database/entities/payment.entity.ts`

**What You're Creating:**
- Payment API controller at `src/api/payment/payment.controller.ts`
- API DTOs at `src/api/payment/dto/` (snake_case for external API)
- Payment module at `src/api/payment/payment.module.ts`
- Controller tests at `tests/api/payment/payment.controller.spec.ts`
</context>

<!-- ═══════════════════════════════════════════════════════════════════════════
     FILE STRUCTURE - EXACT PATHS (VERIFIED 2025-12-22)
     ═══════════════════════════════════════════════════════════════════════════ -->

<existing_files>
  <!-- Services (DO NOT MODIFY) -->
  <file path="src/database/services/payment-allocation.service.ts" role="business_logic">
    Contains `allocatePayment()`, `allocateToMultipleInvoices()`, `reverseAllocation()`
  </file>
  <file path="src/database/services/payment-matching.service.ts" role="business_logic">
    Contains matching algorithms (for TASK-PAY-032, not this task)
  </file>

  <!-- Repositories (DO NOT MODIFY) -->
  <file path="src/database/repositories/payment.repository.ts" role="data_access">
    Contains `create()`, `findById()`, `findByTenantId()`, `reverse()`
  </file>
  <file path="src/database/repositories/invoice.repository.ts" role="data_access">
    Contains `findById()`, `recordPayment()`
  </file>
  <file path="src/database/repositories/transaction.repository.ts" role="data_access">
    Contains `findById()` for validating transaction exists
  </file>

  <!-- Entities -->
  <file path="src/database/entities/payment.entity.ts" role="types">
    Exports: MatchType, MatchedBy, IPayment
  </file>
  <file path="src/database/entities/invoice.entity.ts" role="types">
    Exports: InvoiceStatus, DeliveryMethod, DeliveryStatus, IInvoice
  </file>
  <file path="src/database/entities/user.entity.ts" role="types">
    Exports: UserRole, IUser
  </file>

  <!-- Service DTOs (camelCase - internal use) -->
  <file path="src/database/dto/payment-allocation.dto.ts" role="service_dto">
    Exports: AllocatePaymentDto, AllocationDto, ReverseAllocationDto, AllocationResult, XeroSyncStatus
  </file>

  <!-- Auth (USE AS-IS) -->
  <file path="src/api/auth/decorators/current-user.decorator.ts" role="decorator">
    Exports: CurrentUser decorator
  </file>
  <file path="src/api/auth/decorators/roles.decorator.ts" role="decorator">
    Exports: Roles decorator
  </file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts" role="guard">
    Exports: JwtAuthGuard
  </file>
  <file path="src/api/auth/guards/roles.guard.ts" role="guard">
    Exports: RolesGuard
  </file>

  <!-- Module Registration -->
  <file path="src/api/api.module.ts" role="module_registry">
    UPDATE THIS to import PaymentModule
  </file>
</existing_files>

<files_to_create>
  <file path="src/api/payment/payment.controller.ts">Payment controller with POST /payments endpoint</file>
  <file path="src/api/payment/dto/allocate-payment.dto.ts">API DTO for payment allocation request (snake_case)</file>
  <file path="src/api/payment/dto/payment-response.dto.ts">API DTO for payment response (snake_case)</file>
  <file path="src/api/payment/dto/index.ts">DTO barrel export</file>
  <file path="src/api/payment/payment.module.ts">Payment API module</file>
  <file path="tests/api/payment/payment.controller.spec.ts">Controller unit tests (NO MOCK DATA)</file>
</files_to_create>

<!-- ═══════════════════════════════════════════════════════════════════════════
     PROVEN PATTERNS - FOLLOW EXACTLY (FROM TASK-BILL-031, TASK-BILL-033)
     ═══════════════════════════════════════════════════════════════════════════ -->

<patterns>

<pattern name="controller_structure">
```typescript
// src/api/payment/payment.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  Logger,
  HttpCode,
  UseGuards,
  NotFoundException,
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
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { IUser } from '../../database/entities/user.entity';
import { MatchType } from '../../database/entities/payment.entity';
import {
  ApiAllocatePaymentDto,
  AllocatePaymentResponseDto,
  ListPaymentsQueryDto,
  PaymentListResponseDto,
} from './dto';

@Controller('payments')
@ApiTags('Payments')
@ApiBearerAuth('JWT-auth')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentAllocationService: PaymentAllocationService,
    private readonly paymentRepo: PaymentRepository,
    private readonly transactionRepo: TransactionRepository,
  ) {}

  // ... endpoints
}
```
</pattern>

<pattern name="api_dto_snake_case">
```typescript
// src/api/payment/dto/allocate-payment.dto.ts
// API DTOs use snake_case for external consumers

import {
  IsUUID,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ApiAllocationDto {
  @ApiProperty({
    description: 'Invoice UUID to allocate payment to',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  invoice_id!: string;  // snake_case for API

  @ApiProperty({
    description: 'Amount to allocate in Rand (decimal)',
    example: 3450.00,
  })
  @IsNumber()
  @Min(0.01)
  amount!: number;  // Decimal for API, convert to cents in controller
}

export class ApiAllocatePaymentDto {
  @ApiProperty({
    description: 'Transaction UUID to allocate from',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  transaction_id!: string;  // snake_case for API

  @ApiProperty({
    type: [ApiAllocationDto],
    description: 'Array of invoice allocations',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApiAllocationDto)
  @ArrayMinSize(1)
  allocations!: ApiAllocationDto[];
}
```
</pattern>

<pattern name="controller_endpoint">
```typescript
// POST /payments - Allocate payment to invoices
@Post()
@HttpCode(201)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({
  summary: 'Manually allocate payment to invoices',
  description: 'Allocates a bank transaction credit to one or more invoices.',
})
@ApiResponse({ status: 201, type: AllocatePaymentResponseDto })
@ApiResponse({ status: 400, description: 'Invalid allocation (exceeds transaction amount)' })
@ApiResponse({ status: 404, description: 'Transaction or invoice not found' })
@ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async allocatePayment(
  @Body() dto: ApiAllocatePaymentDto,
  @CurrentUser() user: IUser,
): Promise<AllocatePaymentResponseDto> {
  this.logger.log(
    `Allocate payment: tenant=${user.tenantId}, transaction=${dto.transaction_id}`,
  );

  // Transform API snake_case to service camelCase, decimal to cents
  const result = await this.paymentAllocationService.allocatePayment({
    tenantId: user.tenantId,
    transactionId: dto.transaction_id,  // snake_case -> camelCase
    allocations: dto.allocations.map((a) => ({
      invoiceId: a.invoice_id,  // snake_case -> camelCase
      amountCents: Math.round(a.amount * 100),  // decimal -> cents
    })),
    userId: user.id,
  });

  this.logger.log(
    `Allocation complete: ${result.payments.length} payments created`,
  );

  // Transform service camelCase to API snake_case, cents to decimal
  return {
    success: true,
    data: {
      payments: result.payments.map((p) => ({
        id: p.id,
        invoice_id: p.invoiceId,  // camelCase -> snake_case
        amount: p.amountCents / 100,  // cents -> decimal
        match_type: p.matchType,
        created_at: p.createdAt,
      })),
      unallocated_amount: result.unallocatedAmountCents / 100,  // cents -> decimal
    },
  };
}
```
</pattern>

<pattern name="module_structure">
```typescript
// src/api/payment/payment.module.ts
import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    TransactionRepository,
    InvoiceRepository,
    PaymentAllocationService,
    AuditLogService,
  ],
})
export class PaymentModule {}
```
</pattern>

<pattern name="test_no_mock_data">
```typescript
// tests/api/payment/payment.controller.spec.ts
// CRITICAL: NO MOCK DATA - use jest.spyOn() with real behavior verification

import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import { MatchType, MatchedBy } from '../../../src/database/entities/payment.entity';
import type { AllocationResult } from '../../../src/database/dto/payment-allocation.dto';
import { XeroSyncStatus } from '../../../src/database/dto/payment-allocation.dto';

describe('PaymentController', () => {
  let controller: PaymentController;
  let allocationService: PaymentAllocationService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentController],
      providers: [
        {
          provide: PaymentAllocationService,
          useValue: {
            allocatePayment: jest.fn(),  // Only stub methods, not data
          },
        },
        {
          provide: PaymentRepository,
          useValue: {
            findByTenantId: jest.fn(),
          },
        },
        {
          provide: TransactionRepository,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    allocationService = module.get<PaymentAllocationService>(PaymentAllocationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payments', () => {
    it('should allocate payment and transform snake_case correctly', async () => {
      // Arrange - define expected result structure (not mock data)
      const expectedResult: AllocationResult = {
        payments: [{
          id: 'payment-001',
          tenantId: mockTenantId,
          transactionId: 'trans-001',
          invoiceId: 'inv-001',
          amountCents: 345000,  // R3450.00
          paymentDate: new Date(),
          reference: 'REF123',
          matchType: MatchType.EXACT,
          matchedBy: MatchedBy.USER,
          matchConfidence: null,
          isReversed: false,
          reversedAt: null,
          reversalReason: null,
          xeroPaymentId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }],
        invoicesUpdated: ['inv-001'],
        unallocatedAmountCents: 0,
        xeroSyncStatus: XeroSyncStatus.SKIPPED,
        errors: [],
      };

      // Spy on real method with expected return
      const allocateSpy = jest
        .spyOn(allocationService, 'allocatePayment')
        .mockResolvedValue(expectedResult);

      // Act
      const result = await controller.allocatePayment(
        {
          transaction_id: 'trans-001',  // API snake_case
          allocations: [{ invoice_id: 'inv-001', amount: 3450.00 }],  // Decimal
        },
        mockOwnerUser,
      );

      // Assert - verify service called with camelCase and cents
      expect(allocateSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionId: 'trans-001',  // Transformed to camelCase
        allocations: [{ invoiceId: 'inv-001', amountCents: 345000 }],  // Decimal -> cents
        userId: mockUserId,
      });

      // Assert - verify response uses snake_case and decimal
      expect(result.success).toBe(true);
      expect(result.data.payments[0].invoice_id).toBe('inv-001');  // snake_case
      expect(result.data.payments[0].amount).toBe(3450.00);  // cents -> decimal
      expect(result.data.unallocated_amount).toBe(0);  // snake_case
    });

    // Add more tests for:
    // - Multiple invoice allocations
    // - Validation errors (empty allocations, negative amounts)
    // - Tenant isolation (user.tenantId used)
    // - Role restrictions (OWNER, ADMIN only)
    // - Partial allocation (unallocated amount > 0)
  });
});
```
</pattern>

</patterns>

<!-- ═══════════════════════════════════════════════════════════════════════════
     ENDPOINTS TO IMPLEMENT
     ═══════════════════════════════════════════════════════════════════════════ -->

<endpoints>

<endpoint method="POST" path="/payments" priority="required">
  <description>Manually allocate a bank transaction credit to one or more invoices</description>
  <roles>OWNER, ADMIN</roles>
  <request_body type="ApiAllocatePaymentDto">
    {
      "transaction_id": "uuid",     // snake_case API
      "allocations": [
        { "invoice_id": "uuid", "amount": 3450.00 }  // Decimal in API
      ]
    }
  </request_body>
  <response type="AllocatePaymentResponseDto">
    {
      "success": true,
      "data": {
        "payments": [
          {
            "id": "uuid",
            "invoice_id": "uuid",     // snake_case API
            "amount": 3450.00,        // Decimal in API (converted from cents)
            "match_type": "MANUAL",
            "created_at": "2025-12-22T10:00:00Z"
          }
        ],
        "unallocated_amount": 0.00   // Remaining amount not allocated
      }
    }
  </response>
  <errors>
    <error status="400" code="ALLOCATION_EXCEEDS_TRANSACTION">Total allocations exceed transaction amount</error>
    <error status="400" code="TRANSACTION_NOT_CREDIT">Transaction must be a credit (incoming payment)</error>
    <error status="400" code="NO_ALLOCATIONS">At least one allocation required</error>
    <error status="404" code="TRANSACTION_NOT_FOUND">Transaction ID not found</error>
    <error status="404" code="INVOICE_NOT_FOUND">Invoice ID not found</error>
  </errors>
</endpoint>

<endpoint method="GET" path="/payments" priority="required">
  <description>List payments for the authenticated tenant with optional filters</description>
  <roles>OWNER, ADMIN, VIEWER, ACCOUNTANT</roles>
  <query_params>
    <param name="invoice_id" type="string" optional="true">Filter by invoice</param>
    <param name="transaction_id" type="string" optional="true">Filter by transaction</param>
    <param name="match_type" type="MatchType" optional="true">Filter by match type</param>
    <param name="is_reversed" type="boolean" optional="true">Filter reversed payments</param>
    <param name="page" type="number" optional="true" default="1">Page number</param>
    <param name="limit" type="number" optional="true" default="20">Items per page</param>
  </query_params>
  <response type="PaymentListResponseDto">
    {
      "success": true,
      "data": [...],
      "meta": { "page": 1, "limit": 20, "total": 45, "totalPages": 3 }
    }
  </response>
</endpoint>

</endpoints>

<!-- ═══════════════════════════════════════════════════════════════════════════
     VALIDATION AND ERROR HANDLING
     ═══════════════════════════════════════════════════════════════════════════ -->

<validation>
  <rule>transaction_id must be valid UUID (class-validator @IsUUID)</rule>
  <rule>allocations must have at least 1 item (@ArrayMinSize(1))</rule>
  <rule>Each allocation.invoice_id must be valid UUID</rule>
  <rule>Each allocation.amount must be positive number >= 0.01</rule>
  <rule>Service validates: sum(allocations) <= transaction.amountCents</rule>
  <rule>Service validates: transaction.isCredit === true</rule>
</validation>

<error_handling>
  <rule>Import exceptions from `src/shared/exceptions`</rule>
  <rule>Let service exceptions (NotFoundException, BusinessException) propagate</rule>
  <rule>NestJS exception filters will format response correctly</rule>
  <rule>Log all errors with full context before throwing</rule>
  <rule>Never swallow errors or create fallbacks</rule>
</error_handling>

<!-- ═══════════════════════════════════════════════════════════════════════════
     IMPLEMENTATION STEPS
     ═══════════════════════════════════════════════════════════════════════════ -->

<implementation_steps>
  <step order="1">
    Create `src/api/payment/dto/allocate-payment.dto.ts` with ApiAllocatePaymentDto (snake_case)
  </step>
  <step order="2">
    Create `src/api/payment/dto/payment-response.dto.ts` with response DTOs (snake_case)
  </step>
  <step order="3">
    Create `src/api/payment/dto/list-payments.dto.ts` with query and list DTOs
  </step>
  <step order="4">
    Create `src/api/payment/dto/index.ts` barrel export
  </step>
  <step order="5">
    Create `src/api/payment/payment.controller.ts` with POST and GET endpoints
  </step>
  <step order="6">
    Create `src/api/payment/payment.module.ts` with all providers
  </step>
  <step order="7">
    Update `src/api/api.module.ts` to import PaymentModule
  </step>
  <step order="8">
    Create `tests/api/payment/payment.controller.spec.ts` with comprehensive tests
  </step>
  <step order="9">
    Run `npm run build` - must pass with zero errors
  </step>
  <step order="10">
    Run `npm run lint` - must pass with zero warnings
  </step>
  <step order="11">
    Run `npm test` - all 1443+ existing tests plus new tests must pass
  </step>
</implementation_steps>

<!-- ═══════════════════════════════════════════════════════════════════════════
     VERIFICATION CHECKLIST
     ═══════════════════════════════════════════════════════════════════════════ -->

<verification>
  <criterion>TypeScript compiles with no errors</criterion>
  <criterion>ESLint passes with no warnings</criterion>
  <criterion>All 1443+ existing tests still pass</criterion>
  <criterion>New controller tests pass (minimum 12 tests)</criterion>
  <criterion>POST /payments returns 201 on successful allocation</criterion>
  <criterion>POST /payments returns 400 for validation errors with clear messages</criterion>
  <criterion>POST /payments returns 404 for non-existent transaction/invoice</criterion>
  <criterion>GET /payments returns paginated list with filtering</criterion>
  <criterion>API uses snake_case, service uses camelCase</criterion>
  <criterion>API returns decimal amounts, service uses cents</criterion>
  <criterion>Tenant isolation enforced via user.tenantId</criterion>
  <criterion>Role restrictions enforced (OWNER/ADMIN for POST)</criterion>
</verification>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- tests/api/payment/payment.controller.spec.ts</command>
  <command>npm test</command>
</test_commands>

</task_spec>

<task_spec id="TASK-PAY-032" version="3.0">

<metadata>
  <title>Payment Matching Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>51</sequence>
  <implements>
    <requirement_ref>REQ-PAY-001</requirement_ref>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <requirement_ref>REQ-PAY-003</requirement_ref>
    <requirement_ref>REQ-PAY-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-031</task_ref>
    <task_ref status="complete">TASK-PAY-011</task_ref>
    <task_ref status="complete">TASK-AGENT-003</task_ref>
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
    **FAIL-FAST**: Let service exceptions propagate. Use NestJS exception filters.
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
This task adds the POST /payments/match endpoint to the existing PaymentController.
It triggers AI-powered automatic payment matching using PaymentMatchingService.matchPayments().

**Current Project State (2025-12-22):**
- Total tests: 1458 passing
- Build: PASS | Lint: PASS
- Surface Layer: 56% complete (9/16 tasks)

**What Exists (DO NOT RECREATE):**
- `PaymentController` at `src/api/payment/payment.controller.ts` (from TASK-PAY-031)
  - Already has POST /payments (allocate) and GET /payments (list)
  - Uses @Controller('payments'), @ApiTags('Payments'), @ApiBearerAuth('JWT-auth')
- `PaymentModule` at `src/api/payment/payment.module.ts` (from TASK-PAY-031)
  - Already imports PrismaModule, PaymentRepository, InvoiceRepository, etc.
- `PaymentMatchingService` at `src/database/services/payment-matching.service.ts`
  - Method: `matchPayments(dto: MatchPaymentsDto): Promise<MatchingBatchResult>`
  - Auto-applies matches with confidence >= 80%
  - Returns candidates for review if confidence < 80%
- Service DTOs at `src/database/dto/payment-matching.dto.ts`:
  - MatchPaymentsDto, MatchingBatchResult, TransactionMatchResult, MatchCandidate, AppliedMatch

**What You're Creating:**
- New API DTOs at `src/api/payment/dto/match-payments.dto.ts` (snake_case)
- New API DTOs at `src/api/payment/dto/matching-result.dto.ts` (snake_case)
- New POST /payments/match endpoint in existing PaymentController
- Controller tests at `tests/api/payment/payment-matching.controller.spec.ts`
</context>

<!-- ═══════════════════════════════════════════════════════════════════════════
     FILE STRUCTURE - EXACT PATHS (VERIFIED 2025-12-22)
     ═══════════════════════════════════════════════════════════════════════════ -->

<existing_files>
  <!-- Services (DO NOT MODIFY) -->
  <file path="src/database/services/payment-matching.service.ts" role="business_logic">
    Contains:
    - matchPayments(dto: MatchPaymentsDto): Promise&lt;MatchingBatchResult&gt;
    - Auto-apply threshold: 80% confidence
    - Returns: { processed, autoApplied, reviewRequired, noMatch, results[] }
    - Each result has: transactionId, status, appliedMatch?, candidates?, reason
  </file>

  <!-- Service DTOs (camelCase - internal use) -->
  <file path="src/database/dto/payment-matching.dto.ts" role="service_dto">
    Exports:
    - MatchPaymentsDto: { tenantId, transactionIds? }
    - MatchingBatchResult: { processed, autoApplied, reviewRequired, noMatch, results[] }
    - TransactionMatchResult: { transactionId, status, appliedMatch?, candidates?, reason }
    - MatchCandidate: { transactionId, invoiceId, invoiceNumber, confidenceLevel, confidenceScore, matchReasons[], parentId, parentName, childName, invoiceOutstandingCents, transactionAmountCents }
    - AppliedMatch: { paymentId, transactionId, invoiceId, invoiceNumber, amountCents, confidenceScore }
    - MatchConfidenceLevel enum: EXACT, HIGH, MEDIUM, LOW
  </file>

  <!-- Existing API Files (MODIFY THESE) -->
  <file path="src/api/payment/payment.controller.ts" role="api_controller">
    Add matchPayments() method to existing controller
  </file>
  <file path="src/api/payment/payment.module.ts" role="module">
    Add PaymentMatchingService to providers array
  </file>
  <file path="src/api/payment/dto/index.ts" role="barrel">
    Add exports for new DTOs
  </file>

  <!-- Auth (USE AS-IS) -->
  <file path="src/api/auth/decorators/current-user.decorator.ts">CurrentUser decorator</file>
  <file path="src/api/auth/decorators/roles.decorator.ts">Roles decorator</file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts">JwtAuthGuard</file>
  <file path="src/api/auth/guards/roles.guard.ts">RolesGuard</file>
</existing_files>

<files_to_create>
  <file path="src/api/payment/dto/match-payments.dto.ts">API DTO for match request (snake_case)</file>
  <file path="src/api/payment/dto/matching-result.dto.ts">API DTOs for match response (snake_case)</file>
  <file path="tests/api/payment/payment-matching.controller.spec.ts">Matching endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/payment/payment.controller.ts">Add matchPayments method</file>
  <file path="src/api/payment/payment.module.ts">Add PaymentMatchingService to providers</file>
  <file path="src/api/payment/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<!-- ═══════════════════════════════════════════════════════════════════════════
     PROVEN PATTERNS - FOLLOW EXACTLY (FROM TASK-PAY-031)
     ═══════════════════════════════════════════════════════════════════════════ -->

<patterns>

<pattern name="api_request_dto">
```typescript
// src/api/payment/dto/match-payments.dto.ts
import { IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * API DTO for triggering payment matching.
 * Uses snake_case for external API consumers.
 */
export class ApiMatchPaymentsDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Specific transaction IDs to match. If empty, matches all unallocated credits.',
    example: ['550e8400-e29b-41d4-a716-446655440000'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transaction_ids?: string[];  // snake_case for API
}
```
</pattern>

<pattern name="api_response_dto">
```typescript
// src/api/payment/dto/matching-result.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Response DTO for an auto-applied payment match.
 */
export class ApiMatchedPaymentDto {
  @ApiProperty({ example: 'payment-uuid' })
  id!: string;

  @ApiProperty({ example: 'transaction-uuid' })
  transaction_id!: string;

  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 3450.00, description: 'Amount in Rand (decimal)' })
  amount!: number;

  @ApiProperty({ enum: ['EXACT', 'HIGH', 'MEDIUM', 'LOW'] })
  confidence_level!: string;

  @ApiProperty({ example: 95 })
  confidence_score!: number;

  @ApiProperty({ type: [String], example: ['Exact reference match', 'Exact amount match'] })
  match_reasons!: string[];
}

/**
 * Suggested match candidate for review.
 */
export class ApiSuggestedMatchDto {
  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiProperty({ example: 65 })
  confidence_score!: number;

  @ApiProperty({ type: [String], example: ['Amount within 5%', 'Strong name similarity'] })
  match_reasons!: string[];

  @ApiProperty({ example: 3450.00, description: 'Invoice outstanding in Rand (decimal)' })
  outstanding_amount!: number;
}

/**
 * Transaction requiring manual review.
 */
export class ApiReviewRequiredDto {
  @ApiProperty({ example: 'transaction-uuid' })
  transaction_id!: string;

  @ApiProperty({ example: 3500.00, description: 'Transaction amount in Rand (decimal)' })
  amount!: number;

  @ApiProperty({ description: 'Why this needs review' })
  reason!: string;

  @ApiProperty({ type: [ApiSuggestedMatchDto] })
  suggested_matches!: ApiSuggestedMatchDto[];
}

/**
 * Summary of matching batch operation.
 */
export class ApiMatchingSummaryDto {
  @ApiProperty({ example: 25, description: 'Total transactions processed' })
  processed!: number;

  @ApiProperty({ example: 18, description: 'Matches auto-applied (confidence >= 80%)' })
  auto_applied!: number;

  @ApiProperty({ example: 5, description: 'Matches requiring manual review' })
  requires_review!: number;

  @ApiProperty({ example: 2, description: 'Transactions with no matching invoice' })
  no_match!: number;
}

/**
 * Data portion of matching response.
 */
export class ApiMatchingResultDataDto {
  @ApiProperty({ type: ApiMatchingSummaryDto })
  summary!: ApiMatchingSummaryDto;

  @ApiProperty({ type: [ApiMatchedPaymentDto] })
  auto_matched!: ApiMatchedPaymentDto[];

  @ApiProperty({ type: [ApiReviewRequiredDto] })
  review_required!: ApiReviewRequiredDto[];
}

/**
 * Full response for payment matching endpoint.
 */
export class ApiMatchingResultResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiMatchingResultDataDto })
  data!: ApiMatchingResultDataDto;
}
```
</pattern>

<pattern name="controller_endpoint">
```typescript
// Add to src/api/payment/payment.controller.ts

// Add import at top:
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import {
  ApiMatchPaymentsDto,
  ApiMatchingResultResponseDto,
  ApiMatchedPaymentDto,
  ApiReviewRequiredDto,
  ApiSuggestedMatchDto,
} from './dto';

// Add to constructor:
constructor(
  private readonly paymentAllocationService: PaymentAllocationService,
  private readonly paymentMatchingService: PaymentMatchingService,  // ADD THIS
  private readonly paymentRepo: PaymentRepository,
  private readonly invoiceRepo: InvoiceRepository,
) {}

// Add new endpoint:
/**
 * Trigger AI payment matching for unallocated transactions.
 * Auto-applies matches with confidence >= 80%, flags others for review.
 */
@Post('match')
@HttpCode(200)
@Roles(UserRole.OWNER, UserRole.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({
  summary: 'Trigger AI payment matching',
  description:
    'Matches unallocated credit transactions to outstanding invoices. ' +
    'Auto-applies matches with >= 80% confidence, flags others for manual review.',
})
@ApiResponse({ status: 200, type: ApiMatchingResultResponseDto })
@ApiResponse({ status: 400, description: 'Invalid transaction ID' })
@ApiForbiddenResponse({ description: 'Requires OWNER or ADMIN role' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async matchPayments(
  @Body() dto: ApiMatchPaymentsDto,
  @CurrentUser() user: IUser,
): Promise<ApiMatchingResultResponseDto> {
  this.logger.log(
    `Match payments: tenant=${user.tenantId}, transactions=${dto.transaction_ids?.length ?? 'all'}`,
  );

  // Transform API snake_case to service camelCase
  const result = await this.paymentMatchingService.matchPayments({
    tenantId: user.tenantId,
    transactionIds: dto.transaction_ids,  // snake_case -> camelCase
  });

  this.logger.log(
    `Matching complete: ${result.autoApplied} auto-applied, ${result.reviewRequired} review, ${result.noMatch} no match`,
  );

  // Transform service camelCase to API snake_case, cents to decimal
  const autoMatched: ApiMatchedPaymentDto[] = result.results
    .filter((r) => r.status === 'AUTO_APPLIED' && r.appliedMatch)
    .map((r) => ({
      id: r.appliedMatch!.paymentId,
      transaction_id: r.appliedMatch!.transactionId,
      invoice_id: r.appliedMatch!.invoiceId,
      invoice_number: r.appliedMatch!.invoiceNumber,
      amount: r.appliedMatch!.amountCents / 100,  // cents -> decimal
      confidence_level: r.appliedMatch!.confidenceScore === 100 ? 'EXACT' :
                        r.appliedMatch!.confidenceScore >= 80 ? 'HIGH' :
                        r.appliedMatch!.confidenceScore >= 50 ? 'MEDIUM' : 'LOW',
      confidence_score: r.appliedMatch!.confidenceScore,
      match_reasons: ['Auto-matched: ' + r.reason],
    }));

  const reviewRequired: ApiReviewRequiredDto[] = result.results
    .filter((r) => r.status === 'REVIEW_REQUIRED' && r.candidates)
    .map((r) => ({
      transaction_id: r.transactionId,
      amount: r.candidates![0]?.transactionAmountCents
        ? r.candidates![0].transactionAmountCents / 100
        : 0,
      reason: r.reason,
      suggested_matches: r.candidates!.map((c) => ({
        invoice_id: c.invoiceId,
        invoice_number: c.invoiceNumber,
        parent_name: c.parentName,
        confidence_score: c.confidenceScore,
        match_reasons: c.matchReasons,
        outstanding_amount: c.invoiceOutstandingCents / 100,  // cents -> decimal
      })),
    }));

  return {
    success: true,
    data: {
      summary: {
        processed: result.processed,
        auto_applied: result.autoApplied,
        requires_review: result.reviewRequired,
        no_match: result.noMatch,
      },
      auto_matched: autoMatched,
      review_required: reviewRequired,
    },
  };
}
```
</pattern>

<pattern name="module_update">
```typescript
// src/api/payment/payment.module.ts
// ADD PaymentMatchingService to providers:

import { PaymentMatchingService } from '../../database/services/payment-matching.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    TransactionRepository,
    InvoiceRepository,
    PaymentAllocationService,
    PaymentMatchingService,  // ADD THIS
    AuditLogService,
  ],
})
export class PaymentModule {}
```
</pattern>

<pattern name="test_no_mock_data">
```typescript
// tests/api/payment/payment-matching.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { PaymentMatchingService } from '../../../src/database/services/payment-matching.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { MatchingBatchResult, MatchCandidate, AppliedMatch } from '../../../src/database/dto/payment-matching.dto';
import { MatchConfidenceLevel } from '../../../src/database/dto/payment-matching.dto';

describe('PaymentController - matchPayments', () => {
  let controller: PaymentController;
  let matchingService: PaymentMatchingService;

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
          provide: PaymentMatchingService,
          useValue: { matchPayments: jest.fn() },
        },
        {
          provide: PaymentAllocationService,
          useValue: { allocatePayment: jest.fn() },
        },
        {
          provide: PaymentRepository,
          useValue: { findByTenantId: jest.fn() },
        },
        {
          provide: InvoiceRepository,
          useValue: { findById: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<PaymentController>(PaymentController);
    matchingService = module.get<PaymentMatchingService>(PaymentMatchingService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /payments/match', () => {
    it('should call service with transformed DTO and return snake_case response', async () => {
      // Arrange
      const mockAppliedMatch: AppliedMatch = {
        paymentId: 'pay-001',
        transactionId: 'trans-001',
        invoiceId: 'inv-001',
        invoiceNumber: 'INV-2025-0001',
        amountCents: 345000,  // R3450.00
        confidenceScore: 100,
      };

      const expectedResult: MatchingBatchResult = {
        processed: 1,
        autoApplied: 1,
        reviewRequired: 0,
        noMatch: 0,
        results: [{
          transactionId: 'trans-001',
          status: 'AUTO_APPLIED',
          appliedMatch: mockAppliedMatch,
          reason: 'Exact match: reference and amount',
        }],
      };

      const matchSpy = jest
        .spyOn(matchingService, 'matchPayments')
        .mockResolvedValue(expectedResult);

      // Act
      const result = await controller.matchPayments(
        { transaction_ids: ['trans-001'] },  // API snake_case
        mockOwnerUser,
      );

      // Assert - service called with camelCase
      expect(matchSpy).toHaveBeenCalledWith({
        tenantId: mockTenantId,
        transactionIds: ['trans-001'],  // camelCase
      });

      // Assert - response uses snake_case
      expect(result.success).toBe(true);
      expect(result.data.summary.auto_applied).toBe(1);  // snake_case
      expect(result.data.auto_matched[0].transaction_id).toBe('trans-001');  // snake_case
      expect(result.data.auto_matched[0].amount).toBe(3450.00);  // cents -> decimal
    });

    it('should handle review-required results correctly', async () => {
      const mockCandidate: MatchCandidate = {
        transactionId: 'trans-002',
        invoiceId: 'inv-002',
        invoiceNumber: 'INV-2025-0002',
        confidenceLevel: MatchConfidenceLevel.MEDIUM,
        confidenceScore: 65,
        matchReasons: ['Amount within 5%', 'Strong name similarity'],
        parentId: 'parent-001',
        parentName: 'John Smith',
        childName: 'Emma',
        invoiceOutstandingCents: 350000,
        transactionAmountCents: 340000,
      };

      const expectedResult: MatchingBatchResult = {
        processed: 1,
        autoApplied: 0,
        reviewRequired: 1,
        noMatch: 0,
        results: [{
          transactionId: 'trans-002',
          status: 'REVIEW_REQUIRED',
          candidates: [mockCandidate],
          reason: 'No high-confidence match found',
        }],
      };

      jest.spyOn(matchingService, 'matchPayments').mockResolvedValue(expectedResult);

      const result = await controller.matchPayments({}, mockOwnerUser);

      expect(result.data.summary.requires_review).toBe(1);
      expect(result.data.review_required[0].suggested_matches[0].invoice_id).toBe('inv-002');
      expect(result.data.review_required[0].suggested_matches[0].outstanding_amount).toBe(3500.00);
    });

    // Add more tests for:
    // - Empty transaction list (process all)
    // - Multiple auto-applied matches
    // - No match scenarios
    // - Service error propagation
  });
});
```
</pattern>

</patterns>

<!-- ═══════════════════════════════════════════════════════════════════════════
     IMPLEMENTATION STEPS
     ═══════════════════════════════════════════════════════════════════════════ -->

<implementation_steps>
  <step order="1">
    Create `src/api/payment/dto/match-payments.dto.ts` with ApiMatchPaymentsDto
  </step>
  <step order="2">
    Create `src/api/payment/dto/matching-result.dto.ts` with all response DTOs
  </step>
  <step order="3">
    Update `src/api/payment/dto/index.ts` to export new DTOs
  </step>
  <step order="4">
    Update `src/api/payment/payment.module.ts` to add PaymentMatchingService to providers
  </step>
  <step order="5">
    Update `src/api/payment/payment.controller.ts`:
    - Add PaymentMatchingService to constructor
    - Add matchPayments() endpoint
  </step>
  <step order="6">
    Create `tests/api/payment/payment-matching.controller.spec.ts` with minimum 10 tests
  </step>
  <step order="7">
    Run `npm run build` - must pass with zero errors
  </step>
  <step order="8">
    Run `npm run lint` - must pass with zero warnings
  </step>
  <step order="9">
    Run `npm test` - all 1458+ existing tests plus new tests must pass
  </step>
</implementation_steps>

<!-- ═══════════════════════════════════════════════════════════════════════════
     VERIFICATION CHECKLIST
     ═══════════════════════════════════════════════════════════════════════════ -->

<verification>
  <criterion>TypeScript compiles with no errors</criterion>
  <criterion>ESLint passes with no warnings</criterion>
  <criterion>All 1458+ existing tests still pass</criterion>
  <criterion>New controller tests pass (minimum 10 tests)</criterion>
  <criterion>POST /payments/match returns 200 with correct structure</criterion>
  <criterion>Auto-applied matches have confidence >= 80%</criterion>
  <criterion>Review-required matches have confidence < 80%</criterion>
  <criterion>API uses snake_case, service uses camelCase</criterion>
  <criterion>API returns decimal amounts, service uses cents</criterion>
  <criterion>Tenant isolation enforced via user.tenantId</criterion>
  <criterion>Role restrictions enforced (OWNER/ADMIN only)</criterion>
</verification>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- tests/api/payment/payment-matching.controller.spec.ts</command>
  <command>npm test</command>
</test_commands>

</task_spec>

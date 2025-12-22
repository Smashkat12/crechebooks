<task_spec id="TASK-PAY-033" version="3.0">

<metadata>
  <title>Arrears Dashboard Endpoint</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>52</sequence>
  <implements>
    <requirement_ref>REQ-PAY-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-PAY-031</task_ref>
    <task_ref status="complete">TASK-PAY-013</task_ref>
    <task_ref status="complete">TASK-BILL-011</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
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
This task adds the GET /arrears endpoint to the existing PaymentController.
It provides a comprehensive arrears dashboard with aging analysis using ArrearsService.getArrearsReport().

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
- `ArrearsService` at `src/database/services/arrears.service.ts`
  - Method: `getArrearsReport(tenantId: string, filters?: ArrearsFiltersDto): Promise<ArrearsReport>`
  - Returns: { summary, topDebtors[], invoices[], generatedAt }
  - Summary contains: { totalOutstandingCents, totalInvoices, aging }
  - Aging buckets: { currentCents, days30Cents, days60Cents, days90PlusCents }
  - Method: `getTopDebtors(tenantId: string, limit?: number): Promise<DebtorSummary[]>`
- Service DTOs at `src/database/dto/arrears.dto.ts`:
  - ArrearsReport, ArrearsReportSummary, AgingBuckets, DebtorSummary, ArrearsInvoice
  - ArrearsFiltersDto (for optional filtering)

**What You're Creating:**
- New API DTOs at `src/api/payment/dto/arrears-report.dto.ts` (snake_case)
- New GET /arrears endpoint in existing PaymentController
- Controller tests at `tests/api/payment/arrears.controller.spec.ts`

**NOTE ON AGING BUCKETS:**
The ArrearsService uses different aging definitions than the original task spec:
- `current`: 0-7 days overdue (not 0-29)
- `30`: 8-30 days overdue
- `60`: 31-60 days overdue
- `90+`: 61+ days overdue

Expose these exactly as the service provides them. Do NOT modify the aging logic.
</context>

<!-- ═══════════════════════════════════════════════════════════════════════════
     FILE STRUCTURE - EXACT PATHS (VERIFIED 2025-12-22)
     ═══════════════════════════════════════════════════════════════════════════ -->

<existing_files>
  <!-- Services (DO NOT MODIFY) -->
  <file path="src/database/services/arrears.service.ts" role="business_logic">
    Contains:
    - getArrearsReport(tenantId, filters?): Promise&lt;ArrearsReport&gt;
      Returns: { summary, topDebtors[], invoices[], generatedAt }
    - getTopDebtors(tenantId, limit?): Promise&lt;DebtorSummary[]&gt;
    - calculateAging(invoices): AgingBuckets
    - exportArrearsCSV(tenantId, filters?): Promise&lt;string&gt;
    - getParentHistory(parentId, tenantId): Promise&lt;ParentPaymentHistory&gt;
  </file>

  <!-- Service DTOs (camelCase - internal use) -->
  <file path="src/database/dto/arrears.dto.ts" role="service_dto">
    Exports:
    - ArrearsFiltersDto: { dateFrom?, dateTo?, parentId?, minAmountCents? }
    - AgingBucketType: 'current' | '30' | '60' | '90+'
    - AgingBuckets: { currentCents, days30Cents, days60Cents, days90PlusCents }
    - ArrearsReportSummary: { totalOutstandingCents, totalInvoices, aging }
    - DebtorSummary: { parentId, parentName, parentEmail, parentPhone, totalOutstandingCents, oldestInvoiceDate, invoiceCount, maxDaysOverdue }
    - ArrearsInvoice: { invoiceId, invoiceNumber, parentId, parentName, childId, childName, issueDate, dueDate, totalCents, amountPaidCents, outstandingCents, daysOverdue, agingBucket }
    - ArrearsReport: { summary, topDebtors[], invoices[], generatedAt }
  </file>

  <!-- Existing API Files (MODIFY THESE) -->
  <file path="src/api/payment/payment.controller.ts" role="api_controller">
    Add getArrearsReport() method to existing controller
  </file>
  <file path="src/api/payment/payment.module.ts" role="module">
    Add ArrearsService and ParentRepository to providers array
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
  <file path="src/api/payment/dto/arrears-report.dto.ts">API DTOs for arrears dashboard (snake_case)</file>
  <file path="tests/api/payment/arrears.controller.spec.ts">Arrears endpoint unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/payment/payment.controller.ts">Add getArrearsReport method</file>
  <file path="src/api/payment/payment.module.ts">Add ArrearsService and ParentRepository to providers</file>
  <file path="src/api/payment/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<!-- ═══════════════════════════════════════════════════════════════════════════
     PROVEN PATTERNS - FOLLOW EXACTLY (FROM TASK-PAY-031)
     ═══════════════════════════════════════════════════════════════════════════ -->

<patterns>

<pattern name="api_response_dto">
```typescript
// src/api/payment/dto/arrears-report.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Aging breakdown with amounts in Rand (decimal format).
 * NOTE: Aging buckets differ from typical 30-day buckets:
 * - current: 0-7 days overdue
 * - days_30: 8-30 days overdue
 * - days_60: 31-60 days overdue
 * - days_90_plus: 61+ days overdue
 */
export class ApiAgingBreakdownDto {
  @ApiProperty({ example: 15000.00, description: 'Amount overdue 0-7 days (in Rand)' })
  current!: number;

  @ApiProperty({ example: 12000.00, description: 'Amount overdue 8-30 days (in Rand)' })
  days_30!: number;

  @ApiProperty({ example: 8600.00, description: 'Amount overdue 31-60 days (in Rand)' })
  days_60!: number;

  @ApiProperty({ example: 10000.00, description: 'Amount overdue 61+ days (in Rand)' })
  days_90_plus!: number;
}

/**
 * Summary statistics for arrears report.
 */
export class ApiArrearsSummaryDto {
  @ApiProperty({ example: 45600.00, description: 'Total outstanding amount in Rand' })
  total_outstanding!: number;

  @ApiProperty({ example: 25, description: 'Total number of overdue invoices' })
  total_invoices!: number;

  @ApiProperty({ type: ApiAgingBreakdownDto })
  aging!: ApiAgingBreakdownDto;
}

/**
 * Top debtor summary information.
 */
export class ApiTopDebtorDto {
  @ApiProperty({ example: 'parent-uuid' })
  parent_id!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiPropertyOptional({ example: 'john@email.com' })
  parent_email!: string | null;

  @ApiPropertyOptional({ example: '+27821234567' })
  parent_phone!: string | null;

  @ApiProperty({ example: 6900.00, description: 'Outstanding amount in Rand' })
  outstanding!: number;

  @ApiProperty({ example: '2024-10-01', description: 'Date of oldest unpaid invoice (YYYY-MM-DD)' })
  oldest_invoice_date!: string;

  @ApiProperty({ example: 3, description: 'Number of overdue invoices' })
  invoice_count!: number;

  @ApiProperty({ example: 45, description: 'Maximum days overdue across all invoices' })
  max_days_overdue!: number;
}

/**
 * Individual invoice in arrears (for detailed view).
 */
export class ApiArrearsInvoiceDto {
  @ApiProperty({ example: 'invoice-uuid' })
  invoice_id!: string;

  @ApiProperty({ example: 'INV-2025-0001' })
  invoice_number!: string;

  @ApiProperty({ example: 'parent-uuid' })
  parent_id!: string;

  @ApiProperty({ example: 'John Smith' })
  parent_name!: string;

  @ApiProperty({ example: 'child-uuid' })
  child_id!: string;

  @ApiProperty({ example: 'Emma Smith' })
  child_name!: string;

  @ApiProperty({ example: '2024-11-01', description: 'Invoice issue date (YYYY-MM-DD)' })
  issue_date!: string;

  @ApiProperty({ example: '2024-11-15', description: 'Invoice due date (YYYY-MM-DD)' })
  due_date!: string;

  @ApiProperty({ example: 3450.00, description: 'Total invoice amount in Rand' })
  total!: number;

  @ApiProperty({ example: 1000.00, description: 'Amount already paid in Rand' })
  amount_paid!: number;

  @ApiProperty({ example: 2450.00, description: 'Outstanding amount in Rand' })
  outstanding!: number;

  @ApiProperty({ example: 35, description: 'Number of days overdue' })
  days_overdue!: number;

  @ApiProperty({ enum: ['current', '30', '60', '90+'], example: '30' })
  aging_bucket!: string;
}

/**
 * Data portion of arrears report response.
 */
export class ApiArrearsReportDataDto {
  @ApiProperty({ type: ApiArrearsSummaryDto })
  summary!: ApiArrearsSummaryDto;

  @ApiProperty({ type: [ApiTopDebtorDto], description: 'Top 10 debtors by outstanding amount' })
  top_debtors!: ApiTopDebtorDto[];
}

/**
 * Full response for arrears dashboard endpoint.
 */
export class ApiArrearsReportResponseDto {
  @ApiProperty({ example: true })
  success!: boolean;

  @ApiProperty({ type: ApiArrearsReportDataDto })
  data!: ApiArrearsReportDataDto;
}
```
</pattern>

<pattern name="controller_endpoint">
```typescript
// Add to src/api/payment/payment.controller.ts

// Add import at top:
import { ArrearsService } from '../../database/services/arrears.service';
import {
  ApiArrearsReportResponseDto,
  ApiTopDebtorDto,
} from './dto';

// Add to constructor:
constructor(
  private readonly paymentAllocationService: PaymentAllocationService,
  private readonly arrearsService: ArrearsService,  // ADD THIS
  private readonly paymentRepo: PaymentRepository,
  private readonly invoiceRepo: InvoiceRepository,
) {}

// Add new endpoint:
/**
 * Get arrears dashboard with aging breakdown and top debtors.
 * All amounts returned in Rand (decimal format).
 */
@Get('arrears')
@Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiOperation({
  summary: 'Get arrears dashboard with aging breakdown',
  description:
    'Returns comprehensive arrears report including aging analysis (0-7, 8-30, 31-60, 61+ days) ' +
    'and top 10 debtors by outstanding amount. All amounts in Rand.',
})
@ApiResponse({ status: 200, type: ApiArrearsReportResponseDto })
@ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async getArrearsReport(
  @CurrentUser() user: IUser,
): Promise<ApiArrearsReportResponseDto> {
  this.logger.log(`Get arrears report: tenant=${user.tenantId}`);

  // Call service - no filters for dashboard (gets all arrears)
  const report = await this.arrearsService.getArrearsReport(user.tenantId);

  this.logger.log(
    `Arrears report: ${report.summary.totalInvoices} invoices, R${(report.summary.totalOutstandingCents / 100).toFixed(2)} outstanding`,
  );

  // Transform service camelCase to API snake_case, cents to decimal
  const topDebtors: ApiTopDebtorDto[] = report.topDebtors.map((d) => ({
    parent_id: d.parentId,
    parent_name: d.parentName,
    parent_email: d.parentEmail,
    parent_phone: d.parentPhone,
    outstanding: d.totalOutstandingCents / 100,  // cents -> decimal
    oldest_invoice_date: d.oldestInvoiceDate.toISOString().split('T')[0],  // YYYY-MM-DD
    invoice_count: d.invoiceCount,
    max_days_overdue: d.maxDaysOverdue,
  }));

  return {
    success: true,
    data: {
      summary: {
        total_outstanding: report.summary.totalOutstandingCents / 100,  // cents -> decimal
        total_invoices: report.summary.totalInvoices,
        aging: {
          current: report.summary.aging.currentCents / 100,
          days_30: report.summary.aging.days30Cents / 100,
          days_60: report.summary.aging.days60Cents / 100,
          days_90_plus: report.summary.aging.days90PlusCents / 100,
        },
      },
      top_debtors: topDebtors,
    },
  };
}
```
</pattern>

<pattern name="module_update">
```typescript
// src/api/payment/payment.module.ts
// ADD ArrearsService and ParentRepository to providers:

import { ArrearsService } from '../../database/services/arrears.service';
import { ParentRepository } from '../../database/repositories/parent.repository';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    TransactionRepository,
    InvoiceRepository,
    ParentRepository,          // ADD THIS (required by ArrearsService)
    PaymentAllocationService,
    ArrearsService,            // ADD THIS
    AuditLogService,
  ],
})
export class PaymentModule {}
```
</pattern>

<pattern name="test_no_mock_data">
```typescript
// tests/api/payment/arrears.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentController } from '../../../src/api/payment/payment.controller';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { PaymentAllocationService } from '../../../src/database/services/payment-allocation.service';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { UserRole } from '@prisma/client';
import type { IUser } from '../../../src/database/entities/user.entity';
import type { ArrearsReport, DebtorSummary, AgingBuckets, ArrearsReportSummary } from '../../../src/database/dto/arrears.dto';

describe('PaymentController - getArrearsReport', () => {
  let controller: PaymentController;
  let arrearsService: ArrearsService;

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
          provide: ArrearsService,
          useValue: { getArrearsReport: jest.fn() },
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
    arrearsService = module.get<ArrearsService>(ArrearsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /arrears', () => {
    it('should return arrears report with snake_case and decimal amounts', async () => {
      // Arrange
      const mockAging: AgingBuckets = {
        currentCents: 1500000,    // R15,000
        days30Cents: 1200000,     // R12,000
        days60Cents: 860000,      // R8,600
        days90PlusCents: 1000000, // R10,000
      };

      const mockSummary: ArrearsReportSummary = {
        totalOutstandingCents: 4560000,  // R45,600
        totalInvoices: 25,
        aging: mockAging,
      };

      const mockDebtor: DebtorSummary = {
        parentId: 'parent-001',
        parentName: 'John Smith',
        parentEmail: 'john@email.com',
        parentPhone: '+27821234567',
        totalOutstandingCents: 690000,  // R6,900
        oldestInvoiceDate: new Date('2024-10-01'),
        invoiceCount: 3,
        maxDaysOverdue: 45,
      };

      const mockReport: ArrearsReport = {
        summary: mockSummary,
        topDebtors: [mockDebtor],
        invoices: [],
        generatedAt: new Date(),
      };

      const reportSpy = jest
        .spyOn(arrearsService, 'getArrearsReport')
        .mockResolvedValue(mockReport);

      // Act
      const result = await controller.getArrearsReport(mockOwnerUser);

      // Assert - service called with tenantId
      expect(reportSpy).toHaveBeenCalledWith(mockTenantId);

      // Assert - response uses snake_case
      expect(result.success).toBe(true);
      expect(result.data.summary.total_outstanding).toBe(45600.00);  // cents -> decimal
      expect(result.data.summary.total_invoices).toBe(25);
      expect(result.data.summary.aging.current).toBe(15000.00);
      expect(result.data.summary.aging.days_30).toBe(12000.00);
      expect(result.data.summary.aging.days_60).toBe(8600.00);
      expect(result.data.summary.aging.days_90_plus).toBe(10000.00);

      // Assert - top debtors use snake_case
      expect(result.data.top_debtors[0].parent_id).toBe('parent-001');
      expect(result.data.top_debtors[0].parent_name).toBe('John Smith');
      expect(result.data.top_debtors[0].outstanding).toBe(6900.00);
      expect(result.data.top_debtors[0].oldest_invoice_date).toBe('2024-10-01');
    });

    it('should return empty report for tenant with no arrears', async () => {
      const emptyReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 0,
          totalInvoices: 0,
          aging: { currentCents: 0, days30Cents: 0, days60Cents: 0, days90PlusCents: 0 },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      jest.spyOn(arrearsService, 'getArrearsReport').mockResolvedValue(emptyReport);

      const result = await controller.getArrearsReport(mockOwnerUser);

      expect(result.success).toBe(true);
      expect(result.data.summary.total_outstanding).toBe(0);
      expect(result.data.summary.total_invoices).toBe(0);
      expect(result.data.top_debtors).toHaveLength(0);
    });

    it('should verify aging buckets sum equals total outstanding', async () => {
      const mockReport: ArrearsReport = {
        summary: {
          totalOutstandingCents: 4560000,
          totalInvoices: 4,
          aging: {
            currentCents: 1500000,
            days30Cents: 1200000,
            days60Cents: 860000,
            days90PlusCents: 1000000,
          },
        },
        topDebtors: [],
        invoices: [],
        generatedAt: new Date(),
      };

      jest.spyOn(arrearsService, 'getArrearsReport').mockResolvedValue(mockReport);

      const result = await controller.getArrearsReport(mockOwnerUser);

      const agingSum =
        result.data.summary.aging.current +
        result.data.summary.aging.days_30 +
        result.data.summary.aging.days_60 +
        result.data.summary.aging.days_90_plus;

      expect(agingSum).toBe(result.data.summary.total_outstanding);
    });

    // Add more tests for:
    // - Multiple top debtors
    // - Date formatting verification
    // - Service error propagation
    // - Decimal precision
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
    Create `src/api/payment/dto/arrears-report.dto.ts` with all response DTOs
  </step>
  <step order="2">
    Update `src/api/payment/dto/index.ts` to export new DTOs
  </step>
  <step order="3">
    Update `src/api/payment/payment.module.ts` to add ArrearsService and ParentRepository to providers
  </step>
  <step order="4">
    Update `src/api/payment/payment.controller.ts`:
    - Add ArrearsService to constructor
    - Add getArrearsReport() endpoint
  </step>
  <step order="5">
    Create `tests/api/payment/arrears.controller.spec.ts` with minimum 8 tests
  </step>
  <step order="6">
    Run `npm run build` - must pass with zero errors
  </step>
  <step order="7">
    Run `npm run lint` - must pass with zero warnings
  </step>
  <step order="8">
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
  <criterion>New controller tests pass (minimum 8 tests)</criterion>
  <criterion>GET /arrears returns 200 with correct structure</criterion>
  <criterion>Aging buckets sum equals total_outstanding</criterion>
  <criterion>Top debtors ordered by outstanding amount descending</criterion>
  <criterion>Dates formatted as YYYY-MM-DD</criterion>
  <criterion>API uses snake_case, service uses camelCase</criterion>
  <criterion>API returns decimal amounts, service uses cents</criterion>
  <criterion>Empty tenant returns zero totals (not error)</criterion>
  <criterion>Tenant isolation enforced via user.tenantId</criterion>
  <criterion>Role restrictions enforced (OWNER/ADMIN/ACCOUNTANT)</criterion>
</verification>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm test -- tests/api/payment/arrears.controller.spec.ts</command>
  <command>npm test</command>
</test_commands>

</task_spec>

<task_spec id="TASK-RECON-031" version="3.0">

<metadata>
  <title>Reconciliation Controller</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>56</sequence>
  <implements>
    <requirement_ref>REQ-RECON-001</requirement_ref>
    <requirement_ref>REQ-RECON-002</requirement_ref>
    <requirement_ref>REQ-RECON-003</requirement_ref>
    <requirement_ref>REQ-RECON-004</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-011</task_ref>
    <task_ref status="complete">TASK-RECON-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<executive_summary>
Create NestJS Reconciliation API controller at src/api/reconciliation/ with POST /reconciliation endpoint.
Uses ReconciliationService.reconcile() from src/database/services/reconciliation.service.ts.
Compares transaction records with bank statement balances, identifies matched/unmatched,
marks reconciled transactions, and flags discrepancies. TASK-RECON-032 will add financial reports
endpoint to the same module.
</executive_summary>

<critical_rules>
  <rule>NO BACKWARDS COMPATIBILITY - fail fast or work correctly</rule>
  <rule>NO MOCK DATA IN TESTS - use jest.spyOn() with real Prisma types</rule>
  <rule>NO WORKAROUNDS OR FALLBACKS - errors must propagate with clear messages</rule>
  <rule>API DTOs use snake_case (e.g., bank_account, period_start, opening_balance)</rule>
  <rule>Internal service DTOs use camelCase (e.g., bankAccount, periodStart, openingBalanceCents)</rule>
  <rule>API response amounts in Rands (divide by 100), internal amounts in cents</rule>
  <rule>Use `import type { IUser }` for decorator compatibility with isolatedModules</rule>
</critical_rules>

<project_context>
  <test_count>1510 tests passing as of TASK-SARS-033 completion</test_count>
  <completed_api_modules>
    - src/api/auth/ (AuthModule)
    - src/api/transaction/ (TransactionModule)
    - src/api/billing/ (BillingModule)
    - src/api/payment/ (PaymentModule)
    - src/api/sars/ (SarsModule)
  </completed_api_modules>
  <pattern_reference>Use src/api/sars/sars.controller.ts as the reference implementation pattern</pattern_reference>
</project_context>

<existing_infrastructure>
  <file path="src/database/services/reconciliation.service.ts" purpose="Reconciliation service (TASK-RECON-011)">
    Key method:
    ```typescript
    async reconcile(dto: ReconcileDto, userId: string): Promise<ReconcileResult>

    // ReconcileDto (from src/database/dto/reconciliation-service.dto.ts):
    interface ReconcileDto {
      tenantId: string;
      bankAccount: string;
      periodStart: string;  // ISO date string
      periodEnd: string;    // ISO date string
      openingBalanceCents: number;
      closingBalanceCents: number;
    }

    // ReconcileResult:
    interface ReconcileResult {
      id: string;
      status: 'IN_PROGRESS' | 'RECONCILED' | 'DISCREPANCY';
      openingBalanceCents: number;
      closingBalanceCents: number;
      calculatedBalanceCents: number;
      discrepancyCents: number;
      matchedCount: number;
      unmatchedCount: number;
    }
    ```
    Throws BusinessException if periodStart > periodEnd.
    Throws ConflictException if period already reconciled.
  </file>
  <file path="src/database/dto/reconciliation-service.dto.ts" purpose="Internal DTOs (camelCase)">
    Contains ReconcileDto, ReconcileResult, BalanceCalculation, MatchResult interfaces.
  </file>
  <file path="src/database/repositories/reconciliation.repository.ts" purpose="Repository for Reconciliation entity">
    Used by ReconciliationService.
  </file>
  <file path="src/database/entities/reconciliation.entity.ts" purpose="Prisma entity">
    Fields: id, tenantId, bankAccount, periodStart, periodEnd, openingBalanceCents,
    closingBalanceCents, calculatedBalanceCents, discrepancyCents, status, reconciledBy, reconciledAt.
  </file>
  <file path="src/api/auth/decorators/current-user.decorator.ts" purpose="Get current user from JWT">
    @CurrentUser() returns IUser from request.
  </file>
  <file path="src/api/auth/guards/jwt-auth.guard.ts" purpose="JWT authentication guard">
    @UseGuards(JwtAuthGuard).
  </file>
  <file path="src/api/auth/guards/roles.guard.ts" purpose="Role-based access control">
    @UseGuards(JwtAuthGuard, RolesGuard) with @Roles(UserRole.OWNER, ...).
  </file>
  <file path="src/shared/exceptions/index.ts" purpose="Custom exception classes">
    NotFoundException, ConflictException, BusinessException.
  </file>
  <file path="src/api/api.module.ts" purpose="API module barrel">
    Imports/exports all API modules. Currently includes: AuthModule, TransactionModule, BillingModule, PaymentModule, SarsModule.
  </file>
</existing_infrastructure>

<files_to_create>
  <file path="src/api/reconciliation/reconciliation.controller.ts">
    NestJS controller for reconciliation endpoints.

    ```typescript
    /**
     * Reconciliation Controller
     * TASK-RECON-031: Reconciliation Controller
     *
     * Handles bank reconciliation operations.
     * Uses snake_case for external API, transforms to camelCase for internal services.
     */
    import {
      Controller, Post, Body, Logger, HttpCode, UseGuards,
    } from '@nestjs/common';
    import {
      ApiTags, ApiOperation, ApiResponse, ApiBearerAuth,
      ApiUnauthorizedResponse, ApiForbiddenResponse,
    } from '@nestjs/swagger';
    import { UserRole } from '@prisma/client';
    import { ReconciliationService } from '../../database/services/reconciliation.service';
    import { CurrentUser } from '../auth/decorators/current-user.decorator';
    import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
    import { RolesGuard } from '../auth/guards/roles.guard';
    import { Roles } from '../auth/decorators/roles.decorator';
    import type { IUser } from '../../database/entities/user.entity';
    import { ApiReconcileDto, ApiReconciliationResponseDto } from './dto';

    @Controller('reconciliation')
    @ApiTags('Reconciliation')
    @ApiBearerAuth('JWT-auth')
    export class ReconciliationController {
      private readonly logger = new Logger(ReconciliationController.name);

      constructor(
        private readonly reconciliationService: ReconciliationService,
      ) {}

      @Post()
      @HttpCode(201)
      @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.ACCOUNTANT)
      @UseGuards(JwtAuthGuard, RolesGuard)
      @ApiOperation({ summary: 'Run bank reconciliation for period' })
      @ApiResponse({ status: 201, type: ApiReconciliationResponseDto, description: 'Reconciled successfully' })
      @ApiResponse({ status: 200, type: ApiReconciliationResponseDto, description: 'Reconciled with discrepancies' })
      @ApiResponse({ status: 400, description: 'Invalid date format or period_end before period_start' })
      @ApiResponse({ status: 409, description: 'Period already reconciled' })
      @ApiForbiddenResponse({ description: 'Requires OWNER, ADMIN, or ACCOUNTANT role' })
      @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
      async reconcile(
        @Body() dto: ApiReconcileDto,
        @CurrentUser() user: IUser,
      ): Promise<ApiReconciliationResponseDto> {
        this.logger.log(
          `Reconcile: tenant=${user.tenantId}, account=${dto.bank_account}, period=${dto.period_start} to ${dto.period_end}`
        );

        // Transform API snake_case to service camelCase, Rands to cents
        const result = await this.reconciliationService.reconcile(
          {
            tenantId: user.tenantId,
            bankAccount: dto.bank_account,
            periodStart: dto.period_start,
            periodEnd: dto.period_end,
            openingBalanceCents: Math.round(dto.opening_balance * 100),
            closingBalanceCents: Math.round(dto.closing_balance * 100),
          },
          user.id,
        );

        this.logger.log(
          `Reconciliation ${result.id}: status=${result.status}, discrepancy=${result.discrepancyCents}c`
        );

        // Transform service camelCase to API snake_case, cents to Rands
        return {
          success: true,
          data: {
            id: result.id,
            status: result.status,
            bank_account: dto.bank_account,
            period_start: dto.period_start,
            period_end: dto.period_end,
            opening_balance: result.openingBalanceCents / 100,
            closing_balance: result.closingBalanceCents / 100,
            calculated_balance: result.calculatedBalanceCents / 100,
            discrepancy: result.discrepancyCents / 100,
            matched_count: result.matchedCount,
            unmatched_count: result.unmatchedCount,
          },
        };
      }
    }
    ```
  </file>

  <file path="src/api/reconciliation/dto/reconcile.dto.ts">
    API DTO for POST /reconciliation request body.

    ```typescript
    /**
     * Reconcile DTO
     * TASK-RECON-031: Reconciliation Controller
     *
     * API DTO for reconciliation request.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty } from '@nestjs/swagger';
    import { IsString, IsDateString, IsNumber, MaxLength, MinLength } from 'class-validator';

    export class ApiReconcileDto {
      @ApiProperty({
        description: 'Bank account identifier',
        example: 'FNB Business Current',
      })
      @IsString()
      @MinLength(1)
      @MaxLength(100)
      bank_account!: string;

      @ApiProperty({
        description: 'Start date of reconciliation period (YYYY-MM-DD)',
        example: '2025-01-01',
      })
      @IsDateString()
      period_start!: string;

      @ApiProperty({
        description: 'End date of reconciliation period (YYYY-MM-DD)',
        example: '2025-01-31',
      })
      @IsDateString()
      period_end!: string;

      @ApiProperty({
        description: 'Opening balance from bank statement (Rands)',
        example: 50000.00,
      })
      @IsNumber()
      opening_balance!: number;

      @ApiProperty({
        description: 'Closing balance from bank statement (Rands)',
        example: 62500.00,
      })
      @IsNumber()
      closing_balance!: number;
    }
    ```
  </file>

  <file path="src/api/reconciliation/dto/reconciliation-response.dto.ts">
    Response DTO for reconciliation endpoint.

    ```typescript
    /**
     * Reconciliation Response DTOs
     * TASK-RECON-031: Reconciliation Controller
     *
     * Response DTOs for reconciliation operations.
     * Uses snake_case for external API consistency.
     */
    import { ApiProperty } from '@nestjs/swagger';

    export class ReconciliationDataDto {
      @ApiProperty({ example: 'uuid-here' })
      id!: string;

      @ApiProperty({ example: 'RECONCILED', enum: ['IN_PROGRESS', 'RECONCILED', 'DISCREPANCY'] })
      status!: string;

      @ApiProperty({ example: 'FNB Business Current' })
      bank_account!: string;

      @ApiProperty({ example: '2025-01-01' })
      period_start!: string;

      @ApiProperty({ example: '2025-01-31' })
      period_end!: string;

      @ApiProperty({ example: 50000.00, description: 'Opening balance (Rands)' })
      opening_balance!: number;

      @ApiProperty({ example: 62500.00, description: 'Closing balance from statement (Rands)' })
      closing_balance!: number;

      @ApiProperty({ example: 62500.00, description: 'Calculated from opening + credits - debits (Rands)' })
      calculated_balance!: number;

      @ApiProperty({ example: 0.00, description: 'closing_balance - calculated_balance (Rands)' })
      discrepancy!: number;

      @ApiProperty({ example: 45, description: 'Transactions matched and marked as reconciled' })
      matched_count!: number;

      @ApiProperty({ example: 0, description: 'Transactions not matched' })
      unmatched_count!: number;
    }

    export class ApiReconciliationResponseDto {
      @ApiProperty({ example: true })
      success!: boolean;

      @ApiProperty({ type: ReconciliationDataDto })
      data!: ReconciliationDataDto;
    }
    ```
  </file>

  <file path="src/api/reconciliation/dto/index.ts">
    Barrel export for Reconciliation DTOs.

    ```typescript
    /**
     * Reconciliation DTO Barrel Exports
     * TASK-RECON-031: Reconciliation Controller
     */
    export * from './reconcile.dto';
    export * from './reconciliation-response.dto';
    // TASK-RECON-032 will add: export * from './income-statement.dto';
    ```
  </file>

  <file path="src/api/reconciliation/reconciliation.module.ts">
    NestJS module for Reconciliation API.

    ```typescript
    /**
     * Reconciliation Module
     * TASK-RECON-031: Reconciliation Controller
     *
     * Provides the ReconciliationController with required dependencies.
     */
    import { Module } from '@nestjs/common';
    import { ReconciliationController } from './reconciliation.controller';
    import { ReconciliationService } from '../../database/services/reconciliation.service';
    import { ReconciliationRepository } from '../../database/repositories/reconciliation.repository';
    import { PrismaModule } from '../../database/prisma';

    @Module({
      imports: [PrismaModule],
      controllers: [ReconciliationController],
      providers: [
        ReconciliationService,
        ReconciliationRepository,
        // FinancialReportService will be added in TASK-RECON-032
      ],
    })
    export class ReconciliationModule {}
    ```
  </file>

  <file path="tests/api/reconciliation/reconciliation.controller.spec.ts">
    Controller unit tests using jest.spyOn() - NO MOCK DATA.

    Test coverage (minimum 10 tests):
    1. POST /reconciliation with valid payload returns 201
    2. Transforms API snake_case (bank_account) to service camelCase (bankAccount)
    3. Transforms Rands to cents for service (opening_balance * 100)
    4. Converts cents to Rands in response (divide by 100)
    5. Response uses snake_case field names (opening_balance, not openingBalance)
    6. Returns status RECONCILED when discrepancy is 0
    7. Returns status DISCREPANCY when discrepancy != 0
    8. Works for ADMIN users same as OWNER
    9. Works for ACCOUNTANT role
    10. Propagates BusinessException when period_end before period_start
    11. Propagates ConflictException when period already reconciled

    Pattern: Use tests/api/sars/sars.controller.spec.ts as reference.
    All providers must be included even if not called directly (for DI).
  </file>
</files_to_create>

<files_to_modify>
  <file path="src/api/api.module.ts">
    Add ReconciliationModule to imports and exports.

    ```typescript
    import { ReconciliationModule } from './reconciliation/reconciliation.module';

    @Module({
      imports: [AuthModule, TransactionModule, BillingModule, PaymentModule, SarsModule, ReconciliationModule],
      exports: [AuthModule, TransactionModule, BillingModule, PaymentModule, SarsModule, ReconciliationModule],
    })
    export class ApiModule {}
    ```
  </file>
</files_to_modify>

<test_requirements>
  <requirement>Use jest.spyOn() to verify ReconciliationService.reconcile() calls</requirement>
  <requirement>Create mock IUser objects with real UserRole from @prisma/client</requirement>
  <requirement>Return typed ReconcileResult objects (not mock data)</requirement>
  <requirement>Verify DTO transformation (snake_case API to camelCase service)</requirement>
  <requirement>Verify Rands to cents conversion (multiply by 100)</requirement>
  <requirement>Verify cents to Rands conversion (divide by 100)</requirement>
  <requirement>Test error propagation (BusinessException, ConflictException)</requirement>
  <requirement>Minimum 10 tests for this endpoint</requirement>
</test_requirements>

<verification_steps>
  <step>npm run build - must compile without errors</step>
  <step>npm run lint - must pass with no warnings</step>
  <step>npm run test tests/api/reconciliation/reconciliation.controller.spec.ts - all tests pass</step>
  <step>npm run test - all tests pass (previous 1510 + ~10 new)</step>
</verification_steps>

<error_handling>
  ReconciliationService throws BusinessException if period_end before period_start - let it propagate.
  ReconciliationService throws ConflictException if period already reconciled - let it propagate.
  DO NOT catch and wrap errors. Errors must propagate with their original messages for debugging.
</error_handling>

<implementation_notes>
  1. ReconciliationService.reconcile() takes userId as second parameter for audit trail.
  2. Service returns discrepancyCents = closingBalanceCents - calculatedBalanceCents.
  3. Status is RECONCILED if |discrepancy| <= 1 cent, else DISCREPANCY.
  4. When RECONCILED, service automatically marks all period transactions as isReconciled=true.
  5. The bank_account field is a string identifier, not a UUID.
  6. South African creches typically use FNB (First National Bank).
</implementation_notes>

<south_african_context>
  <currency>ZAR (South African Rand)</currency>
  <timezone>Africa/Johannesburg (SAST, UTC+2)</timezone>
  <primary_bank>FNB (First National Bank)</primary_bank>
  <reconciliation>Monthly reconciliation typical for small businesses</reconciliation>
</south_african_context>

</task_spec>

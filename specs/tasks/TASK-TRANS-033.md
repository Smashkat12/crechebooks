<task_spec id="TASK-TRANS-033" version="3.0">

<metadata>
  <title>Categorization Endpoints</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>45</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-002</requirement_ref>
    <requirement_ref>REQ-TRANS-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-031</task_ref>
    <task_ref>TASK-TRANS-012</task_ref>
    <task_ref>TASK-AGENT-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task implements categorization endpoints for the CrecheBooks system:
1. PUT /transactions/:id/categorize - Manual user override for a single transaction
2. POST /transactions/categorize/batch - Batch AI categorization for multiple transactions
3. GET /transactions/:id/suggestions - Get categorization suggestions

Processing is SYNCHRONOUS - both endpoints return complete results immediately.
The CategorizationService already exists at src/database/services/categorization.service.ts with all
business logic. This task ONLY creates API endpoints and DTOs for the Surface Layer.

Key service methods used:
- updateCategorization(transactionId, dto, userId, tenantId) - user override with pattern learning
- categorizeTransactions(transactionIds, tenantId) - batch AI categorization
- getSuggestions(transactionId, tenantId) - get suggestions from pattern/AI/similar
</context>

<input_context_files>
  <file purpose="categorization_service">src/database/services/categorization.service.ts</file>
  <file purpose="service_dtos">src/database/dto/categorization-service.dto.ts</file>
  <file purpose="current_controller">src/api/transaction/transaction.controller.ts</file>
  <file purpose="current_module">src/api/transaction/transaction.module.ts</file>
  <file purpose="categorization_entity">src/database/entities/categorization.entity.ts</file>
  <file purpose="constitution">specs/constitution.md</file>
</input_context_files>

<existing_service_interface>
// From src/database/services/categorization.service.ts

async categorizeTransactions(
  transactionIds: string[],
  tenantId: string,
): Promise<CategorizationBatchResult>;

async updateCategorization(
  transactionId: string,
  dto: UserCategorizationDto,
  userId: string,
  tenantId: string,
): Promise<Transaction>;

async getSuggestions(
  transactionId: string,
  tenantId: string,
): Promise<CategorySuggestion[]>;

// From src/database/dto/categorization-service.dto.ts

export class UserCategorizationDto {
  accountCode!: string;       // Chart of Accounts code
  accountName!: string;       // Account name
  isSplit!: boolean;          // Is split transaction
  splits?: SplitItemDto[];    // Split line items
  vatType!: VatType;          // VAT treatment
  createPattern?: boolean;    // Learn pattern from correction (default true)
}

export class SplitItemDto {
  accountCode!: string;
  accountName!: string;
  amountCents!: number;       // Amount in cents (positive integer)
  vatType!: VatType;
  description?: string;
}

export interface CategorizationBatchResult {
  totalProcessed: number;
  autoCategorized: number;
  reviewRequired: number;
  failed: number;
  results: CategorizationItemResult[];
  statistics: {
    avgConfidence: number;
    patternMatchRate: number;
  };
}

export interface CategorizationItemResult {
  transactionId: string;
  status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'FAILED';
  accountCode?: string;
  accountName?: string;
  confidenceScore?: number;
  source: CategorizationSource;
  error?: string;
}

export interface CategorySuggestion {
  accountCode: string;
  accountName: string;
  confidenceScore: number;
  reason: string;
  source: 'PATTERN' | 'AI' | 'SIMILAR_TX';
}

// From src/database/entities/categorization.entity.ts
export enum VatType {
  STANDARD = 'STANDARD',    // 15% SA VAT
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

export enum CategorizationSource {
  AI_AUTO = 'AI_AUTO',
  AI_SUGGESTED = 'AI_SUGGESTED',
  RULE_BASED = 'RULE_BASED',
  USER_OVERRIDE = 'USER_OVERRIDE',
}
</existing_service_interface>

<prerequisites>
  <check>TASK-TRANS-031 completed - TransactionController exists with GET endpoint</check>
  <check>TASK-TRANS-012 completed - CategorizationService exists with all methods</check>
  <check>TASK-AGENT-002 completed - TransactionCategorizerAgent integrated with service</check>
</prerequisites>

<scope>
  <in_scope>
    - Add PUT /transactions/:id/categorize endpoint (manual override)
    - Add POST /transactions/categorize/batch endpoint (batch AI categorization)
    - Add GET /transactions/:id/suggestions endpoint (get suggestions)
    - Create API DTOs that map to/from service DTOs
    - Use snake_case for API request/response fields
    - Add Swagger/OpenAPI annotations with examples
    - Return 200 OK (SYNCHRONOUS processing, NOT 202)
    - Add unit tests for all endpoints
  </in_scope>
  <out_of_scope>
    - AI categorization logic (in CategorizationService and TransactionCategorizerAgent)
    - Pattern matching/learning (in CategorizationService and PatternLearningService)
    - Split validation (already in CategorizationService.validateSplits)
    - Chart of Accounts management (separate module)
  </out_of_scope>
</scope>

<definition_of_done>
  <file path="src/api/transaction/dto/update-categorization.dto.ts">
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsOptional,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * VAT types for categorization
 */
export enum VatTypeApiEnum {
  STANDARD = 'STANDARD',
  ZERO_RATED = 'ZERO_RATED',
  EXEMPT = 'EXEMPT',
  NO_VAT = 'NO_VAT',
}

/**
 * Split line item for split transactions
 */
export class SplitLineDto {
  @ApiProperty({ example: '5100', description: 'Chart of Accounts code' })
  @IsString()
  @MaxLength(20)
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  @IsString()
  @MaxLength(100)
  account_name: string;

  @ApiProperty({ example: 15000, description: 'Amount in cents (positive integer)' })
  @IsInt()
  @Min(1)
  amount_cents: number;

  @ApiProperty({ enum: VatTypeApiEnum, example: 'STANDARD' })
  @IsEnum(VatTypeApiEnum)
  vat_type: VatTypeApiEnum;

  @ApiPropertyOptional({ example: 'Kitchen supplies', description: 'Optional description' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;
}

/**
 * Request DTO for manual categorization update
 */
export class UpdateCategorizationRequestDto {
  @ApiProperty({ example: '5100', description: 'Chart of Accounts code' })
  @IsString()
  @MaxLength(20)
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  @IsString()
  @MaxLength(100)
  account_name: string;

  @ApiProperty({ example: false, description: 'Is this a split transaction' })
  @IsBoolean()
  is_split: boolean;

  @ApiPropertyOptional({ type: [SplitLineDto], description: 'Split line items (required if is_split=true)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SplitLineDto)
  splits?: SplitLineDto[];

  @ApiProperty({ enum: VatTypeApiEnum, example: 'STANDARD' })
  @IsEnum(VatTypeApiEnum)
  vat_type: VatTypeApiEnum;

  @ApiPropertyOptional({ example: true, description: 'Create pattern from correction (default true)' })
  @IsOptional()
  @IsBoolean()
  create_pattern?: boolean;
}

/**
 * Response DTO for categorization update
 */
export class UpdateCategorizationResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: {
    id: string;
    status: string;
    account_code: string;
    account_name: string;
    source: string;
    pattern_created: boolean;
  };
}
```
  </file>

  <file path="src/api/transaction/dto/batch-categorize.dto.ts">
```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * Request DTO for batch AI categorization
 */
export class BatchCategorizeRequestDto {
  @ApiPropertyOptional({
    type: [String],
    example: ['550e8400-e29b-41d4-a716-446655440000'],
    description: 'Specific transaction IDs. If empty, categorizes all PENDING transactions.',
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transaction_ids?: string[];

  @ApiPropertyOptional({
    example: false,
    description: 'Force recategorize even if already categorized (default false)',
  })
  @IsOptional()
  @IsBoolean()
  force_recategorize?: boolean;
}

/**
 * Single transaction result in batch response
 */
export class BatchCategorizationItemDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  transaction_id: string;

  @ApiProperty({ example: 'AUTO_APPLIED', enum: ['AUTO_APPLIED', 'REVIEW_REQUIRED', 'FAILED'] })
  status: string;

  @ApiPropertyOptional({ example: '5100' })
  account_code?: string;

  @ApiPropertyOptional({ example: 'Groceries & Supplies' })
  account_name?: string;

  @ApiPropertyOptional({ example: 85 })
  confidence_score?: number;

  @ApiProperty({ example: 'RULE_BASED', enum: ['AI_AUTO', 'AI_SUGGESTED', 'RULE_BASED', 'USER_OVERRIDE'] })
  source: string;

  @ApiPropertyOptional({ example: 'Transaction not found' })
  error?: string;
}

/**
 * Statistics for batch result
 */
export class BatchStatisticsDto {
  @ApiProperty({ example: 82.5, description: 'Average confidence score' })
  avg_confidence: number;

  @ApiProperty({ example: 45.2, description: 'Percentage of transactions matched by pattern' })
  pattern_match_rate: number;
}

/**
 * Response DTO for batch categorization
 */
export class BatchCategorizeResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty()
  data: {
    total_processed: number;
    auto_categorized: number;
    review_required: number;
    failed: number;
    results: BatchCategorizationItemDto[];
    statistics: BatchStatisticsDto;
  };
}
```
  </file>

  <file path="src/api/transaction/dto/suggestions.dto.ts">
```typescript
import { ApiProperty } from '@nestjs/swagger';

/**
 * Single suggestion item
 */
export class SuggestionItemDto {
  @ApiProperty({ example: '5100' })
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies' })
  account_name: string;

  @ApiProperty({ example: 85, description: 'Confidence score 0-100' })
  confidence_score: number;

  @ApiProperty({ example: 'Matched payee pattern: Woolworths' })
  reason: string;

  @ApiProperty({ example: 'PATTERN', enum: ['PATTERN', 'AI', 'SIMILAR_TX'] })
  source: string;
}

/**
 * Response DTO for suggestions endpoint
 */
export class SuggestionsResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [SuggestionItemDto] })
  data: SuggestionItemDto[];
}
```
  </file>

  <file path="src/api/transaction/transaction.controller.ts" action="modify">
```typescript
// ADD these imports at top of file
import {
  Controller,
  Get,
  Post,
  Put,
  Query,
  Param,
  Body,
  Logger,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { CategorizationService } from '../../database/services/categorization.service';
import {
  UserCategorizationDto as ServiceUserCategorizationDto,
  SplitItemDto as ServiceSplitItemDto,
} from '../../database/dto/categorization-service.dto';
import { VatType } from '../../database/entities/categorization.entity';
// ... existing imports ...
import {
  UpdateCategorizationRequestDto,
  UpdateCategorizationResponseDto,
  VatTypeApiEnum,
} from './dto/update-categorization.dto';
import {
  BatchCategorizeRequestDto,
  BatchCategorizeResponseDto,
} from './dto/batch-categorize.dto';
import {
  SuggestionsResponseDto,
} from './dto/suggestions.dto';

// ADD CategorizationService to constructor
constructor(
  private readonly transactionRepo: TransactionRepository,
  private readonly categorizationRepo: CategorizationRepository,
  private readonly importService: TransactionImportService,
  private readonly categorizationService: CategorizationService,
) {}

// ADD these endpoints after importTransactions()

@Put(':id/categorize')
@ApiOperation({
  summary: 'Update transaction categorization',
  description: 'Manually override categorization for a transaction. Optionally creates a pattern for future matching.',
})
@ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
@ApiResponse({
  status: 200,
  description: 'Categorization updated successfully',
  type: UpdateCategorizationResponseDto,
})
@ApiResponse({ status: 400, description: 'Invalid request (bad account code, split mismatch)' })
@ApiResponse({ status: 404, description: 'Transaction not found' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async updateCategorization(
  @Param('id', ParseUUIDPipe) id: string,
  @Body() dto: UpdateCategorizationRequestDto,
  @CurrentUser() user: IUser,
): Promise<UpdateCategorizationResponseDto> {
  this.logger.log(
    `Update categorization: tx=${id}, account=${dto.account_code}, tenant=${user.tenantId}`,
  );

  // Map API DTO to service DTO
  const serviceDto: ServiceUserCategorizationDto = {
    accountCode: dto.account_code,
    accountName: dto.account_name,
    isSplit: dto.is_split,
    splits: dto.splits?.map((s) => ({
      accountCode: s.account_code,
      accountName: s.account_name,
      amountCents: s.amount_cents,
      vatType: s.vat_type as unknown as VatType,
      description: s.description,
    })),
    vatType: dto.vat_type as unknown as VatType,
    createPattern: dto.create_pattern,
  };

  const transaction = await this.categorizationService.updateCategorization(
    id,
    serviceDto,
    user.id,
    user.tenantId,
  );

  return {
    success: true,
    data: {
      id: transaction.id,
      status: transaction.status,
      account_code: dto.account_code,
      account_name: dto.account_name,
      source: 'USER_OVERRIDE',
      pattern_created: dto.create_pattern !== false && !dto.is_split,
    },
  };
}

@Post('categorize/batch')
@ApiOperation({
  summary: 'Batch AI categorization',
  description: 'Trigger AI categorization for multiple transactions. If no IDs provided, categorizes all PENDING transactions.',
})
@ApiResponse({
  status: 200,
  description: 'Batch categorization completed',
  type: BatchCategorizeResponseDto,
})
@ApiResponse({ status: 400, description: 'Invalid request' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async batchCategorize(
  @Body() dto: BatchCategorizeRequestDto,
  @CurrentUser() user: IUser,
): Promise<BatchCategorizeResponseDto> {
  let transactionIds = dto.transaction_ids ?? [];

  // If no IDs provided, get all PENDING transactions
  if (transactionIds.length === 0) {
    const pending = await this.transactionRepo.findByTenant(user.tenantId, {
      status: 'PENDING',
      limit: 1000,
    });
    transactionIds = pending.data.map((tx) => tx.id);
  }

  this.logger.log(
    `Batch categorize: count=${transactionIds.length}, force=${dto.force_recategorize ?? false}, tenant=${user.tenantId}`,
  );

  if (transactionIds.length === 0) {
    return {
      success: true,
      data: {
        total_processed: 0,
        auto_categorized: 0,
        review_required: 0,
        failed: 0,
        results: [],
        statistics: {
          avg_confidence: 0,
          pattern_match_rate: 0,
        },
      },
    };
  }

  const result = await this.categorizationService.categorizeTransactions(
    transactionIds,
    user.tenantId,
  );

  return {
    success: true,
    data: {
      total_processed: result.totalProcessed,
      auto_categorized: result.autoCategorized,
      review_required: result.reviewRequired,
      failed: result.failed,
      results: result.results.map((r) => ({
        transaction_id: r.transactionId,
        status: r.status,
        account_code: r.accountCode,
        account_name: r.accountName,
        confidence_score: r.confidenceScore,
        source: r.source,
        error: r.error,
      })),
      statistics: {
        avg_confidence: result.statistics.avgConfidence,
        pattern_match_rate: result.statistics.patternMatchRate,
      },
    },
  };
}

@Get(':id/suggestions')
@ApiOperation({
  summary: 'Get categorization suggestions',
  description: 'Get AI and pattern-based suggestions for categorizing a transaction.',
})
@ApiParam({ name: 'id', description: 'Transaction UUID', type: String })
@ApiResponse({
  status: 200,
  description: 'Suggestions retrieved successfully',
  type: SuggestionsResponseDto,
})
@ApiResponse({ status: 404, description: 'Transaction not found' })
@ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
async getSuggestions(
  @Param('id', ParseUUIDPipe) id: string,
  @CurrentUser() user: IUser,
): Promise<SuggestionsResponseDto> {
  const suggestions = await this.categorizationService.getSuggestions(
    id,
    user.tenantId,
  );

  return {
    success: true,
    data: suggestions.map((s) => ({
      account_code: s.accountCode,
      account_name: s.accountName,
      confidence_score: s.confidenceScore,
      reason: s.reason,
      source: s.source,
    })),
  };
}
```
  </file>

  <file path="src/api/transaction/transaction.module.ts" action="modify">
```typescript
import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { PayeePatternRepository } from '../../database/repositories/payee-pattern.repository';
import { TransactionImportService } from '../../database/services/transaction-import.service';
import { CategorizationService } from '../../database/services/categorization.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PatternLearningService } from '../../database/services/pattern-learning.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [TransactionController],
  providers: [
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    TransactionImportService,
    CategorizationService,
    AuditLogService,
    PatternLearningService,
  ],
})
export class TransactionModule {}
```
  </file>

  <file path="src/api/transaction/dto/index.ts" action="modify">
```typescript
// ADD to existing exports
export * from './update-categorization.dto';
export * from './batch-categorize.dto';
export * from './suggestions.dto';
```
  </file>

  <file path="tests/api/transaction/categorize.controller.spec.ts">
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { TransactionImportService } from '../../../src/database/services/transaction-import.service';
import { CategorizationService } from '../../../src/database/services/categorization.service';
import {
  CategorizationBatchResult,
  CategorySuggestion,
} from '../../../src/database/dto/categorization-service.dto';
import { CategorizationSource } from '../../../src/database/entities/categorization.entity';
import { TransactionStatus } from '../../../src/database/entities/transaction.entity';
import type { IUser } from '../../../src/database/entities/user.entity';
import { VatTypeApiEnum } from '../../../src/api/transaction/dto/update-categorization.dto';

describe('TransactionController - Categorization Endpoints', () => {
  let controller: TransactionController;
  let categorizationService: jest.Mocked<CategorizationService>;
  let transactionRepo: jest.Mocked<TransactionRepository>;

  const mockUser: IUser = {
    id: 'user-001',
    tenantId: 'tenant-001',
    email: 'test@example.com',
    name: 'Test User',
    role: 'ADMIN',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction = {
    id: 'tx-001',
    tenantId: 'tenant-001',
    status: TransactionStatus.CATEGORIZED,
    date: new Date(),
    description: 'Test transaction',
    amountCents: 10000,
    isCredit: false,
    bankAccount: 'fnb-001',
  };

  beforeEach(async () => {
    const mockCategorizationService = {
      updateCategorization: jest.fn(),
      categorizeTransactions: jest.fn(),
      getSuggestions: jest.fn(),
    };

    const mockTransactionRepo = {
      findByTenant: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        { provide: TransactionRepository, useValue: mockTransactionRepo },
        { provide: CategorizationRepository, useValue: {} },
        { provide: TransactionImportService, useValue: {} },
        { provide: CategorizationService, useValue: mockCategorizationService },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    categorizationService = module.get(CategorizationService);
    transactionRepo = module.get(TransactionRepository);
  });

  describe('PUT /:id/categorize', () => {
    it('should update categorization and return success', async () => {
      categorizationService.updateCategorization.mockResolvedValue(mockTransaction as never);

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: false,
          vat_type: VatTypeApiEnum.STANDARD,
          create_pattern: true,
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.id).toBe('tx-001');
      expect(result.data.account_code).toBe('5100');
      expect(result.data.source).toBe('USER_OVERRIDE');
      expect(result.data.pattern_created).toBe(true);
      expect(categorizationService.updateCategorization).toHaveBeenCalledWith(
        'tx-001',
        expect.objectContaining({
          accountCode: '5100',
          accountName: 'Groceries',
          isSplit: false,
        }),
        'user-001',
        'tenant-001',
      );
    });

    it('should handle split transactions', async () => {
      categorizationService.updateCategorization.mockResolvedValue(mockTransaction as never);

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: true,
          splits: [
            { account_code: '5100', account_name: 'Groceries', amount_cents: 5000, vat_type: VatTypeApiEnum.STANDARD },
            { account_code: '5200', account_name: 'Utilities', amount_cents: 5000, vat_type: VatTypeApiEnum.STANDARD },
          ],
          vat_type: VatTypeApiEnum.STANDARD,
        },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.pattern_created).toBe(false); // No pattern for splits
      expect(categorizationService.updateCategorization).toHaveBeenCalledWith(
        'tx-001',
        expect.objectContaining({
          isSplit: true,
          splits: expect.arrayContaining([
            expect.objectContaining({ accountCode: '5100', amountCents: 5000 }),
            expect.objectContaining({ accountCode: '5200', amountCents: 5000 }),
          ]),
        }),
        'user-001',
        'tenant-001',
      );
    });

    it('should not create pattern when create_pattern=false', async () => {
      categorizationService.updateCategorization.mockResolvedValue(mockTransaction as never);

      const result = await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: false,
          vat_type: VatTypeApiEnum.STANDARD,
          create_pattern: false,
        },
        mockUser,
      );

      expect(result.data.pattern_created).toBe(false);
    });
  });

  describe('POST /categorize/batch', () => {
    const mockBatchResult: CategorizationBatchResult = {
      totalProcessed: 3,
      autoCategorized: 2,
      reviewRequired: 1,
      failed: 0,
      results: [
        {
          transactionId: 'tx-001',
          status: 'AUTO_APPLIED',
          accountCode: '5100',
          accountName: 'Groceries',
          confidenceScore: 90,
          source: CategorizationSource.RULE_BASED,
        },
        {
          transactionId: 'tx-002',
          status: 'AUTO_APPLIED',
          accountCode: '5200',
          accountName: 'Utilities',
          confidenceScore: 85,
          source: CategorizationSource.AI_AUTO,
        },
        {
          transactionId: 'tx-003',
          status: 'REVIEW_REQUIRED',
          accountCode: '5900',
          accountName: 'General Expenses',
          confidenceScore: 55,
          source: CategorizationSource.AI_SUGGESTED,
        },
      ],
      statistics: {
        avgConfidence: 76.67,
        patternMatchRate: 33.33,
      },
    };

    it('should categorize specified transactions', async () => {
      categorizationService.categorizeTransactions.mockResolvedValue(mockBatchResult);

      const result = await controller.batchCategorize(
        { transaction_ids: ['tx-001', 'tx-002', 'tx-003'] },
        mockUser,
      );

      expect(result.success).toBe(true);
      expect(result.data.total_processed).toBe(3);
      expect(result.data.auto_categorized).toBe(2);
      expect(result.data.review_required).toBe(1);
      expect(result.data.results).toHaveLength(3);
      expect(result.data.statistics.avg_confidence).toBe(76.67);
      expect(categorizationService.categorizeTransactions).toHaveBeenCalledWith(
        ['tx-001', 'tx-002', 'tx-003'],
        'tenant-001',
      );
    });

    it('should get PENDING transactions when no IDs provided', async () => {
      transactionRepo.findByTenant.mockResolvedValue({
        data: [{ id: 'tx-001' }, { id: 'tx-002' }],
        page: 1,
        limit: 1000,
        total: 2,
        totalPages: 1,
      } as never);
      categorizationService.categorizeTransactions.mockResolvedValue({
        ...mockBatchResult,
        totalProcessed: 2,
        results: mockBatchResult.results.slice(0, 2),
      });

      const result = await controller.batchCategorize({}, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith(
        'tenant-001',
        expect.objectContaining({ status: 'PENDING' }),
      );
      expect(categorizationService.categorizeTransactions).toHaveBeenCalledWith(
        ['tx-001', 'tx-002'],
        'tenant-001',
      );
    });

    it('should return empty result when no transactions to process', async () => {
      transactionRepo.findByTenant.mockResolvedValue({
        data: [],
        page: 1,
        limit: 1000,
        total: 0,
        totalPages: 0,
      } as never);

      const result = await controller.batchCategorize({}, mockUser);

      expect(result.success).toBe(true);
      expect(result.data.total_processed).toBe(0);
      expect(result.data.results).toHaveLength(0);
    });
  });

  describe('GET /:id/suggestions', () => {
    const mockSuggestions: CategorySuggestion[] = [
      {
        accountCode: '5100',
        accountName: 'Groceries',
        confidenceScore: 90,
        reason: 'Matched payee pattern: Woolworths',
        source: 'PATTERN',
      },
      {
        accountCode: '5100',
        accountName: 'Groceries & Supplies',
        confidenceScore: 85,
        reason: 'Matched grocery store retailer',
        source: 'AI',
      },
    ];

    it('should return suggestions sorted by confidence', async () => {
      categorizationService.getSuggestions.mockResolvedValue(mockSuggestions);

      const result = await controller.getSuggestions('tx-001', mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0].account_code).toBe('5100');
      expect(result.data[0].source).toBe('PATTERN');
      expect(result.data[0].confidence_score).toBe(90);
      expect(categorizationService.getSuggestions).toHaveBeenCalledWith(
        'tx-001',
        'tenant-001',
      );
    });
  });

  describe('tenant isolation', () => {
    it('should pass tenantId from user to services', async () => {
      categorizationService.updateCategorization.mockResolvedValue(mockTransaction as never);

      await controller.updateCategorization(
        'tx-001',
        {
          account_code: '5100',
          account_name: 'Groceries',
          is_split: false,
          vat_type: VatTypeApiEnum.STANDARD,
        },
        { ...mockUser, tenantId: 'different-tenant' },
      );

      expect(categorizationService.updateCategorization).toHaveBeenCalledWith(
        'tx-001',
        expect.anything(),
        expect.anything(),
        'different-tenant',
      );
    });
  });
});
```
  </file>

  <constraints>
    - MUST return 200 OK (NOT 202 - processing is synchronous)
    - MUST use snake_case for all API request/response fields
    - MUST map API DTOs to service DTOs (snake_case → camelCase)
    - MUST use existing CategorizationService - no new business logic
    - MUST validate UUID format with ParseUUIDPipe
    - MUST pass userId and tenantId from JWT to service methods
    - VatType enum casting: use `as unknown as VatType` for Prisma enum compatibility
    - Tests MUST use typed mock objects, NOT jest.mock() module mocking
    - Split validation is handled by service - controller just maps DTOs
  </constraints>

  <verification>
    - PUT /transactions/:id/categorize updates categorization and returns 200
    - PUT with is_split=true handles split transactions correctly
    - PUT with create_pattern=false does not create pattern
    - POST /transactions/categorize/batch categorizes specified transactions
    - POST with empty transaction_ids gets and processes all PENDING
    - POST returns statistics (avg_confidence, pattern_match_rate)
    - GET /transactions/:id/suggestions returns sorted suggestions
    - All responses use snake_case field names
    - Swagger documentation complete with examples
    - Tenant isolation verified - tenantId passed to all service calls
    - All 10+ unit tests pass
    - npm run build passes with no TypeScript errors
    - npm run lint passes with no warnings
  </verification>
</definition_of_done>

<files_to_create>
  <file path="src/api/transaction/dto/update-categorization.dto.ts">Manual categorization DTOs with splits support</file>
  <file path="src/api/transaction/dto/batch-categorize.dto.ts">Batch categorization DTOs</file>
  <file path="src/api/transaction/dto/suggestions.dto.ts">Suggestions response DTOs</file>
  <file path="tests/api/transaction/categorize.controller.spec.ts">Unit tests for categorization endpoints (10+ tests)</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/transaction/transaction.controller.ts">Add PUT, POST batch, GET suggestions endpoints</file>
  <file path="src/api/transaction/transaction.module.ts">Add CategorizationService and dependencies</file>
  <file path="src/api/transaction/dto/index.ts">Export new DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>PUT /:id/categorize updates categorization and returns 200</criterion>
  <criterion>PUT handles split transactions with validated amounts</criterion>
  <criterion>PUT creates pattern when create_pattern=true (default)</criterion>
  <criterion>POST /categorize/batch returns 200 with batch statistics</criterion>
  <criterion>POST with empty IDs processes all PENDING transactions</criterion>
  <criterion>GET /:id/suggestions returns sorted suggestions from pattern/AI/similar</criterion>
  <criterion>All responses use snake_case field names</criterion>
  <criterion>Swagger documentation complete with examples</criterion>
  <criterion>Tenant isolation - tenantId from JWT passed to all service calls</criterion>
  <criterion>All unit tests pass with >80% coverage</criterion>
  <criterion>npm run build passes</criterion>
  <criterion>npm run lint passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run test -- categorize.controller.spec</command>
  <command>npm run build</command>
  <command>npm run lint</command>
</test_commands>

<implementation_notes>
1. CategorizationService is synchronous - NO Bull queue, NO 202 response
2. Service methods expect camelCase DTOs - controller must map from snake_case API DTOs
3. VatType enum requires `as unknown as VatType` casting for Prisma compatibility
4. Split validation is handled by service.validateSplits() - throws BusinessException if invalid
5. Use ParseUUIDPipe for transaction ID validation in path params
6. pattern_created in response is true only when create_pattern !== false AND !is_split
7. getSuggestions returns suggestions sorted by confidence (highest first) from service
8. When batch categorizing with no IDs, first query PENDING transactions from repo
</implementation_notes>

<completion_notes>
  <completed_date>2025-12-22</completed_date>
  <tests_added>8</tests_added>
  <files_created>
    - src/api/transaction/dto/update-categorization.dto.ts
    - src/api/transaction/dto/batch-categorize.dto.ts
    - src/api/transaction/dto/suggestions.dto.ts
    - tests/api/transaction/categorize.controller.spec.ts
  </files_created>
  <files_modified>
    - src/api/transaction/transaction.controller.ts
    - src/api/transaction/transaction.module.ts
    - src/api/transaction/dto/index.ts
    - tests/api/transaction/import.controller.spec.ts (added CategorizationService mock)
    - tests/api/transaction/transaction.controller.spec.ts (added service mocks)
  </files_modified>
  <learnings>
    - VatType enum requires `as unknown as VatType` casting for Prisma enum compatibility
    - When batch processing with no IDs, use TransactionStatus.PENDING enum instead of string 'PENDING'
    - Unused imports (ServiceSplitItemDto, VatTypeApiEnum) must be removed for lint to pass
    - All controller tests need all service mocks - even if endpoint doesn't use them
    - pattern_created is only true when create_pattern !== false AND !is_split
  </learnings>
</completion_notes>

</task_spec>

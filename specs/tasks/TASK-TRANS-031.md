<task_spec id="TASK-TRANS-031" version="3.0">

<metadata>
  <title>Transaction Controller and DTOs</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>43</sequence>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-TRANS-011</task_ref>
    <task_ref status="complete">TASK-TRANS-012</task_ref>
    <task_ref status="complete">TASK-API-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-22</last_updated>
</metadata>

<critical_context>
## IMPORTANT: Current Project State (Verified 2025-12-22)

This task creates the Surface Layer transaction endpoints. All dependencies are COMPLETE.

### Directory Structure That EXISTS:
```
src/
├── app.module.ts                    # Imports ApiModule, global JwtAuthGuard + RolesGuard
├── main.ts                          # Global prefix: 'api/v1', Swagger at /api/docs
├── api/
│   ├── api.module.ts                # Currently only imports AuthModule - YOU WILL ADD TransactionModule
│   └── auth/
│       ├── auth.controller.ts       # Example controller pattern
│       ├── auth.service.ts
│       ├── guards/
│       │   ├── jwt-auth.guard.ts    # Global JWT guard - skips @Public() routes
│       │   └── roles.guard.ts       # Global roles guard - checks @Roles()
│       └── decorators/
│           ├── current-user.decorator.ts  # @CurrentUser() extracts IUser from request
│           ├── public.decorator.ts        # @Public() skips auth
│           └── roles.decorator.ts         # @Roles() requires specific roles
├── database/
│   ├── entities/                    # <-- Entity interfaces are HERE, NOT src/core/
│   │   ├── transaction.entity.ts    # ITransaction, TransactionStatus, ImportSource
│   │   ├── categorization.entity.ts # ICategorization, VatType, CategorizationSource
│   │   └── user.entity.ts           # IUser, UserRole (re-exported from Prisma)
│   ├── repositories/
│   │   ├── transaction.repository.ts  # TransactionRepository with findByTenant()
│   │   └── categorization.repository.ts # CategorizationRepository with findByTransaction()
│   ├── dto/
│   │   └── transaction.dto.ts       # TransactionFilterDto (internal - NOT for API)
│   ├── services/
│   │   ├── transaction-import.service.ts  # TASK-TRANS-011 - importFromFile()
│   │   └── categorization.service.ts      # TASK-TRANS-012 - categorizeTransactions()
│   └── prisma/
│       └── prisma.service.ts        # PrismaService
└── shared/
    └── exceptions/
        └── base.exception.ts        # AppException, NotFoundException, DatabaseException, etc.
```

### Critical Files You MUST Read Before Implementing:
1. `src/api/auth/auth.controller.ts` - Controller pattern with Swagger
2. `src/api/auth/decorators/current-user.decorator.ts` - @CurrentUser() usage
3. `src/database/repositories/transaction.repository.ts` - findByTenant() returns PaginatedResult
4. `src/database/entities/transaction.entity.ts` - TransactionStatus enum
5. `src/database/entities/categorization.entity.ts` - CategorizationSource enum

### Key Interfaces Already Defined:

**IUser (src/database/entities/user.entity.ts):**
```typescript
export interface IUser {
  id: string;
  tenantId: string;  // <-- Use this for tenant isolation
  auth0Id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
```

**TransactionStatus (src/database/entities/transaction.entity.ts):**
```typescript
export enum TransactionStatus {
  PENDING = 'PENDING',
  CATEGORIZED = 'CATEGORIZED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  SYNCED = 'SYNCED',
}
```

**CategorizationSource (src/database/entities/categorization.entity.ts):**
```typescript
export enum CategorizationSource {
  AI_AUTO = 'AI_AUTO',
  AI_SUGGESTED = 'AI_SUGGESTED',
  USER_OVERRIDE = 'USER_OVERRIDE',
  RULE_BASED = 'RULE_BASED',
}
```

**PaginatedResult (src/database/repositories/transaction.repository.ts):**
```typescript
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
```

**TransactionRepository.findByTenant() signature:**
```typescript
async findByTenant(
  tenantId: string,
  filter: TransactionFilterDto,
): Promise<PaginatedResult<Transaction>>
```

**TransactionFilterDto (src/database/dto/transaction.dto.ts):**
```typescript
export class TransactionFilterDto {
  status?: TransactionStatus;
  dateFrom?: Date;
  dateTo?: Date;
  isReconciled?: boolean;
  search?: string;
  page?: number = 1;
  limit?: number = 20;
}
```

### What Does NOT Exist Yet:
- `src/api/transaction/` directory - YOU CREATE THIS
- Any transaction API DTOs - YOU CREATE THESE
- Shared pagination DTO - YOU CREATE THIS in src/shared/dto/
</critical_context>

<scope>
  <in_scope>
    - Create src/api/transaction/ directory structure
    - Create TransactionController with GET /transactions endpoint
    - Create ListTransactionsQueryDto with validation (API layer)
    - Create TransactionResponseDto with Swagger annotations
    - Create TransactionListResponseDto with pagination meta
    - Create CategorizationResponseDto (nested in response)
    - Create PaginationMetaDto in src/shared/dto/
    - Create TransactionApiModule and register in ApiModule
    - Implement tenant isolation using @CurrentUser().tenantId
    - Fetch categorizations for each transaction from CategorizationRepository
    - Add Swagger documentation with examples
    - Write unit tests for controller
  </in_scope>
  <out_of_scope>
    - Transaction import endpoint (TASK-TRANS-032)
    - Categorization update endpoint (TASK-TRANS-033)
    - Modifying business logic in services/repositories
    - E2E tests (TASK-INT-001)
  </out_of_scope>
</scope>

<implementation_steps>

## Step 1: Create Directory Structure
```
src/api/transaction/
├── transaction.module.ts
├── transaction.controller.ts
└── dto/
    ├── index.ts
    ├── list-transactions.dto.ts
    ├── transaction-response.dto.ts
    └── categorization-response.dto.ts

src/shared/dto/
├── index.ts
└── pagination-meta.dto.ts
```

## Step 2: Create PaginationMetaDto (Reusable)

**File: src/shared/dto/pagination-meta.dto.ts**
```typescript
import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: 'Current page number' })
  page: number;

  @ApiProperty({ example: 20, description: 'Items per page' })
  limit: number;

  @ApiProperty({ example: 150, description: 'Total number of items' })
  total: number;

  @ApiProperty({ example: 8, description: 'Total number of pages' })
  totalPages: number;
}
```

**File: src/shared/dto/index.ts**
```typescript
export * from './pagination-meta.dto';
```

## Step 3: Create ListTransactionsQueryDto

**File: src/api/transaction/dto/list-transactions.dto.ts**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsOptional,
  IsInt,
  Min,
  Max,
  IsEnum,
  IsISO8601,
  IsString,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { TransactionStatus } from '../../../database/entities/transaction.entity';

export class ListTransactionsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 1,
    minimum: 1,
    description: 'Page number (1-based)',
    example: 1,
  })
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    default: 20,
    minimum: 1,
    maximum: 100,
    description: 'Items per page',
    example: 20,
  })
  limit?: number = 20;

  @IsOptional()
  @IsEnum(TransactionStatus)
  @ApiProperty({
    required: false,
    enum: TransactionStatus,
    description: 'Filter by transaction status',
    example: 'PENDING',
  })
  status?: TransactionStatus;

  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({
    required: false,
    description: 'Filter from date (inclusive, YYYY-MM-DD)',
    example: '2025-01-01',
  })
  date_from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @ApiProperty({
    required: false,
    description: 'Filter to date (inclusive, YYYY-MM-DD)',
    example: '2025-01-31',
  })
  date_to?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @ApiProperty({
    required: false,
    description: 'Filter by reconciliation status',
    example: false,
  })
  is_reconciled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({
    required: false,
    description: 'Search in description, payee name, or reference (case-insensitive)',
    example: 'Woolworths',
  })
  search?: string;
}
```

## Step 4: Create Response DTOs

**File: src/api/transaction/dto/categorization-response.dto.ts**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { CategorizationSource } from '../../../database/entities/categorization.entity';

export class CategorizationResponseDto {
  @ApiProperty({ example: '5100', description: 'Account code from chart of accounts' })
  account_code: string;

  @ApiProperty({ example: 'Groceries & Supplies', description: 'Account name' })
  account_name: string;

  @ApiProperty({ example: 92.5, description: 'AI confidence score (0-100)' })
  confidence_score: number;

  @ApiProperty({
    enum: CategorizationSource,
    example: 'AI_AUTO',
    description: 'Source of categorization',
  })
  source: CategorizationSource;

  @ApiProperty({
    required: false,
    description: 'When categorization was reviewed by user',
    example: '2025-01-15T10:30:00Z',
  })
  reviewed_at?: Date;
}
```

**File: src/api/transaction/dto/transaction-response.dto.ts**
```typescript
import { ApiProperty } from '@nestjs/swagger';
import { TransactionStatus } from '../../../database/entities/transaction.entity';
import { CategorizationResponseDto } from './categorization-response.dto';
import { PaginationMetaDto } from '../../../shared/dto';

export class TransactionResponseDto {
  @ApiProperty({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' })
  id: string;

  @ApiProperty({ example: '2025-01-15', description: 'Transaction date (YYYY-MM-DD)' })
  date: string;

  @ApiProperty({ example: 'DEBIT WOOLWORTHS FOOD 0012345' })
  description: string;

  @ApiProperty({ example: 'WOOLWORTHS', nullable: true })
  payee_name: string | null;

  @ApiProperty({ example: 'REF123456', nullable: true })
  reference: string | null;

  @ApiProperty({
    example: -125000,
    description: 'Amount in cents (negative for debits, positive for credits)',
  })
  amount_cents: number;

  @ApiProperty({ example: false, description: 'True if credit, false if debit' })
  is_credit: boolean;

  @ApiProperty({ enum: TransactionStatus, example: 'CATEGORIZED' })
  status: TransactionStatus;

  @ApiProperty({ example: false })
  is_reconciled: boolean;

  @ApiProperty({
    type: CategorizationResponseDto,
    required: false,
    description: 'Categorization details if categorized',
  })
  categorization?: CategorizationResponseDto;

  @ApiProperty({ example: '2025-01-15T08:00:00Z' })
  created_at: Date;
}

export class TransactionListResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: [TransactionResponseDto] })
  data: TransactionResponseDto[];

  @ApiProperty({ type: PaginationMetaDto })
  meta: PaginationMetaDto;
}
```

**File: src/api/transaction/dto/index.ts**
```typescript
export * from './list-transactions.dto';
export * from './transaction-response.dto';
export * from './categorization-response.dto';
```

## Step 5: Create Transaction Controller

**File: src/api/transaction/transaction.controller.ts**
```typescript
import { Controller, Get, Query, Logger, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { IUser } from '../../database/entities/user.entity';
import {
  ListTransactionsQueryDto,
  TransactionListResponseDto,
  TransactionResponseDto,
  CategorizationResponseDto,
} from './dto';

@Controller('transactions')
@ApiTags('Transactions')
@ApiBearerAuth('JWT-auth')
export class TransactionController {
  private readonly logger = new Logger(TransactionController.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'List transactions with filtering and pagination',
    description: 'Returns paginated list of transactions for the authenticated tenant',
  })
  @ApiResponse({
    status: 200,
    description: 'Transactions retrieved successfully',
    type: TransactionListResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing JWT token' })
  async listTransactions(
    @Query() query: ListTransactionsQueryDto,
    @CurrentUser() user: IUser,
  ): Promise<TransactionListResponseDto> {
    const tenantId = user.tenantId;

    this.logger.debug(
      `Listing transactions for tenant=${tenantId}, page=${query.page}, limit=${query.limit}`,
    );

    // Build filter for repository
    const filter = {
      status: query.status,
      dateFrom: query.date_from ? new Date(query.date_from) : undefined,
      dateTo: query.date_to ? new Date(query.date_to) : undefined,
      isReconciled: query.is_reconciled,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
    };

    // Fetch transactions
    const result = await this.transactionRepo.findByTenant(tenantId, filter);

    // Fetch categorizations for all transactions in batch
    const transactionIds = result.data.map((tx) => tx.id);
    const categorizationMap = new Map<string, CategorizationResponseDto>();

    for (const txId of transactionIds) {
      const cats = await this.categorizationRepo.findByTransaction(txId);
      if (cats.length > 0) {
        // Use most recent non-split categorization, or first if all are splits
        const primary = cats.find((c) => !c.isSplit) ?? cats[0];
        categorizationMap.set(txId, {
          account_code: primary.accountCode,
          account_name: primary.accountName,
          confidence_score: primary.confidenceScore,
          source: primary.source,
          reviewed_at: primary.reviewedAt ?? undefined,
        });
      }
    }

    // Transform to response DTOs
    const data: TransactionResponseDto[] = result.data.map((tx) => ({
      id: tx.id,
      date: tx.date.toISOString().split('T')[0],
      description: tx.description,
      payee_name: tx.payeeName,
      reference: tx.reference,
      amount_cents: tx.amountCents,
      is_credit: tx.isCredit,
      status: tx.status as TransactionStatus,
      is_reconciled: tx.isReconciled,
      categorization: categorizationMap.get(tx.id),
      created_at: tx.createdAt,
    }));

    return {
      success: true,
      data,
      meta: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }
}

// Re-export for type inference
import { TransactionStatus } from '../../database/entities/transaction.entity';
```

## Step 6: Create Transaction Module

**File: src/api/transaction/transaction.module.ts**
```typescript
import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [TransactionController],
  providers: [TransactionRepository, CategorizationRepository],
})
export class TransactionModule {}
```

## Step 7: Update ApiModule

**File: src/api/api.module.ts** (MODIFY)
```typescript
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';

@Module({
  imports: [AuthModule, TransactionModule],
  exports: [AuthModule, TransactionModule],
})
export class ApiModule {}
```

## Step 8: Write Unit Tests

**File: tests/api/transaction/transaction.controller.spec.ts**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { TransactionController } from '../../../src/api/transaction/transaction.controller';
import { TransactionRepository } from '../../../src/database/repositories/transaction.repository';
import { CategorizationRepository } from '../../../src/database/repositories/categorization.repository';
import { IUser, UserRole } from '../../../src/database/entities/user.entity';
import { TransactionStatus } from '../../../src/database/entities/transaction.entity';
import { CategorizationSource } from '../../../src/database/entities/categorization.entity';

describe('TransactionController', () => {
  let controller: TransactionController;
  let transactionRepo: TransactionRepository;
  let categorizationRepo: CategorizationRepository;

  const mockUser: IUser = {
    id: 'user-123',
    tenantId: 'tenant-456',
    auth0Id: 'auth0|123',
    email: 'test@creche.co.za',
    name: 'Test User',
    role: UserRole.OWNER,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTransaction = {
    id: 'tx-001',
    tenantId: 'tenant-456',
    xeroTransactionId: null,
    bankAccount: 'CHEQUE',
    date: new Date('2025-01-15'),
    description: 'WOOLWORTHS FOOD',
    payeeName: 'WOOLWORTHS',
    reference: 'REF123',
    amountCents: -15000,
    isCredit: false,
    source: 'CSV_IMPORT',
    importBatchId: 'batch-001',
    status: TransactionStatus.CATEGORIZED,
    isReconciled: false,
    reconciledAt: null,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCategorization = {
    id: 'cat-001',
    transactionId: 'tx-001',
    accountCode: '5100',
    accountName: 'Groceries',
    confidenceScore: 92,
    reasoning: 'Matched grocery store',
    source: CategorizationSource.AI_AUTO,
    isSplit: false,
    splitAmountCents: null,
    vatAmountCents: 1957,
    vatType: 'STANDARD',
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TransactionController],
      providers: [
        {
          provide: TransactionRepository,
          useValue: {
            findByTenant: jest.fn(),
          },
        },
        {
          provide: CategorizationRepository,
          useValue: {
            findByTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<TransactionController>(TransactionController);
    transactionRepo = module.get<TransactionRepository>(TransactionRepository);
    categorizationRepo = module.get<CategorizationRepository>(CategorizationRepository);
  });

  describe('listTransactions', () => {
    it('should return paginated transactions with default params', async () => {
      const paginatedResult = {
        data: [mockTransaction],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      };

      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);
      jest.spyOn(categorizationRepo, 'findByTransaction').mockResolvedValue([mockCategorization]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('tx-001');
      expect(result.data[0].categorization?.account_code).toBe('5100');
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.any(Object));
    });

    it('should apply status filter', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      await controller.listTransactions({ status: TransactionStatus.PENDING }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.objectContaining({
        status: TransactionStatus.PENDING,
      }));
    });

    it('should apply date range filters', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      await controller.listTransactions({
        date_from: '2025-01-01',
        date_to: '2025-01-31',
      }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.objectContaining({
        dateFrom: new Date('2025-01-01'),
        dateTo: new Date('2025-01-31'),
      }));
    });

    it('should apply search filter', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      await controller.listTransactions({ search: 'woolworths' }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.objectContaining({
        search: 'woolworths',
      }));
    });

    it('should apply is_reconciled filter', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      await controller.listTransactions({ is_reconciled: true }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.objectContaining({
        isReconciled: true,
      }));
    });

    it('should apply pagination params', async () => {
      const paginatedResult = { data: [], total: 100, page: 3, limit: 10, totalPages: 10 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      const result = await controller.listTransactions({ page: 3, limit: 10 }, mockUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('tenant-456', expect.objectContaining({
        page: 3,
        limit: 10,
      }));
      expect(result.meta.page).toBe(3);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.totalPages).toBe(10);
    });

    it('should handle transaction without categorization', async () => {
      const uncategorizedTx = { ...mockTransaction, status: TransactionStatus.PENDING };
      const paginatedResult = { data: [uncategorizedTx], total: 1, page: 1, limit: 20, totalPages: 1 };

      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);
      jest.spyOn(categorizationRepo, 'findByTransaction').mockResolvedValue([]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.data[0].categorization).toBeUndefined();
    });

    it('should format date as YYYY-MM-DD string', async () => {
      const paginatedResult = { data: [mockTransaction], total: 1, page: 1, limit: 20, totalPages: 1 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);
      jest.spyOn(categorizationRepo, 'findByTransaction').mockResolvedValue([]);

      const result = await controller.listTransactions({}, mockUser);

      expect(result.data[0].date).toBe('2025-01-15');
    });

    it('should enforce tenant isolation', async () => {
      const paginatedResult = { data: [], total: 0, page: 1, limit: 20, totalPages: 0 };
      jest.spyOn(transactionRepo, 'findByTenant').mockResolvedValue(paginatedResult);

      const differentUser = { ...mockUser, tenantId: 'other-tenant' };
      await controller.listTransactions({}, differentUser);

      expect(transactionRepo.findByTenant).toHaveBeenCalledWith('other-tenant', expect.any(Object));
    });
  });
});
```

</implementation_steps>

<definition_of_done>
  <constraints>
    - All DTOs MUST use class-validator decorators with @Type/@Transform for query params
    - All response DTOs MUST have @ApiProperty with example values
    - Controller MUST use @CurrentUser() to get tenantId - NEVER accept tenantId from query/body
    - Dates in response MUST be YYYY-MM-DD format (transaction date) or ISO 8601 (timestamps)
    - Amounts MUST be in cents (integer) - NOT converted to decimal
    - Search MUST be case-insensitive (repository already handles this)
    - Pagination defaults: page=1, limit=20, max limit=100
    - Boolean query params MUST handle string 'true'/'false' via @Transform
    - Controller MUST NOT contain business logic - only transformation
    - NO backwards compatibility workarounds - fail fast if something is wrong
    - NO mock data in tests - use typed mock objects matching real interfaces
  </constraints>

  <verification>
    - GET /api/v1/transactions returns 200 with paginated data
    - Default pagination works (page=1, limit=20)
    - All filters work: status, date_from, date_to, is_reconciled, search
    - Search is case-insensitive and matches description, payeeName, reference
    - Tenant isolation enforced (only returns own transactions)
    - Categorization data included when present
    - Meta includes page, limit, total, totalPages
    - Swagger docs show all query parameters with examples at /api/docs
    - All tests pass: npm run test -- transaction.controller.spec
    - Build passes: npm run build
  </verification>
</definition_of_done>

<files_to_create>
  <file path="src/shared/dto/pagination-meta.dto.ts">Reusable pagination metadata DTO</file>
  <file path="src/shared/dto/index.ts">Export barrel for shared DTOs</file>
  <file path="src/api/transaction/dto/list-transactions.dto.ts">Query parameters DTO with validation</file>
  <file path="src/api/transaction/dto/categorization-response.dto.ts">Categorization nested response DTO</file>
  <file path="src/api/transaction/dto/transaction-response.dto.ts">Transaction response DTO with categorization</file>
  <file path="src/api/transaction/dto/index.ts">Export barrel for transaction DTOs</file>
  <file path="src/api/transaction/transaction.controller.ts">Transaction controller with GET endpoint</file>
  <file path="src/api/transaction/transaction.module.ts">Transaction API module</file>
  <file path="tests/api/transaction/transaction.controller.spec.ts">Controller unit tests (8+ tests)</file>
</files_to_create>

<files_to_modify>
  <file path="src/api/api.module.ts">Add TransactionModule to imports and exports</file>
</files_to_modify>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- transaction.controller.spec</command>
  <command>npm run start:dev</command>
  <command>curl -H "Authorization: Bearer TOKEN" http://localhost:3000/api/v1/transactions</command>
  <command>curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/transactions?status=PENDING"</command>
  <command>curl -H "Authorization: Bearer TOKEN" "http://localhost:3000/api/v1/transactions?search=woolworths&amp;date_from=2025-01-01"</command>
</test_commands>

<error_handling>
## Expected Error Responses

1. **401 Unauthorized** - Missing or invalid JWT token (handled by global JwtAuthGuard)
2. **400 Bad Request** - Invalid query parameters (handled by ValidationPipe)
3. **500 Internal Server Error** - Database errors (thrown by repository, caught by NestJS)

All errors use the standard AppException format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message",
    "details": { ... }
  }
}
```

DO NOT catch and transform errors in the controller. Let exceptions propagate to be handled by NestJS exception filters.
</error_handling>

<reasoning_modes>
When implementing this task, use these reasoning approaches:

1. **Pattern Recognition** - Look at src/api/auth/auth.controller.ts for controller patterns
2. **Dependency Analysis** - Trace imports from entities -> repositories -> controller
3. **Type Checking** - Ensure all types match between Prisma models and DTOs
4. **Validation Testing** - Verify class-validator decorators work with query params
5. **Integration Verification** - Confirm module wiring in ApiModule

Subagents should first read the referenced files, then implement step-by-step following the implementation_steps section.
</reasoning_modes>

</task_spec>

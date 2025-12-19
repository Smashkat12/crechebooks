<task_spec id="TASK-CORE-002" version="2.0">

<metadata>
  <title>Tenant Entity and Migration</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>2</sequence>
  <implements>
    <requirement_ref>NFR-SCAL-001</requirement_ref>
    <requirement_ref>NFR-SEC-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETED">TASK-CORE-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<critical_context>
## COMPLETED: TASK-CORE-001 (Foundation)
The following is already implemented and MUST NOT be recreated:

### Existing Project Structure
```
crechebooks/
├── src/
│   ├── app.module.ts              # Root module - imports ConfigModule, HealthModule
│   ├── main.ts                    # Bootstrap with fail-fast pattern
│   ├── config/
│   │   ├── config.module.ts       # NestJS ConfigModule setup
│   │   ├── configuration.ts       # Environment config with validation
│   │   └── index.ts               # Exports
│   ├── health/
│   │   ├── health.controller.ts   # GET /health endpoint
│   │   └── health.module.ts
│   └── shared/
│       ├── constants/index.ts     # VAT_RATE (0.15), TIMEZONE, etc.
│       ├── exceptions/            # AppException, ValidationException, etc.
│       ├── interfaces/index.ts    # IBaseEntity, IMoney, etc.
│       └── utils/
│           ├── decimal.util.ts    # Money class with banker's rounding
│           ├── date.util.ts       # DateUtil for Africa/Johannesburg
│           └── index.ts
├── prisma/
│   └── schema.prisma              # Base schema (NO MODELS YET)
├── prisma.config.ts               # Prisma 7 datasource config (DATABASE_URL)
├── tests/
│   └── shared/utils/              # 62 Money utility tests
├── test/
│   └── app.e2e-spec.ts            # Health endpoint e2e test
├── package.json                   # pnpm, NestJS 11, Prisma 7
└── .env.example                   # Environment template
```

### Key Technical Details (DO NOT CHANGE)
- **Package Manager**: pnpm (NOT npm)
- **NestJS Version**: 11.x
- **Prisma Version**: 7.x (uses prisma.config.ts, NOT url in schema)
- **Database**: PostgreSQL via DATABASE_URL env var
- **Money**: Decimal.js with banker's rounding, stored as cents
- **Timezone**: Africa/Johannesburg (SAST)
- **VAT Rate**: 15% (South African)

### Prisma 7 Configuration Pattern
The project uses Prisma 7 which has BREAKING CHANGES from older versions:
- Database URL is in `prisma.config.ts`, NOT in `schema.prisma`
- Schema uses `@map("table_name")` for snake_case table names
- Use `npx prisma` commands (NOT `npx prisma generate`)
</critical_context>

<context>
This task creates the Tenant entity - the FIRST database model in CrecheBooks.
Every other entity will have a tenant_id foreign key for multi-tenancy.
The tenant represents a single creche organization with business details,
Xero connection, and configuration.

This task also creates the PrismaModule and PrismaService which are required
for all subsequent database operations.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Tenant</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="prisma_config">prisma.config.ts</file>
</input_context_files>

<prerequisites>
  <check status="DONE">TASK-CORE-001 completed</check>
  <check>PostgreSQL database running and accessible</check>
  <check>DATABASE_URL set in .env file</check>
  <check>Run: pnpm install (ensure dependencies current)</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PrismaModule and PrismaService (REQUIRED FIRST)
    - Add Tenant model to prisma/schema.prisma
    - Add TaxStatus and SubscriptionStatus enums to schema
    - Run Prisma migration to create tenants table
    - Create TypeScript interface ITenant
    - Create CreateTenantDto and UpdateTenantDto with class-validator
    - Create TenantRepository with CRUD operations
    - Create integration tests with REAL database (no mocks)
  </in_scope>
  <out_of_scope>
    - User entity (TASK-CORE-003)
    - Business logic for tenant management
    - API endpoints
    - Row-level security (future task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      enum TaxStatus {
        VAT_REGISTERED
        NOT_REGISTERED
      }

      enum SubscriptionStatus {
        TRIAL
        ACTIVE
        SUSPENDED
        CANCELLED
      }

      model Tenant {
        id                   String   @id @default(uuid())
        name                 String   @db.VarChar(200)
        tradingName          String?  @map("trading_name") @db.VarChar(200)
        registrationNumber   String?  @map("registration_number") @db.VarChar(50)
        vatNumber            String?  @map("vat_number") @db.VarChar(20)
        taxStatus            TaxStatus @default(NOT_REGISTERED) @map("tax_status")
        addressLine1         String   @map("address_line1") @db.VarChar(200)
        addressLine2         String?  @map("address_line2") @db.VarChar(200)
        city                 String   @db.VarChar(100)
        province             String   @db.VarChar(50)
        postalCode           String   @map("postal_code") @db.VarChar(10)
        phone                String   @db.VarChar(20)
        email                String   @unique @db.VarChar(255)
        xeroTenantId         String?  @unique @map("xero_tenant_id") @db.VarChar(50)
        subscriptionStatus   SubscriptionStatus @default(TRIAL) @map("subscription_status")
        invoiceDayOfMonth    Int      @default(1) @map("invoice_day_of_month")
        invoiceDueDays       Int      @default(7) @map("invoice_due_days")
        createdAt            DateTime @default(now()) @map("created_at")
        updatedAt            DateTime @updatedAt @map("updated_at")

        @@map("tenants")
      }
    </signature>
    <signature file="src/database/prisma/prisma.service.ts">
      @Injectable()
      export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
        async onModuleInit(): Promise&lt;void&gt;
        async onModuleDestroy(): Promise&lt;void&gt;
      }
    </signature>
    <signature file="src/database/prisma/prisma.module.ts">
      @Global()
      @Module({
        providers: [PrismaService],
        exports: [PrismaService],
      })
      export class PrismaModule {}
    </signature>
    <signature file="src/database/entities/tenant.entity.ts">
      export enum TaxStatus {
        VAT_REGISTERED = 'VAT_REGISTERED',
        NOT_REGISTERED = 'NOT_REGISTERED',
      }
      export enum SubscriptionStatus {
        TRIAL = 'TRIAL',
        ACTIVE = 'ACTIVE',
        SUSPENDED = 'SUSPENDED',
        CANCELLED = 'CANCELLED',
      }
      export interface ITenant {
        id: string;
        name: string;
        tradingName: string | null;
        registrationNumber: string | null;
        vatNumber: string | null;
        taxStatus: TaxStatus;
        addressLine1: string;
        addressLine2: string | null;
        city: string;
        province: string;
        postalCode: string;
        phone: string;
        email: string;
        xeroTenantId: string | null;
        subscriptionStatus: SubscriptionStatus;
        invoiceDayOfMonth: number;
        invoiceDueDays: number;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/tenant.dto.ts">
      export class CreateTenantDto {
        @IsString() @MinLength(1) @MaxLength(200) name: string;
        @IsOptional() @IsString() @MaxLength(200) tradingName?: string;
        @IsEmail() email: string;
        // ... all fields with proper validation
      }
      export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
    </signature>
    <signature file="src/database/repositories/tenant.repository.ts">
      @Injectable()
      export class TenantRepository {
        constructor(private readonly prisma: PrismaService) {}
        async create(dto: CreateTenantDto): Promise&lt;Tenant&gt;
        async findById(id: string): Promise&lt;Tenant | null&gt;
        async findByEmail(email: string): Promise&lt;Tenant | null&gt;
        async findByXeroTenantId(xeroId: string): Promise&lt;Tenant | null&gt;
        async update(id: string, dto: UpdateTenantDto): Promise&lt;Tenant&gt;
        async findAll(): Promise&lt;Tenant[]&gt;
      }
    </signature>
  </signatures>

  <constraints>
    - MUST use UUID for primary key (not auto-increment)
    - MUST use @map() for snake_case column names
    - MUST use @@map("tenants") for snake_case table name
    - MUST NOT use 'any' type anywhere
    - MUST throw errors on invalid input (fail-fast, no fallbacks)
    - MUST log errors with full context before re-throwing
    - Email MUST be unique
    - xeroTenantId MUST be unique when not null
    - invoiceDayOfMonth MUST be between 1 and 28
    - Tests MUST use real database, NOT mocks
  </constraints>

  <verification>
    - npx prisma migrate dev --name create_tenants (creates migration)
    - npx prisma migrate reset (reverts and reapplies successfully)
    - pnpm run build (compiles without errors)
    - pnpm run lint (passes with no warnings)
    - pnpm run test (all tests pass including new repository tests)
    - pnpm run test:e2e (e2e tests pass)
  </verification>
</definition_of_done>

<implementation_steps>

## STEP 1: Create PrismaModule and PrismaService

Create `src/database/prisma/prisma.service.ts`:
```typescript
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('Database connection established');
    } catch (error) {
      this.logger.error('Failed to connect to database', error instanceof Error ? error.stack : error);
      throw error; // FAIL FAST - do not swallow errors
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Database connection closed');
  }
}
```

Create `src/database/prisma/prisma.module.ts`:
```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Create `src/database/prisma/index.ts`:
```typescript
export { PrismaModule } from './prisma.module';
export { PrismaService } from './prisma.service';
```

## STEP 2: Update AppModule

Update `src/app.module.ts` to import PrismaModule:
```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
```

## STEP 3: Update Prisma Schema

Update `prisma/schema.prisma`:
```prisma
// CrecheBooks Prisma Schema

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
}

// ============================================
// ENUMS
// ============================================

enum TaxStatus {
  VAT_REGISTERED
  NOT_REGISTERED
}

enum SubscriptionStatus {
  TRIAL
  ACTIVE
  SUSPENDED
  CANCELLED
}

// ============================================
// MODELS
// ============================================

model Tenant {
  id                   String             @id @default(uuid())
  name                 String             @db.VarChar(200)
  tradingName          String?            @map("trading_name") @db.VarChar(200)
  registrationNumber   String?            @map("registration_number") @db.VarChar(50)
  vatNumber            String?            @map("vat_number") @db.VarChar(20)
  taxStatus            TaxStatus          @default(NOT_REGISTERED) @map("tax_status")
  addressLine1         String             @map("address_line1") @db.VarChar(200)
  addressLine2         String?            @map("address_line2") @db.VarChar(200)
  city                 String             @db.VarChar(100)
  province             String             @db.VarChar(50)
  postalCode           String             @map("postal_code") @db.VarChar(10)
  phone                String             @db.VarChar(20)
  email                String             @unique @db.VarChar(255)
  xeroTenantId         String?            @unique @map("xero_tenant_id") @db.VarChar(50)
  subscriptionStatus   SubscriptionStatus @default(TRIAL) @map("subscription_status")
  invoiceDayOfMonth    Int                @default(1) @map("invoice_day_of_month")
  invoiceDueDays       Int                @default(7) @map("invoice_due_days")
  createdAt            DateTime           @default(now()) @map("created_at")
  updatedAt            DateTime           @updatedAt @map("updated_at")

  @@map("tenants")
}
```

## STEP 4: Run Migration

```bash
# Generate Prisma client and create migration
npx prisma migrate dev --name create_tenants

# Verify migration can be reset
npx prisma migrate reset --force
```

## STEP 5: Create Entity Interface

Create `src/database/entities/tenant.entity.ts`:
```typescript
export enum TaxStatus {
  VAT_REGISTERED = 'VAT_REGISTERED',
  NOT_REGISTERED = 'NOT_REGISTERED',
}

export enum SubscriptionStatus {
  TRIAL = 'TRIAL',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
}

export interface ITenant {
  id: string;
  name: string;
  tradingName: string | null;
  registrationNumber: string | null;
  vatNumber: string | null;
  taxStatus: TaxStatus;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  province: string;
  postalCode: string;
  phone: string;
  email: string;
  xeroTenantId: string | null;
  subscriptionStatus: SubscriptionStatus;
  invoiceDayOfMonth: number;
  invoiceDueDays: number;
  createdAt: Date;
  updatedAt: Date;
}
```

Create `src/database/entities/index.ts`:
```typescript
export * from './tenant.entity';
```

## STEP 6: Create DTOs

Create `src/database/dto/tenant.dto.ts`:
```typescript
import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';
import { TaxStatus, SubscriptionStatus } from '../entities/tenant.entity';

export class CreateTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  tradingName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  vatNumber?: string;

  @IsOptional()
  @IsEnum(TaxStatus)
  taxStatus?: TaxStatus;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  province!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(10)
  postalCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  phone!: string;

  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  xeroTenantId?: string;

  @IsOptional()
  @IsEnum(SubscriptionStatus)
  subscriptionStatus?: SubscriptionStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  invoiceDayOfMonth?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  invoiceDueDays?: number;
}

export class UpdateTenantDto extends PartialType(CreateTenantDto) {}
```

Create `src/database/dto/index.ts`:
```typescript
export * from './tenant.dto';
```

## STEP 7: Create Repository

Create `src/database/repositories/tenant.repository.ts`:
```typescript
import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto, UpdateTenantDto } from '../dto/tenant.dto';
import { NotFoundException, ConflictException, DatabaseException } from '../../shared/exceptions';

@Injectable()
export class TenantRepository {
  private readonly logger = new Logger(TenantRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    try {
      return await this.prisma.tenant.create({
        data: dto,
      });
    } catch (error) {
      this.logger.error(`Failed to create tenant: ${JSON.stringify(dto)}`, error instanceof Error ? error.stack : error);

      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new ConflictException('Tenant with this email already exists');
      }
      throw new DatabaseException('create', 'Failed to create tenant', error instanceof Error ? error : undefined);
    }
  }

  async findById(id: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { id },
      });
    } catch (error) {
      this.logger.error(`Failed to find tenant by id: ${id}`, error instanceof Error ? error.stack : error);
      throw new DatabaseException('findById', 'Failed to find tenant', error instanceof Error ? error : undefined);
    }
  }

  async findByIdOrThrow(id: string): Promise<Tenant> {
    const tenant = await this.findById(id);
    if (!tenant) {
      throw new NotFoundException('Tenant', id);
    }
    return tenant;
  }

  async findByEmail(email: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { email },
      });
    } catch (error) {
      this.logger.error(`Failed to find tenant by email: ${email}`, error instanceof Error ? error.stack : error);
      throw new DatabaseException('findByEmail', 'Failed to find tenant', error instanceof Error ? error : undefined);
    }
  }

  async findByXeroTenantId(xeroTenantId: string): Promise<Tenant | null> {
    try {
      return await this.prisma.tenant.findUnique({
        where: { xeroTenantId },
      });
    } catch (error) {
      this.logger.error(`Failed to find tenant by xeroTenantId: ${xeroTenantId}`, error instanceof Error ? error.stack : error);
      throw new DatabaseException('findByXeroTenantId', 'Failed to find tenant', error instanceof Error ? error : undefined);
    }
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    try {
      // First verify tenant exists
      await this.findByIdOrThrow(id);

      return await this.prisma.tenant.update({
        where: { id },
        data: dto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to update tenant ${id}: ${JSON.stringify(dto)}`, error instanceof Error ? error.stack : error);

      if (error instanceof Error && error.message.includes('Unique constraint')) {
        throw new ConflictException('Email already in use by another tenant');
      }
      throw new DatabaseException('update', 'Failed to update tenant', error instanceof Error ? error : undefined);
    }
  }

  async findAll(): Promise<Tenant[]> {
    try {
      return await this.prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Failed to find all tenants', error instanceof Error ? error.stack : error);
      throw new DatabaseException('findAll', 'Failed to find tenants', error instanceof Error ? error : undefined);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.findByIdOrThrow(id);
      await this.prisma.tenant.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Failed to delete tenant: ${id}`, error instanceof Error ? error.stack : error);
      throw new DatabaseException('delete', 'Failed to delete tenant', error instanceof Error ? error : undefined);
    }
  }
}
```

Create `src/database/repositories/index.ts`:
```typescript
export * from './tenant.repository';
```

## STEP 8: Create Database Module

Create `src/database/database.module.ts`:
```typescript
import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';

@Module({
  providers: [TenantRepository],
  exports: [TenantRepository],
})
export class DatabaseModule {}
```

Create `src/database/index.ts`:
```typescript
export * from './database.module';
export * from './prisma';
export * from './entities';
export * from './dto';
export * from './repositories';
```

## STEP 9: Create Tests (REAL DATABASE - NO MOCKS)

Create `tests/database/repositories/tenant.repository.spec.ts`:
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { CreateTenantDto } from '../../../src/database/dto/tenant.dto';
import { TaxStatus, SubscriptionStatus } from '../../../src/database/entities/tenant.entity';
import { NotFoundException, ConflictException } from '../../../src/shared/exceptions';

describe('TenantRepository', () => {
  let repository: TenantRepository;
  let prisma: PrismaService;

  // Real test data - South African creche
  const testTenantData: CreateTenantDto = {
    name: 'Little Stars Creche',
    tradingName: 'Little Stars ECD',
    registrationNumber: '2024/123456/07',
    vatNumber: '4123456789',
    taxStatus: TaxStatus.VAT_REGISTERED,
    addressLine1: '123 Main Street',
    addressLine2: 'Sandton Central',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: '2196',
    phone: '+27114561234',
    email: 'admin@littlestars.co.za',
    invoiceDayOfMonth: 1,
    invoiceDueDays: 7,
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, TenantRepository],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    repository = module.get<TenantRepository>(TenantRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Clean up before each test
    await prisma.tenant.deleteMany();
  });

  describe('create', () => {
    it('should create a new tenant with all fields', async () => {
      const tenant = await repository.create(testTenantData);

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe(testTenantData.name);
      expect(tenant.tradingName).toBe(testTenantData.tradingName);
      expect(tenant.email).toBe(testTenantData.email);
      expect(tenant.taxStatus).toBe(TaxStatus.VAT_REGISTERED);
      expect(tenant.subscriptionStatus).toBe(SubscriptionStatus.TRIAL);
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.updatedAt).toBeInstanceOf(Date);
    });

    it('should create tenant with minimum required fields', async () => {
      const minimalData: CreateTenantDto = {
        name: 'Minimal Creche',
        addressLine1: '1 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8001',
        phone: '+27211234567',
        email: 'test@minimal.co.za',
      };

      const tenant = await repository.create(minimalData);

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe(minimalData.name);
      expect(tenant.taxStatus).toBe(TaxStatus.NOT_REGISTERED); // default
      expect(tenant.subscriptionStatus).toBe(SubscriptionStatus.TRIAL); // default
      expect(tenant.invoiceDayOfMonth).toBe(1); // default
      expect(tenant.invoiceDueDays).toBe(7); // default
    });

    it('should throw ConflictException for duplicate email', async () => {
      await repository.create(testTenantData);

      await expect(repository.create(testTenantData)).rejects.toThrow(ConflictException);
    });
  });

  describe('findById', () => {
    it('should find tenant by id', async () => {
      const created = await repository.create(testTenantData);
      const found = await repository.findById(created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.email).toBe(testTenantData.email);
    });

    it('should return null for non-existent id', async () => {
      const found = await repository.findById('00000000-0000-0000-0000-000000000000');
      expect(found).toBeNull();
    });
  });

  describe('findByIdOrThrow', () => {
    it('should throw NotFoundException for non-existent id', async () => {
      await expect(
        repository.findByIdOrThrow('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findByEmail', () => {
    it('should find tenant by email', async () => {
      await repository.create(testTenantData);
      const found = await repository.findByEmail(testTenantData.email);

      expect(found).not.toBeNull();
      expect(found?.email).toBe(testTenantData.email);
    });

    it('should return null for non-existent email', async () => {
      const found = await repository.findByEmail('nonexistent@test.com');
      expect(found).toBeNull();
    });
  });

  describe('findByXeroTenantId', () => {
    it('should find tenant by xeroTenantId', async () => {
      const dataWithXero = { ...testTenantData, xeroTenantId: 'xero-12345' };
      await repository.create(dataWithXero);

      const found = await repository.findByXeroTenantId('xero-12345');

      expect(found).not.toBeNull();
      expect(found?.xeroTenantId).toBe('xero-12345');
    });

    it('should return null for non-existent xeroTenantId', async () => {
      const found = await repository.findByXeroTenantId('nonexistent');
      expect(found).toBeNull();
    });
  });

  describe('update', () => {
    it('should update tenant fields', async () => {
      const created = await repository.create(testTenantData);

      const updated = await repository.update(created.id, {
        name: 'Updated Stars Creche',
        taxStatus: TaxStatus.NOT_REGISTERED,
      });

      expect(updated.name).toBe('Updated Stars Creche');
      expect(updated.taxStatus).toBe(TaxStatus.NOT_REGISTERED);
      expect(updated.email).toBe(testTenantData.email); // unchanged
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        repository.update('00000000-0000-0000-0000-000000000000', { name: 'Test' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return all tenants ordered by createdAt desc', async () => {
      const tenant1 = await repository.create(testTenantData);
      const tenant2 = await repository.create({
        ...testTenantData,
        email: 'second@test.co.za',
        name: 'Second Creche',
      });

      const all = await repository.findAll();

      expect(all).toHaveLength(2);
      expect(all[0].id).toBe(tenant2.id); // newer first
      expect(all[1].id).toBe(tenant1.id);
    });

    it('should return empty array when no tenants exist', async () => {
      const all = await repository.findAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('should delete existing tenant', async () => {
      const created = await repository.create(testTenantData);

      await repository.delete(created.id);

      const found = await repository.findById(created.id);
      expect(found).toBeNull();
    });

    it('should throw NotFoundException for non-existent tenant', async () => {
      await expect(
        repository.delete('00000000-0000-0000-0000-000000000000')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
```

</implementation_steps>

<files_to_create>
  <file path="src/database/prisma/prisma.service.ts">Prisma service with lifecycle hooks</file>
  <file path="src/database/prisma/prisma.module.ts">Global Prisma module</file>
  <file path="src/database/prisma/index.ts">Prisma exports</file>
  <file path="src/database/entities/tenant.entity.ts">Tenant interface and enums</file>
  <file path="src/database/entities/index.ts">Entity exports</file>
  <file path="src/database/dto/tenant.dto.ts">Create and Update DTOs with validation</file>
  <file path="src/database/dto/index.ts">DTO exports</file>
  <file path="src/database/repositories/tenant.repository.ts">Tenant repository</file>
  <file path="src/database/repositories/index.ts">Repository exports</file>
  <file path="src/database/database.module.ts">Database module</file>
  <file path="src/database/index.ts">Database exports</file>
  <file path="tests/database/repositories/tenant.repository.spec.ts">Repository integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Tenant model and enums</file>
  <file path="src/app.module.ts">Import PrismaModule</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates tenants table with all columns per tech spec</criterion>
  <criterion>Migration can be reverted with: npx prisma migrate reset --force</criterion>
  <criterion>Tenant entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraints on email and xeroTenantId work</criterion>
  <criterion>Repository CRUD operations work with real database</criterion>
  <criterion>All tests pass WITHOUT using mocks</criterion>
</validation_criteria>

<test_commands>
  <command description="Install dependencies">pnpm install</command>
  <command description="Generate Prisma client">npx prisma generate</command>
  <command description="Create migration">npx prisma migrate dev --name create_tenants</command>
  <command description="Verify migration reversibility">npx prisma migrate reset --force</command>
  <command description="Build project">pnpm run build</command>
  <command description="Run linter">pnpm run lint</command>
  <command description="Run all tests">pnpm run test</command>
  <command description="Run e2e tests">pnpm run test:e2e</command>
</test_commands>

<error_handling_requirements>
  <rule>NEVER swallow errors - always log and re-throw</rule>
  <rule>Log errors with full context (input data, operation name)</rule>
  <rule>Use custom exception classes from src/shared/exceptions/</rule>
  <rule>Database errors must be wrapped in DatabaseException</rule>
  <rule>Not found errors must throw NotFoundException</rule>
  <rule>Duplicate key errors must throw ConflictException</rule>
  <rule>If something fails, it should be obvious WHY it failed</rule>
</error_handling_requirements>

</task_spec>

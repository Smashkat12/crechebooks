<task_spec id="TASK-CORE-004" version="2.0">

<metadata>
  <title>Audit Log Entity and Trail System</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>4</sequence>
  <implements>
    <requirement_ref>REQ-RECON-007</requirement_ref>
    <requirement_ref>REQ-RECON-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2025-12-20</last_updated>
</metadata>

<!-- ============================================
     CRITICAL CONTEXT FOR AI AGENT
     ============================================ -->

<project_context>
## CrecheBooks Project Summary
CrecheBooks is an AI-powered bookkeeping system for South African creches.
- **Stack**: NestJS 11, TypeScript, Prisma 7, PostgreSQL
- **Package Manager**: pnpm (NOT npm)
- **Philosophy**: FAIL FAST, no workarounds, no backwards compatibility

## Current State (TASK-CORE-001, 002, 003 Complete)
```
prisma/schema.prisma currently has:
- Enums: TaxStatus, SubscriptionStatus, UserRole
- Models: Tenant, User
- Migrations: create_tenants, create_users

src/database/ structure:
├── prisma/           # PrismaService, PrismaModule (GLOBAL)
├── entities/         # ITenant, IUser, TaxStatus, SubscriptionStatus, UserRole
├── dto/              # CreateTenantDto, UpdateTenantDto, CreateUserDto, UpdateUserDto
├── repositories/     # TenantRepository, UserRepository
├── database.module.ts
└── index.ts

src/shared/exceptions/ has:
- AppException, ValidationException, NotFoundException
- ConflictException, DatabaseException
```

## Key Patterns Established
1. **Prisma 7**: Uses prisma.config.ts for DB URL, Pool+PrismaPg adapter
2. **snake_case DB**: Use @map() for column names, @@map() for table names
3. **Error Handling**: Log with full context, then re-throw custom exception
4. **Tests**: REAL database, NO mocks, South African test data
5. **Repositories**: CRUD operations, injected via NestJS DI
</project_context>

<context>
This task creates the AuditLog entity which provides an IMMUTABLE audit trail
for all changes in CrecheBooks. This is CRITICAL for financial compliance and
security. The audit log captures CREATE, UPDATE, DELETE, CATEGORIZE, MATCH,
RECONCILE, and SUBMIT actions on all entities. Records are IMMUTABLE - no
updates or deletes are allowed. The system captures before/after values,
user/agent information, and metadata for complete traceability.

**KEY DIFFERENCE FROM PREVIOUS TASKS**:
1. This is a SERVICE not a REPOSITORY (different pattern)
2. Table is IMMUTABLE - need database rules to prevent UPDATE/DELETE
3. NO foreign keys - intentional, to maintain immutability
4. Uses JSON fields for beforeValue/afterValue
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#AuditLog</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
  <file purpose="exception_patterns">src/shared/exceptions/base.exception.ts</file>
  <file purpose="prisma_service">src/database/prisma/prisma.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed ✓</check>
  <check>TASK-CORE-003 completed ✓</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured (DATABASE_URL in .env)</check>
  <check>Tenant entity exists in schema ✓</check>
  <check>User entity exists in schema ✓</check>
</prerequisites>

<scope>
  <in_scope>
    - Create AuditLog Prisma model (IMMUTABLE table)
    - Create database migration for audit_logs table
    - Add database RULES preventing UPDATE/DELETE (PostgreSQL)
    - Create TypeScript interfaces for AuditLog
    - Create DTOs for AuditLog creation (NO update DTO - immutable!)
    - Create AuditLogService for capturing changes
    - Define AuditAction enum (7 values)
    - Support both user (human) and AI agent attribution
    - Integration tests with REAL database
  </in_scope>
  <out_of_scope>
    - Automatic audit logging middleware (separate task)
    - Audit log query API endpoints
    - Audit log retention policies
    - User/Tenant lookup - just store IDs as strings
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
```prisma
enum AuditAction {
  CREATE
  UPDATE
  DELETE
  CATEGORIZE
  MATCH
  RECONCILE
  SUBMIT
}

model AuditLog {
  id             String      @id @default(uuid())
  tenantId       String      @map("tenant_id")
  userId         String?     @map("user_id")
  agentId        String?     @map("agent_id")
  entityType     String      @map("entity_type")
  entityId       String      @map("entity_id")
  action         AuditAction
  beforeValue    Json?       @map("before_value")
  afterValue     Json?       @map("after_value")
  changeSummary  String?     @map("change_summary")
  ipAddress      String?     @map("ip_address") @db.VarChar(45)
  userAgent      String?     @map("user_agent")
  createdAt      DateTime    @default(now()) @map("created_at")

  // NOTE: No @updatedAt - this table is IMMUTABLE
  // NOTE: No foreign keys - intentional for immutability

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@map("audit_logs")
}
```
    </signature>
    <signature file="src/database/entities/audit-log.entity.ts">
```typescript
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CATEGORIZE = 'CATEGORIZE',
  MATCH = 'MATCH',
  RECONCILE = 'RECONCILE',
  SUBMIT = 'SUBMIT',
}

export interface IAuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  agentId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  changeSummary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
```
    </signature>
    <signature file="src/database/dto/audit-log.dto.ts">
```typescript
export class CreateAuditLogDto {
  @IsUUID() tenantId!: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsString() @MinLength(1) entityType!: string;
  @IsUUID() entityId!: string;
  @IsEnum(AuditAction) action!: AuditAction;
  @IsOptional() @IsObject() beforeValue?: Record<string, unknown>;
  @IsOptional() @IsObject() afterValue?: Record<string, unknown>;
  @IsOptional() @IsString() changeSummary?: string;
  @IsOptional() @IsString() @MaxLength(45) ipAddress?: string;
  @IsOptional() @IsString() userAgent?: string;
}
// NOTE: No UpdateAuditLogDto - this is an IMMUTABLE table
```
    </signature>
    <signature file="src/database/services/audit-log.service.ts">
```typescript
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);
  constructor(private readonly prisma: PrismaService) {}

  async logCreate(params: LogCreateParams): Promise<AuditLog>;
  async logUpdate(params: LogUpdateParams): Promise<AuditLog>;
  async logDelete(params: LogDeleteParams): Promise<AuditLog>;
  async logAction(params: LogActionParams): Promise<AuditLog>;
  async getEntityHistory(tenantId: string, entityType: string, entityId: string): Promise<AuditLog[]>;
}
```
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type - use Record<string, unknown> for JSON
    - Must follow naming conventions from constitution (snake_case in DB)
    - Migration must include PostgreSQL RULES to prevent UPDATE/DELETE
    - Table MUST be IMMUTABLE (no @updatedAt, no update methods)
    - NO foreign keys - intentional for audit integrity
    - Must support both userId (human) and agentId (AI) attribution
    - beforeValue and afterValue must be JSON type
    - ipAddress field max 45 chars (IPv6 length)
    - createdAt ONLY, no updatedAt
  </constraints>

  <verification>
    - `npx prisma migrate dev` runs without error
    - `npx prisma migrate reset` reverts and reapplies successfully
    - TypeScript compiles without errors (`pnpm run build`)
    - Lint passes (`pnpm run lint`)
    - Unit tests pass (`pnpm run test`)
    - Attempt to UPDATE audit_logs row fails with database error
    - Attempt to DELETE audit_logs row fails with database error
    - All seven AuditAction enum values are defined
  </verification>
</definition_of_done>

<exact_implementation>

## Step 1: Update prisma/schema.prisma

Add AFTER the UserRole enum and User model:

```prisma
enum AuditAction {
  CREATE
  UPDATE
  DELETE
  CATEGORIZE
  MATCH
  RECONCILE
  SUBMIT
}

model AuditLog {
  id             String      @id @default(uuid())
  tenantId       String      @map("tenant_id")
  userId         String?     @map("user_id")
  agentId        String?     @map("agent_id")
  entityType     String      @map("entity_type")
  entityId       String      @map("entity_id")
  action         AuditAction
  beforeValue    Json?       @map("before_value")
  afterValue     Json?       @map("after_value")
  changeSummary  String?     @map("change_summary")
  ipAddress      String?     @map("ip_address") @db.VarChar(45)
  userAgent      String?     @map("user_agent")
  createdAt      DateTime    @default(now()) @map("created_at")

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@map("audit_logs")
}
```

## Step 2: Run migration

```bash
npx prisma migrate dev --name create_audit_logs
```

## Step 3: Add immutability rules to migration

After Prisma generates the migration, MANUALLY EDIT the migration.sql to add:

```sql
-- Prevent UPDATE on audit_logs (immutable)
CREATE RULE prevent_audit_log_update AS
  ON UPDATE TO audit_logs DO INSTEAD NOTHING;

-- Prevent DELETE on audit_logs (immutable)
CREATE RULE prevent_audit_log_delete AS
  ON DELETE TO audit_logs DO INSTEAD NOTHING;
```

Then re-apply: `npx prisma migrate reset`

## Step 4: Create src/database/entities/audit-log.entity.ts

```typescript
/**
 * Audit Log Entity Types
 * TASK-CORE-004: Audit Log Entity and Trail System
 */

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  CATEGORIZE = 'CATEGORIZE',
  MATCH = 'MATCH',
  RECONCILE = 'RECONCILE',
  SUBMIT = 'SUBMIT',
}

export interface IAuditLog {
  id: string;
  tenantId: string;
  userId: string | null;
  agentId: string | null;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeValue: Record<string, unknown> | null;
  afterValue: Record<string, unknown> | null;
  changeSummary: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}
```

## Step 5: Create src/database/dto/audit-log.dto.ts

```typescript
import {
  IsUUID,
  IsString,
  IsEnum,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';
import { AuditAction } from '../entities/audit-log.entity';

export class CreateAuditLogDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  agentId?: string;

  @IsString()
  @MinLength(1)
  entityType!: string;

  @IsUUID()
  entityId!: string;

  @IsEnum(AuditAction)
  action!: AuditAction;

  @IsOptional()
  @IsObject()
  beforeValue?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  afterValue?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  changeSummary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(45)
  ipAddress?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
// NOTE: No UpdateAuditLogDto - this is an IMMUTABLE table
```

## Step 6: Create src/database/services/ directory and audit-log.service.ts

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { AuditLog } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAuditLogDto } from '../dto/audit-log.dto';
import { AuditAction } from '../entities/audit-log.entity';
import { DatabaseException } from '../../shared/exceptions';

interface LogCreateParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  afterValue: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

interface LogUpdateParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
  changeSummary?: string;
  ipAddress?: string;
  userAgent?: string;
}

interface LogDeleteParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  beforeValue: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

interface LogActionParams {
  tenantId: string;
  userId?: string;
  agentId?: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  beforeValue?: Record<string, unknown>;
  afterValue?: Record<string, unknown>;
  changeSummary?: string;
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logCreate(params: LogCreateParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.CREATE,
      beforeValue: undefined,
    });
  }

  async logUpdate(params: LogUpdateParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.UPDATE,
    });
  }

  async logDelete(params: LogDeleteParams): Promise<AuditLog> {
    return this.logAction({
      ...params,
      action: AuditAction.DELETE,
      afterValue: undefined,
    });
  }

  async logAction(params: LogActionParams): Promise<AuditLog> {
    try {
      const dto: CreateAuditLogDto = {
        tenantId: params.tenantId,
        userId: params.userId,
        agentId: params.agentId,
        entityType: params.entityType,
        entityId: params.entityId,
        action: params.action,
        beforeValue: params.beforeValue,
        afterValue: params.afterValue,
        changeSummary: params.changeSummary,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      };

      return await this.prisma.auditLog.create({ data: dto });
    } catch (error) {
      this.logger.error(
        `Failed to create audit log: ${JSON.stringify(params)}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'logAction',
        'Failed to create audit log',
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getEntityHistory(
    tenantId: string,
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    try {
      return await this.prisma.auditLog.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get entity history: ${tenantId}/${entityType}/${entityId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw new DatabaseException(
        'getEntityHistory',
        'Failed to get entity history',
        error instanceof Error ? error : undefined,
      );
    }
  }
}
```

## Step 7: Create src/database/services/index.ts

```typescript
export * from './audit-log.service';
```

## Step 8: Update src/database/entities/index.ts

```typescript
export * from './tenant.entity';
export * from './user.entity';
export * from './audit-log.entity';
```

## Step 9: Update src/database/dto/index.ts

```typescript
export * from './tenant.dto';
export * from './user.dto';
export * from './audit-log.dto';
```

## Step 10: Update src/database/database.module.ts

```typescript
import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { AuditLogService } from './services/audit-log.service';

@Module({
  providers: [TenantRepository, UserRepository, AuditLogService],
  exports: [TenantRepository, UserRepository, AuditLogService],
})
export class DatabaseModule {}
```

## Step 11: Update src/database/index.ts

```typescript
export * from './prisma';
export * from './entities';
export * from './dto';
export * from './repositories';
export * from './services';
export * from './database.module';
```

## Step 12: Create tests/database/services/audit-log.service.spec.ts

Use REAL database, test:
- logCreate creates audit log with action=CREATE
- logUpdate creates audit log with action=UPDATE
- logDelete creates audit log with action=DELETE
- logAction works for CATEGORIZE, MATCH, RECONCILE, SUBMIT
- getEntityHistory returns logs in descending order
- Both userId and agentId work correctly
- UPDATE attempt on audit_logs fails
- DELETE attempt on audit_logs fails

</exact_implementation>

<files_to_create>
  <file path="src/database/entities/audit-log.entity.ts">AuditLog interface and AuditAction enum</file>
  <file path="src/database/dto/audit-log.dto.ts">CreateAuditLogDto with validation (NO update DTO)</file>
  <file path="src/database/services/audit-log.service.ts">AuditLog service for logging operations</file>
  <file path="src/database/services/index.ts">Export services</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_audit_logs/migration.sql">Generated migration WITH immutability rules</file>
  <file path="tests/database/services/audit-log.service.spec.ts">Service tests including immutability verification</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add AuditLog model and AuditAction enum</file>
  <file path="src/database/entities/index.ts">Export audit log entities</file>
  <file path="src/database/dto/index.ts">Export audit log DTOs</file>
  <file path="src/database/database.module.ts">Add AuditLogService to providers and exports</file>
  <file path="src/database/index.ts">Export services</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates audit_logs table with all columns</criterion>
  <criterion>Migration includes PostgreSQL RULES for immutability</criterion>
  <criterion>AuditLog entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Database prevents UPDATE on audit_logs table</criterion>
  <criterion>Database prevents DELETE on audit_logs table</criterion>
  <criterion>All seven AuditAction enum values defined correctly</criterion>
  <criterion>Service can log CREATE, UPDATE, DELETE actions</criterion>
  <criterion>Service can log CATEGORIZE, MATCH, RECONCILE, SUBMIT actions</criterion>
  <criterion>getEntityHistory returns logs in descending order by createdAt</criterion>
  <criterion>Both userId and agentId can be null or have values</criterion>
  <criterion>JSON fields (beforeValue, afterValue) work correctly</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_audit_logs</command>
  <command>npx prisma migrate reset</command>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm run test</command>
  <command>pnpm run test:e2e</command>
</test_commands>

<critical_notes>
## CRITICAL FOR AI AGENT

1. **IMMUTABILITY**: This table MUST NOT allow updates or deletes. Add PostgreSQL RULES.

2. **NO UpdateDto**: Unlike Tenant/User, there is NO UpdateAuditLogDto - records are immutable.

3. **NO Foreign Keys**: tenantId and userId are stored as strings, NOT as foreign key relations. This is intentional to preserve audit integrity even if referenced records are deleted.

4. **Service Pattern**: Unlike TenantRepository/UserRepository, this uses AuditLogService. Services are for business logic; this is appropriate because logging is business logic.

5. **JSON Fields**: Use `Record<string, unknown>` NOT `any` or `object`. Prisma maps this to JSON.

6. **Test Immutability**: Your tests MUST verify that UPDATE and DELETE operations fail on the audit_logs table.

7. **Test Cleanup**: Since audit_logs is immutable, you need to use `$executeRaw` or bypass the rules for test cleanup:
```typescript
await prisma.$executeRaw`DELETE FROM audit_logs WHERE tenant_id = ${testTenantId}`;
```
Wait - this won't work with the DELETE rule! For tests, consider:
- Creating a test-specific tenant each time
- Or disabling rules temporarily in test (not recommended)
- Or accepting that audit logs accumulate in test DB

Best approach: Each test creates a unique tenant, creates audit logs for that tenant, and verifies. Don't delete.
</critical_notes>

</task_spec>

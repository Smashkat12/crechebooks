<task_spec id="TASK-CORE-004" version="1.0">

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
</metadata>

<context>
This task creates the AuditLog entity which provides an immutable audit trail
for all changes in CrecheBooks. This is critical for financial compliance and
security. The audit log captures CREATE, UPDATE, DELETE, CATEGORIZE, MATCH,
RECONCILE, and SUBMIT actions on all entities. Records are IMMUTABLE - no
updates or deletes are allowed. The system captures before/after values,
user/agent information, and metadata for complete traceability.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#AuditLog</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
  <check>Tenant entity exists in schema</check>
</prerequisites>

<scope>
  <in_scope>
    - Create AuditLog Prisma model (IMMUTABLE table)
    - Create database migration for audit_logs table
    - Add database constraints preventing UPDATE/DELETE
    - Create TypeScript interfaces for AuditLog
    - Create DTOs for AuditLog creation
    - Create AuditLog service for capturing changes
    - Define AuditAction enum (CREATE, UPDATE, DELETE, CATEGORIZE, MATCH, RECONCILE, SUBMIT)
    - Support both user and AI agent attribution
  </in_scope>
  <out_of_scope>
    - User entity (TASK-CORE-003)
    - Automatic audit logging middleware (separate task)
    - Audit log query API
    - Audit log retention policies
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model AuditLog {
        id             String      @id @default(uuid())
        tenantId       String
        userId         String?
        agentId        String?
        entityType     String
        entityId       String
        action         AuditAction
        beforeValue    Json?
        afterValue     Json?
        changeSummary  String?
        ipAddress      String?
        userAgent      String?
        createdAt      DateTime    @default(now())

        @@index([tenantId, entityType, entityId])
        @@index([tenantId, createdAt])
        @@index([userId, createdAt])
        @@map("audit_logs")
      }

      enum AuditAction {
        CREATE
        UPDATE
        DELETE
        CATEGORIZE
        MATCH
        RECONCILE
        SUBMIT
      }
    </signature>
    <signature file="src/database/entities/audit-log.entity.ts">
      export enum AuditAction {
        CREATE = 'CREATE',
        UPDATE = 'UPDATE',
        DELETE = 'DELETE',
        CATEGORIZE = 'CATEGORIZE',
        MATCH = 'MATCH',
        RECONCILE = 'RECONCILE',
        SUBMIT = 'SUBMIT'
      }

      export interface IAuditLog {
        id: string;
        tenantId: string;
        userId: string | null;
        agentId: string | null;
        entityType: string;
        entityId: string;
        action: AuditAction;
        beforeValue: Record&lt;string, any&gt; | null;
        afterValue: Record&lt;string, any&gt; | null;
        changeSummary: string | null;
        ipAddress: string | null;
        userAgent: string | null;
        createdAt: Date;
      }
    </signature>
    <signature file="src/database/dto/audit-log.dto.ts">
      export class CreateAuditLogDto {
        @IsUUID() tenantId: string;
        @IsOptional() @IsUUID() userId?: string;
        @IsOptional() @IsString() agentId?: string;
        @IsString() @MinLength(1) entityType: string;
        @IsUUID() entityId: string;
        @IsEnum(AuditAction) action: AuditAction;
        @IsOptional() @IsObject() beforeValue?: Record&lt;string, any&gt;;
        @IsOptional() @IsObject() afterValue?: Record&lt;string, any&gt;;
        @IsOptional() @IsString() changeSummary?: string;
        @IsOptional() @IsString() ipAddress?: string;
        @IsOptional() @IsString() userAgent?: string;
      }
    </signature>
    <signature file="src/database/services/audit-log.service.ts">
      @Injectable()
      export class AuditLogService {
        constructor(private prisma: PrismaService) {}

        async logCreate(params: {
          tenantId: string;
          userId?: string;
          agentId?: string;
          entityType: string;
          entityId: string;
          afterValue: Record&lt;string, any&gt;;
          ipAddress?: string;
          userAgent?: string;
        }): Promise&lt;AuditLog&gt;;

        async logUpdate(params: {
          tenantId: string;
          userId?: string;
          agentId?: string;
          entityType: string;
          entityId: string;
          beforeValue: Record&lt;string, any&gt;;
          afterValue: Record&lt;string, any&gt;;
          changeSummary?: string;
          ipAddress?: string;
          userAgent?: string;
        }): Promise&lt;AuditLog&gt;;

        async logDelete(params: {
          tenantId: string;
          userId?: string;
          agentId?: string;
          entityType: string;
          entityId: string;
          beforeValue: Record&lt;string, any&gt;;
          ipAddress?: string;
          userAgent?: string;
        }): Promise&lt;AuditLog&gt;;

        async logAction(params: {
          tenantId: string;
          userId?: string;
          agentId?: string;
          entityType: string;
          entityId: string;
          action: AuditAction;
          beforeValue?: Record&lt;string, any&gt;;
          afterValue?: Record&lt;string, any&gt;;
          changeSummary?: string;
          ipAddress?: string;
          userAgent?: string;
        }): Promise&lt;AuditLog&gt;;

        async getEntityHistory(
          tenantId: string,
          entityType: string,
          entityId: string
        ): Promise&lt;AuditLog[]&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere (use Record&lt;string, any&gt; for JSON)
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - Table must be IMMUTABLE (no UPDATE/DELETE operations allowed)
    - Migration must include database trigger/policy to prevent updates
    - Must support both userId (human) and agentId (AI) attribution
    - beforeValue and afterValue must be JSON type
    - entityType must be indexed for efficient queries
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Attempt to UPDATE audit_logs row fails with database error
    - Attempt to DELETE audit_logs row fails with database error
    - All seven AuditAction enum values are defined
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enum:
    enum AuditAction {
      CREATE
      UPDATE
      DELETE
      CATEGORIZE
      MATCH
      RECONCILE
      SUBMIT
    }

  Add model AuditLog with all fields per technical spec:
    - id: UUID primary key
    - tenantId: UUID (not foreign key - immutable requirement)
    - userId: nullable UUID (not foreign key - immutable requirement)
    - agentId: nullable string for AI agent identification
    - entityType: string (entity name like "Transaction", "Invoice")
    - entityId: UUID of the entity being audited
    - action: AuditAction enum
    - beforeValue: nullable JSON for previous state
    - afterValue: nullable JSON for new state
    - changeSummary: nullable text description
    - ipAddress: nullable string (max 45 chars for IPv6)
    - userAgent: nullable text
    - createdAt: timestamp with default

  Use @map("audit_logs") for snake_case table name
  Use @@index on [tenantId, entityType, entityId]
  Use @@index on [tenantId, createdAt]
  Use @@index on [userId, createdAt]

  NOTE: No foreign keys to maintain immutability if parent records deleted

Migration (prisma/migrations/YYYYMMDDHHMMSS_create_audit_logs/migration.sql):
  CREATE TABLE audit_logs (...)
  CREATE INDEX idx_audit_logs_entity ON audit_logs(tenant_id, entity_type, entity_id)
  CREATE INDEX idx_audit_logs_tenant_time ON audit_logs(tenant_id, created_at)
  CREATE INDEX idx_audit_logs_user_time ON audit_logs(user_id, created_at)

  -- PostgreSQL: Prevent updates and deletes
  CREATE RULE prevent_audit_log_update AS
    ON UPDATE TO audit_logs DO INSTEAD NOTHING;
  CREATE RULE prevent_audit_log_delete AS
    ON DELETE TO audit_logs DO INSTEAD NOTHING;

Entity Interface (src/database/entities/audit-log.entity.ts):
  export enum AuditAction:
    CREATE = 'CREATE'
    UPDATE = 'UPDATE'
    DELETE = 'DELETE'
    CATEGORIZE = 'CATEGORIZE'
    MATCH = 'MATCH'
    RECONCILE = 'RECONCILE'
    SUBMIT = 'SUBMIT'

  export interface IAuditLog:
    id: string
    tenantId: string
    userId: string | null
    agentId: string | null
    entityType: string
    entityId: string
    action: AuditAction
    beforeValue: Record&lt;string, any&gt; | null
    afterValue: Record&lt;string, any&gt; | null
    changeSummary: string | null
    ipAddress: string | null
    userAgent: string | null
    createdAt: Date

DTOs (src/database/dto/audit-log.dto.ts):
  export class CreateAuditLogDto:
    @IsUUID() tenantId: string
    @IsOptional() @IsUUID() userId?: string
    @IsOptional() @IsString() agentId?: string
    @IsString() @MinLength(1) entityType: string
    @IsUUID() entityId: string
    @IsEnum(AuditAction) action: AuditAction
    @IsOptional() @IsObject() beforeValue?: Record&lt;string, any&gt;
    @IsOptional() @IsObject() afterValue?: Record&lt;string, any&gt;
    @IsOptional() @IsString() changeSummary?: string
    @IsOptional() @IsString() ipAddress?: string
    @IsOptional() @IsString() userAgent?: string

Service (src/database/services/audit-log.service.ts):
  @Injectable()
  export class AuditLogService:
    constructor(private prisma: PrismaService)

    async logCreate(params): Promise&lt;AuditLog&gt;
      return await this.logAction({
        ...params,
        action: AuditAction.CREATE,
        beforeValue: null
      })

    async logUpdate(params): Promise&lt;AuditLog&gt;
      return await this.logAction({
        ...params,
        action: AuditAction.UPDATE
      })

    async logDelete(params): Promise&lt;AuditLog&gt;
      return await this.logAction({
        ...params,
        action: AuditAction.DELETE,
        afterValue: null
      })

    async logAction(params): Promise&lt;AuditLog&gt;
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
        userAgent: params.userAgent
      }
      return await this.prisma.auditLog.create({ data: dto })

    async getEntityHistory(tenantId, entityType, entityId): Promise&lt;AuditLog[]&gt;
      return await this.prisma.auditLog.findMany({
        where: { tenantId, entityType, entityId },
        orderBy: { createdAt: 'desc' }
      })

Migration:
  npx prisma migrate dev --name create_audit_logs
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/audit-log.entity.ts">AuditLog interface and AuditAction enum</file>
  <file path="src/database/dto/audit-log.dto.ts">Create DTO with validation</file>
  <file path="src/database/services/audit-log.service.ts">AuditLog service for logging operations</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_audit_logs/migration.sql">Generated migration with immutability rules</file>
  <file path="tests/database/services/audit-log.service.spec.ts">Service tests including immutability verification</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add AuditLog model and AuditAction enum</file>
  <file path="src/database/entities/index.ts">Export audit log entities</file>
  <file path="src/database/dto/index.ts">Export audit log DTOs</file>
  <file path="src/app.module.ts">Import AuditLogService if not already</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates audit_logs table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>AuditLog entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Database prevents UPDATE on audit_logs table</criterion>
  <criterion>Database prevents DELETE on audit_logs table</criterion>
  <criterion>All seven AuditAction enum values defined correctly</criterion>
  <criterion>Service can log CREATE, UPDATE, DELETE actions</criterion>
  <criterion>Service can log CATEGORIZE, MATCH, RECONCILE, SUBMIT actions</criterion>
  <criterion>getEntityHistory returns logs in descending order</criterion>
  <criterion>Both userId and agentId can be null</criterion>
  <criterion>JSON fields (beforeValue, afterValue) work correctly</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_audit_logs</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "AuditLogService"</command>
</test_commands>

</task_spec>

<task_spec id="TASK-CORE-003" version="1.0">

<metadata>
  <title>User Entity and Authentication Types</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>3</sequence>
  <implements>
    <requirement_ref>NFR-SEC-002</requirement_ref>
    <requirement_ref>NFR-SEC-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the User entity which handles authentication and authorization
in CrecheBooks. Users are authenticated via Auth0 and are scoped to a single
tenant. Each user has a role (OWNER, ADMIN, VIEWER, ACCOUNTANT) that determines
their permissions. The user entity tracks login activity and active status for
security auditing.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#User</file>
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
    - Create User Prisma model with Auth0 integration
    - Create database migration for users table
    - Create TypeScript interfaces for User
    - Create DTOs for User operations
    - Create User repository
    - Set up row-level security policy for users
    - Define UserRole enum (OWNER, ADMIN, VIEWER, ACCOUNTANT)
  </in_scope>
  <out_of_scope>
    - Auth0 integration logic (separate task)
    - Business logic for user management
    - API endpoints
    - Role-based access control middleware
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model User {
        id            String   @id @default(uuid())
        tenantId      String
        tenant        Tenant   @relation(fields: [tenantId], references: [id])
        auth0Id       String   @unique
        email         String
        name          String
        role          UserRole
        isActive      Boolean  @default(true)
        lastLoginAt   DateTime?
        createdAt     DateTime @default(now())
        updatedAt     DateTime @updatedAt

        @@unique([tenantId, email])
        @@index([tenantId])
        @@index([auth0Id])
        @@map("users")
      }

      enum UserRole {
        OWNER
        ADMIN
        VIEWER
        ACCOUNTANT
      }
    </signature>
    <signature file="src/database/entities/user.entity.ts">
      export enum UserRole {
        OWNER = 'OWNER',
        ADMIN = 'ADMIN',
        VIEWER = 'VIEWER',
        ACCOUNTANT = 'ACCOUNTANT'
      }

      export interface IUser {
        id: string;
        tenantId: string;
        auth0Id: string;
        email: string;
        name: string;
        role: UserRole;
        isActive: boolean;
        lastLoginAt: Date | null;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/user.dto.ts">
      export class CreateUserDto {
        @IsUUID() tenantId: string;
        @IsString() @MinLength(1) auth0Id: string;
        @IsEmail() email: string;
        @IsString() @MinLength(1) name: string;
        @IsEnum(UserRole) role: UserRole;
        @IsOptional() @IsBoolean() isActive?: boolean;
      }

      export class UpdateUserDto {
        @IsOptional() @IsString() @MinLength(1) name?: string;
        @IsOptional() @IsEmail() email?: string;
        @IsOptional() @IsEnum(UserRole) role?: UserRole;
        @IsOptional() @IsBoolean() isActive?: boolean;
        @IsOptional() @IsDate() lastLoginAt?: Date;
      }
    </signature>
    <signature file="src/database/repositories/user.repository.ts">
      @Injectable()
      export class UserRepository {
        constructor(private prisma: PrismaService) {}

        async create(dto: CreateUserDto): Promise<User>;
        async findById(id: string): Promise<User | null>;
        async findByAuth0Id(auth0Id: string): Promise<User | null>;
        async findByTenantAndEmail(tenantId: string, email: string): Promise<User | null>;
        async findByTenant(tenantId: string): Promise<User[]>;
        async update(id: string, dto: UpdateUserDto): Promise<User>;
        async updateLastLogin(id: string): Promise<User>;
        async deactivate(id: string): Promise<User>;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - auth0Id must be unique across all tenants
    - (tenantId, email) combination must be unique
    - User must belong to exactly one tenant
    - Role must be one of: OWNER, ADMIN, VIEWER, ACCOUNTANT
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
    - Foreign key constraint to tenants table works correctly
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enum:
    enum UserRole { OWNER, ADMIN, VIEWER, ACCOUNTANT }

  Add model User with all fields per technical spec:
    - id: UUID primary key
    - tenantId: UUID foreign key to Tenant
    - auth0Id: unique string for Auth0 integration
    - email: string (unique per tenant)
    - name: string
    - role: UserRole enum
    - isActive: boolean (default true)
    - lastLoginAt: nullable timestamp
    - createdAt: timestamp with default
    - updatedAt: auto-updated timestamp

  Use @map("users") for snake_case table name
  Use @unique on auth0Id
  Use @@unique on [tenantId, email]
  Use @@index on tenantId and auth0Id
  Add relation to Tenant model

Update Tenant model in prisma/schema.prisma:
  Add relation:
    users User[]

Entity Interface (src/database/entities/user.entity.ts):
  export enum UserRole:
    OWNER = 'OWNER'
    ADMIN = 'ADMIN'
    VIEWER = 'VIEWER'
    ACCOUNTANT = 'ACCOUNTANT'

  export interface IUser:
    id: string
    tenantId: string
    auth0Id: string
    email: string
    name: string
    role: UserRole
    isActive: boolean
    lastLoginAt: Date | null
    createdAt: Date
    updatedAt: Date

DTOs (src/database/dto/user.dto.ts):
  export class CreateUserDto:
    @IsUUID() tenantId: string
    @IsString() @MinLength(1) auth0Id: string
    @IsEmail() email: string
    @IsString() @MinLength(1) name: string
    @IsEnum(UserRole) role: UserRole
    @IsOptional() @IsBoolean() isActive?: boolean

  export class UpdateUserDto:
    @IsOptional() @IsString() @MinLength(1) name?: string
    @IsOptional() @IsEmail() email?: string
    @IsOptional() @IsEnum(UserRole) role?: UserRole
    @IsOptional() @IsBoolean() isActive?: boolean
    @IsOptional() @IsDate() lastLoginAt?: Date

Repository (src/database/repositories/user.repository.ts):
  @Injectable()
  export class UserRepository:
    constructor(private prisma: PrismaService)

    async create(dto: CreateUserDto): Promise<User>
      return await this.prisma.user.create({ data: dto })

    async findById(id: string): Promise<User | null>
      return await this.prisma.user.findUnique({ where: { id } })

    async findByAuth0Id(auth0Id: string): Promise<User | null>
      return await this.prisma.user.findUnique({ where: { auth0Id } })

    async findByTenantAndEmail(tenantId: string, email: string): Promise<User | null>
      return await this.prisma.user.findUnique({
        where: { tenantId_email: { tenantId, email } }
      })

    async findByTenant(tenantId: string): Promise<User[]>
      return await this.prisma.user.findMany({
        where: { tenantId, isActive: true }
      })

    async update(id: string, dto: UpdateUserDto): Promise<User>
      return await this.prisma.user.update({ where: { id }, data: dto })

    async updateLastLogin(id: string): Promise<User>
      return await this.prisma.user.update({
        where: { id },
        data: { lastLoginAt: new Date() }
      })

    async deactivate(id: string): Promise<User>
      return await this.prisma.user.update({
        where: { id },
        data: { isActive: false }
      })

Migration:
  npx prisma migrate dev --name create_users
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/user.entity.ts">User interface and UserRole enum</file>
  <file path="src/database/dto/user.dto.ts">Create and Update DTOs with validation</file>
  <file path="src/database/repositories/user.repository.ts">User repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_users/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/user.repository.spec.ts">Repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add User model and UserRole enum, update Tenant model with users relation</file>
  <file path="src/database/entities/index.ts">Export user entities</file>
  <file path="src/database/dto/index.ts">Export user DTOs</file>
  <file path="src/app.module.ts">Import PrismaModule if not already</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates users table with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>User entity matches technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on auth0Id works</criterion>
  <criterion>Composite unique constraint on (tenantId, email) works</criterion>
  <criterion>Foreign key to tenants table enforced</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>UserRole enum has all four values</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_users</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "UserRepository"</command>
</test_commands>

</task_spec>

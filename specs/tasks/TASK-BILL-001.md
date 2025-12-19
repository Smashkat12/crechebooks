<task_spec id="TASK-BILL-001" version="1.0">

<metadata>
  <title>Parent and Child Entities</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>8</sequence>
  <implements>
    <requirement_ref>REQ-BILL-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-CORE-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
This task creates the Parent and Child entities which are the foundation for billing
in CrecheBooks. Parents are the billing contacts who receive invoices, while Children
are the enrolled students. Each Child is linked to a Parent, and both entities include
contact information, medical details, and synchronization with Xero contacts.
</context>

<input_context_files>
  <file purpose="schema_definition">specs/technical/data-models.md#Parent</file>
  <file purpose="schema_definition">specs/technical/data-models.md#Child</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
  <file purpose="existing_schema">prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>TASK-CORE-002 completed</check>
  <check>Tenant entity exists</check>
  <check>Prisma CLI available</check>
  <check>Database connection configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Create Parent Prisma model
    - Create Child Prisma model
    - Create Gender enum (MALE, FEMALE, OTHER)
    - Create PreferredContact enum (EMAIL, WHATSAPP, BOTH)
    - Create database migrations for parents and children tables
    - Create TypeScript interfaces for Parent and Child
    - Create DTOs for Parent and Child operations
    - Create Parent and Child repositories
  </in_scope>
  <out_of_scope>
    - FeeStructure entity (TASK-BILL-002)
    - Enrollment entity (TASK-BILL-002)
    - Invoice entity (TASK-BILL-003)
    - Business logic for parent/child management
    - API endpoints
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="prisma/schema.prisma">
      model Parent {
        id                String   @id @default(uuid())
        tenantId          String
        tenant            Tenant   @relation(fields: [tenantId], references: [id])
        xeroContactId     String?  @unique
        firstName         String
        lastName          String
        email             String?
        phone             String?
        whatsapp          String?
        preferredContact  PreferredContact @default(EMAIL)
        idNumber          String?
        address           String?
        notes             String?
        isActive          Boolean  @default(true)
        createdAt         DateTime @default(now())
        updatedAt         DateTime @updatedAt

        children          Child[]

        @@unique([tenantId, email])
        @@index([tenantId, lastName, firstName])
        @@map("parents")
      }

      model Child {
        id               String   @id @default(uuid())
        tenantId         String
        tenant           Tenant   @relation(fields: [tenantId], references: [id])
        parentId         String
        parent           Parent   @relation(fields: [parentId], references: [id])
        firstName        String
        lastName         String
        dateOfBirth      DateTime @db.Date
        gender           Gender?
        medicalNotes     String?
        emergencyContact String?
        emergencyPhone   String?
        isActive         Boolean  @default(true)
        createdAt        DateTime @default(now())
        updatedAt        DateTime @updatedAt

        @@index([tenantId, parentId])
        @@index([tenantId, isActive])
        @@map("children")
      }

      enum Gender {
        MALE
        FEMALE
        OTHER
      }

      enum PreferredContact {
        EMAIL
        WHATSAPP
        BOTH
      }
    </signature>
    <signature file="src/database/entities/parent.entity.ts">
      export enum PreferredContact {
        EMAIL = 'EMAIL',
        WHATSAPP = 'WHATSAPP',
        BOTH = 'BOTH'
      }

      export interface IParent {
        id: string;
        tenantId: string;
        xeroContactId: string | null;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        whatsapp: string | null;
        preferredContact: PreferredContact;
        idNumber: string | null;
        address: string | null;
        notes: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/entities/child.entity.ts">
      export enum Gender {
        MALE = 'MALE',
        FEMALE = 'FEMALE',
        OTHER = 'OTHER'
      }

      export interface IChild {
        id: string;
        tenantId: string;
        parentId: string;
        firstName: string;
        lastName: string;
        dateOfBirth: Date;
        gender: Gender | null;
        medicalNotes: string | null;
        emergencyContact: string | null;
        emergencyPhone: string | null;
        isActive: boolean;
        createdAt: Date;
        updatedAt: Date;
      }
    </signature>
    <signature file="src/database/dto/parent.dto.ts">
      export class CreateParentDto {...}
      export class UpdateParentDto {...}
    </signature>
    <signature file="src/database/dto/child.dto.ts">
      export class CreateChildDto {...}
      export class UpdateChildDto {...}
    </signature>
  </signatures>

  <constraints>
    - Must use UUID for primary key (not auto-increment)
    - Must include all fields from technical spec data model
    - Must NOT use 'any' type anywhere
    - Must follow naming conventions from constitution
    - Migration must be reversible (include down migration)
    - Parent email must be unique per tenant when not null
    - xeroContactId must be unique when not null
    - Child must have valid parentId foreign key
    - Both entities must have tenantId foreign key
    - dateOfBirth must be stored as date only (no time)
  </constraints>

  <verification>
    - npx prisma migrate dev runs without error
    - npx prisma migrate reset reverts and reapplies successfully
    - TypeScript compiles without errors
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
Prisma Schema Update (prisma/schema.prisma):
  Add enums:
    enum Gender { MALE, FEMALE, OTHER }
    enum PreferredContact { EMAIL, WHATSAPP, BOTH }

  Add model Parent with all fields per technical spec:
    - id, tenantId (FK to Tenant), xeroContactId (unique)
    - firstName, lastName, email, phone, whatsapp
    - preferredContact (enum), idNumber, address, notes
    - isActive, createdAt, updatedAt
    - Relation: children (Child[])
    - Use @map("parents") for snake_case table name
    - Unique constraint on [tenantId, email]
    - Index on [tenantId, lastName, firstName]

  Add model Child with all fields per technical spec:
    - id, tenantId (FK to Tenant), parentId (FK to Parent)
    - firstName, lastName, dateOfBirth (@db.Date)
    - gender (enum, nullable), medicalNotes, emergencyContact, emergencyPhone
    - isActive, createdAt, updatedAt
    - Use @map("children") for snake_case table name
    - Index on [tenantId, parentId]
    - Index on [tenantId, isActive]

  Update Tenant model:
    - Add relation: parents (Parent[])
    - Add relation: children (Child[])

Parent Entity Interface (src/database/entities/parent.entity.ts):
  export enum PreferredContact:
    EMAIL = 'EMAIL'
    WHATSAPP = 'WHATSAPP'
    BOTH = 'BOTH'

  export interface IParent:
    // All fields with proper types

Child Entity Interface (src/database/entities/child.entity.ts):
  export enum Gender:
    MALE = 'MALE'
    FEMALE = 'FEMALE'
    OTHER = 'OTHER'

  export interface IChild:
    // All fields with proper types

Parent DTOs (src/database/dto/parent.dto.ts):
  export class CreateParentDto:
    @IsString() @MinLength(1) firstName: string
    @IsString() @MinLength(1) lastName: string
    @IsOptional() @IsEmail() email?: string
    @IsOptional() @IsString() phone?: string
    @IsOptional() @IsString() whatsapp?: string
    @IsEnum(PreferredContact) preferredContact: PreferredContact
    @IsOptional() @IsString() idNumber?: string
    @IsOptional() @IsString() address?: string
    @IsOptional() @IsString() notes?: string

  export class UpdateParentDto:
    // All fields optional except tenantId validation

Child DTOs (src/database/dto/child.dto.ts):
  export class CreateChildDto:
    @IsUUID() parentId: string
    @IsString() @MinLength(1) firstName: string
    @IsString() @MinLength(1) lastName: string
    @IsDate() dateOfBirth: Date
    @IsOptional() @IsEnum(Gender) gender?: Gender
    @IsOptional() @IsString() medicalNotes?: string
    @IsOptional() @IsString() emergencyContact?: string
    @IsOptional() @IsString() emergencyPhone?: string

  export class UpdateChildDto:
    // All fields optional except tenantId validation

Parent Repository (src/database/repositories/parent.repository.ts):
  @Injectable()
  export class ParentRepository:
    constructor(private prisma: PrismaService)

    async create(tenantId: string, dto: CreateParentDto): Promise<Parent>
    async findById(tenantId: string, id: string): Promise<Parent | null>
    async findByEmail(tenantId: string, email: string): Promise<Parent | null>
    async findByXeroContactId(xeroContactId: string): Promise<Parent | null>
    async findAll(tenantId: string, filters?: ParentFilters): Promise<Parent[]>
    async update(tenantId: string, id: string, dto: UpdateParentDto): Promise<Parent>
    async delete(tenantId: string, id: string): Promise<void>

Child Repository (src/database/repositories/child.repository.ts):
  @Injectable()
  export class ChildRepository:
    constructor(private prisma: PrismaService)

    async create(tenantId: string, dto: CreateChildDto): Promise<Child>
    async findById(tenantId: string, id: string): Promise<Child | null>
    async findByParentId(tenantId: string, parentId: string): Promise<Child[]>
    async findAll(tenantId: string, filters?: ChildFilters): Promise<Child[]>
    async update(tenantId: string, id: string, dto: UpdateChildDto): Promise<Child>
    async delete(tenantId: string, id: string): Promise<void>

Migration:
  npx prisma migrate dev --name create_parents_and_children
</pseudo_code>

<files_to_create>
  <file path="src/database/entities/parent.entity.ts">Parent interface and PreferredContact enum</file>
  <file path="src/database/entities/child.entity.ts">Child interface and Gender enum</file>
  <file path="src/database/dto/parent.dto.ts">Create and Update DTOs for Parent with validation</file>
  <file path="src/database/dto/child.dto.ts">Create and Update DTOs for Child with validation</file>
  <file path="src/database/repositories/parent.repository.ts">Parent repository</file>
  <file path="src/database/repositories/child.repository.ts">Child repository</file>
  <file path="prisma/migrations/YYYYMMDDHHMMSS_create_parents_and_children/migration.sql">Generated migration</file>
  <file path="tests/database/repositories/parent.repository.spec.ts">Parent repository tests</file>
  <file path="tests/database/repositories/child.repository.spec.ts">Child repository tests</file>
</files_to_create>

<files_to_modify>
  <file path="prisma/schema.prisma">Add Parent and Child models with enums</file>
  <file path="src/database/entities/index.ts">Export Parent and Child entities</file>
  <file path="src/database/dto/index.ts">Export Parent and Child DTOs</file>
</files_to_modify>

<validation_criteria>
  <criterion>Migration creates parents and children tables with all columns</criterion>
  <criterion>Migration can be reverted</criterion>
  <criterion>Parent and Child entities match technical spec exactly</criterion>
  <criterion>No TypeScript compilation errors</criterion>
  <criterion>All fields have correct types and constraints</criterion>
  <criterion>Unique constraint on tenantId + email works for Parent</criterion>
  <criterion>Foreign key constraints work (Child to Parent, both to Tenant)</criterion>
  <criterion>Gender and PreferredContact enums work correctly</criterion>
  <criterion>Repository CRUD operations work correctly</criterion>
  <criterion>dateOfBirth stored as date only (no time component)</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name create_parents_and_children</command>
  <command>npx prisma migrate reset</command>
  <command>npm run build</command>
  <command>npm run test -- --grep "ParentRepository"</command>
  <command>npm run test -- --grep "ChildRepository"</command>
</test_commands>

</task_spec>

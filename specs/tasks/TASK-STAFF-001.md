<task_spec id="TASK-STAFF-001" version="1.0">

<metadata>
  <title>Staff Onboarding Workflow with Welcome Pack</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>171</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-001</requirement_ref>
    <requirement_ref>REQ-STAFF-002</requirement_ref>
    <requirement_ref>REQ-HR-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-001</task_ref>
    <task_ref status="complete">TASK-WEB-019</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2026-01-07</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Staff Infrastructure

  **Existing Staff Entity (staff.entity.ts):**
  - IStaff interface with employment, banking, salary fields
  - EmploymentType: PERMANENT, CONTRACT, CASUAL
  - PayFrequency: MONTHLY, WEEKLY, DAILY, HOURLY
  - Fields: employeeNumber, firstName, lastName, idNumber, taxNumber, bankDetails

  **Existing Staff Repository:**
  - CRUD operations for staff management
  - SA ID validation, banking details storage

  **Missing Components:**
  - Document upload/storage system
  - Onboarding checklist tracking
  - Welcome pack PDF generation
  - DSD compliance checklist
  - Probation period tracking
</project_state>

<context>
  ## South African HR Compliance Requirements

  ### BCEA (Basic Conditions of Employment Act) Requirements:
  - Written employment contract on first day of work (Section 29)
  - Contract must include: employer/employee names, job title, workplace, start date,
    working hours, remuneration, deductions, leave entitlement, notice period

  ### DSD (Department of Social Development) Requirements for Childcare:
  - Police clearance certificate (valid within 6 months)
  - Medical certificate of fitness
  - First Aid Level 1 certificate (recommended)
  - ECD qualification verification (if applicable)
  - Child protection training acknowledgment

  ### POPIA (Protection of Personal Information Act):
  - Written consent for employee data processing
  - Data subject notification
  - Purpose limitation documentation

  ### UIF (Unemployment Insurance Fund):
  - UI-8 form for new employee registration
  - Employee must be registered within 14 days of start date
</context>

<scope>
  <in_scope>
    - Add StaffDocument entity for storing uploaded documents
    - Add OnboardingChecklist entity for tracking completion
    - Create document upload API endpoints
    - Create OnboardingWizard UI component (multi-step form)
    - Add DSD compliance checklist (police clearance, medical, First Aid)
    - Create Welcome Pack PDF generator service
    - Add probation review tracking (30/60/90 day reminders)
    - Create onboarding dashboard for HR view
    - Integrate with existing Staff entity and pages
  </in_scope>
  <out_of_scope>
    - Staff offboarding workflow (TASK-STAFF-002)
    - Xero integration (TASK-STAFF-003)
    - SimplePay integration (TASK-STAFF-004)
    - External document storage (S3) - use local storage for now
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma

```prisma
enum DocumentType {
  ID_COPY
  TAX_CERTIFICATE
  BANK_CONFIRMATION
  POLICE_CLEARANCE
  MEDICAL_CERTIFICATE
  FIRST_AID_CERTIFICATE
  ECD_QUALIFICATION
  EMPLOYMENT_CONTRACT
  POPIA_CONSENT
  OTHER
}

enum OnboardingStatus {
  NOT_STARTED
  IN_PROGRESS
  COMPLETED
  EXPIRED
}

enum ChecklistItemStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  WAIVED
  EXPIRED
}

model StaffDocument {
  id            String       @id @default(uuid())
  tenantId      String       @map("tenant_id")
  staffId       String       @map("staff_id")
  documentType  DocumentType @map("document_type")
  fileName      String       @map("file_name") @db.VarChar(255)
  filePath      String       @map("file_path") @db.VarChar(500)
  mimeType      String       @map("mime_type") @db.VarChar(100)
  fileSizeBytes Int          @map("file_size_bytes")
  expiryDate    DateTime?    @map("expiry_date") @db.Date
  uploadedAt    DateTime     @default(now()) @map("uploaded_at")
  uploadedBy    String?      @map("uploaded_by")
  notes         String?

  tenant        Tenant       @relation(fields: [tenantId], references: [id])
  staff         Staff        @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([tenantId, staffId])
  @@index([tenantId, documentType])
  @@index([expiryDate])
  @@map("staff_documents")
}

model OnboardingChecklist {
  id                  String              @id @default(uuid())
  tenantId            String              @map("tenant_id")
  staffId             String              @unique @map("staff_id")
  status              OnboardingStatus    @default(NOT_STARTED)
  startedAt           DateTime?           @map("started_at")
  completedAt         DateTime?           @map("completed_at")
  welcomePackSentAt   DateTime?           @map("welcome_pack_sent_at")
  probationEndDate    DateTime?           @map("probation_end_date") @db.Date
  review30DayDate     DateTime?           @map("review_30_day_date") @db.Date
  review60DayDate     DateTime?           @map("review_60_day_date") @db.Date
  review90DayDate     DateTime?           @map("review_90_day_date") @db.Date
  review30Completed   Boolean             @default(false) @map("review_30_completed")
  review60Completed   Boolean             @default(false) @map("review_60_completed")
  review90Completed   Boolean             @default(false) @map("review_90_completed")
  notes               String?
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")

  tenant              Tenant              @relation(fields: [tenantId], references: [id])
  staff               Staff               @relation(fields: [staffId], references: [id], onDelete: Cascade)
  items               ChecklistItem[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@map("onboarding_checklists")
}

model ChecklistItem {
  id              String              @id @default(uuid())
  checklistId     String              @map("checklist_id")
  itemCode        String              @map("item_code") @db.VarChar(50)
  itemName        String              @map("item_name") @db.VarChar(200)
  category        String              @db.VarChar(50)
  isRequired      Boolean             @default(true) @map("is_required")
  status          ChecklistItemStatus @default(PENDING)
  completedAt     DateTime?           @map("completed_at")
  completedBy     String?             @map("completed_by")
  documentId      String?             @map("document_id")
  notes           String?
  sortOrder       Int                 @default(0) @map("sort_order")

  checklist       OnboardingChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)

  @@unique([checklistId, itemCode])
  @@index([checklistId, status])
  @@map("checklist_items")
}
```

## Update Staff model - ADD these relations:
```prisma
model Staff {
  // ... existing fields ...

  documents           StaffDocument[]
  onboardingChecklist OnboardingChecklist?

  @@map("staff")
}

## Update Tenant model - ADD these relations:
model Tenant {
  // ... existing fields ...

  staffDocuments       StaffDocument[]
  onboardingChecklists OnboardingChecklist[]

  @@map("tenants")
}
```
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/database/services/onboarding.service.ts

```typescript
/**
 * Staff Onboarding Service
 * TASK-STAFF-001: Staff Onboarding Workflow with Welcome Pack
 *
 * Responsibilities:
 * - Create and manage onboarding checklists
 * - Track document uploads and validation
 * - Generate welcome pack PDFs
 * - Schedule probation reviews
 * - DSD compliance verification
 */

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepository: StaffRepository,
    private readonly documentService: StaffDocumentService,
    private readonly pdfService: WelcomePackPdfService,
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * Initialize onboarding for new staff member
   * Creates checklist with all required items
   */
  async initializeOnboarding(staffId: string): Promise<OnboardingChecklist>

  /**
   * Get standard checklist items for childcare staff
   * Includes BCEA, DSD, POPIA requirements
   */
  getStandardChecklistItems(): ChecklistItemTemplate[]

  /**
   * Update checklist item status
   * Optionally link uploaded document
   */
  async updateChecklistItem(
    checklistId: string,
    itemCode: string,
    status: ChecklistItemStatus,
    documentId?: string,
  ): Promise<ChecklistItem>

  /**
   * Calculate probation dates based on start date
   * Default: 3 months with 30/60/90 day reviews
   */
  calculateProbationDates(startDate: Date): ProbationDates

  /**
   * Generate welcome pack PDF bundle
   * Includes: contract, handbook, POPIA consent, emergency forms
   */
  async generateWelcomePack(staffId: string): Promise<Buffer>

  /**
   * Check DSD compliance status
   * Returns list of missing/expired documents
   */
  async checkDsdCompliance(staffId: string): Promise<DsdComplianceResult>

  /**
   * Get onboarding progress summary
   */
  async getOnboardingProgress(staffId: string): Promise<OnboardingProgress>

  /**
   * Mark onboarding as complete
   * Validates all required items are done
   */
  async completeOnboarding(staffId: string): Promise<OnboardingChecklist>
}
```

## src/database/services/staff-document.service.ts

```typescript
/**
 * Staff Document Service
 * Handles document upload, storage, and validation
 */

@Injectable()
export class StaffDocumentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Upload document for staff member
   * Stores file locally, validates type and size
   */
  async uploadDocument(
    tenantId: string,
    staffId: string,
    documentType: DocumentType,
    file: Express.Multer.File,
    expiryDate?: Date,
  ): Promise<StaffDocument>

  /**
   * Get all documents for staff member
   */
  async getDocuments(staffId: string): Promise<StaffDocument[]>

  /**
   * Get documents expiring within N days
   * For compliance reminders
   */
  async getExpiringDocuments(
    tenantId: string,
    daysUntilExpiry: number,
  ): Promise<StaffDocument[]>

  /**
   * Delete document and remove file
   */
  async deleteDocument(documentId: string): Promise<void>

  /**
   * Get file path for download
   */
  async getDocumentPath(documentId: string): Promise<string>
}
```

## src/database/services/welcome-pack-pdf.service.ts

```typescript
/**
 * Welcome Pack PDF Generator
 * Creates professional PDF bundle for new staff
 */

@Injectable()
export class WelcomePackPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Generate complete welcome pack PDF
   * Includes all required onboarding documents
   */
  async generateWelcomePack(staff: Staff, tenant: Tenant): Promise<Buffer>

  /**
   * Generate employment contract from template
   */
  async generateContract(staff: Staff, tenant: Tenant): Promise<Buffer>

  /**
   * Generate POPIA consent form
   */
  async generatePopiaConsent(staff: Staff, tenant: Tenant): Promise<Buffer>

  /**
   * Generate banking details form
   */
  async generateBankingForm(staff: Staff): Promise<Buffer>

  /**
   * Generate emergency contact form
   */
  async generateEmergencyForm(staff: Staff): Promise<Buffer>
}
```
</service_files>

<!-- ============================================ -->
<!-- API ENDPOINTS                                -->
<!-- ============================================ -->

<api_endpoints>
## src/api/staff/onboarding.controller.ts

```typescript
@Controller('staff/:staffId/onboarding')
@UseGuards(JwtAuthGuard, TenantGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Post('initialize')
  async initializeOnboarding(@Param('staffId') staffId: string)

  @Get()
  async getOnboardingStatus(@Param('staffId') staffId: string)

  @Get('checklist')
  async getChecklist(@Param('staffId') staffId: string)

  @Patch('checklist/:itemCode')
  async updateChecklistItem(
    @Param('staffId') staffId: string,
    @Param('itemCode') itemCode: string,
    @Body() dto: UpdateChecklistItemDto,
  )

  @Post('welcome-pack/generate')
  async generateWelcomePack(@Param('staffId') staffId: string)

  @Get('welcome-pack/download')
  async downloadWelcomePack(
    @Param('staffId') staffId: string,
    @Res() res: Response,
  )

  @Get('compliance/dsd')
  async checkDsdCompliance(@Param('staffId') staffId: string)

  @Post('complete')
  async completeOnboarding(@Param('staffId') staffId: string)
}

@Controller('staff/:staffId/documents')
@UseGuards(JwtAuthGuard, TenantGuard)
export class StaffDocumentController {
  constructor(private readonly documentService: StaffDocumentService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Param('staffId') staffId: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  )

  @Get()
  async getDocuments(@Param('staffId') staffId: string)

  @Get(':documentId/download')
  async downloadDocument(
    @Param('documentId') documentId: string,
    @Res() res: Response,
  )

  @Delete(':documentId')
  async deleteDocument(@Param('documentId') documentId: string)
}
```
</api_endpoints>

<!-- ============================================ -->
<!-- UI COMPONENTS                                -->
<!-- ============================================ -->

<ui_components>
## apps/web/src/components/staff/OnboardingWizard.tsx

Multi-step wizard with the following steps:
1. Personal Details (pre-filled from staff record)
2. Employment Details (contract type, start date, salary)
3. Document Upload (ID, tax cert, bank confirmation)
4. DSD Compliance (police clearance, medical, First Aid)
5. POPIA Consent (digital signature)
6. Review & Complete

## apps/web/src/components/staff/OnboardingChecklist.tsx

Visual checklist showing:
- Required vs optional items
- Completion status with icons
- Document upload integration
- Expiry date warnings

## apps/web/src/components/staff/OnboardingDashboard.tsx

HR dashboard showing:
- Staff with pending onboarding
- Overdue checklist items
- Expiring documents
- Probation reviews due
- Compliance status summary

## apps/web/src/app/(dashboard)/staff/[id]/onboarding/page.tsx

Staff onboarding detail page with:
- OnboardingWizard component
- Document list with upload
- Checklist progress
- Welcome pack download
</ui_components>

<!-- ============================================ -->
<!-- STANDARD CHECKLIST ITEMS                     -->
<!-- ============================================ -->

<checklist_items>
## Standard Onboarding Checklist Items

### Category: DOCUMENTATION (Required)
| Code | Name | Required | Expiry |
|------|------|----------|--------|
| DOC_ID | ID Document Copy | Yes | No |
| DOC_TAX | Tax Number Certificate | Yes | No |
| DOC_BANK | Bank Confirmation Letter | Yes | No |
| DOC_CONTRACT | Signed Employment Contract | Yes | No |

### Category: DSD_COMPLIANCE (Required for Childcare)
| Code | Name | Required | Expiry |
|------|------|----------|--------|
| DSD_POLICE | Police Clearance Certificate | Yes | 6 months |
| DSD_MEDICAL | Medical Fitness Certificate | Yes | 12 months |
| DSD_FIRSTAID | First Aid Level 1 Certificate | Recommended | 3 years |
| DSD_ECD | ECD Qualification Verification | If applicable | No |
| DSD_CHILD_PROTECT | Child Protection Training | Recommended | 2 years |

### Category: LEGAL (Required)
| Code | Name | Required | Expiry |
|------|------|----------|--------|
| LEGAL_POPIA | POPIA Consent Form | Yes | No |
| LEGAL_HANDBOOK | Staff Handbook Acknowledgment | Yes | No |
| LEGAL_CODE_CONDUCT | Code of Conduct Signed | Yes | No |

### Category: ADMIN (Required)
| Code | Name | Required | Expiry |
|------|------|----------|--------|
| ADMIN_EMERGENCY | Emergency Contact Form | Yes | No |
| ADMIN_UIF | UIF Registration (UI-8) | Yes | No |
| ADMIN_SYSTEM | System Access Created | Yes | No |
</checklist_items>

<!-- ============================================ -->
<!-- VERIFICATION                                 -->
<!-- ============================================ -->

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
npx prisma migrate dev --name add_staff_onboarding

# 2. Generate Prisma client
npx prisma generate

# 3. Create entity files
# - src/database/entities/staff-document.entity.ts
# - src/database/entities/onboarding-checklist.entity.ts

# 4. Create DTO files
# - src/database/dto/staff-document.dto.ts
# - src/database/dto/onboarding.dto.ts

# 5. Create repository files
# - src/database/repositories/staff-document.repository.ts
# - src/database/repositories/onboarding-checklist.repository.ts

# 6. Create service files
# - src/database/services/onboarding.service.ts
# - src/database/services/staff-document.service.ts
# - src/database/services/welcome-pack-pdf.service.ts

# 7. Create controller files
# - src/api/staff/onboarding.controller.ts
# - src/api/staff/staff-document.controller.ts

# 8. Create UI components
# - apps/web/src/components/staff/OnboardingWizard.tsx
# - apps/web/src/components/staff/OnboardingChecklist.tsx
# - apps/web/src/components/staff/OnboardingDashboard.tsx
# - apps/web/src/app/(dashboard)/staff/[id]/onboarding/page.tsx

# 9. Update API hooks
# - apps/web/src/hooks/use-staff-onboarding.ts

# 10. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Multi-step wizard must save progress between steps
    - Document uploads must validate file type and size (max 10MB)
    - DSD compliance items must track expiry dates
    - Police clearance must be within 6 months
    - Welcome pack PDF must be professional A4 format
    - All BCEA contract requirements must be included
    - Probation dates auto-calculated from start date
    - Real-time checklist status updates
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - All onboarding API endpoints return correct data
    - Document upload/download works correctly
    - Welcome pack PDF generates with all sections
    - DSD compliance check returns accurate status
    - Checklist items can be marked complete
    - Probation review reminders scheduled correctly
    - UI wizard allows step navigation
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Store documents in database BLOBs (use file system)
  - Skip POPIA consent form
  - Allow onboarding completion with missing required items
  - Generate contracts without all BCEA required fields
  - Use hardcoded paths for document storage
  - Skip validation on document uploads
  - Forget tenant isolation on all queries
</anti_patterns>

</task_spec>

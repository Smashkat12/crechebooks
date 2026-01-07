<task_spec id="TASK-STAFF-002" version="1.0">

<metadata>
  <title>Staff Offboarding Workflow with Exit Pack</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>172</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-003</requirement_ref>
    <requirement_ref>REQ-STAFF-004</requirement_ref>
    <requirement_ref>REQ-HR-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-001</task_ref>
    <task_ref status="complete">TASK-SARS-012</task_ref>
    <task_ref status="complete">TASK-SARS-013</task_ref>
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

  **Existing Entities:**
  - Staff with endDate field (nullable)
  - Payroll with PAYE/UIF calculations
  - EMP201 generation service
  - IRP5 generation service

  **Existing Services:**
  - PAYE calculation (2024/2025 tax brackets)
  - UIF calculation (1% employee + 1% employer)
  - Leave balance tracking (basic)

  **Reference Pattern:**
  - OffboardingDialog.tsx (enrollment offboarding) - can be adapted
  - offboarding.service.ts (enrollment) - settlement preview pattern
</project_state>

<context>
  ## South African HR Offboarding Legal Requirements

  ### BCEA (Basic Conditions of Employment Act) Requirements:
  - Notice period based on tenure (Section 37):
    * < 6 months: 1 week notice
    * 6 months - 1 year: 2 weeks notice
    * > 1 year: 4 weeks notice
  - Final pay must be paid within 7 days of termination
  - Leave payout for accrued annual leave (Section 40)
  - Written notice of termination required

  ### UIF (Unemployment Insurance Fund) Requirements:
  - UI-19 form must be completed for ALL terminations
  - Form must be provided within 14 days of termination
  - Required for employee to claim UIF benefits
  - Must include: reason for termination, last day worked, earnings history

  ### SARS (Tax) Requirements:
  - IRP5 tax certificate for tax year
  - Final PAYE calculation up to termination date
  - UIF contributions up to termination date

  ### Certificate of Service (BCEA Section 42):
  - Employee entitled to certificate on request
  - Must include: dates of employment, job title, remuneration at termination
  - Cannot include reason for termination unless employee requests

  ### Final Pay Calculation (BCEA):
  - Outstanding salary (pro-rata to last working day)
  - Accrued annual leave payout (formula: monthly salary / 21.67 × leave days)
  - Notice pay (if employer pays out notice period)
  - Pro-rata bonus (if applicable per contract)
  - Deductions: outstanding advances, company property not returned
</context>

<scope>
  <in_scope>
    - Add StaffOffboarding entity for tracking exit process
    - Create OffboardingDialog component (adapt from enrollment pattern)
    - Implement final pay calculation service
    - Generate UI-19 form (UIF declaration)
    - Generate Certificate of Service
    - Calculate leave balance payout
    - Create Exit Pack PDF bundle
    - Add exit interview form (optional)
    - Add asset return checklist
    - Integrate with existing payroll for final pay
  </in_scope>
  <out_of_scope>
    - Staff onboarding (TASK-STAFF-001)
    - Xero integration for final payslip (TASK-STAFF-003)
    - SimplePay integration (TASK-STAFF-004)
    - Rehire functionality
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma

```prisma
enum OffboardingReason {
  RESIGNATION
  TERMINATION
  RETIREMENT
  DEATH
  CONTRACT_END
  MUTUAL_AGREEMENT
  RETRENCHMENT
  DISMISSAL
  ABSCONDED
}

enum OffboardingStatus {
  INITIATED
  IN_PROGRESS
  PENDING_FINAL_PAY
  COMPLETED
  CANCELLED
}

enum AssetReturnStatus {
  NOT_APPLICABLE
  PENDING
  RETURNED
  NOT_RETURNED
  WRITE_OFF
}

model StaffOffboarding {
  id                    String              @id @default(uuid())
  tenantId              String              @map("tenant_id")
  staffId               String              @unique @map("staff_id")
  status                OffboardingStatus   @default(INITIATED)
  reason                OffboardingReason
  initiatedAt           DateTime            @default(now()) @map("initiated_at")
  initiatedBy           String?             @map("initiated_by")
  lastWorkingDay        DateTime            @map("last_working_day") @db.Date
  noticePeriodDays      Int                 @map("notice_period_days")
  noticePeriodWaived    Boolean             @default(false) @map("notice_period_waived")

  // Final Pay Calculation
  outstandingSalaryCents    Int             @default(0) @map("outstanding_salary_cents")
  leavePayoutCents          Int             @default(0) @map("leave_payout_cents")
  leaveBalanceDays          Decimal         @default(0) @map("leave_balance_days") @db.Decimal(5, 2)
  noticePayCents            Int             @default(0) @map("notice_pay_cents")
  proRataBonusCents         Int             @default(0) @map("pro_rata_bonus_cents")
  otherEarningsCents        Int             @default(0) @map("other_earnings_cents")
  deductionsCents           Int             @default(0) @map("deductions_cents")
  finalPayGrossCents        Int             @default(0) @map("final_pay_gross_cents")
  finalPayNetCents          Int             @default(0) @map("final_pay_net_cents")

  // Documents Generated
  ui19GeneratedAt           DateTime?       @map("ui19_generated_at")
  certificateGeneratedAt    DateTime?       @map("certificate_generated_at")
  irp5GeneratedAt           DateTime?       @map("irp5_generated_at")
  exitPackGeneratedAt       DateTime?       @map("exit_pack_generated_at")

  // Exit Interview
  exitInterviewDate         DateTime?       @map("exit_interview_date")
  exitInterviewNotes        String?         @map("exit_interview_notes")
  exitInterviewCompleted    Boolean         @default(false) @map("exit_interview_completed")

  // Completion
  completedAt               DateTime?       @map("completed_at")
  completedBy               String?         @map("completed_by")
  notes                     String?

  createdAt                 DateTime        @default(now()) @map("created_at")
  updatedAt                 DateTime        @updatedAt @map("updated_at")

  tenant                    Tenant          @relation(fields: [tenantId], references: [id])
  staff                     Staff           @relation(fields: [staffId], references: [id])
  assetReturns              AssetReturn[]

  @@index([tenantId])
  @@index([tenantId, status])
  @@map("staff_offboardings")
}

model AssetReturn {
  id                String            @id @default(uuid())
  offboardingId     String            @map("offboarding_id")
  assetType         String            @map("asset_type") @db.VarChar(100)
  assetDescription  String            @map("asset_description") @db.VarChar(255)
  serialNumber      String?           @map("serial_number") @db.VarChar(100)
  status            AssetReturnStatus @default(PENDING)
  returnedAt        DateTime?         @map("returned_at")
  checkedBy         String?           @map("checked_by")
  notes             String?

  offboarding       StaffOffboarding  @relation(fields: [offboardingId], references: [id], onDelete: Cascade)

  @@index([offboardingId])
  @@map("asset_returns")
}
```

## Update Staff model - ADD relation:
```prisma
model Staff {
  // ... existing fields ...

  offboarding         StaffOffboarding?

  @@map("staff")
}

## Update Tenant model - ADD relation:
model Tenant {
  // ... existing fields ...

  staffOffboardings   StaffOffboarding[]

  @@map("tenants")
}
```
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/database/services/staff-offboarding.service.ts

```typescript
/**
 * Staff Offboarding Service
 * TASK-STAFF-002: Staff Offboarding Workflow with Exit Pack
 *
 * Responsibilities:
 * - Initiate and manage offboarding process
 * - Calculate final pay (BCEA compliant)
 * - Generate UI-19 form
 * - Generate Certificate of Service
 * - Create Exit Pack PDF bundle
 * - Track asset returns
 */

@Injectable()
export class StaffOffboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly staffRepository: StaffRepository,
    private readonly payeService: PayeCalculationService,
    private readonly uifService: UifCalculationService,
    private readonly leaveService: LeaveService,
    private readonly pdfService: ExitPackPdfService,
  ) {}

  /**
   * Initialize offboarding for staff member
   * Calculates notice period and final pay preview
   */
  async initiateOffboarding(
    staffId: string,
    reason: OffboardingReason,
    lastWorkingDay: Date,
    initiatedBy: string,
  ): Promise<StaffOffboarding>

  /**
   * Calculate required notice period based on tenure
   * BCEA Section 37 compliant
   */
  calculateNoticePeriod(startDate: Date, terminationDate: Date): number

  /**
   * Calculate final pay components
   * BCEA compliant with all required elements
   */
  async calculateFinalPay(
    staffId: string,
    lastWorkingDay: Date,
    noticePeriodWaived: boolean,
  ): Promise<FinalPayCalculation>

  /**
   * Calculate leave payout
   * Formula: (monthly salary / 21.67) × leave balance days
   */
  calculateLeavePayout(
    monthlySalaryCents: number,
    leaveBalanceDays: number,
  ): number

  /**
   * Generate settlement preview before confirmation
   */
  async getSettlementPreview(
    staffId: string,
    lastWorkingDay: Date,
  ): Promise<SettlementPreview>

  /**
   * Process offboarding (after confirmation)
   * - Marks staff as inactive
   * - Sets end date
   * - Triggers final pay processing
   */
  async processOffboarding(offboardingId: string): Promise<StaffOffboarding>

  /**
   * Add asset to return checklist
   */
  async addAssetReturn(
    offboardingId: string,
    assetType: string,
    assetDescription: string,
    serialNumber?: string,
  ): Promise<AssetReturn>

  /**
   * Mark asset as returned
   */
  async markAssetReturned(
    assetReturnId: string,
    checkedBy: string,
  ): Promise<AssetReturn>

  /**
   * Record exit interview notes
   */
  async recordExitInterview(
    offboardingId: string,
    notes: string,
    interviewDate: Date,
  ): Promise<StaffOffboarding>

  /**
   * Complete offboarding process
   * Validates all requirements met
   */
  async completeOffboarding(
    offboardingId: string,
    completedBy: string,
  ): Promise<StaffOffboarding>
}
```

## src/database/services/ui19-generator.service.ts

```typescript
/**
 * UI-19 Form Generator
 * Generates South African UIF declaration form
 */

@Injectable()
export class Ui19GeneratorService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate UI-19 form PDF
   * Required fields:
   * - Employee name, ID number
   * - Employer name, UIF reference number
   * - Reason for termination
   * - Last day of employment
   * - Remuneration details (last 13 weeks)
   */
  async generateUi19(
    staffId: string,
    offboardingId: string,
  ): Promise<Buffer>

  /**
   * Get earnings history for UI-19
   * Last 13 weeks of earnings
   */
  async getEarningsHistory(
    staffId: string,
    endDate: Date,
  ): Promise<EarningsHistoryRecord[]>

  /**
   * Map offboarding reason to UI-19 reason code
   */
  mapReasonCode(reason: OffboardingReason): string
}
```

## src/database/services/certificate-of-service.service.ts

```typescript
/**
 * Certificate of Service Generator
 * BCEA Section 42 compliant
 */

@Injectable()
export class CertificateOfServiceService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate Certificate of Service PDF
   * BCEA Section 42 requirements:
   * - Full name of employee
   * - Name of employer
   * - Description of employment
   * - Start date and end date
   * - Remuneration at termination
   * - Signed by employer
   */
  async generateCertificate(
    staffId: string,
    includeReasonForLeaving: boolean,
  ): Promise<Buffer>
}
```

## src/database/services/exit-pack-pdf.service.ts

```typescript
/**
 * Exit Pack PDF Generator
 * Creates comprehensive exit documentation bundle
 */

@Injectable()
export class ExitPackPdfService {
  constructor(
    private readonly ui19Service: Ui19GeneratorService,
    private readonly certificateService: CertificateOfServiceService,
    private readonly irp5Service: Irp5GenerationService,
    private readonly payslipService: PayslipService,
  ) {}

  /**
   * Generate complete exit pack PDF bundle
   * Includes:
   * - UI-19 form
   * - Certificate of Service
   * - IRP5 tax certificate (if mid-year)
   * - Final payslip
   * - Leave balance statement
   */
  async generateExitPack(
    staffId: string,
    offboardingId: string,
  ): Promise<Buffer>
}
```
</service_files>

<!-- ============================================ -->
<!-- API ENDPOINTS                                -->
<!-- ============================================ -->

<api_endpoints>
## src/api/staff/offboarding.controller.ts

```typescript
@Controller('staff/:staffId/offboarding')
@UseGuards(JwtAuthGuard, TenantGuard)
export class StaffOffboardingController {
  constructor(
    private readonly offboardingService: StaffOffboardingService,
  ) {}

  @Post('initiate')
  async initiateOffboarding(
    @Param('staffId') staffId: string,
    @Body() dto: InitiateOffboardingDto,
    @CurrentUser() user: User,
  )

  @Get('settlement-preview')
  async getSettlementPreview(
    @Param('staffId') staffId: string,
    @Query('lastWorkingDay') lastWorkingDay: string,
  )

  @Get()
  async getOffboardingStatus(@Param('staffId') staffId: string)

  @Patch(':offboardingId/process')
  async processOffboarding(
    @Param('offboardingId') offboardingId: string,
  )

  @Post(':offboardingId/assets')
  async addAssetReturn(
    @Param('offboardingId') offboardingId: string,
    @Body() dto: AddAssetReturnDto,
  )

  @Patch(':offboardingId/assets/:assetId/return')
  async markAssetReturned(
    @Param('assetId') assetId: string,
    @CurrentUser() user: User,
  )

  @Post(':offboardingId/exit-interview')
  async recordExitInterview(
    @Param('offboardingId') offboardingId: string,
    @Body() dto: ExitInterviewDto,
  )

  @Get(':offboardingId/ui19')
  async downloadUi19(
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  )

  @Get(':offboardingId/certificate')
  async downloadCertificate(
    @Param('offboardingId') offboardingId: string,
    @Query('includeReason') includeReason: boolean,
    @Res() res: Response,
  )

  @Get(':offboardingId/exit-pack')
  async downloadExitPack(
    @Param('offboardingId') offboardingId: string,
    @Res() res: Response,
  )

  @Post(':offboardingId/complete')
  async completeOffboarding(
    @Param('offboardingId') offboardingId: string,
    @CurrentUser() user: User,
  )
}
```
</api_endpoints>

<!-- ============================================ -->
<!-- UI COMPONENTS                                -->
<!-- ============================================ -->

<ui_components>
## apps/web/src/components/staff/OffboardingDialog.tsx

Dialog component with steps:
1. **Initiate**: Select reason, last working day
2. **Settlement Preview**: Show final pay calculation breakdown
3. **Asset Checklist**: Add/check returned assets
4. **Exit Interview**: Optional notes capture
5. **Confirm**: Review all details, generate documents
6. **Complete**: Download exit pack, mark complete

## apps/web/src/components/staff/FinalPayBreakdown.tsx

Display component showing:
- Outstanding salary (pro-rata)
- Leave payout (days × daily rate)
- Notice pay (if applicable)
- Pro-rata bonus (if applicable)
- Deductions (advances, property)
- PAYE on final pay
- UIF on final pay
- Net final pay amount

## apps/web/src/components/staff/AssetReturnChecklist.tsx

Checklist component for:
- Keys/access cards
- Company laptop/phone
- Uniform
- Training materials
- Other assets

## apps/web/src/components/staff/ExitInterviewForm.tsx

Form for capturing:
- Reason for leaving (if voluntary)
- Work experience feedback
- Management feedback
- Recommendations for improvement
- Would recommend employer (Y/N)
</ui_components>

<!-- ============================================ -->
<!-- FINAL PAY CALCULATION LOGIC                  -->
<!-- ============================================ -->

<final_pay_calculation>
## Final Pay Calculation Formula (BCEA Compliant)

```typescript
interface FinalPayCalculation {
  // Earnings
  outstandingSalaryCents: number;    // Pro-rata salary to last working day
  leavePayoutCents: number;          // Accrued leave × daily rate
  noticePayCents: number;            // If notice waived by employer
  proRataBonusCents: number;         // If contractually entitled
  otherEarningsCents: number;        // Commissions, allowances, etc.
  grossEarningsCents: number;

  // Deductions
  payeCents: number;                 // Tax on final pay
  uifEmployeeCents: number;          // 1% employee contribution
  outstandingAdvancesCents: number;  // Salary advances owed
  propertyDeductionsCents: number;   // Unreturned company property
  otherDeductionsCents: number;
  totalDeductionsCents: number;

  // Net
  netPayCents: number;

  // Leave Details
  leaveBalanceDays: number;
  dailyRateCents: number;
}

// Leave Payout Formula:
// dailyRate = monthlySalary / 21.67 (average working days per month)
// leavePayout = dailyRate × leaveBalanceDays

// Notice Period (BCEA Section 37):
// < 6 months tenure: 1 week
// 6-12 months tenure: 2 weeks
// > 12 months tenure: 4 weeks
```
</final_pay_calculation>

<!-- ============================================ -->
<!-- VERIFICATION                                 -->
<!-- ============================================ -->

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
npx prisma migrate dev --name add_staff_offboarding

# 2. Generate Prisma client
npx prisma generate

# 3. Create entity files
# - src/database/entities/staff-offboarding.entity.ts

# 4. Create DTO files
# - src/database/dto/staff-offboarding.dto.ts

# 5. Create repository files
# - src/database/repositories/staff-offboarding.repository.ts

# 6. Create service files
# - src/database/services/staff-offboarding.service.ts
# - src/database/services/ui19-generator.service.ts
# - src/database/services/certificate-of-service.service.ts
# - src/database/services/exit-pack-pdf.service.ts

# 7. Create controller file
# - src/api/staff/offboarding.controller.ts

# 8. Create UI components
# - apps/web/src/components/staff/OffboardingDialog.tsx
# - apps/web/src/components/staff/FinalPayBreakdown.tsx
# - apps/web/src/components/staff/AssetReturnChecklist.tsx
# - apps/web/src/components/staff/ExitInterviewForm.tsx

# 9. Update API hooks
# - apps/web/src/hooks/use-staff-offboarding.ts

# 10. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Final pay within 7 days of termination (BCEA)
    - UI-19 form within 14 days (UIF requirement)
    - Notice period calculated per BCEA Section 37
    - Leave payout using 21.67 daily rate formula
    - Certificate of Service includes all BCEA Section 42 requirements
    - All monetary values stored in cents (integer)
    - Offboarding cannot complete without required documents
    - Settlement preview must show before confirmation
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Final pay calculation matches manual calculation
    - UI-19 PDF generates with all required fields
    - Certificate of Service includes correct dates and salary
    - Exit pack contains all documents
    - Asset checklist tracks returned items
    - Staff marked inactive after completion
    - Staff end date set correctly
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Skip UI-19 generation for any termination
  - Include reason on Certificate unless employee requests
  - Process final pay without settlement preview confirmation
  - Allow offboarding completion without required documents
  - Use floating point for money calculations
  - Forget to mark staff as inactive
  - Delete staff record (set endDate and isActive=false)
</anti_patterns>

</task_spec>

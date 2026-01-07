<task_spec id="TASK-STAFF-004" version="1.0">

<metadata>
  <title>SimplePay Integration for Payroll Processing</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>174</sequence>
  <implements>
    <requirement_ref>REQ-INT-002</requirement_ref>
    <requirement_ref>REQ-INT-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-001</task_ref>
    <task_ref status="ready">TASK-STAFF-003</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2026-01-07</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Payroll Infrastructure

  **Existing Components:**
  - Staff entity with employment details
  - Payroll entity with PAYE/UIF calculations
  - PayrollWizard UI component
  - EMP201 generation service
  - IRP5 generation service

  **SimplePay Benefits:**
  - Full SARS compliance (PAYE, UIF, SDL, ETI)
  - Automatic EMP201 generation
  - IRP5 tax certificates
  - Direct SARS eFiling via Xero Gatekeeper
  - Native Xero integration

  **Integration Approach:**
  - Optional integration (not required)
  - Sync employee data TO SimplePay
  - Import payslip data FROM SimplePay
  - Fetch IRP5/EMP201 from SimplePay
</project_state>

<context>
  ## SimplePay API Overview

  ### API Base URL
  `https://api.payroll.simplepay.cloud/v1/`

  ### Authentication
  - API key-based authentication
  - Header: `Authorization: your_api_key`
  - Keys generated at: `/external_users`

  ### Key Endpoints

  **Employees:**
  - GET /v1/clients/:client_id/employees - List all employees
  - GET /v1/employees/:id - Get employee details
  - POST /v1/clients/:client_id/employees - Create employee
  - PATCH /v1/employees/:id - Update employee
  - DELETE /v1/employees/:id - Delete employee

  **Payslips:**
  - GET /v1/employees/:employee_id/payslips - List payslips
  - GET /v1/payslips/:payslip_id - Get payslip details
  - GET /v1/payslips/:payslip_id.pdf - Download PDF payslip

  **Tax Certificates:**
  - GET /v1/employees/:employee_id/tax_certificates - IRP5 certificates

  **EMP201:**
  - GET /v1/clients/:id/submissions/emp201?date=YYYY-MM-DD - Monthly submission

  **Bulk Operations:**
  - POST /v1/clients/:client_id/bulk_input - Update multiple employees

  ### Important Limitations
  - NO webhook support (requires polling)
  - Rate limiting (undocumented limits)
  - Finalized payslips are immutable
  - Large reports require async processing

  ### Native Xero Integration
  SimplePay has built-in Xero posting:
  - Post as journal or bill
  - Cost center splitting
  - EMP201 eFiling via Xero Gatekeeper
</context>

<scope>
  <in_scope>
    - Create SimplePay API client
    - Implement employee sync (CrecheBooks → SimplePay)
    - Import payslip data from SimplePay
    - Fetch IRP5 certificates
    - Fetch EMP201 data
    - Create SimplePay connection settings page
    - Add sync status tracking
    - Handle API errors and retries
  </in_scope>
  <out_of_scope>
    - Full payroll processing in SimplePay (manual via their UI)
    - SimplePay to Xero posting (use their native integration)
    - Webhook real-time sync (not available)
    - Creating payroll runs in SimplePay via API
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- DATA MODEL ADDITIONS                        -->
<!-- ============================================ -->

<prisma_schema_additions>
## Add to prisma/schema.prisma

```prisma
enum SimplePaySyncStatus {
  NOT_SYNCED
  SYNCED
  SYNC_FAILED
  OUT_OF_SYNC
}

model SimplePayConnection {
  id                String    @id @default(uuid())
  tenantId          String    @unique @map("tenant_id")
  clientId          String    @map("client_id") @db.VarChar(50)
  apiKey            String    @map("api_key") @db.VarChar(255)  // Encrypted
  isActive          Boolean   @default(true) @map("is_active")
  lastSyncAt        DateTime? @map("last_sync_at")
  syncErrorMessage  String?   @map("sync_error_message")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  tenant            Tenant    @relation(fields: [tenantId], references: [id])

  @@map("simplepay_connections")
}

model SimplePayEmployeeMapping {
  id                  String              @id @default(uuid())
  tenantId            String              @map("tenant_id")
  staffId             String              @unique @map("staff_id")
  simplePayEmployeeId String              @map("simplepay_employee_id") @db.VarChar(50)
  syncStatus          SimplePaySyncStatus @default(NOT_SYNCED) @map("sync_status")
  lastSyncAt          DateTime?           @map("last_sync_at")
  lastSyncError       String?             @map("last_sync_error")
  createdAt           DateTime            @default(now()) @map("created_at")
  updatedAt           DateTime            @updatedAt @map("updated_at")

  tenant              Tenant              @relation(fields: [tenantId], references: [id])
  staff               Staff               @relation(fields: [staffId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([simplePayEmployeeId])
  @@map("simplepay_employee_mappings")
}

model SimplePayPayslipImport {
  id                  String    @id @default(uuid())
  tenantId            String    @map("tenant_id")
  staffId             String    @map("staff_id")
  simplePayPayslipId  String    @map("simplepay_payslip_id") @db.VarChar(50)
  payPeriodStart      DateTime  @map("pay_period_start") @db.Date
  payPeriodEnd        DateTime  @map("pay_period_end") @db.Date
  grossSalaryCents    Int       @map("gross_salary_cents")
  netSalaryCents      Int       @map("net_salary_cents")
  payeCents           Int       @map("paye_cents")
  uifEmployeeCents    Int       @map("uif_employee_cents")
  uifEmployerCents    Int       @map("uif_employer_cents")
  payslipData         Json      @map("payslip_data")
  importedAt          DateTime  @default(now()) @map("imported_at")

  tenant              Tenant    @relation(fields: [tenantId], references: [id])
  staff               Staff     @relation(fields: [staffId], references: [id])

  @@unique([tenantId, staffId, simplePayPayslipId])
  @@index([tenantId, staffId])
  @@map("simplepay_payslip_imports")
}
```

## Update Staff model - ADD relation:
```prisma
model Staff {
  // ... existing fields ...

  simplePayMapping    SimplePayEmployeeMapping?
  simplePayPayslips   SimplePayPayslipImport[]

  @@map("staff")
}

## Update Tenant model - ADD relations:
model Tenant {
  // ... existing fields ...

  simplePayConnection       SimplePayConnection?
  simplePayEmployeeMappings SimplePayEmployeeMapping[]
  simplePayPayslipImports   SimplePayPayslipImport[]

  @@map("tenants")
}
```
</prisma_schema_additions>

<!-- ============================================ -->
<!-- SERVICE IMPLEMENTATION                       -->
<!-- ============================================ -->

<service_files>
## src/integrations/simplepay/simplepay-api.client.ts

```typescript
/**
 * SimplePay API Client
 * Low-level HTTP client for SimplePay API
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

@Injectable()
export class SimplePayApiClient {
  private readonly baseUrl = 'https://api.payroll.simplepay.cloud/v1';
  private axiosInstance: AxiosInstance;

  constructor(
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Initialize client with API key for tenant
   */
  async initializeForTenant(tenantId: string): Promise<void>

  /**
   * GET request with error handling
   */
  async get<T>(endpoint: string): Promise<T>

  /**
   * POST request with error handling
   */
  async post<T>(endpoint: string, data: any): Promise<T>

  /**
   * PATCH request with error handling
   */
  async patch<T>(endpoint: string, data: any): Promise<T>

  /**
   * DELETE request with error handling
   */
  async delete(endpoint: string): Promise<void>

  /**
   * Download PDF file
   */
  async downloadPdf(endpoint: string): Promise<Buffer>

  /**
   * Handle rate limiting with exponential backoff
   */
  private handleRateLimit(error: any): Promise<void>
}
```

## src/integrations/simplepay/simplepay-employee.service.ts

```typescript
/**
 * SimplePay Employee Service
 * Syncs CrecheBooks staff to SimplePay employees
 */

@Injectable()
export class SimplePayEmployeeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: SimplePayApiClient,
    private readonly staffRepository: StaffRepository,
  ) {}

  /**
   * Sync single employee to SimplePay
   * Creates or updates based on mapping
   */
  async syncEmployee(staffId: string): Promise<SimplePayEmployeeMapping>

  /**
   * Sync all employees for tenant
   */
  async syncAllEmployees(tenantId: string): Promise<SyncResult>

  /**
   * Map CrecheBooks staff to SimplePay employee format
   */
  mapToSimplePayFormat(staff: Staff): SimplePayEmployeeInput

  /**
   * Get sync status for staff member
   */
  async getSyncStatus(staffId: string): Promise<SimplePaySyncStatus>

  /**
   * Fetch employee from SimplePay
   */
  async fetchEmployee(simplePayId: string): Promise<SimplePayEmployee>

  /**
   * Compare local vs SimplePay data
   * Returns differences if out of sync
   */
  async compareEmployee(staffId: string): Promise<SyncComparison>
}
```

## src/integrations/simplepay/simplepay-payslip.service.ts

```typescript
/**
 * SimplePay Payslip Service
 * Imports payslip data from SimplePay
 */

@Injectable()
export class SimplePayPayslipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: SimplePayApiClient,
  ) {}

  /**
   * Import payslips for employee
   * Fetches from SimplePay and stores locally
   */
  async importPayslips(
    staffId: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<SimplePayPayslipImport[]>

  /**
   * Import payslips for all employees
   */
  async importAllPayslips(
    tenantId: string,
    payPeriodStart: Date,
    payPeriodEnd: Date,
  ): Promise<BulkImportResult>

  /**
   * Get payslip PDF from SimplePay
   */
  async getPayslipPdf(simplePayPayslipId: string): Promise<Buffer>

  /**
   * Get imported payslips for staff member
   */
  async getImportedPayslips(staffId: string): Promise<SimplePayPayslipImport[]>

  /**
   * Compare SimplePay payslip with local payroll
   */
  async compareWithLocalPayroll(
    staffId: string,
    payPeriodStart: Date,
  ): Promise<PayrollComparison>
}
```

## src/integrations/simplepay/simplepay-tax.service.ts

```typescript
/**
 * SimplePay Tax Service
 * Fetches IRP5 and EMP201 data from SimplePay
 */

@Injectable()
export class SimplePayTaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: SimplePayApiClient,
  ) {}

  /**
   * Fetch IRP5 certificates for employee
   */
  async fetchIrp5Certificates(
    staffId: string,
    taxYear?: number,
  ): Promise<SimplePayIrp5[]>

  /**
   * Get IRP5 PDF from SimplePay
   */
  async getIrp5Pdf(
    simplePayEmployeeId: string,
    taxYear: number,
  ): Promise<Buffer>

  /**
   * Fetch EMP201 data for period
   */
  async fetchEmp201(
    tenantId: string,
    periodDate: Date,
  ): Promise<SimplePayEmp201>

  /**
   * Compare SimplePay EMP201 with local calculation
   */
  async compareEmp201(
    tenantId: string,
    periodDate: Date,
  ): Promise<Emp201Comparison>
}
```

## src/integrations/simplepay/simplepay-connection.service.ts

```typescript
/**
 * SimplePay Connection Service
 * Manages SimplePay API connection and credentials
 */

@Injectable()
export class SimplePayConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly apiClient: SimplePayApiClient,
    private readonly encryptionService: EncryptionService,
  ) {}

  /**
   * Create or update SimplePay connection
   * API key is encrypted before storage
   */
  async setupConnection(
    tenantId: string,
    clientId: string,
    apiKey: string,
  ): Promise<SimplePayConnection>

  /**
   * Test connection by fetching client info
   */
  async testConnection(tenantId: string): Promise<boolean>

  /**
   * Get connection status
   */
  async getConnectionStatus(tenantId: string): Promise<ConnectionStatus>

  /**
   * Disconnect SimplePay integration
   * Removes credentials but keeps historical data
   */
  async disconnect(tenantId: string): Promise<void>

  /**
   * Get decrypted API key for use
   */
  async getApiKey(tenantId: string): Promise<string>
}
```
</service_files>

<!-- ============================================ -->
<!-- API ENDPOINTS                                -->
<!-- ============================================ -->

<api_endpoints>
## src/api/integrations/simplepay.controller.ts

```typescript
@Controller('integrations/simplepay')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SimplePayController {
  constructor(
    private readonly connectionService: SimplePayConnectionService,
    private readonly employeeService: SimplePayEmployeeService,
    private readonly payslipService: SimplePayPayslipService,
    private readonly taxService: SimplePayTaxService,
  ) {}

  // Connection Management
  @Post('connect')
  async setupConnection(
    @CurrentTenant() tenantId: string,
    @Body() dto: SetupConnectionDto,
  )

  @Get('status')
  async getConnectionStatus(@CurrentTenant() tenantId: string)

  @Post('test')
  async testConnection(@CurrentTenant() tenantId: string)

  @Delete('disconnect')
  async disconnect(@CurrentTenant() tenantId: string)

  // Employee Sync
  @Post('employees/:staffId/sync')
  async syncEmployee(@Param('staffId') staffId: string)

  @Post('employees/sync-all')
  async syncAllEmployees(@CurrentTenant() tenantId: string)

  @Get('employees/:staffId/status')
  async getEmployeeSyncStatus(@Param('staffId') staffId: string)

  @Get('employees/:staffId/compare')
  async compareEmployee(@Param('staffId') staffId: string)

  // Payslip Import
  @Post('payslips/import')
  async importPayslips(
    @CurrentTenant() tenantId: string,
    @Body() dto: ImportPayslipsDto,
  )

  @Get('employees/:staffId/payslips')
  async getImportedPayslips(@Param('staffId') staffId: string)

  @Get('payslips/:id/pdf')
  async downloadPayslipPdf(
    @Param('id') id: string,
    @Res() res: Response,
  )

  // Tax Documents
  @Get('employees/:staffId/irp5')
  async fetchIrp5(@Param('staffId') staffId: string, @Query('year') year: number)

  @Get('employees/:staffId/irp5/:year/pdf')
  async downloadIrp5Pdf(
    @Param('staffId') staffId: string,
    @Param('year') year: number,
    @Res() res: Response,
  )

  @Get('emp201')
  async fetchEmp201(
    @CurrentTenant() tenantId: string,
    @Query('date') date: string,
  )
}
```
</api_endpoints>

<!-- ============================================ -->
<!-- UI COMPONENTS                                -->
<!-- ============================================ -->

<ui_components>
## apps/web/src/components/integrations/SimplepayConnectionForm.tsx

Form for setting up SimplePay connection:
- Client ID input
- API key input (masked)
- Test connection button
- Connection status indicator
- Disconnect button

## apps/web/src/components/integrations/SimplepaySyncStatus.tsx

Status component showing:
- Connection status (connected/disconnected)
- Last sync date/time
- Employees synced count
- Sync errors if any
- Sync now button

## apps/web/src/components/staff/SimplepaySyncBadge.tsx

Badge showing sync status for individual staff:
- Synced (green)
- Not synced (gray)
- Out of sync (yellow)
- Sync failed (red)
- Click to sync

## apps/web/src/app/(dashboard)/settings/integrations/simplepay/page.tsx

Settings page for:
- Connection setup
- Sync configuration
- Employee mapping table
- Import history
</ui_components>

<!-- ============================================ -->
<!-- EMPLOYEE FIELD MAPPING                       -->
<!-- ============================================ -->

<field_mapping>
## CrecheBooks to SimplePay Field Mapping

| CrecheBooks Staff | SimplePay Employee | Notes |
|-------------------|-------------------|-------|
| firstName | first_name | Required |
| lastName | last_name | Required |
| idNumber | identification_number | SA ID |
| taxNumber | tax_number | SARS tax reference |
| email | email | Optional |
| phone | mobile | Optional |
| dateOfBirth | birthdate | Required |
| startDate | appointment_date | Required |
| endDate | termination_date | If terminated |
| employmentType | employment_type | Map to SimplePay types |
| basicSalaryCents | basic_salary | Convert from cents |
| bankName | bank_name | Optional |
| bankAccount | bank_account | Optional |
| bankBranchCode | branch_code | Optional |

## SimplePay Employment Types
- full_time → PERMANENT
- part_time → CONTRACT
- casual → CASUAL
- temporary → CONTRACT
</field_mapping>

<!-- ============================================ -->
<!-- VERIFICATION                                 -->
<!-- ============================================ -->

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
npx prisma migrate dev --name add_simplepay_integration

# 2. Generate Prisma client
npx prisma generate

# 3. Create entity files
# - src/database/entities/simplepay-connection.entity.ts
# - src/database/entities/simplepay-employee-mapping.entity.ts
# - src/database/entities/simplepay-payslip-import.entity.ts

# 4. Create DTO files
# - src/database/dto/simplepay.dto.ts

# 5. Create service files
# - src/integrations/simplepay/simplepay-api.client.ts
# - src/integrations/simplepay/simplepay-connection.service.ts
# - src/integrations/simplepay/simplepay-employee.service.ts
# - src/integrations/simplepay/simplepay-payslip.service.ts
# - src/integrations/simplepay/simplepay-tax.service.ts

# 6. Create controller file
# - src/api/integrations/simplepay.controller.ts

# 7. Create UI components
# - apps/web/src/components/integrations/SimplepayConnectionForm.tsx
# - apps/web/src/components/integrations/SimplepaySyncStatus.tsx
# - apps/web/src/components/staff/SimplepaySyncBadge.tsx
# - apps/web/src/app/(dashboard)/settings/integrations/simplepay/page.tsx

# 8. Update API hooks
# - apps/web/src/hooks/use-simplepay.ts

# 9. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - API key must be encrypted at rest
    - Never log API keys or sensitive data
    - Handle rate limiting gracefully
    - Store payslip data for audit trail
    - Employee sync is unidirectional (CrecheBooks → SimplePay)
    - Cannot create payroll runs via API (SimplePay limitation)
    - Import only - do not modify SimplePay data
    - Connection is optional (system works without it)
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - Connection setup encrypts API key
    - Test connection validates credentials
    - Employee sync creates/updates in SimplePay
    - Payslip import stores data correctly
    - IRP5 PDF download works
    - EMP201 data fetch works
    - Sync status shows correctly per employee
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Store API keys in plain text
  - Rely on webhooks (not available)
  - Modify payslip data in SimplePay
  - Poll SimplePay too frequently
  - Skip error handling on API calls
  - Assume SimplePay is always available
  - Create employees in SimplePay without mapping
</anti_patterns>

</task_spec>

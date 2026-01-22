# Staff Self-Service Portal Architecture

**Document Version:** 1.0
**Date:** 2026-01-21
**Author:** System Architect
**Status:** Architecture Design

---

## Executive Summary

This document defines the architecture for a Staff Self-Service Portal for CrecheBooks. Currently, all staff HR operations (payslips, leave, documents) are managed by admin users only. This portal will empower staff members with self-service access to their employment data while maintaining strict security boundaries and POPIA compliance.

---

## Table of Contents

1. [Authentication Architecture](#1-authentication)
2. [Dashboard Feature](#2-dashboard)
3. [Payslips Feature](#3-payslips)
4. [Leave Management Feature](#4-leave-management)
5. [Tax Documents Feature](#5-tax-documents)
6. [Profile Feature](#6-profile)
7. [Documents Feature](#7-documents)
8. [Security Architecture](#8-security-architecture)
9. [Data Flow Diagrams](#9-data-flow-diagrams)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Authentication

```
FEATURE: Staff Authentication
PURPOSE: Enable staff members to securely log in with role-based access separate from admin portal
EXISTING_API:
  - apps/api/src/api/auth/strategies/jwt.strategy.ts (JWT authentication)
  - apps/api/src/api/auth/guards/jwt-auth.guard.ts
  - apps/api/src/api/auth/guards/roles.guard.ts
  - UserRole enum: OWNER, ADMIN, VIEWER, ACCOUNTANT (no STAFF role currently)
  - apps/api/src/database/entities/user.entity.ts (IUser interface)
NEW_REQUIREMENTS:
  - Add UserRole.STAFF to Prisma enum in schema.prisma
  - Create StaffUser entity linking User to Staff record
  - New endpoint: POST /api/auth/staff/login (staff-specific login)
  - New endpoint: POST /api/auth/staff/forgot-password
  - New endpoint: POST /api/auth/staff/reset-password
  - New endpoint: POST /api/auth/staff/change-password
  - New endpoint: POST /api/auth/staff/magic-link (passwordless option)
  - New middleware: StaffAuthGuard - verifies user is STAFF role + owns the staff record
  - Create staff account provisioning during onboarding workflow
COMPONENTS:
  - StaffAuthGuard: Extends RolesGuard to verify staff can only access own data
  - StaffUserService: Manages staff user account lifecycle
  - StaffInviteService: Sends invitation emails with account setup links
  - MagicLinkService: Optional passwordless authentication via email
SECURITY:
  - Staff users can ONLY access their own data (enforced via staffId matching)
  - Separate JWT audience/issuer for staff portal vs admin portal
  - Rate limiting on login endpoints (5 attempts per 15 minutes)
  - Session timeout: 8 hours (working day)
  - Require password change on first login
  - Optional MFA for staff portal
COMPLIANCE:
  - POPIA: Staff must consent to data processing during account setup
  - Audit logging for all authentication events
  - Password policy: min 8 chars, 1 uppercase, 1 number, 1 special
```

### Database Schema Changes

```prisma
// Add to UserRole enum
enum UserRole {
  OWNER
  ADMIN
  VIEWER
  ACCOUNTANT
  STAFF  // NEW - for staff self-service portal
}

// New linking table
model StaffUserLink {
  id            String   @id @default(uuid())
  userId        String   @unique @map("user_id")
  staffId       String   @unique @map("staff_id")
  activatedAt   DateTime? @map("activated_at")
  invitedAt     DateTime  @default(now()) @map("invited_at")
  invitedBy     String   @map("invited_by")

  user          User     @relation(fields: [userId], references: [id])
  staff         Staff    @relation(fields: [staffId], references: [id])

  @@map("staff_user_links")
}
```

---

## 2. Dashboard

```
FEATURE: Staff Dashboard
PURPOSE: Provide staff with at-a-glance view of pay summary, leave balance, and upcoming dates
EXISTING_API:
  - SimplePayPayslipService.getImportedPayslips() - retrieves payslip history
  - SimplePayLeaveService.getLeaveBalancesByStaff() - gets leave balances
  - StaffRepository.findById() - staff details
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/dashboard
  - Returns: next pay date, latest payslip summary, leave balances, important announcements
  - Aggregate data from multiple sources in single call for performance
COMPONENTS:
  - StaffDashboardCard: Pay summary with gross/net for latest period
  - LeaveBalanceSummary: Visual display of Annual, Sick, Family leave balances
  - UpcomingDatesWidget: Next pay date, leave dates, document expiry alerts
  - AnnouncementsSection: Company-wide or personal announcements
  - QuickActionsBar: Links to request leave, view payslips, update profile
SECURITY:
  - StaffAuthGuard ensures user can only see own dashboard
  - No sensitive data (full bank account, ID number) on dashboard
  - tenantId + staffId validation on every request
COMPLIANCE:
  - POPIA: Mask sensitive fields (show last 4 of bank account only)
  - Display POPIA consent status reminder if not completed
```

### API Response Structure

```typescript
interface StaffDashboardResponse {
  staff: {
    firstName: string;
    lastName: string;
    employeeNumber: string;
    position: string;
    startDate: Date;
  };
  paySummary: {
    nextPayDate: Date;
    latestPayslip: {
      period: string;
      grossCents: number;
      netCents: number;
      payDate: Date;
    } | null;
  };
  leaveBalances: {
    annual: { balance: number; unit: 'days' };
    sick: { balance: number; unit: 'days' };
    family: { balance: number; unit: 'days' };
  };
  pendingLeaveRequests: number;
  expiringDocuments: Array<{
    documentType: string;
    expiryDate: Date;
    daysUntilExpiry: number;
  }>;
  announcements: Array<{
    id: string;
    title: string;
    message: string;
    createdAt: Date;
  }>;
}
```

---

## 3. Payslips

```
FEATURE: Payslip Access
PURPOSE: Allow staff to view and download their payslips with historical access
EXISTING_API:
  - apps/api/src/integrations/simplepay/simplepay-payslip.service.ts
    - importPayslips(): Imports payslips from SimplePay for a staff member
    - getImportedPayslips(): Retrieves cached payslips from database
    - getPayslipPdf(): Downloads PDF from SimplePay
  - apps/api/src/database/repositories/simplepay.repository.ts
    - findPayslipImportsByStaff(): Query payslips by staffId
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/payslips (list with pagination)
  - New endpoint: GET /api/staff-portal/payslips/:payslipId (single payslip details)
  - New endpoint: GET /api/staff-portal/payslips/:payslipId/pdf (download PDF)
  - New endpoint: GET /api/staff-portal/payslips/tax-year/:year (filtered by tax year)
  - Staff-only access decorator that auto-injects staffId from JWT
  - Modify existing service to support staff-initiated calls (not just admin)
COMPONENTS:
  - PayslipListPage: Table view with period, gross, net, deductions summary
  - PayslipDetailView: Full breakdown - earnings, deductions, employer contributions
  - PayslipPdfDownload: Download button with loading state
  - TaxYearFilter: Dropdown to filter by SA tax year (Mar-Feb)
  - PayslipSearch: Search by month/year
SECURITY:
  - StaffAuthGuard + staffId ownership check on every endpoint
  - Payslip PDF download logged for audit
  - No access to other staff members' payslips
  - Rate limit PDF downloads (10 per hour)
COMPLIANCE:
  - POPIA: Staff can access own payroll data (this is required by POPIA)
  - SARS: Payslip must show PAYE, UIF deductions for tax compliance
  - Audit log all payslip access for 5 years
```

### Existing Service Methods to Expose

```typescript
// From SimplePayPayslipService - needs staff-portal wrapper
async getImportedPayslips(
  tenantId: string,
  staffId: string,
  options?: {
    fromDate?: Date;
    toDate?: Date;
    page?: number;
    limit?: number;
  }
): Promise<{ data: ISimplePayPayslipImport[]; total: number }>

async getPayslipPdf(
  tenantId: string,
  simplePayPayslipId: string
): Promise<Buffer>
```

### New Staff Portal Controller

```typescript
@Controller('staff-portal/payslips')
@UseGuards(StaffAuthGuard)
export class StaffPayslipController {

  @Get()
  async getMyPayslips(
    @CurrentStaff() staff: StaffContext,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('taxYear') taxYear?: string,
  ): Promise<PayslipListResponse>

  @Get(':payslipId')
  async getPayslipDetails(
    @CurrentStaff() staff: StaffContext,
    @Param('payslipId') payslipId: string,
  ): Promise<PayslipDetailResponse>

  @Get(':payslipId/pdf')
  async downloadPayslipPdf(
    @CurrentStaff() staff: StaffContext,
    @Param('payslipId') payslipId: string,
    @Res() res: Response,
  ): Promise<void>
}
```

---

## 4. Leave Management

```
FEATURE: Leave Self-Service
PURPOSE: Enable staff to view leave balances, submit leave requests, and track request status
EXISTING_API:
  - apps/api/src/integrations/simplepay/simplepay-leave.service.ts
    - getLeaveTypes(): Returns available leave types
    - getLeaveBalancesByStaff(): Returns current balances
    - getLeaveDays(): Returns leave history
    - createLeaveDay(): Creates leave in SimplePay
    - syncLeaveRequestToSimplePay(): Syncs approved requests
  - apps/api/src/api/staff/leave.controller.ts
    - GET /staff/leave/types - Admin only
    - GET /staff/:staffId/leave/balances - Admin only
    - GET /staff/:staffId/leave/history - Admin only
    - POST /staff/:staffId/leave/request - Admin only (creates PENDING request)
  - apps/api/src/database/repositories/leave-request.repository.ts
    - create(): Creates leave request
    - findByStaff(): Gets requests for a staff member
    - findByIdOrThrow(): Single request
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/leave/balances (my balances)
  - New endpoint: GET /api/staff-portal/leave/types (available leave types)
  - New endpoint: GET /api/staff-portal/leave/history (my leave requests)
  - New endpoint: POST /api/staff-portal/leave/request (submit new request)
  - New endpoint: DELETE /api/staff-portal/leave/request/:id (cancel pending request)
  - Staff can only create requests with status=PENDING
  - Staff can only cancel their own PENDING requests
  - Admin approval workflow remains unchanged
  - Email/WhatsApp notification to admin when staff submits request
COMPONENTS:
  - LeaveBalanceCards: Visual cards for each leave type with balance
  - LeaveRequestForm: Date picker, leave type selector, reason input
  - LeaveCalendar: Calendar view of leave dates (personal and optional team view)
  - LeaveHistoryTable: Past and pending requests with status
  - LeaveRequestDetail: View request with approval status
SECURITY:
  - Staff can only view/request leave for themselves
  - Staff cannot approve their own leave
  - Staff can only cancel PENDING status requests
  - Cannot request leave for past dates more than 7 days ago
  - Maximum leave request of 30 consecutive days (configurable)
COMPLIANCE:
  - BCEA: Annual leave minimum 15 days, sick leave 30 days over 3 years
  - POPIA: Leave data is personal information - staff access is mandatory
  - Audit log all leave request submissions
```

### Leave Request States

```
[STAFF] Submit Request --> [PENDING]
                              |
        [ADMIN] Approve ----> [APPROVED] --> Sync to SimplePay
                              |
        [ADMIN] Reject -----> [REJECTED]
                              |
        [STAFF] Cancel -----> [CANCELLED] (only if PENDING)
```

### API Endpoints

```typescript
@Controller('staff-portal/leave')
@UseGuards(StaffAuthGuard)
export class StaffLeaveController {

  @Get('balances')
  async getMyLeaveBalances(
    @CurrentStaff() staff: StaffContext,
  ): Promise<LeaveBalanceResponse>

  @Get('types')
  async getLeaveTypes(
    @CurrentStaff() staff: StaffContext,
  ): Promise<LeaveTypesResponse>

  @Get('history')
  async getMyLeaveHistory(
    @CurrentStaff() staff: StaffContext,
    @Query('status') status?: LeaveRequestStatus,
    @Query('year') year?: number,
  ): Promise<LeaveHistoryResponse>

  @Post('request')
  async submitLeaveRequest(
    @CurrentStaff() staff: StaffContext,
    @Body() dto: CreateLeaveRequestDto,
  ): Promise<LeaveRequestResponse>

  @Delete('request/:id')
  async cancelLeaveRequest(
    @CurrentStaff() staff: StaffContext,
    @Param('id') requestId: string,
  ): Promise<void>
}
```

---

## 5. Tax Documents

```
FEATURE: Tax Certificate Access (IRP5)
PURPOSE: Allow staff to view and download their IRP5 tax certificates for SARS filing
EXISTING_API:
  - apps/api/src/database/services/irp5.service.ts
    - generateIrp5(): Generates IRP5 certificate for a staff member
    - generateBulkIrp5(): Bulk generation for all staff (admin only)
    - calculateYtd(): Year-to-date totals
    - populateFields(): Maps to IRP5 code fields
    - validateForSubmission(): Validates certificate data
  - apps/api/src/database/dto/irp5.dto.ts
    - Irp5Certificate interface with all fields
  - No current endpoints - admin generates and distributes manually
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/tax/irp5 (list available certificates)
  - New endpoint: GET /api/staff-portal/tax/irp5/:taxYear (specific year)
  - New endpoint: GET /api/staff-portal/tax/irp5/:taxYear/pdf (download PDF)
  - Store generated IRP5s for staff self-service retrieval
  - Email notification when new IRP5 is available
  - Tax year selector (last 5 years)
COMPONENTS:
  - TaxYearSelector: Dropdown for SA tax years (e.g., 2025 = Mar 2024 - Feb 2025)
  - Irp5SummaryCard: Shows totals - remuneration, PAYE, UIF
  - Irp5DetailView: Full breakdown by IRP5 code (3601, 3602, etc.)
  - Irp5PdfDownload: Download certificate PDF
  - Irp5ValidationStatus: Shows if cert is valid for SARS submission
SECURITY:
  - Staff can only access their own IRP5 certificates
  - IRP5 contains sensitive tax info - encrypted at rest
  - Audit log all IRP5 downloads
  - Rate limit downloads (5 per day per tax year)
COMPLIANCE:
  - SARS: IRP5 must be provided to employees for tax filing
  - POPIA: Tax data is special personal information - enhanced protection
  - Retention: IRP5 must be available for 5 years per SARS
  - IT3a submission records linked to IRP5 generation
```

### IRP5 Access Architecture

```
Staff Request --> StaffAuthGuard --> IRP5 Service
                                          |
                                          v
                          Check if IRP5 exists for year
                                          |
               Yes <----------------------+--------------------> No
                |                                                  |
                v                                                  v
         Return cached                              Generate new IRP5
         certificate                                (if tax year closed)
                |                                          |
                v                                          v
         Transform to                              Validation check
         PDF or JSON                                       |
                                                          v
                                               Store for future access
```

### Database Model for IRP5 Storage

```prisma
model Irp5Certificate {
  id                      String   @id @default(uuid())
  tenantId                String   @map("tenant_id")
  staffId                 String   @map("staff_id")
  taxYear                 String   @map("tax_year") // e.g., "2025"

  // Totals in cents
  totalRemunerationCents  Int      @map("total_remuneration_cents")
  totalPayeCents          Int      @map("total_paye_cents")
  totalUifCents           Int      @map("total_uif_cents")

  // IRP5 code fields (JSONB for flexibility)
  fields                  Json

  // Validation
  isValid                 Boolean  @default(false) @map("is_valid")
  validationErrors        Json?    @map("validation_errors")

  // PDF storage
  pdfPath                 String?  @map("pdf_path")
  pdfGeneratedAt          DateTime? @map("pdf_generated_at")

  generatedAt             DateTime @default(now()) @map("generated_at")

  tenant                  Tenant   @relation(fields: [tenantId], references: [id])
  staff                   Staff    @relation(fields: [staffId], references: [id])

  @@unique([staffId, taxYear])
  @@map("irp5_certificates")
}
```

---

## 6. Profile

```
FEATURE: Profile Management
PURPOSE: Allow staff to view their employment details and update permitted fields
EXISTING_API:
  - apps/api/src/api/staff/staff.controller.ts
    - GET /staff/:id - Admin only, returns all staff details
    - PUT /staff/:id - Admin only, updates staff record
  - apps/api/src/database/entities/staff.entity.ts
    - IStaff interface with all fields
  - apps/api/src/database/repositories/staff.repository.ts
    - findById(), update()
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/profile (my profile)
  - New endpoint: PATCH /api/staff-portal/profile (update permitted fields)
  - New endpoint: PUT /api/staff-portal/profile/emergency-contacts
  - Staff can update: phone, email (requires verification), emergency contacts
  - Staff CANNOT update: salary, bank details, tax number, employment dates
  - Bank details change requires admin action + verification workflow
COMPONENTS:
  - ProfileOverview: Read-only employment details (start date, position, type)
  - PersonalInfoForm: Editable phone, email with validation
  - BankDetailsView: Read-only bank info (masked account number)
  - EmergencyContactsForm: Add/edit/remove emergency contacts
  - ProfileChangeHistory: Audit trail of profile changes
SECURITY:
  - Staff can only view/edit own profile
  - Sensitive fields (ID number, full bank account) partially masked
  - Email change requires verification via link
  - All changes logged with timestamp and IP
  - Cannot change employment-critical fields (salary, dates)
COMPLIANCE:
  - POPIA: Staff must be able to view their personal data
  - POPIA: Staff must be able to request correction of data (via admin)
  - BCEA: Employment contract details must be accessible
```

### Profile Field Permissions

| Field | Staff Can View | Staff Can Edit | Masked |
|-------|---------------|----------------|--------|
| firstName | Yes | No | No |
| lastName | Yes | No | No |
| email | Yes | Yes (verified) | No |
| phone | Yes | Yes | No |
| idNumber | Yes | No | Partial (XXX****XXX) |
| taxNumber | Yes | No | Partial (XXX****) |
| bankAccount | Yes | No | Last 4 only (****1234) |
| bankName | Yes | No | No |
| startDate | Yes | No | No |
| endDate | Yes | No | No |
| employmentType | Yes | No | No |
| basicSalaryCents | Yes | No | No |
| emergencyContacts | Yes | Yes | No |

### New Entity: Emergency Contacts

```prisma
model StaffEmergencyContact {
  id            String   @id @default(uuid())
  staffId       String   @map("staff_id")
  name          String   @db.VarChar(200)
  relationship  String   @db.VarChar(100)
  phone         String   @db.VarChar(20)
  email         String?  @db.VarChar(255)
  isPrimary     Boolean  @default(false) @map("is_primary")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  staff         Staff    @relation(fields: [staffId], references: [id])

  @@map("staff_emergency_contacts")
}
```

---

## 7. Documents

```
FEATURE: Employment Documents Access
PURPOSE: Provide staff access to their employment documents and onboarding materials
EXISTING_API:
  - apps/api/src/api/staff/onboarding.controller.ts
    - GET /staff/:staffId/onboarding - Admin only
    - GET /documents/staff/:staffId - Admin only
    - GET /staff/:staffId/generated-documents - Admin only
    - GET /generated-documents/:id/download - Admin only
  - apps/api/src/database/services/staff-document.service.ts
    - getDocumentsByStaff(): All documents for a staff member
    - getDocumentById(): Single document
  - apps/api/src/database/services/staff-onboarding.service.ts
    - getGeneratedDocuments(): Employment contract, POPIA consent
  - Document types: ID, address, qualifications, police clearance, medical, contract, POPIA
NEW_REQUIREMENTS:
  - New endpoint: GET /api/staff-portal/documents (my documents)
  - New endpoint: GET /api/staff-portal/documents/:id (document details)
  - New endpoint: GET /api/staff-portal/documents/:id/download (download file)
  - New endpoint: GET /api/staff-portal/documents/contract (employment contract)
  - New endpoint: GET /api/staff-portal/documents/policies (company policies)
  - New endpoint: POST /api/staff-portal/documents/upload (upload requested docs)
  - Staff can view all their documents
  - Staff can download their employment contract
  - Staff can upload documents requested by admin
COMPONENTS:
  - DocumentList: Table of all documents with status badges
  - DocumentViewer: In-browser PDF viewer for contracts
  - DocumentUpload: Upload form for requested documents
  - ContractSection: Signed employment contract with download
  - PolicySection: Company policies (shared across all staff)
  - ExpiringDocsAlert: Warning for documents expiring soon
SECURITY:
  - Staff can only access their own documents
  - Document download logged with timestamp and IP
  - Uploaded documents go to PENDING status (requires admin verification)
  - File type validation (PDF, images only)
  - File size limit (10MB)
  - Virus scanning on upload
COMPLIANCE:
  - POPIA: Staff must have access to documents containing their personal data
  - BCEA: Employment contract must be accessible to employee
  - Retention: Documents must be kept for period required by law
  - DSD: Childcare worker compliance documents (police clearance, first aid)
```

### Document Categories for Staff View

```typescript
enum StaffDocumentCategory {
  // Documents staff must sign/acknowledge
  EMPLOYMENT = 'EMPLOYMENT',       // Contract, POPIA consent

  // Documents staff uploaded during onboarding
  PERSONAL = 'PERSONAL',           // ID, address proof
  QUALIFICATIONS = 'QUALIFICATIONS', // Certificates, diplomas
  COMPLIANCE = 'COMPLIANCE',       // Police clearance, medical

  // Company documents (read-only)
  POLICIES = 'POLICIES',           // Company handbook, policies

  // Documents needing renewal
  EXPIRING = 'EXPIRING',           // First aid cert, medical
}
```

### API Endpoints

```typescript
@Controller('staff-portal/documents')
@UseGuards(StaffAuthGuard)
export class StaffDocumentsController {

  @Get()
  async getMyDocuments(
    @CurrentStaff() staff: StaffContext,
    @Query('category') category?: StaffDocumentCategory,
  ): Promise<DocumentListResponse>

  @Get(':id')
  async getDocumentDetails(
    @CurrentStaff() staff: StaffContext,
    @Param('id') documentId: string,
  ): Promise<DocumentDetailResponse>

  @Get(':id/download')
  async downloadDocument(
    @CurrentStaff() staff: StaffContext,
    @Param('id') documentId: string,
    @Res() res: Response,
  ): Promise<void>

  @Get('contract')
  async getEmploymentContract(
    @CurrentStaff() staff: StaffContext,
  ): Promise<ContractResponse>

  @Get('policies')
  async getCompanyPolicies(
    @CurrentStaff() staff: StaffContext,
  ): Promise<PolicyListResponse>

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @CurrentStaff() staff: StaffContext,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: StaffUploadDocumentDto,
  ): Promise<UploadResponse>
}
```

---

## 8. Security Architecture

### 8.1 Authentication Flow

```
                                    Staff Portal
                                         |
                                         v
                              +-------------------+
                              |    Login Page     |
                              +-------------------+
                                         |
                          Email + Password / Magic Link
                                         |
                                         v
                              +-------------------+
                              |   Auth Service    |
                              +-------------------+
                                         |
                        Validate credentials + MFA
                                         |
                                         v
                              +-------------------+
                              |   Issue JWT       |
                              | (audience: staff) |
                              +-------------------+
                                         |
                  +----------------------+----------------------+
                  |                      |                      |
                  v                      v                      v
           Access Token           Refresh Token          Session Store
          (15 min exp)            (7 day exp)            (Redis)
```

### 8.2 Authorization Model

```typescript
// Staff context extracted from JWT
interface StaffContext {
  userId: string;      // User table ID
  staffId: string;     // Staff table ID
  tenantId: string;    // Tenant isolation
  email: string;
  role: UserRole.STAFF;
}

// Guard implementation
@Injectable()
export class StaffAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isAuthenticated = await super.canActivate(context);
    if (!isAuthenticated) return false;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Verify user has STAFF role
    if (user.role !== UserRole.STAFF) {
      throw new ForbiddenException('Staff portal access only');
    }

    // Verify staff link exists
    const staffLink = await this.staffLinkRepo.findByUserId(user.id);
    if (!staffLink) {
      throw new ForbiddenException('Staff account not linked');
    }

    // Inject staff context
    request.staffContext = {
      userId: user.id,
      staffId: staffLink.staffId,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    return true;
  }
}
```

### 8.3 Data Access Rules

```typescript
// Every staff-portal repository method must enforce:
async findPayslipsForStaff(
  staffContext: StaffContext,
  options: QueryOptions
) {
  return this.prisma.simplePayPayslipImport.findMany({
    where: {
      tenantId: staffContext.tenantId,  // Tenant isolation
      staffId: staffContext.staffId,     // Own data only
    },
    ...options
  });
}
```

### 8.4 Rate Limiting

| Endpoint | Rate Limit | Window |
|----------|------------|--------|
| POST /auth/staff/login | 5 requests | 15 minutes |
| POST /auth/staff/forgot-password | 3 requests | 1 hour |
| GET /*/pdf | 10 requests | 1 hour |
| POST /documents/upload | 5 requests | 1 hour |
| All other GET endpoints | 100 requests | 1 minute |
| All other POST endpoints | 20 requests | 1 minute |

### 8.5 Audit Logging

```typescript
interface StaffAuditLog {
  id: string;
  staffId: string;
  userId: string;
  tenantId: string;
  action: StaffAuditAction;
  resourceType: string;
  resourceId: string;
  ipAddress: string;
  userAgent: string;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

enum StaffAuditAction {
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW_PAYSLIP = 'VIEW_PAYSLIP',
  DOWNLOAD_PAYSLIP = 'DOWNLOAD_PAYSLIP',
  VIEW_IRP5 = 'VIEW_IRP5',
  DOWNLOAD_IRP5 = 'DOWNLOAD_IRP5',
  SUBMIT_LEAVE = 'SUBMIT_LEAVE',
  CANCEL_LEAVE = 'CANCEL_LEAVE',
  VIEW_DOCUMENT = 'VIEW_DOCUMENT',
  DOWNLOAD_DOCUMENT = 'DOWNLOAD_DOCUMENT',
  UPLOAD_DOCUMENT = 'UPLOAD_DOCUMENT',
  UPDATE_PROFILE = 'UPDATE_PROFILE',
  UPDATE_EMERGENCY_CONTACT = 'UPDATE_EMERGENCY_CONTACT',
}
```

---

## 9. Data Flow Diagrams

### 9.1 Staff Login Flow

```
Staff --> Login Form --> Auth API --> Validate Credentials
                                            |
                            +---------------+---------------+
                            |               |               |
                         Success         Failure       Need MFA
                            |               |               |
                            v               v               v
                       Issue JWT      Return Error    MFA Challenge
                            |                               |
                            v                               v
                    Set Cookies                      Verify MFA Code
                            |                               |
                            v                               v
                    Redirect to                      Issue JWT (if valid)
                    Dashboard
```

### 9.2 Payslip Access Flow

```
Staff Dashboard --> Click Payslip --> StaffAuthGuard
                                           |
                               Verify staffId match
                                           |
                                           v
                               PayslipService.getImported()
                                           |
                                           v
                               Return payslip data
                                           |
                           +---------------+---------------+
                           |                               |
                        View                           Download
                           |                               |
                           v                               v
                    Display details               Get PDF from SimplePay
                                                           |
                                                           v
                                                   Log download event
                                                           |
                                                           v
                                                   Return PDF stream
```

### 9.3 Leave Request Flow

```
Staff Portal --> Leave Request Form --> Validate Input
                                             |
                               Check leave balance >= requested
                                             |
                                             v
                               Create LeaveRequest (PENDING)
                                             |
                                             v
                               Notify Admin (Email/WhatsApp)
                                             |
                               +-------------+-------------+
                               |                           |
                           Approved                    Rejected
                               |                           |
                               v                           v
                        Update status              Update status
                               |                   + reason
                               v
                        Sync to SimplePay
                               |
                               v
                        Notify Staff
```

---

## 10. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Add UserRole.STAFF to Prisma schema
- [ ] Create StaffUserLink table and repository
- [ ] Implement StaffAuthGuard
- [ ] Create staff authentication endpoints
- [ ] Set up staff portal route structure
- [ ] Implement audit logging for staff actions

### Phase 2: Dashboard & Payslips (Week 3-4)
- [ ] Create StaffDashboardController
- [ ] Create StaffPayslipController
- [ ] Build dashboard aggregation service
- [ ] Implement payslip list and detail endpoints
- [ ] Add PDF download with audit logging
- [ ] Frontend: Dashboard and Payslip pages

### Phase 3: Leave Management (Week 5-6)
- [ ] Create StaffLeaveController
- [ ] Implement leave request submission
- [ ] Add leave cancellation logic
- [ ] Set up admin notification workflow
- [ ] Frontend: Leave balance, request form, history

### Phase 4: Tax Documents (Week 7-8)
- [ ] Create Irp5Certificate storage model
- [ ] Create StaffTaxController
- [ ] Implement IRP5 retrieval endpoints
- [ ] Add PDF generation/caching
- [ ] Frontend: Tax year selector, IRP5 viewer

### Phase 5: Profile & Documents (Week 9-10)
- [ ] Create StaffProfileController
- [ ] Implement profile view/update endpoints
- [ ] Add emergency contacts management
- [ ] Create StaffDocumentsController
- [ ] Implement document upload workflow
- [ ] Frontend: Profile page, documents page

### Phase 6: Testing & Hardening (Week 11-12)
- [ ] Security penetration testing
- [ ] POPIA compliance audit
- [ ] Load testing (100 concurrent staff users)
- [ ] User acceptance testing
- [ ] Documentation and training materials

---

## Appendix A: API Reference Summary

| Endpoint | Method | Description | Auth |
|----------|--------|-------------|------|
| `/api/auth/staff/login` | POST | Staff login | Public |
| `/api/auth/staff/forgot-password` | POST | Request password reset | Public |
| `/api/auth/staff/reset-password` | POST | Reset password | Token |
| `/api/auth/staff/change-password` | POST | Change password | Staff |
| `/api/staff-portal/dashboard` | GET | Dashboard data | Staff |
| `/api/staff-portal/payslips` | GET | List payslips | Staff |
| `/api/staff-portal/payslips/:id` | GET | Payslip details | Staff |
| `/api/staff-portal/payslips/:id/pdf` | GET | Download PDF | Staff |
| `/api/staff-portal/leave/balances` | GET | Leave balances | Staff |
| `/api/staff-portal/leave/types` | GET | Available leave types | Staff |
| `/api/staff-portal/leave/history` | GET | Leave request history | Staff |
| `/api/staff-portal/leave/request` | POST | Submit leave request | Staff |
| `/api/staff-portal/leave/request/:id` | DELETE | Cancel leave request | Staff |
| `/api/staff-portal/tax/irp5` | GET | List IRP5 certificates | Staff |
| `/api/staff-portal/tax/irp5/:year` | GET | IRP5 for tax year | Staff |
| `/api/staff-portal/tax/irp5/:year/pdf` | GET | Download IRP5 PDF | Staff |
| `/api/staff-portal/profile` | GET | View profile | Staff |
| `/api/staff-portal/profile` | PATCH | Update profile | Staff |
| `/api/staff-portal/profile/emergency-contacts` | PUT | Update contacts | Staff |
| `/api/staff-portal/documents` | GET | List documents | Staff |
| `/api/staff-portal/documents/:id` | GET | Document details | Staff |
| `/api/staff-portal/documents/:id/download` | GET | Download document | Staff |
| `/api/staff-portal/documents/upload` | POST | Upload document | Staff |

---

## Appendix B: POPIA Compliance Checklist

- [ ] Staff consent obtained during account activation
- [ ] Staff can view all personal data held (profile, payslips, documents)
- [ ] Staff can request correction of personal data (via admin workflow)
- [ ] Sensitive data masked in UI (ID number, bank account)
- [ ] All data access logged for audit
- [ ] Data retention policies enforced (5 years for payroll/tax)
- [ ] Encryption at rest for sensitive documents
- [ ] TLS 1.3 for all API communications
- [ ] Session timeout after 8 hours of inactivity
- [ ] Password policy meets POPIA requirements
- [ ] Right to erasure workflow (for terminated staff)

---

## Appendix C: Component Diagram

```
+------------------------------------------------------------------+
|                         Staff Portal                              |
+------------------------------------------------------------------+
|                                                                   |
|  +----------------+  +----------------+  +------------------+     |
|  |   Dashboard    |  |    Payslips    |  |  Leave Mgmt      |     |
|  |   Component    |  |   Component    |  |   Component      |     |
|  +----------------+  +----------------+  +------------------+     |
|                                                                   |
|  +----------------+  +----------------+  +------------------+     |
|  |  Tax Documents |  |    Profile     |  |   Documents      |     |
|  |   Component    |  |   Component    |  |   Component      |     |
|  +----------------+  +----------------+  +------------------+     |
|                                                                   |
+------------------------------------------------------------------+
                              |
                              | HTTPS/JWT
                              v
+------------------------------------------------------------------+
|                      API Gateway (Staff Portal Routes)            |
+------------------------------------------------------------------+
                              |
              +---------------+---------------+
              |               |               |
              v               v               v
      +-------------+  +-------------+  +-------------+
      | Staff Auth  |  | Staff Data  |  | Staff Audit |
      |   Module    |  |   Module    |  |   Module    |
      +-------------+  +-------------+  +-------------+
              |               |               |
              +-------+-------+-------+-------+
                      |
                      v
+------------------------------------------------------------------+
|                      Existing Services                            |
+------------------------------------------------------------------+
|                                                                   |
|  +------------------+  +------------------+  +------------------+ |
|  | SimplePayPayslip |  | SimplePayLeave   |  | Irp5Service      | |
|  |     Service      |  |    Service       |  |                  | |
|  +------------------+  +------------------+  +------------------+ |
|                                                                   |
|  +------------------+  +------------------+  +------------------+ |
|  | StaffDocument    |  | StaffOnboarding  |  | StaffRepository  | |
|  |    Service       |  |    Service       |  |                  | |
|  +------------------+  +------------------+  +------------------+ |
|                                                                   |
+------------------------------------------------------------------+
                              |
                              v
+------------------------------------------------------------------+
|                        Database (PostgreSQL)                      |
|  +--------+  +--------+  +--------+  +--------+  +---------+     |
|  | Staff  |  | User   |  |Payslip |  | Leave  |  |Document |     |
|  +--------+  +--------+  +--------+  +--------+  +---------+     |
+------------------------------------------------------------------+
```

---

**Document History:**
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-21 | System Architect | Initial architecture design |
